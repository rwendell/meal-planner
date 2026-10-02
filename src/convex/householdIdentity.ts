import { type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import {
	applyAuthProfile,
	authUserProfile,
	callerUserId,
	linkMatches,
} from "./authCheck";
import type { skippedCell } from "./schema";

type SkippedCell = Infer<typeof skippedCell>;

/**
 * Portable-data backfill when a member row links to a sign-in: personal
 * data follows the login, so attribute it now.
 *
 * - Solo-household meals without an owner adopt this user (multi-member
 *   households keep unattributed rows — no safe owner exists there).
 * - Skips union into the login-keyed userSkips row, bridging future
 *   leave/rejoin cycles (member rows stay the live store).
 */
async function backfillPortableData(
	ctx: MutationCtx,
	memberId: Id<"householdMembers">,
	userId: string,
): Promise<void> {
	const member = await ctx.db.get("householdMembers", memberId);
	if (!member) return;
	const siblings = await ctx.db
		.query("householdMembers")
		.withIndex("by_household", (q) => q.eq("householdId", member.householdId))
		.collect();
	if (siblings.length === 1) {
		const unattributed = await ctx.db
			.query("meals")
			.withIndex("by_household", (q) => q.eq("householdId", member.householdId))
			.collect();
		for (const meal of unattributed) {
			if (!meal.ownerAuth) {
				await ctx.db.patch("meals", meal._id, { ownerAuth: userId });
			}
		}
	}
	const key = (cell: SkippedCell) => `${cell.day}:${cell.slot}`;
	const union = new Map<string, SkippedCell>();
	const existing = await ctx.db
		.query("userSkips")
		.withIndex("by_auth", (q) => q.eq("authSubject", userId))
		.unique();
	for (const cell of [
		...(existing?.cells ?? []),
		...(member.skippedCells ?? []),
	]) {
		union.set(key(cell), cell);
	}
	const cells = [...union.values()];
	const changed =
		!existing ||
		existing.cells.length !== cells.length ||
		existing.cells.some((cell, i) => {
			const next = cells[i];
			return !next || key(cell) !== key(next);
		});
	if (!changed) return;
	if (existing) {
		await ctx.db.patch("userSkips", existing._id, { cells });
	} else if (cells.length > 0) {
		await ctx.db.insert("userSkips", { authSubject: userId, cells });
	}
}

/**
 * Every membership linked to the signed-in user. Anonymous callers get
 * []. Single-household client: used only so a signed-in user on a new
 * device rejoins their kitchen instead of provisioning a duplicate.
 */
export const myMemberships = query({
	args: {},
	handler: async (ctx) => {
		const userId = await callerUserId(ctx);
		if (!userId) return [];
		// Scan (not the by_authSubject index): legacy rows store a full
		// tokenIdentifier whose session segment rotates, so exact-match
		// misses them. linkMatches accepts both forms; every touch
		// normalizes legacy links to the plain user ID.
		const candidates = await ctx.db
			.query("householdMembers")
			.order("desc")
			.take(200);
		const members = candidates.filter(
			(member) => member.authSubject && linkMatches(member.authSubject, userId),
		);
		const out: Array<{
			householdId: Id<"households">;
			memberId: Id<"householdMembers">;
			memberName: string;
			memberImage: string | null;
		}> = [];
		for (const member of members) {
			const household = await ctx.db.get("households", member.householdId);
			if (!household) continue;
			out.push({
				householdId: household._id,
				memberId: member._id,
				memberName: member.name,
				memberImage: member.image ?? null,
			});
		}
		return out;
	},
	returns: v.array(
		v.object({
			householdId: v.id("households"),
			memberId: v.id("householdMembers"),
			memberName: v.string(),
			memberImage: v.union(v.string(), v.null()),
		}),
	),
});

/**
 * Link member rows to the signer (claiming) or refresh already-linked
 * rows, attribute portable data along the way. Rows already linked to a
 * different sign-in count as skipped.
 */
export const claimHouseholds = mutation({
	args: {
		refs: v.array(
			v.object({
				householdId: v.id("households"),
				memberId: v.id("householdMembers"),
			}),
		),
	},
	handler: async (ctx, args) => {
		const userId = await callerUserId(ctx);
		// No throw: the client fires this on auth transitions and a
		// stale token can beat the refresh here. The client retries on
		// the next transition; the manual button toasts on signedIn.
		if (!userId) {
			return { claimed: 0, alreadyMine: 0, skipped: 0, signedIn: false };
		}
		let claimed = 0;
		let alreadyMine = 0;
		let skipped = 0;
		const seen = new Set<string>();
		for (const ref of args.refs.slice(0, 20)) {
			const key = `${ref.householdId}:${ref.memberId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const member = await ctx.db.get("householdMembers", ref.memberId);
			if (!member || member.householdId !== ref.householdId) {
				skipped += 1;
				continue;
			}
			if (!member.authSubject) {
				await applyAuthProfile(ctx, member._id);
				await backfillPortableData(ctx, member._id, userId);
				claimed += 1;
				continue;
			}
			if (linkMatches(member.authSubject, userId)) {
				// Already linked: still refresh name/picture (and
				// normalize legacy tokenIdentifier links to user ID).
				await applyAuthProfile(ctx, member._id);
				await backfillPortableData(ctx, member._id, userId);
				alreadyMine += 1;
				continue;
			}
			skipped += 1;
		}
		return { claimed, alreadyMine, skipped, signedIn: true };
	},
	returns: v.object({
		claimed: v.number(),
		alreadyMine: v.number(),
		skipped: v.number(),
		signedIn: v.boolean(),
	}),
});

/** Signed-in profile for the account UI, or null when anonymous. */
export const authProfile = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		// Profile fields live in the users table; the session JWT only
		// carries `sub`.
		const profile = await authUserProfile(ctx);
		return {
			email: profile?.email ?? identity.email ?? null,
			name: profile?.name ?? identity.name ?? null,
			image: profile?.image ?? identity.pictureUrl ?? null,
		};
	},
	returns: v.union(
		v.object({
			email: v.union(v.string(), v.null()),
			name: v.union(v.string(), v.null()),
			image: v.union(v.string(), v.null()),
		}),
		v.null(),
	),
});
