import { useMutation } from "convex-svelte";
import { toast } from "svelte-sonner";
import { errorMessage } from "$lib/errors.js";
import { roster } from "$lib/households.svelte.js";
import { session } from "$lib/session.svelte.js";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel";
import type { RosterEntry, RosterState } from "./roster-state.svelte.js";

/** Minimal entry shape for leaving a household (roster + list-card entries both satisfy it). */
export interface LeaveTarget {
	household: { _id: string; name: string };
	member: { _id: string };
}

/**
 * Household membership side-actions for the profile page: linking the
 * member to a sign-in, switching / leaving / joining / creating
 * households, and removing members. Owns the join/create form state.
 * Profile field editing lives in `ProfileEditor`.
 *
 * Instantiate per page (`new HouseholdActions(roster)`). Pass methods
 * to children wrapped in arrows (`onJoin={(e) => actions.join(e)}`) so
 * `this` stays bound.
 */
export class HouseholdActions {
	linkingAccount = $state(false);
	joinCode = $state("");
	newHouseholdName = $state("");
	joinError = $state("");
	createError = $state("");

	private createMutation = useMutation(api.households.create);
	private joinMutation = useMutation(api.households.join);
	private leaveMutation = useMutation(api.households.leave);
	private removeMutation = useMutation(api.households.removeMember);
	private claimMutation = useMutation(api.households.claimHouseholds);

	constructor(private roster: RosterState) {}

	// One-click recovery for members the roster never saw (e.g. the
	// device roster was wiped): link the active member row directly.
	async linkAccount(): Promise<void> {
		const current = session.session;
		if (!current || this.linkingAccount) return;
		this.linkingAccount = true;
		try {
			const result = await this.claimMutation({
				refs: [
					{
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
					},
				],
			});
			if (!result.signedIn) {
				toast.error("Sign in first, then link this member.");
			} else if (result.claimed > 0 || result.alreadyMine > 0) {
				toast.success("Member linked to your sign-in");
			} else {
				toast.error("This member belongs to a different sign-in.");
			}
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't link this member."));
		} finally {
			this.linkingAccount = false;
		}
	}

	switchHousehold(entry: RosterEntry | LeaveTarget): void {
		roster.switchTo({
			householdId: entry.household._id,
			memberId: entry.member._id,
		});
		toast.success(`Switched to ${entry.household.name}`);
	}

	async leaveHousehold(entry: LeaveTarget): Promise<void> {
		try {
			await this.leaveMutation({
				memberId: entry.member._id as Id<"householdMembers">,
			});
			roster.forget(entry.household._id);
			toast.success(`Left ${entry.household.name}`);
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't leave the household."));
		}
	}

	async joinHousehold(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		this.joinError = "";
		try {
			const result = await this.joinMutation({
				inviteCode: this.joinCode,
				memberName: this.roster.myName,
				// No active entry means myName is the device fallback,
				// safe to replace with the OAuth name later.
				autoNamed: !this.roster.activeEntry,
			});
			this.joinCode = "";
			roster.switchTo({
				householdId: result.householdId,
				memberId: result.memberId,
			});
			toast.success("Household joined");
		} catch (error) {
			this.joinError = errorMessage(error, "Couldn't join with that code.");
		}
	}

	async createHousehold(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		this.createError = "";
		const name = this.newHouseholdName.trim();
		if (!name) return;
		try {
			const result = await this.createMutation({
				householdName: name,
				memberName: this.roster.myName,
				autoNamed: !this.roster.activeEntry,
			});
			this.newHouseholdName = "";
			roster.switchTo({
				householdId: result.householdId,
				memberId: result.memberId,
			});
			toast.success(`Created ${name}`);
		} catch (error) {
			this.createError = errorMessage(error, "Couldn't create the household.");
		}
	}

	async removeMemberRow(targetId: string, name: string): Promise<void> {
		const current = session.session;
		if (!current) return;
		try {
			const result = await this.removeMutation({
				householdId: current.householdId as Id<"households">,
				memberId: targetId as Id<"householdMembers">,
				callerMemberId: current.memberId as Id<"householdMembers">,
			});
			if (result.householdDeleted) {
				roster.forget(current.householdId);
				toast.success(`Removed ${name} and deleted the household`);
			} else {
				toast.success(`Removed ${name}`);
			}
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't remove the member."));
		}
	}
}
