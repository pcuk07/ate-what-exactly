import type { Food, Goals, Macros, MealEntry, MealItem, Recipe, RestaurantItem } from "@awe/core";

/**
 * The translation boundary between snake_case database rows and camelCase
 * domain types. Nothing outside this file touches a raw row shape.
 */

export interface MealRow {
  id: string;
  user_id: string;
  logged_at: string;
  meal_type: string;
  tier: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  error_band: number;
  items: unknown;
  source: unknown;
  photo_path: string | null;
}

export interface FoodRow {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fibre_100g: number;
  serving_g: number | null;
  source: string;
}

export interface RestaurantItemRow {
  id: string;
  restaurant_name: string;
  item_name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  source_url: string | null;
}

export interface RecipeRow {
  id: string;
  user_id: string;
  name: string;
  ingredients: unknown;
  portions: number;
}

export interface GoalsRow {
  user_id: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  flexible_days: boolean;
}

export function toMealEntry(row: MealRow): MealEntry {
  const entry: MealEntry = {
    id: row.id,
    userId: row.user_id,
    loggedAt: row.logged_at,
    mealType: row.meal_type as MealEntry["mealType"],
    tier: row.tier as MealEntry["tier"],
    name: row.name,
    macros: {
      kcal: row.kcal,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      fibreG: row.fibre_g,
    },
    errorBand: row.error_band,
    items: (row.items as MealItem[]) ?? [],
    source: row.source as MealEntry["source"],
  };
  if (row.photo_path) entry.photoPath = row.photo_path;
  return entry;
}

export function fromMealEntry(entry: Omit<MealEntry, "id">): Omit<MealRow, "id"> {
  return {
    user_id: entry.userId,
    logged_at: entry.loggedAt,
    meal_type: entry.mealType,
    tier: entry.tier,
    name: entry.name,
    kcal: entry.macros.kcal,
    protein_g: entry.macros.proteinG,
    carbs_g: entry.macros.carbsG,
    fat_g: entry.macros.fatG,
    fibre_g: entry.macros.fibreG,
    error_band: entry.errorBand,
    items: entry.items,
    source: entry.source,
    photo_path: entry.photoPath ?? null,
  };
}

export function toFood(row: FoodRow): Food {
  const food: Food = {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    per100g: {
      kcal: row.kcal_100g,
      proteinG: row.protein_100g,
      carbsG: row.carbs_100g,
      fatG: row.fat_100g,
      fibreG: row.fibre_100g,
    },
    source: row.source === "override" ? "override" : "openfoodfacts",
  };
  if (row.brand) food.brand = row.brand;
  if (row.serving_g !== null) food.servingG = row.serving_g;
  return food;
}

export function fromFood(food: Food): Omit<FoodRow, "id"> {
  return {
    barcode: food.barcode,
    name: food.name,
    brand: food.brand ?? null,
    kcal_100g: food.per100g.kcal,
    protein_100g: food.per100g.proteinG,
    carbs_100g: food.per100g.carbsG,
    fat_100g: food.per100g.fatG,
    fibre_100g: food.per100g.fibreG,
    serving_g: food.servingG ?? null,
    source: food.source,
  };
}

export function toRestaurantItem(row: RestaurantItemRow): RestaurantItem {
  const item: RestaurantItem = {
    id: row.id,
    restaurantName: row.restaurant_name,
    itemName: row.item_name,
    macros: {
      kcal: row.kcal,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      fibreG: row.fibre_g,
    },
  };
  if (row.source_url) item.sourceUrl = row.source_url;
  return item;
}

export function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    ingredients: (row.ingredients as MealItem[]) ?? [],
    portions: row.portions,
  };
}

export function toGoals(row: GoalsRow): Goals {
  return {
    kcal: row.kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    fibreG: row.fibre_g,
    flexibleDays: row.flexible_days,
  };
}

export function macrosToRow(m: Macros) {
  return { kcal: m.kcal, protein_g: m.proteinG, carbs_g: m.carbsG, fat_g: m.fatG, fibre_g: m.fibreG };
}
