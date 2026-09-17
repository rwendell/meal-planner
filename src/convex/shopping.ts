import { type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { groceryGroup } from "./schema";

type GroceryGroup = Infer<typeof groceryGroup>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Name slug inside an ingredient key (`group:slug`). */
function keySlug(key: string): string {
	const separator = key.indexOf(":");
	return separator < 0 ? key : key.slice(separator + 1);
}

/** Stable dedupe key so the same ingredient across meals collapses to one row. */
export function ingredientKey(name: string, group: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${group}:${slug}`;
}

const shoppingRow = v.object({
	key: v.string(),
	name: v.string(),
	amount: v.optional(v.string()),
	group: groceryGroup,
	checked: v.boolean(),
	coveredBy: v.union(v.literal("pantry"), v.literal("leftovers"), v.null()),
});

/**
 * The unified household shopping list, derived from every member's plans
 * on the given dates. Shared meals collapse to one row automatically.
 * Checked states persist per household, keyed by ingredient. Items
 * already on hand (pantry) or covered by a ready meal (unexpired
 * leftovers) check themselves; an explicit check/uncheck always wins.
 */
export const list = query({
	args: {
		householdId: v.id("households"),
		dates: v.array(v.string()),
		today: v.string(),
	},
	handler: async (ctx, args) => {
		if (!ISO_DATE.test(args.today)) throw new Error("Invalid date.");
		const unique = [...new Set(args.dates)].slice(0, 45);
		const [dayGroups, meals, checks, pantry, ready] = await Promise.all([
			Promise.all(
				unique.map((date) =>
					ctx.db
						.query("weekDays")
						.withIndex("by_household_and_date", (q) =>
							q.eq("householdId", args.householdId).eq("date", date),
						)
						.collect(),
				),
			),
			ctx.db
				.query("meals")
				.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
				.collect(),
			ctx.db
				.query("shoppingItems")
				.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
				.collect(),
			ctx.db
				.query("pantryItems")
				.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
				.collect(),
			ctx.db
				.query("readyMeals")
				.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
				.collect(),
		]);
		const mealsById = new Map(meals.map((meal) => [meal._id, meal]));
		const checkedByKey = new Map(
			checks.map((item) => [item.key, item.checked]),
		);
		const pantrySlugs = new Set(pantry.map((item) => keySlug(item.key)));
		const isActive = (expiresOn: string | null | undefined): boolean =>
			!expiresOn || expiresOn >= args.today;
		const madeMealIds = new Set(
			ready
				.filter(
					(row) => (row.kind ?? "made") !== "eat" && isActive(row.expiresOn),
				)
				.map((row) => row.mealId),
		);
		// Heat-and-eat products are bought whole: one list row each, and
		// their components stay off the list.
		const eatMealIds = new Set<Id<"meals">>();
		const eatProducts: Array<{
			mealId: Id<"meals">;
			name: string;
			amount?: string;
		}> = [];
		for (const row of ready) {
			if ((row.kind ?? "made") !== "eat" || !isActive(row.expiresOn)) {
				continue;
			}
			const meal = mealsById.get(row.mealId);
			if (!meal) continue;
			eatMealIds.add(row.mealId);
			eatProducts.push({
				mealId: row.mealId,
				name: meal.name,
				amount: row.note ?? undefined,
			});
		}

		const plannedMealIds = new Set<Id<"meals">>();
		const needed = new Map<
			string,
			{ name: string; amount?: string; group: GroceryGroup; ready: boolean }
		>();
		for (const days of dayGroups) {
			for (const day of days) {
				for (const mealId of [
					day.breakfast,
					day.lunch,
					day.dinner,
					day.snack ?? null,
				]) {
					// Skipped slots contribute no groceries.
					if (!mealId || mealId === "skip") continue;
					const meal = mealsById.get(mealId);
					if (!meal) continue;
					// Heat-and-eat products are bought whole below.
					if (eatMealIds.has(mealId)) continue;
					plannedMealIds.add(meal._id);
					const isReady = madeMealIds.has(mealId);
					for (const ingredient of meal?.ingredients ?? []) {
						const key = ingredientKey(ingredient.name, ingredient.group);
						const row = needed.get(key);
						if (!row) {
							needed.set(key, {
								name: ingredient.name,
								amount: ingredient.amount,
								group: ingredient.group,
								ready: isReady,
							});
						} else if (isReady) {
							row.ready = true;
						}
					}
				}
			}
		}

		const items = [...needed].map(([key, ingredient]) => {
			const coveredBy = pantrySlugs.has(keySlug(key))
				? ("pantry" as const)
				: ingredient.ready
					? ("leftovers" as const)
					: null;
			return {
				key,
				name: ingredient.name,
				amount: ingredient.amount,
				group: ingredient.group,
				checked: checkedByKey.get(key) ?? coveredBy !== null,
				coveredBy,
			};
		});
		for (const product of eatProducts) {
			const key = `ready:${product.mealId}`;
			items.push({
				key,
				name: product.name,
				amount: product.amount,
				group: "Other",
				checked: checkedByKey.get(key) ?? false,
				coveredBy: null,
			});
		}
		// Planned meals with no ingredients need nothing bought.
		const naturallyReady = [...plannedMealIds]
			.map((mealId) => mealsById.get(mealId))
			.filter(
				(meal): meal is NonNullable<typeof meal> =>
					!!meal && meal.ingredients.length === 0,
			)
			.map((meal) => meal.name)
			.filter((name, index, all) => all.indexOf(name) === index)
			.sort((a, b) => a.localeCompare(b));
		return { items, naturallyReady };
	},
	returns: v.object({
		items: v.array(shoppingRow),
		naturallyReady: v.array(v.string()),
	}),
});

export const setChecked = mutation({
	args: {
		householdId: v.id("households"),
		key: v.string(),
		name: v.string(),
		amount: v.optional(v.string()),
		group: groceryGroup,
		checked: v.boolean(),
	},
	handler: async (ctx, args) => {
		const household = await ctx.db.get("households", args.householdId);
		if (!household) throw new Error("Household not found.");
		const existing = await ctx.db
			.query("shoppingItems")
			.withIndex("by_household_key", (q) =>
				q.eq("householdId", args.householdId).eq("key", args.key),
			)
			.collect();
		const [first, ...dupes] = existing;
		if (first) {
			await ctx.db.patch("shoppingItems", first._id, {
				checked: args.checked,
			});
			for (const dupe of dupes) {
				await ctx.db.delete("shoppingItems", dupe._id);
			}
			return first._id;
		}
		return await ctx.db.insert("shoppingItems", {
			householdId: args.householdId,
			key: args.key,
			name: args.name,
			amount: args.amount,
			group: args.group,
			checked: args.checked,
			custom: false,
		});
	},
	returns: v.id("shoppingItems"),
});
