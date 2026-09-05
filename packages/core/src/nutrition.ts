import type { Macros, MealItem } from "./types.js";

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Scale a per-100 g nutrition profile to a given weight. */
export function scaleMacros(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: round1(per100g.kcal * f),
    proteinG: round1(per100g.proteinG * f),
    carbsG: round1(per100g.carbsG * f),
    fatG: round1(per100g.fatG * f),
    fibreG: round1(per100g.fibreG * f),
  };
}

export function sumMacros(list: readonly Macros[]): Macros {
  return list.reduce<Macros>(
    (acc, m) => ({
      kcal: round1(acc.kcal + m.kcal),
      proteinG: round1(acc.proteinG + m.proteinG),
      carbsG: round1(acc.carbsG + m.carbsG),
      fatG: round1(acc.fatG + m.fatG),
      fibreG: round1(acc.fibreG + m.fibreG),
    }),
    ZERO_MACROS,
  );
}

export function multiplyMacros(m: Macros, factor: number): Macros {
  return {
    kcal: round1(m.kcal * factor),
    proteinG: round1(m.proteinG * factor),
    carbsG: round1(m.carbsG * factor),
    fatG: round1(m.fatG * factor),
    fibreG: round1(m.fibreG * factor),
  };
}

/** Total nutrition of a list of components. */
export function itemsTotal(items: readonly MealItem[]): Macros {
  return sumMacros(items.map((i) => scaleMacros(i.per100g, i.grams)));
}

/** One portion of a recipe: total of all raw ingredients divided by portions. */
export function recipePortion(ingredients: readonly MealItem[], portions: number): Macros {
  if (portions <= 0) throw new RangeError("portions must be > 0");
  return multiplyMacros(itemsTotal(ingredients), 1 / portions);
}

/**
 * Energy implied by the macros (Atwater factors: 4/4/9, fibre ≈ 2).
 * Used as a sanity check on label data and vision output — a reported
 * kcal figure far from this is a sign of a bad row, not a precise one.
 */
export function kcalFromMacros(m: Macros): number {
  return round1(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9 + m.fibreG * 2);
}

/**
 * Fractional disagreement between reported kcal and macro-implied kcal.
 * 0 = perfect agreement. > 0.25 is treated as suspicious by callers.
 */
export function macroConsistency(m: Macros): number {
  const implied = kcalFromMacros(m);
  if (implied === 0 && m.kcal === 0) return 0;
  return Math.abs(m.kcal - implied) / Math.max(implied, m.kcal, 1);
}
