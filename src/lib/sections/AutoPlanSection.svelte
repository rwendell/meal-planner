<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import Icon from "$lib/components/Icon.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
	type MealCategory = "Breakfast" | "Lunch" | "Dinner" | "Snack";

	interface CountedOption {
		id: Id<"meals">;
		count: number;
	}

	const slotMeta: { id: MealSlot; label: string }[] = [
		{ id: "breakfast", label: "Breakfast" },
		{ id: "lunch", label: "Lunch" },
		{ id: "dinner", label: "Dinner" },
		{ id: "snack", label: "Snack" },
	];

	function fallbackMealTimes(category: MealCategory): MealSlot[] {
		if (category === "Breakfast") return ["breakfast"];
		if (category === "Lunch") return ["lunch"];
		if (category === "Snack") return ["snack"];
		return ["dinner"];
	}

	let {
		householdId,
		memberId,
		callerMemberId,
		week,
		canEdit = true,
	}: {
		householdId: string;
		memberId: string;
		callerMemberId: string;
		week: string[];
		canEdit?: boolean;
	} = $props();

	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const configQuery = useQuery(api.autoPlans.get, () =>
		householdId && memberId
			? {
					householdId: householdId as Id<"households">,
					memberId: memberId as Id<"householdMembers">,
				}
			: "skip",
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
	const setOptions = useMutation(api.autoPlans.setOptions);
	const generate = useMutation(api.autoPlans.generate);

	let optionSearchFocused = $state<Record<MealSlot, boolean>>({
		breakfast: false,
		lunch: false,
		dinner: false,
		snack: false,
	});
	let optionSearch = $state<Record<MealSlot, string>>({
		breakfast: "",
		lunch: "",
		dinner: "",
		snack: "",
	});
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

	function optionsFor(slot: MealSlot): CountedOption[] {
		// Drop options whose meals were deleted; they stop counting and
		// disappear from the list on the next save.
		return (configQuery.data?.[slot] ?? [])
			.filter((option) => mealsById.has(option.mealId))
			.map((option) => ({ id: option.mealId, count: option.count }));
	}

	function eligibleFor(slot: MealSlot): { id: Id<"meals">; name: string }[] {
		const listed = new Set(
			(editing ? drafts[slot] : optionsFor(slot)).map((option) => option.id),
		);
		return (mealsQuery.data ?? [])
			.filter((meal) => {
				const times =
					meal.mealTimes ?? fallbackMealTimes(meal.category);
				return times.includes(slot) && !listed.has(meal._id);
			})
			.map((meal) => ({ id: meal._id, name: meal.name }));
	}

	function matchesFor(slot: MealSlot): { id: Id<"meals">; name: string }[] {
		const query = optionSearch[slot].trim().toLowerCase();
		if (!query) return eligibleFor(slot);
		return eligibleFor(slot).filter((meal) =>
			meal.name.toLowerCase().includes(query),
		);
	}

	let editing = $state(false);
	let saving = $state(false);
	let drafts = $state<Record<MealSlot, CountedOption[]>>({
		breakfast: [],
		lunch: [],
		dinner: [],
		snack: [],
	});

	function sameOptions(a: CountedOption[], b: CountedOption[]): boolean {
		return (
			a.length === b.length &&
			a.every(
				(option, i) =>
					option.id === b[i]?.id && option.count === b[i]?.count,
			)
		);
	}

	let dirty = $derived(
		editing &&
			slotMeta.some(
				(slot) =>
					!sameOptions(optionsFor(slot.id), drafts[slot.id]) ||
					!slotWeekMatches(slot.id),
			),
	);

	function startEdit(): void {
		for (const slot of slotMeta) {
			drafts[slot.id] = optionsFor(slot.id).map((option) => ({
				...option,
			}));
		}
		editing = true;
	}

	function cancelEdit(): void {
		editing = false;
	}

	async function saveEdits(): Promise<void> {
		if (!dirty || saving) return;
		saving = true;
		try {
			for (const slot of slotMeta) {
				const before = optionsFor(slot.id);
				// Zero-count options don't persist — saving prunes them.
				const after = drafts[slot.id].filter(
					(option) => mealsById.has(option.id) && option.count > 0,
				);
				// Apply when the pattern changed or the week drifted from it
				// (fresh weeks, manual-mode edits).
				if (sameOptions(before, after) && slotWeekMatches(slot.id)) {
					continue;
				}
				const ids = {
					householdId: householdId as Id<"households">,
					memberId: memberId as Id<"householdMembers">,
					callerMemberId: callerMemberId as Id<"householdMembers">,
				};
				await setOptions({
					...ids,
					slot: slot.id,
					options: after.map((option) => ({
						mealId: option.id,
						count: option.count,
					})),
				});
				await generate({ ...ids, dates: week, slots: [slot.id] });
			}
			editing = false;
			toast.success("Week updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't save the week.",
			);
		} finally {
			saving = false;
		}
	}

	// New meals join the draft at zero days — dial them up in the list.
	function addDraftOption(slot: MealSlot, mealId: string): void {
		if (!mealId) return;
		optionSearch[slot] = "";
		const current = drafts[slot];
		if (current.some((option) => option.id === mealId)) return;
		drafts[slot] = [...current, { id: mealId as Id<"meals">, count: 0 }];
	}

	function updateDraftCount(
		slot: MealSlot,
		option: CountedOption,
		input: HTMLInputElement,
	): void {
		const current = drafts[slot];
		const total = current.reduce((sum, o) => sum + o.count, 0);
		const max = week.length - (total - option.count);
		const parsed = Number.parseInt(input.value, 10);
		const count = Number.isNaN(parsed)
			? option.count
			: Math.min(Math.max(parsed, 0), Math.max(max, 0));
		input.value = String(count);
		drafts[slot] = current.map((o) =>
			o.id === option.id ? { ...o, count } : { ...o },
		);
	}

	function removeDraftOption(slot: MealSlot, mealId: Id<"meals">): void {
		drafts[slot] = drafts[slot].filter(
			(option) => option.id !== mealId,
		);
	}

	// Whether one slot's week matches its pattern (multiset compare;
	// order only breaks ties when spreading).
	function slotWeekMatches(slot: MealSlot): boolean {
		const group = reduced.find((g) => g.slot.id === slot);
		const actual = new Map(
			(group?.items ?? []).map((item) => [item.id, item.days]),
		);
		const expected = optionsFor(slot);
		if (actual.size !== expected.length) return false;
		return expected.every((option) => actual.get(option.id) === option.count);
	}

	// The day-less reduced view: {meal, slot, day} rows collapse to
	// {meal, slot} with day counts. Missing rows count as unplanned.
	let reduced = $derived.by(() => {
		const rows = new Map(
			(daysQuery.data ?? []).map((row) => [row.date, row]),
		);
		return slotMeta.map((slot) => {
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
					(entry): entry is typeof entry & { meal: NonNullable<typeof entry.meal> } =>
						Boolean(entry.meal),
				)
				.sort((a, b) => b.days - a.days);
			return {
				slot,
				items,
				unplanned: week.length - filled - skipped,
				skipped,
			};
		});
	});
</script>

		<Card.Content class="grid gap-x-6 gap-y-6 lg:grid-cols-[repeat(4,minmax(200px,auto))] lg:justify-start">
		{#each slotMeta as slot (slot.id)}
			{@const rows = editing ? drafts[slot.id] : optionsFor(slot.id)}
			{@const eligible = eligibleFor(slot.id)}
			{@const planned = rows.reduce((sum, option) => sum + option.count, 0)}
			<section aria-label={`${slot.label} options`} class="gap-2">
				<h3
					class="m-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>
					{slot.label} · {planned} of {week.length} days
				</h3>
				{#if rows.length === 0}
					<p class="m-0 text-sm text-muted-foreground">
						Nothing here yet — {canEdit && editing ? "add a meal below." : "no meals planned."}
					</p>
				{:else}
					<ul class="m-0 grid list-none gap-y-1.5 p-0">
						{#each rows as option (option.id)}
							{@const meal = mealsById.get(option.id)}
							{#if meal}
								<li class="flex min-w-0 items-center gap-2 text-sm font-medium">
									<span class="min-w-0 shrink truncate">{meal.name}</span>
									{#if canEdit && editing}
										<input
											type="number"
											min={0}
											max={week.length - (planned - option.count)}
											value={option.count}
											aria-label={`${meal.name} days this week`}
											title="Days this week"
											class="border-input dark:bg-input/30 h-8 w-12 shrink-0 rounded-md border bg-transparent px-1 text-center text-sm font-bold shadow-xs tabular-nums outline-none"
											onchange={(event) =>
												updateDraftCount(slot.id, option, event.currentTarget)}
											onkeydown={(event) => {
												if (event.key === "Enter") event.currentTarget.blur();
												else if (event.key === "Escape") {
													event.currentTarget.value = String(option.count);
													event.currentTarget.blur();
												}
											}}
										/>
										<button
											type="button"
											class="shrink-0 rounded p-1 text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
											aria-label={`Remove ${meal.name} from ${slot.label}`}
											title="Remove"
											onclick={() => removeDraftOption(slot.id, option.id)}
										>
											<Icon name="close" size={14} />
										</button>
									{:else}
										<span class="shrink-0 text-sm font-bold tabular-nums"
											>×{option.count}</span
										>
									{/if}
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
				{#if canEdit && editing && eligible.length > 0}
					<div class="relative w-full max-w-56">
						<Input
							bind:value={optionSearch[slot.id]}
							placeholder="Add a meal…"
							aria-label={`Add a ${slot.label.toLowerCase()} meal`}
							aria-expanded={optionSearchFocused[slot.id]}
							onfocus={() => (optionSearchFocused[slot.id] = true)}
							onblur={() => (optionSearchFocused[slot.id] = false)}
							onkeydown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									const [first] = matchesFor(slot.id);
									if (first) addDraftOption(slot.id, first.id);
								} else if (event.key === "Escape") {
									optionSearch[slot.id] = "";
									event.currentTarget.blur();
								}
							}}
						/>
						{#if optionSearchFocused[slot.id]}
							{@const matches = matchesFor(slot.id)}
							<div
								class="border-input bg-popover absolute inset-x-0 top-full z-20 mt-1 rounded-md border p-1 shadow-md"
							>
								{#if matches.length === 0}
									<p class="m-0 px-2 py-3 text-sm text-muted-foreground">
										No meals match.
									</p>
								{:else}
									<div class="grid max-h-56 gap-0.5 overflow-y-auto">
										{#each matches as meal (meal.id)}
											<Button
												variant="ghost"
												class="h-auto w-full justify-start px-2 py-1.5 text-left"
												onmousedown={(event) => event.preventDefault()}
												onclick={() => addDraftOption(slot.id, meal.id)}
											>
												<span class="min-w-0 flex-1 truncate">{meal.name}</span>
											</Button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</section>
		{/each}
		{#if canEdit}
			<div class="flex flex-wrap justify-start gap-2 lg:col-span-full">
				{#if editing}
					<Button variant="ghost" onclick={cancelEdit} disabled={saving}>
						Cancel
					</Button>
					<Button onclick={saveEdits} disabled={!dirty || saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				{:else}
					<Button variant="outline" onclick={startEdit}>Edit</Button>
				{/if}
			</div>
		{/if}
	</Card.Content>
