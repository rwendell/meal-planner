import { authTables } from "@convex-dev/auth/server";
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

// Weekday index matching Date#getDay(): 0 = Sunday … 6 = Saturday.
export const weekday = v.union(
	v.literal(0),
	v.literal(1),
	v.literal(2),
	v.literal(3),
	v.literal(4),
	v.literal(5),
	v.literal(6),
);

// A (weekday, meal-slot) cell the member opted out of planning.
export const excludedCell = v.object({ day: weekday, slot: mealSlot });

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
	...authTables,
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
		// When true, the owner's leftover review covers every member.
		// Unset means members review only their own plan.
		ownerReviewsMeals: v.optional(v.boolean()),
	}).index("by_inviteCode", ["inviteCode"]),
	householdMembers: defineTable({
		householdId: v.id("households"),
		name: v.string(),
		// Google profile picture URL, set when the member links a sign-in.
		image: v.optional(v.string()),
		// True when the name was auto-generated (anon default) and is
		// safe to replace with the OAuth profile name on first link.
		// Any explicit rename clears it.
		autoNamed: v.optional(v.boolean()),
		// New meals this member creates publish automatically.
		// Unset (and true) means public by default; false opts out.
		autoShareMeals: v.optional(v.boolean()),
		// Convex Auth identity (tokenIdentifier) of the signed-in user
		// this member belongs to. Unset on anonymous/invite-code rows
		// until claimed at first sign-in.
		authSubject: v.optional(v.string()),
		// Each member's own planner view. Unset means "planner".
		// Only the member themselves may change it.
		plannerMode: v.optional(v.union(v.literal("planner"), v.literal("list"))),
		// Planner cells the member opted out of (e.g. no weekends, no
		// snacks). Unset/empty means everything is plannable. Only the
		// member themselves may change it.
		excludedCells: v.optional(v.array(excludedCell)),
	})
		.index("by_household", ["householdId"])
		.index("by_authSubject", ["authSubject"]),
	// Step 1 of the workflow: the meal database, shared household-wide.
	meals: defineTable({
		name: v.string(),
		category: mealCategory,
		note: v.string(),
		// Prep time in whole minutes. Null/unset means no prep time given.
		time: v.optional(v.union(v.number(), v.null())),
		color: v.string(),
		// Heat-and-eat product (bought whole) rather than cooked from
		// ingredients. Unset means cooked from ingredients.
		premade: v.optional(v.boolean()),
		// Original recipe site, when imported or recorded. Display-only.
		// Null/unset means none given.
		sourceUrl: v.optional(v.union(v.string(), v.null())),
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
		time: v.optional(v.union(v.number(), v.null())),
		color: v.string(),
		premade: v.optional(v.boolean()),
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
	// Pantry inventory: ingredients already on hand. Matching shopping
	// items auto-check (name-level match; amounts are ignored).
	pantryItems: defineTable({
		householdId: v.id("households"),
		key: v.string(),
		name: v.string(),
		amount: v.optional(v.union(v.string(), v.null())),
		group: groceryGroup,
	})
		.index("by_household", ["householdId"])
		.index("by_household_key", ["householdId", "key"]),
	// Ready-made meals: "eat" rows are heat-and-eat products to buy;
	// "made" rows are already prepared, so their ingredients auto-check.
	// Unset means "made" (original behavior).
	readyMeals: defineTable({
		householdId: v.id("households"),
		mealId: v.id("meals"),
		kind: v.optional(v.union(v.literal("eat"), v.literal("made"))),
		note: v.optional(v.union(v.string(), v.null())),
		// ISO date; null/unset means no expiry.
		expiresOn: v.optional(v.union(v.string(), v.null())),
	})
		.index("by_household", ["householdId"])
		.index("by_household_meal", ["householdId", "mealId"]),
});
