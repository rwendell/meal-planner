<script lang="ts">
	import BanIcon from "@lucide/svelte/icons/ban";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { useMutation, useQuery } from "convex-svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { toast } from "svelte-sonner";
	import MealPicker from "$lib/components/MealPicker.svelte";
	import PlannerHero from "$lib/components/PlannerHero.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import {
		formatMonthDay,
		formatShort,
		todayISO,
		weekDates,
		weekdayLabel,
		weekLabel,
		weekLabelShort,
	} from "$lib/dates.js";
	import { errorMessage } from "$lib/errors.js";
	import { excludedCellSet, weekdayIndex } from "$lib/exclusions.js";
	import {
		displayMealTime,
		fallbackMealTimes,
		MEAL_TYPES,
		type MealCategory,
		type MealType,
	} from "$lib/meal-types.js";
	import { memberColor } from "$lib/members.js";
	import { plannerView } from "$lib/planner-view.svelte.js";
	import { plannerWeek } from "$lib/planner-week.svelte.js";
	import { session } from "$lib/session.svelte.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";
	import ListPlanSection from "./ListPlanSection.svelte";

	interface Meal {
		id: string;
		name: string;
		category: MealCategory;
		note: string;
		time: number | null | undefined;
		color: string;
		ingredientCount: number;
		mealTimes: MealType[];
	}

	const today = todayISO();
	const wideScreen = new MediaQuery("(min-width: 1024px)", true);

	let anchorDate = $derived(plannerWeek.anchor);
	let pickerTarget = $state<{
		date: string;
		dayLabel: string;
		slot: MealType;
		slotLabel: string;
	} | null>(null);
	let effectiveView = $derived(
		wideScreen.current ? "week" : plannerView.view,
	);

	let visibleDates = $derived(
		effectiveView === "day" ? [anchorDate] : weekDates(anchorDate),
	);
	let currentWeek = $derived(weekDates(anchorDate));

	let householdId = $derived(session.session?.householdId ?? null);
	let selfMemberId = $derived(session.session?.memberId ?? null);

	const householdQuery = useQuery(api.households.get, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	let members = $derived(householdQuery.data?.members ?? []);
	let viewingMemberId = $state<string | null>(null);
	let selfIsManager = $derived(
		!householdQuery.data?.household.ownerId ||
			householdQuery.data?.household.ownerId === selfMemberId,
	);
	let canManageOthers = $derived(
		Boolean(householdQuery.data?.household.ownerManagesPlans) &&
			selfIsManager,
	);
	let showMemberToggle = $derived(members.length > 1);
	let viewingMember = $derived(
		members.find((m) => m._id === (viewingMemberId ?? selfMemberId)) ??
			null,
	);
	// Anyone may look at other members' plans, but edits are limited
	// to your own — unless the household lets the owner manage
	// everyone's plans.
	let canEditViewing = $derived(
		!viewingMember || viewingMember._id === selfMemberId || canManageOthers,
	);
	// Each member owns their own planner view: the mode shown follows
	// whoever you're viewing, and the toggle only ever writes your own
	// row, so other members' views are respected.
	let mode = $derived(viewingMember?.plannerMode ?? "planner");
	let isSelfView = $derived(
		viewingMember !== null && viewingMember._id === selfMemberId,
	);
	let savingMode = $state(false);
	// The viewed member's opted-out (weekday, slot) cells. Exclusions
	// apply to every displayed date, past or future: a fully excluded
	// day or slot column is hidden outright, other excluded cells
	// render grayed out. (Past plans are only unplanned from the save
	// date onward, so hidden past meals still exist underneath.)
	let exclusionSet = $derived(
		excludedCellSet(viewingMember?.excludedCells),
	);
	function cellExcluded(date: string, slot: MealType): boolean {
		return exclusionSet.has(`${weekdayIndex(date)}:${slot}`);
	}
	function dayFullyExcluded(date: string): boolean {
		return MEAL_TYPES.every((type) => cellExcluded(date, type.id));
	}
	function visibleSlotTypes(dates: string[]): typeof MEAL_TYPES {
		return MEAL_TYPES.filter((type) =>
			dates.some((date) => !cellExcluded(date, type.id)),
		);
	}
	let displayWeekDates = $derived(
		currentWeek.filter((date) => !dayFullyExcluded(date)),
	);
	let daySlotTypes = $derived(visibleSlotTypes([anchorDate]));
	let weekSlotTypes = $derived(visibleSlotTypes(displayWeekDates));

	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const daysQuery = useQuery(api.plan.getDays, () =>
		householdId && viewingMember
			? {
					householdId: householdId as Id<"households">,
					memberId: viewingMember._id,
					dates: mode === "list" ? currentWeek : visibleDates,
				}
			: "skip",
	);

	const setSlot = useMutation(api.plan.setSlot);
	const clearDayMutation = useMutation(api.plan.clearDay);
	const setPlannerMode = useMutation(api.households.setPlannerMode);

	async function setMode(next: "planner" | "list"): Promise<void> {
		if (
			!householdId ||
			!selfMemberId ||
			!isSelfView ||
			savingMode ||
			next === mode
		)
			return;
		savingMode = true;
		try {
			await setPlannerMode({
				householdId: householdId as Id<"households">,
				memberId: selfMemberId as Id<"householdMembers">,
				callerMemberId: selfMemberId as Id<"householdMembers">,
				mode: next,
			});
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't change your view."));
		} finally {
			savingMode = false;
		}
	}

	let meals = $derived<Meal[]>(
		(mealsQuery.data ?? []).map((meal) => ({
			id: meal._id,
			name: meal.name,
			category: meal.category,
			note: meal.note,
			time: meal.time,
			color: meal.color,
			ingredientCount: meal.ingredients.length,
			mealTimes: meal.mealTimes ?? fallbackMealTimes(meal.category),
		})),
	);

	let planMap = $derived.by(() => {
		const map = new Map<string, Record<MealType, string | null>>();
		for (const date of visibleDates) {
			map.set(date, {
				breakfast: null,
				lunch: null,
				dinner: null,
				snack: null,
			});
		}
		for (const row of daysQuery.data ?? []) {
			map.set(row.date, {
				breakfast: row.breakfast,
				lunch: row.lunch,
				dinner: row.dinner,
				snack: row.snack ?? null,
			});
		}
		return map;
	});

	let viewHeading = $derived(
		mode === "list"
			? wideScreen.current
				? weekLabel(currentWeek)
				: weekLabelShort(currentWeek)
			: effectiveView === "day"
				? formatMonthDay(anchorDate)
				: wideScreen.current
					? weekLabel(currentWeek)
					: weekLabelShort(currentWeek),
	);

	let dataError = $derived(
		mealsQuery.error ?? daysQuery.error ?? householdQuery.error,
	);

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

	// Whole-household rows for the picker's date, so meals other
	// members picked for the same slot get an indicator.
	const pickerDayQuery = useQuery(api.plan.getDays, () =>
		householdId && pickerTarget
			? {
					householdId: householdId as Id<"households">,
					dates: [pickerTarget.date],
				}
			: "skip",
	);

	let othersByMeal = $derived.by(() => {
		const map = new Map<string, string[]>();
		const target = pickerTarget;
		if (!target) return map;
		for (const row of pickerDayQuery.data ?? []) {
			if (row.memberId === selfMemberId) continue;
			const value = row[target.slot] ?? null;
			if (value === null || value === "skip") continue;
			const member = members.find((m) => m._id === row.memberId);
			if (!member) continue;
			const names = map.get(value) ?? [];
			if (!names.includes(member.name)) names.push(member.name);
			map.set(value, names);
		}
		return map;
	});

	function mealById(id: string | null): Meal | null {
		return id ? (meals.find((meal) => meal.id === id) ?? null) : null;
	}

	function slotMeal(date: string, slot: MealType): Meal | null {
		return mealById(planMap.get(date)?.[slot] ?? null);
	}

	function isSkipped(date: string, slot: MealType): boolean {
		return planMap.get(date)?.[slot] === "skip";
	}

	function dayMealCount(date: string): number {
		return Object.values(
			planMap.get(date) ?? {
				breakfast: null,
				lunch: null,
				dinner: null,
				snack: null,
			},
		).filter(Boolean).length;
	}

	function dayLabel(date: string): string {
		return `${weekdayLabel(date)}, ${formatShort(date)}`;
	}

	function openPicker(date: string, slot: MealType): void {
		const slotLabel =
			MEAL_TYPES.find((type) => type.id === slot)?.label ?? slot;
		pickerTarget = { date, dayLabel: dayLabel(date), slot, slotLabel };
	}

	function closePicker(): void {
		pickerTarget = null;
	}

	function ownerSuffix(): string {
		if (!viewingMember || viewingMember._id === selfMemberId) return "";
		return ` for ${viewingMember.name}`;
	}

	function planTarget(): {
		householdId: Id<"households">;
		memberId: Id<"householdMembers">;
		callerMemberId: Id<"householdMembers">;
	} | null {
		if (!householdId || !viewingMember || !selfMemberId) return null;
		return {
			householdId: householdId as Id<"households">,
			memberId: viewingMember._id,
			callerMemberId: selfMemberId as Id<"householdMembers">,
		};
	}

	async function runPlanMutation(
		action: () => Promise<unknown>,
		successMessage: () => string,
	): Promise<boolean> {
		try {
			await action();
			toast.success(successMessage());
			return true;
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't update the plan."));
			return false;
		}
	}

	async function assignToSlot(mealId: string): Promise<void> {
		if (!pickerTarget) return;
		const target = planTarget();
		if (!target) return;
		const { date, slot, dayLabel: label } = pickerTarget;
		const ok = await runPlanMutation(
			() =>
				setSlot({
					...target,
					date,
					slot,
					mealId: mealId as Id<"meals">,
				}),
			() =>
				`${meals.find((item) => item.id === mealId)?.name ?? "Meal"} added to ${label}${ownerSuffix()}`,
		);
		if (ok) closePicker();
	}

	async function assignCreatedMeal(
		mealId: string,
		name: string,
	): Promise<void> {
		if (!pickerTarget) return;
		const target = planTarget();
		if (!target) return;
		const { date, slot, dayLabel: label } = pickerTarget;
		const ok = await runPlanMutation(
			() =>
				setSlot({
					...target,
					date,
					slot,
					mealId: mealId as Id<"meals">,
				}),
			() => `${name} added to ${label}${ownerSuffix()}`,
		);
		if (ok) closePicker();
	}

	async function skipSlot(): Promise<void> {
		if (!pickerTarget) return;
		const target = planTarget();
		if (!target) return;
		const { date, slot, dayLabel: label, slotLabel } = pickerTarget;
		const ok = await runPlanMutation(
			() => setSlot({ ...target, date, slot, mealId: "skip" }),
			() => `${slotLabel} on ${label} skipped${ownerSuffix()}`,
		);
		if (ok) closePicker();
	}

	async function unskipSlot(date: string, slot: MealType): Promise<void> {
		const target = planTarget();
		if (!target) return;
		const label =
			MEAL_TYPES.find((type) => type.id === slot)?.label ?? slot;
		await runPlanMutation(
			() => setSlot({ ...target, date, slot, mealId: null }),
			() =>
				`${label} on ${dayLabel(date)} back to unplanned${ownerSuffix()}`,
		);
	}

	async function removeMeal(date: string, slot: MealType): Promise<void> {
		const target = planTarget();
		if (!target) return;
		const meal = slotMeal(date, slot);
		if (!meal) return;
		await runPlanMutation(
			() => setSlot({ ...target, date, slot, mealId: null }),
			() => `${meal.name} removed from ${dayLabel(date)}${ownerSuffix()}`,
		);
	}

	async function clearDay(date: string): Promise<void> {
		const target = planTarget();
		if (!target) return;
		if (dayMealCount(date) === 0) return;
		await runPlanMutation(
			() =>
				clearDayMutation({
					householdId: target.householdId,
					memberId: target.memberId,
					callerMemberId: target.callerMemberId,
					date,
				}),
			() => `${dayLabel(date)} cleared${ownerSuffix()}`,
		);
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape" && pickerTarget) closePicker();
	}
</script>

{#snippet familySelector()}
	<ToggleGroup.Root
		type="single"
		variant="outline"
		value={viewingMemberId ?? selfMemberId ?? ""}
		aria-label="Whose plan"
		onValueChange={(value) => {
			if (value) viewingMemberId = value;
		}}
	>
		{#each members as member (member._id)}
			<ToggleGroup.Item value={member._id} aria-label={member.name}>
				<span
					class="size-2.5 flex-none rounded-full"
					style={`background: ${memberColor(members, member._id)}`}
				></span>{member.name}</ToggleGroup.Item
			>
		{/each}
	</ToggleGroup.Root>
{/snippet}

{#snippet viewControls()}
	{#if showMemberToggle || isSelfView}
		<Card.Header>
			<div class="flex flex-wrap items-center justify-between gap-2.5">
				{#if showMemberToggle}
					{@render familySelector()}
				{/if}
				{#if isSelfView}
					<ToggleGroup.Root
						type="single"
						variant="outline"
						size="sm"
						value={mode}
						aria-label="Planner view"
						onValueChange={(value) => {
							if (value === "planner" || value === "list") {
								void setMode(value);
							}
						}}
					>
						<ToggleGroup.Item value="planner" disabled={savingMode}>
							Planner
						</ToggleGroup.Item>
						<ToggleGroup.Item value="list" disabled={savingMode}>
							List
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				{/if}
			</div>
		</Card.Header>
	{/if}
{/snippet}

<svelte:window onkeydown={onKeydown} />

<main
	class="mx-auto flex max-w-[1180px] flex-col gap-4 px-[18px] pt-5 pb-[72px] min-[560px]:px-7 min-[560px]:pt-6 min-[560px]:pb-20 lg:px-7 lg:pt-7 lg:pb-20"
>
	<PlannerHero
		heading={viewHeading}
		dayStep={mode === "planner" && effectiveView === "day"}
	/>

	{#if mode === "planner"}
		<Card.Root>
			{@render viewControls()}
			<Card.Content>
				{#if effectiveView === "day"}
					<div
						class="grid max-w-[560px] gap-[14px] lg:max-w-none lg:grid-cols-3 lg:items-start"
					>
						<div
							class="flex items-start justify-between gap-3 lg:col-span-full"
						>
							<h2 class="m-0 text-[22px]">
								{weekdayLabel(anchorDate)}
							</h2>
							{#if anchorDate === today}
								<Badge>Today</Badge>
							{/if}
						</div>
						{#if dayFullyExcluded(anchorDate)}
							<div
								class="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5 opacity-70"
								title="Excluded in planner settings"
							>
								<p
									class="m-0 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
								>
									<BanIcon size={13} /> No planning on {weekdayLabel(
										anchorDate,
									)}
								</p>
							</div>
						{:else}
							{#each daySlotTypes as type (type.id)}
								{@const meal = slotMeal(anchorDate, type.id)}
								<div class="grid gap-2">
									<h3
										class="m-0 text-[11px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase"
									>
										{type.label}
									</h3>
									{#if cellExcluded(anchorDate, type.id)}
										<div
											class="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5 opacity-70"
											title="Excluded in planner settings"
										>
											<p
												class="m-0 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
											>
												<BanIcon size={12} /> Excluded
											</p>
										</div>
									{:else if isSkipped(anchorDate, type.id)}
									<div
										class="flex items-center justify-between gap-3 rounded-[14px] border border-solid border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5"
									>
										<p
											class="m-0 text-xs font-bold text-muted-foreground"
										>
											Skipped
										</p>
										{#if canEditViewing}
											<button
												type="button"
												class="flex w-auto min-h-[34px] items-center gap-[5px] rounded-[9px] border border-solid border-border bg-transparent px-2.5 py-[7px] text-[10px] font-extrabold text-muted-foreground hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-primary"
												onclick={() =>
													openPicker(
														anchorDate,
														type.id,
													)}
												><PlusIcon size={11} /> Change</button
											>
											<button
												type="button"
												class="m-[-2px_-3px_0_0] grid size-[18px] flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:text-foreground"
												aria-label={`Unskip ${type.label}`}
												title="Back to unplanned"
												onclick={() =>
													unskipSlot(
														anchorDate,
														type.id,
													)}
												><XIcon size={11} /></button
											>
										{/if}
									</div>
								{:else if meal}
									{@const prepTime = displayMealTime(
										meal.time,
									)}
									<div
										class="flex items-start justify-between gap-3 rounded-[14px] border border-solid px-[14px] py-[13px] text-foreground [border-color:color-mix(in_srgb,var(--meal-color)_30%,var(--border))] [border-left:4px_solid_var(--meal-color)] [background:color-mix(in_srgb,var(--meal-color)_12%,var(--card))]"
										style={`--meal-color: ${meal.color}`}
									>
										<div class="min-w-0">
											<strong class="block text-sm leading-[1.2]"
												>{meal.name}</strong
											>
											<p
												class="m-0 mt-[5px] mb-[10px] text-xs leading-[1.4] text-muted-foreground [overflow-wrap:anywhere]"
											>
												{meal.note || "No note added"}
											</p>
											<div class="flex flex-wrap gap-1.5">
												{#if prepTime}<Badge
														variant="secondary"
														>{prepTime}</Badge
													>{/if}
												<Badge variant="outline">
													{meal.ingredientCount > 0
														? `${meal.ingredientCount} ingredient${meal.ingredientCount === 1 ? "" : "s"}`
														: "No groceries"}
												</Badge>
											</div>
										</div>
										{#if canEditViewing}
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={`Remove ${meal.name} from ${type.label}`}
												title={`Remove ${meal.name}`}
												onclick={() =>
													removeMeal(
														anchorDate,
														type.id,
													)}><XIcon /></Button
											>
										{/if}
									</div>
								{:else}
									<div
										class="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5"
									>
										<p
											class="m-0 text-xs font-bold text-muted-foreground"
										>
											No meal planned
										</p>
										{#if canEditViewing}
											<Button
												variant="outline"
												size="sm"
												onclick={() =>
													openPicker(
														anchorDate,
														type.id,
													)}
												><PlusIcon
													data-icon="inline-start"
												/> Add meal</Button
											>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
						{/if}
					</div>
				{:else}
					<div class="overflow-x-auto pb-2 [scrollbar-width:thin] max-lg:overflow-visible max-lg:pb-0">
						{#if displayWeekDates.length === 0}
							<div
								class="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5 opacity-70"
								title="Excluded in planner settings"
							>
								<p
									class="m-0 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
								>
									<BanIcon size={13} /> This whole week is excluded
								</p>
							</div>
						{:else}
							<div
								class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 lg:gap-2.5 lg:[grid-template-columns:repeat(var(--day-count),minmax(0,1fr))]"
								style={`--day-count: ${displayWeekDates.length}`}
							>
								{#each displayWeekDates as date (date)}
								<article
									class={date === today
										? "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-2xl border border-primary bg-card p-3 shadow-[0_8px_24px_rgba(23,34,31,0.06)] lg:block lg:p-2"
										: "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-2xl border border-border bg-[color-mix(in_srgb,var(--card)_50%,transparent)] p-3 lg:block lg:p-2"}
								>
									<div
										class="flex w-full flex-row items-baseline justify-between gap-2 border-0 bg-transparent text-left text-muted-foreground lg:grid lg:grid-cols-[1fr_auto]"
									>
										<span
											class={date === today
												? "text-[10px] font-extrabold tracking-[0.14em] text-foreground uppercase"
												: "text-[10px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase"}
											>{weekdayLabel(date)}</span
										>
										{#if date === today}<em
												class="self-start text-[9px] font-extrabold text-destructive not-italic lg:col-start-2 lg:row-start-1"
												>Today</em
											>{/if}
									</div>
									{#each weekSlotTypes as type (type.id)}
										{@const meal = slotMeal(date, type.id)}
										<div class="mt-0 min-w-0 lg:mt-2.5">
											<small
												class="mx-0.5 mt-0 mb-1 block text-[9px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase"
												>{type.label}</small
											>
											{#if cellExcluded(date, type.id)}
												<span
													class="flex min-h-[46px] w-full cursor-default items-center gap-[5px] rounded-[11px] border border-dashed border-border bg-transparent p-2 text-[10px] font-extrabold text-muted-foreground opacity-70"
													title="Excluded in planner settings"
													aria-disabled="true"
													><BanIcon size={11} /> Excluded</span
												>
											{:else if isSkipped(date, type.id)}
												{#if canEditViewing}
													<div class="flex items-center gap-1.5">
														<button
															type="button"
															class="flex min-h-[46px] min-w-0 flex-1 items-center gap-[5px] rounded-[11px] border border-dashed border-border bg-transparent p-2 text-[10px] font-extrabold text-muted-foreground hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-primary"
															onclick={() =>
																openPicker(
																	date,
																	type.id,
																)}
															><PlusIcon
																size={11}
															/> Skipped</button
														>
														<button
															type="button"
															class="m-[-2px_-3px_0_0] grid size-[18px] flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:text-foreground"
															aria-label={`Unskip ${dayLabel(date)} ${type.label}`}
															title="Back to unplanned"
															onclick={() =>
																unskipSlot(
																	date,
																	type.id,
																)}
															><XIcon
																size={11}
															/></button
														>
													</div>
												{:else}
													<span
														class="text-xs text-muted-foreground"
														>Skipped</span
													>
												{/if}
											{:else if meal}
												<div
													class="group flex min-h-[46px] items-start justify-between gap-1.5 rounded-[11px] p-2 text-[10px] leading-[1.25] font-extrabold text-[#32433b]"
													style={`background: ${meal.color}`}
												>
													<span class="min-w-0"
														>{meal.name}{#if meal.ingredientCount === 0}<span
																class="mt-[3px] block text-[8px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
																>No list</span
															>{/if}</span
													>
													{#if canEditViewing}
														<button
															type="button"
															class="m-[-2px_-3px_0_0] grid size-[18px] flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
															aria-label={`Remove ${meal.name} from ${dayLabel(date)} ${type.label}`}
															title={`Remove ${meal.name}`}
															onclick={() =>
																removeMeal(
																	date,
																	type.id,
																)}
															><XIcon
																size={11}
															/></button
														>
													{/if}
												</div>
											{:else if canEditViewing}
												<button
													type="button"
													class="flex min-h-[46px] w-full items-center gap-[5px] rounded-[11px] border border-dashed border-border bg-transparent p-2 text-[10px] font-extrabold text-muted-foreground hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-primary"
													onclick={() =>
														openPicker(
															date,
															type.id,
														)}
													><PlusIcon size={11} /> Add</button
												>
											{:else}
												<span
													class="text-xs text-muted-foreground"
													>Empty</span
												>
											{/if}
										</div>
									{/each}
									{#if canEditViewing && dayMealCount(date) > 0}
										<Button
											variant="ghost"
											size="sm"
											class="mt-2.5 w-full text-[9px] font-extrabold tracking-[0.1em] uppercase"
											onclick={() => clearDay(date)}
											>Clear day</Button
										>
									{/if}
								</article>
							{/each}
						</div>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else if householdId && viewingMember && selfMemberId}
		<Card.Root>
			{@render viewControls()}
			<ListPlanSection
				{householdId}
				memberId={viewingMember._id}
				callerMemberId={selfMemberId}
				week={currentWeek}
				canEdit={canEditViewing}
				excludedCells={viewingMember.excludedCells ?? []}
			/>
		</Card.Root>
	{/if}
</main>

<MealPicker
	open={pickerTarget !== null}
	slot={pickerTarget?.slot ?? null}
	{householdId}
	{meals}
	{othersByMeal}
	showSkip={true}
	title="Choose a meal"
	description={pickerTarget
		? `${pickerTarget.dayLabel} · ${pickerTarget.slotLabel}`
		: ""}
	onClose={closePicker}
	onSelect={assignToSlot}
	onSkip={skipSlot}
	onCreate={assignCreatedMeal}
/>
