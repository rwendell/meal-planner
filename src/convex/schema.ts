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

// A planner slot holds a meal, is unplanned (null), or is deliberately
// skipped ("skip"). Skips are first-class values — never meal rows — so
// they need no database entry and stay out of the meal list and groceries.
export const planSlotValue = v.union(
	v.id("meals"),
	v.null(),
	v.literal("skip"),
);

export const ingredient = v.object({
	name: v.string(),
	amount: v.optional(v.string()),
	group: groceryGroup,
});

export default defineSchema({
	// Households group members who share one meal database, per-member
	// plans, and a unified shopping list. Joined via invite code.
	households: defineTable({
		name: v.string(),
		inviteCode: v.string(),
	}).index("by_inviteCode", ["inviteCode"]),
	householdMembers: defineTable({
		householdId: v.id("households"),
		name: v.string(),
	}).index("by_household", ["householdId"]),
	// Step 1 of the workflow: the meal database, shared household-wide.
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
		householdId: v.id("households"),
	}).index("by_household", ["householdId"]),
	// Step 2 of the workflow: one row per member per calendar date
	// (ISO YYYY-MM-DD). Every week — past and future — persists.
	weekDays: defineTable({
		date: v.string(),
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		breakfast: planSlotValue,
		lunch: planSlotValue,
		dinner: planSlotValue,
	})
		.index("by_member_date", ["memberId", "date"])
		.index("by_household_and_date", ["householdId", "date"])
		.index("by_household", ["householdId"])
		.index("by_member", ["memberId"]),
	// Community cookbook: snapshots published from a household's database.
	// Snapshots are frozen at publish time so later edits or deletes never
	// change (or remove) what others already adopted.
	publishedRecipes: defineTable({
		sourceHouseholdId: v.id("households"),
		sourceMealId: v.id("meals"),
		householdName: v.string(),
		name: v.string(),
		category: mealCategory,
		note: v.string(),
		time: v.string(),
		color: v.string(),
		ingredients: v.array(ingredient),
		mealTimes: v.array(mealSlot),
	}).index("by_household", ["sourceHouseholdId"]),
	// Checked states for the derived shopping list, keyed by ingredient.
	shoppingItems: defineTable({
		key: v.string(),
		name: v.string(),
		amount: v.optional(v.string()),
		group: groceryGroup,
		checked: v.boolean(),
		custom: v.boolean(),
		householdId: v.id("households"),
	})
		.index("by_household", ["householdId"])
		.index("by_household_key", ["householdId", "key"]),
});
