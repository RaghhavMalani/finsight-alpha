/** Pure scale, tick and path math for the Markets SVG charts (tested by verify-markets). */

export type Scale = ((v: number) => number) & { domain: [number, number] };

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain,
    [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  scale.domain = [d0, d1];
  return scale;
}

/** Min and max over the finite values of several series; null when there are none. */
export function extent(
  ...lists: ReadonlyArray<number | null | undefined>[]
): [number, number] | null {
  let lo = Infinity,
    hi = -Infinity;
  for (const list of lists)
    for (const v of list)
      if (v != null && Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
  return lo <= hi ? [lo, hi] : null;
}

/** Round tick values (1, 2, 5 × 10^k) inside [lo, hi], about `count` of them. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (lo === hi) return [lo];
  if (lo > hi) [lo, hi] = [hi, lo];
  // d3's increment rule: the 1, 2 or 5 step whose tick count lands nearest `count`.
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const error = raw / mag;
  const step =
    mag * (error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.SQRT2 ? 2 : 1);
  const ticks: number[] = [];
  // Rounding to the step's precision keeps 0.1 + 0.2 style noise out of labels.
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step)
    ticks.push(Number(t.toFixed(digits)));
  return ticks;
}

/** Widen [lo, hi] by a fraction of its span (or of its magnitude when flat). */
export function pad([lo, hi]: [number, number], fraction = 0.06): [number, number] {
  const span = hi - lo || Math.abs(hi) || 1;
  return [lo - span * fraction, hi + span * fraction];
}

/** An SVG path through (x, y) pairs; a null y breaks the line instead of bridging it. */
export function linePath(
  xs: readonly number[],
  ys: ReadonlyArray<number | null>,
  sx: (v: number) => number,
  sy: (v: number) => number,
): string {
  let d = "",
    pen = false;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y == null || !Number.isFinite(y)) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** A closed band between two series (e.g. p5 to p95), over the indices where both exist. */
export function bandPath(
  xs: readonly number[],
  lo: ReadonlyArray<number | null>,
  hi: ReadonlyArray<number | null>,
  sx: (v: number) => number,
  sy: (v: number) => number,
): string {
  const idx = xs.map((_, i) => i).filter((i) => lo[i] != null && hi[i] != null);
  if (idx.length < 2) return "";
  const top = idx.map((i) => `${sx(xs[i]).toFixed(1)},${sy(hi[i] as number).toFixed(1)}`);
  const bottom = idx
    .slice()
    .reverse()
    .map((i) => `${sx(xs[i]).toFixed(1)},${sy(lo[i] as number).toFixed(1)}`);
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}

/** Evenly spaced indices for at most `count` axis labels, always including the last. */
export function labelIndices(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

/** Map a value in [lo, hi] to 0..1 for a colour ramp, clamped. */
export function unit(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 0.5;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

/** Linear-interpolated quantile of finite values (q in 0..1); null when there are none. */
export function quantile(values: Iterable<number | null>, q: number): number | null {
  const xs = [...values].filter((v): v is number => v != null && Number.isFinite(v));
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  const at = (xs.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(at);
  return xs[lo] + (xs[Math.min(lo + 1, xs.length - 1)] - xs[lo]) * (at - lo);
}

/**
 * Row for each label at x (input order) so that labels in one row are at least `gap` apart:
 * close markers such as strike and spot stack instead of overprinting.
 */
export function labelRows(xs: readonly number[], gap: number): number[] {
  const rows: number[] = [],
    out = new Array<number>(xs.length);
  xs.map((x, i) => [x, i] as const)
    .sort((a, b) => a[0] - b[0])
    .forEach(([x, i]) => {
      let row = rows.findIndex((last) => x - last >= gap);
      if (row < 0) row = rows.push(x) - 1;
      else rows[row] = x;
      out[i] = row;
    });
  return out;
}
