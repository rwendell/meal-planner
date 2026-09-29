<script lang="ts">
	import InfoTip from "$lib/components/InfoTip.svelte";
	import { Separator } from "$lib/components/ui/separator";
	import { Switch } from "$lib/components/ui/switch";

	let {
		prefix,
		shared,
		onChange
	}: {
		prefix: string;
		shared: boolean;
		onChange: (v: boolean) => void;
	} = $props();
</script>

<Separator />
<div class="flex items-center justify-between gap-3 rounded-xl border p-3">
	<span class="grid gap-0.5">
		<span class="flex items-center gap-1.5">
			<label
				for={`${prefix}-meal-shared`}
				class="cursor-pointer text-sm font-semibold"
				>Share publicly</label
			>
			<InfoTip text="Show in the community cookbook" />
		</span>
	</span>
	<Switch
		id={`${prefix}-meal-shared`}
		checked={shared}
		onCheckedChange={(value) => {
			if (typeof value === "boolean") onChange(value);
		}}
		aria-label="Share publicly"
	/>
</div>
