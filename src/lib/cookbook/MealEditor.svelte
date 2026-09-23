<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import IngredientRows from "$lib/cookbook/IngredientRows.svelte";
	import MealShareToggle from "$lib/cookbook/MealShareToggle.svelte";
	import { hasNameClash, parsePrepMinutes } from "$lib/cookbook/meal-form.js";
	import { errorMessage } from "$lib/utils/errors.js";
	import type { GroceryGroup } from "$lib/utils/grocery.js";
	import {
		ALL_MEAL_TIMES,
		categoryFromMealTimes,
		type MealCategory,
		type MealType,
	} from "$lib/utils/meal-types.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	export interface MealEditorIngredient {
		name: string;
		amount?: string;
		group: GroceryGroup;
	}

	export interface MealEditorEditingMeal {
		id: string;
		category: MealCategory;
		mealTimes: MealType[];
	}

	interface IngredientRow {
		key: number;
		name: string;
		amount: string;
		group: GroceryGroup;
	}

	let {
		householdId,
		initialName = "",
		initialNote = "",
		initialTime = undefined,
		initialSourceUrl = "",
		initialShared = false,
		initialPremade = false,
		initialMealTimes = ["dinner"],
		initialIngredients = [],
		editingMeal = null,
		existingMeals = [],
		idPrefix,
		submitLabel,
		onSaved,
		onCancel,
	}: {
		householdId: string | null;
		initialName?: string;
		initialNote?: string;
		initialTime?: number;
		initialSourceUrl?: string;
		initialShared?: boolean;
		initialPremade?: boolean;
		initialMealTimes?: MealType[];
		initialIngredients?: MealEditorIngredient[];
		editingMeal?: MealEditorEditingMeal | null;
		existingMeals?: { id: string; name: string }[];
		idPrefix?: string;
		submitLabel?: string;
		onSaved: (mealId: string, name: string, shared: boolean) => void;
		onCancel: () => void;
	} = $props();

	const uid = $props.id();
	const prefix = $derived(idPrefix ?? uid);

	let rowKey = 0;
	function blankRow(): IngredientRow {
		rowKey += 1;
		return { key: rowKey, name: "", amount: "", group: "Produce" };
	}

	function getInitialName(): string {
		return initialName;
	}
	function getInitialNote(): string {
		return initialNote;
	}
	function getInitialTime(): string {
		return initialTime === undefined ? "" : String(initialTime);
	}
	function getInitialSourceUrl(): string {
		return initialSourceUrl;
	}
	function getInitialShared(): boolean {
		return initialShared;
	}
	function getInitialPremade(): boolean {
		return initialPremade;
	}
	function getInitialTimes(): MealType[] {
		return initialMealTimes.length > 0 ? [...initialMealTimes] : ["dinner"];
	}
	function getInitialRows(): IngredientRow[] {
		return initialIngredients.length > 0
			? initialIngredients.map((ingredient) => ({
					...blankRow(),
					name: ingredient.name,
					amount: ingredient.amount ?? "",
					group: ingredient.group,
				}))
			: [blankRow()];
	}

	let nameValue = $state(getInitialName());
	let noteValue = $state(getInitialNote());
	let timeValue = $state(getInitialTime());
	let sourceValue = $state(getInitialSourceUrl());
	let shared = $state(getInitialShared());
	let premade = $state(getInitialPremade());
	let selectedTimes = $state<MealType[]>(getInitialTimes());
	let formError = $state("");
	let saving = $state(false);

	let ingredientRows = $state<IngredientRow[]>(getInitialRows());

	const createMeal = useMutation(api.meals.create);
	const updateMeal = useMutation(api.meals.update);

	const fullListQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	function toggleMealTime(time: MealType): void {
		if (selectedTimes.includes(time)) {
			if (selectedTimes.length > 1) {
				selectedTimes = selectedTimes.filter((t) => t !== time);
			}
		} else {
			selectedTimes = [...selectedTimes, time];
		}
	}

	function resolveMealCategory(): MealCategory {
		const current = editingMeal;
		if (
			current &&
			selectedTimes.length === current.mealTimes.length &&
			selectedTimes.every((time) => current.mealTimes.includes(time))
		) {
			return current.category;
		}
		return categoryFromMealTimes(selectedTimes);
	}

	function isNameClash(name: string): boolean {
		const candidates =
			fullListQuery.data !== undefined
				? fullListQuery.data.map((meal) => ({
						id: meal._id,
						name: meal.name,
					}))
				: existingMeals;
		return hasNameClash(name, candidates, editingMeal?.id);
	}

	async function saveMeal(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const name = nameValue.trim();
		if (!name || saving) return;
		if (isNameClash(name)) {
			formError = "A meal with this name already exists.";
			return;
		}
		if (!householdId) return;
		const ingredients = ingredientRows
			.map((row) => ({
				name: row.name.trim(),
				amount: row.amount.trim() || undefined,
				group: row.group,
			}))
			.filter((ingredient) => ingredient.name);
		const household = householdId as Id<"households">;
		const category = resolveMealCategory();
		const prepMinutes = parsePrepMinutes(timeValue);
		saving = true;
		try {
			if (editingMeal) {
				const mealId = await updateMeal({
					id: editingMeal.id as Id<"meals">,
					name,
					category,
					note: noteValue.trim() || undefined,
					time: prepMinutes,
					sourceUrl: sourceValue.trim() || null,
					premade,
					ingredients,
					mealTimes: selectedTimes,
				});
				onSaved(mealId, name, shared);
			} else {
				const mealId = await createMeal({
					householdId: household,
					name,
					category,
					note: noteValue.trim() || undefined,
					time: prepMinutes,
					sourceUrl: sourceValue.trim() || undefined,
					ingredients,
					mealTimes: selectedTimes,
					shared,
					premade,
				});
				onSaved(mealId, name, shared);
			}
		} catch (error) {
			formError = errorMessage(error, "Couldn't save the meal.");
		} finally {
			saving = false;
		}
	}

	let resolvedSubmitLabel = $derived(
		submitLabel ?? (editingMeal ? "Save changes" : "Add meal"),
	);
</script>

<form onsubmit={saveMeal} class="grid gap-3.5" aria-busy={saving}>
	<label
		for={`${prefix}-meal-name`}
		class="grid gap-1.5 text-[11px] font-extrabold text-foreground"
		>Meal name<Input
			id={`${prefix}-meal-name`}
			bind:value={nameValue}
			required
		/></label
	>
	<fieldset class="m-0 grid min-w-0 gap-2 border-0 p-0">
		<legend
			class="mb-2 p-0 text-[11px] font-extrabold text-foreground"
			>Meal times</legend
		>
		<div class="flex flex-wrap gap-2">
			{#each ALL_MEAL_TIMES as time (time)}
				<span class="inline-flex items-center gap-1.5">
					<Checkbox
						checked={selectedTimes.includes(time)}
						onCheckedChange={() => toggleMealTime(time)}
						aria-label={time}
					/>
					<button
						type="button"
						class="cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-foreground capitalize"
						onclick={() => toggleMealTime(time)}
					>
						{time}
					</button>
				</span>
			{/each}
		</div>
	</fieldset>
	<div class="flex items-start gap-2.5">
		<Checkbox
			id={`${prefix}-meal-premade`}
			checked={premade}
			onCheckedChange={(value) => {
				if (typeof value === "boolean") premade = value;
			}}
			class="mt-0.5"
		/>
		<span class="grid gap-0.5">
			<label
				for={`${prefix}-meal-premade`}
				class="cursor-pointer text-sm font-semibold"
				>Premade meal</label
			>
			<span class="text-xs text-muted-foreground">
				Bought ready-made instead of cooked from ingredients
			</span>
		</span>
	</div>
	<label
		for={`${prefix}-meal-note`}
		class="grid gap-1.5 text-[11px] font-extrabold text-foreground"
		>Short description<Input
				id={`${prefix}-meal-note`}
				bind:value={noteValue}
			/></label
		>
	<label
		for={`${prefix}-meal-time`}
		class="grid gap-1.5 text-[11px] font-extrabold text-foreground"
		>Prep time (minutes)
		<Input
			id={`${prefix}-meal-time`}
				type="number"
				bind:value={timeValue}
				min={0}
			max={999}
			step={1}
			autocomplete="off"
		/></label
	>
	<IngredientRows
		bind:rows={ingredientRows}
		{prefix}
		onAdd={() => {
			ingredientRows = [...ingredientRows, blankRow()];
		}}
		onRemove={(key) => {
			ingredientRows = ingredientRows.filter((row) => row.key !== key);
		}}
	/>
	<MealShareToggle
		{prefix}
		{shared}
		onChange={(v) => (shared = v)}
	/>
	{#if formError}
		<p class="m-0 text-xs font-semibold text-destructive" role="alert">
			{formError}
		</p>
	{/if}
	<Dialog.Footer>
		<Button variant="outline" onclick={onCancel} disabled={saving}
			>Cancel</Button
		>
		<Button type="submit" disabled={saving}>{resolvedSubmitLabel}</Button>
	</Dialog.Footer>
</form>
