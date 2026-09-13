import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { ingredientKey } from "./shopping";

/**
 * One-time starter content for a household: demo meals, the creating
 * member's week plan, and initial check states. No-op once the household
 * has any meals.
 */
export const ensureSeed = mutation({
	args: { householdId: v.id("households"), memberId: v.id("householdMembers") },
	handler: async (ctx, args) => {
		const member = await ctx.db.get("householdMembers", args.memberId);
		if (!member || member.householdId !== args.householdId) {
			throw new Error("Household member not found.");
		}
		const existing = await ctx.db
			.query("meals")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.take(1);
		if (existing.length > 0) return { seeded: false };

		const mealIds: Record<string, Id<"meals">> = {};
		// Guard every insert below against rows that already exist: concurrent
		// runs serialize in Convex, so the loser sees the winner's writes and
		// skips instead of creating duplicates.
		const alreadySeeded = await ctx.db
			.query("meals")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.collect();
		const takenNames = new Set(
			alreadySeeded.map((meal) => meal.name.trim().toLowerCase()),
		);
		for (const row of alreadySeeded) {
			mealIds[row.name] = row._id;
		}
		const meals: {
			name: string;
			category: "Breakfast" | "Lunch" | "Dinner" | "Snack";
			note: string;
			time: string;
			color: string;
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
		}[] = [
			{
				name: "Overnight oats",
				category: "Breakfast",
				note: "Blueberry, almond butter and chia",
				time: "5 min",
				color: "#dce9db",
				ingredients: [
					{ name: "Rolled oats", amount: "1 bag", group: "Pantry Staples" },
					{ name: "Blueberries", amount: "1 pint", group: "Produce" },
					{ name: "Almond butter", amount: "1 jar", group: "Pantry Staples" },
				],
			},
			{
				name: "Ricotta toast",
				category: "Breakfast",
				note: "Whipped ricotta, honey and figs",
				time: "10 min",
				color: "#f0dfbd",
				ingredients: [
					{ name: "Sourdough loaf", amount: "1", group: "Bakery & Deli" },
					{ name: "Ricotta", amount: "1 tub", group: "Dairy & Eggs" },
					{ name: "Figs", amount: "1 pack", group: "Produce" },
				],
			},
			{
				name: "Green goddess wrap",
				category: "Lunch",
				note: "Crunchy greens, avocado and herbs",
				time: "15 min",
				color: "#cfe2d8",
				ingredients: [
					{ name: "Flour tortillas", amount: "1 pack", group: "Bakery & Deli" },
					{ name: "Avocados", amount: "3", group: "Produce" },
					{ name: "Cucumber", amount: "1", group: "Produce" },
					{ name: "Fresh herbs", amount: "2 bunches", group: "Produce" },
				],
			},
			{
				name: "Miso salmon bowl",
				category: "Dinner",
				note: "Miso salmon, rice and sesame greens",
				time: "30 min",
				color: "#f2cbb9",
				ingredients: [
					{ name: "Salmon fillets", amount: "2", group: "Meat & Seafood" },
					{ name: "Jasmine rice", amount: "1 bag", group: "Pantry Staples" },
					{ name: "White miso", amount: "1 tub", group: "Pantry Staples" },
					{ name: "Baby spinach", amount: "1 bag", group: "Produce" },
				],
			},
			{
				name: "Lemon herb chicken",
				category: "Dinner",
				note: "Roasted chicken, lemon and greens",
				time: "35 min",
				color: "#e4ddbf",
				ingredients: [
					{ name: "Chicken thighs", amount: "4", group: "Meat & Seafood" },
					{ name: "Lemons", amount: "4", group: "Produce" },
					{ name: "Fresh herbs", amount: "2 bunches", group: "Produce" },
				],
			},
			{
				name: "Tomato basil pasta",
				category: "Dinner",
				note: "Silky tomato sauce and torn basil",
				time: "25 min",
				color: "#e9c5bb",
				ingredients: [
					{ name: "Rigatoni", amount: "1 box", group: "Pantry Staples" },
					{
						name: "Crushed tomatoes",
						amount: "2 cans",
						group: "Pantry Staples",
					},
					{ name: "Fresh basil", amount: "1 pack", group: "Produce" },
					{ name: "Parmesan", amount: "1 wedge", group: "Dairy & Eggs" },
				],
			},
			{
				name: "Roasted veggie tacos",
				category: "Dinner",
				note: "Charred vegetables, lime and crema",
				time: "25 min",
				color: "#e7d5ae",
				ingredients: [
					{ name: "Flour tortillas", amount: "1 pack", group: "Bakery & Deli" },
					{ name: "Bell peppers", amount: "3", group: "Produce" },
					{ name: "Avocados", amount: "3", group: "Produce" },
					{ name: "Limes", amount: "3", group: "Produce" },
				],
			},
		];

		for (const meal of meals) {
			if (takenNames.has(meal.name.trim().toLowerCase())) continue;
			const mealTimes =
				meal.category === "Breakfast"
					? (["breakfast"] as const)
					: meal.category === "Lunch"
						? (["lunch"] as const)
						: meal.category === "Snack"
							? (["snack"] as const)
							: (["dinner"] as const);
			mealIds[meal.name] = await ctx.db.insert("meals", {
				...meal,
				householdId: args.householdId,
				mealTimes: [...mealTimes],
			});
		}

		const getId = (name: string): Id<"meals"> => {
			const id = mealIds[name];
			if (!id) throw new Error(`Seed meal missing: ${name}`);
			return id;
		};

		// Seed the demo plan onto the current week so it is visible on first run.
		const now = new Date();
		const monday = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() - ((now.getDay() + 6) % 7),
		);
		const isoForOffset = (offset: number): string => {
			const date = new Date(
				monday.getFullYear(),
				monday.getMonth(),
				monday.getDate() + offset,
			);
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			return `${date.getFullYear()}-${month}-${day}`;
		};

		const week: {
			offset: number;
			breakfast: string | null;
			lunch: string | null;
			dinner: string | null;
		}[] = [
			{
				offset: 0,
				breakfast: "Overnight oats",
				lunch: "Green goddess wrap",
				dinner: "Lemon herb chicken",
			},
			{
				offset: 1,
				breakfast: "Ricotta toast",
				lunch: null,
				dinner: "Miso salmon bowl",
			},
			{
				offset: 2,
				breakfast: "Overnight oats",
				lunch: "Green goddess wrap",
				dinner: "Roasted veggie tacos",
			},
			{
				offset: 3,
				breakfast: "Ricotta toast",
				lunch: "skip",
				dinner: "Tomato basil pasta",
			},
			{
				offset: 4,
				breakfast: "Overnight oats",
				lunch: null,
				dinner: "Miso salmon bowl",
			},
			{
				offset: 5,
				breakfast: "Ricotta toast",
				lunch: "Green goddess wrap",
				dinner: "skip",
			},
			{
				offset: 6,
				breakfast: "Overnight oats",
				lunch: null,
				dinner: "Lemon herb chicken",
			},
		];

		const existingDays = await ctx.db
			.query("weekDays")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.collect();
		const existingDates = new Set(existingDays.map((row) => row.date));
		const slotRef = (name: string | null): Id<"meals"> | "skip" | null => {
			if (name === null) return null;
			if (name === "skip") return "skip";
			return getId(name);
		};
		for (const day of week) {
			const date = isoForOffset(day.offset);
			if (existingDates.has(date)) continue;
			await ctx.db.insert("weekDays", {
				householdId: args.householdId,
				memberId: args.memberId,
				date,
				breakfast: slotRef(day.breakfast),
				lunch: slotRef(day.lunch),
				dinner: slotRef(day.dinner),
			});
		}

		// Generate the initial shopping list, pre-checking a few staples.
		const preChecked = new Set([
			"Produce:avocados",
			"Pantry Staples:jasmine-rice",
			"Pantry Staples:rolled-oats",
			"Pantry Staples:almond-butter",
		]);
		const seen = new Set<string>();
		const existingChecks = await ctx.db
			.query("shoppingItems")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.collect();
		for (const row of existingChecks) {
			seen.add(row.key);
		}
		for (const meal of meals) {
			for (const ingredient of meal.ingredients) {
				const key = ingredientKey(ingredient.name, ingredient.group);
				if (seen.has(key)) continue;
				seen.add(key);
				await ctx.db.insert("shoppingItems", {
					householdId: args.householdId,
					key,
					name: ingredient.name,
					amount: ingredient.amount,
					group: ingredient.group,
					checked: preChecked.has(key),
					custom: false,
				});
			}
		}
		return { seeded: true };
	},
	returns: v.object({ seeded: v.boolean() }),
});
