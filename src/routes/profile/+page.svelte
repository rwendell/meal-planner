<script lang="ts">
	import UserRoundIcon from "@lucide/svelte/icons/user-round";
	import { useMutation, useQuery } from "convex-svelte";
	import { tick } from "svelte";
	import { toast } from "svelte-sonner";
	import { resolve } from "$app/paths";
	import Icon from "$lib/components/Icon.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
	import { Separator } from "$lib/components/ui/separator";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { refKey, roster } from "$lib/households.svelte.js";
	import { session } from "$lib/session.svelte.js";
	import { cn } from "$lib/utils.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	type RosterEntry = NonNullable<NonNullable<typeof rosterQuery.data>[number]>;

	const rosterQuery = useQuery(api.households.listHouseholds, () =>
		roster.refs.length > 0
			? {
					refs: roster.refs.map((ref) => ({
						householdId: ref.householdId as Id<"households">,
						memberId: ref.memberId as Id<"householdMembers">,
					})),
				}
			: "skip",
	);

	const householdQuery = useQuery(api.households.get, () =>
		session.session
			? { householdId: session.session.householdId as Id<"households"> }
			: "skip",
	);

	const renameHousehold = useMutation(api.households.renameHousehold);
	const renameMember = useMutation(api.households.renameMember);
	const removeMember = useMutation(api.households.removeMember);
	const createHousehold = useMutation(api.households.create);
	const joinHousehold = useMutation(api.households.join);
	const leaveHousehold = useMutation(api.households.leave);

	let entries = $derived(
		(rosterQuery.data ?? []).filter(
			(entry): entry is RosterEntry => entry !== null,
		),
	);
	let rosterLoading = $derived(
		roster.refs.length > 0 && rosterQuery.data === undefined,
	);
	let activeEntry = $derived(
		entries.find(
			(entry) =>
				entry.household._id === session.session?.householdId &&
				entry.member._id === session.session?.memberId,
		) ?? null,
	);
	let myName = $derived(activeEntry?.member.name ?? "Me");

	let household = $derived(householdQuery.data?.household ?? null);
	let members = $derived(householdQuery.data?.members ?? []);
	let myId = $derived(session.session?.memberId ?? null);
	let isManager = $derived(
		household ? !household.ownerId || household.ownerId === myId : false,
	);

	// Drop roster entries the server no longer resolves (deleted households).
	$effect(() => {
		const data = rosterQuery.data;
		if (!data) return;
		const alive = new Set<string>();
		for (const entry of data) {
			if (entry) {
				alive.add(
					refKey({
						householdId: entry.household._id,
						memberId: entry.member._id,
					}),
				);
			}
		}
		roster.pruneToAlive(alive);
	});

	let myNameEdit = $state("");
	let myNameEditKey = $state<string | null>(null);
	let editingName = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);
	let householdNameEdit = $state("");
	let householdNameEditKey = $state<string | null>(null);
	let joinCode = $state("");
	let newHouseholdName = $state("");
	let joinError = $state("");
	let createError = $state("");

	// Prefill the always-visible rename inputs from loaded data, resetting
	// only when a different entity is shown so typing is never clobbered.
	$effect(() => {
		const member = activeEntry?.member;
		if (member && myNameEditKey !== member._id) {
			myNameEditKey = member._id;
			myNameEdit = member.name;
		}
	});

	$effect(() => {
		const house = activeEntry?.household;
		if (house && householdNameEditKey !== house._id) {
			householdNameEditKey = house._id;
			householdNameEdit = house.name;
		}
	});

	function errorMessage(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback;
	}

	async function startEditingName(): Promise<void> {
		editingName = true;
		await tick();
		nameInput?.focus();
		nameInput?.select();
	}

	function cancelEditingName(): void {
		if (activeEntry) myNameEdit = activeEntry.member.name;
		editingName = false;
	}

	async function saveMyName(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const current = session.session;
		if (!current || !myNameEdit.trim()) return;
		try {
			await renameMember({
				householdId: current.householdId as Id<"households">,
				memberId: current.memberId as Id<"householdMembers">,
				name: myNameEdit.trim(),
				callerMemberId: current.memberId as Id<"householdMembers">,
			});
			editingName = false;
			toast.success("Name updated");
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't update your name."));
		}
	}

	async function saveHouseholdName(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const current = session.session;
		if (!current || !householdNameEdit.trim()) return;
		try {
			await renameHousehold({
				householdId: current.householdId as Id<"households">,
				memberId: current.memberId as Id<"householdMembers">,
				name: householdNameEdit.trim(),
			});
			toast.success("Household name updated");
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't update the household name."));
		}
	}

	async function copyInviteCode(code: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(code);
			toast.success("Invite code copied");
		} catch {
			toast.error("Copy was blocked by the browser");
		}
	}

	function switchHousehold(entry: RosterEntry): void {
		roster.switchTo({
			householdId: entry.household._id,
			memberId: entry.member._id,
		});
		toast.success(`Switched to ${entry.household.name}`);
	}

	async function handleLeaveHousehold(entry: RosterEntry): Promise<void> {
		try {
			await leaveHousehold({
				memberId: entry.member._id as Id<"householdMembers">,
			});
			roster.forget(entry.household._id);
			toast.success(`Left ${entry.household.name}`);
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't leave the household."));
		}
	}

	async function handleJoinHousehold(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		joinError = "";
		try {
			const result = await joinHousehold({
				inviteCode: joinCode,
				memberName: myName,
			});
			joinCode = "";
			roster.switchTo({
				householdId: result.householdId,
				memberId: result.memberId,
			});
			toast.success("Household joined");
		} catch (error) {
			joinError = errorMessage(error, "Couldn't join with that code.");
		}
	}

	async function handleCreateHousehold(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		createError = "";
		const name = newHouseholdName.trim();
		if (!name) return;
		try {
			const result = await createHousehold({
				householdName: name,
				memberName: myName,
			});
			newHouseholdName = "";
			roster.switchTo({
				householdId: result.householdId,
				memberId: result.memberId,
			});
			toast.success(`Created ${name}`);
		} catch (error) {
			createError = errorMessage(error, "Couldn't create the household.");
		}
	}

	async function removeMemberRow(
		targetId: string,
		name: string,
	): Promise<void> {
		const current = session.session;
		if (!current) return;
		try {
			const result = await removeMember({
				householdId: current.householdId as Id<"households">,
				memberId: targetId as Id<"householdMembers">,
				callerMemberId: current.memberId as Id<"householdMembers">,
			});
			if (result.householdDeleted) {
				roster.forget(current.householdId);
				toast.success(`Removed ${name} and deleted the household`);
			} else {
				toast.success(`Removed ${name}`);
			}
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't remove the member."));
		}
	}
</script>

<svelte:head><title>Profile · Meal Planner</title></svelte:head>

<main>
	{#if !session.session}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media><UserRoundIcon /></Empty.Media>
				<Empty.Title>No household yet</Empty.Title>
				<Empty.Description>
					You need an active household to view your profile.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button href={resolve("/")}>Go home</Button>
			</Empty.Content>
		</Empty.Root>
	{:else if rosterLoading}
		<div class="profile-grid">
			<Skeleton class="h-14" />
			<Skeleton class="h-72" />
			<Skeleton class="h-48" />
			<Skeleton class="h-56" />
		</div>
	{:else}
		<div class="profile-grid">
			<div class="grid gap-1">
				<h1 class="m-0 font-serif text-[26px] leading-tight tracking-[-0.02em]">
					Profile
				</h1>
				<p class="m-0 text-sm text-muted-foreground">
					Your name, households, and members.
				</p>
			</div>
			{#if activeEntry}
				<div class="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm shadow-xs">
					<span
						aria-hidden="true"
						class="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold"
					>
						{myName.charAt(0).toUpperCase() || "M"}
					</span>
					{#if !editingName}
						<div class="min-w-0 flex-1">
							<p class="m-0 truncate font-semibold">{myName}</p>
							<p class="m-0 truncate text-xs text-muted-foreground">
								{activeEntry.isOwner ? "Owner" : "Member"} · Member of {activeEntry.household.name}
							</p>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Edit display name"
							title="Edit name"
							onclick={() => void startEditingName()}
						>
							<Icon name="pencil" size={14} />
						</Button>
					{:else}
						<form class="flex min-w-0 flex-1 items-center gap-1.5" onsubmit={saveMyName}>
							<Input
								bind:ref={nameInput}
								id="my-name"
								bind:value={myNameEdit}
								required
								maxlength={40}
								placeholder="Your name"
								autocomplete="given-name"
								aria-label="Display name"
								class="h-8"
								onkeydown={(event) => {
									if (event.key === "Escape") cancelEditingName();
								}}
							/>
							<Button
								type="submit"
								size="icon-sm"
								disabled={!myNameEdit.trim()}
								aria-label="Save name"
								title="Save"
							>
								<Icon name="check" size={14} />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Cancel editing name"
								title="Cancel"
								onclick={cancelEditingName}
							>
								<Icon name="close" size={14} />
							</Button>
						</form>
					{/if}
				</div>

				<Card.Root>
					<Card.Header>
						<Card.Title>Current household</Card.Title>
						<Card.Description>
							{activeEntry.memberCount}
							{activeEntry.memberCount === 1 ? "member" : "members"} · rename or share the invite
							code
						</Card.Description>
					</Card.Header>
					<Card.Content class="grid items-start gap-4 sm:grid-cols-2">
						<form class="grid gap-2" onsubmit={saveHouseholdName}>
							<label
								for="household-name"
								class="grid flex-1 gap-1.5 text-xs font-semibold text-muted-foreground"
								>Household name<Input
									id="household-name"
									bind:value={householdNameEdit}
									required
									maxlength={40}
									placeholder="Household name"
									autocomplete="off"
								/></label
							>
							<Button type="submit" disabled={!householdNameEdit.trim()}>Save</Button>
						</form>
						<div class="grid content-start gap-1.5">
							<span class="text-xs font-semibold text-muted-foreground">Invite code</span>
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-mono text-sm font-extrabold tracking-[0.2em]">
									{activeEntry.household.inviteCode}
								</span>
								<Button
									variant="outline"
									size="sm"
									onclick={() =>
										copyInviteCode(activeEntry.household.inviteCode)}
								>
									<Icon name="copy" size={14} dataIcon="inline-start" /> Copy
								</Button>
							</div>
							<p class="m-0 text-xs text-muted-foreground">
								Share this code to invite others.
							</p>
						</div>
						<Separator class="sm:col-span-2" />
						<div class="grid gap-2 sm:col-span-2">
							<span class="text-xs font-semibold text-muted-foreground">
								Members · {members.length}
							</span>
							{#if householdQuery.data === undefined}
								<Skeleton class="h-10" />
								<Skeleton class="h-10" />
							{:else if !household}
								<p class="m-0 text-sm text-muted-foreground">
									This household no longer exists.
								</p>
							{:else if members.length === 0}
								<p class="m-0 text-sm text-muted-foreground">No members yet.</p>
							{:else}
								{#each members as member (member._id)}
									{@const isSelf = member._id === myId}
									<div class="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
										<div class="flex min-w-0 flex-wrap items-center gap-1.5">
											<strong class="truncate text-sm">{member.name}</strong>
											{#if isSelf}<Badge variant="secondary" class="shrink-0">You</Badge>{/if}
											{#if household?.ownerId === member._id}
												<Badge variant="secondary" class="shrink-0">Owner</Badge>
											{/if}
										</div>
										{#if !isSelf && isManager}
											<AlertDialog.Root>
												<AlertDialog.Trigger>
													{#snippet child({ props })}
														<Button
															variant="ghost"
															size="icon-sm"
															aria-label={`Remove ${member.name}`}
															title="Remove"
															{...props}
														>
															<Icon name="close" size={14} />
														</Button>
													{/snippet}
												</AlertDialog.Trigger>
												<AlertDialog.Content>
													<AlertDialog.Header>
														<AlertDialog.Title>
															Remove {member.name}?
														</AlertDialog.Title>
														<AlertDialog.Description>
															{member.name} will lose access to this household
															and their planned meals will be removed.
														</AlertDialog.Description>
													</AlertDialog.Header>
													<AlertDialog.Footer>
														<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
														<AlertDialog.Action
															variant="destructive"
															onclick={() =>
																removeMemberRow(member._id, member.name)}
														>
															Remove
														</AlertDialog.Action>
													</AlertDialog.Footer>
												</AlertDialog.Content>
											</AlertDialog.Root>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					</Card.Content>
				</Card.Root>
			{/if}

			<Card.Root>
				<Card.Header>
					<Card.Title>Households</Card.Title>
					<Card.Description>
						Switch between households, or leave ones you no longer need.
					</Card.Description>
				</Card.Header>
				<Card.Content class="grid gap-2 sm:grid-cols-2">
					{#if entries.length === 0}
						<p class="m-0 text-sm text-muted-foreground sm:col-span-2">
							No households yet — join one below or create a new household.
						</p>
					{:else}
						{#each entries as entry (`${entry.household._id}:${entry.member._id}`)}
							{@const isActive =
								entry.household._id === session.session?.householdId &&
								entry.member._id === session.session?.memberId}
							<div
								class={cn(
									"flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between",
									isActive && "border-primary bg-muted/50",
								)}
							>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-1.5">
										<strong class="truncate">{entry.household.name}</strong>
										{#if isActive}<Badge>Current</Badge>{/if}
										<Badge variant="secondary">
											{entry.isOwner ? "Owner" : "Member"}
										</Badge>
									</div>
									<p class="m-0 mt-1 font-mono text-xs text-muted-foreground">
										{entry.household.inviteCode} · {entry.memberCount}
										{entry.memberCount === 1 ? "member" : "members"} · as {entry.member.name}
									</p>
								</div>
								<div class="flex shrink-0 gap-2">
									{#if !isActive}
										<Button
											variant="outline"
											size="sm"
											onclick={() => switchHousehold(entry)}
										>
											Switch
										</Button>
									{/if}
									<AlertDialog.Root>
										<AlertDialog.Trigger>
											{#snippet child({ props })}
												<Button
													variant="ghost"
													size="sm"
													class="text-muted-foreground hover:text-destructive"
													{...props}
												>
													Leave
												</Button>
											{/snippet}
										</AlertDialog.Trigger>
										<AlertDialog.Content>
											<AlertDialog.Header>
												<AlertDialog.Title>
													Leave {entry.household.name}?
												</AlertDialog.Title>
												<AlertDialog.Description>
													You will lose access to this household and your
													planned meals there will be removed.
												</AlertDialog.Description>
											</AlertDialog.Header>
											<AlertDialog.Footer>
												<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
												<AlertDialog.Action
													variant="destructive"
													onclick={() => handleLeaveHousehold(entry)}
												>
													Leave
												</AlertDialog.Action>
											</AlertDialog.Footer>
										</AlertDialog.Content>
									</AlertDialog.Root>
								</div>
							</div>
						{/each}
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Join or create</Card.Title>
					<Card.Description>
						Use an invite code to join another household, or start a fresh one.
					</Card.Description>
				</Card.Header>
				<Card.Content class="grid gap-6 sm:grid-cols-2">
					<div class="grid content-start gap-2">
						<h3 class="m-0 text-sm font-semibold">Join with code</h3>
						<p class="m-0 text-xs text-muted-foreground">
							Ask a member for their 6-character invite code.
						</p>
						<form class="grid gap-2" onsubmit={handleJoinHousehold}>
							<label for="join-code" class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
								>Invite code<Input
									id="join-code"
									bind:value={joinCode}
									required
									maxlength={6}
									placeholder="ABC123"
									autocomplete="off"
									autocapitalize="characters"
									class="uppercase tracking-[0.2em]"
								/></label
							>
							{#if joinError}
								<p class="m-0 text-xs font-semibold text-destructive" role="alert">
									{joinError}
								</p>
							{/if}
							<Button type="submit" disabled={!joinCode.trim()}>Join</Button>
						</form>
					</div>
					<div class="grid content-start gap-2">
						<h3 class="m-0 text-sm font-semibold">New household</h3>
						<p class="m-0 text-xs text-muted-foreground">
							Creates a new kitchen and switches you to it.
						</p>
						<form class="grid gap-2" onsubmit={handleCreateHousehold}>
							<label
								for="new-household-name"
								class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
								>Household name<Input
									id="new-household-name"
									bind:value={newHouseholdName}
									required
									maxlength={40}
									placeholder="e.g. Smith Kitchen"
									autocomplete="off"
								/></label
							>
							{#if createError}
								<p class="m-0 text-xs font-semibold text-destructive" role="alert">
									{createError}
								</p>
							{/if}
							<Button type="submit" disabled={!newHouseholdName.trim()}>Create</Button>
						</form>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</main>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global(body) {
		min-width: 320px;
	}
	main {
		max-width: 1180px;
		margin: 0 auto;
		padding: 20px 18px 72px;
	}
	.profile-grid {
		display: grid;
		gap: 12px;
		align-items: start;
		max-width: 46rem;
	}
	@media (min-width: 560px) {
		main {
			padding: 24px 28px 80px;
		}
		.profile-grid {
			gap: 16px;
		}
	}

	@media (min-width: 1024px) {
		main {
			padding: 34px 40px 80px;
		}
	}
</style>
