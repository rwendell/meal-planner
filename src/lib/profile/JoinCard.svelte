<script lang="ts">
import InviteCode from "$lib/components/InviteCode.svelte";
	import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";

let {
	joinCode,
	joinError,
	inviteCode = null,
	onJoinCode,
	onJoin,
}: {
	joinCode: string;
	joinError: string;
	inviteCode?: string | null;
	onJoinCode: (v: string) => void;
	onJoin: (e: SubmitEvent) => void;
} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Join a household</Card.Title>
		<Card.Description>
			Use an invite code to join another household. Your meals and
			skipped meals come with you.
		</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-6 sm:grid-cols-2">
		{#if inviteCode}
			<div class="grid content-start gap-2">
				<h3 class="m-0 text-sm font-semibold">
					Invite friends
				</h3>
				<span class="text-xs text-muted-foreground">
					Share this code so others can join your
					household.
				</span>
				<div>
					<InviteCode code={inviteCode} />
				</div>
			</div>
		{/if}
		<div class="grid content-start gap-2">
			<h3 class="m-0 text-sm font-semibold">
				Join with code
			</h3>
			<span class="text-xs text-muted-foreground">
				Ask a member for their 6-character invite code.
			</span>
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
					<span
						class="text-xs font-semibold text-destructive"
						role="alert"
					>
						{joinError}
					</span>
				{/if}
				<Button type="submit" disabled={!joinCode.trim()}
					>Join</Button
				>
			</form>
		</div>
	</Card.Content>
</Card.Root>
