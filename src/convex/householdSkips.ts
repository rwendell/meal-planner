import { type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx } from "./_generated/server";
import { assertCaller, assertCallerMutation } from "./authCheck";
import { skippedCell } from "./schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SKIPPED_CELLS = 28;

type SkippedCell = Infer<typeof skippedCell>;

/** At most one cell per weekday × slot. */
function assertDate(date: string): void {
	if (!ISO_DATE.test(date)) throw new Error("Invalid date.");
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
 * Saves the member's skipped meals. Planned meals in skipped cells are
 * kept as stored and hidden by every read path instead, so unskipping
 * reveals them again and nothing here needs confirmation.
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
		return { saved: true };
	},
	returns: v.object({ saved: v.boolean() }),
});
