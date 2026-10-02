<script lang="ts">
	/**
	 * Shared page shell for every route in this group: one centred,
	 * width-capped <main> with consistent gutters and vertical rhythm.
	 *
	 * A route group rather than the root layout because the loading and
	 * error states own their own <main> -- they render before any page
	 * exists, so the shell cannot sit above them.
	 *
	 * Pages that need a different measure nest their own layout instead of
	 * overriding classes here; see profile/+layout.svelte.
	 */
	let { children } = $props();
</script>

<main
	class="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-[18px] pt-5 pb-[72px] min-[560px]:px-7 min-[560px]:pt-6 min-[560px]:pb-20 lg:px-10 lg:pt-[34px] lg:pb-20"
>
	{@render children()}
</main>