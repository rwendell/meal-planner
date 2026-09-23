import { exclusionKey, weekdayIndex } from "$lib/utils/exclusions.js";
import { MEAL_TYPES, type MealType } from "$lib/utils/meal-types.js";

export function isCellExcludedSet(
	set: Set<string>,
	date: string,
	slot: MealType,
): boolean {
	return set.has(exclusionKey(weekdayIndex(date), slot));
}

export function isDayFullyExcluded(set: Set<string>, date: string): boolean {
	return MEAL_TYPES.every((type) => isCellExcludedSet(set, date, type.id));
}

export function visibleSlotsForDates(
	set: Set<string>,
	dates: string[],
): typeof MEAL_TYPES {
	return MEAL_TYPES.filter((type) =>
		dates.some((date) => !isCellExcludedSet(set, date, type.id)),
	);
}

export function filterVisibleDates(
	dates: string[],
	set: Set<string>,
): string[] {
	return dates.filter((date) => !isDayFullyExcluded(set, date));
}
