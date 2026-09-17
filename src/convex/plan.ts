import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { assertCallerMutation } from "./authCheck";
import schema, { mealSlot, planSlotValue } from "./schema";

const weekDayDoc = schema.doc("weekDays");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(date: string): void {
	if (!ISO_DATE.test(date)) throw new Error("Invalid date.");
}

/** 0–6 weekday index (Sunday-first, like Date#getDay) of an ISO date. */
function weekdayOf(date: string): number {
	return new Date(`${date}T12:00:00Z`).getUTCDay();
}

async function assertMember(
	ctx: QueryCtx,
	householdId: Id<"households">,
	memberId: Id<"householdMembers">,
): Promise<void> {
	const member = await ctx.db.get("householdMembers", memberId);
	if (!member || member.householdId !== householdId) {
		throw new Error("Household member not found.");
	}
}

function canManage(
	household: { ownerId?: Id<"householdMembers"> },
	callerMemberId: Id<"householdMembers">,
): boolean {
	return !household.ownerId || household.ownerId === callerMemberId;
}

/**
 * Members plan only for themselves, unless the household lets the
 * owner manage everyone's plans.
 */
async function assertCanEdit(
	ctx: MutationCtx,
	householdId: Id<"households">,
	targetMemberId: Id<"householdMembers">,
	callerMemberId: Id<"householdMembers">,
): Promise<void> {
	const [household, target, caller] = await Promise.all([
		ctx.db.get("households", householdId),
		ctx.db.get("householdMembers", targetMemberId),
		ctx.db.get("householdMembers", callerMemberId),
	]);
	if (
		!household ||
		!target ||
		target.householdId !== householdId ||
		!caller ||
		caller.householdId !== householdId
	) {
		throw new Error("Household member not found.");
	}
	if (
		target._id !== caller._id &&
		!(household.ownerManagesPlans && canManage(household, caller._id))
	) {
		throw new Error("You can only plan your own meals.");
	}
	// Signed-in callers must own the caller row; unclaimed rows link here.
	await assertCallerMutation(ctx, householdId, callerMemberId);
}

/**
 * Week plans are keyed by member and ISO date, so every week — past and
 * future — persists per member. Pass `memberId` for one member's days, or
 * omit it for the whole household's days on those dates.
 */
export const getDays = query({
	args: {
		householdId: v.id("households"),
		memberId: v.optional(v.id("householdMembers")),
		dates: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const unique = [...new Set(args.dates)].slice(0, 45);
		for (const date of unique) assertDate(date);
		if (args.memberId) {
			const memberId = args.memberId;
			await assertMember(ctx, args.householdId, memberId);
			// `.first()` instead of `.unique()`: duplicate rows for one
			// member+date must never crash reads (see setSlot self-heal below).
			const rows = await Promise.all(
				unique.map((date) =>
					ctx.db
						.query("weekDays")
						.withIndex("by_member_date", (q) =>
							q.eq("memberId", memberId).eq("date", date),
						)
						.first(),
				),
			);
			return rows.filter((row) => row !== null);
		}
		const rows = await Promise.all(
			unique.map((date) =>
				ctx.db
					.query("weekDays")
					.withIndex("by_household_and_date", (q) =>
						q.eq("householdId", args.householdId).eq("date", date),
					)
					.collect(),
			),
		);
		return rows.flat();
	},
	returns: v.array(weekDayDoc),
});

export const setSlot = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		date: v.string(),
		slot: mealSlot,
		mealId: planSlotValue,
	},
	handler: async (ctx, args) => {
		assertDate(args.date);
		await assertCanEdit(
			ctx,
			args.householdId,
			args.memberId,
			args.callerMemberId,
		);
		if (args.mealId !== null) {
			const member = await ctx.db.get("householdMembers", args.memberId);
			const excluded = new Set(
				(member?.excludedCells ?? []).map((cell) => `${cell.day}:${cell.slot}`),
			);
			if (excluded.has(`${weekdayOf(args.date)}:${args.slot}`)) {
				throw new Error("That day is excluded from your planner.");
			}
		}
		if (args.mealId !== null && args.mealId !== "skip") {
			const meal = await ctx.db.get("meals", args.mealId);
			if (!meal || meal.householdId !== args.householdId) {
				throw new Error("That meal no longer exists.");
			}
		}
		const existing = await ctx.db
			.query("weekDays")
			.withIndex("by_member_date", (q) =>
				q.eq("memberId", args.memberId).eq("date", args.date),
			)
			.collect();
		const [first, ...dupes] = existing;
		if (first) {
			await ctx.db.patch("weekDays", first._id, {
				[args.slot]: args.mealId,
			});
			// Self-heal: collapse duplicate rows left by concurrent inserts.
			for (const dupe of dupes) {
				await ctx.db.delete("weekDays", dupe._id);
			}
			return first._id;
		}
		return await ctx.db.insert("weekDays", {
			householdId: args.householdId,
			memberId: args.memberId,
			date: args.date,
			breakfast: args.slot === "breakfast" ? args.mealId : null,
			lunch: args.slot === "lunch" ? args.mealId : null,
			dinner: args.slot === "dinner" ? args.mealId : null,
			snack: args.slot === "snack" ? args.mealId : null,
		});
	},
	returns: v.id("weekDays"),
});

export const clearDay = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		date: v.string(),
	},
	handler: async (ctx, args) => {
		assertDate(args.date);
		await assertCanEdit(
			ctx,
			args.householdId,
			args.memberId,
			args.callerMemberId,
		);
		const existing = await ctx.db
			.query("weekDays")
			.withIndex("by_member_date", (q) =>
				q.eq("memberId", args.memberId).eq("date", args.date),
			)
			.collect();
		const [first, ...dupes] = existing;
		if (!first) return null;
		await ctx.db.patch("weekDays", first._id, {
			breakfast: null,
			lunch: null,
			dinner: null,
			snack: null,
		});
		for (const dupe of dupes) {
			await ctx.db.delete("weekDays", dupe._id);
		}
		return first._id;
	},
	returns: v.union(v.id("weekDays"), v.null()),
});
