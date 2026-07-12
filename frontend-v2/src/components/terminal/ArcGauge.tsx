// Simple arc gauge — 135° sweep on each side of center. Value in [-1, 1].
// dir tells us the semantic direction (up/down) so we color match.
type Props = {
  value: number; // 0..1 confidence
  dir: "up" | "down";
  size?: number;
  label?: string;
  trend?: number[]; // last N confidence samples for the mini sparkline
};

export function ArcGauge({ value, dir, size = 110, label, trend }: Props) {
  const cx = size / 2;
  const cy = size * 0.62;
  const r = size * 0.38;
  const start = Math.PI + Math.PI / 4; // 225°
  const end = 2 * Math.PI - Math.PI / 4; // 315° (going the short way through 270)
  const sweep = end - start; // 90° actually — we want 270° visual. Use full 270:
  const s = Math.PI - Math.PI / 6; // 150°
  const e = 2 * Math.PI + Math.PI / 6; // 390°
  const total = e - s;
  const clamped = Math.max(0, Math.min(1, value));
  const needleAngle = s + clamped * total;

  function pt(a: number, rr: number) {
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
  }
  function arcPath(a1: number, a2: number, rr: number) {
    const [x1, y1] = pt(a1, rr);
    const [x2, y2] = pt(a2, rr);
    const large = a2 - a1 > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${rr} ${rr} 0 ${large} 1 ${x2} ${y2}`;
  }

  const color = dir === "up" ? "#42C98B" : "#F06464";
  const [nx, ny] = pt(needleAngle, r - 6);
  const trendPts = trend && trend.length > 1
    ? trend.map((v, i) => {
        const x = (i / (trend.length - 1)) * (size - 20) + 10;
        const y = size - 8 - v * 10;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")
    : null;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="block" width={size} height={size}>
      {/* Track */}
      <path d={arcPath(s, e, r)} stroke="#171B1F" strokeWidth={7} fill="none" strokeLinecap="round" />
      {/* Filled arc */}
      <path
        d={arcPath(s, needleAngle, r)}
        stroke={color}
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)" }}
      />
      {/* Ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const a = s + t * total;
        const [tx1, ty1] = pt(a, r + 2);
        const [tx2, ty2] = pt(a, r + 5);
        return <line key={i} x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#636C74" strokeWidth={1} />;
      })}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#F0A929" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2.5} fill="#F0A929" />
      {/* Value */}
      <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={14} fill="#E7EAEC">
        {(clamped * 100).toFixed(0)}%
      </text>
      {label && (
        <text x={cx} y={cy + 12} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={7} fill="#636C74" style={{ letterSpacing: "0.08em" }}>
          {label.toUpperCase()}
        </text>
      )}
      {/* Trend sparkline */}
      {trendPts && (
        <polyline points={trendPts} fill="none" stroke={color} strokeWidth={0.75} opacity={0.7} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

