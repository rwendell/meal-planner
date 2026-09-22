export interface CountedMeal {
	id: string;
	count: number;
}

export function sameCountedMeals(a: CountedMeal[], b: CountedMeal[]): boolean {
	return (
		a.length === b.length &&
		a.every((meal, i) => meal.id === b[i]?.id && meal.count === b[i]?.count)
	);
}

export function pruneDraftMeals(
	drafts: CountedMeal[],
	mealsById: Map<string, unknown>,
): CountedMeal[] {
	return drafts.filter((meal) => mealsById.has(meal.id) && meal.count > 0);
}
