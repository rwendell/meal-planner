import { type GroceryGroup, groceryGroups } from "$lib/utils/grocery.js";

export interface ShoppingListItem {
	key: string;
	name: string;
	amount: string;
	group: GroceryGroup;
	checked: boolean;
	coveredBy: "pantry" | "leftovers" | null;
}

export interface GroupedShoppingItems {
	group: GroceryGroup;
	items: ShoppingListItem[];
}

export function groupShoppingItems(
	items: ShoppingListItem[],
): GroupedShoppingItems[] {
	return groceryGroups.map((group) => ({
		group,
		items: items.filter((item) => item.group === group),
	}));
}

export function formatShoppingList(
	items: ShoppingListItem[],
	grouped: GroupedShoppingItems[],
): string {
	const lines: string[] = [`Shopping list (${items.length} items)`, ""];
	for (const group of grouped) {
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

export function shoppingProgress(items: ShoppingListItem[]): {
	done: number;
	total: number;
	pct: number;
} {
	const total = items.length;
	const done = items.filter((item) => item.checked).length;
	const pct = total ? Math.round((done / total) * 100) : 0;
	return { done, total, pct };
}
