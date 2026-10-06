import type { HMMTrace } from "./types";

/** Fixed hue per regime label. HMM state indices are arbitrary and differ between tickers. */
export const REGIME_COLORS: Record<string, string> = {
  "Low-Vol Bullish": "#39E6B5",
  "Sideways / Choppy": "#6AA8FF",
  Recovery: "#B88CFF",
  "Stress / Selloff": "#FF4D6D",
};
const REGIME_ORDER = Object.keys(REGIME_COLORS);
const UNKNOWN = "#A7B0B7";
/** Short- to long-window realized volatility; their summed state means rank duplicate labels. */
const VOL_FEATURES = ["realized_vol_5", "realized_vol_20", "realized_vol_60"];

export type RegimeState = {
  /** HMM state index in the trace. */
  index: number;
  label: string;
  /** Display name: the label, plus "· calmer"/"· choppier" when the fit repeats a label. */
  name: string;
  color: string;
  /** Position in the canonical display order (legend, matrix, occupancy). */
  order: number;
};

export function mixHex(hex: string, toward: string, amount: number) {
  const channel = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(channel(hex, i) + (channel(toward, i) - channel(hex, i)) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

/**
 * Colour each state by its label. When the labeller gives two states the same label, both keep
 * the label's hue: they are ordered by the sum of their realized-vol means in the final fit
 * (short + medium + long window), the calmer first, and the choppier one takes a lighter tint.
 */
export function regimeStates(trace: HMMTrace): RegimeState[] {
  const final = trace.frames[trace.frames.length - 1];
  const vol = VOL_FEATURES.map((f) => trace.feature_names.indexOf(f)).filter((j) => j >= 0);
  const volScore = (s: number) => vol.reduce((sum, j) => sum + final.means[s][j], 0);
  const states = Array.from({ length: trace.n_states }, (_, index) => {
    const label = trace.labels[index] ?? `State ${index}`;
    return { index, label, name: label, color: REGIME_COLORS[label] ?? UNKNOWN, order: 0 };
  });
  const groups = new Map<string, RegimeState[]>();
  for (const s of states) groups.set(s.label, [...(groups.get(s.label) ?? []), s]);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => volScore(a.index) - volScore(b.index) || a.index - b.index);
    group.forEach((s, rank) => {
      s.name =
        group.length === 2
          ? `${s.label} · ${rank === 0 ? "calmer" : "choppier"}`
          : `${s.label} · vol rank ${rank + 1} of ${group.length}`;
      s.color = mixHex(s.color, "#FFFFFF", (0.42 * rank) / (group.length - 1));
    });
  }
  const canonical = (s: RegimeState) => {
    const k = REGIME_ORDER.indexOf(s.label);
    return k < 0 ? REGIME_ORDER.length : k;
  };
  [...states]
    .sort(
      (a, b) =>
        canonical(a) - canonical(b) ||
        groups.get(a.label)!.indexOf(a) - groups.get(b.label)!.indexOf(b) ||
        a.index - b.index,
    )
    .forEach((s, order) => (s.order = order));
  return states;
}

/** States in display order. */
export const byOrder = (states: RegimeState[]) => [...states].sort((a, b) => a.order - b.order);
