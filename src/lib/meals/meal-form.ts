/**
 * The number input binds a string, but Svelte coerces it to a number
 * at runtime — accept both. Empty/invalid/negative becomes null (no
 * prep time); anything else is floored to whole minutes.
 */
export function parsePrepMinutes(
	value: string | number | null | undefined,
): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string" && value.trim() === "") return null;
	const minutes = Math.floor(Number(value));
	if (!Number.isFinite(minutes) || minutes < 0) return null;
	return minutes;
}

export function suggestCopyName(base: string, existing: string[]): string {
	const names = new Set(existing.map((name) => name.trim().toLowerCase()));
	let candidate = `${base} copy`;
	let n = 2;
	while (names.has(candidate.toLowerCase())) {
		candidate = `${base} copy ${n}`;
		n += 1;
	}
	return candidate;
}

export function hasNameClash(
	name: string,
	candidates: { id: string; name: string }[],
	editingId?: string | null,
): boolean {
	const normalized = name.trim().toLowerCase();
	if (!normalized) return false;
	return candidates.some(
		(meal) =>
			meal.id !== editingId && meal.name.trim().toLowerCase() === normalized,
	);
}

export function validateRecipeUrl(
	url: string,
): { ok: true; normalized: string } | { ok: false; error: string } {
	try {
		const parsed = new URL(url.trim());
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error();
		}
		return { ok: true, normalized: parsed.toString() };
	} catch {
		return { ok: false, error: "Enter a valid recipe URL starting with http." };
	}
}
