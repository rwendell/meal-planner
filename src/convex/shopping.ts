import { type Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { groceryGroup } from "./schema";

type GroceryGroup = Infer<typeof groceryGroup>;

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
});

/**
 * The unified household shopping list, derived from every member's plans
 * on the given dates. Shared meals collapse to one row automatically.
 * Checked states persist per household, keyed by ingredient.
 */
export const list = query({
	args: { householdId: v.id("households"), dates: v.array(v.string()) },
	handler: async (ctx, args) => {
		const unique = [...new Set(args.dates)].slice(0, 45);
		const [dayGroups, meals, checks] = await Promise.all([
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
		]);
		const mealsById = new Map(meals.map((meal) => [meal._id, meal]));
		const checkedByKey = new Map(
			checks.map((item) => [item.key, item.checked]),
		);

		const needed = new Map<
			string,
			{ name: string; amount?: string; group: GroceryGroup }
		>();
		for (const days of dayGroups) {
			for (const day of days) {
				for (const mealId of [day.breakfast, day.lunch, day.dinner]) {
					// Skipped slots contribute no groceries.
					if (!mealId || mealId === "skip") continue;
					const meal = mealsById.get(mealId);
					for (const ingredient of meal?.ingredients ?? []) {
						const key = ingredientKey(ingredient.name, ingredient.group);
						if (!needed.has(key)) {
							needed.set(key, {
								name: ingredient.name,
								amount: ingredient.amount,
								group: ingredient.group,
							});
						}
					}
				}
			}
		}

		return [...needed].map(([key, ingredient]) => ({
			key,
			name: ingredient.name,
			amount: ingredient.amount,
			group: ingredient.group,
			checked: checkedByKey.get(key) ?? false,
		}));
	},
	returns: v.array(shoppingRow),
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
