<script lang="ts">
	import type { Snippet } from "svelte";
	import { Button } from "$lib/components/ui/button";

	/**
	 * Option row in the meal picker dialog, shared by meal picks and the
	 * skip action so every row sizes the same. Row content goes in the
	 * children snippet.
	 */
	let {
		onclick,
		label,
		variant = "ghost",
		children,
	}: {
		onclick: () => void;
		label: string;
		variant?: "ghost" | "outline";
		children: Snippet;
	} = $props();
</script>

<Button
	{variant}
	class="h-auto w-full justify-start gap-2.5 px-3 py-2.5 text-left"
	aria-label={label}
	{onclick}
>
	{@render children()}
</Button>
