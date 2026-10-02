<script lang="ts">
	import "./layout.css";
	import { MonitorCogIcon } from "@lucide/svelte";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import LogInIcon from "@lucide/svelte/icons/log-in";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import UserIcon from "@lucide/svelte/icons/user";
	import UtensilsIcon from "@lucide/svelte/icons/utensils";
	import {
		setupConvexAuth,
		useAuth,
	} from "@mmailaender/convex-auth-svelte/svelte";
	import { setupConvex, useMutation, useQuery } from "convex-svelte";
	import { tick } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { browser } from "$app/environment";
	import { goto, onNavigate } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { PUBLIC_CONVEX_URL } from "$env/static/public";
	import favicon from "$lib/assets/favicon.svg";
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
	import { themeStore } from "$lib/stores/theme.svelte.js";
	import { activeNavId, navItems, swipeTarget } from "$lib/utils/nav.js";
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

	type ViewTransitionDocument = Document & {
		startViewTransition?: (updateCallback: () => void | Promise<void>) => {
			finished: Promise<unknown>;
		};
	};

	// Mirror the resolved scheme onto <html> for CSS and native controls.
	// `themeStore` owns the choice, persistence, and system resolution.
	$effect(() => {
		if (!browser) return;
		themeStore.applyToDocument(document.documentElement);
	});

	let activeSection = $derived(activeNavId(page.url));

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

	const householdQuery = useQuery(api.households.get, () => {
		const current = session.session;
		return current
			? {
					householdId: current.householdId as Id<"households">,
					callerMemberId: current.memberId as Id<"householdMembers">,
				}
			: "skip";
	});
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
			const result = await auth.signIn("google", {
				// Return to wherever the flow started so sign-in works
				// from any allowlisted origin, not just SITE_URL.
				redirectTo: window.location.href,
			});
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

	// Single household per user: no roster, no switching. The session
	// reference is the whole story — everything else derives from it.
	// myMemberships still matters for one case: a signed-in user on a new
	// device joins their first membership instead of provisioning a
	// duplicate solo kitchen.
	$effect(() => {
		if (session.session || signingOut) return;
		if (auth.isLoading) return;
		if (auth.isAuthenticated) {
			if (membershipsQuery.data === undefined) return;
			const first = membershipsQuery.data[0];
			if (first) {
				session.connect({
					householdId: first.householdId,
					memberId: first.memberId,
				});
				return;
			}
		}
	});

	// Claiming links the session member row to the sign-in (and backfills
	// portable meals/skips). One attempt per session identity; failures
	// unlatch with backoff so a later tick retries once auth settles.
	// Bounded retries for a claim that fails or hits a stale token: token
	// propagation settles in seconds, so a few backed-off attempts cover
	// it without hammering the server forever. Plain let — no effect
	// reads it, so it needs no reactivity.
	let claimAttempts = 0;
	let claimKey: string | null = null;
	const CLAIM_RETRY_DELAYS = [3000, 7000, 15000, 30000];

	function scheduleClaimRetry(): void {
		if (claimAttempts >= CLAIM_RETRY_DELAYS.length) return;
		const delay = CLAIM_RETRY_DELAYS[claimAttempts] ?? 30000;
		claimAttempts += 1;
		setTimeout(() => {
			claimKey = null;
		}, delay);
	}
	$effect(() => {
		if (!auth.isAuthenticated || signingOut) return;
		const current = session.session;
		if (!current) return;
		const key = `${current.householdId}:${current.memberId}`;
		if (claimKey === key) return;
		claimKey = key;
		claimHouseholds({
			refs: [
				{
					householdId: current.householdId as Id<"households">,
					memberId: current.memberId as Id<"householdMembers">,
				},
			],
		}).then(
			(result) => {
				// Stale token beat the refresh (the server reports this
				// explicitly via signedIn: false instead of throwing):
				// unlatch with backoff so a later tick retries once auth
				// settles.
				if (!result.signedIn) scheduleClaimRetry();
			},
			() => scheduleClaimRetry(),
		);
	});

	// First visit lands straight in the planner with a personal household.
	// A linked-but-deleted household resets the same way. A lock plus a
	// storage listener keeps two tabs opened at once from each provisioning.
	let provisionTick = $state(0);
	$effect(() => {
		provisionTick;
		if (!browser || session.session || signingOut) return;
		// Wait for auth to resolve: anonymous visitors provision as
		// before, but signed-in users without memberships provision only
		// once the membership check above runs first.
		if (auth.isLoading) return;
		if (auth.isAuthenticated && membershipsQuery.data === undefined) return;
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
				memberName: deviceName(),
				autoNamed: true,
			})
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
			// Linked household is gone: disconnect to provision a fresh one.
			session.disconnect();
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

		const direction = deltaX < 0 ? 1 : -1;
		const targetHref = swipeTarget(page.url.pathname, direction);
		if (!targetHref) return;

		const targetPath = new URL(
			resolve(targetHref),
			window.location.href,
		).pathname;
		swipeDirection = direction;
		swipeTargetPath = targetPath;
		swipeNavigating = true;
		try {
			await goto(resolve(targetHref));
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
				<span role="alert" class="text-sm text-destructive">
					Couldn't load your data. Check your connection and reload.
				</span>
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
										Profile
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
					position={wideScreen.current
						? "bottom-center"
						: "top-center"}
					offset={wideScreen.current
						? { bottom: "32px" }
						: { top: "calc(env(safe-area-inset-top) + 68px)" }}
					theme={themeStore.theme}
				/>
			</div>
		</div>
	</div>
{/if}
