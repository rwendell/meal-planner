import { type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import schema from "./schema";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(): string {
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	}
	return code;
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
	args: { householdName: v.string(), memberName: v.string() },
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
		});
		await ctx.db.patch("households", householdId, { ownerId: memberId });
		return { householdId, memberId, inviteCode };
	},
	returns: v.object({
		householdId: v.id("households"),
		memberId: v.id("householdMembers"),
		inviteCode: v.string(),
	}),
});

export const join = mutation({
	args: { inviteCode: v.string(), memberName: v.string() },
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
		});
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
		const name = cleanName(args.name);
		if (!name) throw new Error("Household name is required.");
		await ctx.db.patch("households", args.householdId, { name });
		return null;
	},
	returns: v.null(),
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
		const name = cleanName(args.name);
		if (!name) throw new Error("Member name is required.");
		await ctx.db.patch("householdMembers", args.memberId, { name });
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
		await ctx.db.patch("householdMembers", args.memberId, {
			plannerMode: args.mode,
		});
		return args.memberId;
	},
	returns: v.id("householdMembers"),
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
