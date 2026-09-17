<script lang="ts">
	import { ShareIcon } from "@lucide/svelte";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import CookingPotIcon from "@lucide/svelte/icons/cooking-pot";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import XIcon from "@lucide/svelte/icons/x";
	import { useAction, useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import MealEditor from "$lib/components/MealEditor.svelte";
	import PlannerHero from "$lib/components/PlannerHero.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
	import { Separator } from "$lib/components/ui/separator";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as Tabs from "$lib/components/ui/tabs";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { errorMessage } from "$lib/errors.js";
	import type { GroceryGroup } from "$lib/grocery.js";
	import {
		displayMealTime,
		fallbackMealTimes,
		MEAL_TYPES,
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
		sourceUrl: string | null;
		premade: boolean;
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

	// Pages view shows the shared planner hero above the database; the
	// dashboard already has the planner's hero, so it opts out.
	let { hero = true }: { hero?: boolean } = $props();

	let search = $state("");
	let category = $state<"All" | MealCategory>("All");
	let dbTab = $state<"mine" | "discover">("mine");
	let discoverSearch = $state("");
	let showMealDialog = $state(false);
	let editingMeal = $state<Meal | null>(null);
	let mealDialogKey = $state(0);

	interface ImportedDraft {
		name: string;
		note: string;
		time: number | null;
		sourceUrl: string;
		ingredients: Ingredient[];
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
		// Shape-check locally so malformed input never becomes a source
		// link; the server re-validates strictly before fetching.
		let sourceUrl: string;
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				throw new Error();
			}
			sourceUrl = parsed.toString();
		} catch {
			importError = "Enter a valid recipe URL starting with http.";
			return;
		}
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
			// Fallback: the page couldn't be read, so keep its link as
			// the meal's source and let the rest be filled in by hand.
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
	const householdQuery = useQuery(api.households.get, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	// New meals share publicly unless this member opted out.
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
			sourceUrl: meal.sourceUrl ?? null,
			premade: meal.premade ?? false,
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
		importUrl = "";
		importError = "";
		importedDraft = null;
		mealDialogKey += 1;
		showMealDialog = true;
	}

	function openEditMeal(meal: Meal): void {
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
		// Creates already applied `shared` server-side; edits reconcile
		// the published snapshot here to match the switch.
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
			// Duplicates keep the source meal's visibility and kind.
			shared: publishedMealIds.has(meal.id),
			premade: meal.premade,
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

<main
	class="mx-auto flex max-w-[1180px] flex-col gap-4 px-[18px] pt-5 pb-[72px] min-[560px]:px-7 min-[560px]:pt-6 min-[560px]:pb-20 lg:px-10 lg:pt-[34px] lg:pb-20"
>
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
				value={dbTab}
				onValueChange={(value) => {
					if (value === "mine" || value === "discover") dbTab = value;
				}}
			>
				<Tabs.List aria-label="Database view">
					<Tabs.Trigger value="mine">My meals</Tabs.Trigger>
					<Tabs.Trigger value="discover">Discover</Tabs.Trigger>
				</Tabs.List>
				<div
					class="mb-4 flex flex-col gap-2.5 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between"
				>
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
						<div class="grid gap-2.5 min-[560px]:grid-cols-2">
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
											<span
												class="flex flex-wrap justify-end gap-1"
											>
												{#each MEAL_TYPES.filter( (type) => meal.mealTimes.includes(type.id), ) as time (time.id)}
													<Badge variant="secondary"
														>{time.label}</Badge
													>
												{/each}
											</span>
										</Card.Action>
									</Card.Header>
									<Card.Content>
										<div
											class="flex items-center justify-between gap-2"
										>
											<span
												class="text-[10px] text-muted-foreground"
												>{#if prepTime}{prepTime}{" · "}{/if}{meal.ingredientCount}
												ingredients{#if meal.sourceUrl}{" · "}<a
														href={meal.sourceUrl}
														target="_blank"
														rel="noreferrer noopener"
														class="underline underline-offset-2"
														>Source</a
													>{/if}</span
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
											{#if publishedMealIds.has(meal.id)}
												<span
													class="grid size-7 place-items-center text-muted-foreground"
													title="Shared publicly"
													role="img"
													aria-label={`${meal.name} is shared publicly`}
												>
													<ShareIcon size={14} />
												</span>
											{/if}
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
						<div class="grid gap-2.5 min-[560px]:grid-cols-2">
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
						<div class="grid gap-2.5 min-[560px]:grid-cols-2">
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
		</Dialog.Header>
		{#key mealDialogKey}
			{#if !editingMeal}
				<form
					class="mb-3 grid gap-2 rounded-xl border border-dashed p-3"
					onsubmit={handleImportRecipe}
				>
					<label
						for="meal-import-url"
						class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
						>Import from a recipe site
						<span class="flex gap-1.5">
							<Input
								id="meal-import-url"
								bind:value={importUrl}
								type="url"
								required
								autocomplete="off"
								spellcheck={false}
								disabled={importing}
								class="min-w-0 flex-1"
							/>
							<Button
								type="submit"
								disabled={!importUrl.trim() || importing}
								class="shrink-0"
							>
								{importing ? "Importing…" : "Import"}
							</Button>
						</span>
					</label>
					{#if importError}
						<p
							class="m-0 text-xs font-semibold text-destructive"
							role="alert"
						>
							{importError}
						</p>
					{/if}
				</form>
				<Separator />
			{/if}
			<MealEditor
				{householdId}
				initialName={importedDraft?.name ?? editingMeal?.name ?? ""}
				initialNote={importedDraft?.note ?? editingMeal?.note ?? ""}
				initialTime={importedDraft?.time ??
					editingMeal?.time ??
					undefined}
				initialSourceUrl={importedDraft?.sourceUrl ??
					editingMeal?.sourceUrl ??
					""}
				initialShared={editingMeal
					? publishedMealIds.has(editingMeal.id)
					: autoShareDefault}
				initialPremade={editingMeal?.premade ?? false}
				initialMealTimes={editingMeal
					? [...editingMeal.mealTimes]
					: ["dinner"]}
				initialIngredients={importedDraft?.ingredients ??
					editingMeal?.ingredients ??
					[]}
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
