<script lang="ts">
	import { useAuth } from "@mmailaender/convex-auth-svelte/svelte";
	import { beforeNavigate } from "$app/navigation";
	import EditActions from "$lib/components/EditActions.svelte";
	import HouseholdCard from "$lib/profile/HouseholdCard.svelte";
	import { HeaderVisibility } from "$lib/profile/header-visibility.svelte.js";
	import { HouseholdActions } from "$lib/profile/household-actions.svelte.js";
	import JoinCard from "$lib/profile/JoinCard.svelte";
	import MemberCard from "$lib/profile/MemberCard.svelte";
	import ProfileEmptyState from "$lib/profile/ProfileEmptyState.svelte";
	import ProfileHeader from "$lib/profile/ProfileHeader.svelte";
	import ProfileLoadingState from "$lib/profile/ProfileLoadingState.svelte";
	import { ProfileEditor } from "$lib/profile/profile-editor.svelte.js";
	import SkippedConfirmDialog from "$lib/profile/SkippedConfirmDialog.svelte";
	import ExclusionsCard from "$lib/profile/SkippedMealsCard.svelte";
	import { session } from "$lib/stores/session.svelte.js";

	const auth = useAuth();
	const households = new HouseholdActions();
	const editor = new ProfileEditor();
	const header = new HeaderVisibility();

	async function join(event: SubmitEvent): Promise<void> {
		const member = editor.identityMember;
		await households.joinHousehold(
			event,
			editor.identityDisplayName,
			member?.autoNamed !== false,
		);
	}

	async function removeMember(targetId: string, name: string): Promise<void> {
		const viewed = editor.viewedEntry;
		if (!viewed) return;
		await households.removeMemberRow(
			targetId,
			name,
			viewed.household._id,
			viewed.member._id,
		);
	}

	beforeNavigate(async (navigation) => {
		if (!editor.hasUnsavedChanges) return;
		if (
			editor.skipsDirty &&
			(editor.impactMeals > 0 || editor.impactPending)
		) {
			// Removing planned meals needs an explicit yes: stay put and
			// let the normal save flow open the confirm dialog.
			navigation.cancel();
			await editor.save();
			return;
		}
		await editor.save();
	});

	async function leaveViewed(): Promise<void> {
		const entry = editor.viewedEntry;
		if (!entry) return;
		await households.leaveHousehold(entry);
	}
</script>

<svelte:head><title>Profile · Meal Planner</title></svelte:head>

<svelte:window
	onbeforeunload={(event) => {
		if (editor.hasUnsavedChanges) event.preventDefault();
	}}
/>

<main
	class="mx-auto max-w-[1180px] px-[18px] pt-5 pb-[72px] min-[560px]:px-7 min-[560px]:pt-6 min-[560px]:pb-20 lg:px-10 lg:pt-[34px] lg:pb-20"
>
	{#if !session.session}
		<ProfileEmptyState />
	{:else if editor.householdLoading}
		<ProfileLoadingState />
	{:else}
		<div class="grid items-start gap-3 min-[560px]:gap-4">
			<div
				{@attach (element) => header.attach(element)}
				class="flex flex-wrap items-start justify-between gap-3"
			>
				<ProfileHeader
					saving={editor.saving}
					saveDisabled={editor.saveDisabled}
					hasUnsavedChanges={editor.hasUnsavedChanges}
					showActions={Boolean(editor.viewedEntry && header.visible)}
					onCancel={() => editor.cancelEditing()}
					onSave={() => void editor.save()}
				/>
			</div>
			{#if editor.identityEntry}
				<MemberCard
					name={editor.identityDisplayName}
					memberImage={editor.identityMember?.image ?? null}
					saving={editor.saving}
					nameEdit={editor.myNameEdit}
					onNameEdit={(v) => (editor.myNameEdit = v)}
					onSave={(e) => void editor.save(e)}
					onCancel={() => editor.cancelEditing()}
					autoShare={editor.pendingAutoShareMeals}
					showAutoShare={Boolean(editor.identityMember)}
					onAutoShare={(v) => (editor.autoShareMealsDraft = v)}
					showLinkBanner={Boolean(
						auth.isAuthenticated &&
						editor.identityMember &&
						!editor.identityMember.authSubject,
					)}
					linking={households.linkingAccount}
					onLink={() => void households.linkAccount()}
				/>

				<ExclusionsCard
					loading={editor.identityLoading}
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
					slotSkippedCount={(slot) => editor.slotSkippedCount(slot)}
					daySkippedCount={(day) => editor.daySkippedCount(day)}
				/>
			{/if}

			{#if editor.viewedEntry && editor.members.length > 1}
				<HouseholdCard
					inviteCode={editor.viewedEntry.household.inviteCode}
					members={editor.members}
					ownerId={editor.household?.ownerId}
					myId={editor.myId}
					isManager={editor.isManager}
					isOwner={editor.isOwner}
					saving={editor.saving}
					ownerPlans={editor.pendingOwnerManagesPlans}
					ownerReviews={editor.pendingOwnerReviewsMeals}
					allowInvites={editor.pendingAllowMemberInvites}
					onOwnerPlans={(v) => (editor.ownerManagesPlansDraft = v)}
					onOwnerReviews={(v) => (editor.ownerReviewsMealsDraft = v)}
					onAllowInvites={(v) => (editor.allowMemberInvitesDraft = v)}
					onRemoveMember={(id, name) => void removeMember(id, name)}
					onLeave={() => void leaveViewed()}
					exists={Boolean(editor.household)}
				/>
			{/if}

			{#if editor.members.length <= 1}
				<JoinCard
					joinCode={households.joinCode}
					joinError={households.joinError}
					inviteCode={editor.viewedEntry?.household.inviteCode}
					onJoinCode={(v) => (households.joinCode = v)}
					onJoin={(e) => void join(e)}
				/>
			{/if}

			<SkippedConfirmDialog
				open={editor.confirmSkipsOpen}
				impactMeals={editor.impactMeals}
				saving={editor.saving}
				onOpen={(v) => (editor.confirmSkipsOpen = v)}
				onConfirm={() => void editor.save()}
			/>

			{#if editor.viewedEntry && !header.visible}
				<div
					class="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] z-30 px-[18px] sm:bottom-6 sm:px-7"
				>
					<div class="mx-auto flex max-w-[1180px] justify-end">
						<div
							class="rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur"
						>
							<EditActions
								editing={true}
								disabled={editor.saving ||
									!editor.hasUnsavedChanges}
								saveDisabled={editor.saveDisabled}
								saving={editor.saving}
								onEdit={() => {}}
								onCancel={() => editor.cancelEditing()}
								onSave={() => void editor.save()}
							/>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</main>
