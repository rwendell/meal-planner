<script lang="ts">
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import { copyText } from "$lib/clipboard.js";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Empty from "$lib/components/ui/empty";
	import { Progress } from "$lib/components/ui/progress";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { weekDates } from "$lib/dates.js";
	import { type GroceryGroup, groceryGroups } from "$lib/grocery.js";
	import { plannerWeek } from "$lib/planner-week.svelte.js";
	import { session } from "$lib/session.svelte.js";
	import { cn } from "$lib/utils.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	interface GroceryItem {
		key: string;
		name: string;
		amount: string;
		group: GroceryGroup;
		checked: boolean;
	}

	let householdId = $derived(session.session?.householdId ?? null);
	// The unified list covers everyone's plans for the week the planner is
	// on, so planning next week shows next week's groceries.
	let listDates = $derived(weekDates(plannerWeek.anchor));

	const shoppingQuery = useQuery(api.shopping.list, () =>
		householdId
			? {
					householdId: householdId as Id<"households">,
					dates: listDates,
				}
			: "skip",
	);

	const setItemChecked = useMutation(api.shopping.setChecked);

	let listItems = $derived<GroceryItem[]>(
		(shoppingQuery.data ?? []).map((item) => ({
			key: item.key,
			name: item.name,
			amount: item.amount ?? "",
			group: item.group,
			checked: item.checked,
		})),
	);
	let groupedList = $derived(
		groceryGroups.map((group) => ({
			group,
			items: listItems.filter((item) => item.group === group),
		})),
	);
	let doneCount = $derived(listItems.filter((item) => item.checked).length);
	let listPct = $derived(
		listItems.length ? Math.round((doneCount / listItems.length) * 100) : 0,
	);

	let dataLoading = $derived(shoppingQuery.isLoading);
	let dataError = $derived(shoppingQuery.error);

	let lastErrorToasted = "";

	// Surface database errors as a toast. Each distinct error toasts once
	// until it resolves.
	$effect(() => {
		const error = dataError;
		if (error) {
			if (error.message !== lastErrorToasted) {
				lastErrorToasted = error.message;
				toast.error(
					`Couldn't reach the database (${error.message}). Check your connection and reload.`,
				);
			}
		} else {
			lastErrorToasted = "";
		}
	});

	async function toggleItem(item: GroceryItem): Promise<void> {
		if (!householdId) return;
		await setItemChecked({
			householdId: householdId as Id<"households">,
			key: item.key,
			name: item.name,
			amount: item.amount || undefined,
			group: item.group,
			checked: !item.checked,
		});
	}

	function formatList(): string {
		const lines: string[] = [
			`Shopping list (${listItems.length} items)`,
			"",
		];
		for (const group of groupedList) {
			if (group.items.length === 0) continue;
			lines.push(group.group);
			for (const item of group.items) {
				const box = item.checked ? "[x]" : "[ ]";
				lines.push(
					`${box} ${item.name}${item.amount ? ` — ${item.amount}` : ""}`,
				);
			}
			lines.push("");
		}
		return lines.join("\n").trimEnd();
	}

	async function copyList(): Promise<void> {
		const ok = await copyText(formatList());
		if (ok) toast.success("Shopping list copied to clipboard");
		else toast.error("Copy was blocked by the browser");
	}
</script>

<main>
	<Card.Root>
		<Card.Header>
			<Card.Title id="shopping-title">Shopping list</Card.Title>
			{#if listItems.length > 0}
				<Card.Action>
					<Button variant="outline" size="sm" onclick={copyList}
						>Export to clipboard</Button
					>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content>
			{#if dataLoading}
				<div class="grid gap-2" role="status">
					<span class="sr-only">Syncing shopping list</span>
					<Skeleton class="h-4 w-1/3" />
					<Skeleton class="h-4 w-full" />
					<Skeleton class="h-4 w-2/3" />
				</div>
			{/if}
			<div class="list-progress">
				<strong>{doneCount}<small>/{listItems.length}</small></strong>
				<Progress value={listPct} class="h-2" />
			</div>
			{#each groupedList as group (group.group)}
				{#if group.items.length}
					<div class="grocery-group">
						<h3>
							{group.group} <span>{group.items.filter((item) => item.checked).length}/{group.items.length}</span>
						</h3>
						{#each group.items as item (item.key)}
							<div class="grocery-item">
								<Checkbox
									checked={item.checked}
									onCheckedChange={() => toggleItem(item)}
									aria-label={item.name}
								/>
								<button
									type="button"
									class="grocery-text"
									onclick={() => toggleItem(item)}
								>
									<span class={cn(item.checked && "done")}>{item.name}</span>
									{#if item.amount}<small>{item.amount}</small>{/if}
								</button>
							</div>
						{/each}
					</div>
				{/if}
			{/each}
			{#if !dataLoading && listItems.length === 0}
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
			<p class="hint">Meals without ingredients are skipped automatically.</p>
		</Card.Content>
	</Card.Root>
</main>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global(body) {
		min-width: 320px;
	}
	button {
		cursor: pointer;
	}
	main {
		max-width: 1180px;
		margin: 0 auto;
		padding: 20px 18px 72px;
	}
	.list-progress {
		display: grid;
		margin-bottom: 18px;
	}
	.list-progress strong {
		font-family: Georgia, serif;
		font-size: 30px;
		color: var(--foreground);
	}
	.list-progress small {
		font-family: inherit;
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.grocery-group {
		margin-top: 16px;
	}
	.grocery-group h3 {
		margin-bottom: 6px;
		color: var(--muted-foreground);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.grocery-item {
		display: flex;
		flex: 1;
		align-items: center;
		min-width: 0;
		gap: 9px;
		padding: 7px 6px;
		border-radius: 9px;
		font-size: 12px;
		color: var(--foreground);
	}
	.grocery-item:hover {
		background: color-mix(in srgb, var(--muted) 45%, transparent);
	}
	.grocery-text {
		display: flex;
		flex: 1;
		align-items: center;
		min-width: 0;
		gap: 8px;
		border: 0;
		padding: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.grocery-text span {
		flex: 0 1 auto;
		min-width: 0;
	}
	.grocery-text span.done {
		color: var(--muted-foreground);
		text-decoration: line-through;
	}
	.grocery-text small {
		color: var(--muted-foreground);
		font-size: 10px;
	}
	.hint {
		margin: 12px 0 0;
		font-size: 11px;
		color: var(--muted-foreground);
	}

	@media (min-width: 560px) {
		main {
			padding: 24px 28px 80px;
		}
	}

	@media (min-width: 1024px) {
		main {
			padding: 34px 40px 80px;
		}
	}
</style>
