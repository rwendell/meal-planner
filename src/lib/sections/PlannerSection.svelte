<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { resolve } from "$app/paths";
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
	let toast = $state("");
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

	let errorToast = $state("");

	// Surface database errors as a dismissible toast instead of a permanent
	// inline note. Dismissing sticks until the error itself changes.
	$effect(() => {
		const error = dataError;
		if (error) {
			errorToast = `Couldn't reach the database (${error.message}). Check your connection and reload.`;
		} else {
			errorToast = "";
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
		toast = `${meal?.name ?? "Meal"} added to ${pickerTarget.dayLabel}${ownerSuffix()}`;
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
		toast = `${name} added to ${pickerTarget.dayLabel}${ownerSuffix()}`;
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
		toast = `${pickerTarget.slotLabel} on ${pickerTarget.dayLabel} skipped${ownerSuffix()}`;
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
		toast = `${label} on ${dayLabel(date)} back to unplanned${ownerSuffix()}`;
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
		toast = `${meal.name} removed from ${dayLabel(date)}${ownerSuffix()}`;
	}

	async function clearDay(date: string): Promise<void> {
		if (!householdId || !viewingMember) return;
		if (dayMealCount(date) === 0) return;
		await clearDayMutation({
			householdId: householdId as Id<"households">,
			memberId: viewingMember._id,
			date,
		});
		toast = `${dayLabel(date)} cleared${ownerSuffix()}`;
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
	<section id="planner" class="hero">
		<div>
			<h1>{viewHeading}</h1>
			<div class="view-bar">
				<div class="date-nav">
					<button
						type="button"
						class="icon-button"
						aria-label={effectiveView === "day"
							? "Previous day"
							: "Previous week"}
						onclick={() => stepView(-1)}>‹</button
					>
					<button
						type="button"
						class="ghost compact"
						onclick={goToday}>Today</button
					>
					<button
						type="button"
						class="icon-button"
						aria-label={effectiveView === "day"
							? "Next day"
							: "Next week"}
						onclick={() => stepView(1)}>›</button
					>
				</div>
			</div>
		</div>
	</section>

	<section class="panel">
		{#if members.length > 1}
			<fieldset class="member-tabs">
				<legend class="sr-only">Whose plan</legend>
				{#each members as member, i (member._id)}
					<button
						type="button"
						class:active={viewingMember?._id === member._id}
						aria-pressed={viewingMember?._id === member._id}
						onclick={() => (viewingMemberId = member._id)}
					>
						<span
							class="member-dot"
							style={`background: ${memberColor(member._id)}`}
						></span>{member.name}</button
					>
				{/each}
			</fieldset>
		{/if}
		{#if effectiveView === "day"}
			<div class="day-detail">
				<div class="day-detail-head">
					<h2>{weekdayLabel(anchorDate)}</h2>
					{#if anchorDate === today}
						<span class="day-current-label">Today</span>
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
											class="chip-remove day-meal-remove"
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
										<span>{meal.time}</span>
										<span>
											{meal.ingredientCount > 0
												? `${meal.ingredientCount} ingredient${meal.ingredientCount === 1 ? "" : "s"}`
												: "No groceries"}
										</span>
									</div>
								</div>
								<button
									type="button"
									class="chip-remove day-meal-remove"
									aria-label={`Remove ${meal.name} from ${type.label}`}
									title={`Remove ${meal.name}`}
									onclick={() =>
										removeMeal(anchorDate, type.id)}
									>{@render icon("close", 11)}</button
								>
							</div>
						{:else}
							<div class="empty-day-slot">
								<p>No meal planned</p>
								<button
									type="button"
									class="empty-slot"
									onclick={() =>
										openPicker(anchorDate, type.id)}
									>{@render icon("plus", 11)} Add meal</button
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
						<article class="day" class:selected={date === today}>
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
													removeMeal(date, type.id)}
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
								<button
									type="button"
									class="clear-day"
									onclick={() => clearDay(date)}
									>Clear day</button
								>
							{/if}
						</article>
					{/each}
				</div>
			</div>
		{/if}
	</section>
</main>

{#if toast}
	<div class="toast" role="status">
		{@render icon("check", 13)}
		{toast}
		<button type="button" aria-label="Dismiss" onclick={() => (toast = "")}
			>{@render icon("close", 12)}</button
		>
	</div>
{/if}

{#if errorToast}
	<div class="toast error" role="alert">
		{@render icon("bell", 13)}
		{errorToast}
		<button
			type="button"
			aria-label="Dismiss error"
			onclick={() => (errorToast = "")}
			>{@render icon("close", 12)}</button
		>
	</div>
{/if}

{#if pickerTarget}
	<div class="backdrop" data-no-swipe>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="picker-title"
		>
			<div class="section-head">
				<div>
					<p class="eyebrow">
						{pickerTarget.dayLabel} · {pickerTarget.slotLabel}
					</p>
					<h2 id="picker-title">Choose a meal</h2>
				</div>
				<button
					type="button"
					class="icon-button"
					aria-label="Close dialog"
					onclick={closePicker}>{@render icon("close", 15)}</button
				>
			</div>
			<label class="search-box">
				{@render icon("search", 14)}<span class="sr-only"
					>Search meals</span
				>
				<input bind:value={search} placeholder="Search meals" />
			</label>
			<button type="button" class="picker-row skip-row" onclick={skipSlot}>
				<span class="picker-dot skip-dot"></span>
				<span class="picker-name"
					>Skip this meal<small>No cooking, no groceries</small></span
				>
			</button>
			{#if pickerMeals.length}
				<div class="picker-list">
					{#each pickerMeals as meal (meal.id)}
						<button
							type="button"
							class="picker-row"
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
						</button>
					{/each}
				</div>
			{:else}
				<div class="empty-state">
					<strong>No meals found</strong>
					{#if search.trim()}
						<p>No match for "{search.trim()}".</p>
						<div class="empty-actions">
							<button
								type="button"
								class="primary"
								onclick={addSearchedMeal}
								>Add "{search.trim()}" to the database</button
							>
						</div>
					{:else}
						<p>
							Add meals in the
							<a href={resolve("/meals")}>meal database</a> first.
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global(body) {
		min-width: 320px;
		background: #f7f5ef;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	main {
		max-width: 1180px;
		margin: 0 auto;
		padding: 20px 18px 72px;
	}
	.eyebrow {
		margin: 0 0 8px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #66746b;
	}
	h1,
	h2,
	p {
		margin-top: 0;
	}
	h1,
	h2 {
		font-family: Georgia, "Times New Roman", serif;
		letter-spacing: -0.045em;
	}
	h1 {
		margin-bottom: 14px;
		font-size: clamp(42px, 9vw, 64px);
		line-height: 0.95;
	}
	h2 {
		margin-bottom: 0;
		font-size: 26px;
	}
	button,
	input,
	a {
		font: inherit;
	}
	button {
		cursor: pointer;
	}

	.icon-button {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid #d9d5ca;
		border-radius: 10px;
		background: transparent;
		color: #53615a;
	}

	.hero {
		display: grid;
		gap: 24px;
		margin-top: 18px;
		padding: 28px 22px;
		border-radius: 26px;
		background: #e8ddd0;
		overflow: hidden;
	}
	.primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 0;
		border-radius: 12px;
		padding: 11px 14px;
		background: #17221f;
		color: #f7f5ef;
		font-size: 12px;
		font-weight: 800;
		text-decoration: none;
		cursor: pointer;
	}
	.view-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin-top: 20px;
	}
	.date-nav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.date-nav .icon-button {
		width: 36px;
		height: 36px;
		font-size: 18px;
		line-height: 1;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 1px solid #cfd4cc;
		border-radius: 12px;
		padding: 9px 14px;
		background: rgba(255, 255, 255, 0.55);
		color: #35453d;
		font-size: 12px;
		font-weight: 800;
		cursor: pointer;
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
	.day-current-label {
		flex: 0 0 auto;
		justify-self: start;
		margin: 0;
		padding: 4px 9px;
		border-radius: 999px;
		background: color-mix(
			in srgb,
			var(--app-accent-strong) 18%,
			transparent
		);
		color: var(--app-accent);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
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
		color: var(--app-faint);
	}
	.day-meal-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 13px 14px;
		border: 1px solid
			color-mix(in srgb, var(--meal-color) 30%, var(--app-line));
		border-left: 4px solid var(--meal-color);
		border-radius: 14px;
		background: color-mix(
			in srgb,
			var(--meal-color) 12%,
			var(--app-surface)
		);
		color: var(--app-ink);
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
		color: var(--app-muted);
		font-size: 12px;
		line-height: 1.4;
	}
	.day-meal-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.day-meal-meta span {
		padding: 3px 7px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--app-ink) 8%, transparent);
		color: var(--app-muted);
		font-size: 10px;
		font-weight: 800;
	}
	.day-meal-remove {
		width: 28px;
		height: 28px;
		margin: 0;
		border: 1px solid color-mix(in srgb, var(--app-ink) 14%, transparent);
		background: color-mix(in srgb, var(--app-surface) 60%, transparent);
		color: var(--app-faint);
	}
	.day-meal-remove:hover {
		background: color-mix(in srgb, var(--app-ink) 8%, transparent);
		color: var(--app-ink);
	}
	.empty-day-slot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border: 1px dashed var(--app-line-strong);
		border-radius: 14px;
		background: color-mix(in srgb, var(--app-ink) 3%, transparent);
	}
	.empty-day-slot p {
		margin: 0;
		color: var(--app-muted);
		font-size: 12px;
		font-weight: 700;
	}
	.empty-day-slot.skipped {
		border-style: solid;
	}
	.skip-row {
		margin-top: 14px;
	}
	.skip-dot {
		border: 1px dashed var(--app-line-strong);
		background: transparent;
	}
	.panel {
		margin-top: 22px;
		padding: 20px 16px;
		border: 1px solid #e3dfd5;
		border-radius: 22px;
		background: rgba(255, 255, 255, 0.55);
	}
	.section-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
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
		border: 1px solid #e1ded4;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.5);
	}
	.day.selected {
		border-color: #e47d5f;
		background: #fffdf9;
		box-shadow: 0 8px 24px rgba(23, 34, 31, 0.06);
	}
	.day-head {
		display: grid;
		grid-template-columns: 1fr auto;
		width: 100%;
		border: 0;
		background: transparent;
		text-align: left;
		color: #66746b;
	}
	.day-head span {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #4f5e55;
	}
	.day.selected .day-head span {
		color: #17221f;
	}
	.day-head em {
		grid-row: 1;
		grid-column: 2;
		align-self: start;
		font-size: 9px;
		font-style: normal;
		font-weight: 800;
		color: #d06f52;
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
		color: #66746b;
	}
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
		color: #78857c;
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
		color: rgba(50, 67, 59, 0.55);
	}
	.chip-remove:hover {
		background: rgba(255, 255, 255, 0.55);
		color: #17221f;
	}
	.clear-day {
		width: 100%;
		margin-top: 10px;
		padding: 6px 0;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: #66746b;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.clear-day:hover {
		background: #f5e6dd;
		color: #bf6c51;
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
		border: 1px dashed #b9c2ba;
		border-radius: 11px;
		background: transparent;
		color: #66746b;
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
		border-color: #e47d5f;
		color: #bd6b51;
		background: #f7ece5;
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
	.search-box {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 10px;
		border: 1px solid #d9d5ca;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.6);
		color: #89958c;
	}
	.search-box input {
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		font-size: 12px;
		color: #17221f;
	}
	.empty-state {
		padding: 34px 16px;
		border: 1px dashed #b8c2b9;
		border-radius: 16px;
		text-align: center;
		color: #66746b;
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: 18px;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 8px;
		transform: translateX(-50%);
		padding: 11px 13px;
		border-radius: 12px;
		background: #17221f;
		color: #f7f5ef;
		font-size: 12px;
		font-weight: 700;
		box-shadow: 0 12px 30px rgba(23, 34, 31, 0.22);
	}
	.toast button {
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		color: #aab8ad;
	}
	.toast.error {
		bottom: 70px;
		max-width: min(480px, calc(100vw - 32px));
		background: #9a4b32;
		color: #fbf6ef;
	}
	.toast.error button {
		color: #f3d9cd;
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
		.day > .slot,
		.day > .clear-day {
			grid-column: 1;
			min-width: 0;
			margin-top: 0;
		}
		.toast {
			bottom: 78px;
		}
		.toast.error {
			bottom: 134px;
		}
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgba(23, 34, 31, 0.5);
		backdrop-filter: blur(4px);
	}
	.modal {
		width: 100%;
		max-width: 480px;
		padding: 22px;
		border: 1px solid rgba(255, 255, 255, 0.5);
		border-radius: 24px;
		background: #fbfaf6;
		box-shadow: 0 24px 70px rgba(23, 34, 31, 0.25);
	}
	.picker-list {
		display: grid;
		gap: 8px;
		max-height: 320px;
		margin-top: 14px;
		overflow-y: auto;
	}
	.picker-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid #e3dfd5;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.7);
		text-align: left;
		font-size: 12px;
		font-weight: 700;
		color: #26352e;
	}
	.picker-row:hover {
		border-color: #e47d5f;
		background: #fffdf9;
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
		color: #66746b;
		font-size: 10px;
		font-weight: 600;
	}
	.member-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 16px;
		padding: 0;
		border: 0;
	}
	.member-tabs button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		border: 1px solid #cfd4cc;
		border-radius: 999px;
		padding: 7px 13px;
		background: rgba(255, 255, 255, 0.55);
		color: #35453d;
		font-size: 12px;
		font-weight: 800;
		cursor: pointer;
	}
	.member-tabs button.active {
		border-color: #17221f;
		background: #17221f;
		color: #f7f5ef;
	}
	.member-dot {
		flex: 0 0 auto;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	@media (min-width: 560px) {
		main {
			padding: 24px 28px 80px;
		}
		.hero {
			padding: 34px 30px;
		}
		.search-box {
			width: 100%;
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

	@media (prefers-color-scheme: dark) {
		:root:not([data-theme="light"]) :global(body) {
			background: var(--app-canvas);
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .eyebrow {
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .picker-name small {
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .hero {
			background: var(--app-hero);
		}
		:root:not([data-theme="light"]) .panel {
			border-color: var(--app-line);
			background: var(--app-surface-soft);
		}
		:root:not([data-theme="light"]) .day {
			border-color: var(--app-line);
			background: var(--app-surface-soft);
		}
		:root:not([data-theme="light"]) .day.selected {
			background: var(--app-surface);
		}
		:root:not([data-theme="light"]) .day-head {
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .day-head span {
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .day.selected .day-head span {
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .slot small {
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .chip-remove {
			color: color-mix(in srgb, var(--app-ink) 55%, transparent);
		}
		:root:not([data-theme="light"]) .chip-remove:hover {
			background: color-mix(in srgb, var(--app-surface) 60%, transparent);
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .empty-slot {
			border-color: var(--app-line-strong);
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .empty-slot:hover {
			background: color-mix(
				in srgb,
				var(--app-accent-strong) 18%,
				transparent
			);
			color: var(--app-accent);
		}
		:root:not([data-theme="light"]) .clear-day {
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .clear-day:hover {
			background: color-mix(
				in srgb,
				var(--app-accent-strong) 18%,
				transparent
			);
			color: var(--app-accent);
		}
		:root:not([data-theme="light"]) .primary {
			background: #2b3330;
			color: var(--app-dark-ink);
		}
		:root:not([data-theme="light"]) .icon-button {
			border-color: var(--app-line-strong);
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .search-box {
			border-color: var(--app-line-strong);
			background: var(--app-surface-soft);
			color: var(--app-faint);
		}
		:root:not([data-theme="light"]) .search-box input {
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .toast {
			background: var(--app-dark);
			color: var(--app-dark-ink);
		}
		:root:not([data-theme="light"]) .toast button {
			color: var(--app-dark-muted);
		}
		:root:not([data-theme="light"]) .modal {
			border-color: var(--app-line-strong);
			background: var(--app-modal);
		}
		:root:not([data-theme="light"]) .picker-row {
			border-color: var(--app-line);
			background: var(--app-surface-soft);
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .picker-row:hover {
			background: var(--app-surface);
		}
		:root:not([data-theme="light"]) .empty-state {
			border-color: var(--app-line-strong);
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .ghost {
			border-color: var(--app-line-strong);
			background: var(--app-surface-soft);
			color: var(--app-ink);
		}
	}

	:root[data-theme="dark"] :global(body) {
		background: var(--app-canvas);
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .eyebrow {
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .picker-name small {
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .hero {
		background: var(--app-hero);
	}
	:root[data-theme="dark"] .panel {
		border-color: var(--app-line);
		background: var(--app-surface-soft);
	}
	:root[data-theme="dark"] .day {
		border-color: var(--app-line);
		background: var(--app-surface-soft);
	}
	:root[data-theme="dark"] .day.selected {
		background: var(--app-surface);
	}
	:root[data-theme="dark"] .day-head {
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .day-head span {
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .day.selected .day-head span {
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .slot small {
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .chip-remove {
		color: color-mix(in srgb, var(--app-ink) 55%, transparent);
	}
	:root[data-theme="dark"] .chip-remove:hover {
		background: color-mix(in srgb, var(--app-surface) 60%, transparent);
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .empty-slot {
		border-color: var(--app-line-strong);
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .empty-slot:hover {
		background: color-mix(
			in srgb,
			var(--app-accent-strong) 18%,
			transparent
		);
		color: var(--app-accent);
	}
	:root[data-theme="dark"] .clear-day {
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .clear-day:hover {
		background: color-mix(
			in srgb,
			var(--app-accent-strong) 18%,
			transparent
		);
		color: var(--app-accent);
	}
	:root[data-theme="dark"] .primary {
		background: #2b3330;
		color: var(--app-dark-ink);
	}
	:root[data-theme="dark"] .icon-button {
		border-color: var(--app-line-strong);
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .search-box {
		border-color: var(--app-line-strong);
		background: var(--app-surface-soft);
		color: var(--app-faint);
	}
	:root[data-theme="dark"] .search-box input {
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .toast {
		background: var(--app-dark);
		color: var(--app-dark-ink);
	}
	:root[data-theme="dark"] .toast button {
		color: var(--app-dark-muted);
	}
	:root[data-theme="dark"] .modal {
		border-color: var(--app-line-strong);
		background: var(--app-modal);
	}
	:root[data-theme="dark"] .picker-row {
		border-color: var(--app-line);
		background: var(--app-surface-soft);
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .picker-row:hover {
		background: var(--app-surface);
	}
	:root[data-theme="dark"] .empty-state {
		border-color: var(--app-line-strong);
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .ghost {
		border-color: var(--app-line-strong);
		background: var(--app-surface-soft);
		color: var(--app-ink);
	}
</style>
