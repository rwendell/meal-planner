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
	v.literal("Bakery & Deli"),
	v.literal("Meat & Seafood"),
	v.literal("Dairy & Eggs"),
	v.literal("Frozen"),
	v.literal("Beverages"),
	v.literal("Pantry Staples"),
	v.literal("Other"),
);

export const mealSlot = v.union(
	v.literal("breakfast"),
	v.literal("lunch"),
	v.literal("dinner"),
	v.literal("snack"),
);

// One auto-plan option: a meal plus how many days of the week it
// covers. Counts across a slot's list always sum to the week's days.
export const autoPlanOption = v.object({
	mealId: v.id("meals"),
	count: v.number(),
});

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
		// The creating member. Unset on older rows, where any member may
		// manage the household.
		ownerId: v.optional(v.id("householdMembers")),
		// When true, the owner may view and plan for other members.
		// Unset means members plan only for themselves.
		ownerManagesPlans: v.optional(v.boolean()),
	}).index("by_inviteCode", ["inviteCode"]),
	householdMembers: defineTable({
		householdId: v.id("households"),
		name: v.string(),
		// Each member's own planner view. Unset means "planner".
		// Only the member themselves may change it.
		// TODO: drop the "manual"/"auto" literals once old rows are migrated.
		plannerMode: v.optional(
			v.union(
				v.literal("planner"),
				v.literal("list"),
				v.literal("manual"),
				v.literal("auto"),
			),
		),
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
		// Added later; older rows lack it and read as unplanned.
		snack: v.optional(planSlotValue),
	})
		.index("by_member_date", ["memberId", "date"])
		.index("by_household_and_date", ["householdId", "date"])
		.index("by_household", ["householdId"])
		.index("by_member", ["memberId"]),
	// Auto-planning option lists, one row per member. Each slot's array
	// is ordered — earlier options win ties when spreading days.
	// An empty array (or all-zero counts) means "leave alone". The
	// union accepts rows saved before counts existed (bare meal ids);
	// autoPlans.ts upgrades those on read and saves always write the
	// new shape.
	autoPlans: defineTable({
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		breakfast: v.array(v.union(v.id("meals"), autoPlanOption)),
		lunch: v.array(v.union(v.id("meals"), autoPlanOption)),
		dinner: v.array(v.union(v.id("meals"), autoPlanOption)),
		// Added later; older rows lack it and read as "leave alone".
		snack: v.optional(v.array(v.union(v.id("meals"), autoPlanOption))),
	}).index("by_member", ["memberId"]),
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
