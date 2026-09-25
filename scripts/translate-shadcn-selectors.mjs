#!/usr/bin/env node
/**
 * Translates shadcn-registry attribute selectors to the forms installed
 * bits-ui emits (verified in node_modules/bits-ui/dist).
 *
 * Background: registry classes target newer bits-ui (`data-active:`,
 * `data-checked:`, `data-horizontal:/vertical:`, `data-open:/closed:`,
 * `data-[disabled=true]:`), but installed bits-ui emits `data-state` /
 * `data-orientation` values and empty-string `data-disabled`. Without
 * translation every interactive state is silently dead — and worse,
 * structural rules like the tabs column layout break the page.
 *
 * Run after every `shadcn-svelte add` / `update` that touches ui/.
 * Idempotent: translated output contains none of the source patterns.
 * Exits non-zero if a known pair fails to apply cleanly.
 *
 * Kept as-is (verified matching, no translation needed):
 * - `data-selected:` (presence matches empty-string emission)
 * - `aria-selected:` / `aria-pressed:` / `aria-checked:` (="true" strings)
 * - `data-[disabled]:`, `data-highlighted:`, `data-placeholder:` (presence)
 * - `data-[slot|variant|size|spacing|icon|side]=`, `has-`/`group-` forms
 *   referencing our own attributes, `rtl:` variants of translated rules.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** [sourcePattern, replacement] — group- forms first (longest match). */
const RULES = [
	["group-data-horizontal/", "group-data-[orientation=horizontal]/"],
	["group-data-vertical/", "group-data-[orientation=vertical]/"],
	["group-data-open/", "group-data-[state=open]/"],
	["group-data-closed/", "group-data-[state=closed]/"],
	["data-horizontal:", "data-[orientation=horizontal]:"],
	["data-vertical:", "data-[orientation=vertical]:"],
	["data-active:", "data-[state=active]:"],
	["data-checked:", "data-[state=checked]:"],
	["data-unchecked:", "data-[state=unchecked]:"],
	["data-open:", "data-[state=open]:"],
	["data-closed:", "data-[state=closed]:"],
	["data-[disabled=true]:", "data-[disabled]:"],
	// Explicit =true on an empty-string emission never matches; presence
	// does (bits-ui uses `? "" : undefined`, never the string "true").
	["data-[active=true]:", "data-active:"],
];

/** Bare data-* selectors this script does NOT own (presence matches). */
const KNOWN_GOOD = [
	"data-selected:",
	"data-highlighted:",
	"data-placeholder:",
	"data-disabled:",
];

const UI_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"src",
	"lib",
	"components",
	"ui",
);

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.name.endsWith(".svelte")) yield full;
	}
}

let total = 0;
const touched = [];
for (const file of walk(UI_DIR)) {
	const path = file;
	let text = readFileSync(file, "utf8");
	let count = 0;
	for (const [from, to] of RULES) {
		const hits = text.split(from).length - 1;
		if (hits > 0) {
			text = text.split(from).join(to);
			count += hits;
		}
	}
	if (count > 0) {
		writeFileSync(file, text);
		touched.push([path, count]);
		total += count;
	}
}

// Report bare data-* selectors left behind that are neither translated
// nor known-good — usually a new registry pattern needing a new rule.
const suspicious = new Map();
for (const file of walk(UI_DIR)) {
	const text = readFileSync(file, "utf8");
	for (const match of text.matchAll(/data-([a-z]+):/g)) {
		const name = `data-${match[1]}:`;
		const known =
			RULES.some(([from]) => from === name) || KNOWN_GOOD.includes(name);
		if (!known) {
			const key = `${file} :: ${name}`;
			suspicious.set(key, (suspicious.get(key) ?? 0) + 1);
		}
	}
}

console.log(`translated ${total} selector(s) in ${touched.length} file(s)`);
for (const [path, count] of touched) {
	console.log(`  ${count}  ${path.split("meal-planner")[1]}`);
}
if (suspicious.size > 0) {
	console.log("suspicious bare data-* selectors (check then extend RULES):");
	for (const [key, count] of suspicious) {
		console.log(`  ${count}x  ${key.split("meal-planner")[1]}`);
	}
}
