import { type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { assertCaller, assertCallerMutation } from "./authCheck";
import { skippedCell } from "./schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
const MAX_SKIPPED_CELLS = 28;

type SkippedCell = Infer<typeof skippedCell>;

/** At most one cell per weekday × slot. */
function assertDate(date: string): void {
	if (!ISO_DATE.test(date)) throw new Error("Invalid date.");
}

/** Monday = 0, matching `Date.getDay()` minus one. */
/** 0–6 weekday index (Sunday-first, like Date#getDay) of an ISO date. */
function weekdayOf(date: string): number {
	return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function skippedKeys(cells: SkippedCell[]): Set<string> {
	return new Set(cells.map((cell) => `${cell.day}:${cell.slot}`));
}

async function assertOwnSkips(
	ctx: QueryCtx,
	householdId: Id<"households">,
	memberId: Id<"householdMembers">,
	callerMemberId: Id<"householdMembers">,
	cells: SkippedCell[],
	fromDate: string,
): Promise<void> {
	// A member may only change their own skips — never another
	// member's.
	if (memberId !== callerMemberId) {
		throw new Error("You can only change your own planner.");
	}
	assertDate(fromDate);
	if (cells.length > MAX_SKIPPED_CELLS) {
		throw new Error("Too many skipped meals.");
	}
	const [target, caller] = await Promise.all([
		ctx.db.get("householdMembers", memberId),
		ctx.db.get("householdMembers", callerMemberId),
	]);
	if (
		!target ||
		target.householdId !== householdId ||
		!caller ||
		caller.householdId !== householdId
	) {
		throw new Error("Household member not found.");
	}
	// Signed-in callers must own the caller row (read-only check; the
	// mutation path links unclaimed rows via assertCallerMutation).
	await assertCaller(ctx, householdId, callerMemberId);
}

/**
 * How many planned meals (from `fromDate` onward) fall on the given
 * skipped cells. Drives the "this will unplan N meals" confirmation
 * before applySkippedCells commits.
 */
export const skipImpact = query({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		fromDate: v.string(),
		cells: v.array(skippedCell),
	},
	handler: async (ctx, args) => {
		await assertOwnSkips(
			ctx,
			args.householdId,
			args.memberId,
			args.callerMemberId,
			args.cells,
			args.fromDate,
		);
		const skipped = skippedKeys(args.cells);
		const rows = await ctx.db
			.query("weekDays")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.collect();
		let meals = 0;
		let slots = 0;
		for (const row of rows) {
			if (row.date < args.fromDate) continue;
			const day = weekdayOf(row.date);
			for (const slot of PLAN_SLOTS) {
				if (!skipped.has(`${day}:${slot}`)) continue;
				const value = row[slot] ?? null;
				if (value === null) continue;
				slots += 1;
				if (value !== "skip") meals += 1;
			}
		}
		return { meals, slots };
	},
	returns: v.object({ meals: v.number(), slots: v.number() }),
});

/**
 * Saves the member's skipped meals and unplans every affected
 * slot from `fromDate` onward, so skipped cells never hold meals.
 */
export const applySkippedCells = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		fromDate: v.string(),
		cells: v.array(skippedCell),
	},
	handler: async (ctx, args) => {
		await assertOwnSkips(
			ctx,
			args.householdId,
			args.memberId,
			args.callerMemberId,
			args.cells,
			args.fromDate,
		);
		// Link the caller's row to their sign-in before writing.
		await assertCallerMutation(ctx, args.householdId, args.callerMemberId);
		await ctx.db.patch("householdMembers", args.memberId, {
			skippedCells: args.cells,
		});
		// Mirror to the login-keyed row so skips survive leave/rejoin.
		// Member rows stay the live store; every read path is unchanged.
		const target = await ctx.db.get("householdMembers", args.memberId);
		if (target?.authSubject) {
			const parts = target.authSubject.split("|");
			const plain =
				parts.length === 3 && parts[1] ? parts[1] : target.authSubject;
			const stored = await ctx.db
				.query("userSkips")
				.withIndex("by_auth", (q) => q.eq("authSubject", plain))
				.unique();
			const same =
				stored &&
				stored.cells.length === args.cells.length &&
				stored.cells.every(
					(cell, i) =>
						cell.day === args.cells[i]?.day &&
						cell.slot === args.cells[i]?.slot,
				);
			if (!same) {
				if (stored) {
					await ctx.db.patch("userSkips", stored._id, {
						cells: args.cells,
					});
				} else if (args.cells.length > 0) {
					await ctx.db.insert("userSkips", {
						authSubject: plain,
						cells: args.cells,
					});
				}
			}
		}
		const skipped = skippedKeys(args.cells);
		const rows = await ctx.db
			.query("weekDays")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.collect();
		let meals = 0;
		let slots = 0;
		for (const row of rows) {
			if (row.date < args.fromDate) continue;
			const day = weekdayOf(row.date);
			const patch: {
				breakfast?: typeof row.breakfast;
				lunch?: typeof row.lunch;
				dinner?: typeof row.dinner;
				snack?: typeof row.snack;
			} = {};
			for (const slot of PLAN_SLOTS) {
				if (!skipped.has(`${day}:${slot}`)) continue;
				const value = row[slot] ?? null;
				if (value === null) continue;
				patch[slot] = null;
				slots += 1;
				if (value !== "skip") meals += 1;
			}
			if (Object.keys(patch).length > 0) {
				await ctx.db.patch("weekDays", row._id, patch);
			}
		}
		return { cleared: slots, meals };
	},
	returns: v.object({ cleared: v.number(), meals: v.number() }),
});
