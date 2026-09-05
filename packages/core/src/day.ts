import { localDateKey } from "./meal-type.js";
import { sumMacros, ZERO_MACROS } from "./nutrition.js";
import { MEAL_TYPES, type Goals, type Macros, type MealEntry, type MealType, type Tier } from "./types.js";

export interface DaySummary {
  date: string;
  totals: Macros;
  goals: Goals;
  /** Positive = left, negative = over. */
  remainingKcal: number;
  byMealType: Record<MealType, { entries: MealEntry[]; kcal: number }>;
  byTier: Record<Tier, number>;
  /** Fraction of logged kcal that came from Tier D — a day-level honesty signal. */
  estimatedShare: number;
}

/** Group a day's entries the way the Today screen shows them (design doc §6.1). */
export function summariseDay(date: string, entries: readonly MealEntry[], goals: Goals): DaySummary {
  const byMealType = Object.fromEntries(
    MEAL_TYPES.map((m) => [m, { entries: [] as MealEntry[], kcal: 0 }]),
  ) as DaySummary["byMealType"];
  const byTier: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0 };

  const sorted = [...entries].sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
  for (const e of sorted) {
    byMealType[e.mealType].entries.push(e);
    byMealType[e.mealType].kcal = Math.round((byMealType[e.mealType].kcal + e.macros.kcal) * 10) / 10;
    byTier[e.tier] = Math.round((byTier[e.tier] + e.macros.kcal) * 10) / 10;
  }
  const totals = sorted.length ? sumMacros(sorted.map((e) => e.macros)) : ZERO_MACROS;
  return {
    date,
    totals,
    goals,
    remainingKcal: Math.round(goals.kcal - totals.kcal),
    byMealType,
    byTier,
    estimatedShare: totals.kcal > 0 ? byTier.D / totals.kcal : 0,
  };
}

export interface WeekSummary {
  days: { date: string; kcal: number }[];
  averageKcal: number;
  goalKcal: number;
  /** Under flexible days, judged on the average; otherwise the count of days over. */
  status: "on_track" | "over" | "under";
  daysOver: number;
}

/** Weekly view + Nutracheck-style flexible days (design doc §6.2 / §6.3). */
export function summariseWeek(
  dates: readonly string[],
  entries: readonly MealEntry[],
  goals: Goals,
  timeZone?: string,
): WeekSummary {
  const kcalByDate = new Map<string, number>(dates.map((d) => [d, 0]));
  for (const e of entries) {
    const key = localDateKey(new Date(e.loggedAt), timeZone);
    if (kcalByDate.has(key)) kcalByDate.set(key, (kcalByDate.get(key) ?? 0) + e.macros.kcal);
  }
  const days = dates.map((d) => ({ date: d, kcal: Math.round(kcalByDate.get(d) ?? 0) }));
  const logged = days.filter((d) => d.kcal > 0);
  const averageKcal = logged.length
    ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length)
    : 0;
  const daysOver = days.filter((d) => d.kcal > goals.kcal).length;

  let status: WeekSummary["status"];
  const tolerance = goals.kcal * 0.05;
  if (goals.flexibleDays) {
    status =
      averageKcal > goals.kcal + tolerance ? "over" : averageKcal < goals.kcal - tolerance ? "under" : "on_track";
  } else {
    status = daysOver > 0 ? "over" : "on_track";
  }
  return { days, averageKcal, goalKcal: goals.kcal, status, daysOver };
}
