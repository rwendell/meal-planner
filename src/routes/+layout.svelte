<script lang="ts">
	import "./layout.css";
	import UtensilsIcon from "@lucide/svelte/icons/utensils";
	import {
		setupConvexAuth,
		useAuth,
	} from "@mmailaender/convex-auth-svelte/svelte";
	import { setupConvex, useMutation, useQuery } from "convex-svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { browser } from "$app/environment";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { PUBLIC_CONVEX_URL } from "$env/static/public";
	import favicon from "$lib/assets/favicon.svg";
	import TabBar from "$lib/components/TabBar.svelte";
	import * as NavigationMenu from "$lib/components/ui/navigation-menu";
	import { navigationMenuTriggerStyle } from "$lib/components/ui/navigation-menu/navigation-menu-trigger.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Toaster } from "$lib/components/ui/sonner";
	import ProfileMenu from "$lib/shell/ProfileMenu.svelte";
	import { SwipeNavigation } from "$lib/shell/swipe-navigation.svelte.js";
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
	import { activeNavId, navItems } from "$lib/utils/nav.js";
	import { cn } from "$lib/utils.js";
	import { api } from "../convex/_generated/api.js";
	import type { Id } from "../convex/_generated/dataModel";

	setupConvex(PUBLIC_CONVEX_URL);

	let { children } = $props();

	const swipe = new SwipeNavigation();

	// Client-only auth: talks to Convex actions directly. Reuses the
	// setupConvex() client from context; tokens attach to the same
	// client useQuery/useMutation already use.
	setupConvexAuth({ convexUrl: PUBLIC_CONVEX_URL });
	// Registers the router hook that drives directional view transitions
	// for swipe-initiated navigation. Must run during init.
	swipe.attach();
	const auth = useAuth();


	// Mirror the resolved scheme onto <html> for CSS and native controls.
	// `themeStore` owns the choice, persistence, and system resolution.
	$effect(() => {
		if (!browser) return;
		themeStore.applyToDocument(document.documentElement);
	});

	let activeSection = $derived(activeNavId(page.url));

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
		// The menu closes itself before calling this. Local first so the
		// UI flips instantly; the server cleanup finishing a moment later
		// doesn't matter.
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

</script>


<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<svelte:document
	onpointerdown={(event) => swipe.onPointerdown(event)}
	onpointermove={(event) => swipe.onPointermove(event)}
	onpointerup={(event) => void swipe.onPointerup(event)}
	onpointercancel={() => swipe.onPointercancel()}
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
						<ProfileMenu
							name={selfName()}
							image={selfImage()}
							members={householdQuery.data?.members ?? null}
							myMemberId={session.session?.memberId ?? null}
							wideScreen={wideScreen.current}
							isAuthenticated={auth.isAuthenticated}
							authLoading={auth.isLoading}
							signingIn={signingIn}
							onSignIn={() => void handleSignIn()}
							onSignOut={handleSignOut}
						/>
					</div>
				</header>

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
