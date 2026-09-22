<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";

	let {
		joinCode,
		newHouseholdName,
		joinError,
		createError,
		onJoinCode,
		onNewName,
		onJoin,
		onCreate,
	}: {
		joinCode: string;
		newHouseholdName: string;
		joinError: string;
		createError: string;
		onJoinCode: (v: string) => void;
		onNewName: (v: string) => void;
		onJoin: (e: SubmitEvent) => void;
		onCreate: (e: SubmitEvent) => void;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Join or create</Card.Title>
		<Card.Description>
			Use an invite code to join another household, or start a
			fresh one.
		</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-6 sm:grid-cols-2">
		<div class="grid content-start gap-2">
			<h3 class="m-0 text-sm font-semibold">
				Join with code
			</h3>
			<p class="m-0 text-xs text-muted-foreground">
				Ask a member for their 6-character invite code.
			</p>
			<form class="grid gap-2" onsubmit={(event) => onJoin(event)}>
				<label
					for="join-code"
					class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
					>Invite code<Input
						id="join-code"
						value={joinCode}
						oninput={(event) =>
							onJoinCode(event.currentTarget.value)}
						required
						maxlength={6}
						placeholder="ABC123"
						autocomplete="off"
						autocapitalize="characters"
						class="uppercase tracking-[0.2em]"
					/></label
				>
				{#if joinError}
					<p
						class="m-0 text-xs font-semibold text-destructive"
						role="alert"
					>
						{joinError}
					</p>
				{/if}
				<Button type="submit" disabled={!joinCode.trim()}
					>Join</Button
				>
			</form>
		</div>
		<div class="grid content-start gap-2">
			<h3 class="m-0 text-sm font-semibold">New household</h3>
			<p class="m-0 text-xs text-muted-foreground">
				Creates a new kitchen and switches you to it.
			</p>
			<form
				class="grid gap-2"
				onsubmit={(event) => onCreate(event)}
			>
				<label
					for="new-household-name"
					class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
					>Household name<Input
						id="new-household-name"
						value={newHouseholdName}
						oninput={(event) =>
							onNewName(event.currentTarget.value)}
						required
						maxlength={40}
						placeholder="e.g. Smith Kitchen"
						autocomplete="off"
					/></label
				>
				{#if createError}
					<p
						class="m-0 text-xs font-semibold text-destructive"
						role="alert"
					>
						{createError}
					</p>
				{/if}
				<Button
					type="submit"
					disabled={!newHouseholdName.trim()}
					>Create</Button
				>
			</form>
		</div>
	</Card.Content>
</Card.Root>
