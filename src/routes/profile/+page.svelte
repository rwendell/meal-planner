<script lang="ts">
	import { useAuth } from "@mmailaender/convex-auth-svelte/svelte";
	import EditActions from "$lib/components/EditActions.svelte";
	import ExclusionConfirmDialog from "$lib/profile/ExclusionConfirmDialog.svelte";
	import ExclusionsCard from "$lib/profile/ExclusionsCard.svelte";
	import HouseholdCard from "$lib/profile/HouseholdCard.svelte";
	import HouseholdListCard from "$lib/profile/HouseholdListCard.svelte";
	import { HeaderVisibility } from "$lib/profile/header-visibility.svelte.js";
	import { HouseholdActions } from "$lib/profile/household-actions.svelte.js";
	import JoinCreateCard from "$lib/profile/JoinCreateCard.svelte";
	import MemberCard from "$lib/profile/MemberCard.svelte";
	import ProfileEmptyState from "$lib/profile/ProfileEmptyState.svelte";
	import ProfileHeader from "$lib/profile/ProfileHeader.svelte";
	import ProfileLoadingState from "$lib/profile/ProfileLoadingState.svelte";
	import { ProfileEditor } from "$lib/profile/profile-editor.svelte.js";
	import { RosterState } from "$lib/profile/roster-state.svelte.js";
	import { session } from "$lib/session.svelte.js";

	const auth = useAuth();
	const rosterState = new RosterState();
	const households = new HouseholdActions(rosterState);
	const editor = new ProfileEditor(rosterState, {
		onCommitSwitch: (entry) => households.switchHousehold(entry),
	});
	const header = new HeaderVisibility();
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
				{@attach (el) => header.attach(el)}
				class="flex flex-wrap items-start justify-between gap-3"
			>
				<ProfileHeader
					editing={editor.editing}
					saving={editor.saving}
					saveDisabled={editor.saveDisabled}
					showActions={Boolean(
						rosterState.activeEntry && header.visible,
					)}
					onEdit={() => void editor.startEditing()}
					onCancel={() => editor.cancelEditing()}
					onSave={() => void editor.save()}
				/>
			</div>
			{#if rosterState.activeEntry}
				<MemberCard
					name={rosterState.myName}
					isOwner={rosterState.activeEntry.isOwner}
					householdName={rosterState.activeEntry.household.name}
					memberImage={rosterState.myMember?.image ?? null}
					editing={editor.editing}
					saving={editor.saving}
					nameEdit={editor.myNameEdit}
					onNameEdit={(v) => (editor.myNameEdit = v)}
					onSave={(e) => void editor.save(e)}
					onCancel={() => editor.cancelEditing()}
					autoShare={editor.pendingAutoShareMeals}
					showAutoShare={Boolean(rosterState.myMember)}
					onAutoShare={(v) => (editor.autoShareMealsDraft = v)}
					inputRef={(el) => (editor.nameInput = el)}
					showLinkBanner={Boolean(
						rosterState.activeEntry &&
							auth.isAuthenticated &&
							rosterState.myMember &&
							!rosterState.myMember.authSubject,
					)}
					linking={households.linkingAccount}
					onLink={() => void households.linkAccount()}
				/>

				<HouseholdCard
					householdName={rosterState.activeEntry.household.name}
					inviteCode={rosterState.activeEntry.household.inviteCode}
					members={rosterState.members}
					ownerId={rosterState.household?.ownerId}
					myId={rosterState.myId}
					isManager={rosterState.isManager}
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
					onOwnerReviews={(v) => (editor.ownerReviewsMealsDraft = v)}
					onRemoveMember={(id, name) =>
						void households.removeMemberRow(id, name)}
					onSave={(e) => void editor.save(e)}
					onCancel={() => editor.cancelEditing()}
					loading={rosterState.householdLoading}
					exists={Boolean(rosterState.household)}
				/>
			{/if}

			{#if rosterState.activeEntry}
				<ExclusionsCard
					loading={rosterState.householdLoading}
					editing={editor.editing}
					saving={editor.saving}
					shownSet={editor.shownExclusionSet}
					dirty={editor.exclusionsDirty}
					impactMeals={editor.impactMeals}
					impactPending={editor.impactPending}
					impactError={editor.impactError}
					onToggleCell={(day, slot, value) =>
						editor.setCells([{ day, slot }], value)}
					onToggleSlot={(slot, value) =>
						editor.setSlotExcluded(slot, value)}
					slotExcludedCount={(slot) =>
						editor.slotExcludedCount(slot)}
				/>
			{/if}

			<ExclusionConfirmDialog
				open={editor.confirmExclusionsOpen}
				impactMeals={editor.impactMeals}
				saving={editor.saving}
				onOpen={(v) => (editor.confirmExclusionsOpen = v)}
				onConfirm={() => void editor.save()}
			/>

			<HouseholdListCard
				entries={rosterState.entries}
				activeHouseholdId={session.session?.householdId ?? null}
				activeMemberId={session.session?.memberId ?? null}
				pendingKey={editor.pendingHouseholdKey}
				activeKey={editor.activeHouseholdKey}
				editing={editor.editing}
				onSelect={(key) => editor.selectHousehold(key)}
				onLeave={(entry) => void households.leaveHousehold(entry)}
			/>

			<JoinCreateCard
				joinCode={households.joinCode}
				newHouseholdName={households.newHouseholdName}
				joinError={households.joinError}
				createError={households.createError}
				onJoinCode={(v) => (households.joinCode = v)}
				onNewName={(v) => (households.newHouseholdName = v)}
				onJoin={(e) => void households.joinHousehold(e)}
				onCreate={(e) => void households.createHousehold(e)}
			/>
			{#if rosterState.activeEntry && !header.visible}
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
