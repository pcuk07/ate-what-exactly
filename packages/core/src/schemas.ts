import { z } from "zod";

/** Zod schemas for every external boundary: app → API, MCP tool inputs, Claude output. */

export const MacrosSchema = z.object({
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1500),
  fatG: z.number().min(0).max(1000),
  fibreG: z.number().min(0).max(300),
});

export const MealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export const TierSchema = z.enum(["A", "B", "C", "D"]);

export const MealItemSchema = z.object({
  name: z.string().min(1).max(120),
  grams: z.number().min(0).max(5000),
  per100g: MacrosSchema,
});

export const GoalsSchema = z.object({
  kcal: z.number().int().min(800).max(8000),
  proteinG: z.number().int().min(0).max(500),
  carbsG: z.number().int().min(0).max(1000),
  fatG: z.number().int().min(0).max(400),
  fibreG: z.number().int().min(0).max(150),
  flexibleDays: z.boolean(),
});

/**
 * What Claude returns for a plate photo. Components carry per-100 g macros
 * and an estimated weight; totals are computed by us, never trusted from
 * the model, so arithmetic is deterministic and auditable.
 */
export const QuestionEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scale_all"),
    factor: z.number().min(0.1).max(4),
  }),
  z.object({
    type: z.literal("scale_component"),
    component: z.string().min(1),
    factor: z.number().min(0).max(4),
  }),
  z.object({
    type: z.literal("add_component"),
    component: MealItemSchema,
  }),
  z.object({ type: z.literal("none") }),
]);

export const ClarifyingQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(160),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        effect: QuestionEffectSchema,
      }),
    )
    .min(2)
    .max(4),
  /** Index into options — the likeliest answer, preselected in the UI. */
  defaultOptionIndex: z.number().int().min(0).max(3),
});

export const VisionResultSchema = z.object({
  dishName: z.string().min(1).max(120),
  /** True if the image is clearly not food (or unreadable). */
  notFood: z.boolean(),
  components: z.array(MealItemSchema).max(12),
  /** Model's own read of how sure it is; informs question count, not the tier. */
  confidence: z.enum(["high", "medium", "low"]),
  /** Only questions that would meaningfully move the number. */
  questions: z.array(ClarifyingQuestionSchema).max(3),
  /** Restaurant name if visible on packaging/receipt, else null. */
  restaurantName: z.string().max(80).nullable(),
});

export type VisionResult = z.infer<typeof VisionResultSchema>;
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;
export type QuestionEffect = z.infer<typeof QuestionEffectSchema>;

/** Answers are option indices keyed by question id. */
export const AnswersSchema = z.record(z.string(), z.number().int().min(0).max(3));

export const LogMealInputSchema = z.object({
  name: z.string().min(1).max(120),
  mealType: MealTypeSchema.optional(),
  loggedAt: z.string().datetime().optional(),
  items: z.array(MealItemSchema).min(1).max(20).optional(),
  macros: MacrosSchema.optional(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("barcode"), barcode: z.string().min(6).max(20), foodId: z.string() }),
    z.object({ kind: z.literal("recipe"), recipeId: z.string(), portions: z.number().positive() }),
    z.object({ kind: z.literal("menu"), restaurantItemId: z.string() }),
    z.object({ kind: z.literal("photo"), photoPath: z.string(), visionModel: z.string() }),
    z.object({ kind: z.literal("manual") }),
  ]),
});
export type LogMealInput = z.infer<typeof LogMealInputSchema>;

export const CorrectionInputSchema = z.object({
  macros: MacrosSchema.partial().optional(),
  mealType: MealTypeSchema.optional(),
  name: z.string().min(1).max(120).optional(),
});
export type CorrectionInput = z.infer<typeof CorrectionInputSchema>;

export const BarcodeSchema = z
  .string()
  .regex(/^\d{6,14}$/, "barcode must be 6–14 digits");
