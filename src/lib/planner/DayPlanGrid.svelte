<script lang="ts">
	import BanIcon from "@lucide/svelte/icons/ban";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { weekdayLabel } from "$lib/utils/dates.js";
	import {
		displayMealTime,
		type MealType
	} from "$lib/utils/meal-types.js";

	interface DayMeal {
		id: string;
		name: string;
		note: string;
		time: number | null | undefined;
		color: string;
		ingredientCount: number;
	}

	interface Props {
		anchorDate: string;
		today: string;
		slotTypes: Array<{ id: MealType; label: string }>;
		isSkipped: (date: string, slot: MealType) => boolean;
		getMeal: (date: string, slot: MealType) => DayMeal | null;
		isCellSkipped: (date: string, slot: MealType) => boolean;
		isDayFullySkipped: (date: string) => boolean;
		canEdit: boolean;
		onAdd: (date: string, slot: MealType) => void;
		onRemove: (date: string, slot: MealType) => void;
		onUnskip: (date: string, slot: MealType) => void;
	}

	let {
		anchorDate,
		today,
		slotTypes,
		isSkipped,
		getMeal,
		isCellSkipped,
		isDayFullySkipped,
		canEdit,
		onAdd,
		onRemove,
		onUnskip
	}: Props = $props();
</script>

<div
	class="grid max-w-[560px] gap-[14px] lg:max-w-none lg:grid-cols-3 lg:items-start"
>
	<div class="flex items-start justify-between gap-3 lg:col-span-full">
		<h2 class="m-0 text-[22px]">
			{weekdayLabel(anchorDate)}
		</h2>
		{#if anchorDate === today}
			<Badge>Today</Badge>
		{/if}
	</div>
	{#if isDayFullySkipped(anchorDate)}
		<div
			class="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5 opacity-70"
			title="Skipped in profile settings"
		>
			<p
				class="m-0 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
			>
				<BanIcon size={13} /> No planning on {weekdayLabel(anchorDate)}
			</p>
		</div>
	{:else}
		{#each slotTypes as type (type.id)}
			{const meal = $derived(getMeal(anchorDate, type.id))}
			<div class="grid gap-2">
				<h3
					class="m-0 text-[11px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase"
				>
					{type.label}
				</h3>
				{#if isCellSkipped(anchorDate, type.id)}
					<div
						class="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5 opacity-70"
						title="Skipped in profile settings"
					>
						<p
							class="m-0 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
						>
							<BanIcon size={12} /> Skipped
						</p>
					</div>
				{:else if isSkipped(anchorDate, type.id)}
					<div
						class="flex items-center justify-between gap-3 rounded-[14px] border border-solid border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5"
					>
						<p class="m-0 text-xs font-bold text-muted-foreground">
							Skipped
						</p>
						{#if canEdit}
							<button
								type="button"
								class="flex w-auto min-h-[34px] items-center gap-[5px] rounded-[9px] border border-solid border-border bg-transparent px-2.5 py-[7px] text-[10px] font-extrabold text-muted-foreground hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-primary"
								onclick={() => onAdd(anchorDate, type.id)}
								><PlusIcon size={11} /> Change</button
							>
							<button
								type="button"
								class="m-[-2px_-3px_0_0] grid size-[18px] flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:text-foreground"
								aria-label={`Unskip ${type.label}`}
								title="Back to unplanned"
								onclick={() => onUnskip(anchorDate, type.id)}
								><XIcon size={11} /></button
							>
						{/if}
					</div>
				{:else if meal}
					{const prepTime = $derived(displayMealTime(meal.time))}
					<div
						class="flex items-start justify-between gap-3 rounded-[14px] border border-solid px-[14px] py-[13px] text-foreground [border-color:color-mix(in_srgb,var(--meal-color)_30%,var(--border))] [border-left:4px_solid_var(--meal-color)] [background:color-mix(in_srgb,var(--meal-color)_12%,var(--card))]"
						style={`--meal-color: ${meal.color}`}
					>
						<div class="min-w-0">
							<strong class="block text-sm leading-[1.2]"
								>{meal.name}</strong
							>
							<p
								class="m-0 mt-[5px] mb-[10px] text-xs leading-[1.4] text-muted-foreground [overflow-wrap:anywhere]"
							>
								{meal.note || "No note added"}
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#if prepTime}<Badge variant="secondary"
										>{prepTime}</Badge
									>{/if}
								<Badge variant="outline">
									{meal.ingredientCount > 0
										? `${meal.ingredientCount} ingredient${meal.ingredientCount === 1 ? "" : "s"}`
										: "No groceries"}
								</Badge>
							</div>
						</div>
						{#if canEdit}
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Remove ${meal.name} from ${type.label}`}
								title={`Remove ${meal.name}`}
								onclick={() => onRemove(anchorDate, type.id)}
								><XIcon /></Button
							>
						{/if}
					</div>
				{:else}
					<div
						class="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-border bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] px-3 py-2.5"
					>
						<p class="m-0 text-xs font-bold text-muted-foreground">
							No meal planned
						</p>
						{#if canEdit}
							<Button
								variant="outline"
								size="sm"
								onclick={() => onAdd(anchorDate, type.id)}
								><PlusIcon data-icon="inline-start" /> Add meal</Button
							>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
