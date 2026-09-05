/**
 * Domain types shared by the app, the API and the MCP connector.
 * These are the shapes business logic speaks in; database rows are mapped
 * to and from them at the repository boundary, never used directly.
 */

/** Confidence tier of a logged entry. See design doc §3. */
export type Tier = "A" | "B" | "C" | "D";

/** Which meal of the day an entry belongs to. Inferred from time, editable. */
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: readonly MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
] as const;

/** Calories plus the four core macros tracked in v1. */
export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
}

/** A single component of a meal, with a known or estimated weight. */
export interface MealItem {
  name: string;
  grams: number;
  /** Nutrition per 100 g of this component. */
  per100g: Macros;
}

/** Where an entry's numbers came from — the tier is derived from this. */
export type EntrySource =
  | { kind: "barcode"; barcode: string; foodId: string }
  | { kind: "recipe"; recipeId: string; portions: number }
  | { kind: "menu"; restaurantItemId: string }
  | { kind: "photo"; photoPath: string; visionModel: string }
  | { kind: "manual" };

export interface MealEntry {
  id: string;
  userId: string;
  /** ISO 8601 timestamp of when the meal was eaten. */
  loggedAt: string;
  mealType: MealType;
  tier: Tier;
  name: string;
  macros: Macros;
  /** Symmetric error band as a fraction, e.g. 0.3 for ±30 %. */
  errorBand: number;
  items: MealItem[];
  source: EntrySource;
  photoPath?: string;
}

/** A packaged food resolved from a barcode. */
export interface Food {
  id: string;
  barcode: string;
  name: string;
  brand?: string;
  per100g: Macros;
  servingG?: number;
  source: "openfoodfacts" | "override";
}

/** A chain restaurant menu item with voluntarily published nutrition. */
export interface RestaurantItem {
  id: string;
  restaurantName: string;
  itemName: string;
  macros: Macros;
  sourceUrl?: string;
}

/** A saved home-cooked recipe (Tier B). */
export interface Recipe {
  id: string;
  userId: string;
  name: string;
  ingredients: MealItem[];
  portions: number;
}

export interface Goals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
  /** Nutracheck's "Easier Days" idea: judge the week's average, not each day. */
  flexibleDays: boolean;
}

export const DEFAULT_GOALS: Goals = {
  kcal: 2000,
  proteinG: 120,
  carbsG: 220,
  fatG: 65,
  fibreG: 30,
  flexibleDays: true,
};
