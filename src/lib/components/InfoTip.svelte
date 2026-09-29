<script lang="ts">
	import InfoIcon from "@lucide/svelte/icons/info";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import { cn } from "$lib/utils.js";

	/**
	 * Inline hint for form labels: an info icon showing `text` in a
	 * tooltip, replacing always-visible gray subtext.
	 */
	let {
		text,
		class: className,
	}: {
		text: string;
		class?: string;
	} = $props();
</script>

<Tooltip.Provider>
	<Tooltip.Root>
		<Tooltip.Trigger
			aria-label={text}
			class={cn(
				"inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
				className,
			)}
		>
			<InfoIcon class="size-3.5" />
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p class="m-0 max-w-60 text-xs">{text}</p>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
