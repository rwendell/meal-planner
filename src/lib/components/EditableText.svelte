<script lang="ts">
	import TextButton from "$lib/components/TextButton.svelte";
	import { Input } from "$lib/components/ui/input";

	/**
	 * Text that turns into an input on click (commit-gated editing):
	 * idle shows plain text via TextButton, click swaps in an Input with
	 * the text focused + selected. Blur collapses back (draft already
	 * updated), Enter commits via onCommit (e.g. full save), Escape
	 * reverts via onRevert.
	 */
	let {
		value,
		display,
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
		/** Text shown when idle (defaults to the draft). */
		display?: string;
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

	let shown = $derived(display ?? value);
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
	<TextButton
		label={ariaLabel}
		onclick={() => (editing = true)}
		class="min-w-0 text-foreground"
	>
		<span class={textClass}>{shown || placeholder}</span>
	</TextButton>
{/if}
