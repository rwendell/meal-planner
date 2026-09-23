<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { MealCategory } from "$lib/utils/meal-types.js";

	const categoryFilters: ("All" | MealCategory)[] = [
		"All",
		"Breakfast",
		"Lunch",
		"Dinner",
		"Snack",
	];

	let {
		category,
		activeTab,
		searchValue,
		onCategory,
		onSearch,
	}: {
		category: "All" | MealCategory;
		activeTab: "cookbook" | "discover";
		searchValue: string;
		onCategory: (c: "All" | MealCategory) => void;
		onSearch: (v: string) => void;
	} = $props();
</script>

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
			if (value) onCategory(value as "All" | MealCategory);
		}}
	>
		{#each categoryFilters as filter (filter)}
			<ToggleGroup.Item value={filter}>{filter}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
	<Input
		value={searchValue}
		placeholder={activeTab === "cookbook" ? "Search meals" : "Search recipes"}
		aria-label={activeTab === "cookbook" ? "Search meals" : "Search recipes"}
		class="sm:w-55"
		oninput={(event) => {
			onSearch(event.currentTarget.value);
		}}
	/>
</div>
