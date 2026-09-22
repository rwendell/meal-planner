<script lang="ts">
	import MealsSection from "$lib/sections/MealsSection.svelte";
	import PlannerSection from "$lib/sections/PlannerSection.svelte";
	import ShoppingSection from "$lib/sections/ShoppingSection.svelte";
</script>

<svelte:head>
	<title>Dashboard · Meal Planner</title>
	<meta
		name="description"
		content="Weekly planner, meal database, and shopping list in one desktop view."
	/>
</svelte:head>

<main class="mx-auto grid max-w-[1180px] gap-7 px-7 pt-7 pb-20">
	<section id="dashboard-planner" aria-label="Weekly planner">
		<PlannerSection />
	</section>
	<section id="dashboard-meals" aria-label="Meal database">
		<MealsSection hero={false} />
	</section>
	<section id="dashboard-shopping" aria-label="Shopping list">
		<ShoppingSection hero={false} />
	</section>
</main>
