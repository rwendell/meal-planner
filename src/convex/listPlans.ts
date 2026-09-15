import { type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx } from "./_generated/server";
import { mealSlot } from "./schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// More than two full weeks of meals is noise, not planning.
const MAX_MEALS = 14;

/** A meal plus how many days of the list's week it covers. */
export const countedMeal = v.object({
	mealId: v.id("meals"),
	count: v.number(),
});
export type CountedMeal = Infer<typeof countedMeal>;

function assertDate(date: string): void {
	if (!ISO_DATE.test(date)) throw new Error("Invalid date.");
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

/** Collapse repeated meals, keeping the first count for each. */
function dedupe(meals: CountedMeal[]): CountedMeal[] {
	const seen = new Set<string>();
	const out: CountedMeal[] = [];
	for (const meal of meals) {
		if (seen.has(meal.mealId)) continue;
		seen.add(meal.mealId);
		out.push(meal);
	}
	return out.slice(0, MAX_MEALS);
}

/**
 * Spread counted meals across days, one meal (or "skip") per day.
 * Each occurrence lands on the free day nearest its ideal evenly
 * spaced position (ties go later), so meals stay spread out and
 * leftovers become real skips. With full-week counts this reproduces
 * strict alternation, earliest first.
 */
function spreadWithSkips(
	meals: CountedMeal[],
	dayCount: number,
): (Id<"meals"> | "skip")[] {
	const result: (Id<"meals"> | "skip")[] = Array(dayCount).fill("skip");
	if (dayCount <= 0) return result;
	const occurrences: { at: number; mealId: Id<"meals"> }[] = [];
	for (const meal of meals) {
		if (meal.count <= 0) continue;
		for (let k = 0; k < meal.count; k++) {
			occurrences.push({
				at: ((k + 0.5) * dayCount) / meal.count,
				mealId: meal.mealId,
			});
		}
	}
	// Stable sort: ties keep list order, so earlier meals win them.
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

/**
 * Write one slot's list of counted meals to the given week, spreading
 * them evenly across the days. An empty list clears the slot, so
 * removing every meal in list mode actually empties those days.
 */
export const apply = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		dates: v.array(v.string()),
		slot: mealSlot,
		meals: v.array(countedMeal),
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
		const meals = dedupe(args.meals);
		for (const meal of meals) {
			// Counts are days of one week; the cap also bounds the
			// spread loop below.
			if (!Number.isInteger(meal.count) || meal.count < 0 || meal.count > 7) {
				throw new Error("Meal counts must be 0 to 7 days.");
			}
			const row = await ctx.db.get("meals", meal.mealId);
			if (!row || row.householdId !== args.householdId) {
				throw new Error("That meal no longer exists.");
			}
		}
		const surviving = meals.filter((meal) => meal.count > 0);
		const spread: (Id<"meals"> | "skip" | null)[] =
			surviving.length === 0
				? Array(dates.length).fill(null)
				: spreadWithSkips(surviving, dates.length);
		for (let i = 0; i < dates.length; i++) {
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
					[args.slot]: value,
				});
				// Self-heal: collapse duplicate rows left by concurrent inserts.
				for (const dupe of dupes) {
					await ctx.db.delete("weekDays", dupe._id);
				}
			} else {
				await ctx.db.insert("weekDays", {
					householdId: args.householdId,
					memberId: args.memberId,
					date,
					breakfast: args.slot === "breakfast" ? value : null,
					lunch: args.slot === "lunch" ? value : null,
					dinner: args.slot === "dinner" ? value : null,
					snack: args.slot === "snack" ? value : null,
				});
			}
		}
	},
});
