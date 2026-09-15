<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import Icon from "$lib/components/Icon.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import * as Select from "$lib/components/ui/select";
	import { errorMessage } from "$lib/errors.js";
	import { type GroceryGroup, groceryGroups } from "$lib/grocery.js";
	import {
		ALL_MEAL_TIMES,
		categoryFromMealTimes,
		type MealCategory,
		type MealType,
	} from "$lib/meal-types.js";
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
		initialTime = "",
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
		initialTime?: string;
		initialMealTimes?: MealType[];
		initialIngredients?: MealEditorIngredient[];
		editingMeal?: MealEditorEditingMeal | null;
		existingMeals?: { id: string; name: string }[];
		idPrefix?: string;
		submitLabel?: string;
		onSaved: (mealId: string, name: string) => void;
		onCancel: () => void;
	} = $props();

	const uid = $props.id();
	const prefix = $derived(idPrefix ?? uid);

	let rowKey = 0;
	function blankRow(): IngredientRow {
		rowKey += 1;
		return { key: rowKey, name: "", amount: "", group: "Produce" };
	}

	// Initial props are snapshots for this keyed-remount instance: the parent
	// resets state via {#key}, so read them inside closures to populate
	// editable state once without tracking later prop updates.
	function getInitialName(): string {
		return initialName;
	}

	function getInitialNote(): string {
		return initialNote;
	}

	function getInitialTime(): string {
		return initialTime;
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
	let selectedTimes = $state<MealType[]>(getInitialTimes());
	let formError = $state("");
	let saving = $state(false);

	let ingredientRows = $state<IngredientRow[]>(getInitialRows());

	const createMeal = useMutation(api.meals.create);
	const updateMeal = useMutation(api.meals.update);

	// Full household list for duplicate-name safety, even when the caller
	// only passes a filtered subset via `existingMeals`.
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

	function hasNameClash(name: string): boolean {
		const normalized = name.trim().toLowerCase();
		if (!normalized) return false;
		const fullList = fullListQuery.data;
		const candidates =
			fullList !== undefined
				? fullList.map((meal) => ({
						id: meal._id,
						name: meal.name,
					}))
				: existingMeals;
		return candidates.some(
			(meal) =>
				meal.id !== editingMeal?.id &&
				meal.name.trim().toLowerCase() === normalized,
		);
	}

	function addIngredientRow(): void {
		ingredientRows.push(blankRow());
	}

	function removeIngredientRow(key: number): void {
		ingredientRows = ingredientRows.filter((row) => row.key !== key);
	}

	async function saveMeal(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const name = nameValue.trim();
		if (!name || saving) return;
		if (hasNameClash(name)) {
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
		saving = true;
		try {
			if (editingMeal) {
				const mealId = await updateMeal({
					id: editingMeal.id as Id<"meals">,
					name,
					category,
					note: noteValue.trim() || undefined,
					time: timeValue.trim(),
					ingredients,
					mealTimes: selectedTimes,
				});
				onSaved(mealId, name);
			} else {
				const mealId = await createMeal({
					householdId: household,
					name,
					category,
					note: noteValue.trim() || undefined,
					time: timeValue.trim(),
					ingredients,
					mealTimes: selectedTimes,
				});
				onSaved(mealId, name);
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
		class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
		>Meal name<Input
			id={`${prefix}-meal-name`}
			bind:value={nameValue}
			required
			placeholder="Crispy chickpea salad"
		/></label
	>
	<fieldset class="times-field">
		<legend>Meal times</legend>
		<div class="time-options">
			{#each ALL_MEAL_TIMES as time (time)}
				<span class="time-pick">
					<Checkbox
						checked={selectedTimes.includes(time)}
						onCheckedChange={() => toggleMealTime(time)}
						aria-label={time}
					/>
					<button type="button" onclick={() => toggleMealTime(time)}>
						{time}
					</button>
				</span>
			{/each}
		</div>
	</fieldset>
	<label
		for={`${prefix}-meal-note`}
		class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
		>Short description<Input
			id={`${prefix}-meal-note`}
			bind:value={noteValue}
			placeholder="A few words to jog your memory"
		/></label
	>
	<label
		for={`${prefix}-meal-time`}
		class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
		>Prep time (optional)<Input
			id={`${prefix}-meal-time`}
			bind:value={timeValue}
			placeholder="e.g. 25 min"
			maxlength={20}
			autocomplete="off"
		/></label
	>
	<div class="ingredient-editor">
		<span class="ingredient-label" id={`${prefix}-ingredients-label`}
			>Ingredients</span
		>
		<div class="ingredient-head" aria-hidden="true">
			<span>Name</span><span>Amount</span><span>Group</span><span></span>
		</div>
		{#each ingredientRows as row, i (row.key)}
			<div class="ingredient-row">
				<Input
					bind:value={row.name}
					placeholder="Flour"
					aria-label={`Ingredient ${i + 1} name`}
				/>
				<Input
					bind:value={row.amount}
					placeholder="1 bag"
					aria-label={`Ingredient ${i + 1} amount`}
				/>
				<Select.Root
					type="single"
					value={row.group}
					onValueChange={(value) => {
						if (value) row.group = value as GroceryGroup;
					}}
				>
					<Select.Trigger aria-label={`Ingredient ${i + 1} group`}>
						<Select.Value placeholder="Group" />
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							{#each groceryGroups as group (group)}<Select.Item
									value={group}
									label={group}
								/>{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Remove ingredient ${i + 1}`}
					onclick={() => removeIngredientRow(row.key)}
					><Icon name="close" size={12} /></Button
				>
			</div>
		{/each}
		<Button
			variant="outline"
			size="sm"
			class="justify-self-start"
			onclick={addIngredientRow}
			><Icon name="plus" size={12} dataIcon="inline-start" /> Add ingredient</Button
		>
	</div>
	{#if formError}
		<p class="m-0 text-xs font-semibold text-destructive" role="alert">{formError}</p>
	{/if}
	<Dialog.Footer>
		<Button variant="outline" onclick={onCancel} disabled={saving}>Cancel</Button>
		<Button type="submit" disabled={saving}>{resolvedSubmitLabel}</Button>
	</Dialog.Footer>
</form>

<style>
	.times-field {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.times-field legend {
		padding: 0;
		font-size: 11px;
		font-weight: 800;
		color: var(--muted-foreground);
	}
	.time-options {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.time-pick {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.time-pick button {
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--foreground);
		font-size: 12px;
		font-weight: 700;
		text-transform: capitalize;
		cursor: pointer;
	}
	.ingredient-editor {
		display: grid;
		gap: 8px;
	}
	.ingredient-label {
		font-size: 11px;
		font-weight: 800;
		color: var(--muted-foreground);
	}
	.ingredient-head {
		display: grid;
		grid-template-columns: 1fr 72px 88px 30px;
		gap: 6px;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.ingredient-row {
		display: grid;
		grid-template-columns: 1fr 72px 88px 30px;
		gap: 6px;
		align-items: center;
	}
</style>
