/** Shared meal categories, planner slots, and helpers. */

export type MealCategory = "Breakfast" | "Lunch" | "Dinner" | "Snack";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: { id: MealType; label: string }[] = [
	{ id: "breakfast", label: "Breakfast" },
	{ id: "lunch", label: "Lunch" },
	{ id: "dinner", label: "Dinner" },
	{ id: "snack", label: "Snack" },
];

export const ALL_MEAL_TIMES: MealType[] = MEAL_TYPES.map((type) => type.id);

/** Meal summary passed to the shared meal picker dialog. */
export interface PickerMeal {
	id: string;
	name: string;
	category: string;
	note: string;
	color: string;
	mealTimes: MealType[];
}

/** Default planner slots for a meal without an explicit `mealTimes` list. */
export function fallbackMealTimes(category: MealCategory): MealType[] {
	if (category === "Breakfast") return ["breakfast"];
	if (category === "Lunch") return ["lunch"];
	if (category === "Snack") return ["snack"];
	return ["dinner"];
}

/**
 * Display color for a meal, derived from its meal times so the planner is
 * color-coded by time of day instead of by stored per-meal color.
 *
 * Returns a CSS color expression built from the `--meal-*` theme variables
 * (defined in `src/routes/custom.css` for light + dark): a single time maps
 * to its variable; multiple times mix pairwise in canonical meal-time order
 * via nested `color-mix()`, so every combination resolves to one value the
 * existing tint/border plumbing can consume. Empty lists fall back to
 * breakfast (matching the historical default pastel).
 */
const MEAL_TIME_VARS: Record<MealType, string> = {
	breakfast: "var(--meal-breakfast)",
	lunch: "var(--meal-lunch)",
	dinner: "var(--meal-dinner)",
	snack: "var(--meal-snack)",
};

export function mealTimeColor(times: MealType[]): string {
	const ordered = ALL_MEAL_TIMES.filter((time) => times.includes(time));
	if (ordered.length === 0) return MEAL_TIME_VARS.breakfast;
	let blended = MEAL_TIME_VARS[ordered[0]];
	for (let k = 1; k < ordered.length; k += 1) {
		const share = ((100 * k) / (k + 1)).toFixed(2).replace(/\.?0+$/, "");
		blended = `color-mix(in oklch, ${blended} ${share}%, ${MEAL_TIME_VARS[ordered[k]]})`;
	}
	return blended;
}

/**
 * Single source of truth for manual meal category values.
 * Deterministically derives `MealCategory` from selected `MealType[]`
 * using canonical meal-time order: breakfast, then lunch, then dinner,
 * then snack.
 */
export function categoryFromMealTimes(times: MealType[]): MealCategory {
	if (times.includes("breakfast")) return "Breakfast";
	if (times.includes("lunch")) return "Lunch";
	if (times.includes("dinner")) return "Dinner";
	return "Snack";
}

/**
 * Displayable prep time ("25 min"), or null when absent. The cookbook
 * stores whole minutes; null/undefined/NaN/non-positive all hide.
 */
export function displayMealTime(
	minutes: number | null | undefined,
): string | null {
	if (minutes === null || minutes === undefined) return null;
	if (!Number.isFinite(minutes)) return null;
	const whole = Math.floor(minutes);
	if (whole <= 0) return null;
	return whole === 1 ? "1 min" : `${whole} min`;
}
