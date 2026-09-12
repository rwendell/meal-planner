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

<div class="dashboard">
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

<style>
	.dashboard {
		display: grid;
		gap: 28px;
		max-width: 1180px;
		margin: 0 auto;
		padding: 28px 28px 80px;
	}
	/* Sections bring their own page-level <main> spacing; neutralize it so
	   the dashboard owns the vertical rhythm instead of triple-stacking it. */
	.dashboard > section > :global(main) {
		max-width: none;
		margin: 0;
		padding: 0;
	}
	.dashboard > section > :global(main > .panel:first-child) {
		margin-top: 0;
	}
</style>
