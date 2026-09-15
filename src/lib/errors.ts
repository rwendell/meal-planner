/** Human-readable message from an unknown thrown value. */
export function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}
