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
	const info = inspectBitsUiInstall();
	announceOnce(
		!info.needsShim
			? `[bits-ui-attr-shim] installed bits-ui no longer emits the old attribute forms — the shim is obsolete. Remove bitsUiAttrShim() from vite.config.ts.`
			: `[bits-ui-attr-shim] bits-ui@${info.version} — shim active, watching ${BITS_UI_ATTR_SHIMS.length} selector pairs.`,
		!info.needsShim,
	);
	return {
		name: "bits-ui-attr-shim",
		enforce: "post",
		buildStart() {
			// Best-effort update nudge, once per process; never blocks or
			// fails the build.
			void checkBitsUiUpdatesOnce(info.version);
		},
		// generateBundle (not transform): Tailwind v4 emits utilities
		// downstream of per-module transforms, so only the final assets
		// reliably contain every generated selector.
		generateBundle(_, bundle) {
			if (!info.needsShim) return;
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

/** Installed version plus whether its output still needs rewriting. */
function inspectBitsUiInstall(): { version: string; needsShim: boolean } {
	try {
		const require = createRequire(import.meta.url);
		// NOTE: bits-ui's exports map hides ./package.json, so resolve the
		// entry and walk up to the owning package.json instead.
		let dir = dirname(require.resolve("bits-ui"));
		let pkgPath: string | null = null;
		for (let depth = 0; depth < 6; depth++) {
			const candidate = join(dir, "package.json");
			try {
				if (JSON.parse(readFileSync(candidate, "utf8")).name === "bits-ui") {
					pkgPath = candidate;
					break;
				}
			} catch {
				// Not a readable package boundary — keep walking up.
			}
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
		if (!pkgPath) return { version: "unknown", needsShim: true };
		const version: string =
			JSON.parse(readFileSync(pkgPath, "utf8")).version ?? "unknown";
		const bitsDir = join(dirname(pkgPath), "dist", "bits");
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
						return { version, needsShim: true };
					}
				}
			}
		}
		return { version, needsShim: false };
	} catch {
		return { version: "unknown", needsShim: true };
	}
}

const announcedMessages = new Set<string>();
let updateCheckStarted = false;

/** Log once per process (config evaluates per build worker). */
function announceOnce(message: string, warn: boolean): void {
	if (announcedMessages.has(message)) return;
	announcedMessages.add(message);
	if (warn) console.warn(message);
	else console.log(message);
}

/** Numeric X.Y.Z compare; null when either side isn't a stable version. */
function compareStableVersions(
	installed: string,
	published: string,
): number | null {
	const parse = (v: string): [number, number, number] | null => {
		const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
		return match
			? [Number(match[1]), Number(match[2]), Number(match[3])]
			: null;
	};
	const a = parse(installed);
	const b = parse(published);
	if (!a || !b) return null;
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
	}
	return 0;
}

/**
 * Best-effort nudge when the registry publishes a newer stable bits-ui:
 * a new version can change emitted attributes, which is exactly what
 * this shim exists to bridge. Silent on offline/timeout/inconclusive —
 * never blocks or fails the build.
 */
async function checkBitsUiUpdatesOnce(installed: string): Promise<void> {
	if (updateCheckStarted) return;
	updateCheckStarted = true;
	await checkBitsUiUpdates(installed);
}

async function checkBitsUiUpdates(installed: string): Promise<void> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 3000);
		let published: string | undefined;
		try {
			const response = await fetch(
				"https://registry.npmjs.org/bits-ui/latest",
				{ signal: controller.signal },
			);
			if (response.ok) {
				published = ((await response.json()) as { version?: string }).version;
			}
		} finally {
			clearTimeout(timer);
		}
		if (!published || compareStableVersions(installed, published) !== -1) {
			return;
		}
		console.warn(
			`[bits-ui-attr-shim] bits-ui ${published} published (installed ${installed}) — after upgrading, re-verify attribute emissions and eyeball interactive states per AGENTS.md.`,
		);
	} catch {
		// Offline, blocked, or otherwise inconclusive: stay silent.
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
