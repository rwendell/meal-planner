<script lang="ts">
	import type { Snippet } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	/**
	 * Ghost text button: plain text until hovered, when a border appears
	 * so users can tell it's interactive. `tone="destructive"` keeps the
	 * red hover for Leave / Use up style actions.
	 */
	let {
		tone = "muted",
		pressed,
		label,
		title,
		disabled,
		onclick,
		class: className,
		children,
		...rest
	}: {
		tone?: "muted" | "destructive";
		pressed?: boolean;
		label: string;
		title?: string;
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		children: Snippet;
		[key: string]: unknown;
	} = $props();
</script>

<Button
	variant="ghost"
	size="sm"
	class={cn(
		"border border-transparent hover:border-border",
		tone === "destructive"
			? "text-muted-foreground hover:text-destructive"
			: "text-muted-foreground hover:text-foreground",
		className,
	)}
	aria-pressed={pressed}
	aria-label={label}
	title={title ?? label}
	{disabled}
	{onclick}
	{...rest}
>
	{@render children()}
</Button>
