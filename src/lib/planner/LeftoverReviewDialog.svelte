<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import { toast } from "svelte-sonner";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { errorMessage } from "$lib/utils/errors.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	/**
	 * End-of-week review: list last week's planned meals so anything
	 * left over gets marked ready in one pass. Already-ready meals are
	 * filtered out; saving marks each checked meal via the standard
	 * ready-meal flow (premade kind derives server-side).
	 */
	let {
		householdId,
		memberId,
		memberName,
		members,
		dates,
		open,
		onClose,
	}: {
		householdId: string | null;
		// Null reviews the whole household (owner mode) instead of one
		// member; member names then show under each meal.
		memberId: string | null;
		memberName: string;
		members: Array<{ id: string; name: string }>;
		dates: string[];
		open: boolean;
		onClose: () => void;
	} = $props();

	const daysQuery = useQuery(api.plans.getDays, () => {
		if (!householdId) return "skip";
		if (memberId) {
			return {
				householdId: householdId as Id<"households">,
				memberId: memberId as Id<"householdMembers">,
				dates,
			};
		}
		return {
			householdId: householdId as Id<"households">,
			dates,
		};
	});
	const mealsQuery = useQuery(api.meals.list, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const readyQuery = useQuery(api.pantry.listReady, () =>
		householdId ? { householdId: householdId as Id<"households"> } : "skip",
	);
	const setReadyMeal = useMutation(api.pantry.setReady);

	let mealsById = $derived(
		new Map((mealsQuery.data ?? []).map((meal) => [meal._id, meal])),
	);
	let readyIds = $derived(
		new Set<string>((readyQuery.data ?? []).map((row) => row.mealId)),
	);
	let planned = $derived.by(() => {
		const memberNames = new Map(members.map((m) => [m.id, m.name]));
		const seen = new Map<Id<"meals">, Set<string>>();
		for (const row of daysQuery.data ?? []) {
			for (const value of [
				row.breakfast,
				row.lunch,
				row.dinner,
				row.snack ?? null,
			]) {
				if (!value || value === "skip") continue;
				const meal = mealsById.get(value);
				if (!meal || readyIds.has(meal._id)) continue;
				let owners = seen.get(meal._id);
				if (!owners) {
					owners = new Set();
					seen.set(meal._id, owners);
				}
				owners.add(memberNames.get(row.memberId) ?? "Someone");
			}
		}
		return [...seen]
			.map(([id, owners]) => {
				const meal = mealsById.get(id);
				if (!meal) return null;
				return {
					id,
					name: meal.name,
					owners: memberId ? [] : [...owners].sort(),
				};
			})
			.filter((meal): meal is NonNullable<typeof meal> => meal !== null)
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	let checked = $state<Set<string>>(new Set());
	let datesKey = $state("");
	$effect(() => {
		const key = dates.join(",");
		if (key !== datesKey) {
			datesKey = key;
			checked = new Set();
		}
	});

	let saving = $state(false);

	function toggle(id: string): void {
		const next = new Set(checked);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		checked = next;
	}

	async function save(): Promise<void> {
		if (!householdId || checked.size === 0 || saving) return;
		saving = true;
		try {
			for (const mealId of checked) {
				await setReadyMeal({
					householdId: householdId as Id<"households">,
					mealId: mealId as Id<"meals">,
					on: true,
				});
			}
			toast.success(
				checked.size === 1
					? "Marked 1 meal as ready"
					: `Marked ${checked.size} meals as ready`,
			);
			onClose();
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't mark leftovers."));
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Dialog.Content data-no-swipe interactOutsideBehavior="ignore">
		<Dialog.Header>
			<Dialog.Title>Review last week</Dialog.Title>
			<Dialog.Description>
				Anything left over from {memberName}'s plan? Check it to
				mark it ready.
			</Dialog.Description>
		</Dialog.Header>
		{#if daysQuery.data === undefined || mealsQuery.data === undefined}
			<div class="grid gap-2" role="status">
				<span class="sr-only">Loading last week's meals</span>
				<Skeleton class="h-10" />
				<Skeleton class="h-10" />
				<Skeleton class="h-10" />
			</div>
		{:else if planned.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>Nothing to review</Empty.Title>
					<Empty.Description>
						No planned meals left from last week.
					</Empty.Description>
				</Empty.Header>
				<Empty.Content>
					<Button variant="outline" onclick={onClose}>Done</Button>
				</Empty.Content>
			</Empty.Root>
		{:else}
			<ul class="m-0 grid max-h-[50vh] list-none gap-1 overflow-y-auto p-0">
				{#each planned as meal (meal.id)}
					<li>
						<button
							type="button"
							class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2 py-2 text-left text-inherit hover:bg-muted/50"
							onclick={() => toggle(meal.id)}
						>
							<Checkbox
								checked={checked.has(meal.id)}
								tabindex={-1}
								aria-hidden="true"
							/>
							<span class="grid min-w-0 flex-1">
								<span class="truncate text-sm font-medium"
									>{meal.name}</span
								>
								{#if meal.owners.length > 0}
									<span
										class="truncate text-[10px] font-semibold text-muted-foreground"
									>
										{meal.owners.join(", ")}
									</span>
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
			<Dialog.Footer>
				<Button variant="outline" onclick={onClose} disabled={saving}
					>Cancel</Button
				>
				<Button
					onclick={() => void save()}
					disabled={checked.size === 0 || saving}
				>
					{saving ? "Marking…" : `Mark ${checked.size} as ready`}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
