import { describe, expect, it } from "vitest";
import { fetchOpenFoodFacts, parseOpenFoodFactsProduct } from "../sources/open-food-facts.js";
import { resolveFood } from "../sources/resolve-food.js";
import type { Food } from "../types.js";
import offFixture from "../../fixtures/off-oats.json" with { type: "json" };

describe("parseOpenFoodFactsProduct", () => {
  it("maps a real product response", () => {
    const food = parseOpenFoodFactsProduct(offFixture);
    expect(food).not.toBeNull();
    expect(food!.name).toBe("Porridge Oats");
    expect(food!.brand).toBe("Flahavan's");
    expect(food!.per100g.kcal).toBe(372);
    expect(food!.per100g.proteinG).toBe(11);
    expect(food!.servingG).toBe(40);
    expect(food!.source).toBe("openfoodfacts");
  });

  it("converts kJ when kcal is absent", () => {
    const food = parseOpenFoodFactsProduct({
      status: 1,
      product: {
        code: "111",
        product_name: "Test",
        nutriments: { energy_100g: 418.4, proteins_100g: 1 },
      },
    });
    expect(food!.per100g.kcal).toBe(100);
  });

  it("returns null when the product is missing", () => {
    expect(parseOpenFoodFactsProduct({ status: 0, status_verbose: "not found" })).toBeNull();
  });

  it("returns null rather than logging a confident zero when energy is unusable", () => {
    expect(
      parseOpenFoodFactsProduct({
        status: 1,
        product: { code: "1", product_name: "No energy", nutriments: { proteins_100g: 3 } },
      }),
    ).toBeNull();
  });

  it("returns null when the product has no name", () => {
    expect(
      parseOpenFoodFactsProduct({
        status: 1,
        product: { code: "1", nutriments: { "energy-kcal_100g": 100 } },
      }),
    ).toBeNull();
  });
});

describe("fetchOpenFoodFacts", () => {
  it("sends the contact User-Agent Open Food Facts asks for", async () => {
    let seen: Record<string, string> | undefined;
    const food = await fetchOpenFoodFacts(
      "5099073000191",
      async (_url, init) => {
        seen = init?.headers;
        return { ok: true, status: 200, json: async () => offFixture };
      },
      "awe/0.1 (hello@example.com)",
    );
    expect(seen?.["User-Agent"]).toContain("awe");
    expect(food?.name).toBe("Porridge Oats");
  });

  it("treats 404 as not found, not an error", async () => {
    const food = await fetchOpenFoodFacts(
      "000",
      async () => ({ ok: false, status: 404, json: async () => ({}) }),
      "test",
    );
    expect(food).toBeNull();
  });

  it("throws on a server error so the caller can fall back", async () => {
    await expect(
      fetchOpenFoodFacts("000", async () => ({ ok: false, status: 503, json: async () => ({}) }), "t"),
    ).rejects.toThrow(/503/);
  });
});

describe("resolveFood", () => {
  const override: Food = {
    id: "ovr:1",
    barcode: "5099073000191",
    name: "Porridge Oats (corrected)",
    per100g: { kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5, fibreG: 10.1 },
    source: "override",
  };

  it("prefers the Irish override over Open Food Facts", async () => {
    const food = await resolveFood("5099073000191", {
      override: async () => override,
      openFoodFacts: async () => parseOpenFoodFactsProduct(offFixture),
    });
    expect(food?.source).toBe("override");
  });

  it("falls back to Open Food Facts when there is no override", async () => {
    const food = await resolveFood("5099073000191", {
      override: async () => null,
      openFoodFacts: async () => parseOpenFoodFactsProduct(offFixture),
    });
    expect(food?.source).toBe("openfoodfacts");
  });

  it("returns null when neither source has the barcode", async () => {
    expect(
      await resolveFood("000", { override: async () => null, openFoodFacts: async () => null }),
    ).toBeNull();
  });
});
