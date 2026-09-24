<script lang="ts">
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import { tick } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Command from "$lib/components/ui/command";
	import * as Popover from "$lib/components/ui/popover";

	/**
	 * Fire-and-clear searchable picker (shadcn Popover + Command pattern):
	 * type to filter, click or Enter to pick. Stays open for rapid entry.
	 * With `allowCustom`, Enter on an empty result adds the raw text.
	 */
	let {
		options,
		placeholder,
		emptyText,
		allowCustom = false,
		customHint = (text: string) => `Press Enter to add “${text}”`,
		onSelect,
		onCustom,
	}: {
		options: { value: string; label: string }[];
		placeholder: string;
		emptyText: string;
		allowCustom?: boolean;
		customHint?: (text: string) => string;
		onSelect: (value: string) => void;
		onCustom?: (text: string) => void;
	} = $props();

	let open = $state(false);
	let searchText = $state("");
	let matchCount = $state(0);
	let inputRef = $state<HTMLInputElement | null>(null);

	// Trigger fits the largest option plus padding instead of stretching.
	let triggerWidth = $derived.by(() => {
		const longest = Math.max(
			placeholder.length,
			0,
			...options.map((option) => option.label.length),
		);
		return `calc(${Math.min(longest + 7, 48)}ch)`;
	});

	function focusInput(): void {
		tick().then(() => inputRef?.focus());
	}

	function pick(value: string): void {
		searchText = "";
		onSelect(value);
		focusInput();
	}

	function submitCustom(): void {
		const text = searchText.trim();
		if (!allowCustom || !text) return;
		searchText = "";
		onCustom?.(text);
		focusInput();
	}
</script>

<Popover.Root
	bind:open
	onOpenChange={(next) => {
		if (next) focusInput();
	}}
>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				role="combobox"
				aria-expanded={open}
				class="max-w-full justify-between"
				style="width: {triggerWidth}"
			>
				<span class="truncate">{placeholder}</span>
				<ChevronsUpDownIcon class="opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		class="w-max max-w-[calc(100vw-2rem)] p-0"
		align="start"
	>
		<Command.Root
			onStateChange={(state) => {
				matchCount = state.filtered.count;
			}}
		>
			<Command.Input
				bind:ref={inputRef}
				bind:value={searchText}
				{placeholder}
				aria-label={placeholder}
				onkeydown={(event) => {
					if (event.key === "Enter" && matchCount === 0) {
						event.preventDefault();
						submitCustom();
					}
				}}
			/>
			<Command.List>
				{#if allowCustom && searchText.trim() && matchCount === 0}
					<div class="px-2 py-6 text-center text-sm text-muted-foreground">
						{customHint(searchText.trim())}
					</div>
				{:else}
					<Command.Empty>{emptyText}</Command.Empty>
				{/if}
				<Command.Group>
					{#each options as option (option.value)}
						<Command.Item
							value={option.value}
							keywords={[option.label]}
							onSelect={() => pick(option.value)}
						>
							{option.label}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
