<script lang="ts">
	import { useAuth } from "@mmailaender/convex-auth-svelte/svelte";
	import EditActions from "$lib/components/EditActions.svelte";
	import TextButton from "$lib/components/TextButton.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import HouseholdCard from "$lib/profile/HouseholdCard.svelte";
	import HouseholdsCard from "$lib/profile/HouseholdsCard.svelte";
	import { HeaderVisibility } from "$lib/profile/header-visibility.svelte.js";
	import { HouseholdActions } from "$lib/profile/household-actions.svelte.js";
	import JoinCreateCard from "$lib/profile/JoinCreateCard.svelte";
	import MemberCard from "$lib/profile/MemberCard.svelte";
	import ProfileEmptyState from "$lib/profile/ProfileEmptyState.svelte";
	import ProfileHeader from "$lib/profile/ProfileHeader.svelte";
	import ProfileLoadingState from "$lib/profile/ProfileLoadingState.svelte";
	import { ProfileEditor } from "$lib/profile/profile-editor.svelte.js";
	import { RosterState } from "$lib/profile/roster-state.svelte.js";
	import SkippedConfirmDialog from "$lib/profile/SkippedConfirmDialog.svelte";
	import ExclusionsCard from "$lib/profile/SkippedMealsCard.svelte";
	import { session } from "$lib/stores/session.svelte.js";

	const auth = useAuth();
	const rosterState = new RosterState();
	const households = new HouseholdActions();
	const editor = new ProfileEditor(rosterState, {
		onCommitSwitch: (entry) => households.switchHousehold(entry),
	});
	const header = new HeaderVisibility();

	async function join(event: SubmitEvent): Promise<void> {
		await households.joinHousehold(
			event,
			rosterState.myName,
			!rosterState.activeEntry,
		);
		editor.followSession();
	}

	async function create(event: SubmitEvent): Promise<void> {
		await households.createHousehold(
			event,
			rosterState.myName,
			!rosterState.activeEntry,
		);
		editor.followSession();
	}

	async function removeMember(targetId: string, name: string): Promise<void> {
		const viewed = editor.viewedEntry;
		if (!viewed) return;
		const deleted = await households.removeMemberRow(
			targetId,
			name,
			viewed.household._id,
			viewed.member._id,
		);
		if (deleted) editor.followSession();
	}

	async function leaveViewed(): Promise<void> {
		const entry = editor.viewedEntry;
		if (!entry) return;
		await households.leaveHousehold(entry);
		editor.followSession();
	}
</script>

<svelte:head><title>Profile · Meal Planner</title></svelte:head>

<main
	class="mx-auto max-w-[1180px] px-[18px] pt-5 pb-[72px] min-[560px]:px-7 min-[560px]:pt-6 min-[560px]:pb-20 lg:px-10 lg:pt-[34px] lg:pb-20"
>
	{#if !session.session}
		<ProfileEmptyState />
	{:else if rosterState.rosterLoading}
		<ProfileLoadingState />
	{:else}
		<div class="grid items-start gap-3 min-[560px]:gap-4">
			<div
				{@attach header.attach}
				class="flex flex-wrap items-start justify-between gap-3"
			>
				<ProfileHeader
					editing={editor.editing}
					saving={editor.saving}
					saveDisabled={editor.saveDisabled}
					showActions={Boolean(
						(editor.identityEntry ?? editor.viewedEntry) &&
							header.visible,
					)}
					onEdit={() => void editor.startEditing()}
					onCancel={() => editor.cancelEditing()}
					onSave={() => void editor.save()}
				/>
			</div>
			{#if editor.identityEntry}
				<MemberCard
					name={editor.identityDisplayName}
					isOwner={editor.identityEntry.isOwner}
					householdName={editor.identityHousehold?.name ?? ""}
					memberImage={editor.identityMember?.image ?? null}
					editing={editor.editing}
					saving={editor.saving}
					nameEdit={editor.myNameEdit}
					onNameEdit={(v) => (editor.myNameEdit = v)}
					onSave={(e) => void editor.save(e)}
					onCancel={() => editor.cancelEditing()}
					autoShare={editor.pendingAutoShareMeals}
					showAutoShare={Boolean(editor.identityMember)}
					onAutoShare={(v) => (editor.autoShareMealsDraft = v)}
					inputRef={(el) => (editor.nameInput = el)}
					showLinkBanner={Boolean(
						editor.viewingSession &&
							auth.isAuthenticated &&
							editor.identityMember &&
							!editor.identityMember.authSubject,
					)}
					linking={households.linkingAccount}
					onLink={() => void households.linkAccount()}
				/>

				<ExclusionsCard
					loading={editor.identityLoading}
					editing={editor.editing}
					saving={editor.saving}
					shownSet={editor.shownSkipsSet}
					dirty={editor.skipsDirty}
					impactMeals={editor.impactMeals}
					impactPending={editor.impactPending}
					impactError={editor.impactError}
					onToggleCell={(day, slot, value) =>
						editor.setCells([{ day, slot }], value)}
					onToggleSlot={(slot, value) =>
						editor.setSlotSkipped(slot, value)}
					onToggleDay={(day, value) =>
						editor.setDaySkipped(day, value)}
					slotSkippedCount={(slot) =>
						editor.slotSkippedCount(slot)}
					daySkippedCount={(day) => editor.daySkippedCount(day)}
				/>
			{/if}

			<HouseholdsCard
				entries={rosterState.entries}
				activeKey={editor.activeHouseholdKey}
				value={editor.tabValue}
				onSelect={(key) => editor.selectViewed(key)}
			>
				{#if editor.viewedEntry}
					<HouseholdCard
						householdName={editor.viewedEntry.household.name}
						inviteCode={editor.viewedEntry.household.inviteCode}
						members={editor.members}
						ownerId={editor.household?.ownerId}
						myId={editor.myId}
						isManager={editor.isManager}
						isOwner={editor.isOwner}
						editing={editor.editing}
						saving={editor.saving}
						householdEdit={editor.householdNameEdit}
						inviteEdit={editor.inviteCodeEdit}
						inviteError={editor.inviteCodeError}
						ownerPlans={editor.pendingOwnerManagesPlans}
						ownerReviews={editor.pendingOwnerReviewsMeals}
						onHouseholdEdit={(v) => (editor.householdNameEdit = v)}
						onInviteEdit={(v) => (editor.inviteCodeEdit = v)}
						onOwnerPlans={(v) => (editor.ownerManagesPlansDraft = v)}
						onOwnerReviews={(v) =>
							(editor.ownerReviewsMealsDraft = v)}
						onRemoveMember={(id, name) =>
							void removeMember(id, name)}
						onSave={(e) => void editor.save(e)}
						onCancel={() => editor.cancelEditing()}
						loading={editor.householdLoading}
						exists={Boolean(editor.household)}
					/>

					{#if editor.editing}
						<div class="flex justify-start">
							<AlertDialog.Root>
								<AlertDialog.Trigger>
									{#snippet child({ props })}
										<TextButton
											tone="destructive"
											label={`Leave ${editor.viewedEntry?.household.name ?? "household"}`}
											{...props}
										>
											Leave {editor.viewedEntry?.household
												.name ?? "household"}
										</TextButton>
									{/snippet}
								</AlertDialog.Trigger>
								<AlertDialog.Content>
									<AlertDialog.Header>
										<AlertDialog.Title>
											Leave {editor.viewedEntry?.household
												.name}?
										</AlertDialog.Title>
										<AlertDialog.Description>
											You will lose access to this
											household and your planned meals
											there will be removed.
										</AlertDialog.Description>
									</AlertDialog.Header>
									<AlertDialog.Footer>
										<AlertDialog.Cancel
											>Cancel</AlertDialog.Cancel
										>
										<AlertDialog.Action
											variant="destructive"
											onclick={() => void leaveViewed()}
										>
											Leave
										</AlertDialog.Action>
									</AlertDialog.Footer>
								</AlertDialog.Content>
							</AlertDialog.Root>
						</div>
					{/if}
				{:else}
					<p class="m-0 text-sm text-muted-foreground">
						No households yet — join one below or create a new
						household.
					</p>
				{/if}
				{#snippet footer()}
					<JoinCreateCard
						joinCode={households.joinCode}
						newHouseholdName={households.newHouseholdName}
						joinError={households.joinError}
						createError={households.createError}
						onJoinCode={(v) => (households.joinCode = v)}
						onNewName={(v) => (households.newHouseholdName = v)}
						onJoin={(e) => void join(e)}
						onCreate={(e) => void create(e)}
					/>
				{/snippet}
			</HouseholdsCard>

			<SkippedConfirmDialog
				open={editor.confirmSkipsOpen}
				impactMeals={editor.impactMeals}
				saving={editor.saving}
				onOpen={(v) => (editor.confirmSkipsOpen = v)}
				onConfirm={() => void editor.save()}
			/>

			{#if editor.viewedEntry && !header.visible}
				<div class="flex justify-end">
					<EditActions
						editing={editor.editing}
						disabled={editor.saving}
						saveDisabled={editor.saveDisabled}
						saving={editor.saving}
						onEdit={() => void editor.startEditing()}
						onCancel={() => editor.cancelEditing()}
						onSave={() => void editor.save()}
					/>
				</div>
			{/if}
		</div>
	{/if}
</main>
