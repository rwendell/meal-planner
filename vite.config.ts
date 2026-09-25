import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			inspector: true,
			// Fully client-side app (Convex backend lives in the cloud), so
			// ship static output hostable anywhere. `fallback` keeps
			// client-side routing (including the /meals redirect) working
			// for deep links without prerendering every state.
			adapter: adapter({ fallback: "200.html" }),
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
			},
		}),
	],
});
