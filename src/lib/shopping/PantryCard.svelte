<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import SearchCombobox from "$lib/shopping/SearchCombobox.svelte";

	interface PantryItem {
		_id: string;
		name: string;
	}

	interface Props {
		items: Array<PantryItem>;
		suggestions: string[];
		pantryError: string;
		onAdd: (name: string) => void;
		onRemove: (id: string) => void;
		children?: Snippet;
	}

	let {
		items,
		suggestions,
		pantryError,
		onAdd,
		onRemove,
		children
	}: Props = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>On hand</Card.Title>
		<Card.Description>
			Staples you already own check themselves off the list.
		</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-3">
		<SearchCombobox
			options={suggestions.map((name) => ({ value: name, label: name }))}
			placeholder="Add a staple…"
			emptyText="No known ingredients."
			allowCustom
			onSelect={(name) => onAdd(name)}
			onCustom={(name) => onAdd(name)}
		/>
		{#if pantryError}
			<p
				class="m-0 text-xs font-semibold text-destructive"
				role="alert"
			>
				{pantryError}
			</p>
		{/if}
		{#if items.length > 0}
			<ul class="m-0 grid list-none gap-1 p-0">
				{#each items as item (item._id)}
					<li
						class="flex min-w-0 items-center gap-2 text-[13px]"
					>
						<span class="min-w-0 flex-1 truncate font-medium"
							>{item.name}</span
						>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove ${item.name} from on-hand staples`}
							title="Remove"
							onclick={() => onRemove(item._id)}
						>
							<XIcon />
						</Button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="m-0 text-xs text-muted-foreground">
				Nothing logged yet — add flour, rice, oil, and friends.
			</p>
		{/if}
		{@render children?.()}
	</Card.Content>
</Card.Root>
