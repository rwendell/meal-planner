import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import schema, { mealCategory } from "./schema";

const recipeDoc = schema.doc("publishedRecipes");

function cleanName(name: string): string {
	return name.trim().slice(0, 80);
}

export const list = query({
	args: {
		search: v.optional(v.string()),
		category: v.optional(mealCategory),
	},
	handler: async (ctx, args) => {
		const recipes = await ctx.db
			.query("publishedRecipes")
			.order("desc")
			.take(60);
		const query = args.search?.trim().toLowerCase() ?? "";
		return recipes.filter((recipe) => {
			const inCategory = !args.category || recipe.category === args.category;
			const inSearch =
				!query ||
				`${recipe.name} ${recipe.note} ${recipe.householdName}`
					.toLowerCase()
					.includes(query);
			return inCategory && inSearch;
		});
	},
	returns: v.array(recipeDoc),
});

export const mine = query({
	args: { householdId: v.id("households") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("publishedRecipes")
			.withIndex("by_household", (q) =>
				q.eq("sourceHouseholdId", args.householdId),
			)
			.collect();
	},
	returns: v.array(recipeDoc),
});

export const publish = mutation({
	args: { householdId: v.id("households"), mealId: v.id("meals") },
	handler: async (ctx, args) => {
		return await upsertPublishedSnapshot(ctx, args.householdId, args.mealId);
	},
	returns: v.id("publishedRecipes"),
});

/**
 * Snapshot a meal into the community cookbook, refreshing the snapshot
 * when one already exists. Shared by explicit publish and automatic
 * sharing on meal creation.
 */
export async function upsertPublishedSnapshot(
	ctx: MutationCtx,
	householdId: Id<"households">,
	mealId: Id<"meals">,
): Promise<Id<"publishedRecipes">> {
	const household = await ctx.db.get("households", householdId);
	if (!household) throw new Error("Household not found.");
	const meal = await ctx.db.get("meals", mealId);
	if (!meal || meal.householdId !== householdId) {
		throw new Error("That meal no longer exists.");
	}
	const existing = await ctx.db
		.query("publishedRecipes")
		.withIndex("by_household", (q) => q.eq("sourceHouseholdId", householdId))
		.collect();
	const snapshot = {
		sourceHouseholdId: householdId,
		sourceMealId: mealId,
		householdName: household.name,
		name: meal.name,
		category: meal.category,
		note: meal.note,
		time: meal.time,
		color: meal.color,
		premade: meal.premade ?? false,
		ingredients: meal.ingredients,
		mealTimes: meal.mealTimes ?? [],
	};
	const current = existing.find((row) => row.sourceMealId === mealId);
	if (current) {
		await ctx.db.replace("publishedRecipes", current._id, snapshot);
		return current._id;
	}
	return await ctx.db.insert("publishedRecipes", snapshot);
}

export const unpublish = mutation({
	args: { householdId: v.id("households"), mealId: v.id("meals") },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("publishedRecipes")
			.withIndex("by_household", (q) =>
				q.eq("sourceHouseholdId", args.householdId),
			)
			.collect();
		let removed = 0;
		for (const row of rows) {
			if (row.sourceMealId !== args.mealId) continue;
			await ctx.db.delete("publishedRecipes", row._id);
			removed += 1;
		}
		return { removed };
	},
	returns: v.object({ removed: v.number() }),
});

type SampleMeal = {
	name: string;
	category: "Breakfast" | "Lunch" | "Dinner" | "Snack";
	note: string;
	time: number;
	color: string;
	mealTimes: ("breakfast" | "lunch" | "dinner" | "snack")[];
	ingredients: {
		name: string;
		amount: string;
		group:
			| "Produce"
			| "Bakery & Deli"
			| "Meat & Seafood"
			| "Dairy & Eggs"
			| "Frozen"
			| "Beverages"
			| "Pantry Staples"
			| "Other";
	}[];
};

const SAMPLE_MEALS: SampleMeal[] = [
	{
		name: "Shakshuka",
		category: "Breakfast",
		note: "Eggs poached in spiced tomato sauce",
		time: 25,
		color: "#e9c5bb",
		mealTimes: ["breakfast"],
		ingredients: [
			{ name: "Eggs", amount: "4", group: "Dairy & Eggs" },
			{ name: "Crushed tomatoes", amount: "2 cans", group: "Pantry Staples" },
			{ name: "Bell peppers", amount: "1", group: "Produce" },
			{ name: "Onion", amount: "1", group: "Produce" },
			{ name: "Feta", amount: "1 pack", group: "Dairy & Eggs" },
		],
	},
	{
		name: "Banana pancakes",
		category: "Breakfast",
		note: "Fluffy pancakes, no added sugar",
		time: 20,
		color: "#f0dfbd",
		ingredients: [
			{ name: "Bananas", amount: "2", group: "Produce" },
			{ name: "Eggs", amount: "2", group: "Dairy & Eggs" },
			{ name: "Rolled oats", amount: "1 cup", group: "Pantry Staples" },
			{ name: "Milk", amount: "1 cup", group: "Dairy & Eggs" },
		],
		mealTimes: ["breakfast"],
	},
	{
		name: "Mediterranean quinoa bowl",
		category: "Lunch",
		note: "Quinoa, chickpeas, cucumber and feta",
		time: 20,
		color: "#cfe2d8",
		mealTimes: ["lunch"],
		ingredients: [
			{ name: "Quinoa", amount: "1 cup", group: "Pantry Staples" },
			{ name: "Chickpeas", amount: "1 can", group: "Pantry Staples" },
			{ name: "Cucumber", amount: "1", group: "Produce" },
			{ name: "Cherry tomatoes", amount: "1 pint", group: "Produce" },
			{ name: "Feta", amount: "1 pack", group: "Dairy & Eggs" },
		],
	},
	{
		name: "Caprese sandwich",
		category: "Lunch",
		note: "Mozzarella, tomato and basil on ciabatta",
		time: 10,
		color: "#e7d5ae",
		mealTimes: ["lunch"],
		ingredients: [
			{ name: "Ciabatta rolls", amount: "2", group: "Bakery & Deli" },
			{ name: "Mozzarella", amount: "1 ball", group: "Dairy & Eggs" },
			{ name: "Tomatoes", amount: "2", group: "Produce" },
			{ name: "Fresh basil", amount: "1 pack", group: "Produce" },
		],
	},
	{
		name: "Chicken tikka masala",
		category: "Dinner",
		note: "Creamy spiced curry with basmati rice",
		time: 40,
		color: "#f2cbb9",
		mealTimes: ["dinner"],
		ingredients: [
			{ name: "Chicken thighs", amount: "4", group: "Meat & Seafood" },
			{ name: "Basmati rice", amount: "1 bag", group: "Pantry Staples" },
			{ name: "Crushed tomatoes", amount: "1 can", group: "Pantry Staples" },
			{ name: "Greek yogurt", amount: "1 tub", group: "Dairy & Eggs" },
			{ name: "Onion", amount: "1", group: "Produce" },
		],
	},
	{
		name: "Veggie stir-fry",
		category: "Dinner",
		note: "Rainbow vegetables with soy-ginger sauce",
		time: 20,
		color: "#dce9db",
		mealTimes: ["dinner", "lunch"],
		ingredients: [
			{ name: "Bell peppers", amount: "2", group: "Produce" },
			{ name: "Broccoli", amount: "1 head", group: "Produce" },
			{ name: "Carrots", amount: "3", group: "Produce" },
			{ name: "Jasmine rice", amount: "1 bag", group: "Pantry Staples" },
			{ name: "Soy sauce", amount: "1 bottle", group: "Pantry Staples" },
		],
	},
	{
		name: "Red lentil soup",
		category: "Dinner",
		note: "Hearty one-pot soup with lemon",
		time: 30,
		color: "#e4ddbf",
		mealTimes: ["dinner", "lunch"],
		ingredients: [
			{ name: "Red lentils", amount: "1 bag", group: "Pantry Staples" },
			{ name: "Carrots", amount: "2", group: "Produce" },
			{ name: "Onion", amount: "1", group: "Produce" },
			{ name: "Lemons", amount: "2", group: "Produce" },
		],
	},
	{
		name: "Avocado toast",
		category: "Breakfast",
		note: "Sourdough, smashed avocado and chili flakes",
		time: 10,
		color: "#cfe2d8",
		mealTimes: ["breakfast"],
		ingredients: [
			{ name: "Sourdough loaf", amount: "1", group: "Bakery & Deli" },
			{ name: "Avocados", amount: "2", group: "Produce" },
			{ name: "Lemons", amount: "1", group: "Produce" },
			{ name: "Eggs", amount: "2", group: "Dairy & Eggs" },
		],
	},
];

/**
 * Seeds the community cookbook with sample recipes published from a shared
 * "Sample Kitchen" household. Idempotent — no-op once samples exist.
 */
export const seedSamples = mutation({
	args: {},
	handler: async (ctx) => {
		const existing = await ctx.db.query("publishedRecipes").take(1);
		if (existing.length > 0) return { seeded: false, count: 0 };
		let inviteCode = "";
		for (let attempt = 0; attempt < 10; attempt++) {
			const candidate = Array.from(
				{ length: 6 },
				() => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)],
			).join("");
			const clash = await ctx.db
				.query("households")
				.withIndex("by_inviteCode", (q) => q.eq("inviteCode", candidate))
				.unique();
			if (!clash) {
				inviteCode = candidate;
				break;
			}
		}
		if (!inviteCode) throw new Error("Couldn't generate an invite code.");
		const householdId = await ctx.db.insert("households", {
			name: "Sample Kitchen",
			inviteCode,
		});
		const memberId = await ctx.db.insert("householdMembers", {
			householdId,
			name: "Chef",
		});
		for (const meal of SAMPLE_MEALS) {
			const mealId = await ctx.db.insert("meals", {
				householdId,
				name: meal.name,
				category: meal.category,
				note: meal.note,
				time: meal.time,
				color: meal.color,
				ingredients: meal.ingredients,
				mealTimes: meal.mealTimes,
			});
			await ctx.db.insert("publishedRecipes", {
				sourceHouseholdId: householdId,
				sourceMealId: mealId,
				householdName: "Sample Kitchen",
				name: meal.name,
				category: meal.category,
				note: meal.note,
				time: meal.time,
				color: meal.color,
				ingredients: meal.ingredients,
				mealTimes: meal.mealTimes,
			});
		}
		return { seeded: true, count: SAMPLE_MEALS.length, memberId };
	},
	returns: v.object({
		seeded: v.boolean(),
		count: v.number(),
		memberId: v.optional(v.id("householdMembers")),
	}),
});

export const adopt = mutation({
	args: { householdId: v.id("households"), recipeId: v.id("publishedRecipes") },
	handler: async (ctx, args) => {
		const household = await ctx.db.get("households", args.householdId);
		if (!household) throw new Error("Household not found.");
		const recipe = await ctx.db.get("publishedRecipes", args.recipeId);
		if (!recipe) throw new Error("That recipe is no longer shared.");
		const taken = new Set(
			(
				await ctx.db
					.query("meals")
					.withIndex("by_household", (q) =>
						q.eq("householdId", args.householdId),
					)
					.take(200)
			).map((meal) => meal.name.trim().toLowerCase()),
		);
		const base = cleanName(recipe.name);
		let name = base;
		if (taken.has(name.toLowerCase())) {
			name = `${base} copy`;
			let n = 2;
			while (taken.has(name.toLowerCase())) {
				name = `${base} copy ${n}`;
				n += 1;
			}
		}
		const id = await ctx.db.insert("meals", {
			householdId: args.householdId,
			name,
			category: recipe.category,
			note: recipe.note,
			time: recipe.time,
			color: recipe.color,
			...(recipe.premade === undefined ? {} : { premade: recipe.premade }),
			ingredients: recipe.ingredients,
			mealTimes: recipe.mealTimes,
		});
		return { id, name };
	},
	returns: v.object({ id: v.id("meals"), name: v.string() }),
});
