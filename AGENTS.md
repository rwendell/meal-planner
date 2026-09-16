## Project Configuration

- **Language**: TypeScript
- **Package Manager**: aube
- **Add-ons**: tailwindcss, ai-tools
- **Lint/Format**: Biome (`aube run lint`, `aube run lint:fix`) including `.svelte` files via `html.experimentalFullSupportEnabled`; `src/convex/_generated` is excluded (Convex codegen output). Keep using `svelte-check` too — Biome lints Svelte, svelte-check type-checks it.
- **Verify**: `aube run check` (biome + svelte-check) and `aube run build`
- **Pinned: bits-ui @ 2.19.2 exact (no caret) — do not upgrade or run `shadcn-svelte update`.** The registry's current component classes use `data-active:` / `data-horizontal:` shorthand selectors, but bits-ui stable (latest: 2.19.2) still emits `data-state="active"` / `data-orientation` attributes, so regenerated tabs/toggle/toggle-group/separator styles silently stop matching. Revisit only after a bits-ui stable release emits the new `data-active` / `data-horizontal` attributes.

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
