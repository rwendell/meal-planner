import { browser } from "$app/environment";
import { session } from "$lib/session.svelte.js";

export const REVIEW_STORAGE_KEY = "meal-planner-leftover-review";

/** Stored anchor of the dismissed leftover-review nudge, or null. */
export function readReviewDismissal(): string | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { ref, anchor } = parsed as {
			ref?: unknown;
			anchor?: unknown;
		};
		if (typeof ref !== "string" || typeof anchor !== "string") {
			return null;
		}
		if (
			!session.session ||
			ref !== `${session.session.householdId}:${session.session.memberId}`
		) {
			return null;
		}
		return anchor;
	} catch {
		return null;
	}
}

/** Remember the nudge as dismissed for the given last-week anchor. */
export function writeReviewDismissal(anchor: string): void {
	if (!browser || !session.session) return;
	try {
		localStorage.setItem(
			REVIEW_STORAGE_KEY,
			JSON.stringify({
				ref: `${session.session.householdId}:${session.session.memberId}`,
				anchor,
			}),
		);
	} catch {
		// Ignore storage failures; the nudge simply returns.
	}
}
