import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import schema, { autoPlanOption, mealSlot } from "./schema";

const autoPlanDoc = schema.doc("autoPlans");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// More than two full weeks of options is noise, not planning.
const MAX_OPTIONS = 14;

function assertDate(date: string): void {
	if (!ISO_DATE.test(date)) throw new Error("Invalid date.");
}

async function assertMember(
	ctx: QueryCtx,
	householdId: Id<"households">,
	memberId: Id<"householdMembers">,
): Promise<void> {
	const member = await ctx.db.get("householdMembers", memberId);
	if (!member || member.householdId !== householdId) {
		throw new Error("Household member not found.");
	}
}

async function assertOwnMeal(
	ctx: QueryCtx,
	householdId: Id<"households">,
	mealId: Id<"meals">,
): Promise<void> {
	const meal = await ctx.db.get("meals", mealId);
	if (!meal || meal.householdId !== householdId) {
		throw new Error("That meal no longer exists.");
	}
}

function dedupe(
	options: { mealId: Id<"meals">; count: number }[],
): { mealId: Id<"meals">; count: number }[] {
	const seen = new Set<string>();
	const out: { mealId: Id<"meals">; count: number }[] = [];
	for (const option of options) {
		if (seen.has(option.mealId)) continue;
		seen.add(option.mealId);
		out.push(option);
	}
	return out.slice(0, MAX_OPTIONS);
}

/**
 * Rows saved before counts existed hold bare meal ids. Upgrade them
 * to an even default split (earliest absorbs remainders) so old rows
 * never crash reads.
 */
function normalizeSlot(
	slot: unknown,
	dayCount: number,
): {
	mealId: Id<"meals">;
	count: number;
}[] {
	if (!Array.isArray(slot)) return [];
	const legacy = slot.filter(
		(entry): entry is string => typeof entry === "string",
	);
	if (legacy.length > 0) {
		const base = Math.floor(dayCount / legacy.length);
		const extra = dayCount % legacy.length;
		return legacy.map(
			(
				mealId: string,
				i: number,
			): {
				mealId: Id<"meals">;
				count: number;
			} => ({
				mealId: mealId as Id<"meals">,
				count: base + (i < extra ? 1 : 0),
			}),
		);
	}
	return (slot as { mealId: unknown; count: unknown }[]).filter(
		(entry): entry is { mealId: Id<"meals">; count: number } =>
			typeof entry?.mealId === "string" &&
			Number.isInteger((entry as { count: unknown }).count),
	);
}

/**
 * Spread counted options across days, one meal (or "skip") per day.
 * Each occurrence lands on the free day nearest its ideal evenly
 * spaced position (ties go later), so options stay spread out and
 * leftovers become real skips. With full-week counts this reproduces
 * strict alternation, earliest first.
 */
function spreadWithSkips(
	options: { mealId: Id<"meals">; count: number }[],
	dayCount: number,
): (Id<"meals"> | "skip")[] {
	const result: (Id<"meals"> | "skip")[] = Array(dayCount).fill("skip");
	if (dayCount <= 0) return result;
	const occurrences: { at: number; mealId: Id<"meals"> }[] = [];
	for (const option of options) {
		if (option.count <= 0) continue;
		for (let k = 0; k < option.count; k++) {
			occurrences.push({
				at: ((k + 0.5) * dayCount) / option.count,
				mealId: option.mealId,
			});
		}
	}
	// Stable sort: ties keep list order, so earlier options win them.
	occurrences.sort((a, b) => a.at - b.at);
	for (const occurrence of occurrences) {
		const home = Math.min(Math.floor(occurrence.at), dayCount - 1);
		for (let radius = 0; radius < dayCount; radius++) {
			if (home + radius < dayCount && result[home + radius] === "skip") {
				result[home + radius] = occurrence.mealId;
				break;
			}
			if (home - radius >= 0 && result[home - radius] === "skip") {
				result[home - radius] = occurrence.mealId;
				break;
			}
		}
		// No free day left: the occurrence is dropped.
	}
	return result;
}

function canManage(
	household: { ownerId?: Id<"householdMembers"> },
	callerMemberId: Id<"householdMembers">,
): boolean {
	return !household.ownerId || household.ownerId === callerMemberId;
}

/**
 * Members plan only for themselves, unless the household lets the
 * owner manage everyone's plans.
 */
async function assertCanEdit(
	ctx: QueryCtx,
	householdId: Id<"households">,
	targetMemberId: Id<"householdMembers">,
	callerMemberId: Id<"householdMembers">,
): Promise<void> {
	const [household, target, caller] = await Promise.all([
		ctx.db.get("households", householdId),
		ctx.db.get("householdMembers", targetMemberId),
		ctx.db.get("householdMembers", callerMemberId),
	]);
	if (
		!household ||
		!target ||
		target.householdId !== householdId ||
		!caller ||
		caller.householdId !== householdId
	) {
		throw new Error("Household member not found.");
	}
	if (
		target._id !== caller._id &&
		!(household.ownerManagesPlans && canManage(household, caller._id))
	) {
		throw new Error("You can only plan your own meals.");
	}
}

export const get = query({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
	},
	handler: async (ctx, args) => {
		await assertMember(ctx, args.householdId, args.memberId);
		// `.first()` instead of `.unique()`: duplicate rows must never
		// crash reads (see setOptions self-heal below).
		const row = await ctx.db
			.query("autoPlans")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.first();
		if (!row || row.householdId !== args.householdId) return null;
		return {
			...row,
			breakfast: normalizeSlot(row.breakfast, 7),
			lunch: normalizeSlot(row.lunch, 7),
			dinner: normalizeSlot(row.dinner, 7),
			snack: normalizeSlot(row.snack ?? [], 7),
		};
	},
	returns: v.union(autoPlanDoc, v.null()),
});

export const setOptions = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		slot: mealSlot,
		options: v.array(autoPlanOption),
	},
	handler: async (ctx, args) => {
		await assertCanEdit(
			ctx,
			args.householdId,
			args.memberId,
			args.callerMemberId,
		);
		const options = dedupe(args.options);
		for (const option of options) {
			// Counts are days of one week; the cap also bounds the
			// spread loop below.
			if (
				!Number.isInteger(option.count) ||
				option.count < 0 ||
				option.count > 7
			) {
				throw new Error("Option counts must be 0 to 7 days.");
			}
			await assertOwnMeal(ctx, args.householdId, option.mealId);
		}
		const existing = await ctx.db
			.query("autoPlans")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.collect();
		const [first, ...dupes] = existing;
		if (first) {
			await ctx.db.patch("autoPlans", first._id, {
				[args.slot]: options,
			});
			// Self-heal: collapse duplicate rows left by concurrent inserts.
			for (const dupe of dupes) {
				await ctx.db.delete("autoPlans", dupe._id);
			}
			return first._id;
		}
		return await ctx.db.insert("autoPlans", {
			householdId: args.householdId,
			memberId: args.memberId,
			breakfast: args.slot === "breakfast" ? options : [],
			lunch: args.slot === "lunch" ? options : [],
			dinner: args.slot === "dinner" ? options : [],
			snack: args.slot === "snack" ? options : [],
		});
	},
	returns: v.id("autoPlans"),
});

/**
 * Spread each slot's counted options across the given dates, so every
 * option lands as evenly spaced as possible. Slots with no surviving
 * options are left untouched, and meals deleted since the options
 * were saved are skipped.
 */
export const generate = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		dates: v.array(v.string()),
		// Limit generation to these slots; unset means all four.
		slots: v.optional(v.array(mealSlot)),
	},
	handler: async (ctx, args) => {
		await assertCanEdit(
			ctx,
			args.householdId,
			args.memberId,
			args.callerMemberId,
		);
		const dates = [...new Set(args.dates)].slice(0, 7);
		for (const date of dates) assertDate(date);
		const config = await ctx.db
			.query("autoPlans")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.first();
		if (!config || config.householdId !== args.householdId) {
			throw new Error("Pick auto-plan options first.");
		}
		const wanted = new Set(
			args.slots ?? (["breakfast", "lunch", "dinner", "snack"] as const),
		);
		const slots = (["breakfast", "lunch", "dinner", "snack"] as const).filter(
			(slot) => wanted.has(slot),
		);
		const planned: Record<(typeof slots)[number], number> = {
			breakfast: 0,
			lunch: 0,
			dinner: 0,
			snack: 0,
		};
		for (const slot of slots) {
			const surviving: { mealId: Id<"meals">; count: number }[] = [];
			for (const option of normalizeSlot(config[slot] ?? [], dates.length)) {
				const meal = await ctx.db.get("meals", option.mealId);
				if (meal && meal.householdId === args.householdId) {
					surviving.push(option);
				}
			}
			if (surviving.length === 0) continue;
			const spread = spreadWithSkips(surviving, dates.length);
			for (let i = 0; i < spread.length; i++) {
				const date = dates[i];
				const value = spread[i];
				if (!date || value === undefined) continue;
				const existing = await ctx.db
					.query("weekDays")
					.withIndex("by_member_date", (q) =>
						q.eq("memberId", args.memberId).eq("date", date),
					)
					.collect();
				const [first, ...dupes] = existing;
				if (first) {
					await ctx.db.patch("weekDays", first._id, {
						[slot]: value,
					});
					for (const dupe of dupes) {
						await ctx.db.delete("weekDays", dupe._id);
					}
				} else {
					await ctx.db.insert("weekDays", {
						householdId: args.householdId,
						memberId: args.memberId,
						date,
						breakfast: slot === "breakfast" ? value : null,
						lunch: slot === "lunch" ? value : null,
						dinner: slot === "dinner" ? value : null,
						snack: slot === "snack" ? value : null,
					});
				}
				planned[slot] += 1;
			}
		}
		return planned;
	},
	returns: v.object({
		breakfast: v.number(),
		lunch: v.number(),
		dinner: v.number(),
		snack: v.number(),
	}),
});
