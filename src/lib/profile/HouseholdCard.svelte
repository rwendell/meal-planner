<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";
	import InfoTip from "$lib/components/InfoTip.svelte";
	import InviteCode from "$lib/components/InviteCode.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Switch } from "$lib/components/ui/switch";

	type Member = {
		_id: string;
		name: string;
	};

	let {
		inviteCode,
		members,
		ownerId,
		myId,
		isManager,
		isOwner,
		saving,
		ownerPlans,
		ownerReviews,
		allowInvites,
		onOwnerPlans,
		onOwnerReviews,
		onAllowInvites,
		onRemoveMember,
		onLeave,
		loading,
		exists,
	}: {
		inviteCode?: string | null;
		members: Array<Member>;
		ownerId?: string | null;
		myId: string | null;
		isManager: boolean;
		isOwner: boolean;
		saving: boolean;
		ownerPlans: boolean;
		ownerReviews: boolean;
		allowInvites: boolean;
		onOwnerPlans: (v: boolean) => void;
		onOwnerReviews: (v: boolean) => void;
		onAllowInvites: (v: boolean) => void;
		onRemoveMember: (id: string, name: string) => void;
		onLeave: () => void;
		loading: boolean;
		exists: boolean;
	} = $props();

	/**
	 * Owner-only permissions. Data-driven so the three rows stay in sync.
	 * `$derived` is load-bearing: a plain const would pin the initial
	 * prop values and the switches would never reflect a change.
	 */
	const permissions = $derived([
		{
			id: "owner-manages-plans",
			label: "Plan for everyone",
			hint: "When on, the owner can switch between members' plans and pick meals for them. Everyone else only ever sees and edits their own plan.",
			checked: ownerPlans,
			onChange: onOwnerPlans,
		},
		{
			id: "owner-reviews-meals",
			label: "Review all leftovers",
			hint: "When on, the owner's leftover review covers every member's plan instead of just their own.",
			checked: ownerReviews,
			onChange: onOwnerReviews,
		},
		{
			id: "owner-allows-invites",
			label: "Let members invite",
			hint: "When on, every member can see and share the invite code. When off, only the owner can invite.",
			checked: allowInvites,
			onChange: onAllowInvites,
		},
	]);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Household</Card.Title>
		<Card.Description>
			Share meals and plans with your home.
		</Card.Description>
		<Card.Action class="grid w-fit gap-1 justify-items-start">
			{#if inviteCode}
				<span
					id="household-invite-code-label"
					class="text-xs font-semibold text-muted-foreground"
				>
					Invite code
				</span>
				<InviteCode code={inviteCode} />
			{/if}
		</Card.Action>
	</Card.Header>

	<Card.Content class="grid gap-5">
		<div class="grid gap-2">
			<span class="text-xs font-semibold text-muted-foreground">
				Members · {members.length}
			</span>
			{#if loading}
				<Skeleton class="h-9" />
				<Skeleton class="h-9" />
			{:else if !exists}
				<span class="text-sm text-muted-foreground">
					This household no longer exists.
				</span>
			{:else if members.length === 0}
				<span class="text-sm text-muted-foreground">
					No members yet.
				</span>
			{:else}
				<ul class="m-0 grid w-fit max-w-full list-none gap-0.5 p-0">
					{#each members as member (member._id)}
						{const isSelf = $derived(member._id === myId)}
						{const isOwnerRow = $derived(ownerId === member._id)}
						<li class="flex items-center gap-1.5 rounded-lg py-1">
							<span class="truncate text-sm">{member.name}</span>
							{#if isSelf}
								<Badge variant="secondary" class="shrink-0">
									You
								</Badge>
							{/if}
							{#if isOwnerRow}
								<Badge variant="secondary" class="shrink-0">
									Owner
								</Badge>
							{/if}
							{#if !isSelf && isManager}
								<AlertDialog.Root>
									<AlertDialog.Trigger>
										{#snippet child({ props })}
											<Button
												variant="ghost"
												size="icon-sm"
												class="ml-auto"
												aria-label={`Remove ${member.name}`}
												title="Remove from household"
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
											<AlertDialog.Description>
												{member.name} loses access to this
												household, and their planned meals here
												are removed.
											</AlertDialog.Description>
										</AlertDialog.Header>
										<AlertDialog.Footer>
											<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
											<AlertDialog.Action
												variant="destructive"
												onclick={() =>
													onRemoveMember(member._id, member.name)}
											>
												Remove
											</AlertDialog.Action>
										</AlertDialog.Footer>
									</AlertDialog.Content>
								</AlertDialog.Root>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if isOwner}
			<div class="grid gap-3">
				<span class="text-xs font-semibold text-muted-foreground">
					Owner permissions
				</span>
				{#each permissions as permission (permission.id)}
					<div class="flex items-start gap-2.5">
						<Switch
							id={permission.id}
							checked={permission.checked}
							onCheckedChange={(value) => {
								if (typeof value === "boolean") {
									permission.onChange(value);
								}
							}}
							disabled={saving}
							aria-label={permission.label}
							class="mt-0.5 shrink-0"
						/>
						<span class="flex min-w-0 items-center gap-1.5">
							<label
								for={permission.id}
								class="text-sm font-medium"
							>
								{permission.label}
							</label>
							<InfoTip text={permission.hint} />
						</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="flex justify-start">
			<AlertDialog.Root>
				<AlertDialog.Trigger>
					{#snippet child({ props })}
						<Button
							variant="outline"
							size="sm"
							class="text-destructive hover:bg-destructive/10 hover:text-destructive"
							{...props}
						>
							Leave household
						</Button>
					{/snippet}
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>
							Leave this household?
						</AlertDialog.Title>
						<AlertDialog.Description>
							You'll lose access to this household and
							your planned meals here will be removed.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action variant="destructive" onclick={onLeave}>
							Leave
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</div>
	</Card.Content>
</Card.Root>
