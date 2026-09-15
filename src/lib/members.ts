/** Shared helpers for household members (avatars, color dots). */

export const memberColors = [
	"#e47d5f",
	"#507b62",
	"#686c87",
	"#887647",
	"#b86b51",
	"#4f7d8c",
];

/** Stable color for a member, keyed off their position in the list. */
export function memberColor(
	members: readonly { _id: string }[],
	id: string,
): string {
	const index = members.findIndex((member) => member._id === id);
	return (
		memberColors[(index < 0 ? 0 : index) % memberColors.length] ?? "#e47d5f"
	);
}

/** "John Smith" -> "JS", "Me" -> "M". */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0]?.charAt(0) ?? "";
	const last =
		parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
	return (first + last).toUpperCase() || "?";
}
