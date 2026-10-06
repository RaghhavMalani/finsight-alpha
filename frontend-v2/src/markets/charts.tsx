import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  bandPath,
  extent,
  labelIndices,
  labelRows,
  linePath,
  linearScale,
  niceTicks,
  pad,
  quantile,
  unit,
} from "./chart-math";

type Num = number | null;

/** Track an element's width so SVG text is drawn at real size instead of being stretched. */
function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export type LineSeries = { label: string; values: Num[]; color: string; dashed?: boolean };

/**
 * Lines over a shared x axis. `x` is either numbers (spot, days) or labels (dates), in which
 * case points are evenly spaced. An optional band shades between two series, and vertical
 * markers flag values such as spot or breakevens. Hovering shows every series at that x.
 */
export function LineChart({
  x,
  series,
  band,
  markers = [],
  zero = false,
  height = 220,
  yFormat,
  xFormat = (v) => String(v),
  label,
}: {
  x: readonly (number | string)[];
  series: LineSeries[];
  band?: { lo: Num[]; hi: Num[]; color: string; label: string };
  markers?: { at: number; label: string }[];
  zero?: boolean;
  height?: number;
  yFormat: (v: number) => string;
  xFormat?: (v: number | string) => string;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const numeric = typeof x[0] === "number";
  const xs = numeric ? (x as number[]) : x.map((_, i) => i);
  const yExt = extent(
    ...series.map((s) => s.values),
    band?.lo ?? [],
    band?.hi ?? [],
    zero ? [0] : [],
  );
  const m = { l: 58, r: 12, t: 10, b: 24 };
  if (!yExt || xs.length < 2)
    return <p className="mk-line">No values to plot for {label.toLowerCase()}.</p>;
  const [y0, y1] = pad(yExt);
  const sx = linearScale([xs[0], xs[xs.length - 1]], [m.l, width - m.r]);
  const sy = linearScale([y0, y1], [height - m.b, m.t]);
  const yTicks = niceTicks(y0, y1, 4);
  const shown = markers.filter((mk) => mk.at >= sx.domain[0] && mk.at <= sx.domain[1]);
  const rows = labelRows(
    shown.map((mk) => sx(mk.at)),
    56,
  );
  const xLabels = numeric
    ? niceTicks(xs[0], xs[xs.length - 1], Math.max(2, Math.floor(width / 110)))
    : labelIndices(xs.length, Math.max(2, Math.floor(width / 120)));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < xs.length; i++)
      if (Math.abs(sx(xs[i]) - px) < Math.abs(sx(xs[best]) - px)) best = i;
    setHover(best);
  };

  return (
    <figure className="mk-chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} className="mk-gridline" />
            <text x={m.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="mk-tick">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {zero && y0 < 0 && y1 > 0 && (
          <line x1={m.l} x2={width - m.r} y1={sy(0)} y2={sy(0)} className="mk-zero" />
        )}
        {xLabels.map((v) => (
          <text key={v} x={sx(v)} y={height - 6} textAnchor="middle" className="mk-tick">
            {numeric ? xFormat(v) : xFormat(x[v])}
          </text>
        ))}
        {band && (
          <path
            d={bandPath(xs, band.lo, band.hi, sx, sy)}
            fill={band.color}
            opacity={0.16}
            stroke="none"
          />
        )}
        {shown.map((mk, i) => (
          <g key={`${mk.label}${mk.at}`}>
            <line x1={sx(mk.at)} x2={sx(mk.at)} y1={m.t} y2={height - m.b} className="mk-marker" />
            <text x={sx(mk.at) + 4} y={m.t + 10 + rows[i] * 13} className="mk-tick mk-marker-label">
              {mk.label}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.label}
            d={linePath(xs, s.values, sx, sy)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.6}
            strokeDasharray={s.dashed ? "4 3" : undefined}
          />
        ))}
        {hover != null && (
          <line
            x1={sx(xs[hover])}
            x2={sx(xs[hover])}
            y1={m.t}
            y2={height - m.b}
            className="mk-cursor"
          />
        )}
      </svg>
      <figcaption className="mk-legend">
        {hover != null ? (
          <>
            <span className="mk-legend-x">{xFormat(x[hover])}</span>
            {band && (
              <span>
                <i style={{ background: band.color, opacity: 0.4 }} />
                {band.label} {fmtOr(band.lo[hover], yFormat)} – {fmtOr(band.hi[hover], yFormat)}
              </span>
            )}
            {series.map((s) => (
              <span key={s.label}>
                <i style={{ background: s.color }} />
                {s.label} {fmtOr(s.values[hover], yFormat)}
              </span>
            ))}
          </>
        ) : (
          <>
            {band && (
              <span>
                <i style={{ background: band.color, opacity: 0.4 }} />
                {band.label}
              </span>
            )}
            {series.map((s) => (
              <span key={s.label}>
                <i style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </>
        )}
      </figcaption>
    </figure>
  );
}

function fmtOr(v: Num | undefined, f: (v: number) => string) {
  return v == null ? "—" : f(v);
}

/** Vertical bars at given centres (a return histogram), with optional threshold markers. */
export function Histogram({
  centers,
  counts,
  markers = [],
  xFormat,
  label,
  height = 180,
}: {
  centers: Num[];
  counts: number[];
  markers?: { at: number; label: string }[];
  xFormat: (v: number) => string;
  label: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const pts = centers
    .map((c, i) => ({ c, n: counts[i] }))
    .filter((p): p is { c: number; n: number } => p.c != null);
  const xExt = extent(pts.map((p) => p.c));
  if (!xExt || pts.length < 2) return <p className="mk-line">No values to plot for {label}.</p>;
  const m = { l: 40, r: 12, t: 10, b: 24 };
  const step = (xExt[1] - xExt[0]) / (pts.length - 1);
  const sx = linearScale([xExt[0] - step / 2, xExt[1] + step / 2], [m.l, width - m.r]);
  const top = Math.max(...pts.map((p) => p.n));
  const sy = linearScale([0, top * 1.08], [height - m.b, m.t]);
  const bw = Math.max(1, sx(xExt[0] + step) - sx(xExt[0]) - 1);
  const histRows = labelRows(
    markers.map((mk) => sx(mk.at)),
    56,
  );
  return (
    <figure className="mk-chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {niceTicks(0, top, 3).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} className="mk-gridline" />
            <text x={m.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="mk-tick">
              {t}
            </text>
          </g>
        ))}
        {pts.map((p) => (
          <rect
            key={p.c}
            x={sx(p.c) - bw / 2}
            y={sy(p.n)}
            width={bw}
            height={Math.max(0, sy(0) - sy(p.n))}
            className={markers.some((mk) => p.c <= mk.at) ? "mk-hist-tail" : "mk-hist"}
          >
            <title>
              {xFormat(p.c)}: {p.n} days
            </title>
          </rect>
        ))}
        {niceTicks(xExt[0], xExt[1], Math.max(2, Math.floor(width / 110))).map((t) => (
          <text key={t} x={sx(t)} y={height - 6} textAnchor="middle" className="mk-tick">
            {xFormat(t)}
          </text>
        ))}
        {markers.map((mk, i) => (
          <g key={mk.label}>
            <line x1={sx(mk.at)} x2={sx(mk.at)} y1={m.t} y2={height - m.b} className="mk-marker" />
            <text
              x={sx(mk.at) + 4}
              y={m.t + 10 + histRows[i] * 13}
              className="mk-tick mk-marker-label"
            >
              {mk.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** A rows × columns grid of values coloured on a sequential ramp; hover shows the cell. */
export function HeatGrid({
  rows,
  cols,
  values,
  rowFormat,
  colFormat,
  valueFormat,
  label,
  rowTitle,
  colTitle,
}: {
  rows: number[];
  cols: number[];
  values: number[][];
  rowFormat: (v: number) => string;
  colFormat: (v: number) => string;
  valueFormat: (v: number) => string;
  label: string;
  rowTitle: string;
  colTitle: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<[number, number] | null>(null);
  const ext = extent(...values);
  if (!ext) return <p className="mk-line">No values to plot for {label}.</p>;
  // Colour spans the 2nd–98th percentile so one extreme cell doesn't flatten the rest.
  const flat = values.flat();
  const lo = quantile(flat, 0.02) ?? ext[0],
    hi = quantile(flat, 0.98) ?? ext[1];
  const clipped = lo > ext[0] || hi < ext[1];
  const m = { l: 52, r: 8, t: 8, b: 26 };
  const cellW = (width - m.l - m.r) / cols.length;
  const cellH = Math.max(8, Math.min(18, 260 / rows.length));
  const height = m.t + m.b + cellH * rows.length;
  const colLabels = labelIndices(cols.length, Math.max(2, Math.floor(width / 90)));
  const rowLabels = labelIndices(rows.length, Math.max(2, Math.floor((cellH * rows.length) / 40)));
  return (
    <figure className="mk-chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {values.map((row, i) =>
          row.map((v, j) => (
            <rect
              key={`${i}-${j}`}
              x={m.l + j * cellW}
              y={m.t + i * cellH}
              width={cellW + 0.5}
              height={cellH + 0.5}
              fill={ramp(unit(v, lo, hi))}
              onPointerEnter={() => setHover([i, j])}
            />
          )),
        )}
        {colLabels.map((j) => (
          <text
            key={j}
            x={m.l + (j + 0.5) * cellW}
            y={height - 8}
            textAnchor="middle"
            className="mk-tick"
          >
            {colFormat(cols[j])}
          </text>
        ))}
        {rowLabels.map((i) => (
          <text
            key={i}
            x={m.l - 6}
            y={m.t + (i + 0.5) * cellH}
            dy="0.32em"
            textAnchor="end"
            className="mk-tick"
          >
            {rowFormat(rows[i])}
          </text>
        ))}
      </svg>
      <figcaption className="mk-legend" onPointerLeave={() => setHover(null)}>
        {hover ? (
          <span className="mk-legend-x">
            {rowTitle} {rowFormat(rows[hover[0]])} · {colTitle} {colFormat(cols[hover[1]])} ·{" "}
            {valueFormat(values[hover[0]][hover[1]])}
          </span>
        ) : (
          <span>
            <i className="mk-ramp" /> {valueFormat(lo)} to {valueFormat(hi)}
            {clipped &&
              ` (colour clipped to the 2nd–98th percentile; full range ${valueFormat(ext[0])} to ${valueFormat(ext[1])})`}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Dark teal → info cyan → amber. */
function ramp(t: number) {
  const stops = [
    [16, 35, 43],
    [69, 185, 211],
    [240, 169, 41],
  ];
  const s = t < 0.5 ? 0 : 1,
    f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const c = stops[s].map((a, k) => Math.round(a + (stops[s + 1][k] - a) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
