<script lang="ts">
	import "./layout.css";
	import UtensilsIcon from "@lucide/svelte/icons/utensils";
	import {
		setupConvexAuth,
		useAuth,
	} from "@mmailaender/convex-auth-svelte/svelte";
	import { setupConvex } from "convex-svelte";
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
	import { SessionLifecycle } from "$lib/shell/session-lifecycle.svelte.js";
	import { SwipeNavigation } from "$lib/shell/swipe-navigation.svelte.js";
	import { prefs } from "$lib/stores/prefs.svelte.js";
	import {
		deviceName,
		session,
	} from "$lib/stores/session.svelte.js";
	import { themeStore } from "$lib/stores/theme.svelte.js";
	import { activeNavId, navItems } from "$lib/utils/nav.js";
	import { cn } from "$lib/utils.js";

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

	// Owns the household query plus the four effects that decide which
	// household the session points at. Both callbacks are passed by
	// reference so the effects track live state, never a snapshot.
	const lifecycle = new SessionLifecycle(auth, () => signingOut);
	let selfName = $derived(selfMember()?.name ?? deviceName());
	let selfImage = $derived(selfMember()?.image ?? null);
	function selfMember() {
		return (
			lifecycle.members?.find(
				(member) => member._id === session.session?.memberId,
			) ?? null
		);
	}


	// Mirror the resolved scheme onto <html> for CSS and native controls.
	// `themeStore` owns the choice, persistence, and system resolution.
	$effect(() => {
		if (!browser) return;
		themeStore.applyToDocument(document.documentElement);
	});

	let activeSection = $derived(activeNavId(page.url));

	const wideScreen = new MediaQuery("(min-width: 1024px)", false);

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

</script>


<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<svelte:document
	onpointerdown={(event) => swipe.onPointerdown(event)}
	onpointermove={(event) => swipe.onPointermove(event)}
	onpointerup={(event) => void swipe.onPointerup(event)}
	onpointercancel={() => swipe.onPointercancel()}
/>

{#if session.session && lifecycle.loading && !lifecycle.error}
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
{:else if lifecycle.error}
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
							name={selfName}
							image={selfImage}
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
