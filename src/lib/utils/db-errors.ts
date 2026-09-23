import { toast } from "svelte-sonner";

/** Deduplicates "couldn't load your data" toasts: each distinct message toasts once until it clears. */
export function createDbErrorDeduper(): {
	report(error: { message: string } | undefined | null): void;
} {
	let lastErrorToasted = "";
	return {
		report(error: { message: string } | undefined | null): void {
			if (error) {
				if (error.message !== lastErrorToasted) {
					lastErrorToasted = error.message;
					toast.error(
						`Couldn't load your data (${error.message}). Check your connection and reload.`,
					);
				}
			} else {
				lastErrorToasted = "";
			}
		},
	};
}
