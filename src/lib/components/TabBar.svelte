<script lang="ts">
	import BookIcon from "@lucide/svelte/icons/book";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";
	import type { Component } from "svelte";
	import { resolve } from "$app/paths";
	import { cn } from "$lib/utils.js";

	let { active = "planner" }: { active?: string } = $props();

	const tabs: {
		id: string;
		label: string;
		Icon: Component;
		href: "/#planner" | "/cookbook" | "/shopping";
	}[] = [
		{ id: "planner", label: "Planner", Icon: CalendarIcon, href: "/#planner" },
		{ id: "meals", label: "Cookbook", Icon: BookIcon, href: "/cookbook" },
		{ id: "shopping", label: "Shopping list", Icon: ShoppingCartIcon, href: "/shopping" },
	];
</script>

<nav
	aria-label="Primary"
	class="fixed inset-x-0 bottom-0 z-20 grid h-[calc(var(--mobile-tab-bar-height,64px)_+_env(safe-area-inset-bottom))] w-full grid-cols-3 border-t border-border bg-[color-mix(in_srgb,var(--background)_96%,transparent)] px-1 pt-1.5 pb-[calc(6px_+_env(safe-area-inset-bottom))] backdrop-blur-[10px] print:hidden lg:hidden"
>
	{#each tabs as tab (tab.id)}
		<a
			href={resolve(tab.href)}
			class={cn(
				"flex flex-col items-center gap-[3px] rounded-[10px] px-0.5 py-1.5 text-[10px] font-bold text-muted-foreground no-underline hover:text-foreground",
				active === tab.id && "text-primary",
			)}
			aria-current={active === tab.id ? "page" : undefined}
		>
			<tab.Icon size={18} /><span>{tab.label}</span>
		</a>
	{/each}
</nav>
