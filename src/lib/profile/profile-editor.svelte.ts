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
 * (`onCommitName={() => editor.persistName()}`) so `this` stays bound.
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
	private toggleTimer: ReturnType<typeof setTimeout> | undefined;

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
	 * Anything not yet persisted: an un-blurred name edit, toggle or
	 * skips drafts awaiting their debounce, or a save in flight. Only
	 * drives the unload warning and the navigate-away flush.
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
				// Read fresh: a flush may have saved it meanwhile.
				if (this.skippedDraft) void this.saveSkips();
			}, 700);
			return () => clearTimeout(this.skipSaveTimer);
		});

		// Toggles persist themselves shortly after flipping, same shape
		// as skips: any draft change restarts the timer. Internal resets
		// (household switch nulling every draft) read as clean and cancel
		// anything pending through the cleanup.
		$effect(() => {
			const drafts = [
				this.ownerManagesPlansDraft,
				this.ownerReviewsMealsDraft,
				this.allowMemberInvitesDraft,
				this.autoShareMealsDraft,
			];
			if (drafts.every((draft) => draft === null) || this.saving) return;
			this.toggleTimer = setTimeout(() => {
				this.toggleTimer = undefined;
				void this.persistToggles();
			}, 500);
			return () => clearTimeout(this.toggleTimer);
		});
	}

	/** Cancel a pending skips autosave (a manual flush saves instead). */
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

	/** Revert the name buffer (Escape in the name field). */
	revertName(): void {
		const identity = this.identityEntry;
		if (identity) this.myNameEdit = identity.member.name;
	}

	get nameDirty(): boolean {
		const identity = this.identityEntry;
		return !!identity && this.myNameEdit.trim() !== identity.member.name;
	}

	/**
	 * Persist toggle drafts, reading them fresh. Drafts matching the
	 * baseline just clear. Silent on success (the flipped switch is the
	 * feedback); a failure clears the draft so the switch snaps back,
	 * plus an error toast -- with no Save button there is no other path
	 * back.
	 */
	private async persistToggles(): Promise<void> {
		const current = session.session;
		const entry = this.viewedEntry;
		if (!current || !entry) return;
		const householdId = entry.household._id as Id<"households">;
		const memberId = entry.member._id as Id<"householdMembers">;
		const jobs: Array<{
			draft: boolean | null;
			baseline: boolean;
			ownerOnly: boolean;
			clear: () => void;
			run: (enabled: boolean) => Promise<unknown>;
		}> = [
			{
				draft: this.ownerManagesPlansDraft,
				baseline: this.household?.ownerManagesPlans ?? false,
				ownerOnly: true,
				clear: () => (this.ownerManagesPlansDraft = null),
				run: (enabled) =>
					this.setOwnerManagesPlans({
						householdId,
						callerMemberId: memberId,
						enabled,
					}),
			},
			{
				draft: this.ownerReviewsMealsDraft,
				baseline: this.household?.ownerReviewsMeals ?? false,
				ownerOnly: true,
				clear: () => (this.ownerReviewsMealsDraft = null),
				run: (enabled) =>
					this.setOwnerReviewsMeals({
						householdId,
						callerMemberId: memberId,
						enabled,
					}),
			},
			{
				draft: this.allowMemberInvitesDraft,
				baseline: this.household?.allowMemberInvites ?? false,
				ownerOnly: true,
				clear: () => (this.allowMemberInvitesDraft = null),
				run: (enabled) =>
					this.setAllowMemberInvites({
						householdId,
						callerMemberId: memberId,
						enabled,
					}),
			},
			{
				draft: this.autoShareMealsDraft,
				baseline: this.identityMember?.autoShareMeals ?? true,
				ownerOnly: false,
				clear: () => (this.autoShareMealsDraft = null),
				run: (enabled) =>
					this.setAutoShareMeals({
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
						callerMemberId: current.memberId as Id<"householdMembers">,
						enabled,
					}),
			},
		];
		const pending = jobs.filter(
			(job) =>
				job.draft !== null &&
				(!job.ownerOnly || this.isOwner) &&
				job.draft !== job.baseline,
		);
		for (const job of jobs) {
			if (job.draft === null) continue;
			// Owner-only drafts without ownership, and drafts matching the
			// baseline, have nothing to persist.
			if ((job.ownerOnly && !this.isOwner) || job.draft === job.baseline) {
				job.clear();
			}
		}
		if (pending.length === 0) return;
		this.saving = true;
		try {
			for (const job of pending) {
				try {
					await job.run(job.draft as boolean);
					job.clear();
				} catch (error) {
					job.clear();
					toast.error(errorMessage(error, "Couldn't update the setting."));
				}
			}
		} finally {
			this.saving = false;
			// A flip that landed mid-flight left a fresh draft behind;
			// pick it up so it is never stranded.
			if (
				this.ownerManagesPlansDraft !== null ||
				this.ownerReviewsMealsDraft !== null ||
				this.allowMemberInvitesDraft !== null ||
				this.autoShareMealsDraft !== null
			) {
				this.scheduleTogglePersist();
			}
		}
	}

	private scheduleTogglePersist(): void {
		clearTimeout(this.toggleTimer);
		this.toggleTimer = setTimeout(() => {
			this.toggleTimer = undefined;
			void this.persistToggles();
		}, 500);
	}

	private clearTogglePersist(): void {
		clearTimeout(this.toggleTimer);
		this.toggleTimer = undefined;
	}

	/**
	 * Persist the name buffer (blur or Enter). Reverts on failure -- with
	 * no Save button there is no other path back. An empty buffer reverts
	 * silently: a name is required, so there is nothing to save.
	 */
	async persistName(): Promise<void> {
		const current = session.session;
		const identity = this.identityEntry;
		if (!current || !identity) return;
		const memberName = this.myNameEdit.trim();
		if (!memberName) {
			this.myNameEdit = identity.member.name;
			return;
		}
		if (memberName === identity.member.name) return;
		this.saving = true;
		try {
			await this.renameMember({
				householdId: current.householdId as Id<"households">,
				memberId: current.memberId as Id<"householdMembers">,
				name: memberName,
				callerMemberId: current.memberId as Id<"householdMembers">,
			});
		} catch (error) {
			this.myNameEdit = identity.member.name;
			toast.error(errorMessage(error, "Couldn't update your name."));
		} finally {
			this.saving = false;
		}
	}

	/**
	 * Persist anything autosave hasn't yet: an un-blurred name edit, a
	 * pending toggles timer, a pending skips draft. Used before navigating
	 * away; in-flight mutations resolve server-side regardless.
	 */
	/**
	 * Persist anything autosave hasn't yet: an un-blurred name edit,
	 * toggle drafts whose timer hasn't fired, a pending skips draft. Used
	 * before navigating away. In-flight mutations resolve server-side
	 * regardless.
	 */
	async flushPending(): Promise<void> {
		this.clearTogglePersist();
		this.clearSkipAutosave();
		if (this.nameDirty) await this.persistName();
		await this.persistToggles();
		if (this.skipsDirty) await this.saveSkips();
	}
}
