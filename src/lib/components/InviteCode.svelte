<script lang="ts">
	import { toast } from "svelte-sonner";
	import { copyText } from "$lib/clipboard.js";
	import Icon from "$lib/components/Icon.svelte";
	import { Button } from "$lib/components/ui/button";

	let { code }: { code: string } = $props();

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	async function copy(): Promise<void> {
		clearTimeout(copyTimer);
		const ok = await copyText(code);
		if (!ok) {
			toast.error("Copy was blocked by the browser");
			return;
		}
		copied = true;
		copyTimer = setTimeout(() => {
			copied = false;
		}, 2000);
	}
</script>

<Button
	variant="outline"
	class="h-auto w-fit max-w-full justify-start gap-2 py-1.5"
	aria-label={`Copy invite code ${code}`}
	onclick={copy}
>
	<Icon name={copied ? "check" : "copy"} size={13} dataIcon="inline-start" />
	<span class="font-mono text-sm font-extrabold tracking-[0.2em]">{code}</span>
</Button>
