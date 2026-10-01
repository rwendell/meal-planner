<script lang="ts">
	import LinkIcon from "@lucide/svelte/icons/link";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import MealEditor from "$lib/cookbook/MealEditor.svelte";
	import type { CookbookMeal } from "$lib/cookbook/meal-mappers.js";
	import PickerOptionButton from "$lib/cookbook/PickerOptionButton.svelte";
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
		entryMode,
		onImportUrl,
		onImportSubmit,
		onPickMode,
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
		entryMode: "choice" | "import" | "manual";
		onImportUrl: (v: string) => void;
		onImportSubmit: (e: SubmitEvent) => void;
		onPickMode: (mode: "choice" | "import" | "manual") => void;
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
	<Dialog.Content
		data-no-swipe
		interactOutsideBehavior="ignore"
		class="sm:max-w-lg"
	>
		<Dialog.Header>
			<Dialog.Title id="meal-dialog-title">
				{editingMeal ? "Edit meal" : "Add a meal"}
			</Dialog.Title>
		</Dialog.Header>
		{#key dialogKey}
			{#if editingMeal}
				<MealEditor
					{householdId}
					initialName={editingMeal.name}
					initialNote={editingMeal.note}
					initialTime={editingMeal.time ?? undefined}
					initialSourceUrl={editingMeal.sourceUrl ?? ""}
					initialShared={publishedIds.has(editingMeal.id)}
					initialPremade={editingMeal.premade ?? false}
					initialMealTimes={[...editingMeal.mealTimes]}
					initialIngredients={editingMeal.ingredients}
					editingMeal={{
						id: editingMeal.id,
						category: editingMeal.category,
						mealTimes: [...editingMeal.mealTimes],
					}}
					existingMeals={meals}
					idPrefix="meal-dialog"
					onSaved={onSaved}
					onCancel={onClose}
				/>
			{:else if entryMode === "choice"}
				<div class="grid gap-2">
					<PickerOptionButton
						variant="outline"
						label="Import from a link"
						onclick={() => onPickMode("import")}
					>
						<LinkIcon />
						<span class="min-w-0 flex-1"
							>Import from a link<small
								class="block text-[10px] font-semibold text-muted-foreground"
								>Paste a recipe URL, details fill in</small
							></span
						>
					</PickerOptionButton>
					<PickerOptionButton
						variant="outline"
						label="Add manually"
						onclick={() => onPickMode("manual")}
					>
						<PencilIcon />
						<span class="min-w-0 flex-1"
							>Add manually<small
								class="block text-[10px] font-semibold text-muted-foreground"
								>Type everything yourself, link optional</small
							></span
						>
					</PickerOptionButton>
				</div>
			{:else if entryMode === "import"}
				<form
					class="grid gap-2 rounded-xl border border-dashed p-3"
					onsubmit={onImportSubmit}
				>
					<label
						for="meal-import-url"
						class="grid gap-1.5 text-[11px] font-extrabold text-muted-foreground"
						>Recipe link
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
				<Button
					variant="ghost"
					size="sm"
					class="mt-2 justify-self-start"
					disabled={importing}
					onclick={() => onPickMode("choice")}
					>Back</Button
				>
			{:else}
				<MealEditor
					{householdId}
					initialName={importedDraft?.name ?? ""}
					initialNote={importedDraft?.note ?? ""}
					initialTime={importedDraft?.time ?? undefined}
					initialSourceUrl={importedDraft?.sourceUrl ?? ""}
					initialShared={autoShareDefault}
					initialPremade={false}
					initialIngredients={importedDraft?.ingredients ?? []}
					editingMeal={null}
					existingMeals={meals}
					idPrefix="meal-dialog"
					onSaved={onSaved}
					onCancel={onClose}
				/>
			{/if}
		{/key}
	</Dialog.Content>
</Dialog.Root>
