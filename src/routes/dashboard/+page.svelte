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

<div
	class="mx-auto grid max-w-[1180px] gap-7 px-7 pt-7 pb-20 [&>section>main]:m-0 [&>section>main]:max-w-none [&>section>main]:p-0 [&>section>main>.panel:first-child]:mt-0"
>
	<section id="dashboard-planner" aria-label="Weekly planner">
		<PlannerSection />
	</section>
	<section id="dashboard-meals" aria-label="Meal database">
		<MealsSection />
	</section>
	<section id="dashboard-shopping" aria-label="Shopping list">
		<ShoppingSection />
	</section>
</div>
