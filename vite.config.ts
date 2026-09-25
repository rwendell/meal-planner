import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Rewrites shadcn-registry attribute selectors in compiled CSS to the
 * forms the installed bits-ui version emits (verified in
 * node_modules/bits-ui/dist): registry targets newer bits-ui
 * (`data-active`, `data-checked`, `data-horizontal`/`vertical`,
 * `data-open`/`closed`, `data-[disabled=true]`), but installed bits-ui
 * emits `data-state` / `data-orientation` values and empty-string
 * `data-disabled` / presence `data-selected`.
 *
 * This keeps registry files byte-identical upstream so
 * `shadcn-svelte update` applies cleanly — no per-file translation.
 * Extend the map (never hand-edit generated selectors) if new
 * mismatches appear. The whole plugin auto-disables, with a loud
 * warning, once installed bits-ui stops emitting the old forms.
 */
const BITS_UI_ATTR_SHIMS: Array<[RegExp, string]> = [
	[/\[data-active\]/g, '[data-state="active"]'],
	[/\[data-horizontal\]/g, '[data-orientation="horizontal"]'],
	[/\[data-vertical\]/g, '[data-orientation="vertical"]'],
	[/\[data-checked\]/g, '[data-state="checked"]'],
	[/\[data-unchecked\]/g, '[data-state="unchecked"]'],
	[/\[data-open\]/g, '[data-state="open"]'],
	[/\[data-closed\]/g, '[data-state="closed"]'],
	[/\[data-disabled="true"\]/g, "[data-disabled]"],
];

function bitsUiAttrShim(): Plugin {
	const needsShim = installedBitsUiNeedsShim();
	if (!needsShim) {
		console.warn(
			"[bits-ui-attr-shim] installed bits-ui no longer emits the old attribute forms — the shim is obsolete. Remove bitsUiAttrShim() from vite.config.ts.",
		);
	}
	return {
		name: "bits-ui-attr-shim",
		enforce: "post",
		// generateBundle (not transform): Tailwind v4 emits utilities
		// downstream of per-module transforms, so only the final assets
		// reliably contain every generated selector.
		generateBundle(_, bundle) {
			if (!needsShim) return;
			for (const file of Object.values(bundle)) {
				if (
					file.type !== "asset" ||
					!file.fileName.endsWith(".css") ||
					typeof file.source !== "string"
				) {
					continue;
				}
				let output: string = file.source;
				for (const [pattern, replacement] of BITS_UI_ATTR_SHIMS) {
					output = output.replace(pattern, replacement);
				}
				if (output !== file.source) file.source = output;
			}
		},
	};
}

/**
 * Whether installed bits-ui still needs the shim: true while any
 * shipped component output emits the old `data-state` /
 * `data-orientation` forms. Scans the whole dist output generically —
 * no component list to maintain. Absence of both literals means the
 * upstream migration landed and the shim must stand down (rewriting
 * would then break natively-matching selectors). Unreadable install
 * keeps the shim active (today's known-good behavior).
 */
function installedBitsUiNeedsShim(): boolean {
	try {
		const require = createRequire(import.meta.url);
		const bitsDir = join(
			dirname(require.resolve("bits-ui/package.json")),
			"dist",
			"bits",
		);
		const stack: string[] = [bitsDir];
		while (stack.length > 0) {
			const dir = stack.pop() as string;
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) {
					stack.push(full);
				} else if (entry.name.endsWith(".svelte.js")) {
					const content = readFileSync(full, "utf8");
					if (
						content.includes('"data-state"') ||
						content.includes('"data-orientation"')
					) {
						return true;
					}
				}
			}
		}
		return false;
	} catch {
		return true;
	}
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		bitsUiAttrShim(),
		sveltekit({
			inspector: true,
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter(),
		}),
	],
});
