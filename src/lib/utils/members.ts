/** Shared helpers for household members (avatars). */

/** "John Smith" -> "JS", "Me" -> "M". */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0]?.charAt(0) ?? "";
	const last =
		parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
	return (first + last).toUpperCase() || "?";
}
