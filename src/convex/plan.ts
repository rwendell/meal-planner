import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import schema, { mealSlot } from "./schema";

const weekDayDoc = schema.doc("weekDays");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(date: string): void {
	if (!ISO_DATE.test(date)) throw new Error("Invalid date.");
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
			const rows = await Promise.all(
				unique.map((date) =>
					ctx.db
						.query("weekDays")
						.withIndex("by_member_date", (q) =>
							q.eq("memberId", memberId).eq("date", date),
						)
						.unique(),
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
		date: v.string(),
		slot: mealSlot,
		mealId: v.union(v.id("meals"), v.null()),
	},
	handler: async (ctx, args) => {
		assertDate(args.date);
		const member = await ctx.db.get("householdMembers", args.memberId);
		if (!member || member.householdId !== args.householdId) {
			throw new Error("Household member not found.");
		}
		if (args.mealId !== null) {
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
			.unique();
		if (existing) {
			await ctx.db.patch("weekDays", existing._id, {
				[args.slot]: args.mealId,
			});
			return existing._id;
		}
		return await ctx.db.insert("weekDays", {
			householdId: args.householdId,
			memberId: args.memberId,
			date: args.date,
			breakfast: args.slot === "breakfast" ? args.mealId : null,
			lunch: args.slot === "lunch" ? args.mealId : null,
			dinner: args.slot === "dinner" ? args.mealId : null,
		});
	},
	returns: v.id("weekDays"),
});

export const clearDay = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		date: v.string(),
	},
	handler: async (ctx, args) => {
		assertDate(args.date);
		const member = await ctx.db.get("householdMembers", args.memberId);
		if (!member || member.householdId !== args.householdId) {
			throw new Error("Household member not found.");
		}
		const existing = await ctx.db
			.query("weekDays")
			.withIndex("by_member_date", (q) =>
				q.eq("memberId", args.memberId).eq("date", args.date),
			)
			.unique();
		if (!existing) return null;
		await ctx.db.patch("weekDays", existing._id, {
			breakfast: null,
			lunch: null,
			dinner: null,
		});
		return existing._id;
	},
	returns: v.union(v.id("weekDays"), v.null()),
});
