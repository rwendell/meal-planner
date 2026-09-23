import { MEAL_TYPES, type MealType } from "$lib/utils/meal-types.js";
import { skippedKey, weekdayIndex } from "$lib/utils/skipped.js";

export function isCellSkippedSet(
	set: Set<string>,
	date: string,
	slot: MealType,
): boolean {
	return set.has(skippedKey(weekdayIndex(date), slot));
}

export function isDayFullySkipped(set: Set<string>, date: string): boolean {
	return MEAL_TYPES.every((type) => isCellSkippedSet(set, date, type.id));
}

export function visibleSlotsForDates(
	set: Set<string>,
	dates: string[],
): typeof MEAL_TYPES {
	return MEAL_TYPES.filter((type) =>
		dates.some((date) => !isCellSkippedSet(set, date, type.id)),
	);
}

export function filterVisibleDates(
	dates: string[],
	set: Set<string>,
): string[] {
	return dates.filter((date) => !isDayFullySkipped(set, date));
}
