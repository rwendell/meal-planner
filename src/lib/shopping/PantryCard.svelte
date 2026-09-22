<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";

	interface PantryItem {
		_id: string;
		name: string;
		amount?: string | null;
	}

	interface Props {
		items: Array<PantryItem>;
		pantryName: string;
		pantryAmount: string;
		pantryError: string;
		onName: (v: string) => void;
		onAmount: (v: string) => void;
		onSubmit: (e: SubmitEvent) => void;
		onRemove: (id: string) => void;
	}

	let {
		items,
		pantryName,
		pantryAmount,
		pantryError,
		onName,
		onAmount,
		onSubmit,
		onRemove
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
		<form class="flex gap-1.5" onsubmit={onSubmit}>
			<Input
				value={pantryName}
				oninput={(event) => onName(event.currentTarget.value)}
				required
				maxlength={80}
				placeholder="Flour"
				autocomplete="off"
				aria-label="Staple name"
				class="min-w-0 flex-1"
			/>
			<Input
				value={pantryAmount}
				oninput={(event) => onAmount(event.currentTarget.value)}
				maxlength={40}
				placeholder="1 bag"
				autocomplete="off"
				aria-label="Staple amount (optional)"
				class="w-24 shrink-0"
			/>
			<Button
				type="submit"
				disabled={!pantryName.trim()}
				class="shrink-0"
				>Add</Button
			>
		</form>
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
						{#if item.amount}<span
								class="shrink-0 text-xs text-muted-foreground"
								>{item.amount}</span
							>{/if}
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
	</Card.Content>
</Card.Root>
