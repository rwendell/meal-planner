<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { useMutation, useQuery } from "convex-svelte";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import * as Select from "$lib/components/ui/select";
	import { Separator } from "$lib/components/ui/separator";
	import { Switch } from "$lib/components/ui/switch";
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

	/**
	 * The number input binds a string, but Svelte coerces it to a number
	 * at runtime — accept both. Empty/invalid/negative becomes null (no
	 * prep time); anything else is floored to whole minutes.
	 */
	function parsePrepMinutes(value: string | number | null | undefined): number | null {
		if (value === null || value === undefined) return null;
		if (typeof value === "string" && value.trim() === "") return null;
		const minutes = Math.floor(Number(value));
		if (!Number.isFinite(minutes) || minutes < 0) return null;
		return minutes;
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
	<div class="grid gap-2">
		<span
			class="text-[11px] font-extrabold text-foreground"
			id={`${prefix}-ingredients-label`}>Ingredients</span
		>
		<div
			class="grid grid-cols-[1fr_72px_88px_30px] gap-1.5 text-[9px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase"
			aria-hidden="true"
		>
			<span>Name</span><span>Amount</span><span>Group</span><span></span>
		</div>
		{#each ingredientRows as row, i (row.key)}
			<div
				class="grid grid-cols-[1fr_72px_88px_30px] items-center gap-1.5"
			>
				<Input
					bind:value={row.name}
					aria-label={`Ingredient ${i + 1} name`}
				/>
				<Input
					bind:value={row.amount}
					aria-label={`Ingredient ${i + 1} amount`}
				/>
				<Select.Root
					type="single"
					value={row.group}
					items={groceryGroups.map((group) => ({
						value: group,
						label: group,
					}))}
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
					><XIcon /></Button
				>
			</div>
		{/each}
		<Button
			variant="outline"
			size="sm"
			class="justify-self-start"
			onclick={addIngredientRow}
		><PlusIcon data-icon="inline-start" /> Add ingredient</Button>
	</div>
	<Separator />
	<div class="flex items-center justify-between gap-3 rounded-xl border p-3">
		<span class="grid gap-0.5">
			<label
				for={`${prefix}-meal-shared`}
				class="cursor-pointer text-sm font-semibold"
				>Share publicly</label
			>
			<span class="text-xs text-muted-foreground">
				Show in the community cookbook
			</span>
		</span>
		<Switch
			id={`${prefix}-meal-shared`}
			bind:checked={shared}
			aria-label="Share publicly"
		/>
	</div>
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
