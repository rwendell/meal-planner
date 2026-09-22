<script lang="ts">
	import { ShareIcon } from "@lucide/svelte";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import XIcon from "@lucide/svelte/icons/x";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { displayMealTime, MEAL_TYPES } from "$lib/meal-types.js";
	import type { DatabaseMeal } from "$lib/meals/meal-mappers.js";

	let {
		meal,
		shared,
		onEdit,
		onDuplicate,
		onDelete,
	}: {
		meal: DatabaseMeal;
		shared: boolean;
		onEdit: (meal: DatabaseMeal) => void;
		onDuplicate: (meal: DatabaseMeal) => void;
		onDelete: (id: string, name: string) => void;
	} = $props();

	let prepTime = $derived(displayMealTime(meal.time));
</script>

<Card.Root>
	<Card.Header>
		<div class="min-w-0 flex-1">
			<Card.Title>{meal.name}</Card.Title>
			<Card.Description>{meal.note}</Card.Description>
		</div>
		<Card.Action>
			<span class="flex flex-wrap justify-end gap-1">
				{#each MEAL_TYPES.filter((type) => meal.mealTimes.includes(type.id)) as time (time.id)}
					<Badge variant="secondary">{time.label}</Badge>
				{/each}
			</span>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<div class="flex items-center justify-between gap-2">
			<span class="text-[10px] text-muted-foreground"
				>{#if prepTime}{prepTime}{" · "}{/if}{meal.ingredientCount}
				ingredients{#if meal.sourceUrl}{" · "}<a
						href={meal.sourceUrl}
						target="_blank"
						rel="noreferrer noopener"
						class="underline underline-offset-2"
						>Source</a
					>{/if}</span
			>
			<div class="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Edit ${meal.name}`}
					title={`Edit ${meal.name}`}
					onclick={() => onEdit(meal)}><PencilIcon /></Button
				>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Duplicate ${meal.name}`}
					title={`Duplicate ${meal.name}`}
					onclick={() => onDuplicate(meal)}><CopyIcon /></Button
				>
				{#if shared}
					<span
						class="grid size-7 place-items-center text-muted-foreground"
						title="Shared publicly"
						role="img"
						aria-label={`${meal.name} is shared publicly`}
					>
						<ShareIcon size={14} />
					</span>
				{/if}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Delete ${meal.name} from the database`}
					title={`Delete ${meal.name}`}
					onclick={() => onDelete(meal.id, meal.name)}><XIcon /></Button
				>
			</div>
		</div>
	</Card.Content>
</Card.Root>
