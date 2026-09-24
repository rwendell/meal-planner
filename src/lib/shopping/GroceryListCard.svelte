<script lang="ts">
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";
	import type { Snippet } from "svelte";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Empty from "$lib/components/ui/empty";
	import { Progress } from "$lib/components/ui/progress";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import ShoppingExportMenu from "$lib/shopping/ShoppingExportMenu.svelte";
	import type {
		GroupedShoppingItems,
		ShoppingListItem
	} from "$lib/shopping/shopping-list.js";
	import { isDone } from "$lib/shopping/shopping-list.js";
	import { cn } from "$lib/utils.js";

	interface Props {
		items: ShoppingListItem[];
		grouped: GroupedShoppingItems[];
		done: number;
		total: number;
		pct: number;
		loading: boolean;
		/** Heading shown only on paper (the screen hero carries the dates). */
		printLabel?: string;
		onToggle: (item: ShoppingListItem) => void;
		onCopy: () => void;
		onDownload: () => void;
		onPrint: () => void;
		children?: Snippet;
	}

	let {
		items,
		grouped,
		done,
		total,
		pct,
		loading,
		printLabel = "",
		onToggle,
		onCopy,
		onDownload,
		onPrint,
		children
	}: Props = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title id="shopping-title">Shopping list</Card.Title>
		{#if items.length > 0}
			<Card.Action class="print:hidden">
				<ShoppingExportMenu {onCopy} {onDownload} {onPrint} />
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if printLabel}
			<p class="m-0 mb-2 hidden font-serif text-xl print:block">
				{printLabel}
			</p>
		{/if}
		{@render children?.()}
		{#if loading}
			<div class="grid gap-2" role="status">
				<span class="sr-only">Syncing shopping list</span>
				<Skeleton class="h-4 w-1/3" />
				<Skeleton class="h-4 w-full" />
				<Skeleton class="h-4 w-2/3" />
			</div>
		{/if}
		<div class="mb-[18px] grid print:hidden">
			<strong class="font-serif text-[30px] text-foreground"
				>{done}<small class="text-xs text-muted-foreground"
					>/{total}</small
				></strong
			>
			<Progress value={pct} class="h-2" />
		</div>
		{#each grouped as group (group.group)}
			{#if group.items.length}
				<div class="mt-4">
					<h3
						class="m-0 mb-1.5 text-[10px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase"
					>
						{group.group} <span>{group.items.filter(isDone).length}/{group.items.length}</span>
					</h3>
					{#each group.items as item (item.key)}
						{const done = $derived(isDone(item))}
						<div
							class="flex min-w-0 flex-1 items-center gap-[9px] rounded-[9px] px-1.5 py-[7px] text-xs text-foreground hover:bg-[color-mix(in_srgb,var(--muted)_45%,transparent)]"
						>
							<Checkbox
								checked={done}
								disabled={item.coveredBy !== null}
								onCheckedChange={() => onToggle(item)}
								aria-label={item.name}
							/>
							<button
								type="button"
								class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit disabled:cursor-default"
								disabled={item.coveredBy !== null}
								onclick={() => onToggle(item)}
							>
								<span
									class={cn(
										"min-w-0 flex-[0_1_auto]",
										done && "text-muted-foreground line-through"
									)}>{item.name}</span
								>
							{#if item.amount}<small
									class="text-[10px] text-muted-foreground"
									>{item.amount}</small
								>{/if}
							{#if item.coveredBy}<small
									class="text-[10px] font-semibold text-muted-foreground"
									>· {item.coveredBy === "pantry"
										? "on hand"
										: "leftovers"}</small
								>{/if}
							</button>
						</div>
					{/each}
				</div>
			{/if}
		{/each}
		{#if !loading && items.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Media><ShoppingCartIcon /></Empty.Media>
					<Empty.Title>No items yet</Empty.Title>
					<Empty.Description>
						Meals without ingredients are skipped automatically.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
		<p class="m-0 mt-3 text-[11px] text-muted-foreground">
			Meals without ingredients are skipped automatically.
		</p>
	</Card.Content>
</Card.Root>
