<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefrigeratorIcon from "@lucide/svelte/icons/refrigerator";
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "$lib/components/ui/button";

	interface PlanSlotRow {
		id: string;
		name: string;
		count: number;
		ready: boolean;
	}

	let {
		slotLabel,
		eligibleCount,
		plannedCount,
		rows,
		editing,
		canEdit,
		maxFor,
		onRemove,
		onCount,
		onAdd
	}: {
		slotLabel: string;
		eligibleCount: number;
		plannedCount: number;
		rows: PlanSlotRow[];
		editing: boolean;
		canEdit: boolean;
		maxFor: (count: number) => number;
		onRemove: (id: string) => void;
		onCount: (id: string, input: HTMLInputElement) => void;
		onAdd: () => void;
	} = $props();
</script>

<section
	aria-label={`${slotLabel} meals`}
	class="flex flex-col"
	class:gap-y-4={editing}
	class:gap-y-1.5={!editing}
>
	<h3
		class="m-0 max-w-full text-[11px] font-semibold tracking-[0.08em] break-words text-muted-foreground uppercase"
	>
		{slotLabel} · {plannedCount} of {eligibleCount} days
	</h3>
	{#if rows.length === 0}
		<p class="m-0 text-sm text-muted-foreground">
			Nothing here yet — {canEdit && editing
				? "add a meal below."
				: "no meals planned."}
		</p>
	{:else}
		<ul
			class="m-0 grid w-fit list-none p-0"
			class:gap-y-4={editing}
			class:gap-y-1.5={!editing}
		>
			{#each rows as entry (entry.id)}
				<li
					class="flex space-x-1 place-items-center place-content-between"
				>
					{#if canEdit && editing}
						<button
							type="button"
							class="shrink-0 rounded p-1 text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
							aria-label={`Remove ${entry.name} from ${slotLabel}`}
							title="Remove"
							onclick={() => onRemove(entry.id)}
						>
							<XIcon size={14} />
						</button>
					{/if}
					<span class="min-w-0 truncate"
						>{#if entry.ready}<span
								role="img"
								aria-label={`${entry.name} is already made`}
								title="Already made — no need to shop"
								class="mr-1 inline-block align-[-1px]"
								><RefrigeratorIcon size={13} /></span
							>{/if}{entry.name}</span
					>
					{#if canEdit && editing}
						<span
							class="flex w-20 shrink-0 items-center justify-end gap-0"
						>
							<input
								type="number"
								min={0}
								max={maxFor(entry.count)}
								value={entry.count}
								aria-label={`${entry.name} days this week`}
								title="Days this week"
								class="border-input dark:bg-input/30 h-8 w-12 shrink-0 rounded-md border bg-transparent px-1 text-center text-sm font-bold shadow-xs tabular-nums outline-none"
								onchange={(event) =>
									onCount(entry.id, event.currentTarget)}
								onkeydown={(event) => {
									if (event.key === "Enter")
										event.currentTarget.blur();
									else if (event.key === "Escape") {
										event.currentTarget.value = String(
											entry.count
										);
										event.currentTarget.blur();
									}
								}}
							/>
						</span>
					{:else}
						<span
							class="w-12 shrink-0 text-right text-sm font-bold tabular-nums"
							>×{entry.count}</span
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if canEdit && editing}
		<Button
			variant="outline"
			size="sm"
			aria-label={`Add a ${slotLabel.toLowerCase()} meal`}
			onclick={onAdd}
		>
			<PlusIcon data-icon="inline-start" /> Add meal
		</Button>
	{/if}
</section>
