import { type UseQueryReturn, useMutation, useQuery } from "convex-svelte";
import { tick } from "svelte";
import { toast } from "svelte-sonner";
import { refKey } from "$lib/stores/households.svelte.js";
import { deviceName, session } from "$lib/stores/session.svelte.js";
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
import type { RosterEntry, RosterState } from "./roster-state.svelte.js";

/**
 * The profile edit session, keyed off the VIEWED household tab: name /
 * household / invite-code / owner-flag / auto-share drafts, skipped-meal
 * drafts with impact preview, validation, and the multi-mutation save.
 * Saving commits the viewed household to the session, so the household
 * active during save stays. Read-only roster data comes from
 * `RosterState`; the session switch itself is delegated to the caller
 * so this class never imports household side-actions.
 *
 * Instantiate per page (`new ProfileEditor(roster, opts)`). Read and
 * assign fields off the instance; pass methods to children wrapped in
 * arrows (`onCancel={() => editor.cancelEditing()}`) so `this` stays
 * bound.
 */
export class ProfileEditor {
	// Viewed tab key; null follows the session household.
	viewedKey = $state<string | null>(null);

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

	// Created in the constructor body (not field initializers):
	// useQuery evaluates its args eagerly, and constructor parameter
	// properties aren't assigned until the constructor body runs.
	private householdQuery!: UseQueryReturn<typeof api.households.get>;
	private skipImpactQuery!: UseQueryReturn<typeof api.households.skipImpact>;

	private static entryKey(entry: RosterEntry): string {
		return refKey({
			householdId: entry.household._id,
			memberId: entry.member._id,
		});
	}

	/** The roster entry under the viewed tab (falls back to session, then first). */
	get viewedEntry(): RosterEntry | null {
		if (this.viewedKey) {
			return (
				this.roster.entries.find(
					(entry) => ProfileEditor.entryKey(entry) === this.viewedKey,
				) ??
				this.roster.activeEntry ??
				(this.roster.entries[0] as RosterEntry | undefined) ??
				null
			);
		}
		return (
			this.roster.activeEntry ??
			(this.roster.entries[0] as RosterEntry | undefined) ??
			null
		);
	}

	get viewedDisplayName(): string {
		return this.viewedEntry?.member.name ?? deviceName();
	}

	get activeHouseholdKey(): string | null {
		const entry = this.roster.activeEntry;
		return entry ? ProfileEditor.entryKey(entry) : null;
	}

	get tabValue(): string {
		const entry = this.viewedEntry;
		return entry ? ProfileEditor.entryKey(entry) : "";
	}

	get viewingSession(): boolean {
		const tab = this.tabValue;
		return tab !== "" && tab === this.activeHouseholdKey;
	}

	get household() {
		return this.householdQuery.data?.household ?? null;
	}
	get members() {
		return this.householdQuery.data?.members ?? [];
	}
	get myId(): string | null {
		return this.viewedEntry?.member._id ?? null;
	}
	get isManager(): boolean {
		const household = this.household;
		const myId = this.myId;
		return household ? !household.ownerId || household.ownerId === myId : false;
	}
	get myMember() {
		return this.members.find((m) => m._id === this.myId) ?? null;
	}
	get householdLoading(): boolean {
		return this.householdQuery.data === undefined;
	}

	// Skipped meals: the viewed member's own opted-out (weekday, slot)
	// cells, edited through the page-level profile edit mode. A null
	// draft means no local edits yet — it initializes from the server
	// state on first toggle, so a slow member load can't clobber it.
	// Saving removes affected meals after confirmation.
	private get savedSkips(): SkippedCell[] {
		return this.myMember?.skippedCells ?? [];
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
			this.ownerManagesPlansDraft ?? this.household?.ownerManagesPlans ?? false
		);
	}
	get pendingOwnerReviewsMeals(): boolean {
		return (
			this.ownerReviewsMealsDraft ?? this.household?.ownerReviewsMeals ?? false
		);
	}
	get pendingAutoShareMeals(): boolean {
		return this.autoShareMealsDraft ?? this.myMember?.autoShareMeals ?? true;
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
		const entry = this.viewedEntry;
		return (
			!this.myNameEdit.trim() ||
			!this.householdNameEdit.trim() ||
			this.inviteCodeError !== "" ||
			!entry ||
			!(
				this.myNameEdit.trim() !== entry.member.name ||
				this.householdNameEdit.trim() !== entry.household.name ||
				this.pendingInviteCode !== entry.household.inviteCode ||
				(this.isManager &&
					this.ownerManagesPlansDraft !== null &&
					this.ownerManagesPlansDraft !==
						(this.household?.ownerManagesPlans ?? false)) ||
				(this.isManager &&
					this.ownerReviewsMealsDraft !== null &&
					this.ownerReviewsMealsDraft !==
						(this.household?.ownerReviewsMeals ?? false)) ||
				(this.autoShareMealsDraft !== null &&
					this.autoShareMealsDraft !==
						(this.myMember?.autoShareMeals ?? true)) ||
				this.skipsDirty
			) ||
			this.impactPending ||
			this.saving
		);
	}

	constructor(
		private roster: RosterState,
		private opts: { onCommitSwitch: (entry: RosterEntry) => void },
	) {
		this.householdQuery = useQuery(api.households.get, () => {
			const entry = this.viewedEntry;
			return entry
				? { householdId: entry.household._id as Id<"households"> }
				: "skip";
		});
		this.skipImpactQuery = useQuery(api.households.skipImpact, () => {
			const entry = this.viewedEntry;
			return entry && this.skipsDirty
				? {
						householdId: entry.household._id as Id<"households">,
						memberId: entry.member._id as Id<"householdMembers">,
						callerMemberId: entry.member._id as Id<"householdMembers">,
						fromDate: todayISO(),
						cells: sortSkippedCells(this.skippedDraft ?? []),
					}
				: "skip";
		});
		// Prefill the rename inputs from the VIEWED household, resetting
		// only when a different entity is shown so typing is never
		// clobbered.
		$effect(() => {
			const member = this.viewedEntry?.member;
			if (member && this.myNameEditKey !== member._id) {
				const house = this.viewedEntry?.household;
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
				this.saving = false;
			}
		});

		$effect(() => {
			const house = this.viewedEntry?.household;
			if (house && this.householdNameEditKey !== house._id) {
				this.householdNameEditKey = house._id;
				this.householdNameEdit = house.name;
				this.inviteCodeEdit = house.inviteCode;
				this.ownerManagesPlansDraft = null;
				this.ownerReviewsMealsDraft = null;
				this.autoShareMealsDraft = null;
				this.editing = false;
				this.saving = false;
			}
		});
	}

	/**
	 * Tab switches only land outside edit mode — unsaved edits would
	 * otherwise be clobbered by the viewed-household prefill.
	 */
	selectViewed(key: string): void {
		if (this.editing) {
			toast.error("Save or cancel your edits first.");
			return;
		}
		this.viewedKey = key;
	}

	followSession(): void {
		this.viewedKey = null;
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
		const entry = this.viewedEntry;
		if (!entry) return false;
		try {
			const result = await this.applySkippedCells({
				householdId: entry.household._id as Id<"households">,
				memberId: entry.member._id as Id<"householdMembers">,
				callerMemberId: entry.member._id as Id<"householdMembers">,
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
		if (!this.viewedEntry) return;
		this.skippedDraft = null;
		this.editing = true;
		await tick();
		this.nameInput?.focus();
		this.nameInput?.select();
	}

	cancelEditing(): void {
		const entry = this.viewedEntry;
		if (entry) {
			this.myNameEdit = entry.member.name;
			this.householdNameEdit = entry.household.name;
			this.inviteCodeEdit = entry.household.inviteCode;
		}
		this.ownerManagesPlansDraft = null;
		this.ownerReviewsMealsDraft = null;
		this.autoShareMealsDraft = null;
		this.skippedDraft = null;
		this.confirmSkipsOpen = false;
		this.editing = false;
	}

	async save(event?: SubmitEvent): Promise<void> {
		event?.preventDefault();
		if (!session.session) return;
		const entry = this.viewedEntry;
		const memberName = this.myNameEdit.trim();
		const householdName = this.householdNameEdit.trim();
		const pendingInviteCode = this.inviteCodeEdit.trim().toUpperCase();
		if (
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
		const baselineOwnerPlans = this.household?.ownerManagesPlans ?? false;
		const pendingOwnerPlans = this.ownerManagesPlansDraft;
		const baselineOwnerReviews = this.household?.ownerReviewsMeals ?? false;
		const pendingOwnerReviews = this.ownerReviewsMealsDraft;
		const baselineAutoShare = this.myMember?.autoShareMeals ?? true;
		const pendingAutoShare = this.autoShareMealsDraft;
		const memberChanged = memberName !== entry.member.name;
		const householdChanged = householdName !== entry.household.name;
		const inviteCodeChanged = pendingInviteCode !== entry.household.inviteCode;
		const ownerPlansChanged =
			this.isManager &&
			pendingOwnerPlans !== null &&
			pendingOwnerPlans !== baselineOwnerPlans;
		const ownerReviewsChanged =
			this.isManager &&
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
			!autoShareChanged
		) {
			this.editing = false;
			return;
		}
		this.saving = true;
		let failed = false;
		const householdId = entry.household._id as Id<"households">;
		const memberId = entry.member._id as Id<"householdMembers">;
		try {
			if (memberChanged) {
				try {
					await this.renameMember({
						householdId,
						memberId,
						name: memberName,
						callerMemberId: memberId,
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
						householdId,
						memberId,
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
						householdId,
						memberId,
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
						householdId,
						callerMemberId: memberId,
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
						householdId,
						callerMemberId: memberId,
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
						householdId,
						memberId,
						callerMemberId: memberId,
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
				// The viewed household becomes the session household, so
				// the household active during save stays.
				if (!this.viewingSession) this.opts.onCommitSwitch(entry);
			}
		} finally {
			this.saving = false;
		}
	}
}
