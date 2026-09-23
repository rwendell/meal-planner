/** Skipped meals: per-member (weekday, meal-slot) cells opted out of planning. */
import { parseISODate } from "$lib/utils/dates.js";
import type { MealType } from "$lib/utils/meal-types.js";

/** JS Date#getDay() convention: 0 = Sunday … 6 = Saturday. */
export type SkippedDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SkippedCell {
	day: SkippedDay;
	slot: MealType;
}

/** Monday-first weekday rows for the settings matrix. */
export const SKIPPED_WEEKDAYS: { day: SkippedDay; label: string }[] = [
	{ day: 1, label: "Monday" },
	{ day: 2, label: "Tuesday" },
	{ day: 3, label: "Wednesday" },
	{ day: 4, label: "Thursday" },
	{ day: 5, label: "Friday" },
	{ day: 6, label: "Saturday" },
	{ day: 0, label: "Sunday" },
];

/** 0–6 weekday index of an ISO date. getDay() only ever returns 0–6. */
export function weekdayIndex(iso: string): SkippedDay {
	return parseISODate(iso).getDay() as SkippedDay;
}

export function skippedKey(day: SkippedDay, slot: MealType): string {
	return `${day}:${slot}`;
}

export function skippedCellSet(
	cells: readonly SkippedCell[] | undefined,
): Set<string> {
	return new Set((cells ?? []).map((cell) => skippedKey(cell.day, cell.slot)));
}

export function isCellSkipped(
	set: Set<string>,
	day: SkippedDay,
	slot: MealType,
): boolean {
	return set.has(skippedKey(day, slot));
}

/** Canonical ordering for stable storage and comparison. */
export function sortSkippedCells(cells: SkippedCell[]): SkippedCell[] {
	return [...cells].sort(
		(a, b) => a.day - b.day || a.slot.localeCompare(b.slot),
	);
}

export function sameSkippedCells(
	a: readonly SkippedCell[],
	b: readonly SkippedCell[],
): boolean {
	if (a.length !== b.length) return false;
	const keysA = new Set(a.map((cell) => skippedKey(cell.day, cell.slot)));
	return b.every((cell) => keysA.has(skippedKey(cell.day, cell.slot)));
}
