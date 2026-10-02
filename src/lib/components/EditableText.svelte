<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { cn } from "$lib/utils.js";

	/**
	 * Text that turns into an input on click (commit-gated editing):
	 * idle renders as bare text — editability is only hinted at on
	 * hover/focus (dashed underline), so it doesn't read as a button.
	 * Click swaps in an Input with the text focused + selected. Blur
	 * collapses back (draft already updated), Enter commits via
	 * onCommit (e.g. full save), Escape reverts via onRevert.
	 */
	let {
		value,
		placeholder = "",
		ariaLabel,
		inputClass = "",
		textClass = "",
		onInput,
		onCommit,
		onRevert,
	}: {
		/** Live draft text (controlled by the parent). */
		value: string;
		placeholder?: string;
		ariaLabel: string;
		inputClass?: string;
		textClass?: string;
		onInput: (v: string) => void;
		onCommit: () => void;
		onRevert: () => void;
	} = $props();

	let editing = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (editing) {
			inputEl?.focus();
			inputEl?.select();
		}
	});

	// Idle text is the draft, never the server value. Preferring a
	// separate `display` prop meant blurring an edit snapped the text back
	// to the old name while the parent still held the draft -- the edit
	// looked lost even though Save would have persisted it.
	let shown = $derived(value);
</script>

{#if editing}
	<Input
		bind:ref={inputEl}
		{value}
		oninput={(event) => onInput(event.currentTarget.value)}
		onblur={() => (editing = false)}
		onkeydown={(event) => {
			if (event.key === "Enter") {
				onCommit();
				editing = false;
			} else if (event.key === "Escape") {
				onRevert();
				editing = false;
			}
		}}
		{placeholder}
		aria-label={ariaLabel}
		class={inputClass}
	/>
{:else}
	<button
		type="button"
		aria-label={ariaLabel}
		onclick={() => (editing = true)}
		class={cn(
			"min-w-0 cursor-text rounded-sm text-left hover:underline hover:decoration-dashed hover:decoration-muted-foreground/60 hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
			textClass,
		)}
	>
		{shown || placeholder}
	</button>
{/if}
