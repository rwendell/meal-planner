import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const mealCategory = v.union(
	v.literal("Breakfast"),
	v.literal("Lunch"),
	v.literal("Dinner"),
	v.literal("Snack"),
);

export const groceryGroup = v.union(
	v.literal("Produce"),
	v.literal("Pantry"),
	v.literal("Dairy"),
);

export const mealSlot = v.union(
	v.literal("breakfast"),
	v.literal("lunch"),
	v.literal("dinner"),
);

export const ingredient = v.object({
	name: v.string(),
	amount: v.optional(v.string()),
	group: groceryGroup,
});

export default defineSchema({
	// Step 1 of the workflow: the meal database.
	meals: defineTable({
		name: v.string(),
		category: mealCategory,
		note: v.string(),
		time: v.string(),
		color: v.string(),
		ingredients: v.array(ingredient),
		// Which planner slots this meal can fill. Optional so meals
		// created before this field existed still validate; clients
		// fall back to deriving it from `category`.
		mealTimes: v.optional(v.array(mealSlot)),
	}).index("by_category", ["category"]),
	// Step 2 of the workflow: one row per calendar date (ISO YYYY-MM-DD),
	// each slot points at a meal. Every week — past and future — persists.
	weekDays: defineTable({
		date: v.string(),
		breakfast: v.union(v.id("meals"), v.null()),
		lunch: v.union(v.id("meals"), v.null()),
		dinner: v.union(v.id("meals"), v.null()),
	}).index("by_date", ["date"]),
	// Step 3 of the workflow: materialized by "Generate shopping list".
	// Auto items mirror the current plan; custom items are user-added extras.
	shoppingItems: defineTable({
		key: v.string(),
		name: v.string(),
		amount: v.optional(v.string()),
		group: groceryGroup,
		checked: v.boolean(),
		custom: v.boolean(),
	}).index("by_key", ["key"]),
});
