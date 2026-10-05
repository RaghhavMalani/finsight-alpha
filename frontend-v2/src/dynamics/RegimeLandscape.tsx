import { useId, useState } from "react";
import type { MarketRegimeArtifact, SurfaceCell } from "@/dynamics/market-regime-contracts";
import { useSnapshotLabel } from "@/dynamics/snapshot-label";

const fmt = (n: number | null | undefined, digits = 3) =>
  n == null ? "UNAVAILABLE" : n.toFixed(digits);

export function RegimeLandscape({ artifact }: { artifact: MarketRegimeArtifact }) {
  const id = useId();
  const regionLabel = useSnapshotLabel("Regime Fracture Landscape");
  const tableLabel = useSnapshotLabel("Objective components table");
  const surface = artifact.landscape;
  const cells = surface.cells;
  const [color, setColor] = useState("objective");
  const [showPath, setShowPath] = useState(true);
  const optimumIndex = cells.findIndex(
    (c) =>
      c.temperature === surface.optimum?.temperature &&
      c.sensitivity === surface.optimum?.sensitivity,
  );
  const [index, setIndex] = useState(Math.max(0, optimumIndex));
  const selected = cells[index];
  const allZ = [
    ...cells.map((c) => c.objective),
    ...artifact.optimizer_path.map((p) => p.objective),
  ];
  const low = Math.min(...allZ),
    high = Math.max(...allZ);
  const span = Math.max(0.001, high - low);
  const project = (tau: number, gamma: number, objective: number): [number, number] => {
    const x = (tau - 0.2) / 1.8 - 0.5;
    const y = gamma / 2 - 0.5;
    return [450 + (x - y) * 305, 310 + (x + y) * 110 - ((objective - low) / span) * 175];
  };
  const point = (c: SurfaceCell) => project(c.temperature, c.sensitivity, c.objective);
  const quads: Array<{ corners: SurfaceCell[]; cellIndex: number }> = [];
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 10; i++) {
      const k = j * 11 + i;
      if (cells[k] && cells[k + 12])
        quads.push({
          corners: [cells[k], cells[k + 1], cells[k + 12], cells[k + 11]],
          cellIndex: k,
        });
    }
  const trail = artifact.optimizer_path
    // Geometry is only an isometric view of server evidence, never a score.
    .map((p) =>
      project(p.temperature, p.sensitivity, p.objective)
        .map((n) => n.toFixed(1))
        .join(","),
    )
    .join(" ");
  return (
    <section className="border border-[#25313A] bg-[#080C0F]" aria-label={regionLabel}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#25313A] px-4 py-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#B49555]">
            MacroHFT / descriptive research replay
          </p>
          <h3 id={id} className="mt-1 text-base font-semibold text-[#E0E6EA]">
            Regime Fracture Landscape
          </h3>
          <p className="mt-1 text-[10px] text-[#8A969F]">
            Every vertex is a disclosed objective. No generated mountains.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-[10px] text-[#C4CDD3]">
          <label className="grid gap-1">
            Surface color
            <select
              aria-label="Landscape color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="border border-[#39464F] bg-[#11191E] p-1.5"
            >
              <option value="objective">Objective</option>
              <option value="stress">Risk / stress</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-4">
            <input
              type="checkbox"
              checked={showPath}
              onChange={(e) => setShowPath(e.target.checked)}
            />
            Optimizer trail
          </label>
        </div>
      </header>
      {surface.status === "UNAVAILABLE" ? (
        <div className="px-4 py-12">
          <p className="font-mono text-lg text-[#C8A96D]">LANDSCAPE UNAVAILABLE</p>
          <p className="mt-3 max-w-2xl text-xs leading-6 text-[#8A969F]">
            {surface.reason}. Available contiguous pairs: {surface.n}.
          </p>
          <p className="mt-2 text-[11px] text-[#8A969F]">
            Missing macro, factors, events or measured spread inputs are not replaced with zero.
          </p>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_70%,#142027_0%,#080C0F_65%)]">
            <svg
              viewBox="0 0 900 455"
              className="block w-full"
              role="img"
              aria-label="Three-dimensional parameter surface: arbitration temperature, macro sensitivity and historical objective"
            >
              <desc>
                Isometric projection of 121 server-computed objective points. Use the
                parameter-point selector below to inspect exact components. The trail uses each
                historical window's own objective.
              </desc>
              <defs>
                <linearGradient id={id + "-floor"} x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#14212A" />
                  <stop offset="1" stopColor="#080C0F" />
                </linearGradient>
              </defs>
              <polygon
                points="145,310 450,200 755,310 450,420"
                fill={"url(#" + id + "-floor)"}
                stroke="#30404B"
              />
              {Array.from({ length: 11 }, (_, i) => {
                const a = project(0.2 + i * 0.18, 0, low),
                  b = project(0.2 + i * 0.18, 2, low);
                const c = project(0.2, i * 0.2, low),
                  d = project(2, i * 0.2, low);
                return (
                  <g key={i} stroke="#24343E" strokeWidth=".7">
                    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                    <line x1={c[0]} y1={c[1]} x2={d[0]} y2={d[1]} />
                  </g>
                );
              })}
              {quads.map(({ corners, cellIndex }) => {
                const average =
                  corners.reduce(
                    (sum, c) => sum + (color === "stress" ? c.stress : (c.objective - low) / span),
                    0,
                  ) / 4;
                const hue = color === "stress" ? 160 - average * 145 : 205 - average * 168;
                return (
                  <polygon
                    key={cellIndex}
                    points={corners
                      .map((c) =>
                        point(c)
                          .map((n) => n.toFixed(1))
                          .join(","),
                      )
                      .join(" ")}
                    fill={"hsl(" + hue.toFixed(0) + " 48% " + (24 + average * 22).toFixed(0) + "%)"}
                    stroke="#A1B3BB"
                    strokeOpacity=".30"
                    strokeWidth=".65"
                  />
                );
              })}
              {showPath ? (
                <>
                  <polyline
                    points={trail}
                    fill="none"
                    stroke="#071015"
                    strokeWidth="4"
                    opacity=".8"
                  />
                  <polyline
                    points={trail}
                    fill="none"
                    stroke="#E6BE6D"
                    strokeWidth="1.7"
                    strokeDasharray="4 2"
                  />
                </>
              ) : null}
              {surface.optimum ? (
                <g>
                  <circle
                    cx={point(surface.optimum)[0]}
                    cy={point(surface.optimum)[1]}
                    r="7"
                    fill="#EBC681"
                    stroke="#171009"
                    strokeWidth="2"
                  />
                  <circle
                    cx={point(surface.optimum)[0]}
                    cy={point(surface.optimum)[1]}
                    r="13"
                    fill="none"
                    stroke="#EBC681"
                    opacity=".55"
                  />
                </g>
              ) : null}
              {selected ? (
                <circle
                  cx={point(selected)[0]}
                  cy={point(selected)[1]}
                  r="4"
                  fill="#E5F3F5"
                  stroke="#172C36"
                  strokeWidth="2"
                />
              ) : null}
              <g fill="#A4B3BC" fontFamily="monospace" fontSize="10">
                <text x="220" y="396">
                  X / ARBITRATION TEMPERATURE .2 → 2.0
                </text>
                <text x="551" y="396">
                  Y / MACRO SENSITIVITY 0 → 2.0
                </text>
                <text x="40" y="30">
                  Z / OBJECTIVE {fmt(low)} → {fmt(high)}
                </text>
                <text x="40" y="48">
                  {color === "stress" ? "COLOR / RISK-STRESS PROXY" : "COLOR / OBJECTIVE"}
                </text>
              </g>
            </svg>
          </div>
          <div className="grid gap-4 border-t border-[#25313A] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <label className="grid gap-2 font-mono text-[10px] text-[#A4B1BA]">
                Inspect parameter point
                <select
                  aria-label="Inspect landscape parameter point"
                  value={index}
                  onChange={(e) => setIndex(Number(e.target.value))}
                  className="w-full border border-[#34434D] bg-[#11191E] p-2 text-[#E0E6EA]"
                >
                  {cells.map((c, i) => (
                    <option key={i} value={i}>
                      τ {c.temperature.toFixed(2)} / γ {c.sensitivity.toFixed(2)} / J{" "}
                      {fmt(c.objective)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setIndex(Math.max(0, optimumIndex))}
                className="mt-3 border border-[#67512B] bg-[#19150C] px-3 py-2 font-mono text-[10px] text-[#D8BB82]"
              >
                Inspect in-sample optimum
              </button>
              <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-[10px] text-[#98A6AF]">
                <div>
                  <dt>Historical pairs</dt>
                  <dd className="mt-1 text-base text-[#E0E6EA]">{surface.n}</dd>
                </div>
                <div>
                  <dt>Gradient-change RMS</dt>
                  <dd className="mt-1 text-base text-[#E0E6EA]">
                    {fmt(surface.gradient_change, 5)}
                  </dd>
                </div>
                <div>
                  <dt>Optimizer windows</dt>
                  <dd className="mt-1 text-[#D8BB82]">{artifact.optimizer_path.length}</dd>
                </div>
                <div>
                  <dt>Selected objective</dt>
                  <dd className="mt-1 text-[#D8BB82]">{fmt(selected?.objective, 5)}</dd>
                </div>
              </dl>
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={tableLabel}>
              <table className="w-full font-mono text-[10px] text-[#A5B1B9]">
                <caption className="pb-2 text-left text-[#D4DCE1]">
                  Selected point / objective decomposition
                </caption>
                <thead>
                  <tr className="border-b border-[#25313A]">
                    <th className="py-2 text-left">Component</th>
                    <th className="text-right">Raw</th>
                    <th className="text-right">Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selected?.components ?? {}).map(([name, value]) => (
                    <tr key={name} className="border-b border-[#18242B]">
                      <th className="py-2 text-left font-normal">{name.replaceAll("_", " ")}</th>
                      <td className="text-right tabular-nums">{fmt(value, 5)}</td>
                      <td className="text-right tabular-nums text-[#D9C79B]">
                        {fmt(selected?.contributions[name], 5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="border-t border-[#25313A] px-4 py-3 text-[10px] leading-5 text-[#84939D]">
            <p>{surface.policy}</p>
            <p>
              {surface.evaluation}. {surface.cost_model}.
            </p>
            <p>
              The trail uses each window’s historical optimum and objective; it is not altitude on
              today’s surface. {surface.return_unit}.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
