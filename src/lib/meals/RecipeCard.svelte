<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";

	interface DiscoverRecipe {
		_id: string;
		name: string;
		note: string;
		category: string;
		householdName: string;
		ingredients: { length: number };
	}

	let {
		recipe,
		onAdopt,
	}: {
		recipe: DiscoverRecipe;
		onAdopt: (id: string) => void;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<div class="min-w-0 flex-1">
			<Card.Title>{recipe.name}</Card.Title>
			<Card.Description>{recipe.note}</Card.Description>
		</div>
		<Card.Action>
			<Badge variant="secondary">{recipe.category}</Badge>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<div class="flex items-center justify-between gap-2">
			<span class="text-[10px] text-muted-foreground"
				>by {recipe.householdName} · {recipe.ingredients.length} ingredients</span
			>
			<div class="flex items-center gap-1">
				<Button
					variant="outline"
					size="icon-sm"
					aria-label={`Add ${recipe.name} to your database`}
					title={`Add ${recipe.name}`}
					onclick={() => onAdopt(recipe._id)}><PlusIcon /></Button
				>
			</div>
		</div>
	</Card.Content>
</Card.Root>
