<script lang="ts">
	import { resolve } from "$app/paths";
	import Icon, { type IconName } from "$lib/components/Icon.svelte";

	let { active = "planner" }: { active?: string } = $props();

	const tabs: {
		id: string;
		label: string;
		icon: IconName;
		href: "/#planner" | "/shopping";
	}[] = [
		{ id: "planner", label: "Planner", icon: "calendar", href: "/#planner" },
		{ id: "shopping", label: "List", icon: "cart", href: "/shopping" },
	];
</script>

<nav class="tab-bar" aria-label="Primary">
	{#each tabs as tab (tab.id)}
		<a
			href={resolve(tab.href)}
			class:active={active === tab.id}
			aria-current={active === tab.id ? "page" : undefined}
		>
			<Icon name={tab.icon} size={18} /><span>{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tab-bar {
		position: sticky;
		bottom: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--app-line);
		background: color-mix(in srgb, var(--app-canvas) 96%, transparent);
		backdrop-filter: blur(10px);
	}
	.tab-bar a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 6px 2px;
		border-radius: 10px;
		color: var(--app-faint);
		text-decoration: none;
		font-size: 10px;
		font-weight: 700;
	}
	.tab-bar a.active {
		color: var(--app-accent);
	}

	@media (min-width: 1024px) {
		.tab-bar {
			display: none;
		}
	}
</style>
