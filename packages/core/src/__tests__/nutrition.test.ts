import { describe, expect, it } from "vitest";
import {
  itemsTotal,
  kcalFromMacros,
  macroConsistency,
  recipePortion,
  scaleMacros,
  sumMacros,
} from "../nutrition.js";
import type { Macros, MealItem } from "../types.js";

const oats: Macros = { kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5, fibreG: 10.1 };
const banana: Macros = { kcal: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3, fibreG: 2.6 };

describe("scaleMacros", () => {
  it("scales a per-100g profile to a weight", () => {
    expect(scaleMacros(oats, 50)).toEqual({
      kcal: 189.5,
      proteinG: 6.6,
      carbsG: 33.9,
      fatG: 3.3,
      fibreG: 5.1,
    });
  });

  it("returns zeros for a zero weight", () => {
    expect(scaleMacros(oats, 0).kcal).toBe(0);
  });
});

describe("itemsTotal", () => {
  it("sums scaled components", () => {
    const items: MealItem[] = [
      { name: "porridge oats", grams: 50, per100g: oats },
      { name: "banana", grams: 120, per100g: banana },
    ];
    const total = itemsTotal(items);
    // 189.5 + 106.8
    expect(total.kcal).toBeCloseTo(296.3, 1);
    expect(total.proteinG).toBeCloseTo(7.9, 1);
  });

  it("is zero for no components", () => {
    expect(itemsTotal([]).kcal).toBe(0);
  });
});

describe("recipePortion", () => {
  it("divides the batch by the number of portions", () => {
    const items: MealItem[] = [{ name: "oats", grams: 200, per100g: oats }];
    expect(recipePortion(items, 4).kcal).toBeCloseTo(189.5, 1);
  });

  it("rejects a non-positive portion count", () => {
    expect(() => recipePortion([], 0)).toThrow(RangeError);
  });
});

describe("macro consistency", () => {
  it("agrees with Atwater factors on a sane row", () => {
    // 1.1×4 + 22.8×4 + 0.3×9 + 2.6×2
    expect(kcalFromMacros(banana)).toBeCloseTo(103.5, 1);
    expect(macroConsistency({ ...banana, kcal: 105 })).toBeLessThan(0.05);
  });

  it("flags a row whose calories contradict its macros", () => {
    const bogus: Macros = { kcal: 20, proteinG: 10, carbsG: 40, fatG: 20, fibreG: 0 };
    expect(macroConsistency(bogus)).toBeGreaterThan(0.25);
  });

  it("treats an all-zero row as consistent", () => {
    expect(macroConsistency({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 })).toBe(0);
  });
});

describe("sumMacros", () => {
  it("adds macro sets without float drift", () => {
    const total = sumMacros([
      { kcal: 0.1, proteinG: 0.1, carbsG: 0.1, fatG: 0.1, fibreG: 0.1 },
      { kcal: 0.2, proteinG: 0.2, carbsG: 0.2, fatG: 0.2, fibreG: 0.2 },
    ]);
    expect(total.kcal).toBe(0.3);
  });
});
