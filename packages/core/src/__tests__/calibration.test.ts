import { describe, expect, it } from "vitest";
import {
  CALIBRATION_MAX_FACTOR,
  calibrationFactor,
  dishKey,
  emptyCalibration,
  updateCalibration,
} from "../calibration.js";

describe("dishKey", () => {
  it("collapses word order, case and punctuation", () => {
    expect(dishKey("Chicken Curry, large")).toBe(dishKey("large chicken curry"));
  });

  it("drops stop words", () => {
    expect(dishKey("bowl of the porridge")).toBe(dishKey("porridge bowl"));
  });

  it("keeps different dishes distinct", () => {
    expect(dishKey("chicken curry")).not.toBe(dishKey("beef curry"));
  });

  it("is empty for a name with no meaningful tokens", () => {
    expect(dishKey("the  of ")).toBe("");
  });
});

describe("calibration", () => {
  it("is a no-op before any correction", () => {
    expect(calibrationFactor(emptyCalibration("curry"))).toBe(1);
    expect(calibrationFactor(undefined)).toBe(1);
  });

  it("moves toward a consistent under-estimate", () => {
    let state = emptyCalibration("curry");
    state = updateCalibration(state, 700, 840); // ×1.2
    state = updateCalibration(state, 800, 960); // ×1.2
    expect(calibrationFactor(state)).toBeCloseTo(1.2, 2);
  });

  it("uses the geometric mean, so one wild correction does not dominate", () => {
    let state = emptyCalibration("curry");
    state = updateCalibration(state, 700, 700);
    state = updateCalibration(state, 700, 700);
    state = updateCalibration(state, 700, 1400); // one ×2 outlier
    const factor = calibrationFactor(state);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThan(1.3);
  });

  it("clamps runaway factors", () => {
    let state = emptyCalibration("curry");
    for (let i = 0; i < 5; i++) state = updateCalibration(state, 100, 1000);
    expect(calibrationFactor(state)).toBe(CALIBRATION_MAX_FACTOR);
  });

  it("ignores corrections with no usable ratio", () => {
    const state = updateCalibration(emptyCalibration("curry"), 0, 500);
    expect(state.n).toBe(0);
    expect(calibrationFactor(state)).toBe(1);
  });
});
