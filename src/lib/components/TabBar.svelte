<script lang="ts">
	import { resolve } from "$app/paths";
	import Icon, { type IconName } from "$lib/components/Icon.svelte";
	import { cn } from "$lib/utils.js";

	let { active = "planner" }: { active?: string } = $props();

	const tabs: {
		id: string;
		label: string;
		icon: IconName;
		href: "/#planner" | "/meals" | "/shopping";
	}[] = [
		{ id: "planner", label: "Planner", icon: "calendar", href: "/#planner" },
		{ id: "meals", label: "Meal database", icon: "book", href: "/meals" },
		{ id: "shopping", label: "Shopping list", icon: "cart", href: "/shopping" },
	];
</script>

<nav class="tab-bar" aria-label="Primary">
	{#each tabs as tab (tab.id)}
		<a
			href={resolve(tab.href)}
			class={cn(active === tab.id && "active")}
			aria-current={active === tab.id ? "page" : undefined}
		>
			<Icon name={tab.icon} size={18} /><span>{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tab-bar {
		position: fixed;
		left: 0;
		right: 0;
		width: 100%;
		height: calc(var(--mobile-tab-bar-height, 64px) + env(safe-area-inset-bottom));
		box-sizing: border-box;
		bottom: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		background: color-mix(in srgb, var(--background) 96%, transparent);
		backdrop-filter: blur(10px);
	}
	.tab-bar a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 6px 2px;
		border-radius: 10px;
		color: var(--muted-foreground);
		text-decoration: none;
		font-size: 10px;
		font-weight: 700;
	}
	.tab-bar a:hover {
		color: var(--foreground);
	}
	.tab-bar a.active {
		color: var(--primary);
	}

	@media (min-width: 1024px) {
		.tab-bar {
			display: none;
		}
	}
</style>
