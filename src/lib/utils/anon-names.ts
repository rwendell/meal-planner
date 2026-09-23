/**
 * Anonymous display names: {Adjective} {Produce}, in the spirit of
 * Google Docs' anonymous animals. Used for members who haven't signed
 * in (or picked a name) yet; replaced by the OAuth profile name on
 * first link.
 */

const ADJECTIVES = [
	"Sunny",
	"Crispy",
	"Golden",
	"Fresh",
	"Zesty",
	"Mellow",
	"Bright",
	"Cozy",
	"Tangy",
	"Sweet",
	"Savory",
	"Juicy",
	"Toasty",
	"Peppery",
	"Buttery",
	"Herby",
	"Minty",
	"Citrusy",
	"Velvety",
	"Smoky",
	"Nutty",
	"Honeyed",
	"Lemony",
	"Rosy",
] as const;

const PRODUCE = [
	"Tomato",
	"Kale",
	"Basil",
	"Mango",
	"Avocado",
	"Carrot",
	"Peach",
	"Plum",
	"Berry",
	"Melon",
	"Squash",
	"Pepper",
	"Onion",
	"Garlic",
	"Lemon",
	"Lime",
	"Apple",
	"Pear",
	"Grape",
	"Cherry",
	"Cucumber",
	"Radish",
	"Thyme",
	"Sage",
] as const;

function pick<T>(items: readonly T[]): T {
	const item = items[Math.floor(Math.random() * items.length)];
	if (item === undefined) throw new Error("Empty name list.");
	return item;
}

/** A random "Sunny Tomato"-style display name. */
export function randomAnonName(): string {
	return `${pick(ADJECTIVES)} ${pick(PRODUCE)}`;
}
