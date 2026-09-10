<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import Icon from "$lib/components/Icon.svelte";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	type MealCategory = "Breakfast" | "Lunch" | "Dinner" | "Snack";
	type MealTime = "breakfast" | "lunch" | "dinner";

	const ALL_MEAL_TIMES: MealTime[] = ["breakfast", "lunch", "dinner"];

	function fallbackMealTimes(category: MealCategory): MealTime[] {
		if (category === "Breakfast") return ["breakfast"];
		if (category === "Lunch" || category === "Snack") return ["lunch"];
		return ["dinner"];
	}
	type GroceryGroup = "Produce" | "Pantry" | "Dairy";

	interface Ingredient {
		name: string;
		amount?: string;
		group: GroceryGroup;
	}

	interface Meal {
		id: string;
		name: string;
		category: MealCategory;
		note: string;
		time: string;
		color: string;
		ingredientCount: number;
		ingredients: Ingredient[];
		mealTimes: MealTime[];
	}

	interface IngredientRow {
		key: number;
		name: string;
		amount: string;
		group: GroceryGroup;
	}

	const categoryFilters: ("All" | MealCategory)[] = [
		"All",
		"Breakfast",
		"Lunch",
		"Dinner",
		"Snack",
	];

	let search = $state("");
	let category = $state<"All" | MealCategory>("All");
	let showMealDialog = $state(false);
	let toast = $state("");
	let editingMeal = $state<Meal | null>(null);
	let newName = $state("");
	let newCategory = $state<MealCategory>("Dinner");
	let newNote = $state("");
	let newTimes = $state<MealTime[]>(["dinner"]);
	let formError = $state("");
	let editIngredients = $state<IngredientRow[]>([]);
	let rowKey = 0;

	const mealsQuery = useQuery(api.meals.list, () => ({}));

	const createMeal = useMutation(api.meals.create);
	const updateMeal = useMutation(api.meals.update);
	const deleteMeal = useMutation(api.meals.remove);
	const seedDatabase = useMutation(api.seed.ensureSeed);

	let meals = $derived<Meal[]>(
		(mealsQuery.data ?? []).map((meal) => ({
			id: meal._id,
			name: meal.name,
			category: meal.category,
			note: meal.note,
			time: meal.time,
			color: meal.color,
			ingredientCount: meal.ingredients.length,
			ingredients: meal.ingredients.map((ingredient) => ({
				name: ingredient.name,
				amount: ingredient.amount,
				group: ingredient.group,
			})),
			mealTimes: meal.mealTimes ?? fallbackMealTimes(meal.category),
		})),
	);

	let dataLoading = $derived(mealsQuery.isLoading);
	let dataError = $derived(mealsQuery.error);

	let visibleMeals = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return meals.filter((meal) => {
			const inCategory = category === "All" || meal.category === category;
			const inSearch =
				!query ||
				`${meal.name} ${meal.note}`.toLowerCase().includes(query);
			return inCategory && inSearch;
		});
	});

	function blankRow(): IngredientRow {
		rowKey += 1;
		return { key: rowKey, name: "", amount: "", group: "Pantry" };
	}

	function openAddMeal(): void {
		editingMeal = null;
		newName = "";
		newCategory = "Dinner";
		newNote = "";
		newTimes = ["dinner"];
		formError = "";
		editIngredients = [blankRow()];
		showMealDialog = true;
	}

	function openEditMeal(meal: Meal): void {
		editingMeal = meal;
		newName = meal.name;
		newCategory = meal.category;
		newNote = meal.note;
		newTimes = [...meal.mealTimes];
		formError = "";
		editIngredients = meal.ingredients.map((ingredient) => ({
			...blankRow(),
			name: ingredient.name,
			amount: ingredient.amount ?? "",
			group: ingredient.group,
		}));
		if (editIngredients.length === 0) editIngredients = [blankRow()];
		showMealDialog = true;
	}

	function closeMealDialog(): void {
		showMealDialog = false;
		editingMeal = null;
		newName = "";
		newNote = "";
		editIngredients = [];
	}

	function toggleMealTime(time: MealTime): void {
		if (newTimes.includes(time)) {
			if (newTimes.length > 1) {
				newTimes = newTimes.filter((t) => t !== time);
			}
		} else {
			newTimes = [...newTimes, time];
		}
	}

	function copyName(base: string): string {
		const names = new Set(
			meals.map((meal) => meal.name.trim().toLowerCase()),
		);
		let candidate = `${base} copy`;
		let n = 2;
		while (names.has(candidate.toLowerCase())) {
			candidate = `${base} copy ${n}`;
			n += 1;
		}
		return candidate;
	}

	async function duplicateMeal(meal: Meal): Promise<void> {
		const name = copyName(meal.name);
		const id = await createMeal({
			name,
			category: meal.category,
			note: meal.note,
			time: meal.time,
			color: meal.color,
			ingredients: meal.ingredients.map((ingredient) => ({
				...ingredient,
			})),
			mealTimes: [...meal.mealTimes],
		});
		toast = `Duplicated as "${name}"`;
		openEditMeal({ ...meal, id, name });
	}

	function addIngredientRow(): void {
		editIngredients.push(blankRow());
	}

	function removeIngredientRow(key: number): void {
		editIngredients = editIngredients.filter((row) => row.key !== key);
	}

	async function saveMeal(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const name = newName.trim();
		if (!name) return;
		const clash = meals.some(
			(meal) =>
				meal.id !== editingMeal?.id &&
				meal.name.trim().toLowerCase() === name.toLowerCase(),
		);
		if (clash) {
			formError = "A meal with this name already exists.";
			return;
		}
		const ingredients = editIngredients
			.map((row) => ({
				name: row.name.trim(),
				amount: row.amount.trim() || undefined,
				group: row.group,
			}))
			.filter((ingredient) => ingredient.name);
		try {
			if (editingMeal) {
				await updateMeal({
					id: editingMeal.id as Id<"meals">,
					name,
					category: newCategory,
					note: newNote.trim() || undefined,
					ingredients,
					mealTimes: newTimes,
				});
				toast = `${name} updated`;
			} else {
				await createMeal({
					name,
					category: newCategory,
					note: newNote.trim() || undefined,
					ingredients,
					mealTimes: newTimes,
				});
				toast = `${name} added to the database`;
			}
		} catch (error) {
			formError =
				error instanceof Error ? error.message : "Couldn't save the meal.";
			return;
		}
		closeMealDialog();
	}

	async function deleteMealFromDatabase(
		id: string,
		name: string,
	): Promise<void> {
		await deleteMeal({ id: id as Id<"meals"> });
		toast = `${name} deleted`;
	}

	async function loadSamples(): Promise<void> {
		await seedDatabase({});
		toast = "Sample data loaded";
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape" && showMealDialog) closeMealDialog();
	}
</script>

<svelte:head>
	<title>Meal database · Meal Planner</title>
	<meta
		name="description"
		content="Browse, search, and add meals to the database."
	/>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main>
	<section class="panel" aria-labelledby="meals-title">
		<div class="section-head">
			<div>
				<p class="eyebrow">Meal database</p>
				<h2 id="meals-title">Meals</h2>
			</div>
			<button
				type="button"
				class="ghost compact"
				onclick={openAddMeal}
				><Icon name="plus" size={14} /> New meal</button
			>
		</div>
		{#if dataError}
			<p class="error-note" role="alert">
				Couldn't reach the database ({dataError.message}). Check your
				connection and reload.
			</p>
		{/if}
		<div class="toolbar">
			<div class="filters">
				{#each categoryFilters as filter (filter)}
					<button
						type="button"
						class:active={category === filter}
						onclick={() => (category = filter)}
						>{filter}</button
					>
				{/each}
			</div>
			<label class="search-box">
				<Icon name="search" size={14} /><span class="sr-only"
					>Search meals</span
				>
				<input bind:value={search} placeholder="Search meals" />
			</label>
		</div>
		{#if visibleMeals.length}
			<div class="meal-grid">
				{#each visibleMeals as meal (meal.id)}
					<article class="meal-card">
						<div
							class="meal-icon"
							style={`background: ${meal.color}`}
						>
							<Icon
								name={meal.category === "Breakfast"
									? "spark"
									: meal.category === "Lunch"
										? "leaf"
										: "utensils"}
								size={18}
							/>
						</div>
						<span class="tag">{meal.category}</span>
						<h3>{meal.name}</h3>
						<p>{meal.note}</p>
						<div class="card-foot">
							<span>{meal.time}</span>
							<div class="card-actions">
								<span class="ingredient-count"
									>{meal.ingredientCount} ingredients</span
								>
								<button
									type="button"
									class="card-delete"
									aria-label={`Edit ${meal.name}`}
									title={`Edit ${meal.name}`}
									onclick={() => openEditMeal(meal)}><Icon
										name="pencil"
										size={11}
									/></button
								>
								<button
									type="button"
									class="card-delete"
									aria-label={`Duplicate ${meal.name}`}
									title={`Duplicate ${meal.name}`}
									onclick={() => duplicateMeal(meal)}><Icon
										name="copy"
										size={11}
									/></button
								>
								<button
									type="button"
									class="card-delete"
									aria-label={`Delete ${meal.name} from the database`}
									title={`Delete ${meal.name}`}
									onclick={() =>
										deleteMealFromDatabase(
											meal.id,
											meal.name,
										)}><Icon name="close" size={11} /></button
								>
							</div>
						</div>
					</article>
				{/each}
			</div>
		{:else if meals.length === 0 && !dataLoading}
			<div class="empty-state">
				<strong>Your database is empty</strong>
				<p>
					Add your first meal, or load the sample data to explore.
				</p>
				<div class="empty-actions">
					<button
						type="button"
						class="primary"
						onclick={openAddMeal}>Add a meal</button
					>
					<button
						type="button"
						class="ghost compact"
						onclick={loadSamples}>Load sample data</button
					>
				</div>
			</div>
		{:else}
			<div class="empty-state">
				<strong>No meals found</strong>
				<p>Try a different search or create a new meal.</p>
			</div>
		{/if}
	</section>
</main>

{#if toast}
	<div class="toast" role="status">
		<Icon name="check" size={13} />
		{toast}
		<button type="button" aria-label="Dismiss" onclick={() => (toast = "")}
			><Icon name="close" size={12} /></button
		>
	</div>
{/if}

{#if showMealDialog}
	<div class="backdrop">
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="meal-dialog-title"
		>
			<div class="section-head">
				<div>
					<p class="eyebrow">
						{editingMeal ? "Edit meal" : "New meal"}
					</p>
					<h2 id="meal-dialog-title">
						{editingMeal ? "Edit meal" : "Add a meal"}
					</h2>
				</div>
				<button
					type="button"
					class="icon-button"
					aria-label="Close dialog"
					onclick={closeMealDialog}
					><Icon name="close" size={15} /></button
				>
			</div>
			<form onsubmit={saveMeal}>
				<label
					>Meal name<input
						bind:value={newName}
						required
						placeholder="Crispy chickpea salad"
					/></label
				>
				<label
					>Category
					<select bind:value={newCategory}>
						{#each categoryFilters.slice(1) as option (option)}<option
								value={option}>{option}</option
							>{/each}
					</select>
				</label>
				<fieldset class="times-field">
					<legend>Meal times</legend>
					<div class="time-options">
						{#each ALL_MEAL_TIMES as time (time)}
							<label>
								<input
									type="checkbox"
									checked={newTimes.includes(time)}
									onchange={() => toggleMealTime(time)}
								/>
								<span class="time-label">{time}</span>
							</label>
						{/each}
					</div>
				</fieldset>
				<label
					>Short description<input
						bind:value={newNote}
						placeholder="A few words to jog your memory"
					/></label
				>
				<div class="ingredient-editor">
					<span class="ingredient-label" id="ingredients-label"
						>Ingredients</span
					>
					<div class="ingredient-head" aria-hidden="true">
						<span>Name</span><span>Amount</span><span
							>Group</span
						><span></span>
					</div>
					{#each editIngredients as row, i (row.key)}
						<div class="ingredient-row">
							<input
								bind:value={row.name}
								placeholder="Flour"
								aria-label={`Ingredient ${i + 1} name`}
							/>
							<input
								bind:value={row.amount}
								placeholder="1 bag"
								aria-label={`Ingredient ${i + 1} amount`}
							/>
							<select
								bind:value={row.group}
								aria-label={`Ingredient ${i + 1} group`}
							>
								<option value="Produce">Produce</option>
								<option value="Pantry">Pantry</option>
								<option value="Dairy">Dairy</option>
							</select>
							<button
								type="button"
								class="icon-button small"
								aria-label={`Remove ingredient ${i + 1}`}
								onclick={() => removeIngredientRow(row.key)}
								><Icon name="close" size={12} /></button
							>
						</div>
					{/each}
					<button
						type="button"
						class="ghost compact ingredient-add"
						onclick={addIngredientRow}
						><Icon name="plus" size={12} /> Add ingredient</button
					>
				</div>
				{#if formError}
					<p class="form-error" role="alert">{formError}</p>
				{/if}
				<div class="form-actions">
					<button
						type="button"
						class="ghost"
						onclick={closeMealDialog}>Cancel</button
					><button type="submit" class="primary"
						>{editingMeal ? "Save changes" : "Add meal"}</button
					>
				</div>
			</form>
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
		color: #87938a;
	}
	h2,
	h3,
	p {
		margin-top: 0;
	}
	h2 {
		font-family: Georgia, "Times New Roman", serif;
		letter-spacing: -0.045em;
		margin-bottom: 0;
		font-size: 26px;
	}
	h3 {
		margin-bottom: 6px;
		font-size: 14px;
	}
	button,
	input,
	select {
		font: inherit;
	}
	button {
		cursor: pointer;
	}
	.primary,
	.ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border-radius: 12px;
		padding: 11px 14px;
		font-size: 12px;
		font-weight: 800;
	}
	.primary {
		border: 0;
		background: #17221f;
		color: #f7f5ef;
	}
	.ghost {
		border: 1px solid #cfd4cc;
		background: rgba(255, 255, 255, 0.55);
		color: #35453d;
	}
	.ghost.compact {
		padding: 9px 11px;
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
	.error-note {
		margin: 0 0 14px;
		padding: 10px 14px;
		border-radius: 12px;
		background: #f7e3da;
		color: #9a4b32;
		font-size: 12px;
		font-weight: 600;
	}
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 16px;
	}
	.filters {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 4px;
	}
	.filters button {
		flex: 0 0 auto;
		border: 0;
		border-radius: 9px;
		padding: 8px 11px;
		background: transparent;
		color: #718077;
		font-size: 11px;
		font-weight: 800;
	}
	.filters button.active {
		background: #17221f;
		color: #f7f5ef;
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
	.meal-grid {
		display: grid;
		gap: 10px;
	}
	.meal-card {
		position: relative;
		padding: 14px;
		border: 1px solid #e3dfd5;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.7);
	}
	.meal-icon {
		display: grid;
		width: 42px;
		height: 42px;
		place-items: center;
		border-radius: 13px;
		color: #41574b;
	}
	.tag {
		position: absolute;
		top: 14px;
		right: 14px;
		padding: 4px 8px;
		border-radius: 999px;
		background: #f2f0e9;
		color: #7c8980;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.meal-card h3 {
		margin: 14px 0 4px;
	}
	.meal-card p {
		min-height: 32px;
		margin-bottom: 12px;
		color: #7b887f;
		font-size: 11px;
		line-height: 1.5;
	}
	.card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 10px;
		border-top: 1px solid #ece8de;
		color: #89958c;
		font-size: 10px;
	}
	.card-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ingredient-count {
		font-size: 10px;
		color: #89958c;
	}
	.card-delete {
		display: inline-flex;
		align-items: center;
		border: 0;
		border-radius: 8px;
		padding: 7px 8px;
		background: transparent;
		color: #b3aca1;
	}
	.card-delete:hover {
		background: #f7e3da;
		color: #9a4b32;
	}
	.empty-state {
		padding: 34px 16px;
		border: 1px dashed #b8c2b9;
		border-radius: 16px;
		text-align: center;
		color: #7d8a81;
	}
	.empty-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin-top: 14px;
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
	@media (max-width: 1023px) {
		.toast {
			bottom: 78px;
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
		max-height: calc(100vh - 32px);
		overflow-y: auto;
		padding: 22px;
		border: 1px solid rgba(255, 255, 255, 0.5);
		border-radius: 24px;
		background: #fbfaf6;
		box-shadow: 0 24px 70px rgba(23, 34, 31, 0.25);
	}
	.modal form {
		display: grid;
		gap: 14px;
	}
	.modal label {
		display: grid;
		gap: 6px;
		font-size: 11px;
		font-weight: 800;
		color: #4f5e55;
	}
	.modal input,
	.modal select {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #d9d5ca;
		border-radius: 12px;
		padding: 11px 12px;
		background: white;
		outline: 0;
		font-size: 13px;
		color: #17221f;
	}
	.modal input:focus,
	.modal select:focus {
		border-color: #e47d5f;
		box-shadow: 0 0 0 3px rgba(228, 125, 95, 0.15);
	}
	.form-actions {
		display: flex;
		flex-direction: column-reverse;
		gap: 8px;
		padding-top: 8px;
	}
	.form-actions button {
		width: 100%;
	}

	.ingredient-editor {
		display: grid;
		gap: 8px;
	}
	.ingredient-label {
		font-size: 11px;
		font-weight: 800;
		color: #4f5e55;
	}
	.ingredient-head {
		display: grid;
		grid-template-columns: 1fr 72px 88px 30px;
		gap: 6px;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9aa39d;
	}
	.ingredient-row {
		display: grid;
		grid-template-columns: 1fr 72px 88px 30px;
		gap: 6px;
		align-items: center;
	}
	.ingredient-row input,
	.ingredient-row select {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid #d9d5ca;
		border-radius: 10px;
		padding: 9px 8px;
		background: white;
		outline: 0;
		font-size: 12px;
		color: #17221f;
	}
	.ingredient-row input:focus,
	.ingredient-row select:focus {
		border-color: #e47d5f;
		box-shadow: 0 0 0 3px rgba(228, 125, 95, 0.15);
	}
	.icon-button.small {
		width: 30px;
		height: 30px;
		border-radius: 9px;
	}
	.ingredient-add {
		justify-self: start;
	}
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
		color: #4f5e55;
	}
	.time-options {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.time-options label {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: 1px solid #d9d5ca;
		border-radius: 999px;
		background: white;
		font-size: 12px;
		font-weight: 700;
		color: #4f5e55;
		cursor: pointer;
		text-transform: capitalize;
	}
	.time-options input {
		accent-color: #bf6c51;
	}
	.form-error {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: #9a4b32;
	}

	@media (min-width: 560px) {
		main {
			padding: 24px 28px 80px;
		}
		.toolbar {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
		.search-box {
			width: 220px;
		}
		.meal-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.form-actions {
			flex-direction: row;
			justify-content: flex-end;
		}
		.form-actions button {
			width: auto;
		}
	}

	@media (min-width: 1024px) {
		main {
			padding: 34px 40px 80px;
		}
	}

	@media (prefers-color-scheme: dark) {
		:root:not([data-theme="light"]) :global(body) {
			background: var(--app-canvas);
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .eyebrow,
		:root:not([data-theme="light"]) .meal-card p,
		:root:not([data-theme="light"]) .ingredient-count,
		:root:not([data-theme="light"]) .empty-state,
		:root:not([data-theme="light"]) .modal label,
		:root:not([data-theme="light"]) .ingredient-label {
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) h2,
		:root:not([data-theme="light"]) h3 {
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .primary {
			background: #2b3330;
			color: var(--app-dark-ink);
		}
		:root:not([data-theme="light"]) .ghost {
			border-color: var(--app-line-strong);
			background: var(--app-surface-soft);
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .icon-button {
			border-color: var(--app-line-strong);
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .panel {
			border-color: var(--app-line);
			background: var(--app-surface-soft);
		}
		:root:not([data-theme="light"]) .error-note {
			background: #3a231b;
			color: #e8a583;
		}
		:root:not([data-theme="light"]) .filters button {
			color: var(--app-faint);
		}
		:root:not([data-theme="light"]) .filters button.active {
			background: var(--app-dark-ink);
			color: #141a17;
		}
		:root:not([data-theme="light"]) .search-box {
			border-color: var(--app-line-strong);
			background: var(--app-surface-soft);
			color: var(--app-faint);
		}
		:root:not([data-theme="light"]) .search-box input {
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .meal-card {
			border-color: var(--app-line);
			background: var(--app-surface-soft);
		}
		:root:not([data-theme="light"]) .tag {
			background: var(--app-line);
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .card-foot {
			border-top-color: var(--app-line);
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .card-delete {
			color: var(--app-faint);
		}
		:root:not([data-theme="light"]) .card-delete:hover {
			background: #3a231b;
			color: #e8a583;
		}
		:root:not([data-theme="light"]) .empty-state {
			border-color: var(--app-line-strong);
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
		:root:not([data-theme="light"]) .modal input,
		:root:not([data-theme="light"]) .modal select,
		:root:not([data-theme="light"]) .ingredient-row input,
		:root:not([data-theme="light"]) .ingredient-row select {
			border-color: var(--app-line-strong);
			background: var(--app-input);
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .ingredient-head {
			color: var(--app-faint);
		}
		:root:not([data-theme="light"]) .times-field legend {
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .time-options label {
			border-color: var(--app-line-strong);
			background: var(--app-input);
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .form-error {
			color: #e8a583;
		}
	}

	:root[data-theme="dark"] :global(body) {
		background: var(--app-canvas);
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .eyebrow,
	:root[data-theme="dark"] .meal-card p,
	:root[data-theme="dark"] .ingredient-count,
	:root[data-theme="dark"] .empty-state,
	:root[data-theme="dark"] .modal label,
	:root[data-theme="dark"] .ingredient-label {
		color: var(--app-muted);
	}
	:root[data-theme="dark"] h2,
	:root[data-theme="dark"] h3 {
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .primary {
		background: #2b3330;
		color: var(--app-dark-ink);
	}
	:root[data-theme="dark"] .ghost {
		border-color: var(--app-line-strong);
		background: var(--app-surface-soft);
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .icon-button {
		border-color: var(--app-line-strong);
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .panel {
		border-color: var(--app-line);
		background: var(--app-surface-soft);
	}
	:root[data-theme="dark"] .error-note {
		background: #3a231b;
		color: #e8a583;
	}
	:root[data-theme="dark"] .filters button {
		color: var(--app-faint);
	}
	:root[data-theme="dark"] .filters button.active {
		background: var(--app-dark-ink);
		color: #141a17;
	}
	:root[data-theme="dark"] .search-box {
		border-color: var(--app-line-strong);
		background: var(--app-surface-soft);
		color: var(--app-faint);
	}
	:root[data-theme="dark"] .search-box input {
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .meal-card {
		border-color: var(--app-line);
		background: var(--app-surface-soft);
	}
	:root[data-theme="dark"] .tag {
		background: var(--app-line);
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .card-foot {
		border-top-color: var(--app-line);
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .card-delete {
		color: var(--app-faint);
	}
	:root[data-theme="dark"] .card-delete:hover {
		background: #3a231b;
		color: #e8a583;
	}
	:root[data-theme="dark"] .empty-state {
		border-color: var(--app-line-strong);
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
	:root[data-theme="dark"] .modal input,
	:root[data-theme="dark"] .modal select,
	:root[data-theme="dark"] .ingredient-row input,
	:root[data-theme="dark"] .ingredient-row select {
		border-color: var(--app-line-strong);
		background: var(--app-input);
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .ingredient-head {
		color: var(--app-faint);
	}
	:root[data-theme="dark"] .times-field legend {
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .time-options label {
		border-color: var(--app-line-strong);
		background: var(--app-input);
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .form-error {
		color: #e8a583;
	}
</style>
