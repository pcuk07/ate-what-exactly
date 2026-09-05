import { Platform, useColorScheme, type TextStyle } from "react-native";

/**
 * The design system from doc §7.3–§7.5, as tokens.
 * One accent, one state colour, system neutrals so Dark Mode and the
 * accessibility settings come free.
 */

export interface Palette {
  bg: string;
  bgGrouped: string;
  surface: string;
  label: string;
  label2: string;
  separator: string;
  accent: string;
  accentInk: string;
  over: string;
  tier: Record<"A" | "B" | "C" | "D", string>;
}

const light: Palette = {
  bg: "#FFFFFF",
  bgGrouped: "#F2F2F7",
  surface: "#FFFFFF",
  label: "#000000",
  label2: "rgba(60,60,67,0.6)",
  separator: "rgba(60,60,67,0.29)",
  accent: "#0E7C72",
  accentInk: "#FFFFFF",
  over: "#B45309",
  tier: { A: "#0E7C72", B: "rgba(14,124,114,0.7)", C: "rgba(14,124,114,0.45)", D: "rgba(14,124,114,0.25)" },
};

const dark: Palette = {
  bg: "#000000",
  bgGrouped: "#000000",
  surface: "#1C1C1E",
  label: "#FFFFFF",
  label2: "rgba(235,235,245,0.6)",
  separator: "rgba(84,84,88,0.6)",
  accent: "#4FC8BB",
  accentInk: "#08201D",
  over: "#FBBF24",
  tier: { A: "#4FC8BB", B: "rgba(79,200,187,0.7)", C: "rgba(79,200,187,0.45)", D: "rgba(79,200,187,0.25)" },
};

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

/** 8-pt grid, 16-pt screen margins (§7.5). */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/**
 * Continuous ("squircle") corners where the platform has them, and concentric
 * nesting: an inner radius is the outer minus its padding (§7.5).
 */
export const radius = { card: 20, inner: 12, pill: 999 } as const;

/**
 * Typed as a plain optional rather than `as const`: the const union isn't
 * assignable to ImageStyle, and this is applied to images as well as views.
 */
export const cornerCurve: { borderCurve?: "continuous" } =
  Platform.OS === "ios" ? { borderCurve: "continuous" } : {};

/**
 * Type roles (§7.4). The hero numeral is the one warm gesture: SF Pro Rounded
 * on iOS, the platform default elsewhere. Never ship SF on Android.
 */
export const roundedFont = Platform.select({ ios: "SF Pro Rounded", default: undefined });

type TypeRole =
  | "hero"
  | "largeTitle"
  | "headline"
  | "body"
  | "bodyNum"
  | "subheadline"
  | "footnote"
  | "caption";

/**
 * Typed as TextStyle rather than `as const`: React Native needs `fontVariant`
 * to be a mutable array, and a readonly tuple is rejected at every call site.
 */
export const type: Record<TypeRole, TextStyle> = {
  hero: { fontSize: 44, fontWeight: "600", fontFamily: roundedFont, fontVariant: ["tabular-nums"] },
  largeTitle: { fontSize: 34, fontWeight: "700" },
  headline: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 17, fontWeight: "400" },
  bodyNum: { fontSize: 17, fontWeight: "400", fontVariant: ["tabular-nums"] },
  subheadline: { fontSize: 15, fontWeight: "400", fontVariant: ["tabular-nums"] },
  footnote: { fontSize: 13, fontWeight: "400" },
  caption: { fontSize: 12, fontWeight: "400" },
};

/** Spring specs from §7.6. Reduce Motion swaps these for a short fade. */
export const springs = {
  standard: { damping: 20, stiffness: 180, mass: 1 },
  snappy: { damping: 26, stiffness: 250, mass: 1 },
} as const;
