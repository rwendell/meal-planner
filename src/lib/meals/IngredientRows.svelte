<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Select from "$lib/components/ui/select";
	import { type GroceryGroup, groceryGroups } from "$lib/grocery.js";

	interface IngredientRow {
		key: number;
		name: string;
		amount: string;
		group: GroceryGroup;
	}

	let {
		rows = $bindable(),
		prefix,
		onAdd,
		onRemove
	}: {
		rows: IngredientRow[];
		prefix: string;
		onAdd: () => void;
		onRemove: (key: number) => void;
	} = $props();
</script>

<div class="grid gap-2">
	<span
		class="text-[11px] font-extrabold text-foreground"
		id={`${prefix}-ingredients-label`}>Ingredients</span
	>
	<div
		class="grid grid-cols-[1fr_72px_88px_30px] gap-1.5 text-[9px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase"
		aria-hidden="true"
	>
		<span>Name</span><span>Amount</span><span>Group</span><span></span>
	</div>
	{#each rows as row, i (row.key)}
		<div
			class="grid grid-cols-[1fr_72px_88px_30px] items-center gap-1.5"
		>
			<Input
				bind:value={rows[i].name}
				aria-label={`Ingredient ${i + 1} name`}
			/>
			<Input
				bind:value={rows[i].amount}
				aria-label={`Ingredient ${i + 1} amount`}
			/>
			<Select.Root
				type="single"
				value={rows[i].group}
				items={groceryGroups.map((group) => ({
					value: group,
					label: group
				}))}
				onValueChange={(value) => {
					if (value) rows[i].group = value as GroceryGroup;
				}}
			>
				<Select.Trigger aria-label={`Ingredient ${i + 1} group`}>
					<Select.Value placeholder="Group" />
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						{#each groceryGroups as group (group)}<Select.Item
								value={group}
								label={group}
							/>{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={`Remove ingredient ${i + 1}`}
				onclick={() => onRemove(row.key)}
				><XIcon /></Button
			>
		</div>
	{/each}
	<Button
		variant="outline"
		size="sm"
		class="justify-self-start"
		onclick={onAdd}
	><PlusIcon data-icon="inline-start" /> Add ingredient</Button>
</div>
