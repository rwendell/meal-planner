<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	let {
		editing,
		disabled = false,
		saveDisabled = false,
		editLabel = "Edit",
		cancelLabel = "Cancel",
		saveLabel = "Save",
		saving = false,
		savingLabel = "Saving…",
		onEdit,
		onCancel,
		onSave,
		class: className,
	}: {
		editing: boolean;
		disabled?: boolean;
		saveDisabled?: boolean;
		editLabel?: string;
		cancelLabel?: string;
		saveLabel?: string;
		saving?: boolean;
		savingLabel?: string;
		onEdit: () => void;
		onCancel: () => void;
		onSave: () => undefined | Promise<unknown>;
		class?: string;
	} = $props();
</script>

<div class={cn("flex flex-wrap gap-2", className)}>
	{#if editing}
		<Button
			variant="ghost"
			type="button"
			onclick={onCancel}
			disabled={disabled}
		>
			{cancelLabel}
		</Button>
		<Button
			type="button"
			onclick={() => void onSave()}
			disabled={saveDisabled || disabled}
		>
			{saving ? savingLabel : saveLabel}
		</Button>
	{:else}
		<Button
			variant="outline"
			type="button"
			onclick={onEdit}
			disabled={disabled}
		>
			{editLabel}
		</Button>
	{/if}
</div>
