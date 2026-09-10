type ClassValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| ClassValue[]
	| Record<string, unknown>;

function toClassName(value: ClassValue): string {
	if (!value) return "";
	if (typeof value === "string" || typeof value === "number")
		return String(value);
	if (Array.isArray(value))
		return value.map(toClassName).filter(Boolean).join(" ");
	if (typeof value === "object") {
		return Object.entries(value)
			.filter(([, enabled]) => Boolean(enabled))
			.map(([name]) => name)
			.join(" ");
	}
	return "";
}

export function cn(...inputs: ClassValue[]) {
	return inputs.map(toClassName).filter(Boolean).join(" ");
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
