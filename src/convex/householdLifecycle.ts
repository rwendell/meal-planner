import { type Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertCallerMutation, linkNewMember } from "./authCheck";
import {
	canManage,
	deleteHouseholdContents,
	deleteMemberRows,
	randomCode,
	uniqueMemberName,
} from "./householdAccess";
import schema, { type skippedCell } from "./schema";

type SkippedCell = Infer<typeof skippedCell>;

function cleanName(name: string): string {
	return name.trim().slice(0, 40);
}

export const get = query({
	args: {
		householdId: v.id("households"),
		callerMemberId: v.optional(v.id("householdMembers")),
	},
	handler: async (ctx, args) => {
		const household = await ctx.db.get("households", args.householdId);
		if (!household) return null;
		const members = await ctx.db
			.query("householdMembers")
			.withIndex("by_household", (q) => q.eq("householdId", args.householdId))
			.order("asc")
			.take(50);
		// The invite code is need-to-know: owners always see it, members
		// see it only when the household allows member invites.
		let inviteCode: string | undefined;
		if (args.callerMemberId) {
			const caller = members.find(
				(member) => member._id === args.callerMemberId,
			);
			if (
				caller &&
				(canManage(household, caller._id) || household.allowMemberInvites)
			) {
				inviteCode = household.inviteCode;
			}
		}
		const { inviteCode: _withheld, ...rest } = household;
		return {
			household: {
				...rest,
				...(inviteCode === undefined ? {} : { inviteCode }),
			},
			members,
		};
	},
	returns: v.union(
		v.object({
			household: v.object({
				_id: v.id("households"),
				_creationTime: v.number(),
				inviteCode: v.optional(v.string()),
				ownerId: v.optional(v.id("householdMembers")),
				ownerManagesPlans: v.optional(v.boolean()),
				ownerReviewsMeals: v.optional(v.boolean()),
				allowMemberInvites: v.optional(v.boolean()),
			}),
			members: v.array(schema.doc("householdMembers")),
		}),
		v.null(),
	),
});

export const create = mutation({
	args: {
		memberName: v.string(),
		autoNamed: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const memberName = cleanName(args.memberName);
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
		const householdId = await ctx.db.insert("households", { inviteCode });
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
		// Present when joining from an existing kitchen: enforces the
		// one-household rule and carries skips across.
		callerMemberId: v.optional(v.id("householdMembers")),
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
		let carrySkips: SkippedCell[] = [];
		if (args.callerMemberId) {
			const caller = await ctx.db.get("householdMembers", args.callerMemberId);
			if (!caller) throw new Error("Household member not found.");
			await assertCallerMutation(ctx, caller.householdId, caller._id);
			const siblings = await ctx.db
				.query("householdMembers")
				.withIndex("by_household", (q) =>
					q.eq("householdId", caller.householdId),
				)
				.collect();
			if (siblings.length > 1) {
				throw new Error("Leave your current household before joining another.");
			}
			carrySkips = caller.skippedCells ?? [];
		}
		const name = await uniqueMemberName(ctx, household._id, memberName);
		const memberId = await ctx.db.insert("householdMembers", {
			householdId: household._id,
			name,
			...(args.autoNamed === true ? { autoNamed: true as const } : {}),
			...(carrySkips.length > 0 ? { skippedCells: carrySkips } : {}),
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

/**
 * Resolve an invite code for the join landing page, before committing to
 * anything. Public by code possession: anyone holding the code could join
 * and then see the whole household anyway, so the member count reveals
 * nothing new. Callers already inside the household get `already_member`;
 * callers whose own household has other people get `must_leave_first`,
 * mirroring the guard inside `join`.
 */
export const lookupInvite = query({
	args: {
		inviteCode: v.string(),
		callerMemberId: v.optional(v.id("householdMembers")),
	},
	handler: async (ctx, args) => {
		const code = args.inviteCode.trim().toUpperCase();
		if (!code) return { status: "not_found" as const };
		const household = await ctx.db
			.query("households")
			.withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
			.first();
		if (!household) return { status: "not_found" as const };
		const members = await ctx.db
			.query("householdMembers")
			.withIndex("by_household", (q) => q.eq("householdId", household._id))
			.take(50);
		if (
			args.callerMemberId &&
			members.some((member) => member._id === args.callerMemberId)
		) {
			return { status: "already_member" as const, memberCount: members.length };
		}
		if (args.callerMemberId) {
			const caller = await ctx.db.get("householdMembers", args.callerMemberId);
			if (caller) {
				const siblings = await ctx.db
					.query("householdMembers")
					.withIndex("by_household", (q) =>
						q.eq("householdId", caller.householdId),
					)
					.collect();
				if (siblings.length > 1) {
					return {
						status: "must_leave_first" as const,
						memberCount: members.length,
						currentCount: siblings.length,
					};
				}
			}
		}
		return { status: "ok" as const, memberCount: members.length };
	},
	returns: v.union(
		v.object({ status: v.literal("not_found") }),
		v.object({
			status: v.literal("already_member"),
			memberCount: v.number(),
		}),
		v.object({
			status: v.literal("must_leave_first"),
			memberCount: v.number(),
			currentCount: v.number(),
		}),
		v.object({ status: v.literal("ok"), memberCount: v.number() }),
	),
});

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
