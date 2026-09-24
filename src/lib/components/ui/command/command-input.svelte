<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	// Deviation from registry: forwards bind:ref straight to the
	// primitive (registry routes through InputGroup, which drops it),
	// so callers can focus the search box programmatically.
	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(""),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<div
	data-slot="command-input-wrapper"
	class="flex h-9 items-center gap-2 border-b px-3"
>
	<SearchIcon class="size-4 shrink-0 opacity-50" />
	<CommandPrimitive.Input
		bind:ref
		bind:value
		data-slot="command-input"
		class={cn(
			"placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
			className,
		)}
		{...restProps}
	/>
</div>
