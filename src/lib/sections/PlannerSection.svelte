<script lang="ts">
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import { useMutation, useQuery } from "convex-svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { toast } from "svelte-sonner";
	import { resolve } from "$app/paths";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
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
	import { plannerView } from "$lib/planner-view.svelte.js";
	import { session } from "$lib/session.svelte.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	type MealCategory = "Breakfast" | "Lunch" | "Dinner" | "Snack";
	type MealType = "breakfast" | "lunch" | "dinner";

	function fallbackMealTimes(category: MealCategory): MealType[] {
		if (category === "Breakfast") return ["breakfast"];
		if (category === "Lunch" || category === "Snack") return ["lunch"];
		return ["dinner"];
	}
	type IconName =
		| "plus"
		| "search"
		| "bell"
		| "calendar"
		| "book"
		| "cart"
		| "check"
		| "close"
		| "leaf"
		| "utensils"
		| "spark"
		| "menu";

	interface Meal {
		id: string;
		name: string;
		category: MealCategory;
		note: string;
		time: string;
		color: string;
		ingredientCount: number;
		mealTimes: MealType[];
	}

	const mealTypes: { id: MealType; label: string }[] = [
		{ id: "breakfast", label: "Breakfast" },
		{ id: "lunch", label: "Lunch" },
		{ id: "dinner", label: "Dinner" },
	];

	const today = todayISO();
	const wideScreen = new MediaQuery("(min-width: 1024px)", true);

	const memberColors = [
		"#e47d5f",
		"#507b62",
		"#686c87",
		"#887647",
		"#b86b51",
		"#4f7d8c",
	];

	let anchorDate = $state(today);
	let search = $state("");
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
	let viewingMember = $derived(
		members.find((m) => m._id === (viewingMemberId ?? selfMemberId)) ??
			null,
	);

	function memberColor(id: string): string {
		const index = members.findIndex((m) => m._id === id);
		return (
			memberColors[(index < 0 ? 0 : index) % memberColors.length] ??
			"#e47d5f"
		);
	}

	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const daysQuery = useQuery(api.plan.getDays, () =>
		householdId && viewingMember
			? {
					householdId: householdId as Id<"households">,
					memberId: viewingMember._id,
					dates: visibleDates,
				}
			: "skip",
	);

	const setSlot = useMutation(api.plan.setSlot);
	const clearDayMutation = useMutation(api.plan.clearDay);
	const createMeal = useMutation(api.meals.create);

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
			map.set(date, { breakfast: null, lunch: null, dinner: null });
		}
		for (const row of daysQuery.data ?? []) {
			map.set(row.date, {
				breakfast: row.breakfast,
				lunch: row.lunch,
				dinner: row.dinner,
			});
		}
		return map;
	});

	let viewHeading = $derived(
		effectiveView === "day"
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

	let pickerMeals = $derived.by(() => {
		const query = search.trim().toLowerCase();
		const slot = pickerTarget?.slot;
		return meals.filter((meal) => {
			const fitsSlot = !slot || meal.mealTimes.includes(slot);
			const matchesQuery =
				!query ||
				`${meal.name} ${meal.note}`.toLowerCase().includes(query);
			return fitsSlot && matchesQuery;
		});
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
			planMap.get(date) ?? { breakfast: null, lunch: null, dinner: null },
		).filter(Boolean).length;
	}

	function dayLabel(date: string): string {
		return `${weekdayLabel(date)}, ${formatShort(date)}`;
	}

	function stepView(direction: 1 | -1): void {
		anchorDate = addDays(
			anchorDate,
			effectiveView === "day" ? direction : direction * 7,
		);
	}

	function goToday(): void {
		anchorDate = today;
	}

	function openPicker(date: string, slot: MealType): void {
		const slotLabel =
			mealTypes.find((type) => type.id === slot)?.label ?? slot;
		search = "";
		pickerTarget = { date, dayLabel: dayLabel(date), slot, slotLabel };
	}

	function closePicker(): void {
		pickerTarget = null;
	}

	function ownerSuffix(): string {
		if (!viewingMember || viewingMember._id === selfMemberId) return "";
		return ` for ${viewingMember.name}`;
	}

	async function assignToSlot(mealId: string): Promise<void> {
		if (!pickerTarget || !householdId || !viewingMember) return;
		await setSlot({
			householdId: householdId as Id<"households">,
			memberId: viewingMember._id,
			date: pickerTarget.date,
			slot: pickerTarget.slot,
			mealId: mealId as Id<"meals">,
		});
		const meal = meals.find((item) => item.id === mealId);
		toast.success(
			`${meal?.name ?? "Meal"} added to ${pickerTarget.dayLabel}${ownerSuffix()}`,
		);
		closePicker();
	}

	async function addSearchedMeal(): Promise<void> {
		if (!pickerTarget || !householdId || !viewingMember) return;
		const name = search.trim();
		if (!name) return;
		const category =
			pickerTarget.slot === "breakfast"
				? "Breakfast"
				: pickerTarget.slot === "lunch"
					? "Lunch"
					: "Dinner";
		const id = await createMeal({
			householdId: householdId as Id<"households">,
			name,
			category,
			ingredients: [],
			mealTimes: [pickerTarget.slot],
		});
		await setSlot({
			householdId: householdId as Id<"households">,
			memberId: viewingMember._id,
			date: pickerTarget.date,
			slot: pickerTarget.slot,
			mealId: id,
		});
		toast.success(`${name} added to ${pickerTarget.dayLabel}${ownerSuffix()}`);
		search = "";
		closePicker();
	}

	async function skipSlot(): Promise<void> {
		if (!pickerTarget || !householdId || !viewingMember) return;
		await setSlot({
			householdId: householdId as Id<"households">,
			memberId: viewingMember._id,
			date: pickerTarget.date,
			slot: pickerTarget.slot,
			mealId: "skip",
		});
		toast.success(
			`${pickerTarget.slotLabel} on ${pickerTarget.dayLabel} skipped${ownerSuffix()}`,
		);
		closePicker();
	}

	async function unskipSlot(date: string, slot: MealType): Promise<void> {
		if (!householdId || !viewingMember) return;
		await setSlot({
			householdId: householdId as Id<"households">,
			memberId: viewingMember._id,
			date,
			slot,
			mealId: null,
		});
		const label =
			mealTypes.find((type) => type.id === slot)?.label ?? slot;
		toast.success(`${label} on ${dayLabel(date)} back to unplanned${ownerSuffix()}`);
	}

	async function removeMeal(date: string, slot: MealType): Promise<void> {
		if (!householdId || !viewingMember) return;
		const meal = slotMeal(date, slot);
		if (!meal) return;
		await setSlot({
			householdId: householdId as Id<"households">,
			memberId: viewingMember._id,
			date,
			slot,
			mealId: null,
		});
		toast.success(`${meal.name} removed from ${dayLabel(date)}${ownerSuffix()}`);
	}

	async function clearDay(date: string): Promise<void> {
		if (!householdId || !viewingMember) return;
		if (dayMealCount(date) === 0) return;
		await clearDayMutation({
			householdId: householdId as Id<"households">,
			memberId: viewingMember._id,
			date,
		});
		toast.success(`${dayLabel(date)} cleared${ownerSuffix()}`);
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape" && pickerTarget) closePicker();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet icon(name: IconName, size = 16)}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if name === "plus"}
			<path d="M12 5v14M5 12h14" />
		{:else if name === "search"}
			<circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" />
		{:else if name === "bell"}
			<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" />
		{:else if name === "calendar"}
			<rect x="3" y="4.5" width="18" height="17" rx="2" /><path
				d="M16 2.5v4M8 2.5v4M3 9.5h18"
			/>
		{:else if name === "book"}
			<path d="M4 5.5a2 2 0 0 1 2-2h12v17H6a2 2 0 0 0-2 2z" /><path
				d="M4 20.5a2 2 0 0 1 2-2h12M8 8h6M8 12h6"
			/>
		{:else if name === "cart"}
			<path d="M5 8h14l-1 12H6L5 8Z" /><path
				d="M9 8a3 3 0 0 1 6 0M9 12v2M15 12v2"
			/>
		{:else if name === "check"}
			<path d="m5 12 4 4L19 6" />
		{:else if name === "close"}
			<path d="m6 6 12 12M18 6 6 18" />
		{:else if name === "leaf"}
			<path d="M20 4C11 4 5 8 5 14c0 3.3 2.7 6 6 6 6 0 9-7 9-16Z" /><path
				d="M4 20c3-4 6-6 11-8"
			/>
		{:else if name === "utensils"}
			<path
				d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 14v7M17 3v18M17 3c2 1 3 3 3 5 0 2-1 3-3 3"
			/>
		{:else if name === "menu"}
			<path d="M4 6h16M4 12h16M4 18h16" />
		{:else}
			<path
				d="m12 3-1.3 5.7L5 10l5.7 1.3L12 17l1.3-5.7L19 10l-5.7-1.3L12 3Z"
			/>
		{/if}
	</svg>
{/snippet}

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
						aria-label={effectiveView === "day"
							? "Previous day"
							: "Previous week"}
						onclick={() => stepView(-1)}>‹</Button
					>
					<Button
						variant="outline"
						size="sm"
						onclick={goToday}>Today</Button
					>
					<Button
						variant="outline"
						size="icon"
						class="text-[18px] leading-none"
						aria-label={effectiveView === "day" ? "Next day" : "Next week"}
						onclick={() => stepView(1)}>›</Button
					>
				</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		{#if members.length > 1}
			<Card.Header>
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
								style={`background: ${memberColor(member._id)}`}
							></span>{member.name}</ToggleGroup.Item
						>
					{/each}
				</ToggleGroup.Root>
			</Card.Header>
		{/if}
		<Card.Content>
			{#if effectiveView === "day"}
				<div class="day-detail">
					<div class="day-detail-head">
						<h2 class="m-0 text-[22px]">{weekdayLabel(anchorDate)}</h2>
						{#if anchorDate === today}
							<Badge>Today</Badge>
						{/if}
					</div>
					{#each mealTypes as type (type.id)}
						{@const meal = slotMeal(anchorDate, type.id)}
						<div class="day-slot">
							<h3>{type.label}</h3>
							{#if isSkipped(anchorDate, type.id)}
								<div class="empty-day-slot skipped">
									<p>Skipped</p>
									<button
										type="button"
										class="empty-slot"
										onclick={() =>
											openPicker(anchorDate, type.id)}
										>{@render icon("plus", 11)} Change</button
									>
									<button
										type="button"
										class="chip-remove"
										aria-label={`Unskip ${type.label}`}
										title="Back to unplanned"
										onclick={() =>
											unskipSlot(anchorDate, type.id)}
										>{@render icon("close", 11)}</button
									>
								</div>
							{:else if meal}
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
											<Badge variant="secondary">{meal.time}</Badge>
											<Badge variant="outline">
												{meal.ingredientCount > 0
													? `${meal.ingredientCount} ingredient${meal.ingredientCount === 1 ? "" : "s"}`
													: "No groceries"}
											</Badge>
										</div>
									</div>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={`Remove ${meal.name} from ${type.label}`}
										title={`Remove ${meal.name}`}
										onclick={() =>
											removeMeal(anchorDate, type.id)}
										>{@render icon("close", 11)}</Button
									>
								</div>
							{:else}
								<div class="empty-day-slot">
									<p>No meal planned</p>
									<Button
										variant="outline"
										size="sm"
										onclick={() =>
											openPicker(anchorDate, type.id)}
										>{@render icon("plus", 11)} Add meal</Button
									>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="week-scroll">
					<div class="week-track">
						{#each currentWeek as date (date)}
							<article
								class="day"
								class:selected={date === today}
							>
								<div class="day-head">
									<span>{weekdayLabel(date)}</span>
									{#if date === today}<em>Today</em>{/if}
								</div>
								{#each mealTypes as type (type.id)}
									{@const meal = slotMeal(date, type.id)}
									<div class="slot">
										<small>{type.label}</small>
										{#if isSkipped(date, type.id)}
											<div class="skipped-wrap">
												<button
													type="button"
													class="empty-slot"
													onclick={() =>
														openPicker(date, type.id)}
													>{@render icon("plus", 11)} Skipped</button
												>
												<button
													type="button"
													class="chip-remove"
													aria-label={`Unskip ${dayLabel(date)} ${type.label}`}
													title="Back to unplanned"
													onclick={() =>
														unskipSlot(date, type.id)}
													>{@render icon(
														"close",
														11,
													)}</button
												>
											</div>
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
													>{@render icon(
														"close",
														11,
													)}</button
												>
											</div>
										{:else}
											<button
												type="button"
												class="empty-slot"
												onclick={() =>
													openPicker(date, type.id)}
												>{@render icon("plus", 11)} Add</button
											>
										{/if}
									</div>
								{/each}
								{#if dayMealCount(date) > 0}
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
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</main>

<Dialog.Root
	open={pickerTarget !== null}
	onOpenChange={(open) => {
		if (!open) closePicker();
	}}
>
	<Dialog.Content data-no-swipe interactOutsideBehavior="ignore">
		<Dialog.Header>
			<Dialog.Title id="picker-title">Choose a meal</Dialog.Title>
			<Dialog.Description>
				{pickerTarget?.dayLabel} · {pickerTarget?.slotLabel}
			</Dialog.Description>
		</Dialog.Header>
		<Input
			bind:value={search}
			placeholder="Search meals"
			aria-label="Search meals"
		/>
		<Button
			variant="outline"
			class="w-full justify-start gap-2.5"
			onclick={skipSlot}
		>
			<span class="picker-dot skip-dot"></span>
			<span class="picker-name"
				>Skip this meal<small>No cooking, no groceries</small></span
			>
		</Button>
		{#if pickerMeals.length}
			<div class="picker-list">
				{#each pickerMeals as meal (meal.id)}
					<Button
						variant="ghost"
						class="h-auto w-full justify-start gap-2.5 px-3 py-2.5 text-left"
						onclick={() => assignToSlot(meal.id)}
					>
						<span
							class="picker-dot"
							style={`background: ${meal.color}`}
						></span>
						<span class="picker-name"
							>{meal.name}<small>{meal.category}</small></span
						>
						{@render icon("plus", 13)}
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
						<Button onclick={addSearchedMeal}
							>Add "{search.trim()}" to the database</Button
						>
					</Empty.Content>
				{/if}
			</Empty.Root>
		{/if}
	</Dialog.Content>
</Dialog.Root>

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
		background: color-mix(
			in srgb,
			var(--meal-color) 12%,
			var(--card)
		);
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
	.skip-dot {
		border: 1px dashed var(--border);
		background: transparent;
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
	.empty-slot:hover {
		border-color: var(--primary);
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 8%, transparent);
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
	.picker-list {
		display: grid;
		gap: 8px;
		max-height: 320px;
		margin-top: 14px;
		overflow-y: auto;
	}
	.picker-dot {
		flex: 0 0 auto;
		width: 12px;
		height: 12px;
		border-radius: 4px;
	}
	.picker-name {
		flex: 1;
		min-width: 0;
	}
	.picker-name small {
		display: block;
		color: var(--muted-foreground);
		font-size: 10px;
		font-weight: 600;
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
