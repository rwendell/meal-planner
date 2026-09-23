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
		editing,
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
		editing: boolean;
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
		<Card.Title>Skipped meals</Card.Title>
		<Card.Description>
			Tap a day or a meal to skip the whole column or row.
		</Card.Description>
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
										disabled={!editing || saving}
										onclick={() =>
											onToggleDay(row.day, !dayFull)}
										class={dayFull
											? "px-1 py-0.5 text-[10px] font-semibold text-foreground"
											: "px-1 py-0.5 text-[10px] font-semibold text-muted-foreground"}
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
									disabled={!editing || saving}
									onclick={() =>
										onToggleSlot(slot.id, !rowFull)}
									class={rowFull
										? "min-w-0 justify-self-start truncate px-1.5 py-0.5 text-left text-sm font-semibold text-foreground"
										: "min-w-0 justify-self-start truncate px-1.5 py-0.5 text-left text-sm font-medium text-muted-foreground"}
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
											disabled={!editing ||
												saving}
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
		{#if editing && dirty}
			{#if impactPending && !impactError}
				<p class="m-0 text-xs text-muted-foreground">
					Checking affected meals…
				</p>
			{:else if impactMeals > 0}
				<p
					class="m-0 text-xs font-semibold text-amber-600 dark:text-amber-500"
				>
					Saving will remove {impactMeals}
					{impactMeals === 1 ? "meal" : "meals"} from today
					onward.
				</p>
			{:else}
				<p class="m-0 text-xs text-muted-foreground">
					No planned meals are affected.
				</p>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
