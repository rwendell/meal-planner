<script lang="ts">
	import TextButton from "$lib/components/TextButton.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Badge } from "$lib/components/ui/badge";
	import * as Card from "$lib/components/ui/card";
	import { refKey } from "$lib/stores/households.svelte.js";
	import { cn } from "$lib/utils.js";

	type Entry = {
		household: { _id: string; name: string; inviteCode: string };
		member: { _id: string; name: string };
		memberCount: number;
		isOwner: boolean;
	};

	let {
		entries,
		activeHouseholdId,
		activeMemberId,
		pendingKey,
		activeKey,
		editing,
		onSelect,
		onLeave,
	}: {
		entries: Array<Entry>;
		activeHouseholdId: string | null;
		activeMemberId: string | null;
		pendingKey: string | null;
		activeKey: string | null;
		editing: boolean;
		onSelect: (key: string) => void;
		onLeave: (entry: Entry) => void;
	} = $props();

	let switchPending = $derived(
		pendingKey !== null && pendingKey !== activeKey,
	);
</script>

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
				{const isActive = $derived(
					entry.household._id === activeHouseholdId &&
						entry.member._id === activeMemberId,
				)}
				{const key = $derived(
					refKey({
						householdId: entry.household._id,
						memberId: entry.member._id,
					}),
				)}
				{const isPending = $derived(
					pendingKey === key && pendingKey !== activeKey,
				)}
				{const highlighted = $derived(isPending || (isActive && !switchPending))}
				<div
					class={cn(
						"flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between",
						highlighted && "border-primary bg-muted/50",
						editing &&
							!highlighted &&
							"transition-colors hover:border-muted-foreground/50",
					)}
				>
					<button
						type="button"
						disabled={!editing}
						aria-pressed={isPending}
						aria-label={isActive && !isPending
							? `Current household: ${entry.household.name}`
							: isPending
								? `Selected household: ${entry.household.name} (applies on save)`
								: editing
									? `Select ${entry.household.name}`
									: entry.household.name}
						onclick={() => {
							onSelect(key);
						}}
						class={cn(
							"grid min-w-0 flex-1 justify-items-start gap-0 text-left",
							editing && "cursor-pointer",
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
									<TextButton
										tone="destructive"
										label="Leave"
										{...props}
									>
										Leave
									</TextButton>
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
											onLeave(entry)}
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
