<script lang="ts">
	import * as ToggleGroup from "$lib/components/ui/toggle-group";

	interface Props {
		members: Array<{ _id: string; name: string }>;
		value: string;
		onChange: (v: string) => void;
	}

	let { members, value, onChange }: Props = $props();
</script>

<ToggleGroup.Root
	type="single"
	variant="outline"
	{value}
	aria-label="Whose plan"
	onValueChange={(v) => {
		if (v) onChange(v);
	}}
>
	{#each members as member (member._id)}
		<ToggleGroup.Item value={member._id} aria-label={member.name}>
			{member.name}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
