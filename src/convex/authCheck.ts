import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * OAuth caller verification (Phase A).
 *
 * Rows link by Convex Auth **user ID** (`authSubject` stores the `users`
 * row ID). Never use `tokenIdentifier` as the link: it embeds the
 * session ID (`iss|userId|sessionId`), so it changes on every sign-in
 * and breaks matching on new devices. Legacy rows storing a full
 * tokenIdentifier are recognized by their middle segment and rewritten
 * to the plain user ID on next touch.
 *
 * Anonymous invite-code callers keep working exactly as before. When the
 * request carries a Convex Auth identity, the caller member row must
 * belong to that user: rows linked to a *different* user are rejected.
 * Unlinked rows auto-link on write (mutations) so a first sign-in
 * transparently claims the device's existing members. Queries never
 * write, so they only verify.
 */

/** Stable Convex Auth user ID of the request, or null when anonymous. */
export async function callerUserId(ctx: QueryCtx): Promise<Id<"users"> | null> {
	const userId = await getAuthUserId(ctx);
	return (userId as Id<"users"> | null) ?? null;
}

/**
 * Does the stored link belong to this user? Accepts the plain user ID
 * and the legacy `iss|userId|sessionId` tokenIdentifier form.
 */
export function linkMatches(
	stored: string | undefined,
	userId: string,
): boolean {
	if (!stored) return false;
	if (stored === userId) return true;
	const parts = stored.split("|");
	return parts.length === 3 && parts[1] === userId;
}

/**
 * Verify the caller row is in the household and — when signed in — not
 * linked to someone else. Read-only; safe in queries.
 */
export async function assertCaller(
	ctx: QueryCtx,
	householdId: Id<"households">,
	callerMemberId: Id<"householdMembers">,
) {
	const caller = await ctx.db.get("householdMembers", callerMemberId);
	if (!caller || caller.householdId !== householdId) {
		throw new Error("Household member not found.");
	}
	const userId = await callerUserId(ctx);
	if (
		userId &&
		caller.authSubject &&
		!linkMatches(caller.authSubject, userId)
	) {
		throw new Error("This member belongs to a different sign-in.");
	}
	return { caller, userId };
}

/**
 * Mutation variant of assertCaller: links an unclaimed caller row to the
 * signer (and refreshes their profile) before the mutation commits.
 */
export async function assertCallerMutation(
	ctx: MutationCtx,
	householdId: Id<"households">,
	callerMemberId: Id<"householdMembers">,
) {
	const { caller, userId } = await assertCaller(
		ctx,
		householdId,
		callerMemberId,
	);
	if (userId) {
		await applyAuthProfile(ctx, caller._id);
	}
	return caller;
}

/**
 * OAuth profile (name/picture/email) for the signer. Convex Auth mints
 * session JWTs with only `sub`, so profile fields come from the `users`
 * table — never from identity claims.
 */
export async function authUserProfile(
	ctx: QueryCtx,
): Promise<{ name?: string; image?: string; email?: string } | null> {
	const userId = await getAuthUserId(ctx);
	if (!userId) return null;
	const user = await ctx.db.get("users", userId);
	if (!user) return null;
	return { name: user.name, image: user.image, email: user.email };
}

/** Stamp a freshly created member row with the signer's identity. */
export async function linkNewMember(
	ctx: MutationCtx,
	memberId: Id<"householdMembers">,
): Promise<void> {
	await applyAuthProfile(ctx, memberId);
}

/**
 * Link a member row to the signer and pull their OAuth profile across:
 * the picture always refreshes; the name replaces auto-generated
 * defaults once (then freezes so later renames stick). Legacy
 * tokenIdentifier links normalize to the plain user ID.
 */
export async function applyAuthProfile(
	ctx: MutationCtx,
	memberId: Id<"householdMembers">,
): Promise<void> {
	const userId = await callerUserId(ctx);
	if (!userId) return;
	const member = await ctx.db.get("householdMembers", memberId);
	if (!member) return;
	if (member.authSubject && !linkMatches(member.authSubject, userId)) {
		return;
	}
	const identity = await ctx.auth.getUserIdentity();
	const patch: {
		authSubject?: string;
		name?: string;
		image?: string;
		autoNamed?: boolean;
	} = {};
	if (!member.authSubject || member.authSubject !== userId) {
		patch.authSubject = userId;
	}
	const auto =
		member.autoNamed === true ||
		(member.autoNamed === undefined && member.name === "Me");
	const profile = await authUserProfile(ctx);
	const profileName = (profile?.name ?? identity?.name)?.trim().slice(0, 40);
	if (auto && profileName && profileName !== member.name) {
		patch.name = profileName;
		patch.autoNamed = false;
	}
	const picture = profile?.image ?? identity?.pictureUrl;
	if (picture && picture !== member.image) {
		patch.image = picture;
	}
	if (Object.keys(patch).length > 0) {
		await ctx.db.patch("householdMembers", member._id, patch);
	}
}
