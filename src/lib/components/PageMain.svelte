<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils.js";

	/**
	 * Page landmark + container. Routes own the single `<main>` per page;
	 * sections render content only, so they compose cleanly on both
	 * standalone pages and the dashboard (which uses its own grid main).
	 * The `class` prop carries the per-page large-screen tweaks.
	 */
	let {
		class: className,
		children,
	}: {
		class?: string;
		children: Snippet;
	} = $props();
</script>

<main
	class={cn(
		"mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-[18px] pt-5 pb-[72px] min-[560px]:px-7 min-[560px]:pt-6 min-[560px]:pb-20 lg:pb-20",
		className,
	)}
>
	{@render children()}
</main>
