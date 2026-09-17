import type { Infer } from "convex/values";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { groceryGroup } from "./schema";

type GroceryGroup = Infer<typeof groceryGroup>;

const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 15_000;

// Private/link-local hosts must never be fetched server-side.
function assertPublicUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new Error("Enter a valid recipe URL starting with http.");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Only http and https recipe links work.");
	}
	const host = url.hostname.toLowerCase();
	const blocked =
		host === "localhost" ||
		host === "0.0.0.0" ||
		host === "::1" ||
		host === "[::1]" ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		host.endsWith(".lan") ||
		/^127\./.test(host) ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host);
	if (blocked) {
		throw new Error("That address can't be imported.");
	}
	return url;
}

async function fetchHtml(url: URL): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url.toString(), {
			signal: controller.signal,
			headers: {
				"User-Agent":
					"Mozilla/5.0 (compatible; MealPlanner/1.0; +recipe-import)",
				Accept: "text/html,application/xhtml+xml",
			},
		});
		if (!response.ok) {
			throw new Error(`Couldn't fetch that page (HTTP ${response.status}).`);
		}
		const length = Number(response.headers.get("content-length") ?? 0);
		if (Number.isFinite(length) && length > MAX_BYTES * 4) {
			throw new Error("That page is too large to import.");
		}
		const buffer = await response.arrayBuffer();
		if (buffer.byteLength > MAX_BYTES * 4) {
			throw new Error("That page is too large to import.");
		}
		return new TextDecoder().decode(buffer).slice(0, MAX_BYTES);
	} catch (error) {
		if (error instanceof Error && /aborted/i.test(error.message)) {
			throw new Error("Fetching that page timed out.");
		}
		throw error instanceof Error
			? error
			: new Error("Couldn't fetch that page.");
	} finally {
		clearTimeout(timer);
	}
}

function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code: string) =>
			String.fromCharCode(Number(code)),
		)
		.replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
			String.fromCharCode(Number.parseInt(code, 16)),
		)
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ");
}

function cleanText(value: unknown, max = 500): string {
	if (typeof value !== "string") return "";
	return decodeEntities(value).replace(/\s+/g, " ").trim().slice(0, max);
}

type JsonLd = Record<string, unknown>;

function collectNodes(data: unknown, out: JsonLd[]): void {
	if (Array.isArray(data)) {
		for (const item of data) collectNodes(item, out);
		return;
	}
	if (typeof data !== "object" || data === null) return;
	const node = data as JsonLd;
	out.push(node);
	collectNodes(node["@graph"], out);
}

function isRecipeNode(node: JsonLd): boolean {
	const type = node["@type"];
	const types = Array.isArray(type) ? type : [type];
	return types.some(
		(t) =>
			typeof t === "string" &&
			(t === "Recipe" || t.endsWith("/Recipe") || t.endsWith("#Recipe")),
	);
}

function findRecipe(html: string): JsonLd | null {
	const pattern =
		/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	for (;;) {
		const match = pattern.exec(html);
		if (match === null) break;
		const raw = match[1] ?? "";
		if (!raw || raw.length > MAX_BYTES) continue;
		try {
			const nodes: JsonLd[] = [];
			collectNodes(JSON.parse(raw), nodes);
			for (const node of nodes) {
				if (isRecipeNode(node)) return node;
			}
		} catch {
			// Malformed JSON-LD block; try the next one.
		}
	}
	return null;
}

function parseMinutes(iso: unknown): number | null {
	if (typeof iso !== "string") return null;
	const match =
		/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
			iso.trim(),
		);
	if (!match) return null;
	const days = Number(match[1] ?? 0);
	const hours = Number(match[2] ?? 0);
	const minutes = Number(match[3] ?? 0);
	const seconds = Number(match[4] ?? 0);
	const total = days * 1440 + hours * 60 + minutes + Math.floor(seconds / 60);
	return total > 0 ? total : null;
}

const SIZE_ADJECTIVE = "small|medium|large|big";
const AMOUNT_UNIT =
	"(?:cups?|tablespoons?|teaspoons?|tbsp|tsp|oz|fluid ounces?|fl\\.? oz\\.?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|litres?|cloves?|cans?|packages?|packets?|slices?|bunch(?:es)?|heads?|ears?|ribs?|wedges?|knobs?|links?|fillets?|pinch(?:es)?|dash(?:es)?|stalks?|sprigs?|scoops?|pieces?|strips?|cubes?|chunks?|inch(?:es)?|cm)";
const MIXED_NUMBER = "\\d+\\s+\\d+\\/\\d+";
const PLAIN_NUMBER = "[\\d.,\\/¼½¾⅓⅔⅛⅜⅝⅞-]+";
// Quantity, then at most one size adjective and one unit, sharing single
// separators — so "8 small corn tortillas" keeps "8 small" together and
// "2 large tomatoes" doesn't strand the adjective in the name.
const LEADING_AMOUNT = new RegExp(
	`^\\s*((?:${MIXED_NUMBER}|${PLAIN_NUMBER})(?:\\s*\\([^)]*\\))?(?:\\s+(?:${SIZE_ADJECTIVE}))?(?:\\s+${AMOUNT_UNIT})?)\\s+(.+)$`,
	"i",
);

/** "2 cups flour" -> { amount: "2 cups", name: "flour" }. */
function splitIngredient(line: string): { amount?: string; name: string } {
	const cleaned = line.replace(/\s+/g, " ").trim();
	if (!cleaned) return { name: "" };
	const match = LEADING_AMOUNT.exec(cleaned);
	if (!match) return { name: cleaned };
	const amount = (match[1] ?? "").trim().replace(/[.,;]+$/, "");
	const name = (match[2] ?? "").trim();
	// A bare number with nothing meaningful after it isn't an amount.
	if (!name || amount.length > 40) return { name: cleaned };
	return { amount: amount || undefined, name };
}

const GROUP_KEYWORDS: Array<{ group: GroceryGroup; words: string[] }> = [
	{
		group: "Produce",
		words: [
			"onion",
			"garlic",
			"tomato",
			"potato",
			"carrot",
			"celery",
			"pepper",
			"cucumber",
			"lettuce",
			"spinach",
			"kale",
			"cabbage",
			"broccoli",
			"cauliflower",
			"zucchini",
			"squash",
			"mushroom",
			"avocado",
			"lemon",
			"lime",
			"orange",
			"apple",
			"banana",
			"berry",
			"berries",
			"mango",
			"peach",
			"pear",
			"grape",
			"melon",
			"herb",
			"basil",
			"parsley",
			"cilantro",
			"coriander",
			"thyme",
			"rosemary",
			"oregano",
			"dill",
			"mint",
			"ginger",
			"scallion",
			"leek",
			"corn",
			"bean sprout",
			"salad",
			"fruit",
			"vegetable",
		],
	},
	{
		group: "Dairy & Eggs",
		words: [
			"milk",
			"egg",
			"butter",
			"cheese",
			"cream",
			"yogurt",
			"yoghurt",
			"sour cream",
			"mozzarella",
			"parmesan",
			"cheddar",
			"feta",
			"ricotta",
			"cottage cheese",
			"ghee",
			"half-and-half",
		],
	},
	{
		group: "Meat & Seafood",
		words: [
			"chicken",
			"beef",
			"pork",
			"turkey",
			"bacon",
			"sausage",
			"ham",
			"lamb",
			"veal",
			"duck",
			"fish",
			"salmon",
			"tuna",
			"shrimp",
			"prawn",
			"crab",
			"lobster",
			"clam",
			"mussel",
			"scallop",
			"cod",
			"tilapia",
			"steak",
			"ground meat",
			"tofu",
			"tempeh",
			"seitan",
		],
	},
	{
		group: "Bakery & Deli",
		words: [
			"bread",
			"bun",
			"roll",
			"bagel",
			"croissant",
			"tortilla",
			"pita",
			"pizza dough",
			"pastry",
			"cake",
			"hummus",
			"deli",
		],
	},
	{
		group: "Frozen",
		words: ["frozen", "ice cream", "puff pastry", "phyllo"],
	},
	{
		group: "Beverages",
		words: [
			"water",
			"juice",
			"wine",
			"beer",
			"stock",
			"broth",
			"soda",
			"coffee",
			"tea",
			"coconut water",
		],
	},
	{
		group: "Pantry Staples",
		words: [
			"flour",
			"sugar",
			"salt",
			"pepper",
			"oil",
			"olive oil",
			"vinegar",
			"rice",
			"pasta",
			"noodle",
			"oat",
			"cereal",
			"spice",
			"cumin",
			"paprika",
			"cinnamon",
			"chili",
			"chilli",
			"curry",
			"soy sauce",
			"ketchup",
			"mustard",
			"mayo",
			"honey",
			"syrup",
			"vanilla",
			"baking",
			"yeast",
			"lentil",
			"chickpea",
			"kidney bean",
			"black bean",
			"quinoa",
			"barley",
			"nut",
			"almond",
			"walnut",
			"peanut",
			"chocolate",
			"cocoa",
			"coffee",
			"tea bag",
			"canned",
			"jar",
			"sauce",
			"paste",
		],
	},
];

/** Best-effort grocery group from the ingredient name. */
export function guessGroup(name: string): GroceryGroup {
	const lower = name.toLowerCase();
	for (const { group, words } of GROUP_KEYWORDS) {
		if (words.some((word) => lower.includes(word))) return group;
	}
	return "Other";
}

// Pantry staples nobody shops for: matched against the name up to the
// first comma ("salt, to taste" -> "salt"), so "salted butter" survives.
const STAPLE_PATTERN =
	/^(?:freshly ground |ground |cracked )?(?:sea salt|kosher salt|table salt|flaky salt|flaked salt|salt|black pepper|white pepper|peppercorns?|pepper|ice water|ice|water|salt and pepper|salt & pepper|pepper and salt)$/;

function isStaple(name: string): boolean {
	const base = name.split(",")[0]?.trim().toLowerCase() ?? "";
	return STAPLE_PATTERN.test(base);
}

function flattenInstructions(value: unknown): string[] {
	const steps: string[] = [];
	const visit = (node: unknown): void => {
		if (typeof node === "string") {
			const text = node.replace(/\s+/g, " ").trim();
			if (text) steps.push(text);
			return;
		}
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (typeof node === "object" && node !== null) {
			const record = node as Record<string, unknown>;
			if (typeof record.text === "string") {
				visit(record.text);
				return;
			}
			visit(record.itemListElement);
		}
	};
	visit(value);
	return steps;
}

const ingredientValidator = v.object({
	name: v.string(),
	amount: v.optional(v.string()),
	group: groceryGroup,
});

/**
 * Import a recipe from a cooking website that publishes schema.org
 * Recipe JSON-LD (most major recipe sites do). Returns normalized
 * fields for the meal form to prefill — nothing is saved.
 */
export const importFromUrl = action({
	args: { url: v.string() },
	handler: async (_ctx, args) => {
		const url = assertPublicUrl(args.url);
		const html = await fetchHtml(url);
		const recipe = findRecipe(html);
		if (!recipe) {
			throw new Error("No recipe found on that page.");
		}
		const name = cleanText(recipe.name, 80);
		if (!name) {
			throw new Error("That recipe has no usable title.");
		}
		const rawIngredients = Array.isArray(recipe.recipeIngredient)
			? recipe.recipeIngredient
			: [];
		const skippedStaples: string[] = [];
		const ingredients = rawIngredients
			.filter((line) => typeof line === "string")
			.map((line) => line as string)
			.map((line) => {
				const { amount, name: item } = splitIngredient(decodeEntities(line));
				return { amount, name: item.slice(0, 120) };
			})
			.filter((item) => {
				if (!item.name) return false;
				if (isStaple(item.name)) {
					const staple = item.name.toLowerCase();
					if (!skippedStaples.includes(staple)) {
						skippedStaples.push(staple);
					}
					return false;
				}
				return true;
			})
			.slice(0, 60)
			.map((item) => ({
				name: item.name,
				...(item.amount ? { amount: item.amount } : {}),
				group: guessGroup(item.name),
			}));
		const description = cleanText(recipe.description, 300);
		const steps = flattenInstructions(recipe.recipeInstructions);
		const note = (description || steps.slice(0, 3).join(" ")).slice(0, 500);
		const time =
			parseMinutes(recipe.totalTime) ??
			(() => {
				const prep = parseMinutes(recipe.prepTime) ?? 0;
				const cook = parseMinutes(recipe.cookTime) ?? 0;
				const total = prep + cook;
				return total > 0 ? total : null;
			})();
		return {
			name,
			note,
			time,
			sourceUrl: url.toString(),
			ingredients,
			skippedStaples,
		};
	},
	returns: v.object({
		name: v.string(),
		note: v.string(),
		time: v.union(v.number(), v.null()),
		sourceUrl: v.string(),
		ingredients: v.array(ingredientValidator),
		skippedStaples: v.array(v.string()),
	}),
});
