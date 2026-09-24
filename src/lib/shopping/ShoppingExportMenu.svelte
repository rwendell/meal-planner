<script lang="ts">
	import CopyIcon from "@lucide/svelte/icons/copy";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import ShareIcon from "@lucide/svelte/icons/share";
	import { tick } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Popover from "$lib/components/ui/popover";

	let {
		onCopy,
		onDownload,
		onPrint,
	}: {
		onCopy: () => void | Promise<void>;
		onDownload: () => void | Promise<void>;
		onPrint: () => void | Promise<void>;
	} = $props();

	let open = $state(false);

	async function select(action: () => void | Promise<void>): Promise<void> {
		open = false;
		// Let the popover unmount before printing so it never lands
		// on the paper.
		await tick();
		await action();
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" size="sm" {...props}>
				<ShareIcon data-icon="inline-start" /> Export
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-52 p-1.5">
		<div class="grid gap-0.5" role="menu" aria-label="Export shopping list">
			<Button
				variant="ghost"
				size="sm"
				class="justify-start"
				role="menuitem"
				onclick={() => void select(onCopy)}
			>
				<CopyIcon data-icon="inline-start" /> Copy to clipboard
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="justify-start"
				role="menuitem"
				onclick={() => void select(onDownload)}
			>
				<DownloadIcon data-icon="inline-start" /> Download .txt
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="justify-start"
				role="menuitem"
				onclick={() => void select(onPrint)}
			>
				<PrinterIcon data-icon="inline-start" /> Print
			</Button>
		</div>
	</Popover.Content>
</Popover.Root>
