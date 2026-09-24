<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.ItemProps = $props();
</script>

<!--
	Selected-state selectors target attributes the pinned bits-ui emits
	(aria-selected, data-disabled presence) — verified against the
	installed build, not the latest registry.
-->
<CommandPrimitive.Item
	bind:ref
	data-slot="command-item"
	class={cn(
		"relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
		className,
	)}
	{...restProps}
/>
