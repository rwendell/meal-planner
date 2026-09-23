<script lang="ts">
	import { ChevronLeft, ChevronRight } from "@lucide/svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { plannerWeek } from "$lib/stores/planner-week.svelte.js";
	import {
		addDays,
		todayISO,
		weekDates,
		weekLabel,
		weekLabelShort,
	} from "$lib/utils/dates.js";

	/**
	 * Page hero: big week/day heading plus prev/today/next navigation.
	 * Driven by the shared plannerWeek store, so every page stays on the
	 * same dates. Defaults to the current week label with week stepping;
	 * pass a custom heading (and dayStep) for views like the planner's
	 * day detail.
	 */
	let {
		heading = null,
		dayStep = false,
	}: {
		heading?: string | null;
		dayStep?: boolean;
	} = $props();

	const wideScreen = new MediaQuery("(min-width: 1024px)", true);

	let anchorDate = $derived(plannerWeek.anchor);
	let currentWeek = $derived(weekDates(anchorDate));
	let resolvedHeading = $derived(
		heading ??
			(wideScreen.current
				? weekLabel(currentWeek)
				: weekLabelShort(currentWeek)),
	);
	let stepNoun = $derived(dayStep ? "day" : "week");

	function stepView(direction: 1 | -1): void {
		plannerWeek.set(addDays(anchorDate, dayStep ? direction : direction * 7));
	}

	function goToday(): void {
		plannerWeek.set(todayISO());
	}
</script>

<Card.Root id="planner" class="bg-muted">
	<Card.Header>
		<Card.Title
			class="font-serif text-[clamp(42px,9vw,64px)] leading-[0.95] tracking-[-0.045em]"
		>
			{resolvedHeading}
		</Card.Title>
	</Card.Header>
	<Card.Content>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				class="text-[18px] leading-none"
				aria-label={`Previous ${stepNoun}`}
				onclick={() => stepView(-1)}
			>
				<ChevronLeft />
			</Button>
			<Button variant="outline" size="default" onclick={goToday}
				>Today</Button
			>
			<Button
				variant="outline"
				size="icon"
				class="text-[18px] leading-none"
				aria-label={`Next ${stepNoun}`}
				onclick={() => stepView(1)}><ChevronRight /></Button
			>
		</div>
	</Card.Content>
</Card.Root>
