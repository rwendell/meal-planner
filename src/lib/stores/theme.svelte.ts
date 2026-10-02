import { MediaQuery } from "svelte/reactivity";
import { browser } from "$app/environment";

const STORAGE_KEY = "meal-planner-theme";

/**
 * Colour scheme for the whole app: the user's choice, persisted per
 * device, plus the "system" mode that follows the OS.
 *
 * `theme` is the effective value the app should render with; it is never
 * "system" once resolved. `choice` is the literal three-way setting the
 * preferences toggle group binds to.
 *
 * The resolved value is also written onto <html> (class `dark` and
 * `color-scheme`), which is what the app's CSS keys off. `app.html`
 * applies the same class before first paint from localStorage, so there
 * is no flash of the wrong theme on load.
 */
type Theme = "system" | "light" | "dark";

function load(): Theme {
	if (!browser) return "system";
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === "light" || saved === "dark" || saved === "system") {
			return saved;
		}
	} catch {
		// Ignore storage failures; the default still applies.
	}
	return "system";
}

const systemDark = new MediaQuery("(prefers-color-scheme: dark)", false);

class ThemeStore {
	/** The stored three-way preference, as bound by the toggle group. */
	choice = $state<Theme>(load());

	/** The effective scheme, with "system" already resolved. */
	theme = $derived(
		this.choice === "system"
			? systemDark.current
				? "dark"
				: "light"
			: this.choice,
	);

	readonly options: { id: Theme; label: string }[] = [
		{ id: "system", label: "System" },
		{ id: "light", label: "Light" },
		{ id: "dark", label: "Dark" },
	];

	setTheme(value: Theme): void {
		this.choice = value;
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, value);
		} catch {
			// Ignore storage failures; the in-memory choice still applies.
		}
	}

	/** Mirror the resolved scheme onto <html> for CSS and native form controls. */
	applyToDocument(node: HTMLElement): void {
		const dark = this.theme === "dark";
		node.classList.toggle("dark", dark);
		node.style.colorScheme = dark ? "dark" : "light";
	}
}

export const themeStore = new ThemeStore();
