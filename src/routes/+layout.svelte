<script lang="ts">
	import "./layout.css";
	import { setupConvex, useMutation, useQuery } from "convex-svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { browser } from "$app/environment";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { PUBLIC_CONVEX_URL } from "$env/static/public";
	import favicon from "$lib/assets/favicon.svg";
	import Icon, { type IconName } from "$lib/components/Icon.svelte";
	import TabBar from "$lib/components/TabBar.svelte";
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

	const navItems: NavItem[] = [
		{ id: "planner", label: "Planner", icon: "calendar", href: "/#planner" },
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

	let menuOpen = $state(false);
	let drawerPinned = $state(true);
	let profileOpen = $state(false);
	let copied = $state(false);
	const wideScreen = new MediaQuery("(min-width: 1024px)");

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
				profileOpen = false;
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
				profileOpen = false;
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
		if (!session.session) return;
		profileOpen = false;
		await leaveHousehold({
			memberId: session.session.memberId as Id<"householdMembers">,
		});
		session.disconnect();
	}

	let drawerOpen = $derived(
		wideScreen.current ? drawerPinned : menuOpen,
	);

	function closeMenu(): void {
		menuOpen = false;
	}

	function toggleMenu(): void {
		if (wideScreen.current) {
			drawerPinned = !drawerPinned;
		} else {
			menuOpen = true;
		}
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key !== "Escape") return;
		if (profileOpen) profileOpen = false;
		else if (menuOpen) closeMenu();
	}

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<svelte:window onkeydown={onKeydown} />

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
			<button
				type="button"
				class="icon-button"
				aria-label="Toggle menu"
				aria-expanded={drawerOpen}
				onclick={toggleMenu}
			>
				<Icon name="menu" size={17} />
			</button>
			<a
				class="mobile-brand"
				href={resolve("/#planner")}
				aria-label="Go to planner"
			>
				<span class="mobile-mark"><Icon name="utensils" size={15} /></span>
				<strong>Meal Planner</strong>
			</a>
			<button
				type="button"
				class="avatar-button"
				aria-label="Open profile menu"
				aria-expanded={profileOpen}
				onclick={() => (profileOpen = !profileOpen)}
			>
				<Icon name="user" size={17} />
			</button>
		</header>
		{#if profileOpen}
			<button
				type="button"
				class="profile-backdrop"
				aria-label="Close profile menu"
				onclick={() => (profileOpen = false)}
			></button>
			<nav class="profile-menu" aria-label="Profile">
				{#if householdQuery.data}
					<div class="profile-section">
						<span
							class="setting-title"
							>{householdQuery.data.household.name}</span
						>
						<button
							type="button"
							class="invite-row"
							title="Copy invite code"
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
									<span>{member.name}</span>
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
									onclick={() => {
										householdForm = "create";
										householdError = "";
									}}>New family group</button
								>
								<button
									type="button"
									class="switch-button"
									onclick={() => {
										householdForm = "join";
										householdError = "";
									}}>Join with code</button
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
						<button
							type="button"
							class="leave-button"
							onclick={leave}>Leave household</button
						>
					</div>
				{/if}
				<a
					href={resolve("/meals")}
					class:active={activeSection === "meals"}
					onclick={() => (profileOpen = false)}
				>
					<Icon name="book" size={15} /><span>Meal database</span>
				</a>
				<div class="profile-section">
					<span class="setting-title" id="profile-theme-label"
						>Theme</span
					>
					<fieldset
						class="theme-switch"
						aria-labelledby="profile-theme-label"
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
			</nav>
		{/if}

		{@render children()}
		<TabBar active={activeSection} />
	</div>

	{#snippet drawerBody()}
		<div class="flyout-head">
			<span class="mobile-mark"><Icon name="utensils" size={15} /></span>
			<strong>Meal Planner</strong>
			<button
				type="button"
				class="icon-button dark flyout-close"
				aria-label="Close menu"
				onclick={closeMenu}
			>
				<Icon name="close" size={15} />
			</button>
		</div>
		<nav class="flyout-nav" aria-label="Menu">
			{#each navItems as item (item.id)}
				<a
					href={resolve(item.href)}
					class:active={activeSection === item.id}
					aria-current={activeSection === item.id ? "page" : undefined}
					onclick={closeMenu}
				>
					<Icon name={item.icon} size={16} /><span>{item.label}</span>
				</a>
			{/each}
		</nav>
	{/snippet}

	{#if drawerOpen}
		{#if wideScreen.current}
			<aside class="flyout docked" aria-label="Menu">
				{@render drawerBody()}
			</aside>
		{:else}
			<div
				class="menu-backdrop"
				onclick={closeMenu}
				aria-hidden="true"
			></div>
			<div
				class="flyout"
				role="dialog"
				aria-modal="true"
				aria-label="Menu"
			>
				{@render drawerBody()}
			</div>
		{/if}
	{/if}
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
		color: #17221f;
	}
	.content {
		min-width: 0;
		flex: 1;
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
	.mobile-brand {
		display: flex;
		align-items: center;
		gap: 9px;
		color: inherit;
		text-decoration: none;
	}
	.mobile-brand strong {
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
	.flyout-head .mobile-mark {
		background: var(--app-accent-strong);
		color: #17221f;
		border-radius: 10px;
	}
	.icon-button {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid #d9d5ca;
		border-radius: 10px;
		background: transparent;
		color: #53615a;
		cursor: pointer;
	}
	.icon-button.dark {
		border-color: var(--app-line-strong);
		color: var(--app-muted);
	}
	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(23, 34, 31, 0.5);
	}
	.flyout {
		position: fixed;
		top: 0;
		bottom: 0;
		left: 0;
		z-index: 50;
		display: flex;
		flex-direction: column;
		width: min(300px, 84vw);
		padding: 18px 16px;
		border-right: 1px solid var(--app-line);
		background: var(--app-surface);
		color: var(--app-ink);
		animation: slide-in 180ms ease-out;
	}
	.flyout-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.flyout-head strong {
		flex: 1;
		font-family: Georgia, "Times New Roman", serif;
		font-size: 20px;
		letter-spacing: -0.04em;
	}
	.flyout-nav {
		display: grid;
		gap: 5px;
		margin-top: 28px;
	}
	.flyout-nav a {
		display: flex;
		align-items: center;
		gap: 10px;
		border-radius: 12px;
		padding: 11px 12px;
		color: var(--app-muted);
		text-decoration: none;
		font-size: 13px;
		font-weight: 700;
	}
	.flyout-nav a:hover {
		background: color-mix(in srgb, var(--app-ink) 7%, transparent);
	}
	.flyout-nav a.active {
		background: var(--app-accent-strong);
		color: #17221f;
	}
	.setting-title {
		font-size: 10px;
		font-weight: 700;
		color: var(--app-faint);
	}
	.theme-switch {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
		margin: 0;
		padding: 4px;
		border: 0;
		border-radius: 12px;
		background: color-mix(in srgb, var(--app-ink) 8%, transparent);
	}
	.theme-switch button {
		border: 0;
		border-radius: 8px;
		padding: 7px 0;
		background: transparent;
		color: var(--app-muted);
		font-size: 11px;
		font-weight: 800;
		cursor: pointer;
	}
	.theme-switch button.active {
		background: var(--app-accent-strong);
		color: #17221f;
	}
	@keyframes slide-in {
		from {
			transform: translateX(-24px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	@media (min-width: 1024px) {
		.app {
			display: flex;
		}
		.flyout.docked {
			position: sticky;
			top: 0;
			order: -1;
			height: 100vh;
			flex: 0 0 248px;
			width: 248px;
			padding: 24px 18px;
			animation: none;
		}
		.flyout.docked .flyout-head .icon-button {
			display: none;
		}
		.flyout.docked .flyout-nav {
			margin-top: 44px;
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
		:root:not([data-theme="light"]) .mobile-brand strong,
		:root:not([data-theme="light"]) .mobile-mark {
			color: var(--app-ink);
		}
		:root:not([data-theme="light"]) .icon-button {
			border-color: var(--app-line-strong);
			color: var(--app-muted);
		}
		:root:not([data-theme="light"]) .flyout {
			background: var(--app-dark);
			color: var(--app-dark-ink);
		}
		:root:not([data-theme="light"]) .flyout-nav a {
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
	:root[data-theme="dark"] .mobile-brand strong,
	:root[data-theme="dark"] .mobile-mark {
		color: var(--app-ink);
	}
	:root[data-theme="dark"] .icon-button {
		border-color: var(--app-line-strong);
		color: var(--app-muted);
	}
	:root[data-theme="dark"] .flyout {
		background: var(--app-dark);
		color: var(--app-dark-ink);
	}
	:root[data-theme="dark"] .flyout-nav a {
		color: var(--app-dark-muted);
	}
	.avatar-button {
		display: grid;
		flex: 0 0 auto;
		width: 34px;
		height: 34px;
		place-items: center;
		margin-left: auto;
		border: 1px solid var(--app-line-strong);
		border-radius: 50%;
		background: var(--app-surface);
		color: var(--app-muted);
		cursor: pointer;
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
		width: 240px;
		padding: 8px;
		border: 1px solid var(--app-line);
		border-radius: 16px;
		background: var(--app-surface);
		color: var(--app-ink);
		box-shadow: 0 16px 48px rgba(23, 34, 31, 0.18);
	}
	.profile-menu a {
		display: flex;
		align-items: center;
		gap: 10px;
		border-radius: 10px;
		padding: 10px 12px;
		color: var(--app-ink);
		text-decoration: none;
		font-size: 13px;
		font-weight: 700;
	}
	.profile-menu a:hover {
		background: color-mix(in srgb, var(--app-ink) 7%, transparent);
	}
	.profile-menu a.active {
		background: color-mix(in srgb, var(--app-accent-strong) 16%, transparent);
		color: var(--app-accent);
	}
	.profile-section {
		display: grid;
		gap: 8px;
		margin-top: 4px;
		padding: 10px 4px 4px;
		border-top: 1px solid var(--app-line);
	}
	.profile-section:first-child {
		margin-top: 0;
		padding-top: 4px;
		border-top: 0;
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
		cursor: pointer;
	}
	.invite-code {
		font-size: 14px;
		font-weight: 800;
		letter-spacing: 0.2em;
		color: var(--app-ink);
	}
	.invite-action {
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
		gap: 8px;
		font-size: 12px;
		font-weight: 600;
		color: var(--app-ink);
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
		padding: 4px 0;
		color: var(--app-faint);
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
	}
	.leave-button:hover {
		color: #9a4b32;
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
		color: var(--app-faint);
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
