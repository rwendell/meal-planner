<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import UserIcon from "@lucide/svelte/icons/user";
	import { useQuery } from "convex-svelte";
	import { resolve } from "$app/paths";
	import MealEditor from "$lib/components/MealEditor.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
	import type {
		MealType,
		PickerMeal,
	} from "$lib/meal-types.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	let {
		open,
		slot,
		householdId,
		meals,
		othersByMeal,
		showSkip = true,
		title = "Choose a meal",
		description = "",
		id = "meal-picker",
		onClose,
		onSelect,
		onSkip,
		onCreate,
	}: {
		open: boolean;
		slot: MealType | null;
		householdId: string | null;
		meals: PickerMeal[];
		othersByMeal?: Map<string, string[]>;
		showSkip?: boolean;
		title?: string;
		description?: string;
		id?: string;
		onClose: () => void;
		onSelect: (mealId: string) => void;
		onSkip?: () => void;
		onCreate?: (mealId: string, name: string) => void;
	} = $props();

	let search = $state("");
	let editorName = $state<string | null>(null);

	// Reset the search and editor whenever the dialog closes.
	$effect(() => {
		if (!open) {
			search = "";
			editorName = null;
		}
	});

	// Full household list for exact-name duplicate safety, even when the
	// provided `meals` are slot-filtered or exclude already-listed items.
	const fullMealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	let pickerMeals = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return meals.filter((meal) => {
			const fitsSlot = !slot || meal.mealTimes.includes(slot);
			const matchesQuery =
				!query ||
				`${meal.name} ${meal.note}`.toLowerCase().includes(query);
			return fitsSlot && matchesQuery;
		});
	});

	function handleSelect(mealId: string): void {
		onSelect(mealId);
	}

	function findExactMatch(name: string): string | null {
		const normalized = name.trim().toLowerCase();
		if (!normalized) return null;
		const fullList = fullMealsQuery.data;
		if (fullList !== undefined) {
			const found = fullList.find(
				(meal) => meal.name.trim().toLowerCase() === normalized,
			);
			if (found) return found._id;
		}
		const provided = meals.find(
			(meal) => meal.name.trim().toLowerCase() === normalized,
		);
		return provided?.id ?? null;
	}

	function openEditor(): void {
		const name = search.trim();
		if (!name || editorName !== null) return;
		// A typed name that already exists selects the existing meal
		// instead of opening the editor, even when it was filtered out
		// of the current picker list.
		const existingId = findExactMatch(name);
		if (existingId) {
			handleSelect(existingId);
			return;
		}
		editorName = name;
	}

	function handleEditorSaved(mealId: string, name: string): void {
		editorName = null;
		search = "";
		if (onCreate) onCreate(mealId, name);
		else onSelect(mealId);
	}

	function handleEditorCancel(): void {
		editorName = null;
	}

	function handleSkip(): void {
		onSkip?.();
	}
</script>

<Dialog.Root
	open={open}
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Dialog.Content data-no-swipe interactOutsideBehavior="ignore">
		<Dialog.Header>
			<Dialog.Title id={`${id}-title`}
				>{editorName !== null ? "Add a meal" : title}</Dialog.Title
			>
			<Dialog.Description
				>{editorName !== null
					? `New meal "${editorName}"${description ? ` · ${description}` : ""}`
					: description}</Dialog.Description
			>
		</Dialog.Header>
		{#if editorName !== null}
			{#key `${id}-${editorName}-${slot ?? "any"}`}
				<MealEditor
					{householdId}
					initialName={editorName}
					initialMealTimes={slot ? [slot] : ["dinner"]}
					existingMeals={meals.map((meal) => ({
						id: meal.id,
						name: meal.name,
					}))}
					idPrefix={`${id}-new`}
					onSaved={handleEditorSaved}
					onCancel={handleEditorCancel}
				/>
			{/key}
		{:else}
			<Input
				bind:value={search}
				placeholder="Search meals"
				aria-label="Search meals"
			/>
			{#if showSkip}
				<Button
					variant="outline"
					class="w-full justify-start gap-2.5"
					onclick={handleSkip}
				>
					<span
						class="size-3 shrink-0 rounded-[4px] border border-dashed border-border bg-transparent"
					></span>
					<span class="min-w-0 flex-1"
						>Skip this meal<small
							class="block text-[10px] font-semibold text-muted-foreground"
							>No cooking, no groceries</small
						></span
					>
				</Button>
			{/if}
			{#if pickerMeals.length}
				<div class="mt-3.5 grid max-h-80 gap-2 overflow-y-auto">
					{#each pickerMeals as meal (meal.id)}
						<Button
							variant="ghost"
							class="h-auto w-full justify-start gap-2.5 px-3 py-2.5 text-left"
							onclick={() => handleSelect(meal.id)}
						>
							<span
								class="size-3 shrink-0 rounded-[4px]"
								style={`background: ${meal.color}`}
							></span>
							<span class="min-w-0 flex-1"
								>{meal.name}<small
									class="block text-[10px] font-semibold text-muted-foreground"
									>{meal.category}</small
								></span
							>
							{@const others = othersByMeal?.get(meal.id)}
							{#if others?.length}
								<span
									class="inline-flex max-w-[38%] min-w-0 items-center gap-1 overflow-hidden text-[11px] font-semibold whitespace-nowrap text-muted-foreground"
									title={`Picked by ${others.join(", ")}`}
								>
									<UserIcon size={13} />
									<span class="overflow-hidden text-ellipsis"
										>{others.join(", ")}</span
									>
								</span>
							{/if}
							<PlusIcon />
						</Button>
					{/each}
				</div>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Media><SearchXIcon /></Empty.Media>
						<Empty.Title>No meals found</Empty.Title>
						<Empty.Description>
							{#if search.trim()}
								No match for "{search.trim()}".
							{:else}
								Add meals in the
								<a href={resolve("/meals")}>meal database</a> first.
							{/if}
						</Empty.Description>
					</Empty.Header>
					{#if search.trim()}
						<Empty.Content>
							<Button onclick={openEditor}
								>Add "{search.trim()}"</Button
							>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
