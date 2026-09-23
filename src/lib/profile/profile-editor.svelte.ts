import { useMutation, useQuery } from "convex-svelte";
import { tick } from "svelte";
import { toast } from "svelte-sonner";
import { refKey } from "$lib/stores/households.svelte.js";
import { session } from "$lib/stores/session.svelte.js";
import { todayISO } from "$lib/utils/dates.js";
import { errorMessage } from "$lib/utils/errors.js";
import { MEAL_TYPES, type MealType } from "$lib/utils/meal-types.js";
import {
	SKIPPED_WEEKDAYS,
	type SkippedCell,
	type SkippedDay,
	sameSkippedCells,
	skippedCellSet,
	skippedKey,
	sortSkippedCells,
} from "$lib/utils/skipped.js";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel";
import { CUSTOM_INVITE_CODE_PATTERN } from "./profile-utils.js";
import type { RosterState } from "./roster-state.svelte.js";

/**
 * The profile edit session: name / household / invite-code / owner-flag
 * / auto-share drafts, skipped-meal drafts with impact preview,
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
	confirmSkipsOpen = $state(false);
	pendingHouseholdKey = $state<string | null>(null);

	private myNameEditKey = $state<string | null>(null);
	private householdNameEditKey = $state<string | null>(null);
	private skippedDraft = $state<SkippedCell[] | null>(null);

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
	private applySkippedCells = useMutation(api.households.applySkippedCells);

	private skipImpactQuery = useQuery(api.households.skipImpact, () =>
		session.session && this.skipsDirty
			? {
					householdId: session.session.householdId as Id<"households">,
					memberId: session.session.memberId as Id<"householdMembers">,
					callerMemberId: session.session.memberId as Id<"householdMembers">,
					fromDate: todayISO(),
					cells: sortSkippedCells(this.skippedDraft ?? []),
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

	// Skipped meals: the member's own opted-out (weekday, slot)
	// cells, edited through the page-level profile edit mode. A null
	// draft means no local edits yet — it initializes from the server
	// state on first toggle, so a slow member load can't clobber it.
	// Saving removes affected meals after confirmation.
	private get savedSkips(): SkippedCell[] {
		return this.roster.myMember?.skippedCells ?? [];
	}
	private get shownSkips(): SkippedCell[] {
		return this.editing
			? (this.skippedDraft ?? this.savedSkips)
			: this.savedSkips;
	}
	get shownSkipsSet(): Set<string> {
		return skippedCellSet(this.shownSkips);
	}
	get skipsDirty(): boolean {
		return (
			this.editing &&
			this.skippedDraft !== null &&
			!sameSkippedCells(this.skippedDraft, this.savedSkips)
		);
	}

	get impactMeals(): number {
		return this.skipImpactQuery.data?.meals ?? 0;
	}
	get impactPending(): boolean {
		return (
			this.skipsDirty &&
			this.skipImpactQuery.data === undefined &&
			!this.skipImpactQuery.error
		);
	}
	get impactError(): boolean {
		return Boolean(this.skipImpactQuery.error);
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
				this.skipsDirty ||
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

	private draftCells(): SkippedCell[] {
		return (this.skippedDraft ?? this.savedSkips).map((cell) => ({
			...cell,
		}));
	}

	setCells(cells: SkippedCell[], skipped: boolean): void {
		const keys = new Set(cells.map((cell) => skippedKey(cell.day, cell.slot)));
		const kept = this.draftCells().filter(
			(cell) => !keys.has(skippedKey(cell.day, cell.slot)),
		);
		this.skippedDraft = skipped ? [...kept, ...cells] : kept;
	}

	setSlotSkipped(slot: MealType, skipped: boolean): void {
		this.setCells(
			SKIPPED_WEEKDAYS.map((row) => ({ day: row.day, slot })),
			skipped,
		);
	}

	setDaySkipped(day: SkippedDay, skipped: boolean): void {
		this.setCells(
			MEAL_TYPES.map((type) => ({ day, slot: type.id })),
			skipped,
		);
	}

	slotSkippedCount(slot: MealType): number {
		return SKIPPED_WEEKDAYS.filter((row) =>
			this.shownSkipsSet.has(skippedKey(row.day, slot)),
		).length;
	}

	daySkippedCount(day: SkippedDay): number {
		return MEAL_TYPES.filter((type) =>
			this.shownSkipsSet.has(skippedKey(day, type.id)),
		).length;
	}

	private async requestSaveSkips(): Promise<void> {
		if (!this.skipsDirty) return;
		if (this.impactMeals > 0 && !this.confirmSkipsOpen) {
			this.confirmSkipsOpen = true;
			return;
		}
		await this.saveSkips();
	}

	private async saveSkips(): Promise<boolean> {
		const current = session.session;
		if (!current) return false;
		try {
			const result = await this.applySkippedCells({
				householdId: current.householdId as Id<"households">,
				memberId: current.memberId as Id<"householdMembers">,
				callerMemberId: current.memberId as Id<"householdMembers">,
				fromDate: todayISO(),
				cells: sortSkippedCells(this.skippedDraft ?? []),
			});
			this.confirmSkipsOpen = false;
			this.skippedDraft = null;
			toast.success(
				result.meals > 0
					? `Skipped meals saved — removed ${result.meals} ${result.meals === 1 ? "meal" : "meals"}`
					: "Skipped meals saved",
			);
			return true;
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't save skipped meals."));
			return false;
		}
	}

	async startEditing(): Promise<void> {
		if (!this.roster.activeEntry) return;
		this.skippedDraft = null;
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
		this.skippedDraft = null;
		this.confirmSkipsOpen = false;
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
		// Skipped-meals confirm first: nothing else saves until the user
		// confirms the remove (or there is nothing to confirm). The
		// confirm dialog re-enters here with the dialog already open.
		if (this.skipsDirty) {
			await this.requestSaveSkips();
			if (this.confirmSkipsOpen || this.skipsDirty) return;
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
