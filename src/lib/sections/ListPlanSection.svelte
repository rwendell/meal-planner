<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefrigeratorIcon from "@lucide/svelte/icons/refrigerator";
	import XIcon from "@lucide/svelte/icons/x";
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import EditActions from "$lib/components/EditActions.svelte";
	import MealPicker from "$lib/components/MealPicker.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { errorMessage } from "$lib/errors.js";
	import {
		type ExcludedCell,
		excludedCellSet,
		weekdayIndex,
	} from "$lib/exclusions.js";
	import {
		fallbackMealTimes,
		MEAL_TYPES,
		type MealType,
		type PickerMeal,
	} from "$lib/meal-types.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	type MealSlot = MealType;

	interface CountedMeal {
		id: Id<"meals">;
		count: number;
	}

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

	// Cells opted out of planning never receive meals: sections for
	// fully excluded slots are hidden, and day counts/caps use the
	// eligible days only.
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

	// Meals marked as already made get an icon on their rows.
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

	// What's actually planned this week, collapsed to per-meal day
	// counts, so list mode always mirrors the planner.
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

	function sameMeals(a: CountedMeal[], b: CountedMeal[]): boolean {
		return (
			a.length === b.length &&
			a.every(
				(meal, i) => meal.id === b[i]?.id && meal.count === b[i]?.count,
			)
		);
	}

	let dirty = $derived(
		editing &&
			MEAL_TYPES.some(
				(slot) => !sameMeals(plannedMeals(slot.id), drafts[slot.id]),
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
				// Zero-count meals don't persist — saving prunes them.
				const after = drafts[slot.id].filter(
					(meal) => mealsById.has(meal.id) && meal.count > 0,
				);
				if (sameMeals(before, after)) continue;
				await applyList({
					householdId: householdId as Id<"households">,
					memberId: memberId as Id<"householdMembers">,
					callerMemberId: callerMemberId as Id<"householdMembers">,
					dates: week,
					slot: slot.id,
					meals: after.map((meal) => ({
						mealId: meal.id,
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

	// New meals join the draft at zero days — dial them up in the list.
	function addDraftMeal(slot: MealSlot, mealId: string): void {
		if (!mealId) return;
		const current = drafts[slot];
		if (current.some((meal) => meal.id === mealId)) return;
		drafts[slot] = [...current, { id: mealId as Id<"meals">, count: 0 }];
	}

	function openPicker(slot: MealSlot): void {
		pickerSlot = slot;
	}

	function closePicker(): void {
		pickerSlot = null;
	}

	// Picker selections (existing or newly created meals) join the
	// draft by meal ID; the dialog closes so counts can be dialed up.
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

	function updateDraftCount(
		slot: MealSlot,
		draft: CountedMeal,
		input: HTMLInputElement,
	): void {
		const current = drafts[slot];
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

	function removeDraftMeal(slot: MealSlot, mealId: Id<"meals">): void {
		drafts[slot] = drafts[slot].filter((meal) => meal.id !== mealId);
	}

	// The day-less reduced view: {meal, slot, day} rows collapse to
	// {meal, slot} with day counts. Missing rows count as unplanned.
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
</script>

<Card.Content
	class="grid min-w-0 gap-x-6 gap-y-6 lg:grid-cols-[repeat(4,minmax(0,max-content))] lg:justify-start lg:gap-x-30"
>
	{#each MEAL_TYPES as slot (slot.id)}
		{@const eligible = eligibleDates(slot.id)}
		{#if eligible.length > 0}
			{@const rows = editing ? drafts[slot.id] : plannedMeals(slot.id)}
			{@const planned = rows.reduce((sum, entry) => sum + entry.count, 0)}
			<section
				aria-label={`${slot.label} meals`}
				class="flex flex-col"
				class:gap-y-4={editing}
				class:gap-y-1.5={!editing}
			>
				<h3
					class="m-0 max-w-full text-[11px] font-semibold tracking-[0.08em] break-words text-muted-foreground uppercase"
				>
					{slot.label} · {planned} of {eligible.length} days
				</h3>
			{#if rows.length === 0}
				<p class="m-0 text-sm text-muted-foreground">
					Nothing here yet — {canEdit && editing
						? "add a meal below."
						: "no meals planned."}
				</p>
			{:else}
				<ul
					class="m-0 grid w-fit list-none p-0"
					class:gap-y-4={editing}
					class:gap-y-1.5={!editing}
				>
					{#each rows as entry (entry.id)}
						{@const meal = mealsById.get(entry.id)}
						{#if meal}
							<li
								class="flex space-x-1 place-items-center place-content-between"
							>
								{#if canEdit && editing}
									<button
										type="button"
										class="shrink-0 rounded p-1 text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
										aria-label={`Remove ${meal.name} from ${slot.label}`}
										title="Remove"
										onclick={() =>
											removeDraftMeal(slot.id, entry.id)}
									>
										<XIcon size={14} />
									</button>
								{/if}
							<span class="min-w-0 truncate">{#if readyMadeIds.has(entry.id)}<span
										role="img"
										aria-label={`${meal.name} is already made`}
										title="Already made — no need to shop"
										class="mr-1 inline-block align-[-1px]"
										><RefrigeratorIcon size={13} /></span
									>{/if}{meal.name}</span
							>
								{#if canEdit && editing}
									<span
										class="flex w-20 shrink-0 items-center justify-end gap-0"
									>
										<input
											type="number"
											min={0}
											max={eligible.length -
												(planned - entry.count)}
											value={entry.count}
											aria-label={`${meal.name} days this week`}
											title="Days this week"
											class="border-input dark:bg-input/30 h-8 w-12 shrink-0 rounded-md border bg-transparent px-1 text-center text-sm font-bold shadow-xs tabular-nums outline-none"
											onchange={(event) =>
												updateDraftCount(
													slot.id,
													entry,
													event.currentTarget,
												)}
											onkeydown={(event) => {
												if (event.key === "Enter")
													event.currentTarget.blur();
												else if (
													event.key === "Escape"
												) {
													event.currentTarget.value =
														String(entry.count);
													event.currentTarget.blur();
												}
											}}
										/>
									</span>
								{:else}
									<span
										class="w-12 shrink-0 text-right text-sm font-bold tabular-nums"
										>×{entry.count}</span
									>
								{/if}
							</li>
						{/if}
					{/each}
				</ul>
			{/if}
			{#if canEdit && editing}
				<Button
					variant="outline"
					size="sm"
					aria-label={`Add a ${slot.label.toLowerCase()} meal`}
					onclick={() => openPicker(slot.id)}
				>
					<PlusIcon data-icon="inline-start" /> Add meal
				</Button>
			{/if}
		</section>
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
