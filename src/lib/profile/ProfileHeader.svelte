<script lang="ts">
	import EditActions from "$lib/components/EditActions.svelte";

	let {
		saving,
		saveDisabled,
		hasUnsavedChanges,
		showActions,
		onCancel,
		onSave,
	}: {
		saving: boolean;
		saveDisabled: boolean;
		hasUnsavedChanges: boolean;
		showActions: boolean;
		onCancel: () => void;
		onSave: () => undefined | Promise<unknown>;
	} = $props();
</script>

<div class="grid min-w-0 flex-1 gap-1">
	<h1
		class="m-0 font-serif text-[26px] leading-tight tracking-[-0.02em]"
	>
		Profile
	</h1>
	<span class="text-sm text-muted-foreground">
		Your name, households, and members.
	</span>
</div>
{#if showActions}
	<EditActions
		editing={true}
		disabled={saving || !hasUnsavedChanges}
		saveDisabled={saveDisabled}
		saving={saving}
		class="shrink-0"
		onEdit={() => {}}
		onCancel={onCancel}
		onSave={onSave}
	/>
{/if}
