<script lang="ts">
	import * as Avatar from "$lib/components/ui/avatar";
	import { initials } from "$lib/members.js";
	import { cn } from "$lib/utils.js";

	type Size = "sm" | "md" | "lg";

	const sizes: Record<Size, { root: string; fallback: string }> = {
		sm: { root: "size-6", fallback: "text-[10px]" },
		md: { root: "size-8", fallback: "text-sm" },
		lg: { root: "size-9", fallback: "text-sm" },
	};

	let {
		name,
		image = null,
		size = "md",
		class: className,
	}: {
		name: string;
		image?: string | null;
		size?: Size;
		class?: string;
	} = $props();
</script>

<Avatar.Root class={cn(sizes[size].root, className)} aria-hidden="true">
	{#if image}
		<Avatar.Image
			src={image}
			alt={name}
			referrerpolicy="no-referrer"
		/>
	{/if}
	<Avatar.Fallback class={cn("font-bold", sizes[size].fallback)}>
		{initials(name)}
	</Avatar.Fallback>
</Avatar.Root>
