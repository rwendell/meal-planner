<script lang="ts">
	import type { Snippet } from "svelte";
	import { Badge } from "$lib/components/ui/badge";
	import * as Card from "$lib/components/ui/card";
	import * as Tabs from "$lib/components/ui/tabs";
	import { refKey } from "$lib/stores/households.svelte.js";
	import type { RosterEntry } from "./roster-state.svelte.js";

	/**
	 * Single households card with tabbed browsing (one tab per
	 * household, cookbook style). The viewed tab drives all edits;
	 * saving commits the viewed household to the session. Panel content
	 * is rendered by the caller and follows the viewed entry.
	 */
	let {
		entries,
		activeKey,
		value,
		onSelect,
		children,
		footer,
	}: {
		entries: RosterEntry[];
		/** Session household key, badged Current. */
		activeKey: string | null;
		/** Controlled tab value (the viewed household key). */
		value: string;
		onSelect: (key: string) => void;
		children?: Snippet;
		footer?: Snippet;
	} = $props();

	function keyOf(entry: RosterEntry): string {
		return refKey({
			householdId: entry.household._id,
			memberId: entry.member._id,
		});
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Households</Card.Title>
		<Card.Description>
			Switch between households, or leave ones you no longer need.
		</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if entries.length === 0}
			<p class="m-0 text-sm text-muted-foreground">
				No households yet — join one below or create a new household.
			</p>
		{:else}
			<Tabs.Root
				{value}
				onValueChange={(next) => {
					if (next) onSelect(next);
				}}
			>
				<Tabs.List aria-label="Households">
					{#each entries as entry (keyOf(entry))}
						{const key = $derived(keyOf(entry))}
						<Tabs.Trigger value={key}>
							{entry.household.name}
							{#if key === activeKey}
								<Badge variant="secondary" class="shrink-0"
									>Current</Badge
								>
							{/if}
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</Tabs.Root>
		{/if}
		{@render children?.()}
		{@render footer?.()}
	</Card.Content>
</Card.Root>
