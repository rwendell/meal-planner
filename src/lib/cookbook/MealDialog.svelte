<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { Separator } from "$lib/components/ui/separator";
	import MealEditor from "$lib/cookbook/MealEditor.svelte";
	import type { CookbookMeal } from "$lib/cookbook/meal-mappers.js";
	import type { GroceryGroup } from "$lib/utils/grocery.js";

	interface ImportedDraft {
		name: string;
		note: string;
		time: number | null;
		sourceUrl: string;
		ingredients: { name: string; amount?: string; group: GroceryGroup }[];
	}

	let {
		open,
		householdId,
		editingMeal,
		publishedIds,
		autoShareDefault,
		meals,
		dialogKey,
		importUrl,
		importing,
		importError,
		importedDraft,
		onImportUrl,
		onImportSubmit,
		onClose,
		onSaved,
	}: {
		open: boolean;
		householdId: string | null;
		editingMeal: CookbookMeal | null;
		publishedIds: Set<string>;
		autoShareDefault: boolean;
		meals: { id: string; name: string }[];
		dialogKey: number;
		importUrl: string;
		importing: boolean;
		importError: string;
		importedDraft: ImportedDraft | null;
		onImportUrl: (v: string) => void;
		onImportSubmit: (e: SubmitEvent) => void;
		onClose: () => void;
		onSaved: (mealId: string, name: string, shared: boolean) => void;
	} = $props();
</script>

<Dialog.Root
	{open}
	onOpenChange={(value) => {
		if (!value) onClose();
	}}
>
	<Dialog.Content data-no-swipe interactOutsideBehavior="ignore">
		<Dialog.Header>
			<Dialog.Title id="meal-dialog-title">
				{editingMeal ? "Edit meal" : "Add a meal"}
			</Dialog.Title>
		</Dialog.Header>
		{#key dialogKey}
			{#if !editingMeal}
				<form
					class="mb-3 grid gap-2 rounded-xl border border-dashed p-3"
					onsubmit={onImportSubmit}
				>
					<label
						for="meal-import-url"
						class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
						>Import from a recipe site
						<span class="flex gap-1.5">
							<Input
								id="meal-import-url"
								value={importUrl}
								oninput={(event) =>
									onImportUrl(event.currentTarget.value)}
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
					? publishedIds.has(editingMeal.id)
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
				existingMeals={meals}
				idPrefix="meal-dialog"
				onSaved={onSaved}
				onCancel={onClose}
			/>
		{/key}
	</Dialog.Content>
</Dialog.Root>
