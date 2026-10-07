<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { cn } from "$lib/utils.js";

	/**
	 * Text that turns into an input on click (commit-gated editing):
	 * idle renders as bare text — editability is only hinted at on
	 * hover/focus (dashed underline), so it doesn't read as a button.
	 * Click swaps in an Input with the text focused + selected. Blur
	 * collapses back and commits via onBlur, Enter commits via onCommit,
	 * Escape reverts via onRevert.
	 *
	 * Idle text is always the draft, never the last saved value, so a
	 * blur can't make an edit look lost. Pass `original` to flag the
	 * pending state: the hover underline becomes persistent, in the
	 * accent colour, so pending text is still bare text -- just marked.
	 */
	let {
		value,
		original = null,
		placeholder = "",
		ariaLabel,
		inputClass = "",
		textClass = "",
		onInput,
		onCommit,
		onRevert,
		onBlur,
	}: {
		/** Live draft text (controlled by the parent). */
		value: string;
		/** Last saved value, for the pending-changes marker. Null hides it. */
		original?: string | null;
		placeholder?: string;
		ariaLabel: string;
		inputClass?: string;
		textClass?: string;
		onInput: (v: string) => void;
		onCommit: () => void;
		onRevert: () => void;
		/** Commit on focus loss (autosave). Optional; collapse-only when absent. */
		onBlur?: () => void;
	} = $props();

	let editing = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (editing) {
			inputEl?.focus();
			inputEl?.select();
		}
	});

	// Normalised so a stray trailing space isn't reported as an edit.
	let dirty = $derived(
		original !== null && value.trim() !== original.trim(),
	);
	let shown = $derived(value);
</script>

{#if editing}
	<Input
		bind:ref={inputEl}
		{value}
		oninput={(event) => onInput(event.currentTarget.value)}
		onblur={() => {
			editing = false;
			onBlur?.();
		}}
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
		aria-label={dirty ? `${ariaLabel}, not saved yet` : ariaLabel}
		onclick={() => (editing = true)}
		class={cn(
			"min-w-0 cursor-text rounded-sm text-left underline-offset-4 hover:underline hover:decoration-dashed focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
			dirty && "underline decoration-dashed decoration-primary",
			textClass,
		)}
		title={dirty ? "Not saved yet — press Enter or use Save" : undefined}
	>
		{shown || placeholder}
	</button>
{/if}