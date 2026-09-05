import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  BarcodeSchema,
  CorrectionInputSchema,
  MealTypeSchema,
  describeTier,
  scaleMacros,
  TIER_LABEL,
  type DaySummary,
  type MealEntry,
} from "@awe/core";
import type { MealService } from "../services/meal-service.js";

/**
 * The MCP connector (design doc §9). These tools are the same service-layer
 * calls the app's API makes — one implementation, two front doors.
 *
 * Descriptions are written for a stranger's Claude session, not for us: they
 * name the product, explain the tiers, and say what each tool will and won't do.
 */

const kcal = (n: number) => `${Math.round(n)} kcal`;

function formatEntry(e: MealEntry): string {
  const time = new Date(e.loggedAt).toISOString().slice(11, 16);
  return `${time} · ${e.name} · ${kcal(e.macros.kcal)} · ${e.mealType} · Tier ${e.tier} (${TIER_LABEL[e.tier]})`;
}

function formatDay(day: DaySummary): string {
  const lines: string[] = [
    `${day.date}: ${kcal(day.totals.kcal)} of ${kcal(day.goals.kcal)} — ${
      day.remainingKcal >= 0 ? `${kcal(day.remainingKcal)} left` : `${kcal(-day.remainingKcal)} over`
    }`,
    `Protein ${day.totals.proteinG} g · Carbs ${day.totals.carbsG} g · Fat ${day.totals.fatG} g · Fibre ${day.totals.fibreG} g`,
    "",
  ];
  for (const [mealType, group] of Object.entries(day.byMealType)) {
    if (group.entries.length === 0) continue;
    lines.push(`${mealType[0]!.toUpperCase()}${mealType.slice(1)} — ${kcal(group.kcal)}`);
    for (const e of group.entries) lines.push(`  ${formatEntry(e)}`);
  }
  if (day.totals.kcal === 0) lines.push("Nothing logged yet.");
  else if (day.estimatedShare > 0.5) {
    lines.push(
      "",
      `Note: ${Math.round(day.estimatedShare * 100)} % of today's calories are photo estimates (Tier D, roughly ±30 %).`,
    );
  }
  return lines.join("\n");
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

export function createMcpServer(service: MealService): McpServer {
  const server = new McpServer(
    { name: "awe", version: "0.1.0" },
    {
      instructions:
        "awe (Ate What Exactly) is a food diary that records how confident each entry is. " +
        "Every logged meal carries a tier: A = barcode/label data (±1–2 %), B = weighed home cooking (±2–5 %), " +
        "C = matched to a restaurant's published nutrition (±5–15 %), D = estimated from a photo or description (±15–30 %). " +
        "When you report numbers from this diary, carry the tier with them and do not present a Tier D estimate as a precise figure.",
    },
  );

  server.registerTool(
    "get_daily_totals",
    {
      title: "Get a day's food diary",
      description:
        "Returns everything logged on one day, grouped into breakfast, lunch, dinner and snacks, with calories, macros, the calorie goal and how much is left. Defaults to today.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Calendar date as YYYY-MM-DD. Omit for today."),
      },
    },
    async ({ date }) => text(formatDay(await service.getDay(date))),
  );

  server.registerTool(
    "get_history",
    {
      title: "List recent diary entries",
      description:
        "Returns the most recent logged meals, newest first, with their confidence tiers. Use this to answer questions about eating patterns over time.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50).describe("How many entries to return."),
      },
    },
    async ({ limit }) => {
      const entries = await service.getHistory(limit);
      if (entries.length === 0) return text("No entries logged yet.");
      return text(entries.map((e) => `${e.loggedAt.slice(0, 10)} ${formatEntry(e)}`).join("\n"));
    },
  );

  server.registerTool(
    "get_week",
    {
      title: "Get the week's calorie trend",
      description:
        "Returns the last seven days of calorie totals against the goal, plus the weekly average. If flexible days are on, the week is judged on its average rather than on each single day.",
      inputSchema: {
        end_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Last day of the week to report, YYYY-MM-DD. Omit for today."),
      },
    },
    async ({ end_date }) => {
      const week = await service.getWeek(end_date);
      const rows = week.days.map((d) => `${d.date}  ${String(d.kcal).padStart(5)} kcal`).join("\n");
      return text(
        `${rows}\n\nAverage ${kcal(week.averageKcal)} against a goal of ${kcal(week.goalKcal)} — ${week.status.replace("_", " ")}. ${week.daysOver} day(s) over.`,
      );
    },
  );

  server.registerTool(
    "lookup_barcode",
    {
      title: "Look up a packaged food by barcode",
      description:
        "Resolves a product barcode to its nutrition per 100 g, using our corrected Irish product data first and Open Food Facts as the fallback. Does not log anything.",
      inputSchema: { barcode: BarcodeSchema.describe("The digits under the barcode, 6–14 of them.") },
    },
    async ({ barcode }) => {
      const food = await service.lookupBarcode(barcode);
      if (!food) return text(`No product found for barcode ${barcode}.`);
      const m = food.per100g;
      return text(
        `${food.name}${food.brand ? ` (${food.brand})` : ""}\n` +
          `Per 100 g: ${kcal(m.kcal)}, protein ${m.proteinG} g, carbs ${m.carbsG} g, fat ${m.fatG} g, fibre ${m.fibreG} g` +
          (food.servingG ? `\nLabel serving: ${food.servingG} g` : "") +
          `\nSource: ${food.source === "override" ? "our corrected data" : "Open Food Facts"}`,
      );
    },
  );

  server.registerTool(
    "log_barcode_meal",
    {
      title: "Log a scanned packaged food",
      description:
        "Logs a packaged product by barcode at a given weight in grams. Records as Tier A, since the numbers come from the product label.",
      inputSchema: {
        barcode: BarcodeSchema,
        grams: z.number().min(1).max(3000).describe("Weight eaten, in grams."),
        meal_type: MealTypeSchema.optional().describe(
          "breakfast, lunch, dinner or snack. Omit to infer from the time of day.",
        ),
      },
    },
    async ({ barcode, grams, meal_type }) => {
      const food = await service.lookupBarcode(barcode);
      if (!food) return text(`No product found for barcode ${barcode}. Nothing was logged.`);
      const opts = meal_type ? { mealType: meal_type } : {};
      const entry = await service.logBarcode(food, grams, opts);
      return text(
        `Logged ${entry.name}, ${grams} g — ${kcal(entry.macros.kcal)} to ${entry.mealType}. Tier ${entry.tier}.`,
      );
    },
  );

  server.registerTool(
    "log_meal",
    {
      title: "Log a meal from a description",
      description:
        "Logs a meal described in words, with your own estimate of its calories and macros. Records as Tier D, an estimate of roughly ±15–30 %, because a description is not measured data. Prefer log_barcode_meal for packaged food. Photo estimation happens in the app, not through this tool.",
      inputSchema: {
        name: z.string().min(1).max(120).describe("What the meal was, e.g. 'chicken curry and rice'."),
        kcal: z.number().min(0).max(10000),
        protein_g: z.number().min(0).max(1000).default(0),
        carbs_g: z.number().min(0).max(1500).default(0),
        fat_g: z.number().min(0).max(1000).default(0),
        fibre_g: z.number().min(0).max(300).default(0),
        meal_type: MealTypeSchema.optional(),
      },
    },
    async (input) => {
      const entry = await service.logMeal({
        name: input.name,
        ...(input.meal_type ? { mealType: input.meal_type } : {}),
        macros: {
          kcal: input.kcal,
          proteinG: input.protein_g,
          carbsG: input.carbs_g,
          fatG: input.fat_g,
          fibreG: input.fibre_g,
        },
        source: { kind: "manual" },
      });
      return text(
        `Logged ${entry.name} — ${kcal(entry.macros.kcal)} to ${entry.mealType}. ${describeTier(entry.tier)}.`,
      );
    },
  );

  server.registerTool(
    "correct_entry",
    {
      title: "Correct a logged entry",
      description:
        "Adjusts a past entry's calories, macros, name or meal type. Correcting the calories of an estimated entry also teaches the app about that dish, so future estimates of it start closer. The confidence tier never improves: a corrected estimate is still an estimate.",
      inputSchema: {
        meal_id: z.string().uuid().describe("The entry's id, from get_history."),
        kcal: z.number().min(0).max(10000).optional(),
        protein_g: z.number().min(0).max(1000).optional(),
        carbs_g: z.number().min(0).max(1500).optional(),
        fat_g: z.number().min(0).max(1000).optional(),
        fibre_g: z.number().min(0).max(300).optional(),
        meal_type: MealTypeSchema.optional(),
        name: z.string().min(1).max(120).optional(),
      },
    },
    async (input) => {
      const macros: Record<string, number> = {};
      if (input.kcal !== undefined) macros["kcal"] = input.kcal;
      if (input.protein_g !== undefined) macros["proteinG"] = input.protein_g;
      if (input.carbs_g !== undefined) macros["carbsG"] = input.carbs_g;
      if (input.fat_g !== undefined) macros["fatG"] = input.fat_g;
      if (input.fibre_g !== undefined) macros["fibreG"] = input.fibre_g;

      const patch = CorrectionInputSchema.parse({
        ...(Object.keys(macros).length ? { macros } : {}),
        ...(input.meal_type ? { mealType: input.meal_type } : {}),
        ...(input.name ? { name: input.name } : {}),
      });
      const entry = await service.correctEntry(input.meal_id, patch);
      return text(`Updated ${entry.name} — now ${kcal(entry.macros.kcal)} in ${entry.mealType}.`);
    },
  );

  server.registerTool(
    "get_goals",
    {
      title: "Get calorie and macro goals",
      description: "Returns the daily calorie and macro targets, and whether flexible days are on.",
      inputSchema: {},
    },
    async () => {
      const g = await service.getGoals();
      return text(
        `Daily goal: ${kcal(g.kcal)} · protein ${g.proteinG} g · carbs ${g.carbsG} g · fat ${g.fatG} g · fibre ${g.fibreG} g\n` +
          `Flexible days: ${g.flexibleDays ? "on — the week is judged on its average" : "off — each day is judged on its own"}`,
      );
    },
  );

  server.registerTool(
    "suggest_usual",
    {
      title: "Find the usual meal for this time of day",
      description:
        "Returns the meal logged most often for a given meal type in the last 30 days, if there is an established habit. Useful for offering a one-tap repeat. Does not log anything.",
      inputSchema: { meal_type: MealTypeSchema.optional() },
    },
    async ({ meal_type }) => {
      const usual = await service.getUsual(meal_type);
      if (!usual) return text("No established usual for that meal yet.");
      return text(
        `Usual: ${usual.name} — ${kcal(usual.exemplar.macros.kcal)}, logged ${usual.count} times in the last 30 days.`,
      );
    },
  );

  server.registerResource(
    "diary-today",
    "diary://today",
    {
      title: "Today's diary",
      description: "The current day's entries and totals, grouped by meal.",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: formatDay(await service.getDay()) }],
    }),
  );

  return server;
}

/** Exported for tests: label-serving default when a weight isn't given. */
export function servingGramsFor(food: { servingG?: number }): number {
  return food.servingG ?? 100;
}

export { scaleMacros };
