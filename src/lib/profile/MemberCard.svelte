<script lang="ts">
	import EditableText from "$lib/components/EditableText.svelte";
	import InfoTip from "$lib/components/InfoTip.svelte";
	import MemberAvatar from "$lib/components/MemberAvatar.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Separator } from "$lib/components/ui/separator";
	import { Switch } from "$lib/components/ui/switch";
	import { cn } from "$lib/utils.js";

	let {
		name,
		memberImage,
		saving,
		nameEdit,
		onNameEdit,
		onSave,
		onCancel,
		autoShare,
		showAutoShare,
		onAutoShare,
		showLinkBanner,
		linking,
		onLink,
	}: {
		name: string;
		memberImage: string | null;
		saving: boolean;
		nameEdit: string;
		onNameEdit: (v: string) => void;
		onSave: (e?: SubmitEvent) => void;
		onCancel: () => void;
		autoShare: boolean | null;
		showAutoShare: boolean;
		onAutoShare: (v: boolean) => void;
		showLinkBanner: boolean;
		linking: boolean;
		onLink: () => void;
	} = $props();
</script>

<div class="grid gap-2 rounded-xl border bg-card px-3 py-2 text-sm shadow-xs">
	<div class="flex items-center gap-3">
		<MemberAvatar {name} image={memberImage} size="lg" />
		<EditableText
			value={nameEdit}
			display={name}
			placeholder="Your name"
			ariaLabel="Display name"
			inputClass="h-8"
			textClass="truncate font-semibold"
			onInput={(v) => onNameEdit(v)}
			onCommit={() => onSave()}
			onRevert={onCancel}
		/>
	</div>
	{#if showAutoShare}
		<Separator />
		<div class="flex items-start gap-2.5">
			<Switch
				id="auto-share-meals"
				checked={autoShare ?? true}
				onCheckedChange={(value) => {
					if (typeof value === "boolean") {
						onAutoShare(value);
					}
				}}
				disabled={saving}
				aria-label="Share my new meals publicly"
				class="mt-0.5 shrink-0"
			/>
			<span class="grid gap-0.5">
				<span class="flex items-center gap-1.5">
					<label
						for="auto-share-meals"
						class={cn(
							"text-sm font-medium",
							!saving && "cursor-pointer",
						)}>Share my new meals publicly</label
					>
					<InfoTip
						text="Meals you add appear in the community cookbook automatically."
					/>
				</span>
			</span>
		</div>
	{/if}
</div>
{#if showLinkBanner}
	<div
		class="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-3 py-2"
	>
		<p class="m-0 min-w-0 flex-1 text-xs text-muted-foreground">
			This member isn't linked to your sign-in yet — link it to sync your
			name and picture.
		</p>
		<Button
			variant="outline"
			size="sm"
			disabled={linking}
			onclick={() => onLink()}
		>
			{linking ? "Linking…" : "Link to my sign-in"}
		</Button>
	</div>
{/if}
