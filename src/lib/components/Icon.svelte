<script module lang="ts">
	export type IconName =
		| "plus"
		| "search"
		| "bell"
		| "calendar"
		| "book"
		| "cart"
		| "check"
		| "close"
		| "leaf"
		| "utensils"
		| "spark"
		| "user"
		| "menu"
		| "cooking-pot"
		| "pencil"
		| "chevron-down"
		| "copy"
		| "user"
		| "globe";
</script>

<script lang="ts">
	let {
		name,
		size = 16,
		dataIcon,
	}: {
		name: IconName;
		size?: number;
		dataIcon?: "inline-start" | "inline-end";
	} = $props();
</script>

<svg
	width={size}
	height={size}
	data-icon={dataIcon}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === "plus"}
		<path d="M12 5v14M5 12h14" />
	{:else if name === "search"}
		<circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" />
	{:else if name === "bell"}
		<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" />
	{:else if name === "calendar"}
		<rect x="3" y="4.5" width="18" height="17" rx="2" /><path
			d="M16 2.5v4M8 2.5v4M3 9.5h18"
		/>
	{:else if name === "book"}
		<path d="M4 5.5a2 2 0 0 1 2-2h12v17H6a2 2 0 0 0-2 2z" /><path
			d="M4 20.5a2 2 0 0 1 2-2h12M8 8h6M8 12h6"
		/>
	{:else if name === "cart"}
		<path d="M5 8h14l-1 12H6L5 8Z" /><path
			d="M9 8a3 3 0 0 1 6 0M9 12v2M15 12v2"
		/>
	{:else if name === "check"}
		<path d="m5 12 4 4L19 6" />
	{:else if name === "close"}
		<path d="m6 6 12 12M18 6 6 18" />
	{:else if name === "leaf"}
		<path d="M20 4C11 4 5 8 5 14c0 3.3 2.7 6 6 6 6 0 9-7 9-16Z" /><path
			d="M4 20c3-4 6-6 11-8"
		/>
	{:else if name === "utensils"}
		<path
			d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 14v7M17 3v18M17 3c2 1 3 3 3 5 0 2-1 3-3 3"
		/>
	{:else if name === "menu"}
		<path d="M4 6h16M4 12h16M4 18h16" />
	{:else if name === "chevron-down"}
		<path d="m6 9 6 6 6-6" />
	{:else if name === "user"}
		<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle
			cx="12"
			cy="7"
			r="4"
		/>
	{:else if name === "globe"}
		<circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path
			d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
		/>
	{:else if name === "copy"}
		<rect width="14" height="14" x="8" y="8" rx="2" /><path
			d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
		/>
	{:else if name === "pencil"}
		<path
			d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
		/><path d="m15 5 4 4" />
	{:else}
		<path
			d="m12 3-1.3 5.7L5 10l5.7 1.3L12 17l1.3-5.7L19 10l-5.7-1.3L12 3Z"
		/>
	{/if}
</svg>
