<script lang="ts">
	import { useQuery } from "convex-svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { HouseholdActions } from "$lib/profile/household-actions.svelte.js";
	import { deviceName, session } from "$lib/stores/session.svelte.js";
	import { api } from "../../../convex/_generated/api.js";
	import type { Id } from "../../../convex/_generated/dataModel";

	const households = new HouseholdActions();

	let code = $derived(
		(page.url.searchParams.get("code") ?? "").trim().toUpperCase(),
	);

	const lookup = useQuery(api.householdLifecycle.lookupInvite, () => {
		if (!code) return "skip";
		const current = session.session;
		return {
			inviteCode: code,
			...(current
				? { callerMemberId: current.memberId as Id<"householdMembers"> }
				: {}),
		};
	});

	// Name for the new member row. Mirrors the profile join form: the
	// session member's name, falling back to the device name for visitors
	// who haven't named themselves yet.
	const selfQuery = useQuery(api.householdLifecycle.get, () => {
		const current = session.session;
		return current
			? {
					householdId: current.householdId as Id<"households">,
					callerMemberId: current.memberId as Id<"householdMembers">,
				}
			: "skip";
	});
	let selfMember = $derived(
		selfQuery.data?.members.find(
			(member) => member._id === session.session?.memberId,
		) ?? null,
	);

	let joining = $state(false);

	async function join(): Promise<void> {
		if (joining || !code) return;
		joining = true;
		try {
			const ok = await households.joinWithCode(
				code,
				selfMember?.name ?? deviceName(),
				selfMember?.autoNamed !== false,
			);
			if (ok) await goto(resolve("/"));
		} finally {
			joining = false;
		}
	}
</script>

<svelte:head><title>Join household · Meal Planner</title></svelte:head>

{#if !code}
	<Card.Root>
		<Card.Header>
			<Card.Title>Join a household</Card.Title>
			<Card.Description>
				This link has no invite code in it.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-2">
			<span class="text-sm text-muted-foreground">
				Ask the person who invited you for a fresh link, or enter
				their 6-character code on your profile page.
			</span>
			<Button onclick={() => void goto(resolve("/profile"))}>
				Go to profile
			</Button>
		</Card.Content>
	</Card.Root>
{:else if !session.session || lookup.data === undefined}
	<div class="grid gap-3">
		<Skeleton class="h-6 w-2/3" />
		<Skeleton class="h-4 w-full" />
		<Skeleton class="h-4 w-5/6" />
	</div>
{:else if lookup.data.status === "not_found"}
	<Card.Root>
		<Card.Header>
			<Card.Title>Invite not found</Card.Title>
			<Card.Description>
				No household uses the code “{code}”.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-2">
			<span class="text-sm text-muted-foreground">
				Codes change when the owner resets them. Ask for a fresh
				link, or enter the code on your profile page instead.
			</span>
			<Button onclick={() => void goto(resolve("/profile"))}>
				Go to profile
			</Button>
		</Card.Content>
	</Card.Root>
{:else if lookup.data.status === "already_member"}
	<Card.Root>
		<Card.Header>
			<Card.Title>You're already in</Card.Title>
			<Card.Description>
				This invite points at a household you already belong to.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-2">
			<Button onclick={() => void goto(resolve("/"))}>
				Open planner
			</Button>
		</Card.Content>
	</Card.Root>
{:else if lookup.data.status === "must_leave_first"}
	<Card.Root>
		<Card.Header>
			<Card.Title>One household at a time</Card.Title>
			<Card.Description>
				You're in a household with {lookup.data.currentCount} people.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-2">
			<span class="text-sm text-muted-foreground">
				Leave your current household on your profile page first, then
				open this link again.
			</span>
			<Button onclick={() => void goto(resolve("/profile"))}>
				Go to profile
			</Button>
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root>
		<Card.Header>
			<Card.Title>Join a household</Card.Title>
			<Card.Description>
				You've been invited to join a household
				{lookup.data.memberCount === 1
					? "of 1 person"
					: `of ${lookup.data.memberCount} people`}.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-2">
			<span class="text-sm text-muted-foreground">
				Everyone here shares meals, plans, and one shopping list.
				Your own meals and skipped meals come with you.
			</span>
			{#if households.joinError}
				<span
					class="text-xs font-semibold text-destructive"
					role="alert"
				>
					{households.joinError}
				</span>
			{/if}
			<div class="flex flex-wrap gap-2">
				<Button disabled={joining} onclick={() => void join()}>
					{joining ? "Joining…" : "Join household"}
				</Button>
				<Button variant="ghost" onclick={() => void goto(resolve("/"))}>
					Not now
				</Button>
			</div>
		</Card.Content>
	</Card.Root>
{/if}
