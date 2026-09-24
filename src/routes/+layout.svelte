<script lang="ts">
	import "./layout.css";
	import { MonitorCogIcon } from "@lucide/svelte";
	import BookIcon from "@lucide/svelte/icons/book";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import LogInIcon from "@lucide/svelte/icons/log-in";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";
	import UserIcon from "@lucide/svelte/icons/user";
	import UtensilsIcon from "@lucide/svelte/icons/utensils";
	import {
		setupConvexAuth,
		useAuth,
	} from "@mmailaender/convex-auth-svelte/svelte";
	import { setupConvex, useMutation, useQuery } from "convex-svelte";
	import type { Component } from "svelte";
	import { tick } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { browser } from "$app/environment";
	import { goto, onNavigate } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { PUBLIC_CONVEX_URL } from "$env/static/public";
	import favicon from "$lib/assets/favicon.svg";
	import InviteCode from "$lib/components/InviteCode.svelte";
	import MemberAvatar from "$lib/components/MemberAvatar.svelte";
	import TabBar from "$lib/components/TabBar.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as NavigationMenu from "$lib/components/ui/navigation-menu";
	import { navigationMenuTriggerStyle } from "$lib/components/ui/navigation-menu/navigation-menu-trigger.svelte";
	import * as Popover from "$lib/components/ui/popover";
	import { Separator } from "$lib/components/ui/separator";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Toaster } from "$lib/components/ui/sonner";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { roster } from "$lib/stores/households.svelte.js";
	import { plannerView } from "$lib/stores/planner-view.svelte.js";
	import { prefs } from "$lib/stores/prefs.svelte.js";
	import {
		clearProvisioningLock,
		deviceName,
		provisioningLockAge,
		STORAGE_KEY,
		session,
		setProvisioningLock,
	} from "$lib/stores/session.svelte.js";
	import { memberColor } from "$lib/utils/members.js";
	import { cn } from "$lib/utils.js";
	import { api } from "../convex/_generated/api.js";
	import type { Id } from "../convex/_generated/dataModel";

	setupConvex(PUBLIC_CONVEX_URL);

	let { children } = $props();

	// Client-only auth: talks to Convex actions directly. Reuses the
	// setupConvex() client from context; tokens attach to the same
	// client useQuery/useMutation already use.
	setupConvexAuth({ convexUrl: PUBLIC_CONVEX_URL });
	const auth = useAuth();

	interface NavItem {
		id: string;
		label: string;
		Icon: Component;
		href: "/#planner" | "/cookbook" | "/shopping";
	}

	type ViewTransitionDocument = Document & {
		startViewTransition?: (
			updateCallback: () => void | Promise<void>,
		) => { finished: Promise<unknown> };
	};

	const navItems: NavItem[] = [
		{
			id: "planner",
			label: "Planner",
			Icon: CalendarIcon,
			href: "/#planner",
		},
		{ id: "meals", label: "Cookbook", Icon: BookIcon, href: "/cookbook" },
		{
			id: "shopping",
			label: "Shopping list",
			Icon: ShoppingCartIcon,
			href: "/shopping",
		},
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
		page.url.pathname === "/cookbook"
			? "meals"
			: page.url.pathname === "/shopping"
				? "shopping"
				: page.url.pathname === "/profile"
					? "profile"
					: page.url.hash
						? page.url.hash.slice(1)
						: "planner",
	);

	let profileOpen = $state(false);
	type ProfileView = "profile" | "preferences";
	let profileView = $state<ProfileView>("profile");
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
	const reducedMotion = new MediaQuery(
		"(prefers-reduced-motion: reduce)",
		false,
	);
	const wideScreen = new MediaQuery("(min-width: 1024px)", false);

	const householdQuery = useQuery(api.households.get, () =>
		session.session
			? { householdId: session.session.householdId as Id<"households"> }
			: "skip",
	);
	const createHousehold = useMutation(api.households.create);
	const membershipsQuery = useQuery(api.households.myMemberships, () =>
		!auth.isLoading && auth.isAuthenticated ? {} : "skip",
	);
	const claimHouseholds = useMutation(api.households.claimHouseholds);
	let signingIn = $state(false);

	// Set on explicit sign-out for the rest of the page lifecycle.
	// The token clear races these effects: without the guard, cached
	// memberships plus a still-valid token resurrect the old session
	// before sign-out lands. It also blocks auto-provision, so signing
	// out is a clean slate instead of spawning an empty kitchen.
	// (Re-sign-in always reloads via Google, resetting lifecycle state.)
	let signingOut = $state(false);

	async function handleSignIn(): Promise<void> {
		signingIn = true;
		try {
			const result = await auth.signIn("google");
			// OAuth navigates away: keep spinning until the page unloads.
			// Only reset when no redirect happened.
			if (!result.redirect) signingIn = false;
		} catch {
			signingIn = false;
		}
	}

	function handleSignOut(): void {
		closeProfileMenu();
		// Local first so the UI flips instantly; the server cleanup
		// finishing a moment later doesn't matter.
		signingOut = true;
		session.disconnect();
		void auth.signOut().catch(() => {});
	}

	// Signed-in kitchens reconcile into the local roster, so every
	// membership — not just the active one — survives a new device.
	// mergeServerMemberships is idempotent: the effect converges
	// instead of retriggering itself.
	$effect(() => {
		const memberships = membershipsQuery.data;
		if (!memberships || !auth.isAuthenticated || signingOut) return;
		roster.mergeServerMemberships(
			memberships.map((membership) => ({
				householdId: membership.householdId,
				memberId: membership.memberId,
			})),
		);
		if (!session.session && memberships[0]) {
			roster.switchTo({
				householdId: memberships[0].householdId,
				memberId: memberships[0].memberId,
			});
		}
	});

	// One-time migration: link this device's roster rows to the sign-in.
	// Re-arms when the membership set changes (stale-token miss,
	// re-sign-in): claiming only ever grows that set, so this converges
	// instead of looping.
	let claimAttempted = $state(false);
	let lastMembershipsKey = $state<string | null>(null);
	$effect(() => {
		if (membershipsQuery.data === undefined) return;
		const key = membershipsQuery.data
			.map((m) => `${m.householdId}:${m.memberId}`)
			.sort()
			.join(",");
		if (lastMembershipsKey !== key) {
			lastMembershipsKey = key;
			claimAttempted = false;
		}
	});
	$effect(() => {
		if (!auth.isAuthenticated || claimAttempted || signingOut) return;
		const memberships = membershipsQuery.data;
		if (memberships === undefined || roster.refs.length === 0) {
			return;
		}
		const linked = new Set(
			memberships.map((m) => `${m.householdId}:${m.memberId}`),
		);
		if (
			!roster.refs.some(
				(ref) => !linked.has(`${ref.householdId}:${ref.memberId}`),
			)
		) {
			claimAttempted = true;
			return;
		}
		claimAttempted = true;
		claimHouseholds({
			refs: roster.refs.map((ref) => ({
				householdId: ref.householdId as Id<"households">,
				memberId: ref.memberId as Id<"householdMembers">,
			})),
		}).catch(() => {});
	});

	// First visit lands straight in the planner with a personal household.
	// A linked-but-deleted household resets the same way. A lock plus a
	// storage listener keeps two tabs opened at once from each provisioning.
	let provisionTick = $state(0);
	$effect(() => {
		provisionTick;
		if (!browser || session.session || signingOut) return;
		// Wait for auth to resolve: anonymous visitors provision as
		// before, but signed-in users provision only when no membership
		// exists anywhere (claim/reconcile effects run first).
		if (auth.isLoading) return;
		if (auth.isAuthenticated) {
			if (membershipsQuery.data === undefined) return;
			if (membershipsQuery.data.length > 0 || roster.refs.length > 0) {
				return;
			}
		}
		// Anonymous with known kitchens rejoins the first instead of
		// spawning a new one every reload (e.g. after sign-out). Only a
		// true first visit provisions.
		const known = roster.refs[0];
		if (known) {
			roster.switchTo(known);
			return;
		}
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
			createHousehold({
				householdName: "My Kitchen",
				memberName: deviceName(),
				autoNamed: true,
			})
				.then((result) => {
					roster.switchTo({
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
			// Linked household is gone: fall through to the next known
			// kitchen, or disconnect to provision a fresh one.
			roster.forget(session.session.householdId);
		}
	});

	function selfMember() {
		return (
			householdQuery.data?.members.find(
				(member) => member._id === session.session?.memberId,
			) ?? null
		);
	}

	function selfName(): string {
		return selfMember()?.name ?? deviceName();
	}

	function selfImage(): string | null {
		return selfMember()?.image ?? null;
	}

	const profileFocusableSelector =
		'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

	async function focusProfileMenu(): Promise<void> {
		// Only called when the menu is open or opening; no open-state guard
		// so focus can't be skipped by bind:open propagation timing.
		await tick();
		profileMenu
			?.querySelector<HTMLElement>(profileFocusableSelector)
			?.focus();
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
			page.url.pathname === "/cookbook"
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
		if (browser)
			delete document.documentElement.dataset.viewTransitionDirection;
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
					void transition.finished.then(
						clearSwipeTransition,
						clearSwipeTransition,
					);
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
	<div class="min-h-screen max-lg:[touch-action:pan-y]">
		<div
			class="min-w-0 pb-[env(safe-area-inset-bottom)] max-lg:[touch-action:pan-y] lg:pb-0"
		>
			<main class="grid min-h-[60vh] place-items-center">
				<div class="flex w-full max-w-xs flex-col gap-3">
					<Skeleton class="h-4 w-3/4" />
					<Skeleton class="h-4 w-full" />
					<Skeleton class="h-4 w-5/6" />
				</div>
			</main>
		</div>
	</div>
{:else if householdQuery.error}
	<div class="min-h-screen max-lg:[touch-action:pan-y]">
		<div
			class="min-w-0 pb-[env(safe-area-inset-bottom)] max-lg:[touch-action:pan-y] lg:pb-0"
		>
			<main class="grid min-h-[60vh] place-items-center">
				<p role="alert" class="text-sm text-destructive">
					Couldn't load your data. Check your connection and
					reload.
				</p>
			</main>
		</div>
	</div>
{:else}
	<div class="min-h-screen max-lg:[touch-action:pan-y]">
		<div
			class="min-w-0 pb-[env(safe-area-inset-bottom)] max-lg:[touch-action:pan-y] lg:pb-0"
		>
			<Popover.Root
				bind:open={profileOpen}
				onOpenChange={handleProfileOpenChange}
			>
				<header
					class="sticky top-0 z-10 flex items-center justify-start gap-2.5 border-b border-border bg-[color-mix(in_srgb,var(--background)_96%,transparent)] px-4 py-3 backdrop-blur-[10px] print:hidden"
				>
					<a
						class="flex items-center gap-[9px] text-inherit no-underline"
						href={resolve(
							prefs.desktopDashboard && wideScreen.current
								? "/dashboard"
								: "/#planner",
						)}
						aria-label={prefs.desktopDashboard && wideScreen.current
							? "Go to dashboard"
							: "Go to planner"}
					>
						<span class="grid size-8 place-items-center"
							><UtensilsIcon size={15} /></span
						>
						<strong class="font-serif text-xl tracking-[-0.04em]"
							>Meal Planner</strong
						>
					</a>
					{#if !(prefs.desktopDashboard && wideScreen.current)}
						<NavigationMenu.Root
							class="ml-4 hidden lg:flex"
							viewport={false}
							aria-label="Primary"
						>
							<NavigationMenu.List class="justify-start gap-1">
								{#each navItems as item (item.id)}
									<NavigationMenu.Item>
										<NavigationMenu.Link
											class={cn(
												navigationMenuTriggerStyle(),
												activeSection === item.id &&
													"bg-muted/50",
											)}
											href={resolve(item.href)}
											active={activeSection === item.id}
										>
											<item.Icon
												size={16}
												data-icon="inline-start"
											/><span>{item.label}</span>
										</NavigationMenu.Link>
									</NavigationMenu.Item>
								{/each}
							</NavigationMenu.List>
						</NavigationMenu.Root>
					{/if}
					<div class="ml-auto flex items-center gap-2">
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									variant="outline"
									{...props}
									bind:ref={profileTrigger}
									class="max-w-[min(170px,20vw)] gap-[7px] rounded-full py-0 pr-2.5 pl-2 max-[360px]:size-[34px] max-[360px]:justify-center max-[360px]:p-0"
									aria-label={profileOpen
										? "Close profile menu"
										: `Open profile menu for ${selfName()}`}
									title={`Profile: ${selfName()}`}
									aria-haspopup="dialog"
									aria-controls="profile-menu"
									aria-expanded={profileOpen}
								>
									<MemberAvatar
										name={selfName()}
										image={selfImage()}
										size="sm"
									/>
									<span
										class="min-w-0 truncate text-[11px] font-bold max-[360px]:hidden"
										>{selfName()}</span
									>
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
					aria-label={profileView === "profile"
						? "Profile menu"
						: "Preferences"}
					class="max-h-[calc(100vh-70px)] w-[min(360px,calc(100vw-24px))] overflow-y-auto overscroll-contain"
				>
					{#if profileView === "profile"}
						<div class="grid gap-4">
							<div class="flex items-start justify-between">
								<div>
									<h2
										id="profile-heading"
										class="font-serif text-[18px] tracking-[-0.03em] [overflow-wrap:anywhere]"
									>
										{householdQuery.data?.household.name ??
											"Profile"}
									</h2>
									<p
										class="m-0 text-xs text-muted-foreground"
									>
										{#if householdQuery.data}
											{householdQuery.data.members.length}
											{householdQuery.data.members
												.length === 1
												? "member"
												: "members"} in this household
										{:else}
											Your household and account settings
										{/if}
									</p>
								</div>
								{#if householdQuery.data}
									<section
										aria-label="Invite code"
										class="grid gap-2"
									>
										<InviteCode
											code={householdQuery.data.household
												.inviteCode}
										/>
									</section>
								{/if}
							</div>
							{#if householdQuery.data}
								<section
									aria-label="Members"
									class="grid gap-2"
								>
									<h3
										class="m-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
									>
										Members
									</h3>
									<ul class="m-0 grid list-none gap-1.5 p-0">
										{#each householdQuery.data.members as member (member._id)}
											<li
												class="flex min-w-0 items-center gap-2 text-[13px] font-medium"
											>
												<span
													class="size-2.5 shrink-0 rounded-full"
													style={`background: ${memberColor(householdQuery.data.members, member._id)}`}
													aria-hidden="true"
												></span>
												<span
													class="min-w-0 shrink truncate"
													>{member.name}</span
												>
												{#if member._id === session.session?.memberId}
													<Badge
														variant="secondary"
														class="shrink-0"
														>You</Badge
													>
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
									onclick={() => {
										closeProfileMenu();
										void goto(resolve("/profile"));
									}}
								>
									<UserIcon data-icon="inline-start" />
									<span class="flex-1 text-left">Profile</span
									>
									<span
										class="grid shrink-0 -rotate-90 text-muted-foreground"
										><ChevronDownIcon /></span
									>
								</Button>
								<Button
									variant="ghost"
									class="w-full justify-start gap-2 px-2"
									onclick={openPreferences}
								>
									<MonitorCogIcon data-icon="inline-start" />
									<span class="flex-1 text-left"
										>Display Preferences</span
									>
									<span
										class="grid shrink-0 -rotate-90 text-muted-foreground"
										><ChevronDownIcon /></span
									>
								</Button>
								{#if auth.isAuthenticated}
									<Button
										variant="ghost"
										class="w-full justify-start gap-2 px-2"
										onclick={() => void handleSignOut()}
									>
										<LogOutIcon data-icon="inline-start" />
										<span class="flex-1 text-left"
											>Sign out</span
										>
									</Button>
								{:else}
									<Button
										variant="ghost"
										class="w-full justify-start gap-2 px-2"
										disabled={auth.isLoading || signingIn}
										onclick={() => void handleSignIn()}
									>
										{#if signingIn}
											<LoaderCircleIcon
												data-icon="inline-start"
												class="animate-spin"
											/>
										{:else}
											<LogInIcon
												data-icon="inline-start"
											/>
										{/if}
										<span class="flex-1 text-left"
											>{signingIn
												? "Signing in…"
												: "Sign in with Google"}</span
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
									bind:ref={profileBackTrigger}
									class="w-fit justify-start px-1"
									onclick={showProfileView}
								>
									<span class="grid rotate-90"
										><ChevronDownIcon
											data-icon="inline-start"
										/></span
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
									<p
										class="m-0 text-xs text-muted-foreground"
									>
										Appearance and layout for this device.
									</p>
								</div>
							</div>
							<div class="grid gap-4">
								<section
									aria-label="Appearance"
									class="grid gap-2"
								>
									<h3
										class="m-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
									>
										Appearance
									</h3>
									<ToggleGroup.Root
										type="single"
										variant="outline"
										value={theme}
										class="w-full"
										aria-label="Appearance"
										onValueChange={(value) => {
											if (
												value === "system" ||
												value === "light" ||
												value === "dark"
											) {
												setTheme(value);
											}
										}}
									>
										{#each themeOptions as option (option.id)}
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
								{#if !wideScreen.current}
									<section
										aria-label="Mobile planner view"
										class="grid gap-2"
									>
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
												if (
													value === "day" ||
													value === "week"
												) {
													plannerView.set(value);
												}
											}}
										>
											<ToggleGroup.Item
												value="day"
												aria-label="Day"
												class="flex-1"
												>Day</ToggleGroup.Item
											>
											<ToggleGroup.Item
												value="week"
												aria-label="Week"
												class="flex-1"
												>Week</ToggleGroup.Item
											>
										</ToggleGroup.Root>
									</section>
								{/if}
								{#if wideScreen.current}
									<section
										aria-label="Desktop layout"
										class="grid gap-2"
									>
										<h3
											class="m-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
										>
											Desktop layout
										</h3>
										<ToggleGroup.Root
											type="single"
											variant="outline"
											value={prefs.desktopDashboard
												? "dashboard"
												: "pages"}
											class="w-full"
											aria-label="Desktop layout"
											onValueChange={(value) => {
												if (value === "dashboard")
													void setDesktopLayout(true);
												else if (value === "pages")
													void setDesktopLayout(
														false,
													);
											}}
										>
											<ToggleGroup.Item
												value="pages"
												aria-label="Pages"
												class="flex-1"
												>Pages</ToggleGroup.Item
											>
											<ToggleGroup.Item
												value="dashboard"
												aria-label="Dashboard"
												class="flex-1"
												>Dashboard</ToggleGroup.Item
											>
										</ToggleGroup.Root>
									</section>
								{/if}
							</div>
						</div>
					{/if}
				</Popover.Content>
			</Popover.Root>

			<div
				class="relative overflow-x-clip [view-transition-name:route-content]"
			>
				{@render children()}
			</div>
			<TabBar active={activeSection} />
			<div class="print:hidden">
				<Toaster
					position={wideScreen.current ? "bottom-center" : "top-center"}
					offset={wideScreen.current
						? { bottom: "32px" }
						: { top: "calc(env(safe-area-inset-top) + 68px)" }}
					{theme}
				/>
			</div>
		</div>
	</div>
{/if}
