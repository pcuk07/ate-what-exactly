import { describe, expect, it } from "vitest";
import { summariseDay, summariseWeek } from "../day.js";
import { usualFor } from "../usual.js";
import { DEFAULT_GOALS, type Goals, type MealEntry } from "../types.js";

const macros = (kcal: number) => ({ kcal, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 });

const entry = (
  id: string,
  loggedAt: string,
  mealType: MealEntry["mealType"],
  tier: MealEntry["tier"],
  kcal: number,
  name = id,
): MealEntry => ({
  id,
  userId: "u1",
  loggedAt,
  mealType,
  tier,
  name,
  macros: macros(kcal),
  errorBand: 0.1,
  items: [],
  source: { kind: "manual" },
});

const goals: Goals = { ...DEFAULT_GOALS, kcal: 2200, flexibleDays: true };

describe("summariseDay", () => {
  const entries = [
    entry("porridge", "2026-09-03T07:15:00Z", "breakfast", "A", 410),
    entry("curry", "2026-09-03T12:02:00Z", "lunch", "C", 780),
    entry("apple", "2026-09-03T14:45:00Z", "snack", "A", 190),
    entry("stirfry", "2026-09-03T18:40:00Z", "dinner", "B", 560),
  ];

  it("totals the day and reports what is left", () => {
    const s = summariseDay("2026-09-03", entries, goals);
    expect(s.totals.kcal).toBe(1940);
    expect(s.remainingKcal).toBe(260);
  });

  it("groups by meal type with subtotals", () => {
    const s = summariseDay("2026-09-03", entries, goals);
    expect(s.byMealType.breakfast.kcal).toBe(410);
    expect(s.byMealType.lunch.kcal).toBe(780);
    expect(s.byMealType.snack.kcal).toBe(190);
    expect(s.byMealType.dinner.kcal).toBe(560);
  });

  it("reports negative remaining when over budget", () => {
    const over = [...entries, entry("late", "2026-09-03T21:00:00Z", "dinner", "D", 500)];
    expect(summariseDay("2026-09-03", over, goals).remainingKcal).toBe(-240);
  });

  it("tracks how much of the day is only an estimate", () => {
    const s = summariseDay("2026-09-03", entries, goals);
    expect(s.estimatedShare).toBe(0);
    const withGuess = [...entries, entry("takeaway", "2026-09-03T20:00:00Z", "dinner", "D", 1940)];
    expect(summariseDay("2026-09-03", withGuess, goals).estimatedShare).toBeCloseTo(0.5, 2);
  });

  it("is empty-safe", () => {
    const s = summariseDay("2026-09-03", [], goals);
    expect(s.totals.kcal).toBe(0);
    expect(s.remainingKcal).toBe(2200);
    expect(s.byMealType.lunch.entries).toEqual([]);
  });
});

describe("summariseWeek", () => {
  const dates = [
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
  ];
  const week = [
    entry("d1", "2026-08-31T12:00:00Z", "lunch", "A", 2100),
    entry("d2", "2026-09-01T12:00:00Z", "lunch", "A", 2350),
    entry("d3", "2026-09-02T12:00:00Z", "lunch", "A", 1980),
    entry("d4", "2026-09-03T12:00:00Z", "lunch", "A", 2600),
    entry("d5", "2026-09-04T12:00:00Z", "lunch", "A", 2200),
    entry("d6", "2026-09-05T12:00:00Z", "lunch", "A", 2750),
    entry("d7", "2026-09-06T12:00:00Z", "lunch", "A", 1850),
  ];

  it("reports each day and the average", () => {
    const s = summariseWeek(dates, week, goals);
    expect(s.days.map((d) => d.kcal)).toEqual([2100, 2350, 1980, 2600, 2200, 2750, 1850]);
    expect(s.averageKcal).toBe(2261);
  });

  it("judges flexible weeks on the average, so one big Saturday is absorbed", () => {
    const s = summariseWeek(dates, week, goals);
    expect(s.daysOver).toBe(3);
    expect(s.status).toBe("on_track");
  });

  it("judges strict weeks day by day", () => {
    const s = summariseWeek(dates, week, { ...goals, flexibleDays: false });
    expect(s.status).toBe("over");
  });

  it("ignores days with nothing logged when averaging", () => {
    const s = summariseWeek(dates, week.slice(0, 2), goals);
    expect(s.averageKcal).toBe(2225);
  });
});

describe("usualFor", () => {
  const now = new Date("2026-09-05T09:00:00Z");
  const history = [
    entry("b1", "2026-09-01T07:10:00Z", "breakfast", "B", 410, "Porridge & banana"),
    entry("b2", "2026-09-02T07:20:00Z", "breakfast", "B", 410, "porridge and banana"),
    entry("b3", "2026-09-03T07:05:00Z", "breakfast", "B", 410, "Banana porridge"),
    entry("b4", "2026-09-04T07:30:00Z", "breakfast", "A", 250, "Toast"),
  ];

  it("suggests the repeated breakfast once it has been logged enough", () => {
    const usual = usualFor("breakfast", history, now);
    expect(usual?.count).toBe(3);
    expect(usual?.exemplar.id).toBe("b3");
  });

  it("suggests nothing for a meal with no established habit", () => {
    expect(usualFor("dinner", history, now)).toBeNull();
  });

  it("ignores entries outside the window", () => {
    const stale = history.map((e) => ({ ...e, loggedAt: "2026-01-01T07:00:00Z" }));
    expect(usualFor("breakfast", stale, now)).toBeNull();
  });

  it("does not suggest from a single log", () => {
    expect(usualFor("breakfast", history.slice(0, 1), now)).toBeNull();
  });
});
