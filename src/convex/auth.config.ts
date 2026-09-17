// Convex injects process.env at deploy time; svelte-check has no Node
// types, so declare the sliver we use instead of adding @types/node.
declare const process: { env: Record<string, string | undefined> };

export default {
	providers: [
		{
			domain: process.env.CONVEX_SITE_URL,
			applicationID: "convex",
		},
	],
};
