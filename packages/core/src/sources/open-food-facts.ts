import type { Food, Macros } from "../types.js";

/**
 * Open Food Facts adapter. Design doc §4: OFF is the barcode base; the
 * Irish-overrides table wins when both have a row (see resolve-food.ts).
 *
 * OFF asks for a descriptive User-Agent with contact details; the server
 * supplies it. The product endpoint is free and needs no key.
 */

export const OFF_PRODUCT_URL = (barcode: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,product_name_en,brands,nutriments,serving_quantity,serving_size`;

/** The subset of an OFF product response we read. Everything is optional in the wild. */
export interface OffProductResponse {
  status?: number;
  status_verbose?: string;
  product?: {
    code?: string;
    product_name?: string;
    product_name_en?: string;
    brands?: string;
    serving_quantity?: number | string;
    nutriments?: Record<string, number | string | undefined>;
  };
}

const num = (v: number | string | undefined): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Map an OFF product to our Food shape. Returns null when the product is
 * missing or has no usable energy figure — a row with no calories is worse
 * than no row, because it would log as a confident zero.
 */
export function parseOpenFoodFactsProduct(json: OffProductResponse): Food | null {
  const p = json.product;
  if (!p || json.status === 0) return null;
  const n = p.nutriments ?? {};

  // OFF stores energy as kJ in `energy_100g` and kcal in `energy-kcal_100g`.
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === undefined) {
    const kj = num(n["energy_100g"]) ?? num(n["energy-kj_100g"]);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  if (kcal === undefined) return null;

  const per100g: Macros = {
    kcal: Math.round(kcal * 10) / 10,
    proteinG: num(n["proteins_100g"]) ?? 0,
    carbsG: num(n["carbohydrates_100g"]) ?? 0,
    fatG: num(n["fat_100g"]) ?? 0,
    fibreG: num(n["fiber_100g"]) ?? 0,
  };

  const name = (p.product_name_en || p.product_name || "").trim();
  if (!name) return null;
  const barcode = (p.code ?? "").trim();
  const servingG = num(p.serving_quantity);

  const food: Food = {
    id: `off:${barcode}`,
    barcode,
    name,
    per100g,
    source: "openfoodfacts",
  };
  const brand = p.brands?.split(",")[0]?.trim();
  if (brand) food.brand = brand;
  if (servingG !== undefined && servingG > 0) food.servingG = servingG;
  return food;
}

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

/** Fetch and parse one product. Network errors propagate; "not found" is null. */
export async function fetchOpenFoodFacts(
  barcode: string,
  fetchImpl: FetchLike,
  userAgent: string,
): Promise<Food | null> {
  const res = await fetchImpl(OFF_PRODUCT_URL(barcode), {
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts responded ${res.status}`);
  const json = (await res.json()) as OffProductResponse;
  return parseOpenFoodFactsProduct(json);
}
