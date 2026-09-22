<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { toast } from "svelte-sonner";
	import LeftoverReview from "$lib/components/LeftoverReview.svelte";
	import MealPicker from "$lib/components/MealPicker.svelte";
	import PlannerHero from "$lib/components/PlannerHero.svelte";
	import * as Card from "$lib/components/ui/card";
	import { createDbErrorDeduper } from "$lib/data/db-errors.js";
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
	import { excludedCellSet } from "$lib/exclusions.js";
	import {
		MEAL_TYPES,
		type MealType,
	} from "$lib/meal-types.js";
	import {
		mapToPlannerMeals,
		type PlannerMeal,
	} from "$lib/meals/meal-mappers.js";
	import DayPlanGrid from "$lib/planner/DayPlanGrid.svelte";
	import {
		filterVisibleDates,
		isCellExcludedSet,
		isDayFullyExcluded,
		visibleSlotsForDates,
	} from "$lib/planner/exclusion-view.js";
	import {
		readReviewDismissal,
		writeReviewDismissal,
	} from "$lib/planner/leftover-review.svelte.js";
	import PlannerViewControls from "$lib/planner/PlannerViewControls.svelte";
	import ReviewNudge from "$lib/planner/ReviewNudge.svelte";
	import WeekPlanGrid from "$lib/planner/WeekPlanGrid.svelte";
	import { plannerView } from "$lib/planner-view.svelte.js";
	import { plannerWeek } from "$lib/planner-week.svelte.js";
	import { session } from "$lib/session.svelte.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";
	import ListPlanSection from "./ListPlanSection.svelte";

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
	let canEditViewing = $derived(
		!viewingMember || viewingMember._id === selfMemberId || canManageOthers,
	);
	let mode = $derived(viewingMember?.plannerMode ?? "planner");
	let isSelfView = $derived(
		viewingMember !== null && viewingMember._id === selfMemberId,
	);

	let reviewOpen = $state(false);
	let reviewTick = $state(0);
	let lastWeekDates = $derived(weekDates(addDays(anchorDate, -7)));
	let lastWeekAnchor = $derived(lastWeekDates[0] ?? anchorDate);
	let lastWeekEnd = $derived(lastWeekDates[6] ?? anchorDate);
	let reviewScopeAll = $derived(
		selfIsManager && (householdQuery.data?.household.ownerReviewsMeals ?? false),
	);

	function dismissReview(): void {
		writeReviewDismissal(lastWeekAnchor);
		reviewTick += 1;
	}

	let needsReview = $derived(
		reviewTick >= 0 &&
			!!session.session &&
			!!viewingMember &&
			lastWeekEnd < today &&
			readReviewDismissal() !== lastWeekAnchor,
	);

	const lastWeekDaysQuery = useQuery(api.plan.getDays, () =>
		householdId && viewingMember
			? {
					householdId: householdId as Id<"households">,
					memberId: viewingMember._id,
					dates: lastWeekDates,
				}
			: "skip",
	);
	const lastWeekDaysAllQuery = useQuery(api.plan.getDays, () =>
		householdId && reviewScopeAll
			? {
					householdId: householdId as Id<"households">,
					dates: lastWeekDates,
				}
			: "skip",
	);
	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const readyQuery = useQuery(api.pantry.listReady, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	let meals = $derived<PlannerMeal[]>(
		mapToPlannerMeals((mealsQuery.data ?? []) as never[]),
	);

	let lastWeekReviewable = $derived.by(() => {
		const existingIds = new Set(meals.map((meal) => meal.id));
		const ready = new Set(
			(readyQuery.data ?? []).map((row) => row.mealId),
		);
		const rows = reviewScopeAll
			? (lastWeekDaysAllQuery.data ?? [])
			: (lastWeekDaysQuery.data ?? []);
		const planned = new Set<Id<"meals">>();
		for (const row of rows) {
			for (const slot of [
				row.breakfast,
				row.lunch,
				row.dinner,
				row.snack ?? null,
			]) {
				if (slot && slot !== "skip") planned.add(slot);
			}
		}
		let count = 0;
		for (const id of planned) {
			if (existingIds.has(id) && !ready.has(id)) count += 1;
		}
		return count;
	});
	let savingMode = $state(false);
	let exclusionSet = $derived(
		excludedCellSet(viewingMember?.excludedCells),
	);
	function cellExcluded(date: string, slot: MealType): boolean {
		return isCellExcludedSet(exclusionSet, date, slot);
	}
	function dayFullyExcluded(date: string): boolean {
		return isDayFullyExcluded(exclusionSet, date);
	}
	let displayWeekDates = $derived(filterVisibleDates(currentWeek, exclusionSet));
	let daySlotTypes = $derived(visibleSlotsForDates(exclusionSet, [anchorDate]));
	let weekSlotTypes = $derived(
		visibleSlotsForDates(exclusionSet, displayWeekDates),
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

	const dbErrors = createDbErrorDeduper();
	$effect(() => {
		dbErrors.report(
			(mealsQuery.error ?? daysQuery.error ?? householdQuery.error) as {
				message: string;
			} | null,
		);
	});

	const pickerDayQuery = useQuery(api.plan.getDays, () =>
		householdId && pickerTarget
			? {
					householdId: householdId as Id<"households">,
					dates: [pickerTarget.date],
				}
			: "skip",
	);

	let readyMadeIds = $derived(
		new Set<string>(
			(readyQuery.data ?? [])
				.filter((row) => row.kind !== "eat")
				.map((row) => row.mealId),
		),
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

	function mealById(id: string | null): PlannerMeal | null {
		return id ? (meals.find((meal) => meal.id === id) ?? null) : null;
	}

	function slotMeal(date: string, slot: MealType): PlannerMeal | null {
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

<svelte:window onkeydown={onKeydown} />

<div class="flex flex-col gap-4">
	<PlannerHero
		heading={viewHeading}
		dayStep={mode === "planner" && effectiveView === "day"}
	/>

	<ReviewNudge
		visible={Boolean(
			householdId && viewingMember && selfMemberId && lastWeekReviewable > 0,
		)}
		needsReview={needsReview}
		onDismiss={dismissReview}
		onOpen={() => (reviewOpen = true)}
	/>

	{#if mode === "planner"}
		<Card.Root>
			<PlannerViewControls
				{showMemberToggle}
				{members}
				memberValue={viewingMemberId ?? selfMemberId ?? ""}
				onMemberChange={(v) => (viewingMemberId = v)}
				{mode}
				{savingMode}
				{isSelfView}
				onModeChange={(m) => void setMode(m)}
			/>
			<Card.Content>
				{#if effectiveView === "day"}
					<DayPlanGrid
						anchorDate={anchorDate}
						today={today}
						slotTypes={daySlotTypes}
						isSkipped={isSkipped}
						getMeal={slotMeal}
						isCellExcluded={cellExcluded}
						isDayFullyExcluded={dayFullyExcluded}
						canEdit={canEditViewing}
						onAdd={openPicker}
						onRemove={removeMeal}
						onUnskip={unskipSlot}
					/>
				{:else}
					<WeekPlanGrid
						dates={displayWeekDates}
						today={today}
						slotTypes={weekSlotTypes}
						getMeal={slotMeal}
						isSkipped={isSkipped}
						isCellExcluded={cellExcluded}
						canEdit={canEditViewing}
						{readyMadeIds}
						{dayMealCount}
						onAdd={openPicker}
						onRemove={removeMeal}
						onUnskip={unskipSlot}
						onClearDay={(d) => void clearDay(d)}
					/>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else if householdId && viewingMember && selfMemberId}
		<Card.Root>
			<PlannerViewControls
				{showMemberToggle}
				{members}
				memberValue={viewingMemberId ?? selfMemberId ?? ""}
				onMemberChange={(v) => (viewingMemberId = v)}
				{mode}
				{savingMode}
				{isSelfView}
				onModeChange={(m) => void setMode(m)}
			/>
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
</div>

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

<LeftoverReview
	{householdId}
	memberId={reviewScopeAll ? null : (viewingMember?._id ?? null)}
	memberName={reviewScopeAll ? "everyone" : (viewingMember?.name ?? "your")}
	members={members.map((member) => ({
		id: member._id,
		name: member.name,
	}))}
	dates={lastWeekDates}
	open={reviewOpen}
	onClose={() => {
		dismissReview();
		reviewOpen = false;
	}}
/>
