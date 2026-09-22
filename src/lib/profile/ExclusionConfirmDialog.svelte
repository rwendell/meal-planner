<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";

	let {
		open,
		impactMeals,
		saving,
		onOpen,
		onConfirm,
	}: {
		open: boolean;
		impactMeals: number;
		saving: boolean;
		onOpen: (v: boolean) => void;
		onConfirm: () => void;
	} = $props();
</script>

<AlertDialog.Root open={open} onOpenChange={(v) => onOpen(v)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				Remove {impactMeals}
				{impactMeals === 1 ? "meal" : "meals"}?
			</AlertDialog.Title>
			<AlertDialog.Description>
				These planned meals fall on days you're excluding.
				Saving will remove them from today onward and update
				groceries. This can't be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				disabled={saving}
				onclick={() => onConfirm()}
			>
				Remove & save
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
