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
 * The shopping list is always derived from the current week plan.
 * Checked states persist in the `shoppingItems` table, keyed by ingredient.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const [days, meals, checks] = await Promise.all([
			ctx.db.query("weekDays").collect(),
			ctx.db.query("meals").collect(),
			ctx.db.query("shoppingItems").collect(),
		]);
		const mealsById = new Map(meals.map((meal) => [meal._id, meal]));
		const checkedByKey = new Map(
			checks.map((item) => [item.key, item.checked]),
		);

		const needed = new Map<
			string,
			{ name: string; amount?: string; group: GroceryGroup }
		>();
		for (const day of days) {
			for (const mealId of [day.breakfast, day.lunch, day.dinner]) {
				if (!mealId) continue;
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
		key: v.string(),
		name: v.string(),
		amount: v.optional(v.string()),
		group: groceryGroup,
		checked: v.boolean(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("shoppingItems")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.unique();
		if (existing) {
			await ctx.db.patch("shoppingItems", existing._id, {
				checked: args.checked,
			});
			return existing._id;
		}
		return await ctx.db.insert("shoppingItems", {
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
