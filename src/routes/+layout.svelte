<script lang="ts">
	import "./layout.css";
	import { setupConvex, useMutation, useQuery } from "convex-svelte";
	import { tick } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { browser } from "$app/environment";
	import { goto, onNavigate } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { PUBLIC_CONVEX_URL } from "$env/static/public";
	import favicon from "$lib/assets/favicon.svg";
	import Icon, { type IconName } from "$lib/components/Icon.svelte";
	import TabBar from "$lib/components/TabBar.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Popover from "$lib/components/ui/popover";
	import { Separator } from "$lib/components/ui/separator";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Toaster } from "$lib/components/ui/sonner";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { plannerView } from "$lib/planner-view.svelte.js";
	import { prefs } from "$lib/prefs.svelte.js";
	import {
		clearProvisioningLock,
		provisioningLockAge,
		STORAGE_KEY,
		session,
		setProvisioningLock,
	} from "$lib/session.svelte.js";
	import { api } from "../convex/_generated/api.js";
	import type { Id } from "../convex/_generated/dataModel";

	setupConvex(PUBLIC_CONVEX_URL);

	interface NavItem {
		id: string;
		label: string;
		icon: IconName;
		href: "/#planner" | "/meals" | "/shopping";
	}

	type ViewTransitionDocument = Document & {
		startViewTransition?: (
			updateCallback: () => void | Promise<void>,
		) => { finished: Promise<unknown> };
	};

	const navItems: NavItem[] = [
		{ id: "planner", label: "Planner", icon: "calendar", href: "/#planner" },
		{ id: "meals", label: "Meal database", icon: "book", href: "/meals" },
		{ id: "shopping", label: "Shopping list", icon: "cart", href: "/shopping" },
	];

	type Theme = "system" | "light" | "dark";
	const THEME_KEY = "meal-planner-theme";
	const themeOptions: { id: Theme; label: string }[] = [
		{ id: "system", label: "System" },
		{ id: "light", label: "Light" },
		{ id: "dark", label: "Dark" },
	];

	let theme = $state<Theme>("system");
	if (browser) {
		const saved = localStorage.getItem(THEME_KEY);
		if (saved === "light" || saved === "dark" || saved === "system") {
			theme = saved;
		}
	}

	function setTheme(value: Theme): void {
		theme = value;
		if (browser) localStorage.setItem(THEME_KEY, value);
	}

	const systemDark = new MediaQuery("(prefers-color-scheme: dark)", false);

	$effect(() => {
		if (!browser) return;
		const dark =
			theme === "dark" || (theme === "system" && systemDark.current);
		document.documentElement.classList.toggle("dark", dark);
		document.documentElement.style.colorScheme = dark ? "dark" : "light";
	});

	let activeSection = $derived(
		page.url.pathname === "/meals"
			? "meals"
			: page.url.pathname === "/shopping"
				? "shopping"
				: page.url.hash
					? page.url.hash.slice(1)
					: "planner",
	);

	let profileOpen = $state(false);
	type ProfileView = "profile" | "preferences";
	let profileView = $state<ProfileView>("profile");
	let copied = $state(false);
	let confirmingLeave = $state(false);
	let leaving = $state(false);
	let leaveError = $state("");
	let profileMenu = $state<HTMLDivElement | null>(null);
	let profileTrigger = $state<HTMLElement | null>(null);
	let swipeState = $state<{
		pointerId: number;
		startX: number;
		startY: number;
	} | null>(null);
	let swipeNavigating = false;
	let swipeDirection = $state<-1 | 0 | 1>(0);
	let swipeTargetPath = $state<string | null>(null);
	let profileBackTrigger = $state<HTMLButtonElement | null>(null);
	const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)", false);
	const wideScreen = new MediaQuery("(min-width: 1024px)", false);

	const memberColors = [
		"#e47d5f",
		"#507b62",
		"#686c87",
		"#887647",
		"#b86b51",
		"#4f7d8c",
	];

	const householdQuery = useQuery(api.households.get, () =>
		session.session
			? { householdId: session.session.householdId as Id<"households"> }
			: "skip",
	);
	const leaveHousehold = useMutation(api.households.leave);
	const createHousehold = useMutation(api.households.create);
	const joinHousehold = useMutation(api.households.join);

	let householdForm = $state<"create" | "join" | null>(null);
	let newHouseholdName = $state("");
	let joinCode = $state("");
	let joinName = $state("");
	let householdError = $state("");

	// First visit lands straight in the planner with a personal household.
	// A linked-but-deleted household resets the same way. A lock plus a
	// storage listener keeps two tabs opened at once from each provisioning.
	let provisionTick = $state(0);
	$effect(() => {
		provisionTick;
		if (!browser || session.session) return;
		const onStorage = (event: StorageEvent) => {
			if (event.key === STORAGE_KEY) session.reload();
		};
		window.addEventListener("storage", onStorage);
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (provisioningLockAge() < 30000) {
			timer = setTimeout(() => {
				clearProvisioningLock();
				provisionTick += 1;
			}, 3000);
		} else {
			setProvisioningLock();
			createHousehold({ householdName: "My Kitchen", memberName: "Me" })
				.then((result) => {
					session.connect({
						householdId: result.householdId,
						memberId: result.memberId,
					});
				})
				.catch(() => {})
				.finally(() => {
					clearProvisioningLock();
				});
		}
		return () => {
			window.removeEventListener("storage", onStorage);
			if (timer) clearTimeout(timer);
		};
	});

	$effect(() => {
		if (session.session && householdQuery.data === null) {
			session.disconnect();
		}
	});

	function selfName(): string {
		const self = householdQuery.data?.members.find(
			(member) => member._id === session.session?.memberId,
		);
		return self?.name ?? "Me";
	}

	async function submitHouseholdForm(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		householdError = "";
		try {
			if (householdForm === "join") {
				const result = await joinHousehold({
					inviteCode: joinCode,
					memberName: joinName.trim() || selfName(),
				});
				closeProfileMenu();
				session.connect({
					householdId: result.householdId,
					memberId: result.memberId,
				});
			} else {
				const name = newHouseholdName.trim();
				if (!name) return;
				const result = await createHousehold({
					householdName: name,
					memberName: selfName(),
				});
				closeProfileMenu();
				session.connect({
					householdId: result.householdId,
					memberId: result.memberId,
				});
			}
			householdForm = null;
			newHouseholdName = "";
			joinCode = "";
			joinName = "";
		} catch (error) {
			householdError =
				error instanceof Error ? error.message : "Something went wrong.";
		}
	}

	function openHouseholdForm(form: "create" | "join"): void {
		householdForm = form;
		householdError = "";
		confirmingLeave = false;
		leaveError = "";
	}

	async function copyInviteCode(code: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			copied = false;
		}
	}

	async function leave(): Promise<void> {
		const currentSession = session.session;
		if (!currentSession || leaving) return;
		leaving = true;
		leaveError = "";
		try {
			await leaveHousehold({
				memberId: currentSession.memberId as Id<"householdMembers">,
			});
			closeProfileMenu();
			session.disconnect();
		} catch (error) {
			leaveError =
				error instanceof Error ? error.message : "Couldn't leave the household.";
		} finally {
			leaving = false;
		}
	}

	const profileFocusableSelector =
		'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

	async function focusProfileMenu(): Promise<void> {
		// Only called when the menu is open or opening; no open-state guard
		// so focus can't be skipped by bind:open propagation timing.
		await tick();
		profileMenu?.querySelector<HTMLElement>(profileFocusableSelector)?.focus();
	}

	function handleProfileOpenChange(open: boolean): void {
		// bits-ui owns the open state (the trigger toggles it natively), so
		// this is the single place that reacts to opens and closes.
		if (open) {
			profileView = "profile";
		} else {
			closeProfileMenu();
			return;
		}
		void focusProfileMenu();
	}

	async function focusPreferences(): Promise<void> {
		await tick();
		if (profileOpen && profileView === "preferences") {
			profileBackTrigger?.focus();
		}
	}

	function closeProfileMenu(): void {
		profileOpen = false;
		profileView = "profile";
		confirmingLeave = false;
		leaveError = "";
		profileTrigger?.focus();
	}

	function openPreferences(): void {
		profileView = "preferences";
		void focusPreferences();
	}

	function showProfileView(): void {
		profileView = "profile";
		void focusProfileMenu();
	}

	async function setDesktopLayout(dashboard: boolean): Promise<void> {
		if (prefs.desktopDashboard === dashboard) return;
		prefs.setDesktopDashboard(dashboard);
		// Take the user straight to the newly selected layout when they are
		// already on a planner surface; otherwise just update the nav link.
		const onPlannerSurface =
			page.url.pathname === "/" || page.url.pathname === "/dashboard";
		closeProfileMenu();
		if (onPlannerSurface) {
			await goto(resolve(dashboard ? "/dashboard" : "/#planner"));
		}
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			if (profileOpen) {
				event.preventDefault();
				closeProfileMenu();
			}
			return;
		}

		if (!profileOpen || event.key !== "Tab" || !profileMenu) return;
		const focusable = Array.from(
			profileMenu.querySelectorAll<HTMLElement>(profileFocusableSelector),
		);
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!profileMenu.contains(document.activeElement)) {
			event.preventDefault();
			first.focus();
		} else if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function swipeBlockedByOverlay(): boolean {
		if (typeof document === "undefined") return false;
		return Boolean(
			document.querySelector(
				'[data-slot="dialog-content"], [data-slot="popover-content"], [data-slot="alert-dialog-content"]',
			),
		);
	}

	function shouldIgnoreSwipe(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return true;
		return Boolean(
			target.closest(
				'a, button, input, select, textarea, label, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog, [data-no-swipe]',
			),
		);
	}

	function onSwipePointerdown(event: PointerEvent): void {
		if (
			window.innerWidth >= 1024 ||
			!event.isPrimary ||
			swipeBlockedByOverlay() ||
			shouldIgnoreSwipe(event.target)
		) {
			swipeState = null;
			return;
		}
		swipeState = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
		};
	}

	function onSwipePointermove(event: PointerEvent): void {
		if (!swipeState || event.pointerId !== swipeState.pointerId) return;
		const deltaX = event.clientX - swipeState.startX;
		const deltaY = event.clientY - swipeState.startY;
		if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 12) {
			swipeState = null;
		}
	}

	async function onSwipePointerup(event: PointerEvent): Promise<void> {
		if (!swipeState || event.pointerId !== swipeState.pointerId) return;
		const { startX, startY } = swipeState;
		swipeState = null;

		const deltaX = event.clientX - startX;
		const deltaY = event.clientY - startY;
		if (
			window.innerWidth >= 1024 ||
			Math.abs(deltaX) < 56 ||
			Math.abs(deltaX) <= Math.abs(deltaY) * 1.2 ||
			swipeNavigating
		) {
			return;
		}

		const currentIndex =
			page.url.pathname === "/meals"
				? 1
				: page.url.pathname === "/shopping"
					? 2
					: 0;
		const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
		if (nextIndex < 0 || nextIndex >= navItems.length) return;

		const targetPath = new URL(
			resolve(navItems[nextIndex].href),
			window.location.href,
		).pathname;
		swipeDirection = deltaX < 0 ? 1 : -1;
		swipeTargetPath = targetPath;
		swipeNavigating = true;
		try {
			await goto(resolve(navItems[nextIndex].href));
		} finally {
			swipeNavigating = false;
			if (page.url.pathname !== targetPath) {
				clearSwipeTransition();
			}
		}
	}

	function onSwipePointercancel(): void {
		swipeState = null;
	}

	function clearSwipeTransition(): void {
		swipeDirection = 0;
		swipeTargetPath = null;
		if (browser) delete document.documentElement.dataset.viewTransitionDirection;
	}

	onNavigate((navigation) => {
		const targetMatches =
			swipeDirection !== 0 &&
			swipeTargetPath === navigation.to?.url.pathname;
		if (!targetMatches) {
			if (swipeDirection !== 0) clearSwipeTransition();
			return;
		}

		if (reducedMotion.current) {
			clearSwipeTransition();
			return;
		}

		const viewTransitionDocument = document as ViewTransitionDocument;
		if (!viewTransitionDocument.startViewTransition) {
			clearSwipeTransition();
			return;
		}

		document.documentElement.dataset.viewTransitionDirection =
			swipeDirection === 1 ? "next" : "previous";
		return new Promise<void>((resolve) => {
			try {
				const transition = viewTransitionDocument.startViewTransition?.(
					async () => {
						resolve();
						await navigation.complete;
					},
				);
				if (transition) {
					void transition.finished.then(clearSwipeTransition, clearSwipeTransition);
				} else {
					clearSwipeTransition();
					resolve();
				}
			} catch {
				clearSwipeTransition();
				resolve();
			}
		});
	});

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<svelte:window onkeydown={onKeydown} />
<svelte:document
	onpointerdown={onSwipePointerdown}
	onpointermove={onSwipePointermove}
	onpointerup={onSwipePointerup}
	onpointercancel={onSwipePointercancel}
/>

{#if session.session && householdQuery.data === undefined && !householdQuery.error}
	<div class="app">
		<div class="content">
			<main class="splash">
				<div class="flex w-full max-w-xs flex-col gap-3">
					<Skeleton class="h-4 w-3/4" />
					<Skeleton class="h-4 w-full" />
					<Skeleton class="h-4 w-5/6" />
				</div>
			</main>
		</div>
	</div>
{:else if householdQuery.error}
	<div class="app">
		<div class="content">
			<main class="splash"
				><p role="alert" class="text-sm text-destructive">
					Couldn't reach the database. Check your connection and
					reload.
				</p></main
			>
		</div>
	</div>
{:else}
	<div class="app">
		<div class="content">
			<Popover.Root
				bind:open={profileOpen}
				onOpenChange={handleProfileOpenChange}
			>
			<header class="top-bar">
			<a
				class="top-bar-brand"
				href={resolve(
					prefs.desktopDashboard && wideScreen.current
						? "/dashboard"
						: "/#planner",
				)}
				aria-label={prefs.desktopDashboard && wideScreen.current
					? "Go to dashboard"
					: "Go to planner"}
			>
				<span class="mobile-mark"><Icon name="utensils" size={15} /></span>
				<strong>Meal Planner</strong>
			</a>
			{#if !(prefs.desktopDashboard && wideScreen.current)}
				<nav class="primary-nav" aria-label="Primary">
					{#each navItems as item (item.id)}
						<Button
							variant={activeSection === item.id ? "secondary" : "ghost"}
							size="sm"
							href={resolve(item.href)}
							aria-current={activeSection === item.id ? "page" : undefined}
						>
							<Icon name={item.icon} size={16} dataIcon="inline-start" /><span
								>{item.label}</span
							>
						</Button>
					{/each}
				</nav>
			{/if}
			<div class="top-bar-actions">
				<Popover.Trigger>
					{#snippet child({ props })}
						<Button
							variant="outline"
							{...props}
							bind:ref={profileTrigger}
							class="max-w-[min(170px,20vw)] gap-[7px] rounded-full py-0 pr-2.5 pl-2 max-[360px]:size-[34px] max-[360px]:justify-center max-[360px]:p-0"
							aria-label={
								profileOpen ? "Close profile menu" : `Open profile menu for ${selfName()}`
							}
							title={`Profile: ${selfName()}`}
							aria-haspopup="dialog"
							aria-controls="profile-menu"
							aria-expanded={profileOpen}
						>
							<Avatar.Root class="size-6">
								<Avatar.Fallback class="text-[10px]">
									{selfName().charAt(0).toUpperCase() || "M"}
								</Avatar.Fallback>
							</Avatar.Root>
							<span class="min-w-0 truncate text-[11px] font-bold max-[360px]:hidden">{selfName()}</span>
						</Button>
					{/snippet}
				</Popover.Trigger>
			</div>
		</header>
			<Popover.Content
				id="profile-menu"
				bind:ref={profileMenu}
				data-no-swipe
				align="end"
				sideOffset={8}
				aria-label={profileView === "profile" ? "Profile menu" : "Preferences"}
				class="max-h-[calc(100vh-70px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto overscroll-contain"
			>
				{#if profileView === "profile"}
					<h2 id="profile-heading" class="font-serif text-[18px] tracking-[-0.03em]">
						Profile
					</h2>
					{#if householdQuery.data}
					<div class="grid gap-2">
						<div class="grid gap-0.5">
							<span class="text-[10px] font-bold text-muted-foreground">Household</span>
							<strong class="text-[13px] [overflow-wrap:anywhere]">{householdQuery.data.household.name}</strong>
						</div>
						<Button
							variant="outline"
							class="h-auto w-full justify-between py-2"
							aria-label={`Copy invite code ${householdQuery.data.household.inviteCode}`}
							onclick={() =>
								copyInviteCode(
									householdQuery.data?.household.inviteCode ?? "",
								)}
						>
							<span class="font-mono text-sm font-extrabold tracking-[0.2em]"
								>{householdQuery.data.household.inviteCode}</span
							>
							<span class="text-[11px] font-extrabold text-primary"
								>{copied ? "Copied!" : "Copy invite"}</span
							>
						</Button>
						<ul class="m-0 grid list-none gap-1.5 p-0">
							{#each householdQuery.data.members as member, i (member._id)}
								<li class="flex min-w-0 items-center gap-2 text-xs font-semibold">
									<span
										class="size-2.5 shrink-0 rounded-full"
										style={`background: ${memberColors[i % memberColors.length]}`}
									></span>
									<span class="min-w-0 flex-1 truncate">{member.name}</span>
									{#if member._id === session.session?.memberId}
										<Badge variant="secondary">You</Badge>
									{/if}
								</li>
							{/each}
						</ul>
						<div class="grid gap-2">
							{#if householdForm === null}
								<Button
									variant="outline"
									class="w-full"
									onclick={() => openHouseholdForm("create")}
								>New family group</Button
								>
								<Button
									variant="outline"
									class="w-full"
									onclick={() => openHouseholdForm("join")}
								>Join with code</Button
								>
							{:else}
								<form onsubmit={submitHouseholdForm} class="grid gap-2.5">
									{#if householdForm === "create"}
										<label
											for="profile-group-name"
											class="grid gap-1 text-[10px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase"
											>Group name<Input
												id="profile-group-name"
												bind:value={newHouseholdName}
												required
												maxlength={40}
												placeholder="The Rivera Kitchen"
												autocomplete="off"
											/></label
										>
									{:else}
										<label
											for="profile-join-code"
											class="grid gap-1 text-[10px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase"
											>Invite code<Input
												id="profile-join-code"
												bind:value={joinCode}
												required
												maxlength={6}
												placeholder="ABC123"
												autocomplete="off"
												autocapitalize="characters"
												class="uppercase [letter-spacing:0.2em]"
											/></label
										>
										<label
											for="profile-join-name"
											class="grid gap-1 text-[10px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase"
											>Your name<Input
												id="profile-join-name"
												bind:value={joinName}
												maxlength={40}
												placeholder={selfName()}
												autocomplete="given-name"
											/></label
										>
									{/if}
									{#if householdError}
										<p class="m-0 text-[11px] font-semibold text-destructive" role="alert">
											{householdError}
										</p>
									{/if}
									<div class="flex gap-2">
										<Button type="submit" class="flex-1">
											{householdForm === "create"
												? "Create & switch"
												: "Join"}
										</Button>
										<Button
											variant="outline"
											onclick={() => (householdForm = null)}
										>Cancel</Button
										>
									</div>
								</form>
							{/if}
						</div>
						{#if confirmingLeave}
							<div class="grid gap-2 pt-1" role="alert">
								<p class="m-0 text-[11px] leading-relaxed text-muted-foreground">
									Leaving removes your meal plan. If you're the last member, this
									household and its data will be deleted.
								</p>
								{#if leaveError}
									<p class="m-0 text-[11px] font-semibold text-destructive">{leaveError}</p>
								{/if}
								<div class="grid grid-cols-2 gap-2">
									<Button
										variant="outline"
										disabled={leaving}
										onclick={() => {
											confirmingLeave = false;
											leaveError = "";
										}}>Keep household</Button
									>
									<Button
										variant="destructive"
										disabled={leaving}
										onclick={leave}>{leaving ? "Leaving…" : "Leave"}</Button
									>
								</div>
							</div>
						{:else}
							<Button
								variant="ghost"
								size="sm"
								class="justify-start px-0 text-[11px] text-muted-foreground"
								onclick={() => {
									confirmingLeave = true;
									leaveError = "";
								}}>Leave household</Button
							>
						{/if}
					</div>
					{/if}
					<Separator />
					<Button
						variant="outline"
						class="w-full justify-between"
						onclick={openPreferences}
					>
						<Icon name="spark" size={15} dataIcon="inline-start" />
						<span class="flex-1 text-left">Preferences</span>
						<span class="grid -rotate-90 text-muted-foreground"
							><Icon name="chevron-down" size={14} /></span
						>
					</Button>
				{:else}
					<Button
						variant="ghost"
						size="sm"
						bind:ref={profileBackTrigger}
						class="justify-start px-1"
						onclick={showProfileView}
					>
						<span class="grid rotate-90"><Icon name="chevron-down" size={14} /></span>
						<span>Back to profile</span>
					</Button>
					<h2 id="preferences-heading" class="font-serif text-[18px] tracking-[-0.03em]">
						Preferences
					</h2>
					<div class="flex flex-col gap-4">
						<div class="grid gap-2">
							<span class="text-[10px] font-bold text-muted-foreground" id="preferences-appearance-label"
								>Appearance</span
							>
							<ToggleGroup.Root
								type="single"
								variant="outline"
								value={theme}
								aria-label="Appearance"
								onValueChange={(value) => {
									if (value === "system" || value === "light" || value === "dark") {
										setTheme(value);
									}
								}}
							>
								{#each themeOptions as option (option.id)}
									<ToggleGroup.Item value={option.id} aria-label={option.label}>
										{option.label}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
						</div>
						{#if !wideScreen.current}
							<div class="grid gap-2">
								<span class="text-[10px] font-bold text-muted-foreground" id="preferences-planner-label"
									>Mobile planner view</span
								>
								<ToggleGroup.Root
									type="single"
									variant="outline"
									value={plannerView.view}
									aria-label="Mobile planner view"
									onValueChange={(value) => {
										if (value === "day" || value === "week") {
											plannerView.set(value);
										}
									}}
								>
									<ToggleGroup.Item value="day" aria-label="Day">Day</ToggleGroup.Item>
									<ToggleGroup.Item value="week" aria-label="Week">Week</ToggleGroup.Item>
								</ToggleGroup.Root>
							</div>
						{/if}
						{#if wideScreen.current}
							<div class="grid gap-2">
								<span class="text-[10px] font-bold text-muted-foreground" id="preferences-layout-label"
									>Desktop layout</span
								>
								<ToggleGroup.Root
									type="single"
									variant="outline"
									value={prefs.desktopDashboard ? "dashboard" : "pages"}
									aria-label="Desktop layout"
									onValueChange={(value) => {
										if (value === "dashboard") void setDesktopLayout(true);
										else if (value === "pages") void setDesktopLayout(false);
									}}
								>
									<ToggleGroup.Item value="pages" aria-label="Pages">Pages</ToggleGroup.Item>
									<ToggleGroup.Item value="dashboard" aria-label="Dashboard">Dashboard</ToggleGroup.Item>
								</ToggleGroup.Root>
							</div>
						{/if}
					</div>
				{/if}
			</Popover.Content>
		</Popover.Root>

		<div class="page-transition-shell">
			{@render children()}
		</div>
		<TabBar active={activeSection} />
		<Toaster position="bottom-center" offset={{ bottom: "84px" }} theme={theme} />
	</div>
	</div>
{/if}

<style>
	.splash {
		display: grid;
		place-items: center;
		min-height: 60vh;
	}
	.app {
		min-height: 100vh;
		--mobile-tab-bar-height: 64px;
	}
	.content {
		min-width: 0;
		padding-bottom: env(safe-area-inset-bottom);
	}
	.page-transition-shell {
		position: relative;
		overflow-x: clip;
		view-transition-name: route-content;
	}
	:global(html[data-view-transition-direction="next"]::view-transition-old(route-content)) {
		animation: route-content-old-next 200ms ease both;
	}
	:global(html[data-view-transition-direction="next"]::view-transition-new(route-content)) {
		animation: route-content-new-next 200ms ease both;
	}
	:global(html[data-view-transition-direction="previous"]::view-transition-old(route-content)) {
		animation: route-content-old-previous 200ms ease both;
	}
	:global(html[data-view-transition-direction="previous"]::view-transition-new(route-content)) {
		animation: route-content-new-previous 200ms ease both;
	}
	@keyframes route-content-old-next {
		to {
			transform: translateX(-64px);
			opacity: 0;
		}
	}
	@keyframes route-content-new-next {
		from {
			transform: translateX(64px);
			opacity: 0;
		}
	}
	@keyframes route-content-old-previous {
		to {
			transform: translateX(64px);
			opacity: 0;
		}
	}
	@keyframes route-content-new-previous {
		from {
			transform: translateX(-64px);
			opacity: 0;
		}
	}
	.top-bar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--background) 96%, transparent);
		backdrop-filter: blur(10px);
	}
	.top-bar-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}
	.top-bar-brand {
		display: flex;
		align-items: center;
		gap: 9px;
		color: inherit;
		text-decoration: none;
	}
	.top-bar-brand strong {
		font-family: Georgia, "Times New Roman", serif;
		font-size: 20px;
		letter-spacing: -0.04em;
	}
	.mobile-mark {
		display: grid;
		width: 32px;
		height: 32px;
		place-items: center;
	}
	.primary-nav {
		display: none;
		align-items: center;
		gap: 4px;
		margin-left: 18px;
	}
	@media (min-width: 1024px) {
		.content {
			padding-bottom: 0;
		}
		.primary-nav {
			display: flex;
		}
	}
	@media (max-width: 1023px) {
		.app {
			touch-action: pan-y;
		}
		.content {
			touch-action: pan-y;
		}
	}
</style>
