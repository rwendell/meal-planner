import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema, { mealSlot } from "./schema";

const weekDayDoc = schema.doc("weekDays");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(date: string): void {
	if (!ISO_DATE.test(date)) throw new Error("Invalid date.");
}

/** Week plans are keyed by ISO date, so every week — past and future — persists. */
export const getDays = query({
	args: { dates: v.array(v.string()) },
	handler: async (ctx, args) => {
		const unique = [...new Set(args.dates)].slice(0, 45);
		for (const date of unique) assertDate(date);
		const rows = await Promise.all(
			unique.map((date) =>
				ctx.db
					.query("weekDays")
					.withIndex("by_date", (q) => q.eq("date", date))
					.unique(),
			),
		);
		return rows.filter((row) => row !== null);
	},
	returns: v.array(weekDayDoc),
});

export const setSlot = mutation({
	args: {
		date: v.string(),
		slot: mealSlot,
		mealId: v.union(v.id("meals"), v.null()),
	},
	handler: async (ctx, args) => {
		assertDate(args.date);
		if (args.mealId !== null) {
			const meal = await ctx.db.get("meals", args.mealId);
			if (!meal) throw new Error("That meal no longer exists.");
		}
		const existing = await ctx.db
			.query("weekDays")
			.withIndex("by_date", (q) => q.eq("date", args.date))
			.unique();
		if (existing) {
			await ctx.db.patch("weekDays", existing._id, {
				[args.slot]: args.mealId,
			});
			return existing._id;
		}
		return await ctx.db.insert("weekDays", {
			date: args.date,
			breakfast: args.slot === "breakfast" ? args.mealId : null,
			lunch: args.slot === "lunch" ? args.mealId : null,
			dinner: args.slot === "dinner" ? args.mealId : null,
		});
	},
	returns: v.id("weekDays"),
});

export const clearDay = mutation({
	args: { date: v.string() },
	handler: async (ctx, args) => {
		assertDate(args.date);
		const existing = await ctx.db
			.query("weekDays")
			.withIndex("by_date", (q) => q.eq("date", args.date))
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
