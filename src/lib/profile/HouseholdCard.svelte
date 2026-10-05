<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";
	import InfoTip from "$lib/components/InfoTip.svelte";
	import MemberAvatar from "$lib/components/MemberAvatar.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { Switch } from "$lib/components/ui/switch";

	type Member = {
		_id: string;
		name: string;
		image?: string | null;
	};

	let {
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
		exists,
	}: {
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
			{members.length === 1
				? "You're the only member."
				: `${members.length} people share meals, plans, and one shopping list.`}
		</Card.Description>
	</Card.Header>

	<Card.Content class="grid gap-5">
		<!--
			The roster only. The invite code lives in the profile menu: it is
			need-to-know, and the server already withholds it from members
			who may not see it, so it is not a settings-page concern.
		-->
		<section aria-labelledby="household-members" class="grid gap-2.5">
			<h3 id="household-members" class="m-0 text-sm font-semibold">
				Members
			</h3>

			{#if !exists}
				<p class="m-0 text-sm text-muted-foreground">
					This household no longer exists.
				</p>
			{:else if members.length === 0}
				<p class="m-0 text-sm text-muted-foreground">No members yet.</p>
			{:else}
				<ul class="m-0 grid w-fit max-w-full list-none gap-0.5 p-0">
					{#each members as member (member._id)}
						<li
							class="flex min-w-0 items-center gap-2 rounded-lg py-1"
						>
							<MemberAvatar
								name={member.name}
								image={member.image}
								size="sm"
							/>
							<span class="min-w-0 truncate text-sm">{member.name}</span>
							{#if member._id === myId}
								<Badge variant="secondary" class="shrink-0">
									You
								</Badge>
							{/if}
							{#if member._id === ownerId}
								<Badge variant="secondary" class="shrink-0">
									Owner
								</Badge>
							{/if}
							{#if member._id !== myId && isManager}
								<AlertDialog.Root>
									<AlertDialog.Trigger>
										{#snippet child({ props })}
											<Button
												variant="ghost"
												size="icon-sm"
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
		</section>

		{#if isOwner}
			<!--
				A real separator plus its own heading: these are owner-scoped
				settings, not a continuation of the member list, and the
				previous flat layout made that boundary invisible.
			-->
			<Separator />
			<section
				aria-labelledby="household-owner-permissions"
				class="grid gap-3"
			>
				<h3 id="household-owner-permissions" class="m-0 text-sm font-semibold">
					Owner permissions
				</h3>
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
							<label for={permission.id} class="text-sm font-medium">
								{permission.label}
							</label>
							<InfoTip text={permission.hint} />
						</span>
					</div>
				{/each}
			</section>
		{/if}
	</Card.Content>

	<Card.Footer>
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
					<AlertDialog.Title>Leave this household?</AlertDialog.Title>
					<AlertDialog.Description>
						You'll lose access to this household and your planned meals
						here will be removed.
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
	</Card.Footer>
</Card.Root>