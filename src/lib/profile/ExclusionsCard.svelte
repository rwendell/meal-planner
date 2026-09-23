<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		EXCLUSION_WEEKDAYS,
		type ExclusionDay,
		exclusionKey,
	} from "$lib/utils/exclusions.js";
	import { MEAL_TYPES, type MealType } from "$lib/utils/meal-types.js";

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
		slotExcludedCount,
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
			day: ExclusionDay,
			slot: MealType,
			value: boolean,
		) => void;
		onToggleSlot: (slot: MealType, value: boolean) => void;
		slotExcludedCount: (slot: MealType) => number;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Skipped meals</Card.Title>
		<Card.Description>
			Skip days or meals you never plan snacks, and so on.
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
							{#each EXCLUSION_WEEKDAYS as row (row.day)}
								<span
									class="flex items-start justify-center text-center"
								>
									<span
										class="hidden text-[10px] font-semibold text-muted-foreground sm:inline"
									>
										{row.label}
									</span>
									<span
										class="text-[10px] font-semibold text-muted-foreground sm:hidden"
										title={row.label}
									>
										{row.label.slice(0, 3)}
									</span>
								</span>
							{/each}
						</div>
					</div>
					<div class="grid gap-1">
						{#each MEAL_TYPES as slot (slot.id)}
							{const excluded = $derived(slotExcludedCount(slot.id))}
							<div
								class="grid grid-cols-[minmax(5.5rem,1.2fr)_repeat(7,minmax(1.25rem,1fr))] items-center gap-1 rounded-lg px-1 py-1 odd:bg-muted/40"
							>
								<span
									class="flex min-w-0 items-center gap-1.5"
								>
									<Checkbox
										checked={excluded ===
											EXCLUSION_WEEKDAYS.length}
										indeterminate={excluded >
											0 &&
											excluded <
												EXCLUSION_WEEKDAYS.length}
										onCheckedChange={(
											value,
										) => {
											if (value === true)
												onToggleSlot(
													slot.id,
													true,
												);
											else if (
												value === false
											)
												onToggleSlot(
													slot.id,
													false,
												);
										}}
										disabled={!editing ||
											saving}
										aria-label={`Skip all ${slot.label.toLowerCase()} meals`}
									/>
									<span
										class="truncate text-sm font-medium"
									>
										{slot.label}
									</span>
								</span>
								{#each EXCLUSION_WEEKDAYS as row (row.day)}
									<span
										class="flex justify-center"
									>
										<Checkbox
											checked={shownSet.has(
												exclusionKey(
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
