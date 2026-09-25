## Project Configuration

- **Language**: TypeScript
- **Package Manager**: aube
- **Add-ons**: tailwindcss, ai-tools
- **Lint/Format**: Biome (`aube run lint`, `aube run lint:fix`) including `.svelte` files via `html.experimentalFullSupportEnabled`; `src/convex/_generated` is excluded (Convex codegen output). Keep using `svelte-check` too — Biome lints Svelte, svelte-check type-checks it.
- **Verify**: `aube run check` (biome + svelte-check) and `aube run build`
- **bits-ui @ ^2.19.3 (caret; lockfile pins installs) — `shadcn-svelte add` is allowed.** Installed registry code targets newer bits-ui in places: `data-[disabled=true]` selectors don't match bits-ui's empty-string `data-disabled` (disabled styling silently dead — verify visually), and `command.svelte` uses the newer `bind:this={api}` model. Known-good: `data-selected:` (presence) and `aria-selected:` selectors match. After any bits-ui bump or registry update, eyeball interactive states (selected/disabled/focus) — automated checks can't catch pure CSS mismatches. One hand-verified deviation: `ui/command/command-input.svelte` forwards `bind:ref` straight to the primitive (registry routes through InputGroup, which drops it) so callers can focus the search box.
- **ui/ tracks shadcn registry; `scripts/translate-shadcn-selectors.mjs` adapts selectors to installed bits-ui.** Registry targets newer attribute forms than installed bits-ui emits — run the script after every `shadcn-svelte add`/`update` touching ui/ (it's idempotent; it reports per-file counts plus suspicious unknown patterns). It must be source translation, not a build plugin: Tailwind v4 emits utilities downstream of per-module transforms, so build-time rewriting can't cover the dev server. Verify in *both* dev-served CSS (`/src/routes/layout.css`) and build output. After any bits-ui bump or registry update, eyeball interactive states (selected/disabled/focus, dialog animations) — automated checks can't catch pure CSS mismatches. One hand-verified deviation: `ui/command/command-input.svelte` forwards `bind:ref` straight to the primitive (registry routes through InputGroup, which drops it) so callers can focus the search box.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`src/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
