import { useMutation, useQuery } from "convex-svelte";
import { tick } from "svelte";
import { toast } from "svelte-sonner";
import { todayISO } from "$lib/dates.js";
import { errorMessage } from "$lib/errors.js";
import {
	EXCLUSION_WEEKDAYS,
	type ExcludedCell,
	excludedCellSet,
	exclusionKey,
	sameExcludedCells,
	sortExcludedCells,
} from "$lib/exclusions.js";
import { refKey } from "$lib/households.svelte.js";
import type { MealType } from "$lib/meal-types.js";
import { session } from "$lib/session.svelte.js";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel";
import { CUSTOM_INVITE_CODE_PATTERN } from "./profile-utils.js";
import type { RosterState } from "./roster-state.svelte.js";

/**
 * The profile edit session: name / household / invite-code / owner-flag
 * / auto-share drafts, planner-exclusion drafts with impact preview,
 * staged household switching, validation, and the multi-mutation save.
 * Read-only roster data comes from `RosterState`; committing a staged
 * switch is delegated to the caller so this class never imports
 * household side-actions.
 *
 * Instantiate per page (`new ProfileEditor(roster, opts)`). Read and
 * assign fields off the instance; pass methods to children wrapped in
 * arrows (`onCancel={() => editor.cancel()}`) so `this` stays bound.
 */
export class ProfileEditor {
	editing = $state(false);
	saving = $state(false);
	myNameEdit = $state("");
	householdNameEdit = $state("");
	inviteCodeEdit = $state("");
	ownerManagesPlansDraft = $state<boolean | null>(null);
	ownerReviewsMealsDraft = $state<boolean | null>(null);
	autoShareMealsDraft = $state<boolean | null>(null);
	nameInput = $state<HTMLInputElement | null>(null);
	confirmExclusionsOpen = $state(false);
	pendingHouseholdKey = $state<string | null>(null);

	private myNameEditKey = $state<string | null>(null);
	private householdNameEditKey = $state<string | null>(null);
	private exclusionDraft = $state<ExcludedCell[] | null>(null);

	private renameHousehold = useMutation(api.households.renameHousehold);
	private setInviteCode = useMutation(api.households.setInviteCode);
	private setOwnerManagesPlans = useMutation(
		api.households.setOwnerManagesPlans,
	);
	private setOwnerReviewsMeals = useMutation(
		api.households.setOwnerReviewsMeals,
	);
	private setAutoShareMeals = useMutation(api.households.setMemberAutoShare);
	private renameMember = useMutation(api.households.renameMember);
	private applyPlannerExclusions = useMutation(
		api.households.applyPlannerExclusions,
	);

	private exclusionImpactQuery = useQuery(api.households.exclusionImpact, () =>
		session.session && this.exclusionsDirty
			? {
					householdId: session.session.householdId as Id<"households">,
					memberId: session.session.memberId as Id<"householdMembers">,
					callerMemberId: session.session.memberId as Id<"householdMembers">,
					fromDate: todayISO(),
					cells: sortExcludedCells(this.exclusionDraft ?? []),
				}
			: "skip",
	);

	// Staged household switch: picking a card in edit mode only records
	// the choice; the switch commits when profile edits save.
	get activeHouseholdKey(): string | null {
		const entry = this.roster.activeEntry;
		return entry
			? refKey({
					householdId: entry.household._id,
					memberId: entry.member._id,
				})
			: null;
	}
	private get householdSwitchPending(): boolean {
		return (
			this.pendingHouseholdKey !== null &&
			this.pendingHouseholdKey !== this.activeHouseholdKey
		);
	}
	private get switchTarget() {
		if (!this.householdSwitchPending || !this.pendingHouseholdKey) {
			return null;
		}
		return (
			this.roster.entries.find(
				(entry) =>
					refKey({
						householdId: entry.household._id,
						memberId: entry.member._id,
					}) === this.pendingHouseholdKey,
			) ?? null
		);
	}

	// Planner exclusions: the member's own opted-out (weekday, slot)
	// cells, edited through the page-level profile edit mode. A null
	// draft means no local edits yet — it initializes from the server
	// state on first toggle, so a slow member load can't clobber it.
	// Saving removes affected meals after confirmation.
	private get savedExclusions(): ExcludedCell[] {
		return this.roster.myMember?.excludedCells ?? [];
	}
	private get shownExclusions(): ExcludedCell[] {
		return this.editing
			? (this.exclusionDraft ?? this.savedExclusions)
			: this.savedExclusions;
	}
	get shownExclusionSet(): Set<string> {
		return excludedCellSet(this.shownExclusions);
	}
	get exclusionsDirty(): boolean {
		return (
			this.editing &&
			this.exclusionDraft !== null &&
			!sameExcludedCells(this.exclusionDraft, this.savedExclusions)
		);
	}

	get impactMeals(): number {
		return this.exclusionImpactQuery.data?.meals ?? 0;
	}
	get impactPending(): boolean {
		return (
			this.exclusionsDirty &&
			this.exclusionImpactQuery.data === undefined &&
			!this.exclusionImpactQuery.error
		);
	}
	get impactError(): boolean {
		return Boolean(this.exclusionImpactQuery.error);
	}

	get pendingOwnerManagesPlans(): boolean {
		return (
			this.ownerManagesPlansDraft ??
			this.roster.household?.ownerManagesPlans ??
			false
		);
	}
	get pendingOwnerReviewsMeals(): boolean {
		return (
			this.ownerReviewsMealsDraft ??
			this.roster.household?.ownerReviewsMeals ??
			false
		);
	}
	get pendingAutoShareMeals(): boolean {
		return (
			this.autoShareMealsDraft ?? this.roster.myMember?.autoShareMeals ?? true
		);
	}
	private pendingInviteCode = $derived(
		this.inviteCodeEdit.trim().toUpperCase(),
	);
	inviteCodeError = $derived(
		!this.pendingInviteCode
			? "Invite code is required."
			: !CUSTOM_INVITE_CODE_PATTERN.test(this.pendingInviteCode)
				? "Use exactly 6 letters or digits."
				: "",
	);
	get saveDisabled(): boolean {
		return (
			!this.myNameEdit.trim() ||
			!this.householdNameEdit.trim() ||
			this.inviteCodeError !== "" ||
			!this.roster.activeEntry ||
			!(
				this.myNameEdit.trim() !== this.roster.activeEntry.member.name ||
				this.householdNameEdit.trim() !==
					this.roster.activeEntry.household.name ||
				this.pendingInviteCode !==
					this.roster.activeEntry.household.inviteCode ||
				(this.roster.isManager &&
					this.ownerManagesPlansDraft !== null &&
					this.ownerManagesPlansDraft !==
						(this.roster.household?.ownerManagesPlans ?? false)) ||
				(this.roster.isManager &&
					this.ownerReviewsMealsDraft !== null &&
					this.ownerReviewsMealsDraft !==
						(this.roster.household?.ownerReviewsMeals ?? false)) ||
				(this.autoShareMealsDraft !== null &&
					this.autoShareMealsDraft !==
						(this.roster.myMember?.autoShareMeals ?? true)) ||
				this.exclusionsDirty ||
				this.householdSwitchPending
			) ||
			this.impactPending ||
			this.saving
		);
	}

	constructor(
		private roster: RosterState,
		private opts: {
			onCommitSwitch: (entry: {
				household: { _id: string; name: string };
				member: { _id: string };
			}) => void;
		},
	) {
		// Prefill the rename inputs from loaded data, resetting only when a
		// different entity is shown so typing is never clobbered.
		$effect(() => {
			const member = this.roster.activeEntry?.member;
			if (member && this.myNameEditKey !== member._id) {
				const house = this.roster.activeEntry?.household;
				this.myNameEditKey = member._id;
				this.myNameEdit = member.name;
				if (house) {
					this.householdNameEditKey = house._id;
					this.householdNameEdit = house.name;
					this.inviteCodeEdit = house.inviteCode;
					this.ownerManagesPlansDraft = null;
					this.ownerReviewsMealsDraft = null;
					this.autoShareMealsDraft = null;
				}
				this.editing = false;
				this.pendingHouseholdKey = null;
				this.saving = false;
			}
		});

		$effect(() => {
			const house = this.roster.activeEntry?.household;
			if (house && this.householdNameEditKey !== house._id) {
				this.householdNameEditKey = house._id;
				this.householdNameEdit = house.name;
				this.inviteCodeEdit = house.inviteCode;
				this.ownerManagesPlansDraft = null;
				this.ownerReviewsMealsDraft = null;
				this.autoShareMealsDraft = null;
				this.editing = false;
				this.pendingHouseholdKey = null;
				this.saving = false;
			}
		});
	}

	selectHousehold(key: string): void {
		this.pendingHouseholdKey = this.pendingHouseholdKey === key ? null : key;
	}

	private draftCells(): ExcludedCell[] {
		return (this.exclusionDraft ?? this.savedExclusions).map((cell) => ({
			...cell,
		}));
	}

	setCells(cells: ExcludedCell[], excluded: boolean): void {
		const keys = new Set(
			cells.map((cell) => exclusionKey(cell.day, cell.slot)),
		);
		const kept = this.draftCells().filter(
			(cell) => !keys.has(exclusionKey(cell.day, cell.slot)),
		);
		this.exclusionDraft = excluded ? [...kept, ...cells] : kept;
	}

	setSlotExcluded(slot: MealType, excluded: boolean): void {
		this.setCells(
			EXCLUSION_WEEKDAYS.map((row) => ({ day: row.day, slot })),
			excluded,
		);
	}

	slotExcludedCount(slot: MealType): number {
		return EXCLUSION_WEEKDAYS.filter((row) =>
			this.shownExclusionSet.has(exclusionKey(row.day, slot)),
		).length;
	}

	private async requestSaveExclusions(): Promise<void> {
		if (!this.exclusionsDirty) return;
		if (this.impactMeals > 0 && !this.confirmExclusionsOpen) {
			this.confirmExclusionsOpen = true;
			return;
		}
		await this.saveExclusions();
	}

	private async saveExclusions(): Promise<boolean> {
		const current = session.session;
		if (!current) return false;
		try {
			const result = await this.applyPlannerExclusions({
				householdId: current.householdId as Id<"households">,
				memberId: current.memberId as Id<"householdMembers">,
				callerMemberId: current.memberId as Id<"householdMembers">,
				fromDate: todayISO(),
				cells: sortExcludedCells(this.exclusionDraft ?? []),
			});
			this.confirmExclusionsOpen = false;
			this.exclusionDraft = null;
			toast.success(
				result.meals > 0
					? `Exclusions saved — removed ${result.meals} ${result.meals === 1 ? "meal" : "meals"}`
					: "Exclusions saved",
			);
			return true;
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't save exclusions."));
			return false;
		}
	}

	async startEditing(): Promise<void> {
		if (!this.roster.activeEntry) return;
		this.exclusionDraft = null;
		this.pendingHouseholdKey = null;
		this.editing = true;
		await tick();
		this.nameInput?.focus();
		this.nameInput?.select();
	}

	cancelEditing(): void {
		if (this.roster.activeEntry) {
			this.myNameEdit = this.roster.activeEntry.member.name;
			this.householdNameEdit = this.roster.activeEntry.household.name;
			this.inviteCodeEdit = this.roster.activeEntry.household.inviteCode;
		}
		this.ownerManagesPlansDraft = null;
		this.ownerReviewsMealsDraft = null;
		this.autoShareMealsDraft = null;
		this.exclusionDraft = null;
		this.confirmExclusionsOpen = false;
		this.pendingHouseholdKey = null;
		this.editing = false;
	}

	async save(event?: SubmitEvent): Promise<void> {
		event?.preventDefault();
		const current = session.session;
		const entry = this.roster.activeEntry;
		const memberName = this.myNameEdit.trim();
		const householdName = this.householdNameEdit.trim();
		const pendingInviteCode = this.inviteCodeEdit.trim().toUpperCase();
		if (
			!current ||
			!entry ||
			!this.editing ||
			this.saving ||
			!memberName ||
			!householdName ||
			!pendingInviteCode
		) {
			return;
		}
		if (!CUSTOM_INVITE_CODE_PATTERN.test(pendingInviteCode)) {
			toast.error("Use exactly 6 letters or digits.");
			return;
		}
		// Exclusions confirm first: nothing else saves until the user
		// confirms the remove (or there is nothing to confirm). The
		// confirm dialog re-enters here with the dialog already open.
		if (this.exclusionsDirty) {
			await this.requestSaveExclusions();
			if (this.confirmExclusionsOpen || this.exclusionsDirty) return;
		}
		const baselineOwnerPlans =
			this.roster.household?.ownerManagesPlans ?? false;
		const pendingOwnerPlans = this.ownerManagesPlansDraft;
		const baselineOwnerReviews =
			this.roster.household?.ownerReviewsMeals ?? false;
		const pendingOwnerReviews = this.ownerReviewsMealsDraft;
		const baselineAutoShare = this.roster.myMember?.autoShareMeals ?? true;
		const pendingAutoShare = this.autoShareMealsDraft;
		const memberChanged = memberName !== entry.member.name;
		const householdChanged = householdName !== entry.household.name;
		const inviteCodeChanged = pendingInviteCode !== entry.household.inviteCode;
		const ownerPlansChanged =
			this.roster.isManager &&
			pendingOwnerPlans !== null &&
			pendingOwnerPlans !== baselineOwnerPlans;
		const ownerReviewsChanged =
			this.roster.isManager &&
			pendingOwnerReviews !== null &&
			pendingOwnerReviews !== baselineOwnerReviews;
		const autoShareChanged =
			pendingAutoShare !== null && pendingAutoShare !== baselineAutoShare;
		if (
			!memberChanged &&
			!householdChanged &&
			!inviteCodeChanged &&
			!ownerPlansChanged &&
			!ownerReviewsChanged &&
			!autoShareChanged &&
			!this.switchTarget
		) {
			this.editing = false;
			this.pendingHouseholdKey = null;
			return;
		}
		this.saving = true;
		let failed = false;
		try {
			if (memberChanged) {
				try {
					await this.renameMember({
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
						name: memberName,
						callerMemberId: current.memberId as Id<"householdMembers">,
					});
					toast.success("Name updated");
				} catch (error) {
					failed = true;
					toast.error(errorMessage(error, "Couldn't update your name."));
				}
			}
			if (householdChanged) {
				try {
					await this.renameHousehold({
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
						name: householdName,
					});
					toast.success("Household name updated");
				} catch (error) {
					failed = true;
					toast.error(
						errorMessage(error, "Couldn't update the household name."),
					);
				}
			}
			if (inviteCodeChanged) {
				try {
					await this.setInviteCode({
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
						inviteCode: pendingInviteCode,
					});
					toast.success("Invite code updated");
				} catch (error) {
					failed = true;
					toast.error(errorMessage(error, "Couldn't update the invite code."));
				}
			}
			if (ownerPlansChanged) {
				try {
					await this.setOwnerManagesPlans({
						householdId: current.householdId as Id<"households">,
						callerMemberId: current.memberId as Id<"householdMembers">,
						enabled: pendingOwnerPlans,
					});
					toast.success(
						pendingOwnerPlans
							? "Owner planning turned on"
							: "Owner planning turned off",
					);
				} catch (error) {
					failed = true;
					toast.error(errorMessage(error, "Couldn't update the setting."));
				}
			}
			if (ownerReviewsChanged) {
				try {
					await this.setOwnerReviewsMeals({
						householdId: current.householdId as Id<"households">,
						callerMemberId: current.memberId as Id<"householdMembers">,
						enabled: pendingOwnerReviews,
					});
					toast.success(
						pendingOwnerReviews
							? "Owner reviews everyone's leftovers"
							: "Leftover reviews are per-member again",
					);
				} catch (error) {
					failed = true;
					toast.error(errorMessage(error, "Couldn't update the setting."));
				}
			}
			if (autoShareChanged) {
				try {
					await this.setAutoShareMeals({
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
						callerMemberId: current.memberId as Id<"householdMembers">,
						enabled: pendingAutoShare,
					});
					toast.success(
						pendingAutoShare
							? "Meals you add will be shared publicly"
							: "Meals you add will stay private",
					);
				} catch (error) {
					failed = true;
					toast.error(errorMessage(error, "Couldn't update the setting."));
				}
			}
			if (!failed) {
				this.ownerManagesPlansDraft = null;
				this.ownerReviewsMealsDraft = null;
				this.autoShareMealsDraft = null;
				this.editing = false;
				this.pendingHouseholdKey = null;
				// Staged switch commits last: server saves above ran
				// against the previous household on purpose.
				if (this.switchTarget) this.opts.onCommitSwitch(this.switchTarget);
			}
		} finally {
			this.saving = false;
		}
	}
}
