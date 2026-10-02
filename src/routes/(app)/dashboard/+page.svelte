<script lang="ts">
	import CookbookSection from "$lib/cookbook/CookbookSection.svelte";
	import PlannerSection from "$lib/planner/PlannerSection.svelte";
	import ShoppingSection from "$lib/shopping/ShoppingSection.svelte";
</script>

<svelte:head>
	<title>Dashboard · Meal Planner</title>
	<meta
		name="description"
		content="Weekly planner, cookbook, and shopping list in one desktop view."
	/>
</svelte:head>

<div class="grid gap-7">
	<section id="dashboard-planner" aria-label="Weekly planner" class="print:hidden">
		<PlannerSection />
	</section>
	<section id="dashboard-meals" aria-label="Cookbook" class="print:hidden">
		<CookbookSection hero={false} />
	</section>
	<section id="dashboard-shopping" aria-label="Shopping list">
		<ShoppingSection hero={false} />
	</section>
</div>
