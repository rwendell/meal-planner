import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertCallerMutation } from "./authCheck";
import { canManage, cleanInviteCode } from "./householdAccess";

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
		if (!canManage(household, args.memberId)) {
			throw new Error("Only the kitchen owner can change the invite code.");
		}
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

export const setAllowMemberInvites = mutation({
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
			allowMemberInvites: args.enabled,
		});
		return null;
	},
	returns: v.null(),
});

export const setOwnerReviewsMeals = mutation({
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
			ownerReviewsMeals: args.enabled,
		});
		return null;
	},
	returns: v.null(),
});
