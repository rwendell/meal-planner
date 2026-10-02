import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertCallerMutation } from "./authCheck";
import {
	canManage,
	deleteHouseholdContents,
	deleteMemberRows,
} from "./householdAccess";

function cleanName(name: string): string {
	return name.trim().slice(0, 40);
}

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
