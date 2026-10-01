<script lang="ts">
	import TextButton from "$lib/components/TextButton.svelte";
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { MEAL_TYPES, type MealType } from "$lib/utils/meal-types.js";
	import {
		SKIPPED_WEEKDAYS,
		type SkippedDay,
		skippedKey,
	} from "$lib/utils/skipped.js";

	let {
		loading,
		saving,
		shownSet,
		dirty,
		impactMeals,
		impactPending,
		impactError,
		onToggleCell,
		onToggleSlot,
		onToggleDay,
		slotSkippedCount,
		daySkippedCount,
	}: {
		loading: boolean;
		saving: boolean;
		shownSet: Set<string>;
		dirty: boolean;
		impactMeals: number;
		impactPending: boolean;
		impactError: boolean;
		onToggleCell: (
			day: SkippedDay,
			slot: MealType,
			value: boolean,
		) => void;
		onToggleSlot: (slot: MealType, value: boolean) => void;
		onToggleDay: (day: SkippedDay, value: boolean) => void;
		slotSkippedCount: (slot: MealType) => number;
		daySkippedCount: (day: SkippedDay) => number;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Skip Meals</Card.Title>
		<Card.Description>Don't eat breakfast?</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-3">
		{#if loading}
			<Skeleton class="h-40" />
		{:else}
			<fieldset class="m-0 grid gap-3 border-0 p-0">
				<legend class="sr-only"
					>Skipped days and meals</legend
				>
				<div class="grid gap-3">
					<div class="grid gap-1">
						<div
							class="grid grid-cols-[minmax(5.5rem,1.2fr)_repeat(7,minmax(1.25rem,1fr))] items-center gap-1 px-1"
						>
							<span></span>
							{#each SKIPPED_WEEKDAYS as row (row.day)}
								{const daySkipped = $derived(
									daySkippedCount(row.day),
								)}
								{const dayFull = $derived(
									daySkipped === MEAL_TYPES.length,
								)}
								<span
									class="flex items-start justify-center text-center"
								>
									<TextButton
										label={dayFull
											? `Include all ${row.label} meals`
											: `Skip all ${row.label} meals`}
										pressed={dayFull}
										disabled={saving}
										onclick={() =>
											onToggleDay(row.day, !dayFull)}
										class="px-1 py-0.5 text-[10px] font-semibold text-foreground disabled:opacity-100"
									>
										<span class="hidden sm:inline">
											{row.label}
										</span>
										<span class="sm:hidden">
											{row.label.slice(0, 3)}
										</span>
									</TextButton>
								</span>
							{/each}
						</div>
					</div>
					<div class="grid gap-1">
						{#each MEAL_TYPES as slot (slot.id)}
							{const skipped = $derived(slotSkippedCount(slot.id))}
							{const rowFull = $derived(
								skipped === SKIPPED_WEEKDAYS.length,
							)}
							<div
								class="grid grid-cols-[minmax(5.5rem,1.2fr)_repeat(7,minmax(1.25rem,1fr))] items-center gap-1 rounded-lg px-1 py-1 odd:bg-muted/40"
							>
								<TextButton
									label={rowFull
										? `Include all ${slot.label.toLowerCase()} meals`
										: `Skip all ${slot.label.toLowerCase()} meals`}
									pressed={rowFull}
									disabled={saving}
									onclick={() =>
										onToggleSlot(slot.id, !rowFull)}
									class={rowFull
										? "min-w-0 justify-self-start truncate px-1.5 py-0.5 text-left text-sm font-semibold text-foreground disabled:opacity-100"
										: "min-w-0 justify-self-start truncate px-1.5 py-0.5 text-left text-sm font-medium text-foreground disabled:opacity-100"}
								>
									{slot.label}
								</TextButton>
								{#each SKIPPED_WEEKDAYS as row (row.day)}
									<span
										class="flex justify-center"
									>
										<Checkbox
											checked={shownSet.has(
												skippedKey(
													row.day,
													slot.id,
												),
											)}
											onCheckedChange={(
												value,
											) => {
												if (
													typeof value ===
													"boolean"
												)
													onToggleCell(
														row.day,
														slot.id,
														value,
													);
											}}
											disabled={saving}
											aria-label={`Skip ${slot.label} on ${row.label}`}
										/>
									</span>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</fieldset>
		{/if}
		{#if dirty}
			{#if impactPending && !impactError}
				<span class="text-xs text-muted-foreground" role="status">
					Checking affected meals…
				</span>
			{:else if impactMeals > 0}
				<span
					class="text-xs font-semibold text-amber-600 dark:text-amber-500"
					role="status"
				>
					Saving will remove {impactMeals}
					{impactMeals === 1 ? "meal" : "meals"} from today
					onward.
				</span>
			{:else}
				<span class="text-xs text-muted-foreground" role="status">
					No planned meals are affected.
				</span>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
