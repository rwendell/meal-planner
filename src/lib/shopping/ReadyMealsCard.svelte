<script lang="ts">
	import TextButton from "$lib/components/TextButton.svelte";
	import { Input } from "$lib/components/ui/input";
	import SearchCombobox from "$lib/shopping/SearchCombobox.svelte";

	interface MarkableMeal {
		_id: string;
		name: string;
	}

	interface ReadyRow {
		_id: string;
		mealId: string;
		mealName: string;
		note?: string | null;
		expiresOn?: string | null;
	}

	interface Props {
		markableMeals: Array<MarkableMeal>;
		onMarkReady: (mealId: string) => void;
		readyRows: Array<ReadyRow>;
		naturallyReady: string[];
		onExpiry: (mealId: string, value: string) => void;
		onUseUp: (mealId: string) => void;
	}

	let {
		markableMeals,
		onMarkReady,
		readyRows,
		naturallyReady,
		onExpiry,
		onUseUp
	}: Props = $props();
</script>

<div class="mb-4">
	<h3
		class="m-0 mb-1.5 text-[10px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase"
	>
		Ready to eat
	</h3>
	<p class="m-0 mb-2 text-[11px] text-muted-foreground">
		Meals already made — their ingredients stay checked off.
	</p>
	<div class="mb-2">
		<SearchCombobox
			options={markableMeals.map((meal) => ({
				value: meal._id,
				label: meal.name,
			}))}
			placeholder="Mark a meal ready…"
			emptyText="No meals to mark."
			onSelect={(mealId) => onMarkReady(mealId)}
		/>
	</div>
	{#if readyRows.length > 0 || naturallyReady.length > 0}
		<ul class="m-0 grid list-none gap-2 p-0">
			{#each naturallyReady as name (name)}
				<li
					class="grid items-center gap-1.5 rounded-xl border border-dashed p-2.5"
				>
					<div class="min-w-0">
						<p class="m-0 truncate text-sm font-semibold">
							{name}
						</p>
						<p
							class="m-0 truncate text-xs text-muted-foreground"
						>
							Nothing to buy
						</p>
					</div>
				</li>
			{/each}
			{#each readyRows as row (row._id)}
				<li
					class="grid items-center gap-1.5 rounded-xl border p-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
				>
					<div class="min-w-0">
						<p class="m-0 truncate text-sm font-semibold">
							{row.mealName}
						</p>
						{#if row.note}<p
								class="m-0 truncate text-xs text-muted-foreground"
								>{row.note}</p
							>{/if}
					</div>
					<label
						for={`ready-expiry-${row._id}`}
						class="grid gap-1 text-[11px] font-semibold text-muted-foreground"
						>Use by<Input
							id={`ready-expiry-${row._id}`}
							type="date"
							value={row.expiresOn ?? ""}
							onchange={(event) =>
								onExpiry(
									row.mealId,
									event.currentTarget.value
								)}
							class="w-36"
						/></label
					>
					<TextButton
						tone="destructive"
						label={`Use up ${row.mealName}`}
						onclick={() => onUseUp(row.mealId)}
					>
						Use up
					</TextButton>
				</li>
			{/each}
		</ul>
	{/if}
</div>
