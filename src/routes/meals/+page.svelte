<script lang="ts">
	import PageMain from "$lib/components/PageMain.svelte";
	import MealsSection from "$lib/sections/MealsSection.svelte";
</script>

<svelte:head>
	<title>Meal database · Meal Planner</title>
	<meta
		name="description"
		content="Browse, search, and add meals to the database."
	/>
</svelte:head>

<PageMain class="lg:px-10 lg:pt-[34px]">
	<MealsSection />
</PageMain>
