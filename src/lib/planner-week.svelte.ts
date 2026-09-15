import { browser } from "$app/environment";
import { todayISO } from "$lib/dates.js";

const STORAGE_KEY = "meal-planner-week";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function load(): string {
	if (!browser) return todayISO();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw && ISO_DATE.test(raw) ? raw : todayISO();
	} catch {
		return todayISO();
	}
}

/**
 * The week the planner is currently on. The shopping list follows it, so
 * planning next week shows next week's groceries.
 */
class PlannerWeekStore {
	anchor = $state<string>(load());

	set(anchor: string): void {
		this.anchor = anchor;
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, anchor);
			} catch {
				// Ignore storage failures; the in-memory value still applies.
			}
		}
	}
}

export const plannerWeek = new PlannerWeekStore();
