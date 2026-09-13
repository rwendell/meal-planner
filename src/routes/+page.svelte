<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";
	import { browser } from "$app/environment";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { prefs } from "$lib/prefs.svelte.js";
	import PlannerSection from "$lib/sections/PlannerSection.svelte";

	const wideScreen = new MediaQuery("(min-width: 1024px)", true);
	const dashboardActive = $derived(
		prefs.desktopDashboard && wideScreen.current,
	);

	// In dashboard mode the planner lives at /dashboard, so visiting /
	// on desktop forwards there instead of showing the planner twice.
	$effect(() => {
		if (browser && dashboardActive) {
			void goto(resolve("/dashboard"));
		}
	});
</script>

<svelte:head>
	<title>Meal Planner</title>
	<meta
		name="description"
		content="Add meals, plan the week, and generate a shopping list."
	/>
</svelte:head>

{#if !dashboardActive}
	<PlannerSection />
{/if}
