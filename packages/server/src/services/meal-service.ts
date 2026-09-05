import {
  dishKey,
  estimateFromVision,
  fetchOpenFoodFacts,
  inferMealType,
  itemsTotal,
  localDateKey,
  recipePortion,
  resolveFood,
  scaleMacros,
  summariseDay,
  summariseWeek,
  tierForSource,
  TIER_ERROR_BAND,
  updateCalibration,
  usualFor,
  emptyCalibration,
  type CorrectionInput,
  type DaySummary,
  type Food,
  type Goals,
  type LogMealInput,
  type Macros,
  type MealEntry,
  type MealItem,
  type MealType,
  type VisionResult,
  type WeekSummary,
} from "@awe/core";
import type { Config } from "../config.js";
import { CalibrationRepository, MealsRepository } from "../repositories/meals.js";
import { FoodsRepository, GoalsRepository, RecipesRepository } from "../repositories/foods.js";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface MealServiceDeps {
  meals: MealsRepository;
  calibrations: CalibrationRepository;
  foods: FoodsRepository;
  recipes: RecipesRepository;
  goals: GoalsRepository;
  config: Config;
  /** Injected so tests never touch the network (design doc §: no live calls in tests). */
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/**
 * The one place a meal becomes a row. Both front doors — the app's REST API and
 * the MCP connector — call these methods, so logging behaves identically
 * whichever surface a person uses (design doc §4).
 */
export class MealService {
  constructor(
    private readonly userId: string,
    private readonly deps: MealServiceDeps,
    private readonly timeZone = "Europe/Dublin",
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Barcode → Tier A. Overrides beat Open Food Facts; results are cached. */
  async lookupBarcode(barcode: string): Promise<Food | null> {
    const { foods, config } = this.deps;
    const fetchImpl = this.deps.fetchImpl ?? fetch;
    return resolveFood(barcode, {
      override: (b) => foods.findOverride(b),
      openFoodFacts: async (b) => {
        const cached = await foods.findCached(b);
        if (cached) return cached;
        const fetched = await fetchOpenFoodFacts(
          b,
          async (url, init) => {
            const res = await fetchImpl(url, init as RequestInit);
            return { ok: res.ok, status: res.status, json: () => res.json() };
          },
          config.OFF_USER_AGENT,
        );
        if (fetched) await foods.cache(fetched).catch(() => undefined);
        return fetched;
      },
    });
  }

  /** Turn a validated request into a saved entry. Totals are always computed here. */
  async logMeal(input: LogMealInput): Promise<MealEntry> {
    const loggedAt = input.loggedAt ?? this.now().toISOString();
    const mealType: MealType = input.mealType ?? inferMealType(new Date(loggedAt), this.timeZone);
    const tier = tierForSource(input.source);

    let items: MealItem[] = input.items ?? [];
    let macros: Macros;

    if (input.source.kind === "recipe") {
      const recipe = await this.deps.recipes.getById(input.source.recipeId);
      if (!recipe) throw new NotFoundError("That recipe no longer exists.");
      items = recipe.ingredients;
      macros = recipePortion(recipe.ingredients, recipe.portions);
    } else if (input.macros) {
      macros = input.macros;
    } else if (items.length > 0) {
      macros = itemsTotal(items);
    } else {
      throw new NotFoundError("A meal needs either components or macros.");
    }

    const entry: Omit<MealEntry, "id"> = {
      userId: this.userId,
      loggedAt,
      mealType,
      tier,
      name: input.name,
      macros,
      errorBand: TIER_ERROR_BAND[tier],
      items,
      source: input.source,
    };
    // An empty path means the device's upload failed; record no photo rather
    // than a path that points at nothing.
    if (input.source.kind === "photo" && input.source.photoPath !== "") {
      entry.photoPath = input.source.photoPath;
    }
    return this.deps.meals.insert(entry);
  }

  /** Log a scanned product at a given weight (or one label serving). */
  async logBarcode(
    food: Food,
    grams: number,
    opts: { mealType?: MealType; loggedAt?: string } = {},
  ): Promise<MealEntry> {
    const item: MealItem = { name: food.name, grams, per100g: food.per100g };
    const input: LogMealInput = {
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      items: [item],
      macros: scaleMacros(food.per100g, grams),
      source: { kind: "barcode", barcode: food.barcode, foodId: food.id },
    };
    if (opts.mealType) input.mealType = opts.mealType;
    if (opts.loggedAt) input.loggedAt = opts.loggedAt;
    return this.logMeal(input);
  }

  /**
   * Apply the answers to a plate read and save it. If the dish matches a chain
   * menu item we hold nutrition for, the entry is upgraded to Tier C and the
   * menu figures replace the estimate — the one honest upgrade path.
   */
  async logFromVision(
    result: VisionResult,
    answers: Record<string, number>,
    opts: { photoPath: string; mealType?: MealType; restaurantName?: string; loggedAt?: string },
  ): Promise<MealEntry> {
    const restaurant = opts.restaurantName ?? result.restaurantName ?? undefined;
    if (restaurant) {
      const menuItem = await this.deps.foods.findMenuItem(restaurant, result.dishName);
      if (menuItem) {
        const input: LogMealInput = {
          name: `${menuItem.itemName} — ${menuItem.restaurantName}`,
          macros: menuItem.macros,
          source: { kind: "menu", restaurantItemId: menuItem.id },
        };
        if (opts.mealType) input.mealType = opts.mealType;
        if (opts.loggedAt) input.loggedAt = opts.loggedAt;
        return this.logMeal(input);
      }
    }

    const calibration = await this.deps.calibrations.get(this.userId, dishKey(result.dishName));
    const { items, macros } = estimateFromVision(result, answers, calibration);
    const input: LogMealInput = {
      name: restaurant ? `${result.dishName} — ${restaurant}` : result.dishName,
      items,
      macros,
      source: { kind: "photo", photoPath: opts.photoPath, visionModel: this.deps.config.VISION_MODEL },
    };
    if (opts.mealType) input.mealType = opts.mealType;
    if (opts.loggedAt) input.loggedAt = opts.loggedAt;
    return this.logMeal(input);
  }

  /**
   * Correct an entry. A calorie correction on an estimated entry also updates
   * that dish's calibration, so the next estimate starts from what you knew
   * (design doc §5.4). The tier never improves: a corrected guess is still a guess.
   */
  async correctEntry(mealId: string, patch: CorrectionInput): Promise<MealEntry> {
    const existing = await this.deps.meals.getById(mealId);
    if (!existing) throw new NotFoundError("That entry no longer exists.");

    // Snapshot what we need before the update: a repository may hand back a
    // live object, and reading the "original" afterwards would then read the
    // new value and silently skip calibration.
    const originalKcal = existing.macros.kcal;
    const originalTier = existing.tier;
    const originalName = existing.name;

    const macros = mergeDefined(existing.macros, patch.macros);
    const update: Partial<MealEntry> = { macros };
    if (patch.mealType) update.mealType = patch.mealType;
    if (patch.name) update.name = patch.name;

    const updated = await this.deps.meals.update(mealId, update);

    // Only estimates are worth learning from: a label or a weighed recipe was
    // already right, so a correction there says nothing about future guesses.
    const kcalChanged = macros.kcal !== originalKcal;
    if (kcalChanged && (originalTier === "D" || originalTier === "C")) {
      const key = dishKey(originalName);
      if (key) {
        const current = (await this.deps.calibrations.get(this.userId, key)) ?? emptyCalibration(key);
        const next = updateCalibration(current, originalKcal, macros.kcal);
        await this.deps.calibrations.save(this.userId, next);
        await this.deps.calibrations.recordCorrection(
          this.userId,
          mealId,
          key,
          "kcal",
          originalKcal,
          macros.kcal,
        );
      }
    }
    return updated;
  }

  async deleteEntry(mealId: string): Promise<void> {
    await this.deps.meals.delete(mealId);
  }

  /** One entry, for the detail screen. */
  async getEntry(mealId: string): Promise<MealEntry> {
    const entry = await this.deps.meals.getById(mealId);
    if (!entry) throw new NotFoundError("That entry no longer exists.");
    return entry;
  }

  /** The Today screen (design doc §6.1). */
  async getDay(date?: string): Promise<DaySummary> {
    const key = date ?? localDateKey(this.now(), this.timeZone);
    const { from, to } = dayBounds(key, this.timeZone);
    const [entries, goals] = await Promise.all([
      this.deps.meals.listBetween(from, to),
      this.deps.goals.get(this.userId),
    ]);
    return summariseDay(key, entries, goals);
  }

  /** The weekly view (design doc §6.2), ending on the given date. */
  async getWeek(endDate?: string): Promise<WeekSummary> {
    const end = endDate ?? localDateKey(this.now(), this.timeZone);
    const dates: string[] = [];
    const endMs = Date.parse(`${end}T12:00:00Z`);
    for (let i = 6; i >= 0; i--) {
      dates.push(new Date(endMs - i * 86_400_000).toISOString().slice(0, 10));
    }
    const first = dates[0]!;
    const { from } = dayBounds(first, this.timeZone);
    const { to } = dayBounds(end, this.timeZone);
    const [entries, goals] = await Promise.all([
      this.deps.meals.listBetween(from, to),
      this.deps.goals.get(this.userId),
    ]);
    return summariseWeek(dates, entries, goals, this.timeZone);
  }

  async getHistory(limit = 50): Promise<MealEntry[]> {
    return this.deps.meals.listRecent(limit);
  }

  /** "Your usual breakfast?" — the zero-tap path (design doc §7.2). */
  async getUsual(mealType?: MealType) {
    const type = mealType ?? inferMealType(this.now(), this.timeZone);
    const history = await this.deps.meals.listRecent(300);
    return usualFor(type, history, this.now());
  }

  async getGoals(): Promise<Goals> {
    return this.deps.goals.get(this.userId);
  }

  async saveGoals(goals: Goals): Promise<Goals> {
    return this.deps.goals.save(this.userId, goals);
  }
}

/**
 * Merge only the keys a patch actually sets. A plain spread would let an
 * explicit `undefined` blank a value that the caller never meant to change.
 */
export function mergeDefined(base: Macros, patch: Partial<Macros> | undefined): Macros {
  if (!patch) return { ...base };
  const out: Macros = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k as keyof Macros] = v as number;
  }
  return out;
}

/** UTC instants bounding a local calendar day, honouring DST. */
export function dayBounds(dateKey: string, timeZone: string): { from: string; to: string } {
  const from = localMidnightUtc(dateKey, timeZone);
  const nextKey = new Date(Date.parse(`${dateKey}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const to = localMidnightUtc(nextKey, timeZone);
  return { from, to };
}

function localMidnightUtc(dateKey: string, timeZone: string): string {
  // Start from the naive UTC midnight, then correct by that zone's offset.
  const naive = Date.parse(`${dateKey}T00:00:00Z`);
  const offset = zoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - offset).toISOString();
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]) % 24,
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return asUtc - at.getTime();
}
