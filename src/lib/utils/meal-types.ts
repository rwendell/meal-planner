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
