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
import { CUSTOM_INVITE_CODE_PATTERN } from "./profile-utils.js";

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
	inviteCodeEdit = $state("");
	ownerManagesPlansDraft = $state<boolean | null>(null);
	ownerReviewsMealsDraft = $state<boolean | null>(null);
	allowMemberInvitesDraft = $state<boolean | null>(null);
	autoShareMealsDraft = $state<boolean | null>(null);
	confirmSkipsOpen = $state(false);

	private myNameEditKey = $state<string | null>(null);
	private viewedHouseholdKey = $state<string | null>(null);
	private skippedDraft = $state<SkippedCell[] | null>(null);

	private setInviteCode = useMutation(api.households.setInviteCode);
	private setOwnerManagesPlans = useMutation(
		api.households.setOwnerManagesPlans,
	);
	private setOwnerReviewsMeals = useMutation(
		api.households.setOwnerReviewsMeals,
	);
	private setAllowMemberInvites = useMutation(
		api.households.setAllowMemberInvites,
	);
	private setAutoShareMeals = useMutation(api.households.setMemberAutoShare);
	private renameMember = useMutation(api.households.renameMember);
	private applySkippedCells = useMutation(api.households.applySkippedCells);

	// Created in the constructor body (not field initializers):
	// useQuery evaluates its args eagerly, and constructor parameter
	// properties aren't assigned until the constructor body runs.
	private householdQuery!: UseQueryReturn<typeof api.households.get>;
	private skipImpactQuery!: UseQueryReturn<typeof api.households.skipImpact>;

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
	// Saving removes affected meals after confirmation.
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
	/**
	 * Anything differing from the server: drives the Save button state,
	 * the dirty-guard on navigation, and the auto-commit on leave.
	 */
	get hasUnsavedChanges(): boolean {
		const identity = this.identityEntry;
		const viewed = this.viewedEntry;
		if (!identity || !viewed) return false;
		// Invite-code comparison only applies when the code is visible:
		// members without invite permission never see it.
		const canSeeCode = viewed.household.inviteCode !== undefined;
		return (
			this.myNameEdit.trim() !== identity.member.name ||
			(canSeeCode && this.pendingInviteCode !== viewed.household.inviteCode) ||
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
		const viewed = this.viewedEntry;
		const canSeeCode = viewed?.household.inviteCode !== undefined;
		return (
			!this.myNameEdit.trim() ||
			(canSeeCode && this.inviteCodeError !== "") ||
			!this.hasUnsavedChanges ||
			this.impactPending ||
			this.saving
		);
	}

	constructor() {
		this.householdQuery = useQuery(api.households.get, () => {
			const current = session.session;
			return current
				? {
						householdId: current.householdId as Id<"households">,
						callerMemberId: current.memberId as Id<"householdMembers">,
					}
				: "skip";
		});
		this.skipImpactQuery = useQuery(api.households.skipImpact, () =>
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
				this.saving = false;
			}
		});
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

	cancelEditing(): void {
		const identity = this.identityEntry;
		if (identity) {
			this.myNameEdit = identity.member.name;
		}
		const viewed = this.viewedEntry;
		if (viewed) {
			this.inviteCodeEdit = viewed.household.inviteCode ?? "";
		}
		this.ownerManagesPlansDraft = null;
		this.ownerReviewsMealsDraft = null;
		this.allowMemberInvitesDraft = null;
		this.autoShareMealsDraft = null;
		this.skippedDraft = null;
		this.confirmSkipsOpen = false;
	}

	async save(event?: SubmitEvent): Promise<void> {
		event?.preventDefault();
		const current = session.session;
		if (!current) return;
		const entry = this.viewedEntry;
		const identity = this.identityEntry;
		const memberName = this.myNameEdit.trim();
		const pendingInviteCode = this.inviteCodeEdit.trim().toUpperCase();
		// Members without invite permission never see the code: skip its
		// validation, comparison, and save entirely for them.
		const canSeeCode = entry?.household.inviteCode !== undefined;
		if (
			!entry ||
			!identity ||
			this.saving ||
			!memberName ||
			(canSeeCode && !pendingInviteCode)
		) {
			return;
		}
		if (canSeeCode && !CUSTOM_INVITE_CODE_PATTERN.test(pendingInviteCode)) {
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
		const baselineAllowInvites = this.household?.allowMemberInvites ?? false;
		const pendingAllowInvites = this.allowMemberInvitesDraft;
		const baselineAutoShare = this.identityMember?.autoShareMeals ?? true;
		const pendingAutoShare = this.autoShareMealsDraft;
		const memberChanged = memberName !== identity.member.name;
		const inviteCodeChanged =
			canSeeCode && pendingInviteCode !== entry.household.inviteCode;
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
			!inviteCodeChanged &&
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
