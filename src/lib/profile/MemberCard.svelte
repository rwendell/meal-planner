<script lang="ts">
	import MemberAvatar from "$lib/components/MemberAvatar.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Separator } from "$lib/components/ui/separator";
	import { Switch } from "$lib/components/ui/switch";
	import { cn } from "$lib/utils.js";

	let {
		name,
		isOwner,
		householdName,
		memberImage,
		editing,
		saving,
		nameEdit,
		onNameEdit,
		onSave,
		onCancel,
		autoShare,
		showAutoShare,
		onAutoShare,
		inputRef,
		showLinkBanner,
		linking,
		onLink,
	}: {
		name: string;
		isOwner: boolean;
		householdName: string;
		memberImage: string | null;
		editing: boolean;
		saving: boolean;
		nameEdit: string;
		onNameEdit: (v: string) => void;
		onSave: (e?: SubmitEvent) => void;
		onCancel: () => void;
		autoShare: boolean | null;
		showAutoShare: boolean;
		onAutoShare: (v: boolean) => void;
		inputRef: (el: HTMLInputElement | null) => void;
		showLinkBanner: boolean;
		linking: boolean;
		onLink: () => void;
	} = $props();

	let localInput = $state<HTMLInputElement | null>(null);

	function setRef(value: HTMLInputElement | null): void {
		localInput = value;
		inputRef(value);
	}
</script>

<div
	class="grid gap-2 rounded-xl border bg-card px-3 py-2 text-sm shadow-xs"
>
	<div class="flex items-center gap-3">
		<MemberAvatar
			name={name}
			image={memberImage}
			size="lg"
		/>
		{#if !editing}
			<div class="min-w-0 flex-1">
				<p class="m-0 truncate font-semibold">
					{name}
				</p>
				<p
					class="m-0 truncate text-xs text-muted-foreground"
				>
					{isOwner ? "Owner" : "Member"} ·
					Member of {householdName}
				</p>
			</div>
		{:else}
			<form
				class="flex min-w-0 flex-1 items-center gap-1.5"
				onsubmit={(event) => onSave(event)}
			>
				<Input
					bind:ref={() => localInput, setRef}
					id="my-name"
					value={nameEdit}
					oninput={(event) => onNameEdit(event.currentTarget.value)}
					required
					maxlength={40}
					placeholder="Your name"
					autocomplete="given-name"
					aria-label="Display name"
					class="h-8"
					disabled={saving}
					onkeydown={(event) => {
						if (event.key === "Escape") onCancel();
					}}
				/>
			</form>
		{/if}
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
				disabled={!editing || saving}
				aria-label="Share my new meals publicly"
				class="mt-0.5 shrink-0"
			/>
			<span class="grid gap-0.5">
				<label
					for="auto-share-meals"
					class={cn(
						"text-sm font-medium",
						editing && !saving && "cursor-pointer",
					)}>Share my new meals publicly</label
				>
				<span class="text-xs text-muted-foreground">
					Meals you add appear in the community
					cookbook automatically.
				</span>
			</span>
		</div>
	{/if}
</div>
{#if showLinkBanner}
	<div
		class="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-3 py-2"
	>
		<p
			class="m-0 min-w-0 flex-1 text-xs text-muted-foreground"
		>
			This member isn't linked to your sign-in yet — link
			it to sync your name and picture.
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
