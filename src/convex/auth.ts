import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

// Convex injects process.env at deploy time; svelte-check has no Node
// types, so declare the sliver we use instead of adding @types/node.
declare const process: { env: Record<string, string | undefined> };

/** Comma-separated extra origins allowed for post-login redirects. */
function allowedOrigins(): string[] {
	const raw = process.env.ALLOWED_ORIGINS ?? "";
	return raw
		.split(",")
		.map((origin: string) => origin.trim().replace(/\/$/, ""))
		.filter((origin: string) => origin.length > 0);
}

/**
 * Domain suffixes (leading dot, e.g. `.vercel.app`) whose https origins
 * are allowed — covers preview deployments with per-PR URLs.
 */
function allowedSuffixes(): string[] {
	const raw = process.env.ALLOWED_ORIGIN_SUFFIXES ?? "";
	return raw
		.split(",")
		.map((suffix: string) => suffix.trim().toLowerCase())
		.map((suffix: string) => (suffix.startsWith(".") ? suffix : `.${suffix}`))
		.filter((suffix: string) => suffix.length > 1);
}

function originAllowed(url: string): boolean {
	let target: URL;
	try {
		target = new URL(url);
	} catch {
		return false;
	}
	if (allowedOrigins().includes(target.origin)) return true;
	return (
		target.protocol === "https:" &&
		allowedSuffixes().some((suffix) => target.hostname.endsWith(suffix))
	);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [Google],
	callbacks: {
		async redirect({ redirectTo }) {
			const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
			// Relative paths and SITE_URL matches keep the default behavior.
			if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
				return `${site}${redirectTo}`;
			}
			if (
				site &&
				(redirectTo === site ||
					redirectTo.startsWith(`${site}/`) ||
					redirectTo.startsWith(`${site}?`))
			) {
				return redirectTo;
			}
			// Otherwise only explicitly allowlisted origins (exact match —
			// never prefix — plus configured domain suffixes).
			if (originAllowed(redirectTo)) return redirectTo;
			throw new Error(
				`Invalid redirectTo ${redirectTo} for configured origins.`,
			);
		},
	},
});
