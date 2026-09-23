<script lang="ts">
	import PageMain from "$lib/components/PageMain.svelte";
	import CookbookSection from "$lib/cookbook/CookbookSection.svelte";
</script>

<svelte:head>
	<title>Cookbook · Meal Planner</title>
	<meta
		name="description"
		content="Browse, search, and add meals to your cookbook."
	/>
</svelte:head>

<PageMain class="lg:px-10 lg:pt-[34px]">
	<CookbookSection />
</PageMain>
