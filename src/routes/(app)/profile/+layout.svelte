<script lang="ts">
	let { children } = $props();
</script>

<!--
	Narrower measure than the rest of the app: this page holds a name, a
	7x4 grid, and a few toggles, which look stranded in a 1180px column.
	Nested layouts compose, so this inherits the shared shell from the
	group layout and only overrides the width.

	mx-auto is load-bearing: the inherited <main> is already centred at
	1180px, so an uncapped-by-mx-auto child hugs that element's left edge
	instead of centring in the viewport.

	The floating save bar is fixed-positioned, so it escapes this wrapper
	and is capped to the same measure in +page.svelte.
-->
<div class="mx-auto w-full max-w-[720px]">
	{@render children()}
</div>
