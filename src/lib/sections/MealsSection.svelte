<script lang="ts">
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import CookingPotIcon from "@lucide/svelte/icons/cooking-pot";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import XIcon from "@lucide/svelte/icons/x";
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import MealEditor from "$lib/components/MealEditor.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as Tabs from "$lib/components/ui/tabs";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { GroceryGroup } from "$lib/grocery.js";
	import {
		displayMealTime,
		fallbackMealTimes,
		type MealCategory,
		type MealType,
	} from "$lib/meal-types.js";
	import { session } from "$lib/session.svelte.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	type MealTime = MealType;

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
		time: number | null | undefined;
		color: string;
		ingredientCount: number;
		ingredients: Ingredient[];
		mealTimes: MealTime[];
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
	let mealDialogKey = $state(0);

	let householdId = $derived(session.session?.householdId ?? null);
	let selfMemberId = $derived(session.session?.memberId ?? null);

	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	const createMeal = useMutation(api.meals.create);
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

	function openAddMeal(): void {
		editingMeal = null;
		mealDialogKey += 1;
		showMealDialog = true;
	}

	function openEditMeal(meal: Meal): void {
		editingMeal = meal;
		mealDialogKey += 1;
		showMealDialog = true;
	}

	function closeMealDialog(): void {
		showMealDialog = false;
		editingMeal = null;
	}

	function handleMealSaved(_mealId: string, name: string): void {
		const wasEditing = editingMeal !== null;
		toast.success(
			wasEditing ? `${name} updated` : `${name} added to the database`,
		);
		closeMealDialog();
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
			time: meal.time ?? null,
			color: meal.color,
			ingredients: meal.ingredients.map((ingredient) => ({
				...ingredient,
			})),
			mealTimes: [...meal.mealTimes],
		});
		toast.success(`Duplicated as "${name}"`);
		openEditMeal({ ...meal, id, name });
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
					><PlusIcon data-icon="inline-start" /> New meal</Button
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
					<ToggleGroup.Root
						type="single"
						variant="outline"
						size="sm"
						value={category}
						class="max-w-full touch-pan-x overflow-x-auto"
						data-no-swipe
						aria-label="Filter by category"
						onValueChange={(value) => {
							if (value) category = value as "All" | MealCategory;
						}}
					>
						{#each categoryFilters as filter (filter)}
							<ToggleGroup.Item value={filter}
								>{filter}</ToggleGroup.Item
							>
						{/each}
					</ToggleGroup.Root>
					<Input
						value={dbTab === "mine" ? search : discoverSearch}
						placeholder={dbTab === "mine"
							? "Search meals"
							: "Search recipes"}
						aria-label={dbTab === "mine"
							? "Search meals"
							: "Search recipes"}
						class="sm:w-55"
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
								{@const prepTime = displayMealTime(meal.time)}
								<Card.Root>
									<Card.Header>
										<div class="min-w-0 flex-1">
											<Card.Title>{meal.name}</Card.Title>
											<Card.Description
												>{meal.note}</Card.Description
											>
										</div>
										<Card.Action>
											<Badge variant="secondary"
												>{meal.category}</Badge
											>
										</Card.Action>
									</Card.Header>
									<Card.Content>
										<div
											class="flex items-center justify-between gap-2"
										>
											<span
												class="text-[10px] text-muted-foreground"
												>{#if prepTime}{prepTime}{" · "}{/if}{meal.ingredientCount}
												ingredients</span
											>
											<div
												class="flex items-center gap-1"
											>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Edit ${meal.name}`}
													title={`Edit ${meal.name}`}
													onclick={() =>
														openEditMeal(meal)}
													><PencilIcon /></Button
												>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Duplicate ${meal.name}`}
													title={`Duplicate ${meal.name}`}
													onclick={() =>
														duplicateMeal(meal)}
													><CopyIcon /></Button
												>
												<Button
													variant={publishedMealIds.has(
														meal.id,
													)
														? "secondary"
														: "ghost"}
													size="icon-sm"
													aria-label={publishedMealIds.has(
														meal.id,
													)
														? `Stop sharing ${meal.name}`
														: `Share ${meal.name} with the community`}
													title={publishedMealIds.has(
														meal.id,
													)
														? `Stop sharing ${meal.name}`
														: `Share ${meal.name}`}
													onclick={() =>
														toggleShare(meal)}
													><GlobeIcon /></Button
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
														)}><XIcon /></Button
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
								<Empty.Title>Your database is empty</Empty.Title
								>
								<Empty.Description>
									Add your first meal, or load the sample data
									to explore.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<div
									class="flex flex-wrap justify-center gap-2"
								>
									<Button onclick={openAddMeal}
										>Add a meal</Button
									>
									<Button
										variant="outline"
										onclick={loadSamples}
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
										<div class="min-w-0 flex-1">
											<Card.Title
												>{recipe.name}</Card.Title
											>
											<Card.Description
												>{recipe.note}</Card.Description
											>
										</div>
										<Card.Action>
											<Badge variant="secondary"
												>{recipe.category}</Badge
											>
										</Card.Action>
									</Card.Header>
									<Card.Content>
										<div
											class="flex items-center justify-between gap-2"
										>
											<span
												class="text-[10px] text-muted-foreground"
												>by {recipe.householdName} · {recipe
													.ingredients.length} ingredients</span
											>
											<div
												class="flex items-center gap-1"
											>
												<Button
													variant="outline"
													size="icon-sm"
													aria-label={`Add ${recipe.name} to your database`}
													title={`Add ${recipe.name}`}
													onclick={() =>
														adoptSharedRecipe(
															recipe._id,
														)}><PlusIcon /></Button
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
									Try a different search — or share one of
									yours.
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
		{#key mealDialogKey}
			<MealEditor
				{householdId}
				initialName={editingMeal?.name ?? ""}
				initialNote={editingMeal?.note ?? ""}
				initialTime={editingMeal?.time ?? undefined}
				initialMealTimes={editingMeal
					? [...editingMeal.mealTimes]
					: ["dinner"]}
				initialIngredients={editingMeal?.ingredients ?? []}
				editingMeal={editingMeal
					? {
							id: editingMeal.id,
							category: editingMeal.category,
							mealTimes: [...editingMeal.mealTimes],
						}
					: null}
				existingMeals={meals.map((meal) => ({
					id: meal.id,
					name: meal.name,
				}))}
				idPrefix="meal-dialog"
				onSaved={handleMealSaved}
				onCancel={closeMealDialog}
			/>
		{/key}
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global(body) {
		min-width: 320px;
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
	.meal-grid {
		display: grid;
		gap: 10px;
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
