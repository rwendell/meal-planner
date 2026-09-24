<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import PlannerHero from "$lib/components/PlannerHero.svelte";
	import GroceryListCard from "$lib/shopping/GroceryListCard.svelte";
	import PantryCard from "$lib/shopping/PantryCard.svelte";
	import ReadyMealsCard from "$lib/shopping/ReadyMealsCard.svelte";
	import {
		formatShoppingList,
		groupShoppingItems,
		type ShoppingListItem,
		shoppingProgress,
	} from "$lib/shopping/shopping-list.js";
	import { plannerWeek } from "$lib/stores/planner-week.svelte.js";
	import { session } from "$lib/stores/session.svelte.js";
	import { copyText } from "$lib/utils/clipboard.js";
	import { todayISO, weekDates, weekLabel } from "$lib/utils/dates.js";
	import { createDbErrorDeduper } from "$lib/utils/db-errors.js";
	import { downloadTextFile } from "$lib/utils/download.js";
	import { errorMessage } from "$lib/utils/errors.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	let householdId = $derived(session.session?.householdId ?? null);
	let { hero = true }: { hero?: boolean } = $props();
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
			});
			pantryName = "";
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

	let listItems = $derived<ShoppingListItem[]>(
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
	let groupedList = $derived(groupShoppingItems(listItems));
	let progress = $derived(shoppingProgress(listItems));

	let dataLoading = $derived(shoppingQuery.isLoading);
	const dbErrors = createDbErrorDeduper();
	$effect(() => {
		dbErrors.report(shoppingQuery.error);
	});

	async function toggleItem(item: ShoppingListItem): Promise<void> {
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

	async function copyList(): Promise<void> {
		const ok = await copyText(formatShoppingList(listItems, groupedList));
		if (ok) toast.success("Shopping list copied to clipboard");
		else toast.error("Copy was blocked by the browser");
	}

	function downloadList(): void {
		downloadTextFile(
			`shopping-list-${listDates[0] ?? todayISO()}.txt`,
			formatShoppingList(listItems, groupedList),
		);
		toast.success("Shopping list downloaded");
	}

	function printList(): void {
		window.print();
	}

	let printLabel = $derived(`Shopping list · ${weekLabel(listDates)}`);
</script>

<div class="flex flex-col gap-4">
	{#if hero}
		<div class="print:hidden"><PlannerHero /></div>
	{/if}
	<div class="print:hidden">
		<PantryCard
			items={pantryQuery.data ?? []}
			{pantryName}
			{pantryError}
			onName={(v) => (pantryName = v)}
			onSubmit={handleAddPantry}
			onRemove={(id) => void handleRemovePantry(id)}
		/>
	</div>
	<GroceryListCard
		items={listItems}
		grouped={groupedList}
		done={progress.done}
		total={progress.total}
		pct={progress.pct}
		loading={dataLoading}
		{printLabel}
		onToggle={(item) => void toggleItem(item)}
		onCopy={() => void copyList()}
		onDownload={downloadList}
		onPrint={printList}
	>
		<ReadyMealsCard
			{markableMeals}
			readyPick={readyMealPick}
			onPick={(v) => (readyMealPick = v)}
			onMarkReady={handleMarkReady}
			readyRows={readyQuery.data ?? []}
			{naturallyReady}
			onExpiry={(mealId, value) => void handleExpiryChange(mealId, value)}
			onUseUp={(mealId) => void handleUseUpReady(mealId)}
		/>
	</GroceryListCard>
</div>
