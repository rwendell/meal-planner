import { browser } from "$app/environment";

const STORAGE_KEY = "meal-planner-prefs";

interface PrefsShape {
	desktopDashboard: boolean;
}

function load(): PrefsShape {
	if (!browser) return { desktopDashboard: false };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { desktopDashboard: false };
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"desktopDashboard" in parsed
		) {
			return {
				desktopDashboard: (parsed as PrefsShape).desktopDashboard === true,
			};
		}
		return { desktopDashboard: false };
	} catch {
		return { desktopDashboard: false };
	}
}

function save(state: PrefsShape): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore storage failures; the in-memory prefs still apply.
	}
}

class PrefsStore {
	desktopDashboard = $state<boolean>(load().desktopDashboard);

	setDesktopDashboard(value: boolean): void {
		this.desktopDashboard = value;
		save({ desktopDashboard: value });
	}
}

export const prefs = new PrefsStore();
