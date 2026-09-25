<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";
	import InviteCode from "$lib/components/InviteCode.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Separator } from "$lib/components/ui/separator";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Switch } from "$lib/components/ui/switch";
	import { cn } from "$lib/utils.js";

	type Member = {
		_id: string;
		name: string;
	};

	let {
		householdName,
		inviteCode,
		members,
		ownerId,
		myId,
		isManager,
		isOwner,
		editing,
		saving,
		householdEdit,
		inviteEdit,
		inviteError,
		ownerPlans,
		ownerReviews,
		onHouseholdEdit,
		onInviteEdit,
		onOwnerPlans,
		onOwnerReviews,
		onRemoveMember,
		onSave,
		onCancel,
		loading,
		exists,
	}: {
		householdName: string;
		inviteCode: string;
		members: Array<Member>;
		ownerId?: string | null;
		myId: string | null;
		isManager: boolean;
		isOwner: boolean;
		editing: boolean;
		saving: boolean;
		householdEdit: string;
		inviteEdit: string;
		inviteError: string;
		ownerPlans: boolean;
		ownerReviews: boolean;
		onHouseholdEdit: (v: string) => void;
		onInviteEdit: (v: string) => void;
		onOwnerPlans: (v: boolean) => void;
		onOwnerReviews: (v: boolean) => void;
		onRemoveMember: (id: string, name: string) => void;
		onSave: (e?: SubmitEvent) => void;
		onCancel: () => void;
		loading: boolean;
		exists: boolean;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Current household</Card.Title>
	</Card.Header>
	<Card.Content class="grid items-start gap-4 sm:grid-cols-2">
		<div class="grid content-start gap-1.5">
			<span
				class="text-xs font-semibold text-muted-foreground"
				>Household name</span
			>
			{#if editing}
				<form
					class="grid gap-2"
					onsubmit={(event) => onSave(event)}
				>
					<Input
						id="household-name"
						value={householdEdit}
						oninput={(event) =>
							onHouseholdEdit(event.currentTarget.value)}
						required
						maxlength={40}
						placeholder="Household name"
						autocomplete="off"
						aria-label="Household name"
						disabled={saving}
						onkeydown={(event) => {
							if (event.key === "Escape") onCancel();
						}}
					/>
				</form>
			{:else}
				<p class="m-0 truncate text-sm font-semibold">
					{householdName}
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
				{#if editing}
					<Input
						id="household-invite-code"
						value={inviteEdit}
						oninput={(event) =>
							onInviteEdit(event.currentTarget.value)}
						required
						maxlength={6}
						placeholder="ABC123"
						autocomplete="off"
						autocapitalize="characters"
						aria-labelledby="household-invite-code-label"
						class="w-28 uppercase tracking-[0.2em]"
						disabled={saving}
						onkeydown={(event) => {
							if (event.key === "Escape") onCancel();
						}}
					/>
				{:else}
					<InviteCode
						code={inviteCode}
					/>
				{/if}
			</div>
			{#if editing && inviteError !== ""}
				<p
					class="m-0 text-xs font-semibold text-destructive"
					role="alert"
				>
					{inviteError}
				</p>
			{/if}
		</div>
		<div class="grid gap-2 sm:col-span-2">
			<span
				class="text-xs font-semibold text-muted-foreground"
			>
				Members · {members.length}
			</span>
			{#if loading}
				<Skeleton class="h-10" />
				<Skeleton class="h-10" />
			{:else if !exists}
				<p class="m-0 text-sm text-muted-foreground">
					This household no longer exists.
				</p>
			{:else if members.length === 0}
				<p class="m-0 text-sm text-muted-foreground">
					No members yet.
				</p>
			{:else}
				<div class="grid w-fit max-w-full gap-1">
					{#each members as member (member._id)}
						{const isSelf = $derived(member._id === myId)}
						<div
							class="flex items-center gap-1.5 rounded-lg py-1.5"
						>
						{#if editing && !isSelf && isManager}
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
												onRemoveMember(
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
							{#if ownerId === member._id}
								<Badge
									variant="secondary"
									class="shrink-0"
									>Owner</Badge
								>
							{/if}
						</div>
					</div>
					{/each}
				</div>
			{/if}
		</div>
		{#if isOwner}
			<Separator class="sm:col-span-2" />
			<div class="grid gap-2 sm:col-span-2">
				<span
					class="text-xs font-semibold text-muted-foreground"
				>
					Owner settings
				</span>
				<div class="flex items-start gap-2.5">
					<Switch
						id="owner-manages-plans"
						checked={ownerPlans}
						onCheckedChange={(value) => {
							if (typeof value === "boolean") {
								onOwnerPlans(value);
							}
						}}
						disabled={!editing || saving}
						aria-label="Plan for everyone"
						class="mt-0.5 shrink-0"
					/>
					<span class="grid gap-0.5">
						<label
							for="owner-manages-plans"
							class={cn(
								"text-sm font-medium",
								editing && !saving && "cursor-pointer",
							)}>Plan for everyone</label
						>
						<span
							class="text-xs text-muted-foreground"
						>
							When on, the owner can switch
							between members' plans and pick
							meals for them. Everyone else only
							ever sees and edits their own plan.
						</span>
					</span>
				</div>
				<div class="flex items-start gap-2.5">
					<Switch
						id="owner-reviews-meals"
						checked={ownerReviews}
						onCheckedChange={(value) => {
							if (typeof value === "boolean") {
								onOwnerReviews(value);
							}
						}}
						disabled={!editing || saving}
						aria-label="Review all leftovers"
						class="mt-0.5 shrink-0"
					/>
					<span class="grid gap-0.5">
						<label
							for="owner-reviews-meals"
							class={cn(
								"text-sm font-medium",
								editing && !saving && "cursor-pointer",
							)}>Review all leftovers</label
						>
						<span
							class="text-xs text-muted-foreground"
						>
							When on, the owner's leftover review
							covers every member's plan instead
							of just their own.
						</span>
					</span>
				</div>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
