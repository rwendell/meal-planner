<script lang="ts">
	import { MonitorCogIcon } from "@lucide/svelte";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import LogInIcon from "@lucide/svelte/icons/log-in";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import UserIcon from "@lucide/svelte/icons/user";
	import { tick } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import MemberAvatar from "$lib/components/MemberAvatar.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Popover from "$lib/components/ui/popover";
	import { Separator } from "$lib/components/ui/separator";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { plannerView } from "$lib/stores/planner-view.svelte.js";
	import { prefs } from "$lib/stores/prefs.svelte.js";
	import { themeStore } from "$lib/stores/theme.svelte.js";

	type Member = { _id: string; name: string };
	type ProfileView = "profile" | "preferences";

	let {
		name,
		image = null,
		members = null,
		myMemberId = null,
		wideScreen,
		isAuthenticated,
		authLoading,
		signingIn,
		onSignIn,
		onSignOut,
	}: {
		name: string;
		image?: string | null;
		members?: Array<Member> | null;
		myMemberId?: string | null;
		wideScreen: boolean;
		isAuthenticated: boolean;
		authLoading: boolean;
		signingIn: boolean;
		onSignIn: () => void;
		onSignOut: () => void;
	} = $props();

	let open = $state(false);
	let view = $state<ProfileView>("profile");
	let menuEl = $state<HTMLDivElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);
	let backEl = $state<HTMLButtonElement | null>(null);

	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

	/** Move focus to the first control, once the open state has rendered. */
	async function focusMenu(): Promise<void> {
		await tick();
		menuEl?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
	}

	function close(): void {
		open = false;
		view = "profile";
		triggerEl?.focus();
	}

	/** bits-ui owns the open state; this is the one place that reacts to it. */
	function handleOpenChange(next: boolean): void {
		if (!next) {
			close();
			return;
		}
		view = "profile";
		void focusMenu();
	}

	async function openPreferences(): Promise<void> {
		view = "preferences";
		await tick();
		if (open && view === "preferences") backEl?.focus();
	}

	function showProfile(): void {
		view = "profile";
		void focusMenu();
	}

	/**
	 * Switching the desktop layout can move the user to another route, so
	 * close the menu first. From a non-planner surface the preference
	 * still applies, it just doesn't navigate.
	 */
	async function setDesktopLayout(dashboard: boolean): Promise<void> {
		if (prefs.desktopDashboard === dashboard) return;
		prefs.setDesktopDashboard(dashboard);
		const onPlannerSurface =
			page.url.pathname === "/" || page.url.pathname === "/dashboard";
		close();
		if (onPlannerSurface) {
			await goto(resolve(dashboard ? "/dashboard" : "/#planner"));
		}
	}

	/**
	 * Escape closes; Tab is trapped inside the menu while it is open, so
	 * focus can't escape into the page behind the popover.
	 */
	function onKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			if (open) {
				event.preventDefault();
				close();
			}
			return;
		}
		if (!open || event.key !== "Tab" || !menuEl) return;

		const focusable = Array.from(
			menuEl.querySelectorAll<HTMLElement>(FOCUSABLE),
		);
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!menuEl.contains(document.activeElement)) {
			event.preventDefault();
			first?.focus();
		} else if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	}

	async function goToProfile(): Promise<void> {
		close();
		await goto(resolve("/profile"));
	}

	/**
	 * Close before signing out: the menu owns its open state, so the
	 * caller can no longer close it on our behalf. Order matters -- the
	 * session flips to signed-out while the trigger still has focus.
	 */
	function handleSignOut(): void {
		close();
		onSignOut();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Popover.Root bind:open onOpenChange={handleOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				variant="outline"
				{...props}
				bind:ref={triggerEl}
				class="max-w-[min(170px,20vw)] gap-[7px] rounded-full py-0 pr-2.5 pl-2 max-[360px]:size-[34px] max-[360px]:justify-center max-[360px]:p-0"
				aria-label={open
					? "Close profile menu"
					: `Open profile menu for ${name}`}
				title={`Profile: ${name}`}
				aria-haspopup="dialog"
				aria-controls="profile-menu"
				aria-expanded={open}
			>
				<MemberAvatar {name} {image} size="sm" />
				<span class="min-w-0 truncate text-[11px] font-bold max-[360px]:hidden"
					>{name}</span
				>
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content
		id="profile-menu"
		bind:ref={menuEl}
		data-no-swipe
		align="end"
		sideOffset={8}
		aria-label={view === "profile" ? "Profile menu" : "Preferences"}
		class="max-h-[calc(100vh-70px)] w-[min(360px,calc(100vw-24px))] overflow-y-auto overscroll-contain"
	>
		{#if view === "profile"}
			<div class="grid gap-4">
				<div class="flex items-start justify-between">
					<div>
						<h2
							id="profile-heading"
							class="font-serif text-[18px] tracking-[-0.03em] [overflow-wrap:anywhere]"
						>
							Profile
						</h2>
						<p class="m-0 text-xs text-muted-foreground">
							{#if members}
								{members.length}
								{members.length === 1 ? "member" : "members"} in this
								household
							{:else}
								Your household and account settings
							{/if}
						</p>
					</div>
				</div>
				{#if members}
					<section aria-label="Members" class="grid gap-2">
						<h3
							class="m-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
						>
							Members
						</h3>
						<ul class="m-0 grid list-none gap-1.5 p-0">
							{#each members as member (member._id)}
								<li
									class="flex min-w-0 items-center gap-2 text-[13px] font-medium"
								>
									<span class="min-w-0 shrink truncate">{member.name}</span>
									{#if member._id === myMemberId}
										<Badge variant="secondary" class="shrink-0">You</Badge>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}
				<Separator />
				<nav aria-label="Account" class="grid gap-1">
					<h3
						class="m-0 px-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
					>
						Account
					</h3>
					<Button
						variant="ghost"
						class="w-full justify-start gap-2 px-2"
						onclick={() => void goToProfile()}
					>
						<UserIcon data-icon="inline-start" />
						<span class="flex-1 text-left">Profile</span>
						<span class="grid shrink-0 -rotate-90 text-muted-foreground"
							><ChevronDownIcon /></span
						>
					</Button>
					<Button
						variant="ghost"
						class="w-full justify-start gap-2 px-2"
						onclick={() => void openPreferences()}
					>
						<MonitorCogIcon data-icon="inline-start" />
						<span class="flex-1 text-left">Display Preferences</span>
						<span class="grid shrink-0 -rotate-90 text-muted-foreground"
							><ChevronDownIcon /></span
						>
					</Button>
					{#if isAuthenticated}
						<Button
							variant="ghost"
							class="w-full justify-start gap-2 px-2"
							onclick={handleSignOut}
						>
							<LogOutIcon data-icon="inline-start" />
							<span class="flex-1 text-left">Sign out</span>
						</Button>
					{:else}
						<Button
							variant="ghost"
							class="w-full justify-start gap-2 px-2"
							disabled={authLoading || signingIn}
							onclick={onSignIn}
						>
							{#if signingIn}
								<LoaderCircleIcon
									data-icon="inline-start"
									class="animate-spin"
								/>
							{:else}
								<LogInIcon data-icon="inline-start" />
							{/if}
							<span class="flex-1 text-left"
								>{signingIn ? "Signing in…" : "Sign in with Google"}</span
							>
						</Button>
					{/if}
				</nav>
			</div>
		{:else}
			<div class="grid gap-4">
				<div class="grid gap-2">
					<Button
						variant="ghost"
						size="sm"
						bind:ref={backEl}
						class="w-fit justify-start px-1"
						onclick={showProfile}
					>
						<span class="grid rotate-90"
							><ChevronDownIcon data-icon="inline-start" /></span
						>
						<span>Back to profile</span>
					</Button>
					<div class="grid gap-1">
						<h2
							id="preferences-heading"
							class="m-0 font-serif text-[18px] tracking-[-0.03em]"
						>
							Preferences
						</h2>
						<p class="m-0 text-xs text-muted-foreground">
							Appearance and layout for this device.
						</p>
					</div>
				</div>
				<div class="grid gap-4">
					<section aria-label="Appearance" class="grid gap-2">
						<h3
							class="m-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
						>
							Appearance
						</h3>
						<ToggleGroup.Root
							type="single"
							variant="outline"
							value={themeStore.choice}
							class="w-full"
							aria-label="Appearance"
							onValueChange={(value) => {
								if (
									value === "system" ||
									value === "light" ||
									value === "dark"
								) {
									themeStore.setTheme(value);
								}
							}}
						>
							{#each themeStore.options as option (option.id)}
								<ToggleGroup.Item
									value={option.id}
									aria-label={option.label}
									class="flex-1"
								>
									{option.label}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</section>
					{#if !wideScreen}
						<section aria-label="Mobile planner view" class="grid gap-2">
							<h3
								class="m-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
							>
								Mobile planner view
							</h3>
							<ToggleGroup.Root
								type="single"
								variant="outline"
								value={plannerView.view}
								class="w-full"
								aria-label="Mobile planner view"
								onValueChange={(value) => {
									if (value === "day" || value === "week") {
										plannerView.set(value);
									}
								}}
							>
								<ToggleGroup.Item
									value="day"
									aria-label="Day"
									class="flex-1">Day</ToggleGroup.Item
								>
								<ToggleGroup.Item
									value="week"
									aria-label="Week"
									class="flex-1">Week</ToggleGroup.Item
								>
							</ToggleGroup.Root>
						</section>
					{/if}
					{#if wideScreen}
						<section aria-label="Desktop layout" class="grid gap-2">
							<h3
								class="m-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
							>
								Desktop layout
							</h3>
							<ToggleGroup.Root
								type="single"
								variant="outline"
								value={prefs.desktopDashboard ? "dashboard" : "pages"}
								class="w-full"
								aria-label="Desktop layout"
								onValueChange={(value) => {
									if (value === "dashboard") void setDesktopLayout(true);
									else if (value === "pages")
										void setDesktopLayout(false);
								}}
							>
								<ToggleGroup.Item
									value="pages"
									aria-label="Pages"
									class="flex-1">Pages</ToggleGroup.Item
								>
								<ToggleGroup.Item
									value="dashboard"
									aria-label="Dashboard"
									class="flex-1">Dashboard</ToggleGroup.Item
								>
							</ToggleGroup.Root>
						</section>
					{/if}
				</div>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>