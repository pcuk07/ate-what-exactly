import type { EntrySource, Tier } from "./types.js";

/**
 * Upper bound of the typical error band for each tier, as a fraction.
 * Design doc §3: A ±1–2 %, B ±2–5 %, C ±5–15 %, D ±15–30 %+.
 * We store the upper bound so the UI never claims more precision than the tier has.
 */
export const TIER_ERROR_BAND: Record<Tier, number> = {
  A: 0.02,
  B: 0.05,
  C: 0.15,
  D: 0.3,
};

export const TIER_LABEL: Record<Tier, string> = {
  A: "Label data",
  B: "Weighed",
  C: "Menu match",
  D: "Photo estimate",
};

/** The tier is a property of the data source, not of the app. */
export function tierForSource(source: EntrySource): Tier {
  switch (source.kind) {
    case "barcode":
      return "A";
    case "recipe":
      return "B";
    case "menu":
      return "C";
    case "photo":
      return "D";
    case "manual":
      return "D";
  }
}

/** Plain-language description for VoiceOver and for the entry detail screen. */
export function describeTier(tier: Tier): string {
  const pct = Math.round(TIER_ERROR_BAND[tier] * 100);
  return `${TIER_LABEL[tier]}, about ±${pct} %`;
}
