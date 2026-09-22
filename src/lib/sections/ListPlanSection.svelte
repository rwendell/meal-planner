<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import EditActions from "$lib/components/EditActions.svelte";
	import MealPicker from "$lib/components/MealPicker.svelte";
	import * as Card from "$lib/components/ui/card";
	import { errorMessage } from "$lib/errors.js";
	import {
		type ExcludedCell,
		excludedCellSet,
		weekdayIndex,
	} from "$lib/exclusions.js";
	import {
		type CountedMeal,
		pruneDraftMeals,
		sameCountedMeals,
	} from "$lib/list-plan/list-plan-utils.js";
	import PlanSlotColumn from "$lib/list-plan/PlanSlotColumn.svelte";
	import {
		fallbackMealTimes,
		MEAL_TYPES,
		type MealType,
		type PickerMeal,
	} from "$lib/meal-types.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	type MealSlot = MealType;

	let {
		householdId,
		memberId,
		callerMemberId,
		week,
		canEdit = true,
		excludedCells = [],
	}: {
		householdId: string;
		memberId: string;
		callerMemberId: string;
		week: string[];
		canEdit?: boolean;
		excludedCells?: ExcludedCell[];
	} = $props();

	let exclusionSet = $derived(excludedCellSet(excludedCells));
	function eligibleDates(slot: MealSlot): string[] {
		return week.filter(
			(date) => !exclusionSet.has(`${weekdayIndex(date)}:${slot}`),
		);
	}

	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const daysQuery = useQuery(api.plan.getDays, () =>
		householdId && memberId
			? {
					householdId: householdId as Id<"households">,
					memberId: memberId as Id<"householdMembers">,
					dates: week,
				}
			: "skip",
	);
	const applyList = useMutation(api.listPlans.apply);

	const readyQuery = useQuery(api.pantry.listReady, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	let readyMadeIds = $derived(
		new Set<string>(
			(readyQuery.data ?? [])
				.filter((row) => row.kind !== "eat")
				.map((row) => row.mealId),
		),
	);

	let pickerSlot = $state<MealSlot | null>(null);
	let mealsById = $derived(
		new Map(
			(mealsQuery.data ?? []).map((meal) => [
				meal._id,
				{
					name: meal.name,
					color: meal.color,
					mealTimes:
						meal.mealTimes ?? fallbackMealTimes(meal.category),
				},
			]),
		),
	);

	let reduced = $derived.by(() => {
		const rows = new Map(
			(daysQuery.data ?? []).map((row) => [row.date, row]),
		);
		return MEAL_TYPES.map((slot) => {
			const counts = new Map<Id<"meals">, number>();
			let skipped = 0;
			for (const date of week) {
				const value = rows.get(date)?.[slot.id] ?? null;
				if (value === null) continue;
				if (value === "skip") {
					skipped += 1;
					continue;
				}
				counts.set(value, (counts.get(value) ?? 0) + 1);
			}
			const filled = [...counts.values()].reduce((a, b) => a + b, 0);
			const items = [...counts.entries()]
				.map(([id, days]) => ({ id, days, meal: mealsById.get(id) }))
				.filter(
					(
						entry,
					): entry is typeof entry & {
						meal: NonNullable<typeof entry.meal>;
					} => Boolean(entry.meal),
				)
				.sort((a, b) => b.days - a.days);
			return {
				slot,
				items,
				unplanned: Math.max(
					0,
					eligibleDates(slot.id).length - filled - skipped,
				),
				skipped,
			};
		});
	});

	function plannedMeals(slot: MealSlot): CountedMeal[] {
		const group = reduced.find((entry) => entry.slot.id === slot);
		return (group?.items ?? []).map((item) => ({
			id: item.id,
			count: item.days,
		}));
	}

	function eligibleFor(slot: MealSlot): PickerMeal[] {
		const listed = new Set(
			(editing ? drafts[slot] : plannedMeals(slot)).map(
				(option) => option.id,
			),
		);
		return (mealsQuery.data ?? [])
			.filter((meal) => {
				const times =
					meal.mealTimes ?? fallbackMealTimes(meal.category);
				return times.includes(slot) && !listed.has(meal._id);
			})
			.map((meal) => ({
				id: meal._id,
				name: meal.name,
				category: meal.category,
				note: meal.note,
				color: meal.color,
				mealTimes: meal.mealTimes ?? fallbackMealTimes(meal.category),
			}));
	}

	let editing = $state(false);
	let saving = $state(false);
	let drafts = $state<Record<MealSlot, CountedMeal[]>>({
		breakfast: [],
		lunch: [],
		dinner: [],
		snack: [],
	});

	let dirty = $derived(
		editing &&
			MEAL_TYPES.some(
				(slot) =>
					!sameCountedMeals(plannedMeals(slot.id), drafts[slot.id]),
			),
	);

	function startEdit(): void {
		for (const slot of MEAL_TYPES) {
			drafts[slot.id] = plannedMeals(slot.id).map((meal) => ({
				...meal,
			}));
		}
		editing = true;
	}

	function cancelEdit(): void {
		editing = false;
		closePicker();
	}

	async function saveEdits(): Promise<void> {
		if (!dirty || saving) return;
		saving = true;
		try {
			for (const slot of MEAL_TYPES) {
				const before = plannedMeals(slot.id);
				const after = pruneDraftMeals(drafts[slot.id], mealsById);
				if (sameCountedMeals(before, after)) continue;
				await applyList({
					householdId: householdId as Id<"households">,
					memberId: memberId as Id<"householdMembers">,
					callerMemberId: callerMemberId as Id<"householdMembers">,
					dates: week,
					slot: slot.id,
					meals: after.map((meal) => ({
						mealId: meal.id as Id<"meals">,
						count: meal.count,
					})),
				});
			}
			editing = false;
			closePicker();
			toast.success("Week updated");
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't save the week."));
		} finally {
			saving = false;
		}
	}

	function addDraftMeal(slot: MealSlot, mealId: string): void {
		if (!mealId) return;
		const current = drafts[slot];
		if (current.some((meal) => meal.id === mealId)) return;
		drafts[slot] = [...current, { id: mealId, count: 0 }];
	}

	function openPicker(slot: MealSlot): void {
		pickerSlot = slot;
	}

	function closePicker(): void {
		pickerSlot = null;
	}

	function handlePickerMeal(mealId: string): void {
		if (!pickerSlot) return;
		addDraftMeal(pickerSlot, mealId);
		closePicker();
	}

	let pickerMeals = $derived(pickerSlot ? eligibleFor(pickerSlot) : []);
	let pickerDescription = $derived.by(() => {
		if (!pickerSlot) return "";
		const label =
			MEAL_TYPES.find((type) => type.id === pickerSlot)?.label ??
			pickerSlot;
		return `${label} · ${eligibleDates(pickerSlot).length} days`;
	});

	function handleCountChange(
		slot: MealSlot,
		mealId: string,
		input: HTMLInputElement,
	): void {
		const current = drafts[slot];
		const draft = current.find((meal) => meal.id === mealId);
		if (!draft) return;
		const total = current.reduce((sum, meal) => sum + meal.count, 0);
		const max = eligibleDates(slot).length - (total - draft.count);
		const parsed = Number.parseInt(input.value, 10);
		const count = Number.isNaN(parsed)
			? draft.count
			: Math.min(Math.max(parsed, 0), Math.max(max, 0));
		input.value = String(count);
		drafts[slot] = current.map((meal) =>
			meal.id === draft.id ? { ...meal, count } : { ...meal },
		);
	}

	function removeDraftMeal(slot: MealSlot, mealId: string): void {
		drafts[slot] = drafts[slot].filter((meal) => meal.id !== mealId);
	}
</script>

<Card.Content
	class="grid min-w-0 gap-x-6 gap-y-6 lg:grid-cols-[repeat(4,minmax(0,max-content))] lg:justify-start lg:gap-x-30"
>
	{#each MEAL_TYPES as slot (slot.id)}
		{const eligible = $derived(eligibleDates(slot.id))}
		{#if eligible.length > 0}
			{const rows = $derived(editing ? drafts[slot.id] : plannedMeals(slot.id))}
			{const planned = $derived(rows.reduce((sum, entry) => sum + entry.count, 0))}
			<PlanSlotColumn
				slotLabel={slot.label}
				eligibleCount={eligible.length}
				plannedCount={planned}
				rows={rows.map((entry) => ({
					id: entry.id,
					name: mealsById.get(entry.id as Id<"meals">)?.name ?? "Unknown",
					count: entry.count,
					ready: readyMadeIds.has(entry.id),
				}))}
				{editing}
				{canEdit}
				maxFor={(count) =>
					eligible.length - (planned - count)}
				onRemove={(id) => removeDraftMeal(slot.id, id as Id<"meals">)}
				onCount={(id, input) => handleCountChange(slot.id, id, input)}
				onAdd={() => openPicker(slot.id)}
			/>
		{/if}
	{/each}
	{#if canEdit}
		<EditActions
			{editing}
			disabled={saving}
			saveDisabled={!dirty || saving}
			{saving}
			class="justify-start lg:col-span-full"
			onEdit={startEdit}
			onCancel={cancelEdit}
			onSave={() => void saveEdits()}
		/>
	{/if}
</Card.Content>

<MealPicker
	open={pickerSlot !== null}
	slot={pickerSlot}
	{householdId}
	meals={pickerMeals}
	showSkip={false}
	id="list-meal-picker"
	title="Choose a meal"
	description={pickerDescription}
	onClose={closePicker}
	onSelect={handlePickerMeal}
	onCreate={handlePickerMeal}
/>
