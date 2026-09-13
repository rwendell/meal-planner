<script lang="ts">
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import CookingPotIcon from "@lucide/svelte/icons/cooking-pot";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import Icon from "$lib/components/Icon.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
	import * as Select from "$lib/components/ui/select";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as Tabs from "$lib/components/ui/tabs";
	import { session } from "$lib/session.svelte.js";
	import { cn } from "$lib/utils.js";
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
	let dbTab = $state<"mine" | "discover">("mine");
	let discoverSearch = $state("");
	let showMealDialog = $state(false);
	let editingMeal = $state<Meal | null>(null);
	let newName = $state("");
	let newCategory = $state<MealCategory>("Dinner");
	let newNote = $state("");
	let newTimes = $state<MealTime[]>(["dinner"]);
	let formError = $state("");
	let editIngredients = $state<IngredientRow[]>([]);
	let rowKey = 0;

	let householdId = $derived(session.session?.householdId ?? null);
	let selfMemberId = $derived(session.session?.memberId ?? null);

	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	const createMeal = useMutation(api.meals.create);
	const updateMeal = useMutation(api.meals.update);
	const deleteMeal = useMutation(api.meals.remove);
	const seedDatabase = useMutation(api.seed.ensureSeed);
	const publishRecipe = useMutation(api.recipes.publish);
	const unpublishRecipe = useMutation(api.recipes.unpublish);
	const adoptRecipe = useMutation(api.recipes.adopt);
	const seedSamples = useMutation(api.recipes.seedSamples);

	let sampleSeedAttempted = $state(false);

	$effect(() => {
		if (dbTab !== "discover" || sampleSeedAttempted) return;
		const data = recipesQuery.data;
		if (data !== undefined && data.length === 0) {
			sampleSeedAttempted = true;
			seedSamples({}).catch(() => {
				sampleSeedAttempted = false;
			});
		}
	});

	const recipesQuery = useQuery(api.recipes.list, () => ({}));
	const myRecipesQuery = useQuery(api.recipes.mine, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	let publishedMealIds = $derived(
		new Set<string>(
			(myRecipesQuery.data ?? []).map((row) => row.sourceMealId),
		),
	);

	let visibleRecipes = $derived.by(() => {
		const query = discoverSearch.trim().toLowerCase();
		return (recipesQuery.data ?? []).filter((recipe) => {
			const inCategory =
				category === "All" || recipe.category === category;
			const inSearch =
				!query ||
				`${recipe.name} ${recipe.note} ${recipe.householdName}`
					.toLowerCase()
					.includes(query);
			return inCategory && inSearch;
		});
	});

	async function toggleShare(meal: Meal): Promise<void> {
		if (!householdId) return;
		const household = householdId as Id<"households">;
		if (publishedMealIds.has(meal.id)) {
			await unpublishRecipe({
				householdId: household,
				mealId: meal.id as Id<"meals">,
			});
			toast.success(`${meal.name} is no longer shared`);
		} else {
			await publishRecipe({
				householdId: household,
				mealId: meal.id as Id<"meals">,
			});
			toast.success(`${meal.name} shared with the community`);
		}
	}

	async function adoptSharedRecipe(recipeId: string): Promise<void> {
		if (!householdId) return;
		const result = await adoptRecipe({
			householdId: householdId as Id<"households">,
			recipeId: recipeId as Id<"publishedRecipes">,
		});
		toast.success(`${result.name} added to your database`);
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
		if (!householdId) return;
		const name = copyName(meal.name);
		const id = await createMeal({
			householdId: householdId as Id<"households">,
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
		toast.success(`Duplicated as "${name}"`);
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
		if (!householdId) return;
		const household = householdId as Id<"households">;
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
				toast.success(`${name} updated`);
			} else {
				await createMeal({
					householdId: household,
					name,
					category: newCategory,
					note: newNote.trim() || undefined,
					ingredients,
					mealTimes: newTimes,
				});
				toast.success(`${name} added to the database`);
			}
		} catch (error) {
			formError =
				error instanceof Error
					? error.message
					: "Couldn't save the meal.";
			return;
		}
		closeMealDialog();
	}

	async function deleteMealFromDatabase(
		id: string,
		name: string,
	): Promise<void> {
		await deleteMeal({ id: id as Id<"meals"> });
		toast.success(`${name} deleted`);
	}

	async function loadSamples(): Promise<void> {
		if (!householdId || !selfMemberId) return;
		await seedDatabase({
			householdId: householdId as Id<"households">,
			memberId: selfMemberId as Id<"householdMembers">,
		});
		toast.success("Sample data loaded");
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape" && showMealDialog) closeMealDialog();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<main>
	<Card.Root>
		<Card.Header>
			<Card.Title id="meals-title">Meals</Card.Title>
			<Card.Action>
				<Button variant="outline" size="sm" onclick={openAddMeal}
					><Icon name="plus" size={14} dataIcon="inline-start" /> New meal</Button
				>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			<Tabs.Root
				value={dbTab}
				onValueChange={(value) => {
					if (value === "mine" || value === "discover") dbTab = value;
				}}
			>
				<Tabs.List aria-label="Database view">
					<Tabs.Trigger value="mine">My meals</Tabs.Trigger>
					<Tabs.Trigger value="discover">Discover</Tabs.Trigger>
				</Tabs.List>
				<div class="toolbar">
					<div class="filters" data-no-swipe>
						{#each categoryFilters as filter (filter)}
							<button
								type="button"
								class={cn(category === filter && "active")}
								onclick={() => (category = filter)}>{filter}</button
							>
						{/each}
					</div>
					<Input
						value={dbTab === "mine" ? search : discoverSearch}
						placeholder={dbTab === "mine"
							? "Search meals"
							: "Search recipes"}
						aria-label={dbTab === "mine" ? "Search meals" : "Search recipes"}
						class="sm:w-[220px]"
						oninput={(event) => {
							if (dbTab === "mine")
								search = event.currentTarget.value;
							else discoverSearch = event.currentTarget.value;
						}}
					/>
				</div>
				<Tabs.Content value="mine">
					{#if visibleMeals.length}
						<div class="meal-grid">
							{#each visibleMeals as meal (meal.id)}
								<Card.Root>
									<Card.Header>
										<div class="flex items-center gap-3">
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
											<div class="min-w-0 flex-1">
												<Card.Title>{meal.name}</Card.Title>
												<Card.Description>{meal.note}</Card.Description>
											</div>
										</div>
										<Card.Action>
											<Badge variant="secondary">{meal.category}</Badge>
										</Card.Action>
									</Card.Header>
									<Card.Content>
										<div class="flex items-center justify-between gap-2">
											<span class="text-[10px] text-muted-foreground">{meal.time}</span>
											<div class="flex items-center gap-1">
												<Badge variant="outline"
													>{meal.ingredientCount} ingredients</Badge
												>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Edit ${meal.name}`}
													title={`Edit ${meal.name}`}
													onclick={() => openEditMeal(meal)}><Icon
														name="pencil"
														size={11}
													/></Button
												>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Duplicate ${meal.name}`}
													title={`Duplicate ${meal.name}`}
													onclick={() => duplicateMeal(meal)}><Icon name="copy" size={11} /></Button
												>
												<Button
													variant={publishedMealIds.has(meal.id)
														? "secondary"
														: "ghost"}
													size="icon-sm"
													aria-label={publishedMealIds.has(meal.id)
														? `Stop sharing ${meal.name}`
														: `Share ${meal.name} with the community`}
													title={publishedMealIds.has(meal.id)
														? `Stop sharing ${meal.name}`
														: `Share ${meal.name}`}
													onclick={() => toggleShare(meal)}><Icon
														name="globe"
														size={11}
													/></Button
												>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Delete ${meal.name} from the database`}
													title={`Delete ${meal.name}`}
													onclick={() =>
														deleteMealFromDatabase(
															meal.id,
															meal.name,
														)}><Icon name="close" size={11} /></Button
												>
											</div>
										</div>
									</Card.Content>
								</Card.Root>
							{/each}
						</div>
					{:else if dataLoading}
						<div class="meal-grid">
							<Skeleton class="h-40" />
							<Skeleton class="h-40" />
							<Skeleton class="h-40" />
						</div>
					{:else if meals.length === 0}
						<Empty.Root>
							<Empty.Header>
								<Empty.Media><CookingPotIcon /></Empty.Media>
								<Empty.Title>Your database is empty</Empty.Title>
								<Empty.Description>
									Add your first meal, or load the sample data to explore.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<div class="flex flex-wrap justify-center gap-2">
									<Button onclick={openAddMeal}>Add a meal</Button>
									<Button variant="outline" onclick={loadSamples}
										>Load sample data</Button
									>
								</div>
							</Empty.Content>
						</Empty.Root>
					{:else}
						<Empty.Root>
							<Empty.Header>
								<Empty.Media><SearchXIcon /></Empty.Media>
								<Empty.Title>No meals found</Empty.Title>
								<Empty.Description>
									Try a different search or create a new meal.
								</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="discover">
					{#if visibleRecipes.length}
						<div class="meal-grid">
							{#each visibleRecipes as recipe (recipe._id)}
								<Card.Root>
									<Card.Header>
										<div class="flex items-center gap-3">
											<div
												class="meal-icon"
												style={`background: ${recipe.color}`}
											>
												<Icon
													name={recipe.category === "Breakfast"
														? "spark"
														: recipe.category === "Lunch"
															? "leaf"
															: "utensils"}
													size={18}
												/>
											</div>
											<div class="min-w-0 flex-1">
												<Card.Title>{recipe.name}</Card.Title>
												<Card.Description>{recipe.note}</Card.Description>
											</div>
										</div>
										<Card.Action>
											<Badge variant="secondary">{recipe.category}</Badge>
										</Card.Action>
									</Card.Header>
									<Card.Content>
										<div class="flex items-center justify-between gap-2">
											<span class="text-[10px] text-muted-foreground"
												>by {recipe.householdName}</span
											>
											<div class="flex items-center gap-1">
												<Badge variant="outline"
													>{recipe.ingredients.length} ingredients</Badge
												>
												<Button
													variant="outline"
													size="icon-sm"
													aria-label={`Add ${recipe.name} to your database`}
													title={`Add ${recipe.name}`}
													onclick={() => adoptSharedRecipe(recipe._id)}
													><Icon name="plus" size={14} /></Button
												>
											</div>
										</div>
									</Card.Content>
								</Card.Root>
							{/each}
						</div>
					{:else}
						<Empty.Root>
							<Empty.Header>
								<Empty.Media><BookOpenIcon /></Empty.Media>
								<Empty.Title>No recipes found</Empty.Title>
								<Empty.Description>
									Try a different search — or share one of yours.
								</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>
</main>

<Dialog.Root
	open={showMealDialog}
	onOpenChange={(open) => {
		if (!open) closeMealDialog();
	}}
>
	<Dialog.Content data-no-swipe interactOutsideBehavior="ignore">
		<Dialog.Header>
			<Dialog.Title id="meal-dialog-title">
				{editingMeal ? "Edit meal" : "Add a meal"}
			</Dialog.Title>
			<Dialog.Description>
				{editingMeal ? "Edit meal" : "New meal"}
			</Dialog.Description>
		</Dialog.Header>
		<form onsubmit={saveMeal} class="grid gap-3.5">
			<label
				for="meal-name"
				class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
				>Meal name<Input
					id="meal-name"
					bind:value={newName}
					required
					placeholder="Crispy chickpea salad"
				/></label
			>
			<label
				for="meal-category"
				class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
				>Category
				<Select.Root
					type="single"
					value={newCategory}
					onValueChange={(value) => {
						if (value) newCategory = value as MealCategory;
					}}
				>
					<Select.Trigger id="meal-category">
						<Select.Value placeholder="Select category" />
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							{#each categoryFilters.slice(1) as option (option)}<Select.Item
									value={option}
									label={option}
								/>{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
			</label>
			<fieldset class="times-field">
				<legend>Meal times</legend>
				<div class="time-options">
					{#each ALL_MEAL_TIMES as time (time)}
						<span class="time-pick">
							<Checkbox
								checked={newTimes.includes(time)}
								onCheckedChange={() => toggleMealTime(time)}
								aria-label={time}
							/>
							<button type="button" onclick={() => toggleMealTime(time)}>
								{time}
							</button>
						</span>
					{/each}
				</div>
			</fieldset>
			<label
				for="meal-note"
				class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
				>Short description<Input
					id="meal-note"
					bind:value={newNote}
					placeholder="A few words to jog your memory"
				/></label
			>
			<div class="ingredient-editor">
				<span class="ingredient-label" id="ingredients-label"
					>Ingredients</span
				>
				<div class="ingredient-head" aria-hidden="true">
					<span>Name</span><span>Amount</span><span>Group</span><span></span>
				</div>
				{#each editIngredients as row, i (row.key)}
					<div class="ingredient-row">
						<Input
							bind:value={row.name}
							placeholder="Flour"
							aria-label={`Ingredient ${i + 1} name`}
						/>
						<Input
							bind:value={row.amount}
							placeholder="1 bag"
							aria-label={`Ingredient ${i + 1} amount`}
						/>
						<Select.Root
							type="single"
							value={row.group}
							onValueChange={(value) => {
								if (value) row.group = value as GroceryGroup;
							}}
						>
							<Select.Trigger aria-label={`Ingredient ${i + 1} group`}>
								<Select.Value placeholder="Group" />
							</Select.Trigger>
							<Select.Content>
								<Select.Group>
									<Select.Item value="Produce" label="Produce" />
									<Select.Item value="Pantry" label="Pantry" />
									<Select.Item value="Dairy" label="Dairy" />
								</Select.Group>
							</Select.Content>
						</Select.Root>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove ingredient ${i + 1}`}
							onclick={() => removeIngredientRow(row.key)}
							><Icon name="close" size={12} /></Button
						>
					</div>
				{/each}
				<Button
					variant="outline"
					size="sm"
					class="justify-self-start"
					onclick={addIngredientRow}
					><Icon name="plus" size={12} dataIcon="inline-start" /> Add ingredient</Button
				>
			</div>
			{#if formError}
				<p class="m-0 text-xs font-semibold text-destructive" role="alert">{formError}</p>
			{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={closeMealDialog}>Cancel</Button>
				<Button type="submit">{editingMeal ? "Save changes" : "Add meal"}</Button>
			</Dialog.Footer>
		</form>
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
		max-width: 1180px;
		margin: 0 auto;
		padding: 20px 18px 72px;
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
		color: var(--muted-foreground);
		font-size: 11px;
		font-weight: 800;
	}
	.filters button.active {
		background: var(--foreground);
		color: var(--background);
	}
	.meal-grid {
		display: grid;
		gap: 10px;
	}
	/* Icon tiles use meal data colors (pastels in both modes), so the glyph
	   stays a fixed dark tone for contrast in light and dark mode. */
	.meal-icon {
		display: grid;
		width: 42px;
		height: 42px;
		place-items: center;
		border-radius: 13px;
		color: #41574b;
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
		color: var(--muted-foreground);
	}
	.time-options {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.time-pick {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.time-pick button {
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--foreground);
		font-size: 12px;
		font-weight: 700;
		text-transform: capitalize;
		cursor: pointer;
	}
	.ingredient-editor {
		display: grid;
		gap: 8px;
	}
	.ingredient-label {
		font-size: 11px;
		font-weight: 800;
		color: var(--muted-foreground);
	}
	.ingredient-head {
		display: grid;
		grid-template-columns: 1fr 72px 88px 30px;
		gap: 6px;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.ingredient-row {
		display: grid;
		grid-template-columns: 1fr 72px 88px 30px;
		gap: 6px;
		align-items: center;
	}

	@media (max-width: 1023px) {
		.filters {
			touch-action: pan-x;
		}
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
		.meal-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (min-width: 1024px) {
		main {
			padding: 34px 40px 80px;
		}
	}
</style>
