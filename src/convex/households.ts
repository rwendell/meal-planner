import { v } from "convex/values";
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

export const leave = mutation({
	args: { memberId: v.id("householdMembers") },
	handler: async (ctx, args) => {
		const member = await ctx.db.get("householdMembers", args.memberId);
		if (!member) return { householdDeleted: false };
		const days = await ctx.db
			.query("weekDays")
			.withIndex("by_member", (q) => q.eq("memberId", args.memberId))
			.collect();
		for (const day of days) {
			await ctx.db.delete("weekDays", day._id);
		}
		await ctx.db.delete("householdMembers", args.memberId);
		const remaining = await ctx.db
			.query("householdMembers")
			.withIndex("by_household", (q) => q.eq("householdId", member.householdId))
			.take(1);
		if (remaining.length > 0) return { householdDeleted: false };
		const meals = await ctx.db
			.query("meals")
			.withIndex("by_household", (q) => q.eq("householdId", member.householdId))
			.collect();
		for (const meal of meals) {
			await ctx.db.delete("meals", meal._id);
		}
		const checks = await ctx.db
			.query("shoppingItems")
			.withIndex("by_household", (q) => q.eq("householdId", member.householdId))
			.collect();
		for (const check of checks) {
			await ctx.db.delete("shoppingItems", check._id);
		}
		const published = await ctx.db
			.query("publishedRecipes")
			.withIndex("by_household", (q) =>
				q.eq("sourceHouseholdId", member.householdId),
			)
			.collect();
		for (const recipe of published) {
			await ctx.db.delete("publishedRecipes", recipe._id);
		}
		await ctx.db.delete("households", member.householdId);
		return { householdDeleted: true };
	},
	returns: v.object({ householdDeleted: v.boolean() }),
});
