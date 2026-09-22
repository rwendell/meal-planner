import type { GroceryGroup } from "$lib/grocery.js";
import {
	fallbackMealTimes,
	type MealCategory,
	type MealType,
} from "$lib/meal-types.js";

export interface PlannerMeal {
	id: string;
	name: string;
	category: MealCategory;
	note: string;
	time: number | null | undefined;
	color: string;
	ingredientCount: number;
	mealTimes: MealType[];
}

export interface DatabaseMeal extends PlannerMeal {
	sourceUrl: string | null;
	premade: boolean;
	ingredients: { name: string; amount?: string; group: GroceryGroup }[];
}

interface MealRow {
	_id: string;
	name: string;
	category: MealCategory;
	note: string;
	time: number | null | undefined;
	color: string;
	sourceUrl?: string | null;
	premade?: boolean;
	ingredients: {
		name: string;
		amount?: string | null;
		group: GroceryGroup;
	}[];
	mealTimes?: MealType[] | null;
}

export function mapToPlannerMeals(rows: readonly MealRow[]): PlannerMeal[] {
	return rows.map((meal) => ({
		id: meal._id,
		name: meal.name,
		category: meal.category,
		note: meal.note,
		time: meal.time,
		color: meal.color,
		ingredientCount: meal.ingredients.length,
		mealTimes: meal.mealTimes ?? fallbackMealTimes(meal.category),
	}));
}

export function mapToDatabaseMeals(rows: readonly MealRow[]): DatabaseMeal[] {
	return rows.map((meal) => ({
		id: meal._id,
		name: meal.name,
		category: meal.category,
		note: meal.note,
		time: meal.time,
		color: meal.color,
		sourceUrl: meal.sourceUrl ?? null,
		premade: meal.premade ?? false,
		ingredientCount: meal.ingredients.length,
		ingredients: meal.ingredients.map((ingredient) => ({
			name: ingredient.name,
			amount: ingredient.amount ?? undefined,
			group: ingredient.group,
		})),
		mealTimes: meal.mealTimes ?? fallbackMealTimes(meal.category),
	}));
}
