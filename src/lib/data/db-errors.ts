import { toast } from "svelte-sonner";

/** Deduplicates "couldn't reach the database" toasts: each distinct message toasts once until it clears. */
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
						`Couldn't reach the database (${error.message}). Check your connection and reload.`,
					);
				}
			} else {
				lastErrorToasted = "";
			}
		},
	};
}
