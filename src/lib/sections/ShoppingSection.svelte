<script lang="ts">
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";
	import XIcon from "@lucide/svelte/icons/x";
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import { copyText } from "$lib/clipboard.js";
	import PlannerHero from "$lib/components/PlannerHero.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
	import { Progress } from "$lib/components/ui/progress";
	import * as Select from "$lib/components/ui/select";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { todayISO, weekDates } from "$lib/dates.js";
	import { errorMessage } from "$lib/errors.js";
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
		coveredBy: "pantry" | "leftovers" | null;
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
					today: todayISO(),
				}
			: "skip",
	);

	const setItemChecked = useMutation(api.shopping.setChecked);
	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const pantryQuery = useQuery(api.pantry.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const readyQuery = useQuery(api.pantry.listReady, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const addPantryItem = useMutation(api.pantry.add);
	const removePantryItem = useMutation(api.pantry.remove);
	const setReadyMeal = useMutation(api.pantry.setReady);

	let pantryName = $state("");
	let pantryAmount = $state("");
	let pantryError = $state("");
	let readyMealPick = $state<string | null>(null);

	let readyMealIds = $derived(
		new Set<string>((readyQuery.data ?? []).map((row) => row.mealId)),
	);
	let markableMeals = $derived(
		(mealsQuery.data ?? []).filter((meal) => !readyMealIds.has(meal._id)),
	);

	async function handleMarkReady(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!householdId || !readyMealPick) return;
		const picked = (mealsQuery.data ?? []).find(
			(meal) => meal._id === readyMealPick,
		);
		try {
			await setReadyMeal({
				householdId: householdId as Id<"households">,
				mealId: readyMealPick as Id<"meals">,
				on: true,
			});
			readyMealPick = null;
			toast.success(
				picked?.premade
					? "Added to the list — buy it ready-made"
					: "Marked as made — ingredients checked off",
			);
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't mark that meal."));
		}
	}

	async function handleAddPantry(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!householdId || !pantryName.trim()) return;
		pantryError = "";
		try {
			await addPantryItem({
				householdId: householdId as Id<"households">,
				name: pantryName.trim(),
				amount: pantryAmount.trim() || undefined,
			});
			pantryName = "";
			pantryAmount = "";
			toast.success("Added to on-hand staples");
		} catch (error) {
			pantryError = errorMessage(error, "Couldn't add that staple.");
		}
	}

	async function handleRemovePantry(id: string): Promise<void> {
		try {
			await removePantryItem({ id: id as Id<"pantryItems"> });
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't remove that staple."));
		}
	}

	async function handleUseUpReady(mealId: string): Promise<void> {
		if (!householdId) return;
		try {
			await setReadyMeal({
				householdId: householdId as Id<"households">,
				mealId: mealId as Id<"meals">,
				on: false,
			});
			toast.success("Marked as used up");
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't update that meal."));
		}
	}

	async function handleExpiryChange(
		mealId: string,
		expiresOn: string,
	): Promise<void> {
		if (!householdId) return;
		try {
			await setReadyMeal({
				householdId: householdId as Id<"households">,
				mealId: mealId as Id<"meals">,
				on: true,
				expiresOn: expiresOn || null,
			});
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't set the expiry."));
		}
	}

	let listItems = $derived<GroceryItem[]>(
		(shoppingQuery.data?.items ?? []).map((item) => ({
			key: item.key,
			name: item.name,
			amount: item.amount ?? "",
			group: item.group,
			checked: item.checked,
			coveredBy: item.coveredBy,
		})),
	);
	let naturallyReady = $derived(shoppingQuery.data?.naturallyReady ?? []);
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
			<Card.Title>On hand</Card.Title>
			<Card.Description>
				Staples you already own check themselves off the list.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3">
			<form class="flex gap-1.5" onsubmit={handleAddPantry}>
				<Input
					bind:value={pantryName}
					required
					maxlength={80}
					placeholder="Flour"
					autocomplete="off"
					aria-label="Staple name"
					class="min-w-0 flex-1"
				/>
				<Input
					bind:value={pantryAmount}
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
			{#if (pantryQuery.data ?? []).length > 0}
				<ul class="m-0 grid list-none gap-1 p-0">
					{#each pantryQuery.data ?? [] as item (item._id)}
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
								onclick={() => handleRemovePantry(item._id)}
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
			<div class="mb-4">
				<h3
					class="m-0 mb-1.5 text-[10px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase"
				>
					Ready to eat
				</h3>
				<p class="m-0 mb-2 text-[11px] text-muted-foreground">
					Meals already made — their ingredients stay checked off.
				</p>
				<form class="mb-2 flex gap-1.5" onsubmit={handleMarkReady}>
					<Select.Root
						type="single"
						value={readyMealPick ?? undefined}
						items={markableMeals.map((meal) => ({
							value: meal._id,
							label: meal.name,
						}))}
						onValueChange={(value) => {
							readyMealPick = value;
						}}
					>
						<Select.Trigger
							aria-label="Choose a ready-made meal"
							class="min-w-0 flex-1"
						>
							<Select.Value placeholder="Mark a meal ready…" />
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								{#each markableMeals as meal (meal._id)}
									<Select.Item
										value={meal._id}
										label={meal.name}
									/>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
					<Button
						type="submit"
						disabled={!readyMealPick}
						class="shrink-0"
						>Mark</Button
					>
				</form>
				{#if (readyQuery.data ?? []).length > 0 || naturallyReady.length > 0}
					<ul class="m-0 grid list-none gap-2 p-0">
						{#each naturallyReady as name (name)}
							<li
								class="grid items-center gap-1.5 rounded-xl border border-dashed p-2.5"
							>
								<div class="min-w-0">
									<p class="m-0 truncate text-sm font-semibold">
										{name}
									</p>
									<p
										class="m-0 truncate text-xs text-muted-foreground"
									>
										Nothing to buy
									</p>
								</div>
							</li>
						{/each}
						{#each readyQuery.data ?? [] as row (row._id)}
							<li
								class="grid items-center gap-1.5 rounded-xl border p-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
							>
								<div class="min-w-0">
									<p class="m-0 truncate text-sm font-semibold">
										{row.mealName}
									</p>
									{#if row.note}<p
											class="m-0 truncate text-xs text-muted-foreground"
											>{row.note}</p
										>{/if}
								</div>
								<label
									for={`ready-expiry-${row._id}`}
									class="grid gap-1 text-[11px] font-semibold text-muted-foreground"
									>Use by<Input
										id={`ready-expiry-${row._id}`}
										type="date"
										value={row.expiresOn ?? ""}
										onchange={(event) =>
											handleExpiryChange(
												row.mealId,
												event.currentTarget.value,
											)}
										class="w-36"
									/></label
								>
								<Button
									variant="ghost"
									size="sm"
									class="text-muted-foreground hover:text-destructive"
									onclick={() => handleUseUpReady(row.mealId)}
								>
									Use up
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
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
