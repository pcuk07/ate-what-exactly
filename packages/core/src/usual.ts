import { dishKey } from "./calibration.js";
import type { MealEntry, MealType } from "./types.js";

export interface UsualSuggestion {
  dishKey: string;
  name: string;
  /** The most recent entry with this dish key — re-logging copies it. */
  exemplar: MealEntry;
  count: number;
}

export const USUAL_MIN_COUNT = 3;
export const USUAL_WINDOW_DAYS = 30;

/**
 * "Your usual breakfast?" — design doc §7.2's zero-tap path. Deterministic:
 * the dish logged most often for this meal type in the last 30 days, if it
 * has been logged at least three times. No ML.
 */
export function usualFor(
  mealType: MealType,
  history: readonly MealEntry[],
  now: Date = new Date(),
  opts: { minCount?: number; windowDays?: number } = {},
): UsualSuggestion | null {
  const minCount = opts.minCount ?? USUAL_MIN_COUNT;
  const windowMs = (opts.windowDays ?? USUAL_WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;

  const groups = new Map<string, MealEntry[]>();
  for (const e of history) {
    if (e.mealType !== mealType) continue;
    const t = Date.parse(e.loggedAt);
    if (!Number.isFinite(t) || t < cutoff || t > now.getTime()) continue;
    const key = dishKey(e.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  let best: UsualSuggestion | null = null;
  for (const [key, entries] of groups) {
    if (entries.length < minCount) continue;
    if (best && entries.length <= best.count) continue;
    const exemplar = [...entries].sort((a, b) => Date.parse(b.loggedAt) - Date.parse(a.loggedAt))[0]!;
    best = { dishKey: key, name: exemplar.name, exemplar, count: entries.length };
  }
  return best;
}
