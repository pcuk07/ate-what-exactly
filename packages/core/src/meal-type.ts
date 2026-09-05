import type { MealType } from "./types.js";

export const DEFAULT_TIME_ZONE = "Europe/Dublin";

/** Local hour (0–23) of a Date in a given IANA time zone. */
export function localHour(date: Date, timeZone: string = DEFAULT_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value;
  return hour === undefined ? date.getUTCHours() : Number(hour);
}

/**
 * Infer the meal type from the time an entry was logged.
 * Design doc §6.1: roughly 4–11 breakfast, 11–15 lunch, 17–22 dinner,
 * everything else a snack. A derived default, always editable.
 */
export function inferMealType(date: Date, timeZone: string = DEFAULT_TIME_ZONE): MealType {
  const h = localHour(date, timeZone);
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

/** Local calendar date (YYYY-MM-DD) of a Date in a given time zone. */
export function localDateKey(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
