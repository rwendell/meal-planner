import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { guessGroup } from "./recipeImport";
import schema from "./schema";
import { ingredientKey } from "./shopping";

const pantryDoc = schema.doc("pantryItems");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanName(name: string): string {
	return name.trim().slice(0, 80);
}

export const list = query({
	args: { householdId: v.id("households") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("pantryItems")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.order("asc")
			.take(200);
	},
	returns: v.array(pantryDoc),
});

/**
 * Add (or refresh) a pantry staple. Entry is name-only: if it's on hand,
 * that's enough to cover whatever the week needs. Matching is
 * name-level regardless.
 */
export const add = mutation({
	args: {
		householdId: v.id("households"),
		name: v.string(),
	},
	handler: async (ctx, args) => {
		const household = await ctx.db.get("households", args.householdId);
		if (!household) throw new Error("Household not found.");
		const name = cleanName(args.name);
		if (!name) throw new Error("Ingredient name is required.");
		const group = guessGroup(name);
		const key = ingredientKey(name, group);
		const existing = await ctx.db
			.query("pantryItems")
			.withIndex("by_household_key", (q) =>
				q.eq("householdId", args.householdId).eq("key", key),
			)
			.first();
		if (existing) {
			await ctx.db.patch("pantryItems", existing._id, {
				name,
				group,
			});
			return existing._id;
		}
		return await ctx.db.insert("pantryItems", {
			householdId: args.householdId,
			key,
			name,
			group,
		});
	},
	returns: v.id("pantryItems"),
});

export const remove = mutation({
	args: { id: v.id("pantryItems") },
	handler: async (ctx, args) => {
		const item = await ctx.db.get("pantryItems", args.id);
		if (!item) return null;
		await ctx.db.delete("pantryItems", args.id);
		return item.name;
	},
	returns: v.union(v.string(), v.null()),
});

const readyKind = v.union(v.literal("eat"), v.literal("made"));

const readyRow = v.object({
	_id: v.id("readyMeals"),
	mealId: v.id("meals"),
	mealName: v.string(),
	kind: readyKind,
	note: v.union(v.string(), v.null()),
	expiresOn: v.union(v.string(), v.null()),
});

/** Ready-made meals with meal names resolved, expired rows included. */
export const listReady = query({
	args: { householdId: v.id("households") },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("readyMeals")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.order("asc")
			.take(100);
		const out: Array<{
			_id: Id<"readyMeals">;
			mealId: Id<"meals">;
			mealName: string;
			kind: "eat" | "made";
			note: string | null;
			expiresOn: string | null;
		}> = [];
		for (const row of rows) {
			const meal = await ctx.db.get("meals", row.mealId);
			if (!meal || meal.householdId !== args.householdId) continue;
			out.push({
				_id: row._id,
				mealId: row.mealId,
				mealName: meal.name,
				kind: row.kind ?? "made",
				note: row.note ?? null,
				expiresOn: row.expiresOn ?? null,
			});
		}
		return out;
	},
	returns: v.array(readyRow),
});

/**
 * Mark a meal ready or use it up. The kind follows the meal itself:
 * premade meals are bought whole, others check off their ingredients.
 */
export const setReady = mutation({
	args: {
		householdId: v.id("households"),
		mealId: v.id("meals"),
		on: v.boolean(),
		note: v.optional(v.string()),
		expiresOn: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (ctx, args) => {
		const household = await ctx.db.get("households", args.householdId);
		if (!household) throw new Error("Household not found.");
		const meal = await ctx.db.get("meals", args.mealId);
		if (!meal || meal.householdId !== args.householdId) {
			throw new Error("That meal no longer exists.");
		}
		const existing = await ctx.db
			.query("readyMeals")
			.withIndex("by_household_meal", (q) =>
				q.eq("householdId", args.householdId).eq("mealId", args.mealId),
			)
			.first();
		if (!args.on) {
			if (existing) await ctx.db.delete("readyMeals", existing._id);
			return null;
		}
		const note = args.note?.trim().slice(0, 60) || undefined;
		const expiresOn = args.expiresOn ?? undefined;
		if (expiresOn !== undefined && !ISO_DATE.test(expiresOn)) {
			throw new Error("Expiry must be a date.");
		}
		const kind = meal.premade ? "eat" : "made";
		if (existing) {
			await ctx.db.patch("readyMeals", existing._id, {
				kind,
				note: note ?? null,
				expiresOn: expiresOn ?? null,
			});
			return existing._id;
		}
		return await ctx.db.insert("readyMeals", {
			householdId: args.householdId,
			mealId: args.mealId,
			kind,
			...(note === undefined ? {} : { note }),
			...(expiresOn === undefined ? {} : { expiresOn }),
		});
	},
	returns: v.union(v.id("readyMeals"), v.null()),
});
