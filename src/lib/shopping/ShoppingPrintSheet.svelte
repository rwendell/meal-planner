<script lang="ts">
	import { useQuery } from "convex-svelte";
	import type {
		GroupedShoppingItems,
		ShoppingListItem,
	} from "$lib/shopping/shopping-list.js";
	import { isDone } from "$lib/shopping/shopping-list.js";
	import { session } from "$lib/stores/session.svelte.js";
	import { MEAL_TYPES, type MealType } from "$lib/utils/meal-types.js";
	import { cn } from "$lib/utils.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	interface MemberMeals {
		id: string;
		name: string;
		slots: {
			slot: MealType;
			label: string;
			items: { name: string; count: number }[];
		}[];
	}

	let {
		dates,
		printLabel,
		items,
		grouped,
	}: {
		dates: string[];
		printLabel: string;
		items: ShoppingListItem[];
		grouped: GroupedShoppingItems[];
	} = $props();

	let householdId = $derived(session.session?.householdId ?? null);

	const daysQuery = useQuery(api.plans.getDays, () =>
		householdId
			? { householdId: householdId as Id<"households">, dates }
			: "skip",
	);
	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const householdQuery = useQuery(api.households.get, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);

	let mealsById = $derived(
		new Map((mealsQuery.data ?? []).map((meal) => [meal._id, meal.name])),
	);

	// Household-wide week summary: per member, per slot, meal day-counts.
	// Skips and empty slots are omitted — this is what gets eaten.
	let memberMeals = $derived.by((): MemberMeals[] => {
		const members = householdQuery.data?.members ?? [];
		const days = daysQuery.data ?? [];
		const rowsByMember = new Map<string, typeof days>();
		for (const row of days) {
			const list = rowsByMember.get(row.memberId) ?? [];
			list.push(row);
			rowsByMember.set(row.memberId, list);
		}
		const out: MemberMeals[] = [];
		for (const member of members) {
			const rows = rowsByMember.get(member._id) ?? [];
			const slots: MemberMeals["slots"] = [];
			for (const type of MEAL_TYPES) {
				const counts = new Map<string, number>();
				for (const row of rows) {
					const value = row[type.id] ?? null;
					if (!value || value === "skip") continue;
					const name = mealsById.get(value);
					if (!name) continue;
					counts.set(name, (counts.get(name) ?? 0) + 1);
				}
				if (counts.size === 0) continue;
				slots.push({
					slot: type.id,
					label: type.label,
					items: [...counts]
						.map(([name, count]) => ({ name, count }))
						.sort((a, b) => b.count - a.count),
				});
			}
			if (slots.length > 0) {
				out.push({ id: member._id, name: member.name, slots });
			}
		}
		return out;
	});
</script>

<!--
	Paper-only sheet (hidden on screen): the week's meals for context
	("why") plus the grocery list ("what"). The interactive screen card
	is hidden in print instead, so paper output is exactly this.
-->
<div class="hidden print:block">
	<h1 class="m-0 mb-4 font-serif text-2xl">{printLabel}</h1>

	{#if memberMeals.length > 0}
		<section aria-label="Meals this week" class="mb-6">
			<h2 class="m-0 mb-2 text-sm font-extrabold tracking-wide uppercase">
				Meals this week
			</h2>
			{#each memberMeals as member (member.id)}
				<div class="mb-3 break-inside-avoid">
					<h3 class="m-0 mb-1 text-sm font-bold">{member.name}</h3>
					<ul class="m-0 grid list-none gap-0.5 p-0">
						{#each member.slots as slot (slot.slot)}
							<li class="text-xs">
								<span class="font-semibold">{slot.label}:</span>
								{slot.items
									.map(
										(item) =>
											`${item.name}${item.count > 1 ? ` ×${item.count}` : ""}`,
									)
									.join(", ")}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</section>
	{/if}

	<section aria-label="Shopping list">
		<h2 class="m-0 mb-2 text-sm font-extrabold tracking-wide uppercase">
			Shopping list
		</h2>
		{#if items.length === 0}
			<p class="m-0 text-xs">No items needed this week.</p>
		{:else}
			{#each grouped as group (group.group)}
				{#if group.items.length}
					<div class="mb-3 break-inside-avoid">
						<h3 class="m-0 mb-1 text-xs font-bold uppercase">
							{group.group}
						</h3>
						<ul class="m-0 grid list-none gap-0.5 p-0">
							{#each group.items as item (item.key)}
								{const done = $derived(isDone(item))}
								<li class="flex items-baseline gap-2 text-xs">
									<span
										aria-hidden="true"
										class={cn(
											"inline-block size-3 shrink-0 self-center rounded-[3px]",
											done
												? "bg-foreground"
												: "border border-foreground/70",
										)}
									></span>
									<span
										class={cn(
											done && "line-through",
										)}
										>{item.name}{#if item.amount}<span>
												{" "}· {item.amount}</span
											>{/if}{#if item.coveredBy}<span>
												{" "}· {item.coveredBy === "pantry"
													? "on hand"
													: "leftovers"}</span
											>{/if}</span
									>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		{/if}
	</section>
</div>
