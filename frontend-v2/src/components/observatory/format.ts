/** Escape trace-derived text before it goes into label or tooltip HTML. */
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Signed fixed-point with a true minus sign. */
export const fmt = (v: number, digits = 3) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(digits);
/** Signed standard deviations: +1.2σ. */
export const sigma = (v: number, digits = 1) =>
  (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(digits) + "σ";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1];
/**
 * "Jun–Dec 2023" within a year, else "Oct 2023 – May 2024". Dates are ISO strings. `wrap` breaks
 * a cross-year range onto two lines so it fits a fold column.
 */
export function monthRange(a: string, b: string, wrap = false) {
  return a.slice(0, 4) === b.slice(0, 4)
    ? `${month(a)}–${month(b)} ${a.slice(0, 4)}`
    : `${month(a)} ${a.slice(0, 4)} –${wrap ? "<br>" : " "}${month(b)} ${b.slice(0, 4)}`;
}

/** mulberry32: the reference's fixed-seed stream, so clouds and strands are reproducible. */
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Standard normal by Box–Muller. */
export function gauss(r: () => number) {
  const u = Math.max(1e-9, r()),
    v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
