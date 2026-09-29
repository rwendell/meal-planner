<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		align = "center",
		...restProps
	}: TooltipPrimitive.ContentProps = $props();
</script>

<TooltipPrimitive.Portal>
	<TooltipPrimitive.Content
		bind:ref
		data-slot="tooltip-content"
		{sideOffset}
		{align}
		class={cn(
			"bg-primary text-primary-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 z-50 w-fit max-w-60 origin-(--bits-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance outline-hidden",
			className
		)}
		{...restProps}
	/>
</TooltipPrimitive.Portal>
