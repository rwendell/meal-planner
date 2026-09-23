import { browser } from "$app/environment";

export type MobilePlannerView = "day" | "week";

const STORAGE_KEY = "meal-planner-mobile-view";

function load(): MobilePlannerView {
	if (!browser) return "day";
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === "day" || raw === "week") return raw;
		return "day";
	} catch {
		return "day";
	}
}

class PlannerViewStore {
	view = $state<MobilePlannerView>(load());

	set(view: MobilePlannerView): void {
		this.view = view;
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, view);
			} catch {
				// Ignore storage failures; the in-memory view still applies.
			}
		}
	}
}

export const plannerView = new PlannerViewStore();
