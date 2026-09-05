import type { Food } from "../types.js";

/**
 * Barcode resolution order (design doc §5.1): the Irish-overrides table wins
 * over Open Food Facts whenever both have a row. Overrides are where your own
 * corrections to bad OFF data live, so they must always take precedence.
 */
export async function resolveFood(
  barcode: string,
  lookups: {
    override: (barcode: string) => Promise<Food | null>;
    openFoodFacts: (barcode: string) => Promise<Food | null>;
  },
): Promise<Food | null> {
  const override = await lookups.override(barcode);
  if (override) return override;
  return lookups.openFoodFacts(barcode);
}
