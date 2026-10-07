import { type UseQueryReturn, useMutation, useQuery } from "convex-svelte";
import { toast } from "svelte-sonner";
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

/**
 * The profile edit session for the session household: name /
 * household / invite-code / owner-flag / auto-share drafts, skipped-meal
 * drafts with impact preview, validation, and the multi-mutation save.
 * Single household per user: no tabs, no viewed-vs-session split.
 *
 * Instantiate per page (`new ProfileEditor()`). Read and assign fields
 * off the instance; pass methods to children wrapped in arrows
 * (`onCancel={() => editor.cancelEditing()}`) so `this` stays bound.
 */
/** Minimal session entry (the only household there is). */
interface SessionEntry {
	household: { _id: string; inviteCode?: string };
	member: { _id: string; name: string };
}

export class ProfileEditor {
	saving = $state(false);
	myNameEdit = $state("");
	ownerManagesPlansDraft = $state<boolean | null>(null);
	ownerReviewsMealsDraft = $state<boolean | null>(null);
	allowMemberInvitesDraft = $state<boolean | null>(null);
	autoShareMealsDraft = $state<boolean | null>(null);

	private myNameEditKey = $state<string | null>(null);
	private viewedHouseholdKey = $state<string | null>(null);
	private skippedDraft = $state<SkippedCell[] | null>(null);
	private skipSaveTimer: ReturnType<typeof setTimeout> | undefined;

	private setOwnerManagesPlans = useMutation(
		api.householdOwner.setOwnerManagesPlans,
	);
	private setOwnerReviewsMeals = useMutation(
		api.householdOwner.setOwnerReviewsMeals,
	);
	private setAllowMemberInvites = useMutation(
		api.householdOwner.setAllowMemberInvites,
	);
	private setAutoShareMeals = useMutation(
		api.householdMembers.setMemberAutoShare,
	);
	private renameMember = useMutation(api.householdMembers.renameMember);
	private applySkippedCells = useMutation(api.householdSkips.applySkippedCells);

	// Created in the constructor body (not field initializers):
	// useQuery evaluates its args eagerly, and constructor parameter
	// properties aren't assigned until the constructor body runs.
	private householdQuery!: UseQueryReturn<typeof api.householdLifecycle.get>;

	/** The session household + member, or null when signed out. */
	get viewedEntry(): SessionEntry | null {
		const current = session.session;
		const household = this.householdQuery.data?.household ?? null;
		if (!current || !household) return null;
		const member = (this.householdQuery.data?.members ?? []).find(
			(m) => m._id === current.memberId,
		);
		if (!member) return null;
		return {
			household: {
				_id: household._id,
				inviteCode: household.inviteCode ?? undefined,
			},
			member: { _id: member._id, name: member.name },
		};
	}

	get identityEntry(): SessionEntry | null {
		return this.viewedEntry;
	}
	get identityDisplayName(): string {
		return this.identityEntry?.member.name ?? deviceName();
	}
	get identityHousehold() {
		return this.householdQuery.data?.household ?? null;
	}
	get identityMembers() {
		return this.householdQuery.data?.members ?? [];
	}
	get identityMember() {
		return (
			this.identityMembers.find((m) => m._id === session.session?.memberId) ??
			null
		);
	}
	get identityLoading(): boolean {
		return this.householdQuery.data === undefined;
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
	get isOwner(): boolean {
		const household = this.household;
		const myId = this.myId;
		return !!household?.ownerId && !!myId && household.ownerId === myId;
	}
	get householdLoading(): boolean {
		return this.householdQuery.data === undefined;
	}

	// Skipped meals: the viewed member's own opted-out (weekday, slot)
	// cells, edited through the page-level profile edit mode. A null
	// draft means no local edits yet — it initializes from the server
	// state on first toggle, so a slow member load can't clobber it.
	// Drafts persist via the debounced autosave, or a manual Save.
	private get savedSkips(): SkippedCell[] {
		return this.identityMember?.skippedCells ?? [];
	}
	private get shownSkips(): SkippedCell[] {
		return this.skippedDraft ?? this.savedSkips;
	}
	get shownSkipsSet(): Set<string> {
		return skippedCellSet(this.shownSkips);
	}
	get skipsDirty(): boolean {
		return (
			this.skippedDraft !== null &&
			!sameSkippedCells(this.skippedDraft, this.savedSkips)
		);
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
	get pendingAllowMemberInvites(): boolean {
		return (
			this.allowMemberInvitesDraft ??
			this.household?.allowMemberInvites ??
			false
		);
	}
	get pendingAutoShareMeals(): boolean {
		return (
			this.autoShareMealsDraft ?? this.identityMember?.autoShareMeals ?? true
		);
	}
	/**
	 * Anything differing from the server: drives the Save button state,
	 * the dirty-guard on navigation, and the auto-commit on leave.
	 */
	get hasUnsavedChanges(): boolean {
		const identity = this.identityEntry;
		const viewed = this.viewedEntry;
		if (!identity || !viewed) return false;
		return (
			this.myNameEdit.trim() !== identity.member.name ||
			(this.isOwner &&
				this.ownerManagesPlansDraft !== null &&
				this.ownerManagesPlansDraft !==
					(this.household?.ownerManagesPlans ?? false)) ||
			(this.isOwner &&
				this.ownerReviewsMealsDraft !== null &&
				this.ownerReviewsMealsDraft !==
					(this.household?.ownerReviewsMeals ?? false)) ||
			(this.isOwner &&
				this.allowMemberInvitesDraft !== null &&
				this.allowMemberInvitesDraft !==
					(this.household?.allowMemberInvites ?? false)) ||
			(this.autoShareMealsDraft !== null &&
				this.autoShareMealsDraft !==
					(this.identityMember?.autoShareMeals ?? true)) ||
			this.skipsDirty
		);
	}
	get saveDisabled(): boolean {
		return !this.myNameEdit.trim() || !this.hasUnsavedChanges || this.saving;
	}

	constructor() {
		this.householdQuery = useQuery(api.householdLifecycle.get, () => {
			const current = session.session;
			return current
				? {
						householdId: current.householdId as Id<"households">,
						callerMemberId: current.memberId as Id<"householdMembers">,
					}
				: "skip";
		});
		// Prefill the identity inputs (your name, auto-share) from the
		// session member, resetting only when a different member is shown
		// so typing is never clobbered.
		$effect(() => {
			const member = this.identityEntry?.member;
			if (member && this.myNameEditKey !== member._id) {
				this.myNameEditKey = member._id;
				this.myNameEdit = member.name;
				this.autoShareMealsDraft = null;
				this.saving = false;
			}
		});

		// Reset the household drafts when a different household is viewed
		// (or when the first one loads), same rule as the identity block
		// above.
		$effect(() => {
			const house = this.viewedEntry?.household;
			if (house && this.viewedHouseholdKey !== house._id) {
				this.viewedHouseholdKey = house._id;
				this.ownerManagesPlansDraft = null;
				this.ownerReviewsMealsDraft = null;
				// Was missing here, so the draft outlived a household switch
				// and hasUnsavedChanges compared a stale value against the
				// new household. Only cancelEditing() cleared it.
				this.allowMemberInvitesDraft = null;
				this.saving = false;
			}
		});

		// Skips apply themselves shortly after the user stops tapping.
		// With hide-instead-of-remove semantics nothing destructive can
		// happen, so there is no confirm step: interaction settling is the
		// commit signal, which is loss-of-focus behavior without tracking
		// focus. Each tap replaces the draft (new array identity), so the
		// timer restarts until the user pauses.
		$effect(() => {
			const draft = this.skippedDraft;
			if (!draft || this.saving) return;
			this.skipSaveTimer = setTimeout(() => {
				this.skipSaveTimer = undefined;
				// Read fresh: a manual Save may have flushed it meanwhile.
				if (this.skippedDraft) void this.saveSkips();
			}, 700);
			return () => clearTimeout(this.skipSaveTimer);
		});
	}

	/** Cancel a pending skips autosave (a manual Save flushes instead). */
	private clearSkipAutosave(): void {
		clearTimeout(this.skipSaveTimer);
		this.skipSaveTimer = undefined;
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

	private async saveSkips(): Promise<boolean> {
		const current = session.session;
		if (!current) return false;
		try {
			await this.applySkippedCells({
				householdId: current.householdId as Id<"households">,
				memberId: current.memberId as Id<"householdMembers">,
				callerMemberId: current.memberId as Id<"householdMembers">,
				fromDate: todayISO(),
				cells: sortSkippedCells(this.skippedDraft ?? []),
			});
			this.skippedDraft = null;
			toast.success("Skipped meals saved");
			return true;
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't save skipped meals."));
			return false;
		}
	}

	cancelEditing(): void {
		const identity = this.identityEntry;
		if (identity) {
			this.myNameEdit = identity.member.name;
		}
		const viewed = this.viewedEntry;
		if (viewed) {
		}
		this.ownerManagesPlansDraft = null;
		this.ownerReviewsMealsDraft = null;
		this.allowMemberInvitesDraft = null;
		this.autoShareMealsDraft = null;
		this.skippedDraft = null;
		this.clearSkipAutosave();
	}

	async save(event?: SubmitEvent): Promise<void> {
		event?.preventDefault();
		const current = session.session;
		if (!current) return;
		const entry = this.viewedEntry;
		const identity = this.identityEntry;
		const memberName = this.myNameEdit.trim();
		if (!entry || !identity || this.saving || !memberName) {
			return;
		}
		// Skips flush first so a manual Save never races the autosave
		// timer: clearing it makes the pending fire a no-op.
		if (this.skipsDirty) {
			this.clearSkipAutosave();
			await this.saveSkips();
			if (this.skipsDirty) return;
		}
		const baselineOwnerPlans = this.household?.ownerManagesPlans ?? false;
		const pendingOwnerPlans = this.ownerManagesPlansDraft;
		const baselineOwnerReviews = this.household?.ownerReviewsMeals ?? false;
		const pendingOwnerReviews = this.ownerReviewsMealsDraft;
		const baselineAllowInvites = this.household?.allowMemberInvites ?? false;
		const pendingAllowInvites = this.allowMemberInvitesDraft;
		const baselineAutoShare = this.identityMember?.autoShareMeals ?? true;
		const pendingAutoShare = this.autoShareMealsDraft;
		const memberChanged = memberName !== identity.member.name;
		const ownerPlansChanged =
			this.isOwner &&
			pendingOwnerPlans !== null &&
			pendingOwnerPlans !== baselineOwnerPlans;
		const ownerReviewsChanged =
			this.isOwner &&
			pendingOwnerReviews !== null &&
			pendingOwnerReviews !== baselineOwnerReviews;
		const allowInvitesChanged =
			this.isOwner &&
			pendingAllowInvites !== null &&
			pendingAllowInvites !== baselineAllowInvites;
		const autoShareChanged =
			pendingAutoShare !== null && pendingAutoShare !== baselineAutoShare;
		if (
			!memberChanged &&
			!ownerPlansChanged &&
			!ownerReviewsChanged &&
			!allowInvitesChanged &&
			!autoShareChanged
		) {
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
			if (allowInvitesChanged) {
				try {
					await this.setAllowMemberInvites({
						householdId,
						callerMemberId: memberId,
						enabled: pendingAllowInvites,
					});
					toast.success(
						pendingAllowInvites
							? "Members can now invite others"
							: "Only the owner can invite now",
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
				this.allowMemberInvitesDraft = null;
				this.autoShareMealsDraft = null;
			}
		} finally {
			this.saving = false;
		}
	}
}
