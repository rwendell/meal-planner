import BookIcon from "@lucide/svelte/icons/book";
import CalendarIcon from "@lucide/svelte/icons/calendar";
import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";
import type { Component } from "svelte";

/**
 * The app's primary sections, in navigation order.
 *
 * Single source of truth for three consumers that must agree: the desktop
 * navigation menu, the mobile tab bar, and swipe navigation. Swipe walks
 * this list by index, so a section added here becomes swipe-navigable
 * with no further change.
 *
 * `id` doubles as the active-section key, which is why the cookbook's id
 * is `meals` while its route is /cookbook.
 */
export interface NavItem {
	id: string;
	label: string;
	Icon: Component;
	href: "/#planner" | "/cookbook" | "/shopping";
}

/** Ordered. Index is the swipe-navigation order; reordering changes it. */
export const navItems: readonly NavItem[] = [
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
] as const;

/**
 * The nav id the current URL belongs to.
 *
 * `/` and `/dashboard` are both planner surfaces. `/profile` reports
 * "profile": not a primary section, but the tab bar and nav menu still
 * need a non-empty key to compare against, and none will match it, so
 * nothing highlights.
 */
export function activeNavId(url: { pathname: string; hash: string }): string {
	if (url.pathname === "/cookbook") return "meals";
	if (url.pathname === "/shopping") return "shopping";
	if (url.pathname === "/profile") return "profile";
	if (url.hash) return url.hash.slice(1);
	return "planner";
}

/**
 * Index into `navItems` for a pathname.
 *
 * Planner's href carries a hash, so matching against `href` would miss
 * `/` and `/dashboard`; they are handled explicitly.
 *
 * Non-section surfaces (/profile) fall through to planner's index. That
 * is the pre-existing behaviour: swiping left from the profile menu
 * lands on the cookbook, since the menu is an overlay on a planner
 * surface rather than a section of its own.
 */
export function navIndexFor(pathname: string): number {
	if (pathname === "/cookbook") return 1;
	if (pathname === "/shopping") return 2;
	return 0;
}

/**
 * The section a horizontal swipe should land on, or null when the swipe
 * would run off either end.
 */
export function swipeTarget(
	fromPath: string,
	direction: -1 | 1,
): NavItem["href"] | null {
	const index = navIndexFor(fromPath);
	if (index < 0) return null;
	const next = navItems[index + direction];
	return next?.href ?? null;
}
