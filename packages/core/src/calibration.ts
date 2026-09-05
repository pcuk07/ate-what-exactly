/**
 * Per-dish calibration. Design doc §5.4 / §3:
 * a correction you make to a photo-estimated dish is stored against the
 * dish's identity, and the next estimate of that dish starts from your
 * accumulated corrections. Deterministic, inspectable, no ML.
 *
 * We keep a running sum of log(corrected / original) so the factor is the
 * geometric mean of observed ratios — robust to one wild correction and
 * symmetric for over- and under-estimates.
 */

export interface CalibrationState {
  dishKey: string;
  /** Number of corrections folded in. */
  n: number;
  /** Sum of ln(corrected / original) over those corrections. */
  logSum: number;
}

export const CALIBRATION_MIN_FACTOR = 0.5;
export const CALIBRATION_MAX_FACTOR = 2.0;

/**
 * Normalise a dish name into a stable identity: lower-case, ASCII-ish,
 * punctuation and stop-words removed, tokens sorted. "Chicken Curry, large"
 * and "large chicken curry" collapse to the same key.
 */
export function dishKey(name: string): string {
  const stop = new Set(["a", "an", "the", "of", "with", "and", "&", "my", "some"]);
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !stop.has(t))
    .sort()
    .join(" ");
}

export function emptyCalibration(key: string): CalibrationState {
  return { dishKey: key, n: 0, logSum: 0 };
}

/** Fold one correction in. Ignores non-positive values, which carry no ratio. */
export function updateCalibration(
  state: CalibrationState,
  originalKcal: number,
  correctedKcal: number,
): CalibrationState {
  if (originalKcal <= 0 || correctedKcal <= 0) return state;
  return {
    dishKey: state.dishKey,
    n: state.n + 1,
    logSum: state.logSum + Math.log(correctedKcal / originalKcal),
  };
}

/** Multiplicative factor to apply to a fresh estimate of this dish. */
export function calibrationFactor(state: CalibrationState | undefined): number {
  if (!state || state.n === 0) return 1;
  const raw = Math.exp(state.logSum / state.n);
  return Math.min(CALIBRATION_MAX_FACTOR, Math.max(CALIBRATION_MIN_FACTOR, raw));
}
