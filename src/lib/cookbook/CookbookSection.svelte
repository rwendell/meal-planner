<script lang="ts">
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import CookingPotIcon from "@lucide/svelte/icons/cooking-pot";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import { useAction, useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import PlannerHero from "$lib/components/PlannerHero.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as Tabs from "$lib/components/ui/tabs";
	import MealCard from "$lib/cookbook/MealCard.svelte";
	import MealDialog from "$lib/cookbook/MealDialog.svelte";
	import MealsToolbar from "$lib/cookbook/MealsToolbar.svelte";
	import { suggestCopyName, validateRecipeUrl } from "$lib/cookbook/meal-form.js";
	import {
		type CookbookMeal,
		mapToCookbookMeals,
	} from "$lib/cookbook/meal-mappers.js";
	import RecipeCard from "$lib/cookbook/RecipeCard.svelte";
	import { session } from "$lib/stores/session.svelte.js";
	import { createDbErrorDeduper } from "$lib/utils/db-errors.js";
	import { errorMessage } from "$lib/utils/errors.js";
	import type { GroceryGroup } from "$lib/utils/grocery.js";
	import type { MealCategory } from "$lib/utils/meal-types.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	let { hero = true }: { hero?: boolean } = $props();

	let search = $state("");
	let category = $state<"All" | MealCategory>("All");
	let cookbookTab = $state<"cookbook" | "discover">("cookbook");
	let discoverSearch = $state("");
	let showMealDialog = $state(false);
	let editingMeal = $state<CookbookMeal | null>(null);
	let mealDialogKey = $state(0);

	interface ImportedDraft {
		name: string;
		note: string;
		time: number | null;
		sourceUrl: string;
		ingredients: { name: string; amount?: string; group: GroceryGroup }[];
	}

	let importUrl = $state("");
	let importing = $state(false);
	let importError = $state("");
	let importedDraft = $state<ImportedDraft | null>(null);
	const importRecipe = useAction(api.recipeImport.importFromUrl);

	async function handleImportRecipe(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const url = importUrl.trim();
		if (!url || importing) return;
		const check = validateRecipeUrl(url);
		if (!check.ok) {
			importError = check.error;
			return;
		}
		const sourceUrl = check.normalized;
		importError = "";
		importing = true;
		try {
			const result = await importRecipe({ url });
			importedDraft = {
				name: result.name,
				note: result.note,
				time: result.time,
				sourceUrl: result.sourceUrl,
				ingredients: result.ingredients.map((ingredient) => ({
					name: ingredient.name,
					amount: ingredient.amount,
					group: ingredient.group as GroceryGroup,
				})),
			};
			mealDialogKey += 1;
			toast.success(`Imported ${result.name} — review and save`);
		} catch {
			importedDraft = {
				name: "",
				note: "",
				time: null,
				sourceUrl,
				ingredients: [],
			};
			mealDialogKey += 1;
			toast.success(
				"Couldn't read a recipe there — link saved as the source instead",
			);
		} finally {
			importing = false;
		}
	}

	let householdId = $derived(session.session?.householdId ?? null);
	let selfMemberId = $derived(session.session?.memberId ?? null);

	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	const createMeal = useMutation(api.meals.create);
	const removeMeal = useMutation(api.meals.remove);
	const ensureSamples = useMutation(api.seed.ensureSamples);
	const publishRecipe = useMutation(api.recipes.publish);
	const unpublishRecipe = useMutation(api.recipes.unpublish);
	const adoptRecipe = useMutation(api.recipes.adopt);
	const seedSamples = useMutation(api.recipes.seedSamples);

	let sampleSeedAttempted = $state(false);

	$effect(() => {
		if (cookbookTab !== "discover" || sampleSeedAttempted) return;
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
	const householdQuery = useQuery(api.households.get, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	let autoShareDefault = $derived(
		householdQuery.data?.members.find((m) => m._id === selfMemberId)
			?.autoShareMeals ?? true,
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

	async function adoptSharedRecipe(recipeId: string): Promise<void> {
		if (!householdId) return;
		const result = await adoptRecipe({
			householdId: householdId as Id<"households">,
			recipeId: recipeId as Id<"publishedRecipes">,
		});
		toast.success(`${result.name} added to your cookbook`);
	}

	let meals = $derived<CookbookMeal[]>(
		mapToCookbookMeals((mealsQuery.data ?? []) as never[]),
	);

	const dbErrors = createDbErrorDeduper();
	$effect(() => {
		dbErrors.report(mealsQuery.error);
	});

	let dataLoading = $derived(mealsQuery.isLoading);

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
		importUrl = "";
		importError = "";
		importedDraft = null;
		mealDialogKey += 1;
		showMealDialog = true;
	}

	function openEditMeal(meal: CookbookMeal): void {
		editingMeal = meal;
		importUrl = "";
		importError = "";
		importedDraft = null;
		mealDialogKey += 1;
		showMealDialog = true;
	}

	function closeMealDialog(): void {
		showMealDialog = false;
		editingMeal = null;
		importedDraft = null;
	}

	async function handleMealSaved(
		mealId: string,
		name: string,
		shared: boolean,
	): Promise<void> {
		const wasEditing = editingMeal !== null;
		if (wasEditing && householdId) {
			const household = householdId as Id<"households">;
			const id = mealId as Id<"meals">;
			const wasPublished = publishedMealIds.has(mealId);
			try {
				if (shared && !wasPublished) {
					await publishRecipe({ householdId: household, mealId: id });
					toast.success(`${name} shared with the community`);
				} else if (!shared && wasPublished) {
					await unpublishRecipe({
						householdId: household,
						mealId: id,
					});
					toast.success(`${name} is no longer shared`);
				}
			} catch (error) {
				toast.error(errorMessage(error, "Couldn't update sharing."));
			}
		}
		toast.success(
			wasEditing ? `${name} updated` : `${name} added to your cookbook`,
		);
		closeMealDialog();
	}

	async function duplicateMeal(meal: CookbookMeal): Promise<void> {
		if (!householdId) return;
		const name = suggestCopyName(
			meal.name,
			meals.map((m) => m.name),
		);
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
			shared: publishedMealIds.has(meal.id),
			premade: meal.premade,
		});
		toast.success(`Duplicated as "${name}"`);
		openEditMeal({ ...meal, id, name });
	}

	async function deleteMeal(
		id: string,
		name: string,
	): Promise<void> {
		await removeMeal({ id: id as Id<"meals"> });
		toast.success(`${name} deleted`);
	}

	async function loadSamples(): Promise<void> {
		if (!householdId || !selfMemberId) return;
		await ensureSamples({
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

<div class="flex flex-col gap-4">
	{#if hero}<PlannerHero />{/if}
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
				value={cookbookTab}
				onValueChange={(value) => {
					if (value === "cookbook" || value === "discover") cookbookTab = value;
				}}
			>
				<Tabs.List aria-label="Cookbook view">
					<Tabs.Trigger value="cookbook">My meals</Tabs.Trigger>
					<Tabs.Trigger value="discover">Discover</Tabs.Trigger>
				</Tabs.List>
				<MealsToolbar
					{category}
					activeTab={cookbookTab}
					searchValue={cookbookTab === "cookbook" ? search : discoverSearch}
					onCategory={(c) => (category = c)}
					onSearch={(v) => {
						if (cookbookTab === "cookbook") search = v;
						else discoverSearch = v;
					}}
				/>
				<Tabs.Content value="cookbook">
					{#if visibleMeals.length}
						<div class="grid gap-2.5 min-[560px]:grid-cols-2">
							{#each visibleMeals as meal (meal.id)}
								<MealCard
									{meal}
									shared={publishedMealIds.has(meal.id)}
									onEdit={openEditMeal}
									onDuplicate={(m) => void duplicateMeal(m)}
									onDelete={(id, name) =>
										void deleteMeal(id, name)}
								/>
							{/each}
						</div>
					{:else if dataLoading}
						<div class="grid gap-2.5 min-[560px]:grid-cols-2">
							<Skeleton class="h-40" />
							<Skeleton class="h-40" />
							<Skeleton class="h-40" />
						</div>
					{:else if meals.length === 0}
						<Empty.Root>
							<Empty.Header>
								<Empty.Media><CookingPotIcon /></Empty.Media>
								<Empty.Title>Your cookbook is empty</Empty.Title>
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
						<div class="grid gap-2.5 min-[560px]:grid-cols-2">
							{#each visibleRecipes as recipe (recipe._id)}
								<RecipeCard
									{recipe}
									onAdopt={(id) => void adoptSharedRecipe(id)}
								/>
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
</div>

<MealDialog
	open={showMealDialog}
	{householdId}
	{editingMeal}
	publishedIds={publishedMealIds}
	{autoShareDefault}
	meals={meals.map((meal) => ({ id: meal.id, name: meal.name }))}
	dialogKey={mealDialogKey}
	{importUrl}
	{importing}
	{importError}
	{importedDraft}
	onImportUrl={(v) => (importUrl = v)}
	onImportSubmit={handleImportRecipe}
	onClose={closeMealDialog}
	onSaved={(mealId, name, shared) =>
		void handleMealSaved(mealId, name, shared)}
/>
