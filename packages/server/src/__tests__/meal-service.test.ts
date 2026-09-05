import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GOALS, VisionResultSchema, type Food, type Goals, type MealEntry, type Recipe } from "@awe/core";
import { MealService, dayBounds, NotFoundError } from "../services/meal-service.js";
import type { Config } from "../config.js";
import curryFixture from "../../../core/fixtures/vision-curry.json" with { type: "json" };

const config = {
  VISION_MODEL: "claude-opus-5",
  OFF_USER_AGENT: "test",
} as unknown as Config;

/** In-memory doubles: the service is tested without a database or network. */
class FakeMeals {
  rows: MealEntry[] = [];
  private seq = 0;
  async insert(entry: Omit<MealEntry, "id">): Promise<MealEntry> {
    const row = { ...entry, id: `m${++this.seq}` } as MealEntry;
    this.rows.push(row);
    return row;
  }
  async getById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listBetween(from: string, to: string) {
    return this.rows
      .filter((r) => r.loggedAt >= from && r.loggedAt < to)
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  }
  async listRecent(limit = 100) {
    return [...this.rows].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)).slice(0, limit);
  }
  async update(id: string, patch: Partial<MealEntry>) {
    const row = this.rows.find((r) => r.id === id)!;
    Object.assign(row, patch);
    return row;
  }
  async delete(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

class FakeCalibrations {
  states = new Map<string, { dishKey: string; n: number; logSum: number }>();
  corrections: unknown[] = [];
  async get(_userId: string, key: string) {
    return this.states.get(key);
  }
  async save(_userId: string, state: { dishKey: string; n: number; logSum: number }) {
    this.states.set(state.dishKey, state);
  }
  async recordCorrection(...args: unknown[]) {
    this.corrections.push(args);
  }
}

class FakeFoods {
  overrides = new Map<string, Food>();
  cached = new Map<string, Food>();
  menu: { id: string; restaurantName: string; itemName: string; macros: Food["per100g"] }[] = [];
  cacheCalls = 0;
  async findOverride(barcode: string) {
    return this.overrides.get(barcode) ?? null;
  }
  async findCached(barcode: string) {
    return this.cached.get(barcode) ?? null;
  }
  async cache(food: Food) {
    this.cacheCalls++;
    this.cached.set(food.barcode, food);
  }
  async findMenuItem(restaurant: string, item: string) {
    return (
      this.menu.find(
        (m) =>
          m.restaurantName.toLowerCase() === restaurant.toLowerCase() &&
          m.itemName.toLowerCase() === item.toLowerCase(),
      ) ?? null
    );
  }
  async searchMenu() {
    return [];
  }
}

class FakeRecipes {
  rows: Recipe[] = [];
  async getById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async list() {
    return this.rows;
  }
  async create(r: Omit<Recipe, "id">) {
    const row = { ...r, id: "r1" } as Recipe;
    this.rows.push(row);
    return row;
  }
}

class FakeGoals {
  value: Goals = { ...DEFAULT_GOALS, kcal: 2200 };
  async get() {
    return this.value;
  }
  async save(_u: string, g: Goals) {
    this.value = g;
    return g;
  }
}

function build(now = new Date("2026-09-03T12:30:00Z")) {
  const meals = new FakeMeals();
  const calibrations = new FakeCalibrations();
  const foods = new FakeFoods();
  const recipes = new FakeRecipes();
  const goals = new FakeGoals();
  const fetchImpl = vi.fn();
  const service = new MealService("u1", {
    meals: meals as never,
    calibrations: calibrations as never,
    foods: foods as never,
    recipes: recipes as never,
    goals: goals as never,
    config,
    fetchImpl: fetchImpl as never,
    now: () => now,
  });
  return { service, meals, calibrations, foods, recipes, goals, fetchImpl };
}

const oats: Food = {
  id: "off:1",
  barcode: "5099073000191",
  name: "Porridge Oats",
  brand: "Flahavan's",
  per100g: { kcal: 372, proteinG: 11, carbsG: 60, fatG: 8, fibreG: 9 },
  servingG: 40,
  source: "openfoodfacts",
};

describe("logging", () => {
  it("infers the meal type from the time when none is given", async () => {
    const { service } = build(new Date("2026-09-03T07:15:00Z")); // 08:15 in Dublin
    const entry = await service.logMeal({
      name: "Porridge",
      macros: { kcal: 410, proteinG: 12, carbsG: 60, fatG: 9, fibreG: 8 },
      source: { kind: "manual" },
    });
    expect(entry.mealType).toBe("breakfast");
  });

  it("respects an explicit meal type over the clock", async () => {
    const { service } = build(new Date("2026-09-03T07:15:00Z"));
    const entry = await service.logMeal({
      name: "Leftovers",
      mealType: "dinner",
      macros: { kcal: 500, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 },
      source: { kind: "manual" },
    });
    expect(entry.mealType).toBe("dinner");
  });

  it("computes totals from components rather than trusting the caller", async () => {
    const { service } = build();
    const entry = await service.logMeal({
      name: "Oats",
      items: [{ name: "oats", grams: 50, per100g: oats.per100g }],
      source: { kind: "manual" },
    });
    expect(entry.macros.kcal).toBe(186);
  });

  it("stamps the tier and error band from the source", async () => {
    const { service } = build();
    const barcode = await service.logBarcode(oats, 40);
    expect(barcode.tier).toBe("A");
    expect(barcode.errorBand).toBe(0.02);

    const manual = await service.logMeal({
      name: "Guess",
      macros: { kcal: 500, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 },
      source: { kind: "manual" },
    });
    expect(manual.tier).toBe("D");
    expect(manual.errorBand).toBe(0.3);
  });

  it("scales a barcode entry to the weight eaten", async () => {
    const { service } = build();
    const entry = await service.logBarcode(oats, 40);
    expect(entry.macros.kcal).toBeCloseTo(148.8, 1);
    expect(entry.name).toContain("Flahavan's");
  });

  it("divides a recipe by its portions", async () => {
    const { service, recipes } = build();
    recipes.rows.push({
      id: "r1",
      userId: "u1",
      name: "Batch porridge",
      portions: 4,
      ingredients: [{ name: "oats", grams: 400, per100g: oats.per100g }],
    });
    const entry = await service.logMeal({
      name: "Batch porridge",
      source: { kind: "recipe", recipeId: "r1", portions: 4 },
    });
    expect(entry.tier).toBe("B");
    expect(entry.macros.kcal).toBeCloseTo(372, 0);
  });

  it("refuses a recipe that no longer exists", async () => {
    const { service } = build();
    await expect(
      service.logMeal({ name: "Gone", source: { kind: "recipe", recipeId: "nope", portions: 1 } }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses a meal with neither components nor macros", async () => {
    const { service } = build();
    await expect(service.logMeal({ name: "Nothing", source: { kind: "manual" } })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("barcode resolution", () => {
  it("prefers our override and never calls the network for it", async () => {
    const { service, foods, fetchImpl } = build();
    foods.overrides.set(oats.barcode, { ...oats, source: "override", name: "Oats (corrected)" });
    const food = await service.lookupBarcode(oats.barcode);
    expect(food?.source).toBe("override");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("serves a cached product without re-fetching", async () => {
    const { service, foods, fetchImpl } = build();
    foods.cached.set(oats.barcode, oats);
    expect((await service.lookupBarcode(oats.barcode))?.name).toBe("Porridge Oats");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches, then caches, an unseen barcode", async () => {
    const { service, foods, fetchImpl } = build();
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 1,
        product: {
          code: oats.barcode,
          product_name: "Porridge Oats",
          nutriments: { "energy-kcal_100g": 372, proteins_100g: 11 },
        },
      }),
    });
    const food = await service.lookupBarcode(oats.barcode);
    expect(food?.name).toBe("Porridge Oats");
    expect(foods.cacheCalls).toBe(1);
  });
});

describe("photo estimates", () => {
  const curry = VisionResultSchema.parse(curryFixture);

  it("logs a photo read as Tier D with the photo path attached", async () => {
    const { service } = build();
    const entry = await service.logFromVision(curry, {}, { photoPath: "u1/abc.jpg" });
    expect(entry.tier).toBe("D");
    expect(entry.photoPath).toBe("u1/abc.jpg");
    expect(entry.macros.kcal).toBeCloseTo(885.1, 0);
  });

  it("upgrades to Tier C when the dish matches published menu data", async () => {
    const { service, foods } = build();
    foods.menu.push({
      id: "mi1",
      restaurantName: "Base Wood Fired Pizza",
      itemName: "Chicken curry with rice",
      macros: { kcal: 690, proteinG: 30, carbsG: 80, fatG: 20, fibreG: 5 },
    });
    const entry = await service.logFromVision(curry, {}, {
      photoPath: "u1/abc.jpg",
      restaurantName: "Base Wood Fired Pizza",
    });
    expect(entry.tier).toBe("C");
    expect(entry.macros.kcal).toBe(690);
  });

  it("stays Tier D when the restaurant publishes nothing for that dish", async () => {
    const { service } = build();
    const entry = await service.logFromVision(curry, {}, {
      photoPath: "u1/abc.jpg",
      restaurantName: "Unknown Takeaway",
    });
    expect(entry.tier).toBe("D");
    expect(entry.name).toContain("Unknown Takeaway");
  });

  it("applies the answers to the estimate", async () => {
    const { service } = build();
    const half = await service.logFromVision(curry, { portion: 0 }, { photoPath: "p" });
    expect(half.macros.kcal).toBeLessThan(500);
  });
});

describe("corrections and calibration", () => {
  it("teaches the dish from a calorie correction on an estimate", async () => {
    const { service, calibrations } = build();
    const entry = await service.logFromVision(
      VisionResultSchema.parse(curryFixture),
      {},
      { photoPath: "p" },
    );
    await service.correctEntry(entry.id, { macros: { kcal: entry.macros.kcal * 1.2 } });

    const state = calibrations.states.get("chicken curry rice");
    expect(state?.n).toBe(1);
    expect(calibrations.corrections).toHaveLength(1);
  });

  it("uses what it learned on the next estimate of the same dish", async () => {
    const { service, calibrations } = build();
    calibrations.states.set("chicken curry rice", {
      dishKey: "chicken curry rice",
      n: 1,
      logSum: Math.log(1.2),
    });
    const entry = await service.logFromVision(
      VisionResultSchema.parse(curryFixture),
      {},
      { photoPath: "p" },
    );
    expect(entry.macros.kcal).toBeCloseTo(885.1 * 1.2, 0);
  });

  it("does not learn from a correction to a barcode entry, whose label is already right", async () => {
    const { service, calibrations } = build();
    const entry = await service.logBarcode(oats, 40);
    await service.correctEntry(entry.id, { macros: { kcal: 200 } });
    expect(calibrations.states.size).toBe(0);
  });

  it("never improves the tier of a corrected estimate", async () => {
    const { service } = build();
    const entry = await service.logMeal({
      name: "Takeaway curry",
      macros: { kcal: 800, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 },
      source: { kind: "manual" },
    });
    const corrected = await service.correctEntry(entry.id, { macros: { kcal: 950 } });
    expect(corrected.tier).toBe("D");
  });

  it("reports a missing entry rather than failing obscurely", async () => {
    const { service } = build();
    await expect(service.correctEntry("nope", { macros: { kcal: 1 } })).rejects.toThrow(NotFoundError);
  });
});

describe("day and week views", () => {
  beforeEach(() => vi.useRealTimers());

  it("summarises today grouped by meal", async () => {
    const { service } = build(new Date("2026-09-03T20:00:00Z"));
    await service.logMeal({
      name: "Porridge",
      loggedAt: "2026-09-03T07:15:00Z",
      macros: { kcal: 410, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 },
      source: { kind: "manual" },
    });
    await service.logMeal({
      name: "Curry",
      loggedAt: "2026-09-03T12:02:00Z",
      macros: { kcal: 780, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 },
      source: { kind: "manual" },
    });
    const day = await service.getDay("2026-09-03");
    expect(day.totals.kcal).toBe(1190);
    expect(day.byMealType.breakfast.kcal).toBe(410);
    expect(day.byMealType.lunch.kcal).toBe(780);
    expect(day.remainingKcal).toBe(1010);
  });

  it("excludes a meal that falls on the next local day", async () => {
    const { service } = build(new Date("2026-09-03T20:00:00Z"));
    await service.logMeal({
      name: "Midnight snack",
      loggedAt: "2026-09-03T23:30:00Z", // 00:30 on the 4th in Dublin
      macros: { kcal: 200, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 },
      source: { kind: "manual" },
    });
    expect((await service.getDay("2026-09-03")).totals.kcal).toBe(0);
    expect((await service.getDay("2026-09-04")).totals.kcal).toBe(200);
  });

  it("builds a seven-day week ending today", async () => {
    const { service } = build(new Date("2026-09-06T20:00:00Z"));
    const week = await service.getWeek();
    expect(week.days).toHaveLength(7);
    expect(week.days[6]!.date).toBe("2026-09-06");
    expect(week.days[0]!.date).toBe("2026-08-31");
  });
});

describe("dayBounds", () => {
  it("brackets a summer day at Irish local midnight", () => {
    const { from, to } = dayBounds("2026-09-03", "Europe/Dublin");
    expect(from).toBe("2026-09-02T23:00:00.000Z");
    expect(to).toBe("2026-09-03T23:00:00.000Z");
  });

  it("brackets a winter day, when Dublin is on UTC", () => {
    const { from, to } = dayBounds("2026-01-15", "Europe/Dublin");
    expect(from).toBe("2026-01-15T00:00:00.000Z");
    expect(to).toBe("2026-01-16T00:00:00.000Z");
  });
});

describe("usual", () => {
  it("suggests a repeated breakfast", async () => {
    const { service } = build(new Date("2026-09-05T07:00:00Z"));
    for (const day of ["01", "02", "03"]) {
      await service.logMeal({
        name: "Porridge & banana",
        loggedAt: `2026-09-${day}T07:10:00Z`,
        macros: { kcal: 410, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 },
        source: { kind: "manual" },
      });
    }
    const usual = await service.getUsual("breakfast");
    expect(usual?.count).toBe(3);
  });
});
