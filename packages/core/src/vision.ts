import { calibrationFactor, type CalibrationState } from "./calibration.js";
import { itemsTotal, multiplyMacros } from "./nutrition.js";
import type { Macros, MealItem } from "./types.js";
import type { QuestionEffect, VisionResult } from "./schemas.js";

/**
 * The system prompt for the plate read. Design doc §5.3 / §7.2: propose a first
 * read, then ask at most three questions, and only ones that move the number.
 * Nutrition arithmetic is done by us from the components, so the model is
 * asked for weights and per-100 g profiles, not for totals.
 */
export const VISION_SYSTEM_PROMPT = `You estimate the nutritional content of a meal from a single photo for a food diary.

Return components: each visible food with an estimated cooked weight in grams and its nutrition per 100 g (kcal, protein, carbs, fat, fibre). Include hidden but likely ingredients that change the number — cooking oil, butter, dressings, sugar in sauces — as their own components with a conservative weight.

Use a standard 26 cm dinner plate, a typical fork, or a hand in shot as scale references when present. Prefer typical Irish and UK portion sizes and products.

Ask between zero and three clarifying questions, and only when the answer would change total calories by roughly 10 % or more. Good questions resolve portion (half / all / extra), protein type or cut, visible oil or sauce, or a side that may be hidden. Each option must carry a deterministic effect: scale everything, scale one named component, or add a component. Put the most likely answer as the default. Never ask a question whose answer is obvious from the photo.

If the image is not food or is unreadable, set notFood to true and return no components.

Be conservative rather than flattering: if unsure between two portion sizes, choose the larger.`;

export function visionUserPrompt(context: { mealType?: string; restaurantName?: string | undefined; note?: string | undefined }): string {
  const lines = ["Estimate this meal."];
  if (context.mealType) lines.push(`Meal: ${context.mealType}.`);
  if (context.restaurantName) lines.push(`The person says it is from: ${context.restaurantName}.`);
  if (context.note) lines.push(`They added: "${context.note.slice(0, 200)}".`);
  return lines.join(" ");
}

function applyEffect(items: MealItem[], effect: QuestionEffect): MealItem[] {
  switch (effect.type) {
    case "none":
      return items;
    case "scale_all":
      return items.map((i) => ({ ...i, grams: i.grams * effect.factor }));
    case "scale_component": {
      const target = effect.component.toLowerCase();
      return items.map((i) =>
        i.name.toLowerCase() === target ? { ...i, grams: i.grams * effect.factor } : i,
      );
    }
    case "add_component":
      return [...items, effect.component];
  }
}

/**
 * Apply the user's answers (option index per question id) to the components.
 * Unanswered questions use their default option — so "Looks right" with no
 * taps is a valid, fully-specified answer.
 */
export function applyAnswers(
  result: VisionResult,
  answers: Record<string, number>,
): MealItem[] {
  let items: MealItem[] = result.components.map((c) => ({ ...c }));
  for (const q of result.questions) {
    const idx = answers[q.id] ?? q.defaultOptionIndex;
    const option = q.options[idx] ?? q.options[q.defaultOptionIndex];
    if (option) items = applyEffect(items, option.effect);
  }
  return items.map((i) => ({ ...i, grams: Math.round(i.grams) }));
}

/** Final macros for a photo estimate after answers and per-dish calibration. */
export function estimateFromVision(
  result: VisionResult,
  answers: Record<string, number>,
  calibration?: CalibrationState,
): { items: MealItem[]; macros: Macros; calibrationFactor: number } {
  const items = applyAnswers(result, answers);
  const factor = calibrationFactor(calibration);
  return { items, macros: multiplyMacros(itemsTotal(items), factor), calibrationFactor: factor };
}
