<script lang="ts">
	import PageMain from "$lib/components/PageMain.svelte";
	import ShoppingSection from "$lib/sections/ShoppingSection.svelte";
</script>

<svelte:head>
	<title>Shopping list · Meal Planner</title>
	<meta
		name="description"
		content="Generate a shopping list from the planned meals."
	/>
</svelte:head>

<PageMain class="lg:px-10 lg:pt-[34px]">
	<ShoppingSection />
</PageMain>
