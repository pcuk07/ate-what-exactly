import { describe, expect, it } from "vitest";
import { describeTier, TIER_ERROR_BAND, tierForSource } from "../tiers.js";

describe("tierForSource", () => {
  it("gives label data the tightest tier", () => {
    expect(tierForSource({ kind: "barcode", barcode: "1", foodId: "f" })).toBe("A");
  });

  it("gives weighed home cooking tier B", () => {
    expect(tierForSource({ kind: "recipe", recipeId: "r", portions: 4 })).toBe("B");
  });

  it("gives a menu match tier C", () => {
    expect(tierForSource({ kind: "menu", restaurantItemId: "m" })).toBe("C");
  });

  it("gives a photo estimate tier D", () => {
    expect(tierForSource({ kind: "photo", photoPath: "p", visionModel: "claude-opus-5" })).toBe("D");
  });

  it("does not let a manual guess masquerade as measured", () => {
    expect(tierForSource({ kind: "manual" })).toBe("D");
  });
});

describe("error bands", () => {
  it("widen monotonically from A to D", () => {
    expect(TIER_ERROR_BAND.A).toBeLessThan(TIER_ERROR_BAND.B);
    expect(TIER_ERROR_BAND.B).toBeLessThan(TIER_ERROR_BAND.C);
    expect(TIER_ERROR_BAND.C).toBeLessThan(TIER_ERROR_BAND.D);
  });

  it("describes a tier in words, for VoiceOver", () => {
    expect(describeTier("D")).toBe("Photo estimate, about ±30 %");
  });
});
