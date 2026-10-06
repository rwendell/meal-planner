<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";

let {
	joinCode,
	joinError,
	onJoinCode,
	onJoin,
}: {
	joinCode: string;
	joinError: string;
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
	<Card.Content class="grid gap-2">
		<div class="grid content-start gap-2">
			<span class="text-xs text-muted-foreground">
				Ask a member for their 6-character invite code, or open
				their invite link.
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
