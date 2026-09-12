<script lang="ts">
	import { useMutation, useQuery } from "convex-svelte";
	import Icon from "$lib/components/Icon.svelte";
	import { todayISO, weekDates } from "$lib/dates.js";
	import { session } from "$lib/session.svelte.js";
	import { api } from "../../convex/_generated/api.js";
	import type { Id } from "../../convex/_generated/dataModel";

	interface GroceryItem {
		key: string;
		name: string;
		amount: string;
		group: "Produce" | "Pantry" | "Dairy";
		checked: boolean;
	}

	const groceryGroups: GroceryItem["group"][] = [
		"Produce",
		"Pantry",
		"Dairy",
	];

	let toast = $state("");

	let householdId = $derived(session.session?.householdId ?? null);
	// The unified list covers everyone's plans for the current week.
	let listDates = $derived(weekDates(todayISO()));

	const shoppingQuery = useQuery(api.shopping.list, () =>
		householdId
			? {
					householdId: householdId as Id<"households">,
					dates: listDates,
				}
			: "skip",
	);

	const setItemChecked = useMutation(api.shopping.setChecked);

	let listItems = $derived<GroceryItem[]>(
		(shoppingQuery.data ?? []).map((item) => ({
			key: item.key,
			name: item.name,
			amount: item.amount ?? "",
			group: item.group,
			checked: item.checked,
		})),
	);
	let groupedList = $derived(
		groceryGroups.map((group) => ({
			group,
			items: listItems.filter((item) => item.group === group),
		})),
	);
	let doneCount = $derived(listItems.filter((item) => item.checked).length);
	let listPct = $derived(
		listItems.length ? Math.round((doneCount / listItems.length) * 100) : 0,
	);

	let dataLoading = $derived(shoppingQuery.isLoading);
	let dataError = $derived(shoppingQuery.error);

	async function toggleItem(item: GroceryItem): Promise<void> {
		if (!householdId) return;
		await setItemChecked({
			householdId: householdId as Id<"households">,
			key: item.key,
			name: item.name,
			amount: item.amount || undefined,
			group: item.group,
			checked: !item.checked,
		});
	}

	function formatList(): string {
		const lines: string[] = [
			`Shopping list (${listItems.length} items)`,
			"",
		];
		for (const group of groupedList) {
			if (group.items.length === 0) continue;
			lines.push(group.group);
			for (const item of group.items) {
				const box = item.checked ? "[x]" : "[ ]";
				lines.push(
					`${box} ${item.name}${item.amount ? ` — ${item.amount}` : ""}`,
				);
			}
			lines.push("");
		}
		return lines.join("\n").trimEnd();
	}

	async function copyText(text: string): Promise<boolean> {
		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(text);
				return true;
			}
			throw new Error("clipboard unavailable");
		} catch {
			try {
				const area = document.createElement("textarea");
				area.value = text;
				area.setAttribute("readonly", "");
				area.style.position = "fixed";
				area.style.opacity = "0";
				document.body.appendChild(area);
				area.focus();
				area.select();
				area.setSelectionRange(0, area.value.length);
				const ok = document.execCommand("copy");
				area.remove();
				return ok;
			} catch {
				return false;
			}
		}
	}

	async function copyList(): Promise<void> {
		const ok = await copyText(formatList());
		toast = ok
			? "Shopping list copied to clipboard"
			: "Copy was blocked by the browser";
	}
</script>

<svelte:head>
	<title>Shopping list · Meal Planner</title>
	<meta
		name="description"
		content="Generate a shopping list from the planned meals."
	/>
</svelte:head>

<main>
	<section class="panel shopping-panel" aria-labelledby="shopping-title">
		<div class="section-head">
			<div>
				<p class="eyebrow">Generated from the plan</p>
				<h2 id="shopping-title">Shopping list</h2>
			</div>
			<span class="round-icon"><Icon name="cart" size={17} /></span>
		</div>
		{#if dataError}
			<p class="error-note" role="alert">
				Couldn't reach the database ({dataError.message}). Check your
				connection and reload.
			</p>
		{/if}
		{#if dataLoading}
			<p class="sync-note">Syncing…</p>
		{/if}
		{#if listItems.length > 0}
			<div class="export-row">
				<button type="button" class="ghost compact" onclick={copyList}
					>Export to clipboard</button
				>
			</div>
		{/if}
		<div class="list-progress">
			<strong>{doneCount}<small>/{listItems.length}</small></strong><span
				>{listPct}%</span
			>
			<div class="meter">
				<span style={`width: ${listPct}%`}></span>
			</div>
		</div>
		{#each groupedList as group (group.group)}
			{#if group.items.length}
				<div class="grocery-group">
					<h3>
						{group.group}<span>{group.items.length}</span>
					</h3>
					{#each group.items as item (item.key)}
						<label class="grocery-item">
							<input
								type="checkbox"
								checked={item.checked}
								onchange={() => toggleItem(item)}
							/>
							<span class:done={item.checked}>{item.name}</span>
							{#if item.amount}<small>{item.amount}</small>{/if}
						</label>
					{/each}
				</div>
			{/if}
		{/each}
		{#if !dataLoading && listItems.length === 0}
			<div class="empty-state">
				<strong>No items yet</strong>
			</div>
		{/if}
		<p class="hint">Meals without ingredients are skipped automatically.</p>
	</section>
</main>

{#if toast}
	<div class="toast" role="status">
		<Icon name="check" size={13} />
		{toast}
		<button type="button" aria-label="Dismiss" onclick={() => (toast = "")}
			><Icon name="close" size={12} /></button
		>
	</div>
{/if}

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global(body) {
		min-width: 320px;
		background: var(--app-canvas);
		color: var(--app-ink);
	}
	main {
		max-width: 1180px;
		margin: 0 auto;
		padding: 20px 18px 72px;
	}
	.eyebrow {
		margin: 0 0 8px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--app-faint);
	}
	h2,
	p {
		margin-top: 0;
	}
	h2 {
		font-family: Georgia, "Times New Roman", serif;
		letter-spacing: -0.045em;
		margin-bottom: 0;
		font-size: 26px;
		color: var(--app-ink);
	}
	button,
	input {
		font: inherit;
	}
	button {
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 1px solid var(--app-line-strong);
		border-radius: 12px;
		padding: 11px 14px;
		background: var(--app-surface-soft);
		color: var(--app-ink);
		font-size: 12px;
		font-weight: 800;
	}
	.ghost.compact {
		padding: 9px 11px;
	}
	.panel {
		margin-top: 22px;
		padding: 20px 16px;
		border: 1px solid var(--app-line);
		border-radius: 22px;
		background: var(--app-surface-soft);
	}
	.section-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}
	.error-note {
		margin: 0 0 14px;
		padding: 10px 14px;
		border-radius: 12px;
		background: #f7e3da;
		color: #9a4b32;
		font-size: 12px;
		font-weight: 600;
	}
	@media (prefers-color-scheme: dark) {
		:root:not([data-theme="light"]) .error-note {
			background: #3a231b;
			color: #e8a583;
		}
	}
	:root[data-theme="dark"] .error-note {
		background: #3a231b;
		color: #e8a583;
	}
	.sync-note {
		font-size: 11px;
		color: var(--app-faint);
	}
	.export-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 16px;
	}
	.shopping-panel {
		background: var(--app-shop);
		border-color: var(--app-line);
	}
	.round-icon {
		display: grid;
		width: 38px;
		height: 38px;
		place-items: center;
		border-radius: 12px;
		background: #c8ddcb;
		color: #416b55;
	}
	@media (prefers-color-scheme: dark) {
		:root:not([data-theme="light"]) .round-icon {
			background: #2b3a31;
			color: #93c39f;
		}
	}
	:root[data-theme="dark"] .round-icon {
		background: #2b3a31;
		color: #93c39f;
	}
	.list-progress {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		gap: 10px;
		margin-bottom: 18px;
	}
	.list-progress strong {
		font-family: Georgia, serif;
		font-size: 30px;
		color: var(--app-ink);
	}
	.list-progress small {
		font-family: inherit;
		font-size: 12px;
		color: var(--app-muted);
	}
	.list-progress > span {
		font-size: 11px;
		font-weight: 800;
		color: var(--app-muted);
	}
	.meter {
		grid-column: 1 / -1;
		height: 8px;
		overflow: hidden;
		border-radius: 999px;
		background: #bdd2c1;
	}
	.meter span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: #507b62;
		transition: width 0.3s ease;
	}
	@media (prefers-color-scheme: dark) {
		:root:not([data-theme="light"]) .meter {
			background: #2b3a31;
		}
		:root:not([data-theme="light"]) .meter span {
			background: #7ba889;
		}
	}
	:root[data-theme="dark"] .meter {
		background: #2b3a31;
	}
	:root[data-theme="dark"] .meter span {
		background: #7ba889;
	}
	.grocery-group {
		margin-top: 16px;
	}
	.grocery-group h3 {
		display: flex;
		justify-content: space-between;
		margin-bottom: 6px;
		color: var(--app-muted);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.grocery-group h3 span {
		color: var(--app-faint);
	}
	.grocery-item {
		display: flex;
		flex: 1;
		align-items: center;
		min-width: 0;
		gap: 9px;
		padding: 7px 6px;
		border-radius: 9px;
		cursor: pointer;
		font-size: 12px;
		color: var(--app-ink);
	}
	.grocery-item:hover {
		background: color-mix(in srgb, var(--app-surface) 65%, transparent);
	}
	.grocery-item input {
		width: 16px;
		height: 16px;
		accent-color: #507b62;
	}
	.grocery-item span {
		flex: 1;
		min-width: 0;
	}
	.grocery-item span.done {
		color: #96a39a;
		text-decoration: line-through;
	}
	.grocery-item small {
		color: var(--app-faint);
		font-size: 10px;
	}
	.hint {
		margin: 12px 0 0;
		font-size: 11px;
		color: var(--app-muted);
	}
	.empty-state {
		padding: 34px 16px;
		border: 1px dashed var(--app-line-strong);
		border-radius: 16px;
		text-align: center;
		color: var(--app-muted);
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: 18px;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 8px;
		transform: translateX(-50%);
		padding: 11px 13px;
		border-radius: 12px;
		background: var(--app-dark);
		color: var(--app-dark-ink);
		font-size: 12px;
		font-weight: 700;
		box-shadow: 0 12px 30px rgba(23, 34, 31, 0.22);
	}
	.toast button {
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		color: var(--app-dark-muted);
	}
	@media (max-width: 1023px) {
		.toast {
			bottom: 78px;
		}
	}

	@media (min-width: 560px) {
		main {
			padding: 24px 28px 80px;
		}
	}

	@media (min-width: 1024px) {
		main {
			padding: 34px 40px 80px;
		}
	}
</style>
