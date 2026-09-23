<script lang="ts">
	import BanIcon from "@lucide/svelte/icons/ban";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefrigeratorIcon from "@lucide/svelte/icons/refrigerator";
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "$lib/components/ui/button";
	import { formatShort, weekdayLabel } from "$lib/utils/dates.js";
	import type { MealType } from "$lib/utils/meal-types.js";

	interface WeekMeal {
		id: string;
		name: string;
		color: string;
		ingredientCount: number;
	}

	interface Props {
		dates: string[];
		today: string;
		slotTypes: Array<{ id: MealType; label: string }>;
		getMeal: (date: string, slot: MealType) => WeekMeal | null;
		isSkipped: (date: string, slot: MealType) => boolean;
		isCellExcluded: (date: string, slot: MealType) => boolean;
		canEdit: boolean;
		readyMadeIds: Set<string>;
		dayMealCount: (date: string) => number;
		onAdd: (date: string, slot: MealType) => void;
		onRemove: (date: string, slot: MealType) => void;
		onUnskip: (date: string, slot: MealType) => void;
		onClearDay: (date: string) => void;
	}

	let {
		dates,
		today,
		slotTypes,
		getMeal,
		isSkipped,
		isCellExcluded,
		canEdit,
		readyMadeIds,
		dayMealCount,
		onAdd,
		onRemove,
		onUnskip,
		onClearDay
	}: Props = $props();

	function dayLabel(date: string): string {
		return `${weekdayLabel(date)}, ${formatShort(date)}`;
	}
</script>

<div
	class="overflow-x-auto pb-2 [scrollbar-width:thin] max-lg:overflow-visible max-lg:pb-0"
>
	{#if dates.length === 0}
		<div
			class="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5 opacity-70"
			title="Skipped in profile settings"
		>
			<p
				class="m-0 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
			>
				<BanIcon size={13} /> This whole week is excluded
			</p>
		</div>
	{:else}
		<div
			class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 lg:gap-2.5 lg:[grid-template-columns:repeat(var(--day-count),minmax(0,1fr))]"
			style={`--day-count: ${dates.length}`}
		>
			{#each dates as date (date)}
				<article
					class={date === today
						? "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-2xl border border-primary bg-card p-3 shadow-[0_8px_24px_rgba(23,34,31,0.06)] lg:block lg:p-2"
						: "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-2xl border border-border bg-[color-mix(in_srgb,var(--card)_50%,transparent)] p-3 lg:block lg:p-2"}
				>
					<div
						class="flex w-full flex-row items-baseline justify-between gap-2 border-0 bg-transparent text-left text-muted-foreground lg:grid lg:grid-cols-[1fr_auto]"
					>
						<span
							class={date === today
								? "text-[10px] font-extrabold tracking-[0.14em] text-foreground uppercase"
								: "text-[10px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase"}
							>{weekdayLabel(date)}</span
						>
						{#if date === today}<em
								class="self-start text-[9px] font-extrabold text-destructive not-italic lg:col-start-2 lg:row-start-1"
								>Today</em
							>{/if}
					</div>
					{#each slotTypes as type (type.id)}
						{const meal = $derived(getMeal(date, type.id))}
						<div class="mt-0 min-w-0 lg:mt-2.5">
							<small
								class="mx-0.5 mt-0 mb-1 block text-[9px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase"
								>{type.label}</small
							>
							{#if isCellExcluded(date, type.id)}
								<span
									class="flex min-h-[46px] w-full cursor-default items-center gap-[5px] rounded-[11px] border border-dashed border-border bg-transparent p-2 text-[10px] font-extrabold text-muted-foreground opacity-70"
									title="Skipped in profile settings"
									aria-disabled="true"
									><BanIcon size={11} /> Skipped</span>
								>
							{:else if isSkipped(date, type.id)}
								{#if canEdit}
									<div class="flex items-center gap-1.5">
										<button
											type="button"
											class="flex min-h-[46px] min-w-0 flex-1 items-center gap-[5px] rounded-[11px] border border-dashed border-border bg-transparent p-2 text-[10px] font-extrabold text-muted-foreground hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-primary"
											onclick={() => onAdd(date, type.id)}
											><PlusIcon size={11} /> Skipped</button
										>
										<button
											type="button"
											class="m-[-2px_-3px_0_0] grid size-[18px] flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:text-foreground"
											aria-label={`Unskip ${dayLabel(date)} ${type.label}`}
											title="Back to unplanned"
											onclick={() => onUnskip(date, type.id)}
											><XIcon size={11} /></button
										>
									</div>
								{:else}
									<span class="text-xs text-muted-foreground"
										>Skipped</span
									>
								{/if}
							{:else if meal}
								<div
									class="group flex min-h-[46px] items-start justify-between gap-1.5 rounded-[11px] p-2 text-[10px] leading-[1.25] font-extrabold text-[#32433b]"
									style={`background: ${meal.color}`}
								>
									<span class="min-w-0"
										>{#if readyMadeIds.has(meal.id)}<span
												role="img"
												aria-label={`${meal.name} is already made`}
												title="Already made — no need to shop"
												class="mr-[3px] inline-block align-[-1px]"
												><RefrigeratorIcon size={11} /></span
											>{/if}{meal.name}{#if meal.ingredientCount === 0}<span
												class="mt-[3px] block text-[8px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
												>No list</span
											>{/if}</span
									>
									{#if canEdit}
										<button
											type="button"
											class="m-[-2px_-3px_0_0] grid size-[18px] flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
											aria-label={`Remove ${meal.name} from ${dayLabel(date)} ${type.label}`}
											title={`Remove ${meal.name}`}
											onclick={() => onRemove(date, type.id)}
											><XIcon size={11} /></button
										>
									{/if}
								</div>
							{:else if canEdit}
								<button
									type="button"
									class="flex min-h-[46px] w-full items-center gap-[5px] rounded-[11px] border border-dashed border-border bg-transparent p-2 text-[10px] font-extrabold text-muted-foreground hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-primary"
									onclick={() => onAdd(date, type.id)}
									><PlusIcon size={11} /> Add</button
								>
							{:else}
								<span class="text-xs text-muted-foreground"
									>Empty</span
								>
							{/if}
						</div>
					{/each}
					{#if canEdit && dayMealCount(date) > 0}
						<Button
							variant="ghost"
							size="sm"
							class="mt-2.5 w-full text-[9px] font-extrabold tracking-[0.1em] uppercase"
							onclick={() => onClearDay(date)}>Clear day</Button
						>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>
