<script lang="ts">
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import { copyText } from "$lib/clipboard.js";
	import PlannerHero from "$lib/components/PlannerHero.svelte";
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
	// Pages view shows the shared planner hero above the list (and the
	// list follows the hero's week); the dashboard already has the
	// planner's hero, so it opts out.
	let { hero = true }: { hero?: boolean } = $props();
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

<main
	class="mx-auto flex max-w-[1180px] flex-col gap-4 px-[18px] pt-5 pb-[72px] min-[560px]:px-7 min-[560px]:pt-6 min-[560px]:pb-20 lg:px-10 lg:pt-[34px] lg:pb-20"
>
	{#if hero}<PlannerHero />{/if}
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
			<div class="mb-[18px] grid">
				<strong class="font-serif text-[30px] text-foreground"
					>{doneCount}<small class="text-xs text-muted-foreground"
						>/{listItems.length}</small
					></strong
				>
				<Progress value={listPct} class="h-2" />
			</div>
			{#each groupedList as group (group.group)}
				{#if group.items.length}
					<div class="mt-4">
						<h3
							class="m-0 mb-1.5 text-[10px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase"
						>
							{group.group} <span>{group.items.filter((item) => item.checked).length}/{group.items.length}</span>
						</h3>
						{#each group.items as item (item.key)}
							<div
								class="flex min-w-0 flex-1 items-center gap-[9px] rounded-[9px] px-1.5 py-[7px] text-xs text-foreground hover:bg-[color-mix(in_srgb,var(--muted)_45%,transparent)]"
							>
								<Checkbox
									checked={item.checked}
									onCheckedChange={() => toggleItem(item)}
									aria-label={item.name}
								/>
								<button
									type="button"
									class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit"
									onclick={() => toggleItem(item)}
								>
									<span
										class={cn(
											"min-w-0 flex-[0_1_auto]",
											item.checked && "text-muted-foreground line-through",
										)}>{item.name}</span
									>
									{#if item.amount}<small
											class="text-[10px] text-muted-foreground"
											>{item.amount}</small
										>{/if}
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
			<p class="m-0 mt-3 text-[11px] text-muted-foreground">
				Meals without ingredients are skipped automatically.
			</p>
		</Card.Content>
	</Card.Root>
</main>
