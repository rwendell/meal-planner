import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import schema, { ingredient, mealCategory, mealSlot } from "./schema";

const mealDoc = schema.doc("meals");

async function assertUniqueName(
	ctx: MutationCtx,
	householdId: Id<"households">,
	name: string,
	exceptId?: Id<"meals">,
): Promise<void> {
	const existing = await ctx.db
		.query("meals")
		.withIndex("by_household", (q) => q.eq("householdId", householdId))
		.take(200);
	const clash = existing.some(
		(meal) =>
			meal._id !== exceptId &&
			meal.name.trim().toLowerCase() === name.toLowerCase(),
	);
	if (clash) throw new Error("A meal with this name already exists.");
}

export const list = query({
	args: { householdId: v.id("households") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("meals")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.order("desc")
			.take(200);
	},
	returns: v.array(mealDoc),
});

export const create = mutation({
	args: {
		householdId: v.id("households"),
		name: v.string(),
		category: mealCategory,
		note: v.optional(v.string()),
		time: v.optional(v.string()),
		color: v.optional(v.string()),
		ingredients: v.optional(v.array(ingredient)),
		mealTimes: v.array(mealSlot),
	},
	handler: async (ctx, args) => {
		const household = await ctx.db.get("households", args.householdId);
		if (!household) throw new Error("Household not found.");
		const name = args.name.trim();
		if (!name) throw new Error("Meal name is required.");
		if (args.mealTimes.length === 0) {
			throw new Error("Pick at least one meal time.");
		}
		await assertUniqueName(ctx, args.householdId, name);
		return await ctx.db.insert("meals", {
			householdId: args.householdId,
			name,
			category: args.category,
			note: args.note?.trim() || "No description",
			time: args.time?.trim() || "Homemade",
			color: args.color ?? "#f2cbb9",
			ingredients: args.ingredients ?? [],
			mealTimes: args.mealTimes,
		});
	},
	returns: v.id("meals"),
});

export const update = mutation({
	args: {
		id: v.id("meals"),
		name: v.string(),
		category: mealCategory,
		note: v.optional(v.string()),
		time: v.optional(v.string()),
		color: v.optional(v.string()),
		ingredients: v.array(ingredient),
		mealTimes: v.array(mealSlot),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get("meals", args.id);
		if (!existing?.householdId) {
			throw new Error("That meal no longer exists.");
		}
		const name = args.name.trim();
		if (!name) throw new Error("Meal name is required.");
		if (args.mealTimes.length === 0) {
			throw new Error("Pick at least one meal time.");
		}
		await assertUniqueName(ctx, existing.householdId, name, args.id);
		await ctx.db.patch("meals", args.id, {
			name,
			category: args.category,
			note: args.note?.trim() || "No description",
			time: args.time?.trim() || existing.time,
			color: args.color ?? existing.color,
			ingredients: args.ingredients,
			mealTimes: args.mealTimes,
		});
		return args.id;
	},
	returns: v.id("meals"),
});

export const remove = mutation({
	args: { id: v.id("meals") },
	handler: async (ctx, args) => {
		const meal = await ctx.db.get("meals", args.id);
		if (!meal?.householdId) return null;
		const householdId = meal.householdId;
		// Clear any household plan slots pointing at the deleted meal.
		const days = await ctx.db
			.query("weekDays")
			.withIndex("by_household", (q) => q.eq("householdId", householdId))
			.collect();
		for (const day of days) {
			const patch: {
				breakfast?: typeof day.breakfast;
				lunch?: typeof day.lunch;
				dinner?: typeof day.dinner;
				snack?: typeof day.snack;
			} = {};
			if (day.breakfast === args.id) patch.breakfast = null;
			if (day.lunch === args.id) patch.lunch = null;
			if (day.dinner === args.id) patch.dinner = null;
			if (day.snack === args.id) patch.snack = null;
			if (Object.keys(patch).length > 0) {
				await ctx.db.patch("weekDays", day._id, patch);
			}
		}
		await ctx.db.delete("meals", args.id);
		return meal.name;
	},
	returns: v.union(v.string(), v.null()),
});
