<script lang="ts">
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
		<label
			for={`${prefix}-meal-shared`}
			class="cursor-pointer text-sm font-semibold"
			>Share publicly</label
		>
		<span class="text-xs text-muted-foreground">
			Show in the community cookbook
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
