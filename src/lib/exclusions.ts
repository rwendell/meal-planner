/** Planner exclusions: per-member (weekday, meal-slot) cells opted out of planning. */
import { parseISODate } from "$lib/dates.js";
import type { MealType } from "$lib/meal-types.js";

/** JS Date#getDay() convention: 0 = Sunday … 6 = Saturday. */
export type ExclusionDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ExcludedCell {
	day: ExclusionDay;
	slot: MealType;
}

/** Monday-first weekday rows for the settings matrix. */
export const EXCLUSION_WEEKDAYS: { day: ExclusionDay; label: string }[] = [
	{ day: 1, label: "Monday" },
	{ day: 2, label: "Tuesday" },
	{ day: 3, label: "Wednesday" },
	{ day: 4, label: "Thursday" },
	{ day: 5, label: "Friday" },
	{ day: 6, label: "Saturday" },
	{ day: 0, label: "Sunday" },
];

/** 0–6 weekday index of an ISO date. getDay() only ever returns 0–6. */
export function weekdayIndex(iso: string): ExclusionDay {
	return parseISODate(iso).getDay() as ExclusionDay;
}

export function exclusionKey(day: ExclusionDay, slot: MealType): string {
	return `${day}:${slot}`;
}

export function excludedCellSet(
	cells: readonly ExcludedCell[] | undefined,
): Set<string> {
	return new Set(
		(cells ?? []).map((cell) => exclusionKey(cell.day, cell.slot)),
	);
}

export function isCellExcluded(
	set: Set<string>,
	day: ExclusionDay,
	slot: MealType,
): boolean {
	return set.has(exclusionKey(day, slot));
}

/** Canonical ordering for stable storage and comparison. */
export function sortExcludedCells(cells: ExcludedCell[]): ExcludedCell[] {
	return [...cells].sort(
		(a, b) => a.day - b.day || a.slot.localeCompare(b.slot),
	);
}

export function sameExcludedCells(
	a: readonly ExcludedCell[],
	b: readonly ExcludedCell[],
): boolean {
	if (a.length !== b.length) return false;
	const keysA = new Set(a.map((cell) => exclusionKey(cell.day, cell.slot)));
	return b.every((cell) => keysA.has(exclusionKey(cell.day, cell.slot)));
}
