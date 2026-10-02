import { useMutation } from "convex-svelte";
import { toast } from "svelte-sonner";
import { session } from "$lib/stores/session.svelte.js";
import { errorMessage } from "$lib/utils/errors.js";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel";

/** Minimal entry shape for leaving a household. */
export interface LeaveTarget {
	household: { _id: string };
	member: { _id: string };
}

/**
 * Household membership side-actions for the profile page: linking the
 * member to a sign-in, leaving / joining households, and removing
 * members. Single-household model: joining is only possible while
 * alone, and leaving lands back in a fresh solo kitchen via the
 * provisioning effect. Profile field editing lives in `ProfileEditor`.
 *
 * Instantiate per page (`new HouseholdActions()`).
 */
export class HouseholdActions {
	linkingAccount = $state(false);
	joinCode = $state("");
	joinError = $state("");

	private joinMutation = useMutation(api.householdLifecycle.join);
	private leaveMutation = useMutation(api.householdLifecycle.leave);
	private removeMutation = useMutation(api.householdMembers.removeMember);
	private claimMutation = useMutation(api.householdIdentity.claimHouseholds);

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

	async leaveHousehold(entry: LeaveTarget): Promise<void> {
		try {
			await this.leaveMutation({
				memberId: entry.member._id as Id<"householdMembers">,
			});
			if (session.session?.householdId === entry.household._id) {
				// Back to alone: the provisioning effect spins up a
				// fresh solo kitchen. Portable meals and skips follow
				// the login, so nothing personal is lost.
				session.disconnect();
			}
			toast.success("Left the household");
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't leave the household."));
		}
	}

	async joinHousehold(
		event: SubmitEvent,
		memberName: string,
		autoNamed: boolean,
	): Promise<void> {
		event.preventDefault();
		this.joinError = "";
		try {
			const current = session.session;
			const result = await this.joinMutation({
				inviteCode: this.joinCode,
				memberName,
				// No identity member means the name is the device fallback,
				// safe to replace with the OAuth name later.
				autoNamed,
				...(current
					? {
							callerMemberId: current.memberId as Id<"householdMembers">,
						}
					: {}),
			});
			this.joinCode = "";
			session.connect({
				householdId: result.householdId,
				memberId: result.memberId,
			});
			toast.success("Household joined");
		} catch (error) {
			this.joinError = errorMessage(error, "Couldn't join with that code.");
		}
	}

	async removeMemberRow(
		targetId: string,
		name: string,
		householdId: string,
		callerMemberId: string,
	): Promise<boolean> {
		try {
			const result = await this.removeMutation({
				householdId: householdId as Id<"households">,
				memberId: targetId as Id<"householdMembers">,
				callerMemberId: callerMemberId as Id<"householdMembers">,
			});
			if (result.householdDeleted) {
				if (session.session?.householdId === householdId) {
					session.disconnect();
				}
				toast.success(`Removed ${name} and deleted the household`);
			} else {
				toast.success(`Removed ${name}`);
			}
			return result.householdDeleted;
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't remove the member."));
			return false;
		}
	}
}
