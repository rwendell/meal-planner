import { type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import {
	applyAuthProfile,
	assertCaller,
	assertCallerMutation,
	authUserProfile,
	callerUserId,
	linkMatches,
	linkNewMember,
} from "./authCheck";
import schema, { excludedCell } from "./schema";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Generated codes stay unambiguous (no 0/O, 1/I/L). Custom codes set by
// users allow any A-Z or 0-9.
const CUSTOM_INVITE_CODE_PATTERN = /^[A-Z0-9]{6}$/;

function randomCode(): string {
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	}
	return code;
}

function cleanInviteCode(raw: string): string {
	const normalized = raw.trim().toUpperCase();
	if (!CUSTOM_INVITE_CODE_PATTERN.test(normalized)) {
		throw new Error("Invite codes must use exactly 6 letters or digits.");
	}
	return normalized;
}

function cleanName(name: string): string {
	return name.trim().slice(0, 40);
}

async function uniqueMemberName(
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

export const get = query({
	args: { householdId: v.id("households") },
	handler: async (ctx, args) => {
		const household = await ctx.db.get("households", args.householdId);
		if (!household) return null;
		const members = await ctx.db
			.query("householdMembers")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.order("asc")
			.take(50);
		return { household, members };
	},
	returns: v.union(
		v.object({
			household: schema.doc("households"),
			members: v.array(schema.doc("householdMembers")),
		}),
		v.null(),
	),
});

export const create = mutation({
	args: {
		householdName: v.string(),
		memberName: v.string(),
		autoNamed: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const householdName = cleanName(args.householdName);
		const memberName = cleanName(args.memberName);
		if (!householdName) throw new Error("Household name is required.");
		if (!memberName) throw new Error("Your name is required.");
		let inviteCode = "";
		for (let attempt = 0; attempt < 10; attempt++) {
			const candidate = randomCode();
			const clash = await ctx.db
				.query("households")
				.withIndex("by_inviteCode", (q) => q.eq("inviteCode", candidate))
				.unique();
			if (!clash) {
				inviteCode = candidate;
				break;
			}
		}
		if (!inviteCode) throw new Error("Couldn't generate an invite code.");
		const householdId = await ctx.db.insert("households", {
			name: householdName,
			inviteCode,
		});
		const memberId = await ctx.db.insert("householdMembers", {
			householdId,
			name: memberName,
			...(args.autoNamed === true ? { autoNamed: true as const } : {}),
		});
		await ctx.db.patch("households", householdId, { ownerId: memberId });
		// Signed-in creators own this member from the start.
		await linkNewMember(ctx, memberId);
		return { householdId, memberId, inviteCode };
	},
	returns: v.object({
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		inviteCode: v.string(),
	}),
});

export const join = mutation({
	args: {
		inviteCode: v.string(),
		memberName: v.string(),
		autoNamed: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const code = args.inviteCode.trim().toUpperCase();
		const memberName = cleanName(args.memberName);
		if (!memberName) throw new Error("Your name is required.");
		// `.first()` instead of `.unique()`: a duplicate invite code must
		// never crash joining; the first household wins.
		const household = await ctx.db
			.query("households")
			.withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
			.first();
		if (!household) throw new Error("No household found with that code.");
		const name = await uniqueMemberName(ctx, household._id, memberName);
		const memberId = await ctx.db.insert("householdMembers", {
			householdId: household._id,
			name,
			...(args.autoNamed === true ? { autoNamed: true as const } : {}),
		});
		// Signed-in joiners link the new row to their sign-in.
		await linkNewMember(ctx, memberId);
		return { householdId: household._id, memberId };
	},
	returns: v.object({
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
	}),
});

async function deleteHouseholdContents(
	ctx: MutationCtx,
	householdId: Id<"households">,
): Promise<void> {
	const [meals, checks, published] = await Promise.all([
		ctx.db
			.query("meals")
			.withIndex("by_household", (q) => q.eq("householdId", householdId))
			.collect(),
		ctx.db
			.query("shoppingItems")
			.withIndex("by_household", (q) => q.eq("householdId", householdId))
			.collect(),
		ctx.db
			.query("publishedRecipes")
			.withIndex("by_household", (q) => q.eq("sourceHouseholdId", householdId))
			.collect(),
	]);
	for (const meal of meals) {
		await ctx.db.delete("meals", meal._id);
	}
	for (const check of checks) {
		await ctx.db.delete("shoppingItems", check._id);
	}
	for (const recipe of published) {
		await ctx.db.delete("publishedRecipes", recipe._id);
	}
	await ctx.db.delete("households", householdId);
}

async function deleteMemberRows(
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
 * A caller may manage members when they own the household. Households
 * created before ownership existed have no owner; any of their members
 * may manage them.
 */
function canManage(
	household: { ownerId?: Id<"householdMembers"> },
	callerMemberId: Id<"householdMembers">,
): boolean {
	return !household.ownerId || household.ownerId === callerMemberId;
}

export const leave = mutation({
	args: { memberId: v.id("householdMembers") },
	handler: async (ctx, args) => {
		const member = await ctx.db.get("householdMembers", args.memberId);
		if (!member) return { householdDeleted: false };
		await assertCallerMutation(ctx, member.householdId, args.memberId);
		await deleteMemberRows(ctx, args.memberId);
		const remaining = await ctx.db
			.query("householdMembers")
			.withIndex("by_household", (q) => q.eq("householdId", member.householdId))
			.take(1);
		if (remaining.length > 0) {
			// An owner leaving opens management to the remaining members.
			const household = await ctx.db.get("households", member.householdId);
			if (household?.ownerId === args.memberId) {
				await ctx.db.patch("households", member.householdId, {
					ownerId: undefined,
				});
			}
			return { householdDeleted: false };
		}
		await deleteHouseholdContents(ctx, member.householdId);
		return { householdDeleted: true };
	},
	returns: v.object({ householdDeleted: v.boolean() }),
});

export const renameHousehold = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		name: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await ctx.db.get("householdMembers", args.memberId);
		if (!member || member.householdId !== args.householdId) {
			throw new Error("Household member not found.");
		}
		await assertCallerMutation(ctx, args.householdId, args.memberId);
		const name = cleanName(args.name);
		if (!name) throw new Error("Household name is required.");
		await ctx.db.patch("households", args.householdId, { name });
		return null;
	},
	returns: v.null(),
});

export const setInviteCode = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		inviteCode: v.string(),
	},
	handler: async (ctx, args) => {
		const household = await ctx.db.get("households", args.householdId);
		const member = await ctx.db.get("householdMembers", args.memberId);
		if (!household || !member || member.householdId !== args.householdId) {
			throw new Error("Household member not found.");
		}
		await assertCallerMutation(ctx, args.householdId, args.memberId);
		const inviteCode = cleanInviteCode(args.inviteCode);
		const existing = await ctx.db
			.query("households")
			.withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
			.collect();
		if (existing.some((row) => row._id !== args.householdId)) {
			throw new Error("That invite code is already taken.");
		}
		if (household.inviteCode === inviteCode) return inviteCode;
		await ctx.db.patch("households", args.householdId, { inviteCode });
		return inviteCode;
	},
	returns: v.string(),
});

export const renameMember = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		name: v.string(),
		callerMemberId: v.id("householdMembers"),
	},
	handler: async (ctx, args) => {
		const [household, target, caller] = await Promise.all([
			ctx.db.get("households", args.householdId),
			ctx.db.get("householdMembers", args.memberId),
			ctx.db.get("householdMembers", args.callerMemberId),
		]);
		if (
			!household ||
			!target ||
			target.householdId !== args.householdId ||
			!caller ||
			caller.householdId !== args.householdId
		) {
			throw new Error("Household member not found.");
		}
		if (
			args.memberId !== args.callerMemberId &&
			!canManage(household, args.callerMemberId)
		) {
			throw new Error("Only the kitchen owner can rename other members.");
		}
		await assertCallerMutation(ctx, args.householdId, args.callerMemberId);
		const name = cleanName(args.name);
		if (!name) throw new Error("Member name is required.");
		await ctx.db.patch("householdMembers", args.memberId, {
			name,
			autoNamed: false,
		});
		return args.memberId;
	},
	returns: v.id("householdMembers"),
});

export const setPlannerMode = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		mode: v.union(v.literal("planner"), v.literal("list")),
	},
	handler: async (ctx, args) => {
		// A member may only change their own view — never another
		// member's.
		if (args.memberId !== args.callerMemberId) {
			throw new Error("You can only change your own view.");
		}
		const [target, caller] = await Promise.all([
			ctx.db.get("householdMembers", args.memberId),
			ctx.db.get("householdMembers", args.callerMemberId),
		]);
		if (
			!target ||
			target.householdId !== args.householdId ||
			!caller ||
			caller.householdId !== args.householdId
		) {
			throw new Error("Household member not found.");
		}
		await assertCallerMutation(ctx, args.householdId, args.callerMemberId);
		await ctx.db.patch("householdMembers", args.memberId, {
			plannerMode: args.mode,
		});
		return args.memberId;
	},
	returns: v.id("householdMembers"),
});

/**
 * A member's own default for sharing newly created meals. Self-only,
 * like planner mode: nobody sets another member's default.
 */
export const setMemberAutoShare = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		enabled: v.boolean(),
	},
	handler: async (ctx, args) => {
		if (args.memberId !== args.callerMemberId) {
			throw new Error("You can only change your own sharing default.");
		}
		const [target, caller] = await Promise.all([
			ctx.db.get("householdMembers", args.memberId),
			ctx.db.get("householdMembers", args.callerMemberId),
		]);
		if (
			!target ||
			target.householdId !== args.householdId ||
			!caller ||
			caller.householdId !== args.householdId
		) {
			throw new Error("Household member not found.");
		}
		await assertCallerMutation(ctx, args.householdId, args.callerMemberId);
		await ctx.db.patch("householdMembers", args.memberId, {
			autoShareMeals: args.enabled,
		});
		return args.memberId;
	},
	returns: v.id("householdMembers"),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
// At most one cell per weekday × slot.
const MAX_EXCLUDED_CELLS = 28;

function assertDate(date: string): void {
	if (!ISO_DATE.test(date)) throw new Error("Invalid date.");
}

/** 0–6 weekday index (Sunday-first, like Date#getDay) of an ISO date. */
function weekdayOf(date: string): number {
	return new Date(`${date}T12:00:00Z`).getUTCDay();
}

type ExclusionCell = { day: number; slot: (typeof PLAN_SLOTS)[number] };

function exclusionKeys(cells: ExclusionCell[]): Set<string> {
	return new Set(cells.map((cell) => `${cell.day}:${cell.slot}`));
}

async function assertOwnExclusions(
	ctx: QueryCtx,
	householdId: Id<"households">,
	memberId: Id<"householdMembers">,
	callerMemberId: Id<"householdMembers">,
	cells: ExclusionCell[],
	fromDate: string,
): Promise<void> {
	// A member may only change their own exclusions — never another
	// member's.
	if (memberId !== callerMemberId) {
		throw new Error("You can only change your own planner.");
	}
	assertDate(fromDate);
	if (cells.length > MAX_EXCLUDED_CELLS) {
		throw new Error("Too many exclusions.");
	}
	const [target, caller] = await Promise.all([
		ctx.db.get("householdMembers", memberId),
		ctx.db.get("householdMembers", callerMemberId),
	]);
	if (
		!target ||
		target.householdId !== householdId ||
		!caller ||
		caller.householdId !== householdId
	) {
		throw new Error("Household member not found.");
	}
	// Signed-in callers must own the caller row (read-only check; the
	// mutation path links unclaimed rows via assertCallerMutation).
	await assertCaller(ctx, householdId, callerMemberId);
}

/**
 * How many planned meals (from `fromDate` onward) fall on the given
 * exclusion cells. Drives the "this will unplan N meals" confirmation
 * before applyPlannerExclusions commits.
 */
export const exclusionImpact = query({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		fromDate: v.string(),
		cells: v.array(excludedCell),
	},
	handler: async (ctx, args) => {
		await assertOwnExclusions(
			ctx,
			args.householdId,
			args.memberId,
			args.callerMemberId,
			args.cells,
			args.fromDate,
		);
		const excluded = exclusionKeys(args.cells);
		const rows = await ctx.db
			.query("weekDays")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.collect();
		let meals = 0;
		let slots = 0;
		for (const row of rows) {
			if (row.date < args.fromDate) continue;
			const day = weekdayOf(row.date);
			for (const slot of PLAN_SLOTS) {
				if (!excluded.has(`${day}:${slot}`)) continue;
				const value = row[slot] ?? null;
				if (value === null) continue;
				slots += 1;
				if (value !== "skip") meals += 1;
			}
		}
		return { meals, slots };
	},
	returns: v.object({ meals: v.number(), slots: v.number() }),
});

/**
 * Saves the member's planner exclusions and unplans every affected
 * slot from `fromDate` onward, so excluded cells never hold meals.
 */
export const applyPlannerExclusions = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
		fromDate: v.string(),
		cells: v.array(excludedCell),
	},
	handler: async (ctx, args) => {
		await assertOwnExclusions(
			ctx,
			args.householdId,
			args.memberId,
			args.callerMemberId,
			args.cells,
			args.fromDate,
		);
		// Link the caller's row to their sign-in before writing.
		await assertCallerMutation(ctx, args.householdId, args.callerMemberId);
		await ctx.db.patch("householdMembers", args.memberId, {
			excludedCells: args.cells,
		});
		const excluded = exclusionKeys(args.cells);
		const rows = await ctx.db
			.query("weekDays")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.collect();
		let meals = 0;
		let slots = 0;
		for (const row of rows) {
			if (row.date < args.fromDate) continue;
			const day = weekdayOf(row.date);
			const patch: {
				breakfast?: typeof row.breakfast;
				lunch?: typeof row.lunch;
				dinner?: typeof row.dinner;
				snack?: typeof row.snack;
			} = {};
			for (const slot of PLAN_SLOTS) {
				if (!excluded.has(`${day}:${slot}`)) continue;
				const value = row[slot] ?? null;
				if (value === null) continue;
				patch[slot] = null;
				slots += 1;
				if (value !== "skip") meals += 1;
			}
			if (Object.keys(patch).length > 0) {
				await ctx.db.patch("weekDays", row._id, patch);
			}
		}
		return { cleared: slots, meals };
	},
	returns: v.object({ cleared: v.number(), meals: v.number() }),
});

export const setOwnerManagesPlans = mutation({
	args: {
		householdId: v.id("households"),
		callerMemberId: v.id("householdMembers"),
		enabled: v.boolean(),
	},
	handler: async (ctx, args) => {
		const [household, caller] = await Promise.all([
			ctx.db.get("households", args.householdId),
			ctx.db.get("householdMembers", args.callerMemberId),
		]);
		if (!household || !caller || caller.householdId !== args.householdId) {
			throw new Error("Household member not found.");
		}
		await assertCallerMutation(ctx, args.householdId, args.callerMemberId);
		if (!canManage(household, args.callerMemberId)) {
			throw new Error("Only the kitchen owner can change this setting.");
		}
		await ctx.db.patch("households", args.householdId, {
			ownerManagesPlans: args.enabled,
		});
		return null;
	},
	returns: v.null(),
});

export const removeMember = mutation({
	args: {
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		callerMemberId: v.id("householdMembers"),
	},
	handler: async (ctx, args) => {
		if (args.memberId === args.callerMemberId) {
			throw new Error("Use leave to remove yourself.");
		}
		const [household, target, caller] = await Promise.all([
			ctx.db.get("households", args.householdId),
			ctx.db.get("householdMembers", args.memberId),
			ctx.db.get("householdMembers", args.callerMemberId),
		]);
		if (
			!household ||
			!target ||
			target.householdId !== args.householdId ||
			!caller ||
			caller.householdId !== args.householdId
		) {
			throw new Error("Household member not found.");
		}
		if (!canManage(household, args.callerMemberId)) {
			throw new Error("Only the kitchen owner can remove members.");
		}
		await assertCallerMutation(ctx, args.householdId, args.callerMemberId);
		await deleteMemberRows(ctx, args.memberId);
		const remaining = await ctx.db
			.query("householdMembers")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.take(1);
		if (remaining.length > 0) return { householdDeleted: false };
		await deleteHouseholdContents(ctx, args.householdId);
		return { householdDeleted: true };
	},
	returns: v.object({ householdDeleted: v.boolean() }),
});

const rosterEntry = v.object({
	household: v.object({
		_id: v.id("households"),
		name: v.string(),
		inviteCode: v.string(),
	}),
	member: v.object({
		_id: v.id("householdMembers"),
		name: v.string(),
	}),
	memberCount: v.number(),
	isOwner: v.boolean(),
});

export const listHouseholds = query({
	args: {
		refs: v.array(
			v.object({
				householdId: v.id("households"),
				memberId: v.id("householdMembers"),
			}),
		),
	},
	handler: async (ctx, args) => {
		const results: Array<Infer<typeof rosterEntry> | null> = [];
		const seen = new Set<string>();
		for (const ref of args.refs.slice(0, 20)) {
			const key = `${ref.householdId}:${ref.memberId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const [household, member] = await Promise.all([
				ctx.db.get("households", ref.householdId),
				ctx.db.get("householdMembers", ref.memberId),
			]);
			if (!household || !member || member.householdId !== ref.householdId) {
				results.push(null);
				continue;
			}
			const members = await ctx.db
				.query("householdMembers")
				.withIndex("by_household", (q) => q.eq("householdId", ref.householdId))
				.collect();
			results.push({
				household: {
					_id: household._id,
					name: household.name,
					inviteCode: household.inviteCode,
				},
				member: { _id: member._id, name: member.name },
				memberCount: members.length,
				isOwner: !household.ownerId || household.ownerId === member._id,
			});
		}
		return results;
	},
	returns: v.array(v.union(rosterEntry, v.null())),
});

/**
 * Every membership linked to the signed-in user. Anonymous callers get
 * []. The client reconciles this into the local roster so all of the
 * user's kitchens — not just the active one — survive a new device.
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
			householdName: string;
			memberName: string;
			memberImage: string | null;
		}> = [];
		for (const member of members) {
			const household = await ctx.db.get("households", member.householdId);
			if (!household) continue;
			out.push({
				householdId: household._id,
				memberId: member._id,
				householdName: household.name,
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
			householdName: v.string(),
			memberName: v.string(),
			memberImage: v.union(v.string(), v.null()),
		}),
	),
});

/**
 * One-time migration: link this device's roster rows to the signer.
 * Rows already linked to a different sign-in count as skipped — the UI
 * reconciles through myMemberships instead.
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
				claimed += 1;
				continue;
			}
			if (linkMatches(member.authSubject, userId)) {
				// Already linked: still refresh name/picture (and
				// normalize legacy tokenIdentifier links to user ID).
				await applyAuthProfile(ctx, member._id);
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
