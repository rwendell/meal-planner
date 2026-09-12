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

	$effect(() => {
		if (!browser) return;
		if (theme === "system") {
			delete document.documentElement.dataset.theme;
		} else {
			document.documentElement.dataset.theme = theme;
		}
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
	let profileMenu = $state<HTMLDivElement | undefined>(undefined);
	let profileTrigger = $state<HTMLButtonElement | undefined>(undefined);
	let swipeState = $state<{
		pointerId: number;
		startX: number;
		startY: number;
	} | null>(null);
	let swipeNavigating = false;
	let swipeDirection = $state<-1 | 0 | 1>(0);
	let swipeTargetPath = $state<string | null>(null);
	let profileBackTrigger = $state<HTMLButtonElement | undefined>(undefined);
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
		await tick();
		if (!profileOpen) return;
		profileMenu?.querySelector<HTMLElement>(profileFocusableSelector)?.focus();
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

	function toggleProfileMenu(): void {
		if (profileOpen) {
			closeProfileMenu();
		} else {
			profileView = "profile";
			profileOpen = true;
			void focusProfileMenu();
		}
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
			<main class="splash"><p>Loading your kitchen…</p></main>
		</div>
	</div>
{:else if householdQuery.error}
	<div class="app">
		<div class="content">
			<main class="splash"
				><p role="alert">
					Couldn't reach the database. Check your connection and
					reload.
				</p></main
			>
		</div>
	</div>
{:else}
	<div class="app">
		<div class="content">
			<header class="top-bar">
			<a
				class="top-bar-brand"
				href={resolve("/#planner")}
				aria-label="Go to planner"
			>
				<span class="mobile-mark"><Icon name="utensils" size={15} /></span>
				<strong>Meal Planner</strong>
			</a>
			{#if !(prefs.desktopDashboard && wideScreen.current)}
				<nav class="primary-nav" aria-label="Primary">
					{#each navItems as item (item.id)}
						<a
							href={resolve(item.href)}
							class:active={activeSection === item.id}
							aria-current={activeSection === item.id ? "page" : undefined}
						>
							<Icon name={item.icon} size={16} /><span>{item.label}</span>
						</a>
					{/each}
				</nav>
			{/if}
			<div class="top-bar-actions">
				<button
					type="button"
					class="profile-trigger"
					bind:this={profileTrigger}
					aria-label={
						profileOpen ? "Close profile menu" : `Open profile menu for ${selfName()}`
					}
					title={`Profile: ${selfName()}`}
					aria-haspopup="dialog"
					aria-controls="profile-menu"
					aria-expanded={profileOpen}
					onclick={toggleProfileMenu}
				>
					<Icon name="user" size={17} />
					<span class="profile-trigger-name">{selfName()}</span>
				</button>
			</div>
		</header>
		{#if profileOpen}
			<button
				type="button"
				class="profile-backdrop"
				data-no-swipe
				aria-label="Close profile menu"
				tabindex="-1"
				onclick={closeProfileMenu}
			></button>
			<div
				id="profile-menu"
				bind:this={profileMenu}
				class="profile-menu"
				data-no-swipe
				role="dialog"
				aria-modal="true"
				aria-labelledby={profileView === "profile" ? "profile-heading" : "preferences-heading"}
			>
				{#if profileView === "profile"}
					<h2 id="profile-heading" class="profile-heading">Profile</h2>
					{#if householdQuery.data}
					<div class="profile-section">
						<div class="section-heading">
							<span class="setting-title">Household</span>
							<strong class="household-name">{householdQuery.data.household.name}</strong>
						</div>
						<button
							type="button"
							class="invite-row"
							aria-label={`Copy invite code ${householdQuery.data.household.inviteCode}`}
							onclick={() =>
								copyInviteCode(
									householdQuery.data?.household.inviteCode ?? "",
								)}
						>
							<span class="invite-code"
								>{householdQuery.data.household.inviteCode}</span
							>
							<span class="invite-action"
								>{copied ? "Copied!" : "Copy invite"}</span
							>
						</button>
						<ul class="member-list">
							{#each householdQuery.data.members as member, i (member._id)}
								<li>
									<span
										class="member-dot"
										style={`background: ${memberColors[i % memberColors.length]}`}
									></span>
									<span class="member-name">{member.name}</span>
									{#if member._id === session.session?.memberId}
										<span class="you-tag">You</span>
									{/if}
								</li>
							{/each}
						</ul>
						<div class="household-switch">
							{#if householdForm === null}
								<button
									type="button"
									class="switch-button"
									onclick={() => openHouseholdForm("create")}
								>New family group</button
								>
								<button
									type="button"
									class="switch-button"
									onclick={() => openHouseholdForm("join")}
									>Join with code</button
								>
							{:else}
								<form onsubmit={submitHouseholdForm}>
									{#if householdForm === "create"}
										<label
											>Group name<input
												bind:value={newHouseholdName}
												required
												maxlength={40}
												placeholder="The Rivera Kitchen"
												autocomplete="off"
											/></label
										>
									{:else}
										<label
											>Invite code<input
												bind:value={joinCode}
												required
												maxlength={6}
												placeholder="ABC123"
												autocomplete="off"
												autocapitalize="characters"
												class="code-input"
											/></label
										>
										<label
											>Your name<input
												bind:value={joinName}
												maxlength={40}
												placeholder={selfName()}
												autocomplete="given-name"
											/></label
										>
									{/if}
									{#if householdError}
										<p class="form-error" role="alert">
											{householdError}
										</p>
									{/if}
									<div class="household-form-actions">
										<button type="submit" class="primary-button">
											{householdForm === "create"
												? "Create & switch"
												: "Join"}
										</button>
										<button
											type="button"
											class="switch-button"
											onclick={() => (householdForm = null)}
											>Cancel</button
										>
									</div>
								</form>
							{/if}
						</div>
						{#if confirmingLeave}
							<div class="leave-confirmation" role="alert">
								<p>
									Leaving removes your meal plan. If you're the last member, this
									household and its data will be deleted.
								</p>
								{#if leaveError}
									<p class="form-error">{leaveError}</p>
								{/if}
								<div class="leave-actions">
									<button
										type="button"
										class="switch-button"
										disabled={leaving}
										onclick={() => {
											confirmingLeave = false;
											leaveError = "";
										}}>Keep household</button
									>
									<button
										type="button"
										class="leave-confirm-button"
										disabled={leaving}
										onclick={leave}>{leaving ? "Leaving…" : "Leave"}</button
									>
								</div>
							</div>
						{:else}
							<button
								type="button"
								class="leave-button"
								onclick={() => {
									confirmingLeave = true;
									leaveError = "";
								}}>Leave household</button
							>
						{/if}
					</div>
					{/if}
					<div class="profile-section profile-actions">
						<button type="button" class="profile-action-row" onclick={openPreferences}>
							<Icon name="spark" size={15} />
							<span class="profile-action-label">Preferences</span>
							<span class="profile-action-icon"
								><Icon name="chevron-down" size={14} /></span
							>
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="profile-back"
						bind:this={profileBackTrigger}
						onclick={showProfileView}
					>
						<span class="profile-back-icon"
							><Icon name="chevron-down" size={14} /></span
						>
						<span>Back to profile</span>
					</button>
					<h2 id="preferences-heading" class="profile-heading">Preferences</h2>
					<div class="profile-section preferences-section">
						<span class="setting-title" id="preferences-appearance-label"
							>Appearance</span
						>
						<fieldset
							class="theme-switch"
							aria-labelledby="preferences-appearance-label"
						>
							{#each themeOptions as option (option.id)}
								<button
									type="button"
									class:active={theme === option.id}
									aria-pressed={theme === option.id}
									onclick={() => setTheme(option.id)}
								>{option.label}</button
								>
							{/each}
						</fieldset>
					</div>
					{#if !wideScreen.current}
						<div class="profile-section preferences-section">
							<span class="setting-title" id="preferences-planner-label"
								>Mobile planner view</span
							>
							<fieldset
								class="theme-switch two-options"
								aria-labelledby="preferences-planner-label"
							>
								<button
									type="button"
									class:active={plannerView.view === "day"}
									aria-pressed={plannerView.view === "day"}
									onclick={() => plannerView.set("day")}
								>Day</button
								>
								<button
									type="button"
									class:active={plannerView.view === "week"}
									aria-pressed={plannerView.view === "week"}
									onclick={() => plannerView.set("week")}
								>Week</button
								>
							</fieldset>
						</div>
					{/if}
					{#if wideScreen.current}
						<div class="profile-section preferences-section">
							<span class="setting-title" id="preferences-layout-label"
								>Desktop layout</span
							>
							<fieldset
								class="theme-switch two-options"
								aria-labelledby="preferences-layout-label"
							>
								<button
									type="button"
									class:active={!prefs.desktopDashboard}
									aria-pressed={!prefs.desktopDashboard}
									onclick={() => setDesktopLayout(false)}
								>Pages</button
								>
								<button
									type="button"
									class:active={prefs.desktopDashboard}
									aria-pressed={prefs.desktopDashboard}
									onclick={() => setDesktopLayout(true)}
								>Dashboard</button
								>
							</fieldset>
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<div class="page-transition-shell">
			{@render children()}
		</div>
		<TabBar active={activeSection} />
	</div>
	</div>
{/if}

<style>
	.splash {
		display: grid;
		place-items: center;
		min-height: 60vh;
		color: var(--app-muted);
		font-size: 13px;
	}
	.app {
		min-height: 100vh;
		--mobile-tab-bar-height: 64px;
		color: #17221f;
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
	a {
		font: inherit;
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
		border-bottom: 1px solid #e3dfd5;
		background: rgba(247, 245, 239, 0.96);
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
		color: #17221f;
	}
	.primary-nav {
		display: none;
		align-items: center;
		gap: 4px;
		margin-left: 18px;
	}
	.primary-nav a {
		display: flex;
		align-items: center;
		gap: 10px;
		border-radius: 10px;
		padding: 9px 11px;
		color: var(--app-muted);
		text-decoration: none;
		font-size: 12px;
		font-weight: 700;
	}
	.primary-nav a:hover {
		background: color-mix(in srgb, var(--app-ink) 7%, transparent);
	}
	.primary-nav a.active {
		background: var(--app-accent-strong);
		color: #17221f;
	}
	.setting-title {
		font-size: 10px;
		font-weight: 700;
		color: var(--app-muted);
	}
	.profile-heading {
		margin: 4px 4px 2px;
		font-family: Georgia, "Times New Roman", serif;
		font-size: 18px;
		letter-spacing: -0.03em;
	}
	.profile-back {
		display: flex;
		align-items: center;
		gap: 6px;
		justify-self: start;
		border: 0;
		padding: 4px;
		background: transparent;
		color: var(--app-muted);
		font: inherit;
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
	}
	.profile-back:hover {
		color: var(--app-ink);
	}
	.profile-back-icon {
		display: grid;
		transform: rotate(90deg);
	}
	.profile-actions {
		gap: 4px;
	}
	.profile-action-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		border: 1px solid var(--app-line-strong);
		border-radius: 10px;
		padding: 9px 10px;
		background: color-mix(in srgb, var(--app-ink) 3%, transparent);
		color: var(--app-ink);
		font: inherit;
		font-size: 12px;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}
	.profile-action-row:hover {
		border-color: var(--app-accent-strong);
		color: var(--app-accent);
	}
	.profile-action-label {
		flex: 1;
	}
	.profile-action-icon {
		display: grid;
		transform: rotate(-90deg);
		color: var(--app-muted);
	}
	.theme-switch {
		display: flex;
		gap: 4px;
		margin: 0;
		padding: 4px;
		border: 0;
		border-radius: 12px;
		background: color-mix(in srgb, var(--app-ink) 8%, transparent);
	}
	/* Two buttons spanning ~2/3 of the full width so all buttons
	   match the Appearance widths. */
	.theme-switch.two-options {
		max-width: 66.666%;
	}
	.theme-switch button {
		flex: 1 1 0;
		min-width: 0;
		border: 0;
		border-radius: 8px;
		padding: 7px 0;
		background: transparent;
		color: var(--app-muted);
		font-family: inherit;
		font-size: 11px;
		font-weight: 800;
		cursor: pointer;
	}
	.theme-switch button.active {
		background: var(--app-accent-strong);
		color: #17221f;
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
	@media (prefers-color-scheme: dark) {
		:root:not([data-theme="light"]) .app {
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .top-bar {
			border-bottom-color: var(--app-line);
			background: color-mix(in srgb, var(--app-canvas) 96%, transparent);
		}
		:root:not([data-theme="light"]) .top-bar-brand strong,
		:root:not([data-theme="light"]) .mobile-mark {
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .primary-nav a {
			color: var(--app-dark-muted);
		}
	}

	:root[data-theme="dark"] .app {
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .top-bar {
		border-bottom-color: var(--app-line);
		background: color-mix(in srgb, var(--app-canvas) 96%, transparent);
	}
	:root[data-theme="dark"] .top-bar-brand strong,
	:root[data-theme="dark"] .mobile-mark {
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .primary-nav a {
		color: var(--app-dark-muted);
	}
	.profile-trigger {
		display: flex;
		align-items: center;
		gap: 7px;
		flex: 0 0 auto;
		min-width: 0;
		max-width: min(170px, 20vw);
		min-height: 34px;
		margin-left: 0;
		border: 1px solid var(--app-line-strong);
		border-radius: 999px;
		padding: 0 10px 0 8px;
		background: var(--app-surface);
		color: var(--app-muted);
		font: inherit;
		cursor: pointer;
	}
	.profile-trigger-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 11px;
		font-weight: 700;
	}
	@media (max-width: 360px) {
		.profile-trigger {
			justify-content: center;
			width: 34px;
			padding: 0;
			border-radius: 50%;
		}
		.profile-trigger-name {
			display: none;
		}
	}
	.profile-trigger:focus-visible,
	.primary-nav a:focus-visible,
	.profile-menu button:focus-visible,
	.profile-menu input:focus-visible {
		outline: 2px solid var(--app-accent);
		outline-offset: 2px;
	}
	.profile-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		border: 0;
		background: transparent;
		cursor: default;
	}
	.profile-menu {
		position: fixed;
		top: 58px;
		right: 12px;
		z-index: 70;
		display: grid;
		gap: 4px;
		width: min(320px, calc(100vw - 24px));
		max-height: calc(100vh - 70px);
		box-sizing: border-box;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		padding: 8px;
		border: 1px solid var(--app-line);
		border-radius: 16px;
		background: var(--app-surface);
		color: var(--app-ink);
		box-shadow: 0 16px 48px rgba(23, 34, 31, 0.18);
	}
	@supports (height: 100dvh) {
		.profile-menu {
			max-height: calc(100dvh - 70px);
		}
	}
	.profile-section {
		display: grid;
		gap: 8px;
		margin-top: 4px;
		padding: 10px 4px 4px;
		border-top: 1px solid var(--app-line);
	}
	.profile-section:first-of-type {
		margin-top: 0;
		padding-top: 4px;
		border-top: 0;
	}
	.preferences-section {
		margin-top: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--app-line);
	}
	.preferences-section + .preferences-section {
		margin-top: 0;
		padding-top: 8px;
		border-top: 0;
	}
	.section-heading {
		display: grid;
		gap: 2px;
	}
	.household-name {
		overflow-wrap: anywhere;
		font-size: 13px;
	}
	.invite-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border: 1px dashed var(--app-line-strong);
		border-radius: 10px;
		padding: 8px 12px;
		background: transparent;
		color: var(--app-ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.invite-code {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 14px;
		font-weight: 800;
		letter-spacing: 0.2em;
		color: var(--app-ink);
	}
	.invite-action {
		flex: 0 0 auto;
		font-size: 11px;
		font-weight: 800;
		color: var(--app-accent);
	}
	.member-list {
		display: grid;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.member-list li {
		display: flex;
		align-items: center;
		min-width: 0;
		gap: 8px;
		font-size: 12px;
		font-weight: 600;
		color: var(--app-ink);
	}
	.member-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.member-dot {
		flex: 0 0 auto;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.you-tag {
		padding: 1px 7px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--app-ink) 8%, transparent);
		color: var(--app-muted);
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.leave-button {
		justify-self: start;
		border: 0;
		background: transparent;
		padding: 7px 0;
		color: var(--app-muted);
		font: inherit;
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
	}
	.leave-button:hover {
		color: #9a4b32;
	}
	.leave-confirmation {
		display: grid;
		gap: 8px;
		padding-top: 4px;
	}
	.leave-confirmation p {
		margin: 0;
		font-size: 11px;
		line-height: 1.45;
		color: var(--app-muted);
	}
	.leave-confirmation .form-error {
		color: #9a4b32;
	}
	.leave-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.leave-confirm-button {
		border: 1px solid color-mix(in srgb, #9a4b32 55%, var(--app-line-strong));
		border-radius: 10px;
		padding: 8px 12px;
		background: color-mix(in srgb, #9a4b32 10%, transparent);
		color: #9a4b32;
		font: inherit;
		font-size: 12px;
		font-weight: 800;
		cursor: pointer;
	}
	.profile-menu button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.household-switch {
		display: grid;
		gap: 8px;
	}
	.switch-button {
		border: 1px solid var(--app-line-strong);
		border-radius: 10px;
		padding: 8px 12px;
		background: transparent;
		color: var(--app-ink);
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}
	.switch-button:hover {
		border-color: var(--app-accent-strong);
		color: var(--app-accent);
	}
	.household-switch form {
		display: grid;
		gap: 10px;
	}
	.household-switch label {
		display: grid;
		gap: 5px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--app-muted);
	}
	.household-switch input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--app-line-strong);
		border-radius: 10px;
		padding: 9px 11px;
		background: var(--app-input);
		outline: 0;
		font-size: 13px;
		color: var(--app-ink);
	}
	.household-switch input:focus {
		border-color: var(--app-accent-strong);
	}
	.code-input {
		text-transform: uppercase;
		letter-spacing: 0.2em;
	}
	.household-switch .form-error {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		color: #9a4b32;
	}
	.household-form-actions {
		display: flex;
		gap: 8px;
	}
	.primary-button {
		flex: 1;
		border: 0;
		border-radius: 10px;
		padding: 9px 12px;
		background: var(--app-dark);
		color: var(--app-dark-ink);
		font-size: 12px;
		font-weight: 800;
		cursor: pointer;
	}
</style>
