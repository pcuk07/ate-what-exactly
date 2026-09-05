import { describe, expect, it } from "vitest";
import { VisionResultSchema } from "../schemas.js";
import { applyAnswers, estimateFromVision } from "../vision.js";
import { emptyCalibration, updateCalibration } from "../calibration.js";
import curryFixture from "../../fixtures/vision-curry.json" with { type: "json" };

const curry = VisionResultSchema.parse(curryFixture);

describe("vision fixture", () => {
  it("parses real-shaped model output", () => {
    expect(curry.dishName).toBe("Chicken curry with rice");
    expect(curry.questions).toHaveLength(2);
  });
});

describe("applyAnswers", () => {
  it("uses each question's default when nothing is answered", () => {
    const items = applyAnswers(curry, {});
    const rice = items.find((i) => i.name === "basmati rice");
    expect(rice?.grams).toBe(220); // default option is "all of it", factor 1
  });

  it("scales everything for a half portion", () => {
    const items = applyAnswers(curry, { portion: 0 }); // "Half"
    expect(items.find((i) => i.name === "basmati rice")?.grams).toBe(110);
    expect(items.find((i) => i.name === "chicken thigh")?.grams).toBe(70);
  });

  it("scales a single named component", () => {
    const items = applyAnswers(curry, { rice: 2 }); // "Extra rice", ×1.5 on rice only
    expect(items.find((i) => i.name === "basmati rice")?.grams).toBe(330);
    expect(items.find((i) => i.name === "chicken thigh")?.grams).toBe(140);
  });

  it("falls back to the default for an out-of-range answer", () => {
    const items = applyAnswers(curry, { portion: 99 });
    expect(items.find((i) => i.name === "basmati rice")?.grams).toBe(220);
  });
});

describe("estimateFromVision", () => {
  it("computes totals from components rather than trusting a model total", () => {
    const { macros } = estimateFromVision(curry, {});
    // 220g rice @130 = 286, 140g chicken @209 = 292.6,
    // 25g oil @884 = 221, 90g sauce @95 = 85.5
    expect(macros.kcal).toBeCloseTo(885.1, 0);
    expect(macros.proteinG).toBeGreaterThan(30);
  });

  it("roughly halves with a half-portion answer", () => {
    const full = estimateFromVision(curry, {}).macros.kcal;
    const half = estimateFromVision(curry, { portion: 0 }).macros.kcal;
    // Not exactly half: component weights are rounded to whole grams, so
    // 12.5 g of oil becomes 13 g. A few kcal of drift is correct behaviour.
    expect(Math.abs(half - full / 2)).toBeLessThan(6);
  });

  it("applies per-dish calibration on top of the answers", () => {
    let cal = emptyCalibration("chicken curry rice");
    cal = updateCalibration(cal, 800, 960); // this dish runs 20 % high
    const { macros, calibrationFactor } = estimateFromVision(curry, {}, cal);
    expect(calibrationFactor).toBeCloseTo(1.2, 2);
    expect(macros.kcal).toBeCloseTo(885.1 * 1.2, 0);
  });
});
