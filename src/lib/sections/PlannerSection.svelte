<script lang="ts">
	import { ChevronLeft, ChevronRight } from "@lucide/svelte";
	import BanIcon from "@lucide/svelte/icons/ban";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { useMutation, useQuery } from "convex-svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { toast } from "svelte-sonner";
	import MealPicker from "$lib/components/MealPicker.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import {
		addDays,
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

	function stepView(direction: 1 | -1): void {
		// List mode is always week-based; planner day view steps one day.
		const step =
			mode === "list" || effectiveView !== "day"
				? direction * 7
				: direction;
		plannerWeek.set(addDays(anchorDate, step));
	}

	function goToday(): void {
		plannerWeek.set(today);
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
					class="member-dot"
					style={`background: ${memberColor(members, member._id)}`}
				></span>{member.name}</ToggleGroup.Item
			>
		{/each}
	</ToggleGroup.Root>
{/snippet}

{#snippet viewControls()}
	{#if showMemberToggle || isSelfView}
		<Card.Header>
			<div class="view-controls">
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

<main>
	<Card.Root id="planner" class="bg-muted">
		<Card.Header>
			<Card.Title
				class="font-serif text-[clamp(42px,9vw,64px)] leading-[0.95] tracking-[-0.045em]"
			>
				{viewHeading}
			</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="date-nav">
				<Button
					variant="outline"
					size="icon"
					class="text-[18px] leading-none"
					aria-label={mode === "list" || effectiveView !== "day"
						? "Previous week"
						: "Previous day"}
					onclick={() => stepView(-1)}
				>
					<ChevronLeft />
				</Button>
				<Button variant="outline" size="default" onclick={goToday}
					>Today</Button
				>
				<Button
					variant="outline"
					size="icon"
					class="text-[18px] leading-none"
					aria-label={mode === "list" || effectiveView !== "day"
						? "Next week"
						: "Next day"}
					onclick={() => stepView(1)}><ChevronRight /></Button
				>
			</div>
		</Card.Content>
	</Card.Root>

	{#if mode === "planner"}
		<Card.Root>
			{@render viewControls()}
			<Card.Content>
				{#if effectiveView === "day"}
					<div class="day-detail">
						<div class="day-detail-head">
							<h2 class="m-0 text-[22px]">
								{weekdayLabel(anchorDate)}
							</h2>
							{#if anchorDate === today}
								<Badge>Today</Badge>
							{/if}
						</div>
						{#if dayFullyExcluded(anchorDate)}
							<div
								class="empty-day-slot opacity-70"
								title="Excluded in planner settings"
							>
								<p class="flex items-center gap-1.5">
									<BanIcon size={13} /> No planning on {weekdayLabel(
										anchorDate,
									)}
								</p>
							</div>
						{:else}
							{#each daySlotTypes as type (type.id)}
								{@const meal = slotMeal(anchorDate, type.id)}
								<div class="day-slot">
									<h3>{type.label}</h3>
									{#if cellExcluded(anchorDate, type.id)}
										<div
											class="empty-day-slot opacity-70"
											title="Excluded in planner settings"
										>
											<p class="flex items-center gap-1.5">
												<BanIcon size={12} /> Excluded
											</p>
										</div>
									{:else if isSkipped(anchorDate, type.id)}
									<div class="empty-day-slot skipped">
										<p>Skipped</p>
										{#if canEditViewing}
											<button
												type="button"
												class="empty-slot"
												onclick={() =>
													openPicker(
														anchorDate,
														type.id,
													)}
												><PlusIcon size={11} /> Change</button
											>
											<button
												type="button"
												class="chip-remove"
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
										class="day-meal-card"
										style={`--meal-color: ${meal.color}`}
									>
										<div class="day-meal-content">
											<strong>{meal.name}</strong>
											<p class="day-meal-note">
												{meal.note || "No note added"}
											</p>
											<div class="day-meal-meta">
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
									<div class="empty-day-slot">
										<p>No meal planned</p>
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
					<div class="week-scroll">
						{#if displayWeekDates.length === 0}
							<div
								class="empty-day-slot opacity-70"
								title="Excluded in planner settings"
							>
								<p class="flex items-center gap-1.5">
									<BanIcon size={13} /> This whole week is excluded
								</p>
							</div>
						{:else}
							<div
								class="week-track"
								style={`grid-template-columns: repeat(${displayWeekDates.length}, 148px)`}
							>
								{#each displayWeekDates as date (date)}
								<article
									class="day"
									class:selected={date === today}
								>
									<div class="day-head">
										<span>{weekdayLabel(date)}</span>
										{#if date === today}<em>Today</em>{/if}
									</div>
									{#each weekSlotTypes as type (type.id)}
										{@const meal = slotMeal(date, type.id)}
										<div class="slot">
											<small>{type.label}</small>
											{#if cellExcluded(date, type.id)}
												<span
													class="empty-slot opacity-70"
													title="Excluded in planner settings"
													aria-disabled="true"
													><BanIcon size={11} /> Excluded</span
												>
											{:else if isSkipped(date, type.id)}
												{#if canEditViewing}
													<div class="skipped-wrap">
														<button
															type="button"
															class="empty-slot"
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
															class="chip-remove"
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
													class="meal-chip"
													style={`background: ${meal.color}`}
												>
													<span class="chip-name"
														>{meal.name}{#if meal.ingredientCount === 0}<span
																class="chip-note"
																>No list</span
															>{/if}</span
													>
													{#if canEditViewing}
														<button
															type="button"
															class="chip-remove"
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
													class="empty-slot"
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

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global(body) {
		min-width: 320px;
	}
	button {
		cursor: pointer;
	}

	main {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 1180px;
		margin: 0 auto;
		padding: 20px 18px 72px;
	}
	.date-nav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.view-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.day-detail {
		display: grid;
		gap: 14px;
		max-width: 560px;
	}
	.day-detail-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.day-detail-head h2 {
		margin: 0;
		font-size: 22px;
	}
	.day-slot {
		display: grid;
		gap: 8px;
	}
	.day-slot h3 {
		margin: 0;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.day-meal-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 13px 14px;
		border: 1px solid
			color-mix(in srgb, var(--meal-color) 30%, var(--border));
		border-left: 4px solid var(--meal-color);
		border-radius: 14px;
		background: color-mix(in srgb, var(--meal-color) 12%, var(--card));
		color: var(--foreground);
	}
	.day-meal-content {
		min-width: 0;
	}
	.day-meal-content strong {
		display: block;
		font-size: 14px;
		line-height: 1.2;
	}
	.day-meal-note {
		margin: 5px 0 10px;
		overflow-wrap: anywhere;
		color: var(--muted-foreground);
		font-size: 12px;
		line-height: 1.4;
	}
	.day-meal-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.empty-day-slot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border: 1px dashed var(--border);
		border-radius: 14px;
		background: color-mix(in srgb, var(--foreground) 3%, transparent);
	}
	.empty-day-slot p {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 12px;
		font-weight: 700;
	}
	.empty-day-slot.skipped {
		border-style: solid;
	}
	.member-dot {
		flex: 0 0 auto;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.week-scroll {
		overflow-x: auto;
		padding-bottom: 8px;
		scrollbar-width: thin;
	}
	.week-track {
		display: grid;
		grid-template-columns: repeat(7, 148px);
		gap: 10px;
		min-width: max-content;
	}
	.day {
		padding: 9px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: color-mix(in srgb, var(--card) 50%, transparent);
	}
	.day.selected {
		border-color: var(--primary);
		background: var(--card);
		box-shadow: 0 8px 24px rgba(23, 34, 31, 0.06);
	}
	.day-head {
		display: grid;
		grid-template-columns: 1fr auto;
		width: 100%;
		border: 0;
		background: transparent;
		text-align: left;
		color: var(--muted-foreground);
	}
	.day-head span {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.day.selected .day-head span {
		color: var(--foreground);
	}
	.day-head em {
		grid-row: 1;
		grid-column: 2;
		align-self: start;
		font-size: 9px;
		font-style: normal;
		font-weight: 800;
		color: var(--destructive);
	}
	.slot {
		margin-top: 10px;
	}
	.slot small {
		display: block;
		margin: 0 2px 4px;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	/* Chip backgrounds come from meal data (pastels in both modes), so the
	   text stays a fixed dark tone for contrast in light and dark mode. */
	.meal-chip {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 6px;
		min-height: 46px;
		padding: 8px;
		border-radius: 11px;
		font-size: 10px;
		font-weight: 800;
		line-height: 1.25;
		color: #32433b;
	}
	.chip-name {
		min-width: 0;
	}
	.chip-note {
		display: block;
		margin-top: 3px;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.chip-remove {
		flex: 0 0 auto;
		display: grid;
		width: 18px;
		height: 18px;
		margin: -2px -3px 0 0;
		place-items: center;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--muted-foreground);
	}
	.chip-remove:hover {
		background: color-mix(in srgb, var(--foreground) 12%, transparent);
		color: var(--foreground);
	}
	@media (hover: hover) {
		.meal-chip .chip-remove {
			opacity: 0;
		}
		.meal-chip:hover .chip-remove,
		.chip-remove:focus-visible {
			opacity: 1;
		}
	}
	.empty-slot {
		display: flex;
		align-items: center;
		gap: 5px;
		width: 100%;
		min-height: 46px;
		padding: 8px;
		border: 1px dashed var(--border);
		border-radius: 11px;
		background: transparent;
		color: var(--muted-foreground);
		font-size: 10px;
		font-weight: 800;
	}
	.day-detail .empty-slot {
		width: auto;
		min-height: 34px;
		padding: 7px 10px;
		border-style: solid;
		border-radius: 9px;
	}
	button.empty-slot:hover {
		border-color: var(--primary);
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}
	.empty-slot[aria-disabled="true"] {
		cursor: default;
	}
	.skipped-wrap {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.skipped-wrap .empty-slot {
		flex: 1;
		min-width: 0;
	}
	@media (max-width: 1023px) {
		.week-scroll {
			overflow-x: visible;
			padding-bottom: 0;
		}
		.week-track {
			grid-template-columns: minmax(0, 1fr);
			min-width: 0;
			gap: 8px;
		}
		.day {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			gap: 8px;
			padding: 12px;
		}
		.day-head {
			grid-column: 1;
			grid-row: auto;
			display: flex;
			flex-direction: row;
			align-items: baseline;
			justify-content: space-between;
			gap: 8px;
			text-align: left;
		}
		.day-head em {
			grid-row: auto;
			grid-column: auto;
		}
		.day > .slot {
			grid-column: 1;
			min-width: 0;
			margin-top: 0;
		}
	}

	@media (min-width: 560px) {
		main {
			padding: 24px 28px 80px;
		}
	}

	@media (min-width: 1024px) {
		main {
			padding: 28px 28px 80px;
		}
		.day-detail {
			max-width: none;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			align-items: start;
		}
		.day-detail-head {
			grid-column: 1 / -1;
		}
		.week-track {
			grid-template-columns: repeat(7, minmax(0, 1fr));
			gap: 8px;
			min-width: 0;
		}
		.week-track > article {
			min-width: 0;
		}
		.day {
			padding: 8px;
		}
	}
</style>
