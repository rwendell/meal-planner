<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import PlannerMemberToggle from "./PlannerMemberToggle.svelte";

	interface Props {
		showMemberToggle: boolean;
		members: Array<{ _id: string; name: string }>;
		memberValue: string;
		onMemberChange: (v: string) => void;
		mode: "planner" | "list";
		savingMode: boolean;
		isSelfView: boolean;
		onModeChange: (m: "planner" | "list") => void;
	}

	let {
		showMemberToggle,
		members,
		memberValue,
		onMemberChange,
		mode,
		savingMode,
		isSelfView,
		onModeChange
	}: Props = $props();
</script>

{#if showMemberToggle || isSelfView}
	<Card.Header>
		<div class="flex flex-wrap items-center justify-between gap-2.5">
			{#if showMemberToggle}
				<PlannerMemberToggle
					{members}
					value={memberValue}
					onChange={onMemberChange}
				/>
			{/if}
			{#if isSelfView}
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					value={mode}
					aria-label="Planner view"
					onValueChange={(value) => {
						if (value === "planner" || value === "list") {
							onModeChange(value);
						}
					}}
				>
					<ToggleGroup.Item value="planner" disabled={savingMode}>
						Planner
					</ToggleGroup.Item>
					<ToggleGroup.Item value="list" disabled={savingMode}>
						List
					</ToggleGroup.Item>
				</ToggleGroup.Root>
			{/if}
		</div>
	</Card.Header>
{/if}
