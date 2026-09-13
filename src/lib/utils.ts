import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge CSS class names into a single string, resolving conflicts so the
 * last utility wins. `clsx` handles the joining (strings, arrays, and
 * `{ className: condition }` objects); `tailwind-merge` then deduplicates
 * conflicting Tailwind utilities (e.g. `cn("px-2", "px-4")` → `"px-4"`).
 *
 * This is the standard shadcn-svelte helper — every component under
 * `$lib/components/ui` imports it to blend its default styles with caller
 * overrides. Keep the name `cn` so registry components keep working
 * unmodified.
 *
 * @example
 * cn("rounded-lg border", isActive && "border-primary", className);
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// biome-ignore lint/suspicious/noExplicitAny: shadcn-svelte helper types need any to match arbitrary prop shapes
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// biome-ignore lint/suspicious/noExplicitAny: shadcn-svelte helper types need any to match arbitrary prop shapes
export type WithoutChildren<T> = T extends { children?: any }
	? Omit<T, "children">
	: T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};
