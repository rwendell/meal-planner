import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Helpers shared by the household modules. Not a Convex module: it exports
 * no queries or mutations, so nothing here is addressable from a client.
 *
 * Anything in here that more than one module needs belongs here rather than
 * being copied. `canManage` in particular was byte-identical in `plans.ts`
 * and `households.ts`, which meant an ownership rule change had to be made
 * in two places.
 */

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * A caller may manage members when they own the household. Households
 * created before ownership existed have no owner; any of their members may
 * manage them.
 */
export function canManage(
	household: { ownerId?: Id<"householdMembers"> },
	callerMemberId: Id<"householdMembers">,
): boolean {
	return !household.ownerId || household.ownerId === callerMemberId;
}

/** Six characters with no 0/O or 1/I/L, so codes are unambiguous aloud. */
export function randomCode(): string {
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	}
	return code;
}

// Custom codes set by users allow any A-Z or 0-9.
const CUSTOM_INVITE_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function cleanInviteCode(raw: string): string {
	const normalized = raw.trim().toUpperCase();
	if (!CUSTOM_INVITE_CODE_PATTERN.test(normalized)) {
		throw new Error("Invite codes must use exactly 6 letters or digits.");
	}
	return normalized;
}

/**
 * A name that no sibling member already holds, suffixed with a number if
 * needed. Keeps a shared kitchen readable when two people are called the
 * same thing.
 */
export async function uniqueMemberName(
	ctx: MutationCtx,
	householdId: Id<"households">,
	base: string,
): Promise<string> {
	const members = await ctx.db
		.query("householdMembers")
		.withIndex("by_household", (q) => q.eq("householdId", householdId))
		.collect();
	const taken = new Set(members.map((m) => m.name.toLowerCase()));
	if (!taken.has(base.toLowerCase())) return base;
	let n = 2;
	while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
	return `${base} ${n}`;
}

/**
 * Delete everything a leaving member owns: their planner rows and their
 * member row. Their meals, recipes, and skips follow the user across
 * households and are keyed by login, so they survive.
 */
export async function deleteMemberRows(
	ctx: MutationCtx,
	memberId: Id<"householdMembers">,
): Promise<void> {
	const days = await ctx.db
		.query("weekDays")
		.withIndex("by_member", (q) => q.eq("memberId", memberId))
		.collect();
	for (const day of days) {
		await ctx.db.delete("weekDays", day._id);
	}
	await ctx.db.delete("householdMembers", memberId);
}

/**
 * Delete a household and everything scoped only to it. Portable meals
 * (those with an ownerAuth) follow their creator; only unattributed legacy
 * rows die here. Published snapshots are frozen shares — leaving never
 * unshares, so they always survive.
 */
export async function deleteHouseholdContents(
	ctx: MutationCtx,
	householdId: Id<"households">,
): Promise<void> {
	const [meals, checks] = await Promise.all([
		ctx.db
			.query("meals")
			.withIndex("by_household", (q) => q.eq("householdId", householdId))
			.collect(),
		ctx.db
			.query("shoppingItems")
			.withIndex("by_household", (q) => q.eq("householdId", householdId))
			.collect(),
	]);
	for (const meal of meals) {
		if (meal.ownerAuth) continue;
		await ctx.db.delete("meals", meal._id);
	}
	for (const check of checks) {
		await ctx.db.delete("shoppingItems", check._id);
	}
	await ctx.db.delete("households", householdId);
}
