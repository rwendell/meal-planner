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

<main class="mx-auto grid max-w-[1180px] gap-7 px-7 pt-7 pb-20">
	<section id="dashboard-planner" aria-label="Weekly planner">
		<PlannerSection />
	</section>
	<section id="dashboard-meals" aria-label="Cookbook">
		<CookbookSection hero={false} />
	</section>
	<section id="dashboard-shopping" aria-label="Shopping list">
		<ShoppingSection hero={false} />
	</section>
</main>
