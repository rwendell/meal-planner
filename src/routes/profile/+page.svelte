<script lang="ts">
	import UserRoundIcon from "@lucide/svelte/icons/user-round";
	import XIcon from "@lucide/svelte/icons/x";
	import { useAuth } from "@mmailaender/convex-auth-svelte/svelte";
	import { useMutation, useQuery } from "convex-svelte";
	import { tick } from "svelte";
	import { toast } from "svelte-sonner";
	import { browser } from "$app/environment";
	import { resolve } from "$app/paths";
	import EditActions from "$lib/components/EditActions.svelte";
	import InviteCode from "$lib/components/InviteCode.svelte";
	import MemberAvatar from "$lib/components/MemberAvatar.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
	import { Separator } from "$lib/components/ui/separator";
	import { Skeleton } from "$lib/components/ui/skeleton";
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
	import { refKey, roster } from "$lib/households.svelte.js";
	import { MEAL_TYPES, type MealType } from "$lib/meal-types.js";
	import { deviceName, session } from "$lib/session.svelte.js";
	import { cn } from "$lib/utils.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	type RosterEntry = NonNullable<
		NonNullable<typeof rosterQuery.data>[number]
	>;

	const rosterQuery = useQuery(api.households.listHouseholds, () =>
		roster.refs.length > 0
			? {
					refs: roster.refs.map((ref) => ({
						householdId: ref.householdId as Id<"households">,
						memberId: ref.memberId as Id<"householdMembers">,
					})),
				}
			: "skip",
	);

	const householdQuery = useQuery(api.households.get, () =>
		session.session
			? { householdId: session.session.householdId as Id<"households"> }
			: "skip",
	);

	const auth = useAuth();
	let linkingAccount = $state(false);

	// One-click recovery for members the roster never saw (e.g. the
	// device roster was wiped): link the active member row directly.
	async function handleLinkAccount(): Promise<void> {
		const current = session.session;
		if (!current || linkingAccount) return;
		linkingAccount = true;
		try {
			const result = await claimHouseholds({
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
				toast.error(
					"This member belongs to a different sign-in.",
				);
			}
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't link this member."));
		} finally {
			linkingAccount = false;
		}
	}

	const renameHousehold = useMutation(api.households.renameHousehold);
	const setInviteCode = useMutation(api.households.setInviteCode);
	const setOwnerManagesPlans = useMutation(
		api.households.setOwnerManagesPlans,
	);
	const setAutoShareMeals = useMutation(api.households.setAutoShareMeals);
	const renameMember = useMutation(api.households.renameMember);
	const removeMember = useMutation(api.households.removeMember);
	const createHousehold = useMutation(api.households.create);
	const joinHousehold = useMutation(api.households.join);
	const leaveHousehold = useMutation(api.households.leave);
	const claimHouseholds = useMutation(api.households.claimHouseholds);
	const applyPlannerExclusions = useMutation(
		api.households.applyPlannerExclusions,
	);

	// Generated codes avoid ambiguous chars, but a custom code may use
	// any A-Z or 0-9.
	const CUSTOM_INVITE_CODE_PATTERN = /^[A-Z0-9]{6}$/;

	let entries = $derived(
		(rosterQuery.data ?? []).filter(
			(entry): entry is RosterEntry => entry !== null,
		),
	);
	let rosterLoading = $derived(
		roster.refs.length > 0 && rosterQuery.data === undefined,
	);
	let activeEntry = $derived(
		entries.find(
			(entry) =>
				entry.household._id === session.session?.householdId &&
				entry.member._id === session.session?.memberId,
		) ?? null,
	);
	let myName = $derived(activeEntry?.member.name ?? deviceName());

	let household = $derived(householdQuery.data?.household ?? null);
	let members = $derived(householdQuery.data?.members ?? []);
	let myId = $derived(session.session?.memberId ?? null);
	let isManager = $derived(
		household ? !household.ownerId || household.ownerId === myId : false,
	);

	// Staged household switch: picking a card in edit mode only records
	// the choice; the switch commits when profile edits save.
	let pendingHouseholdKey = $state<string | null>(null);
	let activeHouseholdKey = $derived(
		activeEntry
			? refKey({
					householdId: activeEntry.household._id,
					memberId: activeEntry.member._id,
				})
			: null,
	);
	let householdSwitchPending = $derived(
		pendingHouseholdKey !== null && pendingHouseholdKey !== activeHouseholdKey,
	);
	let switchTarget = $derived(
		householdSwitchPending && pendingHouseholdKey
			? (entries.find(
					(entry) =>
						refKey({
							householdId: entry.household._id,
							memberId: entry.member._id,
						}) === pendingHouseholdKey,
				) ?? null)
			: null,
	);

	// Drop roster entries the server no longer resolves (deleted households).
	$effect(() => {
		const data = rosterQuery.data;
		if (!data) return;
		const alive = new Set<string>();
		for (const entry of data) {
			if (entry) {
				alive.add(
					refKey({
						householdId: entry.household._id,
						memberId: entry.member._id,
					}),
				);
			}
		}
		roster.pruneToAlive(alive);
	});

	let editingProfile = $state(false);
	let savingProfile = $state(false);
	let myNameEdit = $state("");
	let myNameEditKey = $state<string | null>(null);
	let nameInput = $state<HTMLInputElement | null>(null);
	let householdNameInput = $state<HTMLInputElement | null>(null);
	let householdNameEdit = $state("");
	let householdNameEditKey = $state<string | null>(null);
	let ownerManagesPlansDraft = $state<boolean | null>(null);
	let autoShareMealsDraft = $state<boolean | null>(null);
	let inviteCodeEdit = $state("");
	let joinCode = $state("");
	let newHouseholdName = $state("");
	let joinError = $state("");
	let createError = $state("");

	// One actions set at a time: the header row is always rendered, so
	// observing it is stable. Top buttons show while any of it is
	// visible; otherwise the bottom set takes over.
	let headerRowRef = $state<HTMLDivElement | null>(null);
	let headerRowVisible = $state(true);
	$effect(() => {
		const target = headerRowRef;
		if (!browser || !target) return;
		const observer = new IntersectionObserver(
			(entries) => {
				headerRowVisible = entries[0]?.isIntersecting ?? true;
			},
			{ threshold: 0 },
		);
		observer.observe(target);
		return () => observer.disconnect();
	});

	// Planner exclusions: the member's own opted-out (weekday, slot)
	// cells, edited through the page-level profile edit mode. A null
	// draft means no local edits yet — it initializes from the server
	// state on first toggle, so a slow member load can't clobber it.
	// Saving removes affected meals after confirmation.
	let myMember = $derived(members.find((m) => m._id === myId) ?? null);
	let savedExclusions = $derived<ExcludedCell[]>(
		myMember?.excludedCells ?? [],
	);
	let exclusionDraft = $state<ExcludedCell[] | null>(null);
	let confirmExclusionsOpen = $state(false);
	let shownExclusions = $derived(
		editingProfile ? (exclusionDraft ?? savedExclusions) : savedExclusions,
	);
	let shownExclusionSet = $derived(excludedCellSet(shownExclusions));
	let exclusionsDirty = $derived(
		editingProfile &&
			exclusionDraft !== null &&
			!sameExcludedCells(exclusionDraft, savedExclusions),
	);

	const exclusionImpactQuery = useQuery(api.households.exclusionImpact, () =>
		session.session && exclusionsDirty
			? {
					householdId: session.session
						.householdId as Id<"households">,
					memberId: session.session
						.memberId as Id<"householdMembers">,
					callerMemberId: session.session
						.memberId as Id<"householdMembers">,
					fromDate: todayISO(),
					cells: sortExcludedCells(exclusionDraft ?? []),
				}
			: "skip",
	);
	let impactMeals = $derived(exclusionImpactQuery.data?.meals ?? 0);
	let impactPending = $derived(
		exclusionsDirty &&
			exclusionImpactQuery.data === undefined &&
			!exclusionImpactQuery.error,
	);

	function draftCells(): ExcludedCell[] {
		return (exclusionDraft ?? savedExclusions).map((cell) => ({ ...cell }));
	}

	function setCells(cells: ExcludedCell[], excluded: boolean): void {
		const keys = new Set(
			cells.map((cell) => exclusionKey(cell.day, cell.slot)),
		);
		const kept = draftCells().filter(
			(cell) => !keys.has(exclusionKey(cell.day, cell.slot)),
		);
		exclusionDraft = excluded ? [...kept, ...cells] : kept;
	}

	function setSlotExcluded(slot: MealType, excluded: boolean): void {
		setCells(
			EXCLUSION_WEEKDAYS.map((row) => ({ day: row.day, slot })),
			excluded,
		);
	}

	function slotExcludedCount(slot: MealType): number {
		return EXCLUSION_WEEKDAYS.filter((row) =>
			shownExclusionSet.has(exclusionKey(row.day, slot)),
		).length;
	}

	async function requestSaveExclusions(): Promise<void> {
		if (!exclusionsDirty) return;
		if (impactMeals > 0 && !confirmExclusionsOpen) {
			confirmExclusionsOpen = true;
			return;
		}
		await saveExclusions();
	}

	async function saveExclusions(): Promise<boolean> {
		const current = session.session;
		if (!current) return false;
		try {
			const result = await applyPlannerExclusions({
				householdId: current.householdId as Id<"households">,
				memberId: current.memberId as Id<"householdMembers">,
				callerMemberId: current.memberId as Id<"householdMembers">,
				fromDate: todayISO(),
				cells: sortExcludedCells(exclusionDraft ?? []),
			});
			confirmExclusionsOpen = false;
			exclusionDraft = null;
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

	// Prefill the rename inputs from loaded data, resetting only when a
	// different entity is shown so typing is never clobbered.
	$effect(() => {
		const member = activeEntry?.member;
		if (member && myNameEditKey !== member._id) {
			const house = activeEntry?.household;
			myNameEditKey = member._id;
			myNameEdit = member.name;
			if (house) {
				householdNameEditKey = house._id;
				householdNameEdit = house.name;
				inviteCodeEdit = house.inviteCode;
				ownerManagesPlansDraft = null;
				autoShareMealsDraft = null;
			}
			editingProfile = false;
			pendingHouseholdKey = null;
			savingProfile = false;
		}
	});

	$effect(() => {
		const house = activeEntry?.household;
		if (house && householdNameEditKey !== house._id) {
			householdNameEditKey = house._id;
			householdNameEdit = house.name;
			inviteCodeEdit = house.inviteCode;
			ownerManagesPlansDraft = null;
				autoShareMealsDraft = null;
			editingProfile = false;
			pendingHouseholdKey = null;
			savingProfile = false;
		}
	});

	let pendingOwnerManagesPlans = $derived(
		ownerManagesPlansDraft ?? household?.ownerManagesPlans ?? false,
	);
	let pendingAutoShareMeals = $derived(
		autoShareMealsDraft ?? household?.autoShareMeals ?? true,
	);
	let pendingInviteCode = $derived(inviteCodeEdit.trim().toUpperCase());
	let inviteCodeError = $derived(
		!pendingInviteCode
			? "Invite code is required."
			: !CUSTOM_INVITE_CODE_PATTERN.test(pendingInviteCode)
				? "Use exactly 6 letters or digits."
				: "",
	);
	let profileSaveDisabled = $derived(
		!myNameEdit.trim() ||
			!householdNameEdit.trim() ||
			inviteCodeError !== "" ||
			!activeEntry ||
			!(
				myNameEdit.trim() !== activeEntry.member.name ||
				householdNameEdit.trim() !== activeEntry.household.name ||
				pendingInviteCode !== activeEntry.household.inviteCode ||
				(isManager &&
					ownerManagesPlansDraft !== null &&
					ownerManagesPlansDraft !==
						(household?.ownerManagesPlans ?? false)) ||
				(isManager &&
					autoShareMealsDraft !== null &&
					autoShareMealsDraft !==
						(household?.autoShareMeals ?? true)) ||
				exclusionsDirty ||
				householdSwitchPending
			) ||
			impactPending ||
			savingProfile,
	);

	async function startEditingProfile(): Promise<void> {
		if (!activeEntry) return;
		exclusionDraft = null;
		pendingHouseholdKey = null;
		editingProfile = true;
		await tick();
		nameInput?.focus();
		nameInput?.select();
	}

	function cancelEditingProfile(): void {
		if (activeEntry) {
			myNameEdit = activeEntry.member.name;
			householdNameEdit = activeEntry.household.name;
			inviteCodeEdit = activeEntry.household.inviteCode;
		}
		ownerManagesPlansDraft = null;
		autoShareMealsDraft = null;
		exclusionDraft = null;
		confirmExclusionsOpen = false;
		pendingHouseholdKey = null;
		editingProfile = false;
	}

	async function saveProfileEdits(event?: SubmitEvent): Promise<void> {
		event?.preventDefault();
		const current = session.session;
		const entry = activeEntry;
		const memberName = myNameEdit.trim();
		const householdName = householdNameEdit.trim();
		const pendingInviteCode = inviteCodeEdit.trim().toUpperCase();
		if (
			!current ||
			!entry ||
			!editingProfile ||
			savingProfile ||
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
		if (exclusionsDirty) {
			await requestSaveExclusions();
			if (confirmExclusionsOpen || exclusionsDirty) return;
		}
		const baselineOwnerPlans = household?.ownerManagesPlans ?? false;
		const pendingOwnerPlans = ownerManagesPlansDraft;
		const baselineAutoShare = household?.autoShareMeals ?? true;
		const pendingAutoShare = autoShareMealsDraft;
		const memberChanged = memberName !== entry.member.name;
		const householdChanged = householdName !== entry.household.name;
		const inviteCodeChanged =
			pendingInviteCode !== entry.household.inviteCode;
		const ownerPlansChanged =
			isManager &&
			pendingOwnerPlans !== null &&
			pendingOwnerPlans !== baselineOwnerPlans;
		const autoShareChanged =
			isManager &&
			pendingAutoShare !== null &&
			pendingAutoShare !== baselineAutoShare;
		if (
			!memberChanged &&
			!householdChanged &&
			!inviteCodeChanged &&
			!ownerPlansChanged &&
			!autoShareChanged &&
			!switchTarget
		) {
			editingProfile = false;
			pendingHouseholdKey = null;
			return;
		}
		savingProfile = true;
		let failed = false;
		try {
			if (memberChanged) {
				try {
					await renameMember({
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
						name: memberName,
						callerMemberId:
							current.memberId as Id<"householdMembers">,
					});
					toast.success("Name updated");
				} catch (error) {
					failed = true;
					toast.error(
						errorMessage(error, "Couldn't update your name."),
					);
				}
			}
			if (householdChanged) {
				try {
					await renameHousehold({
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
						name: householdName,
					});
					toast.success("Household name updated");
				} catch (error) {
					failed = true;
					toast.error(
						errorMessage(
							error,
							"Couldn't update the household name.",
						),
					);
				}
			}
			if (inviteCodeChanged) {
				try {
					await setInviteCode({
						householdId: current.householdId as Id<"households">,
						memberId: current.memberId as Id<"householdMembers">,
						inviteCode: pendingInviteCode,
					});
					toast.success("Invite code updated");
				} catch (error) {
					failed = true;
					toast.error(
						errorMessage(error, "Couldn't update the invite code."),
					);
				}
			}
			if (ownerPlansChanged) {
				try {
					await setOwnerManagesPlans({
						householdId: current.householdId as Id<"households">,
						callerMemberId:
							current.memberId as Id<"householdMembers">,
						enabled: pendingOwnerPlans,
					});
					toast.success(
						pendingOwnerPlans
							? "Owner planning turned on"
							: "Owner planning turned off",
					);
				} catch (error) {
					failed = true;
					toast.error(
						errorMessage(error, "Couldn't update the setting."),
					);
				}
			}
			if (autoShareChanged) {
				try {
					await setAutoShareMeals({
						householdId: current.householdId as Id<"households">,
						callerMemberId:
							current.memberId as Id<"householdMembers">,
						enabled: pendingAutoShare,
					});
					toast.success(
						pendingAutoShare
							? "New meals will be shared publicly"
							: "New meals will stay private",
					);
				} catch (error) {
					failed = true;
					toast.error(
						errorMessage(error, "Couldn't update the setting."),
					);
				}
			}
			if (!failed) {
				ownerManagesPlansDraft = null;
				autoShareMealsDraft = null;
				editingProfile = false;
				pendingHouseholdKey = null;
				// Staged switch commits last: server saves above ran
				// against the previous household on purpose.
				if (switchTarget) switchHousehold(switchTarget);
			}
		} finally {
			savingProfile = false;
		}
	}

	function switchHousehold(entry: RosterEntry): void {
		roster.switchTo({
			householdId: entry.household._id,
			memberId: entry.member._id,
		});
		toast.success(`Switched to ${entry.household.name}`);
	}

	async function handleLeaveHousehold(entry: RosterEntry): Promise<void> {
		try {
			await leaveHousehold({
				memberId: entry.member._id as Id<"householdMembers">,
			});
			roster.forget(entry.household._id);
			toast.success(`Left ${entry.household.name}`);
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't leave the household."));
		}
	}

	async function handleJoinHousehold(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		joinError = "";
		try {
			const result = await joinHousehold({
				inviteCode: joinCode,
				memberName: myName,
				// No active entry means myName is the device fallback,
				// safe to replace with the OAuth name later.
				autoNamed: !activeEntry,
			});
			joinCode = "";
			roster.switchTo({
				householdId: result.householdId,
				memberId: result.memberId,
			});
			toast.success("Household joined");
		} catch (error) {
			joinError = errorMessage(error, "Couldn't join with that code.");
		}
	}

	async function handleCreateHousehold(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		createError = "";
		const name = newHouseholdName.trim();
		if (!name) return;
		try {
			const result = await createHousehold({
				householdName: name,
				memberName: myName,
				autoNamed: !activeEntry,
			});
			newHouseholdName = "";
			roster.switchTo({
				householdId: result.householdId,
				memberId: result.memberId,
			});
			toast.success(`Created ${name}`);
		} catch (error) {
			createError = errorMessage(error, "Couldn't create the household.");
		}
	}

	async function removeMemberRow(
		targetId: string,
		name: string,
	): Promise<void> {
		const current = session.session;
		if (!current) return;
		try {
			const result = await removeMember({
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
</script>

<svelte:head><title>Profile · Meal Planner</title></svelte:head>

<main
	class="mx-auto max-w-[1180px] px-[18px] pt-5 pb-[72px] min-[560px]:px-7 min-[560px]:pt-6 min-[560px]:pb-20 lg:px-10 lg:pt-[34px] lg:pb-20"
>
	{#if !session.session}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media><UserRoundIcon /></Empty.Media>
				<Empty.Title>No household yet</Empty.Title>
				<Empty.Description>
					You need an active household to view your profile.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button href={resolve("/")}>Go home</Button>
			</Empty.Content>
		</Empty.Root>
	{:else if rosterLoading}
		<div class="grid items-start gap-3 min-[560px]:gap-4">
			<Skeleton class="h-14" />
			<Skeleton class="h-72" />
			<Skeleton class="h-48" />
			<Skeleton class="h-56" />
		</div>
	{:else}
		<div class="grid items-start gap-3 min-[560px]:gap-4">
			<div
				bind:this={headerRowRef}
				class="flex flex-wrap items-start justify-between gap-3"
			>
				<div class="grid min-w-0 flex-1 gap-1">
					<h1
						class="m-0 font-serif text-[26px] leading-tight tracking-[-0.02em]"
					>
						Profile
					</h1>
					<p class="m-0 text-sm text-muted-foreground">
						Your name, households, and members.
					</p>
				</div>
				{#if activeEntry && headerRowVisible}
					<EditActions
						editing={editingProfile}
						disabled={savingProfile}
						saveDisabled={profileSaveDisabled}
						saving={savingProfile}
						class="shrink-0"
						onEdit={() => void startEditingProfile()}
						onCancel={cancelEditingProfile}
						onSave={() => void saveProfileEdits()}
					/>
				{/if}
			</div>
			{#if activeEntry}
				<div
					class="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm shadow-xs"
				>
					<MemberAvatar
						name={myName}
						image={myMember?.image ?? null}
						size="lg"
					/>
					{#if !editingProfile}
						<div class="min-w-0 flex-1">
							<p class="m-0 truncate font-semibold">{myName}</p>
							<p
								class="m-0 truncate text-xs text-muted-foreground"
							>
								{activeEntry.isOwner ? "Owner" : "Member"} · Member
								of {activeEntry.household.name}
							</p>
						</div>
					{:else}
						<form
							class="flex min-w-0 flex-1 items-center gap-1.5"
							onsubmit={(event) => void saveProfileEdits(event)}
						>
							<Input
								bind:ref={nameInput}
								id="my-name"
								bind:value={myNameEdit}
								required
								maxlength={40}
								placeholder="Your name"
								autocomplete="given-name"
								aria-label="Display name"
								class="h-8"
								disabled={savingProfile}
								onkeydown={(event) => {
									if (event.key === "Escape")
										cancelEditingProfile();
								}}
							/>
						</form>
					{/if}
				</div>
				{#if activeEntry &&
					auth.isAuthenticated &&
					myMember &&
					!myMember.authSubject}
					<div
						class="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-3 py-2"
					>
						<p
							class="m-0 min-w-0 flex-1 text-xs text-muted-foreground"
						>
							This member isn't linked to your sign-in yet —
							link it to sync your name and picture.
						</p>
						<Button
							variant="outline"
							size="sm"
							disabled={linkingAccount}
							onclick={() => void handleLinkAccount()}
						>
							{linkingAccount
								? "Linking…"
								: "Link to my sign-in"}
						</Button>
					</div>
				{/if}

				<Card.Root>
					<Card.Header>
						<Card.Title>Current household</Card.Title>
						<Card.Description>
							{activeEntry.memberCount}
							{activeEntry.memberCount === 1
								? "member"
								: "members"} · rename or share the invite code
						</Card.Description>
					</Card.Header>
					<Card.Content class="grid items-start gap-4 sm:grid-cols-2">
						<div class="grid content-start gap-1.5">
							<span
								class="text-xs font-semibold text-muted-foreground"
								>Household name</span
							>
							{#if editingProfile}
								<form
									class="grid gap-2"
									onsubmit={(event) =>
										void saveProfileEdits(event)}
								>
									<Input
										id="household-name"
										bind:ref={householdNameInput}
										bind:value={householdNameEdit}
										required
										maxlength={40}
										placeholder="Household name"
										autocomplete="off"
										aria-label="Household name"
										disabled={savingProfile}
										onkeydown={(event) => {
											if (event.key === "Escape")
												cancelEditingProfile();
										}}
									/>
								</form>
							{:else}
								<p class="m-0 truncate text-sm font-semibold">
									{activeEntry.household.name}
								</p>
							{/if}
						</div>
						<div class="grid content-start gap-1.5">
							<span
								id="household-invite-code-label"
								class="text-xs font-semibold text-muted-foreground"
							>
								Invite code
							</span>
							<div class="flex flex-wrap items-center gap-2">
								{#if editingProfile}
									<Input
										id="household-invite-code"
										bind:value={inviteCodeEdit}
										required
										maxlength={6}
										placeholder="ABC123"
										autocomplete="off"
										autocapitalize="characters"
										aria-labelledby="household-invite-code-label"
										class="uppercase tracking-[0.2em]"
										disabled={savingProfile}
										onkeydown={(event) => {
											if (event.key === "Escape")
												cancelEditingProfile();
										}}
									/>
								{:else}
									<InviteCode
										code={activeEntry.household.inviteCode}
									/>
								{/if}
							</div>
							{#if editingProfile && inviteCodeError !== ""}
								<p
									class="m-0 text-xs font-semibold text-destructive"
									role="alert"
								>
									{inviteCodeError}
								</p>
							{/if}
						</div>
						<Separator class="sm:col-span-2" />
						<div class="grid gap-2 sm:col-span-2">
							<span
								class="text-xs font-semibold text-muted-foreground"
							>
								Members · {members.length}
							</span>
							{#if householdQuery.data === undefined}
								<Skeleton class="h-10" />
								<Skeleton class="h-10" />
							{:else if !household}
								<p class="m-0 text-sm text-muted-foreground">
									This household no longer exists.
								</p>
							{:else if members.length === 0}
								<p class="m-0 text-sm text-muted-foreground">
									No members yet.
								</p>
							{:else}
								{#each members as member (member._id)}
									{@const isSelf = member._id === myId}
									<div
										class="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"
									>
										<div
											class="flex min-w-0 flex-wrap items-center gap-1.5"
										>
											<strong class="truncate text-sm"
												>{member.name}</strong
											>
											{#if isSelf}<Badge
													variant="secondary"
													class="shrink-0">You</Badge
												>{/if}
											{#if household?.ownerId === member._id}
												<Badge
													variant="secondary"
													class="shrink-0"
													>Owner</Badge
												>
											{/if}
										</div>
										{#if !isSelf && isManager}
											<AlertDialog.Root>
												<AlertDialog.Trigger>
													{#snippet child({ props })}
														<Button
															variant="ghost"
															size="icon-sm"
															aria-label={`Remove ${member.name}`}
															title="Remove"
															{...props}
														>
															<XIcon />
														</Button>
													{/snippet}
												</AlertDialog.Trigger>
												<AlertDialog.Content>
													<AlertDialog.Header>
														<AlertDialog.Title>
															Remove {member.name}?
														</AlertDialog.Title>
														<AlertDialog.Description
														>
															{member.name} will lose
															access to this household
															and their planned meals
															will be removed.
														</AlertDialog.Description>
													</AlertDialog.Header>
													<AlertDialog.Footer>
														<AlertDialog.Cancel
															>Cancel</AlertDialog.Cancel
														>
														<AlertDialog.Action
															variant="destructive"
															onclick={() =>
																removeMemberRow(
																	member._id,
																	member.name,
																)}
														>
															Remove
														</AlertDialog.Action>
													</AlertDialog.Footer>
												</AlertDialog.Content>
											</AlertDialog.Root>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
						{#if isManager}
							<Separator class="sm:col-span-2" />
							<div class="grid gap-2 sm:col-span-2">
								<span
									class="text-xs font-semibold text-muted-foreground"
								>
									Owner settings
								</span>
								<div class="flex items-start gap-2.5">
									<Checkbox
										id="owner-manages-plans"
										checked={pendingOwnerManagesPlans}
										onCheckedChange={(value) => {
											if (typeof value === "boolean") {
												ownerManagesPlansDraft = value;
											}
										}}
										disabled={!editingProfile ||
											savingProfile}
										class="mt-0.5"
									/>
									<span class="grid gap-0.5">
										<label
											for="owner-manages-plans"
											class={cn(
												"text-sm font-medium",
												editingProfile &&
													!savingProfile &&
													"cursor-pointer",
											)}
											>Owner can plan for everyone</label
										>
										<span
											class="text-xs text-muted-foreground"
										>
											When on, the owner can switch
											between members' plans and pick
											meals for them. Everyone else only
											ever sees and edits their own plan.
											Changes apply when profile edits are
											saved.
										</span>
									</span>
								</div>
								<div class="flex items-start gap-2.5">
									<Checkbox
										id="auto-share-meals"
										checked={pendingAutoShareMeals}
										onCheckedChange={(value) => {
											if (typeof value === "boolean") {
												autoShareMealsDraft = value;
											}
										}}
										disabled={!editingProfile ||
											savingProfile}
										class="mt-0.5"
									/>
									<span class="grid gap-0.5">
										<label
											for="auto-share-meals"
											class={cn(
												"text-sm font-medium",
												editingProfile &&
													!savingProfile &&
													"cursor-pointer",
											)}
											>Share new meals publicly</label
										>
										<span
											class="text-xs text-muted-foreground"
										>
											When on, new meals appear in the
											community cookbook automatically.
											Turn off to keep new meals private;
											any meal can still be shared from
											its editor. Changes apply when
											profile edits are saved.
										</span>
									</span>
								</div>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			{#if activeEntry}
				<Card.Root>
					<Card.Header>
						<Card.Title>Planner exclusions</Card.Title>
						<Card.Description>
							Skip days or meals you never plan snacks, and so on.
						</Card.Description>
					</Card.Header>
					<Card.Content class="grid gap-3">
						{#if householdQuery.data === undefined}
							<Skeleton class="h-40" />
						{:else}
							<fieldset class="m-0 grid gap-3 border-0 p-0">
								<legend class="sr-only"
									>Excluded days and meals</legend
								>
								<div class="grid gap-3">
									<div class="grid gap-1">
										<div
											class="grid grid-cols-[minmax(5.5rem,1.2fr)_repeat(7,minmax(1.25rem,1fr))] items-center gap-1 px-1"
										>
											<span></span>
											{#each EXCLUSION_WEEKDAYS as row (row.day)}
												<span
													class="flex items-start justify-center text-center"
												>
													<span
														class="hidden text-[10px] font-semibold text-muted-foreground sm:inline"
													>
														{row.label}
													</span>
													<span
														class="text-[10px] font-semibold text-muted-foreground sm:hidden"
														title={row.label}
													>
														{row.label.slice(0, 3)}
													</span>
												</span>
											{/each}
										</div>
									</div>
									<div class="grid gap-1">
										{#each MEAL_TYPES as slot (slot.id)}
											{@const excluded =
												slotExcludedCount(slot.id)}
											<div
												class="grid grid-cols-[minmax(5.5rem,1.2fr)_repeat(7,minmax(1.25rem,1fr))] items-center gap-1 rounded-lg px-1 py-1 odd:bg-muted/40"
											>
												<span
													class="flex min-w-0 items-center gap-1.5"
												>
													<Checkbox
														checked={excluded ===
															EXCLUSION_WEEKDAYS.length}
														indeterminate={excluded >
															0 &&
															excluded <
																EXCLUSION_WEEKDAYS.length}
														onCheckedChange={(
															value,
														) => {
															if (value === true)
																setSlotExcluded(
																	slot.id,
																	true,
																);
															else if (
																value === false
															)
																setSlotExcluded(
																	slot.id,
																	false,
																);
														}}
														disabled={!editingProfile ||
															savingProfile}
														aria-label={`Exclude all ${slot.label.toLowerCase()} meals`}
													/>
													<span
														class="truncate text-sm font-medium"
													>
														{slot.label}
													</span>
												</span>
												{#each EXCLUSION_WEEKDAYS as row (row.day)}
													<span
														class="flex justify-center"
													>
														<Checkbox
															checked={shownExclusionSet.has(
																exclusionKey(
																	row.day,
																	slot.id,
																),
															)}
															onCheckedChange={(
																value,
															) => {
																if (
																	typeof value ===
																	"boolean"
																)
																	setCells(
																		[
																			{
																				day: row.day,
																				slot: slot.id,
																			},
																		],
																		value,
																	);
															}}
															disabled={!editingProfile ||
																savingProfile}
															aria-label={`Exclude ${slot.label} on ${row.label}`}
														/>
													</span>
												{/each}
											</div>
										{/each}
									</div>
								</div>
							</fieldset>
						{/if}
						{#if editingProfile && exclusionsDirty}
							{#if exclusionImpactQuery.data === undefined && !exclusionImpactQuery.error}
								<p class="m-0 text-xs text-muted-foreground">
									Checking affected meals…
								</p>
							{:else if impactMeals > 0}
								<p
									class="m-0 text-xs font-semibold text-amber-600 dark:text-amber-500"
								>
									Saving will remove {impactMeals}
									{impactMeals === 1 ? "meal" : "meals"} from today
									onward.
								</p>
							{:else}
								<p class="m-0 text-xs text-muted-foreground">
									No planned meals are affected.
								</p>
							{/if}
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			<AlertDialog.Root bind:open={confirmExclusionsOpen}>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>
							Remove {impactMeals}
							{impactMeals === 1 ? "meal" : "meals"}?
						</AlertDialog.Title>
						<AlertDialog.Description>
							These planned meals fall on days you're excluding.
							Saving will remove them from today onward and update
							groceries. This can't be undone.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action
							disabled={savingProfile}
							onclick={() => void saveProfileEdits()}
						>
							Remove & save
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Households</Card.Title>
					<Card.Description>
						Switch between households, or leave ones you no longer
						need.
					</Card.Description>
				</Card.Header>
				<Card.Content class="grid gap-2 sm:grid-cols-2">
					{#if entries.length === 0}
						<p
							class="m-0 text-sm text-muted-foreground sm:col-span-2"
						>
							No households yet — join one below or create a new
							household.
						</p>
					{:else}
						{#each entries as entry (`${entry.household._id}:${entry.member._id}`)}
							{@const isActive =
								entry.household._id ===
									session.session?.householdId &&
								entry.member._id === session.session?.memberId}
							{@const key = refKey({
								householdId: entry.household._id,
								memberId: entry.member._id,
							})}
							{@const isPending =
								pendingHouseholdKey === key &&
								pendingHouseholdKey !== activeHouseholdKey}
							{@const highlighted =
								isPending ||
								(isActive && !householdSwitchPending)}
						<div
							class={cn(
								"flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between",
								highlighted && "border-primary bg-muted/50",
								editingProfile &&
									!highlighted &&
									"transition-colors hover:border-muted-foreground/50",
							)}
						>
							<button
								type="button"
								disabled={!editingProfile}
								aria-pressed={isPending}
								aria-label={isActive && !isPending
									? `Current household: ${entry.household.name}`
									: isPending
										? `Selected household: ${entry.household.name} (applies on save)`
										: editingProfile
											? `Select ${entry.household.name}`
											: entry.household.name}
								onclick={() => {
									pendingHouseholdKey = isPending ? null : key;
								}}
								class={cn(
									"grid min-w-0 flex-1 justify-items-start gap-0 text-left",
									editingProfile && "cursor-pointer",
								)}
							>
								<span
									class="flex max-w-full flex-wrap items-center gap-1.5"
								>
									<strong class="truncate"
										>{entry.household.name}</strong
									>
									<Badge variant="secondary">
										{entry.isOwner ? "Owner" : "Member"}
									</Badge>
								</span>
								<span
									class="mt-1 font-mono text-xs text-muted-foreground"
								>
									{entry.household.inviteCode} · {entry.memberCount}
									{entry.memberCount === 1
										? "member"
										: "members"} · as {entry.member
										.name}
								</span>
							</button>
							<div class="flex shrink-0 gap-2">
								<AlertDialog.Root>
										<AlertDialog.Trigger>
											{#snippet child({ props })}
												<Button
													variant="ghost"
													size="sm"
													class="text-muted-foreground hover:text-destructive"
													{...props}
												>
													Leave
												</Button>
											{/snippet}
										</AlertDialog.Trigger>
										<AlertDialog.Content>
											<AlertDialog.Header>
												<AlertDialog.Title>
													Leave {entry.household
														.name}?
												</AlertDialog.Title>
												<AlertDialog.Description>
													You will lose access to this
													household and your planned
													meals there will be removed.
												</AlertDialog.Description>
											</AlertDialog.Header>
											<AlertDialog.Footer>
												<AlertDialog.Cancel
													>Cancel</AlertDialog.Cancel
												>
												<AlertDialog.Action
													variant="destructive"
													onclick={() =>
														handleLeaveHousehold(
															entry,
														)}
												>
													Leave
												</AlertDialog.Action>
											</AlertDialog.Footer>
										</AlertDialog.Content>
									</AlertDialog.Root>
								</div>
							</div>
						{/each}
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Join or create</Card.Title>
					<Card.Description>
						Use an invite code to join another household, or start a
						fresh one.
					</Card.Description>
				</Card.Header>
				<Card.Content class="grid gap-6 sm:grid-cols-2">
					<div class="grid content-start gap-2">
						<h3 class="m-0 text-sm font-semibold">
							Join with code
						</h3>
						<p class="m-0 text-xs text-muted-foreground">
							Ask a member for their 6-character invite code.
						</p>
						<form class="grid gap-2" onsubmit={handleJoinHousehold}>
							<label
								for="join-code"
								class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
								>Invite code<Input
									id="join-code"
									bind:value={joinCode}
									required
									maxlength={6}
									placeholder="ABC123"
									autocomplete="off"
									autocapitalize="characters"
									class="uppercase tracking-[0.2em]"
								/></label
							>
							{#if joinError}
								<p
									class="m-0 text-xs font-semibold text-destructive"
									role="alert"
								>
									{joinError}
								</p>
							{/if}
							<Button type="submit" disabled={!joinCode.trim()}
								>Join</Button
							>
						</form>
					</div>
					<div class="grid content-start gap-2">
						<h3 class="m-0 text-sm font-semibold">New household</h3>
						<p class="m-0 text-xs text-muted-foreground">
							Creates a new kitchen and switches you to it.
						</p>
						<form
							class="grid gap-2"
							onsubmit={handleCreateHousehold}
						>
							<label
								for="new-household-name"
								class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
								>Household name<Input
									id="new-household-name"
									bind:value={newHouseholdName}
									required
									maxlength={40}
									placeholder="e.g. Smith Kitchen"
									autocomplete="off"
								/></label
							>
							{#if createError}
								<p
									class="m-0 text-xs font-semibold text-destructive"
									role="alert"
								>
									{createError}
								</p>
							{/if}
							<Button
								type="submit"
								disabled={!newHouseholdName.trim()}
								>Create</Button
							>
						</form>
					</div>
				</Card.Content>
			</Card.Root>
			{#if activeEntry && !headerRowVisible}
				<div class="flex justify-end">
					<EditActions
						editing={editingProfile}
						disabled={savingProfile}
						saveDisabled={profileSaveDisabled}
						saving={savingProfile}
						onEdit={() => void startEditingProfile()}
						onCancel={cancelEditingProfile}
						onSave={() => void saveProfileEdits()}
					/>
				</div>
			{/if}
		</div>
	{/if}
</main>
