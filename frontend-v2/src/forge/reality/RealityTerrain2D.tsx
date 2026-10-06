import type { RealityTerrainViewModel } from "@/forge/reality/reality-terrain-model";
import { formatRealityMetric } from "@/forge/reality/reality-terrain-model";

const WIDTH = 920;
const HEIGHT = 360;
const PLOT_TOP = 50;
const PLOT_BOTTOM = 274;
const X_POSITIONS = [78, 270, 462, 654, 846] as const;

function yFor(value: number, min: number, max: number): number {
  const span = max - min || 1;
  const paddedMin = min - span * 0.08;
  const paddedMax = max + span * 0.1;
  return PLOT_BOTTOM - ((value - paddedMin) / (paddedMax - paddedMin)) * (PLOT_BOTTOM - PLOT_TOP);
}

export function RealityTerrain2D({
  model,
  selectedId,
  onSelect,
}: {
  model: RealityTerrainViewModel;
  selectedId: string;
  onSelect: (checkpointId: string) => void;
}) {
  const points = model.stages.map((stage, index) => ({
    x: X_POSITIONS[index],
    y: yFor(stage.value.value, model.minValue, model.maxValue),
    stage,
  }));
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const fill = `${line} L${points.at(-1)?.x ?? WIDTH},${PLOT_BOTTOM} L${points[0]?.x ?? 0},${PLOT_BOTTOM} Z`;
  const stress = points.at(-1);
  const prior = points.at(-2);
  const axisValues = Array.from(
    { length: 4 },
    (_, index) => model.minValue + ((model.maxValue - model.minValue) * index) / 3,
  ).reverse();

  return (
    <section aria-label={`${model.metricLabel} Reality Terrain, two-dimensional evidence view`}>
      <div
        className="relative overflow-hidden border-b border-[#1D232B] bg-[#07090B]"
        data-testid="reality-terrain-2d"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(82,168,255,0.08),transparent_36%),linear-gradient(transparent_50%,rgba(255,176,0,0.025))]" />
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="relative block h-auto min-h-[310px] w-full min-w-[760px]"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="terrain-fill-2d" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#52A8FF" stopOpacity="0.18" />
              <stop offset="1" stopColor="#52A8FF" stopOpacity="0.015" />
            </linearGradient>
            <linearGradient id="stress-cut-2d" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FFB000" />
              <stop offset="0.72" stopColor="#FF5A57" />
            </linearGradient>
            <filter id="selected-glow-2d" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {axisValues.map((value, index) => {
            const y = PLOT_TOP + ((PLOT_BOTTOM - PLOT_TOP) * index) / 3;
            return (
              <g key={value}>
                <line x1="54" x2="878" y1={y} y2={y} stroke="#1D232B" strokeDasharray="2 7" />
                <text
                  x="46"
                  y={y + 4}
                  textAnchor="end"
                  fill="#64707c"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {value.toFixed(model.stages[0]?.value.precision ?? 2)}
                </text>
              </g>
            );
          })}
          {X_POSITIONS.map((x) => (
            <line key={x} x1={x} x2={x} y1={PLOT_TOP} y2={PLOT_BOTTOM} stroke="#141A20" />
          ))}

          <path d={fill} fill="url(#terrain-fill-2d)" />
          <path d={line} fill="none" stroke="#52A8FF" strokeWidth="2.25" />
          {prior && stress ? (
            <>
              <path
                d={`M${prior.x},${prior.y} L${stress.x},${stress.y}`}
                fill="none"
                stroke="url(#stress-cut-2d)"
                strokeWidth="4"
              />
              <path
                d={`M${prior.x},${prior.y} L${stress.x},${prior.y} L${stress.x},${stress.y} Z`}
                fill="#FF5A57"
                opacity="0.08"
              />
              <text
                x={(prior.x + stress.x) / 2}
                y={Math.min(prior.y, stress.y) - 16}
                textAnchor="middle"
                fill="#FF6C68"
                fontSize="11"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
              >
                STRESS CUT {formatRealityMetric(model.largestDegradation.change, true)}
              </text>
            </>
          ) : null}

          {points.map(({ x, y, stage }) => {
            const selected = stage.id === selectedId;
            const stressStage = stage.id === "L4_COUNTERFACTUAL_STRESS";
            return (
              <g key={stage.id}>
                <line
                  x1={x}
                  x2={x}
                  y1={y}
                  y2={PLOT_BOTTOM}
                  stroke={stressStage ? "#5F2E31" : "#223546"}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={selected ? 8 : 5.5}
                  fill={stressStage ? "#FF5A57" : selected ? "#FFB000" : "#52A8FF"}
                  stroke="#07090B"
                  strokeWidth="3"
                  filter={selected ? "url(#selected-glow-2d)" : undefined}
                />
                <text
                  x={x}
                  y={y - 15}
                  textAnchor="middle"
                  fill={selected ? "#FFB000" : "#E6E8EB"}
                  fontSize="12"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatRealityMetric(stage.value)}
                </text>
                <text
                  x={x}
                  y={PLOT_BOTTOM + 28}
                  textAnchor="middle"
                  fill={stressStage ? "#FF6C68" : selected ? "#FFB000" : "#A6AFB8"}
                  fontSize="10"
                  fontWeight="600"
                  letterSpacing="1.2"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {stage.label}
                </text>
                <text
                  x={x}
                  y={PLOT_BOTTOM + 47}
                  textAnchor="middle"
                  fill="#5F6A75"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {stage.engine.toUpperCase()}
                </text>
              </g>
            );
          })}
          <text
            x="54"
            y="27"
            fill="#71808C"
            fontSize="9"
            letterSpacing="1.4"
            fontFamily="JetBrains Mono, monospace"
          >
            {model.metricLabel.toUpperCase()} / MEASURED HEIGHT
          </text>
          <text
            x="878"
            y="342"
            textAnchor="end"
            fill="#71808C"
            fontSize="9"
            letterSpacing="1.4"
            fontFamily="JetBrains Mono, monospace"
          >
            EXECUTION REALISM →
          </text>
        </svg>
      </div>

      <div className="overflow-x-auto border-b border-[#1D232B]">
        <ol
          className="grid min-w-[760px] grid-cols-5 bg-[#1D232B] gap-px"
          aria-label="Reality Terrain checkpoints"
        >
          {model.stages.map((stage) => {
            const selected = stage.id === selectedId;
            const stressStage = stage.id === "L4_COUNTERFACTUAL_STRESS";
            return (
              <li key={stage.id} className="bg-[#0B0E11]">
                <button
                  type="button"
                  onClick={() => onSelect(stage.id)}
                  aria-pressed={selected}
                  className={`group w-full border-t-2 px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                    selected
                      ? "border-t-[#FFB000] bg-[#14140F]"
                      : stressStage
                        ? "border-t-[#763B3A] hover:bg-[#141011]"
                        : "border-t-transparent hover:bg-[#10151A]"
                  }`}
                >
                  <span
                    className={`block font-mono text-[10px] font-semibold tracking-[0.1em] ${stressStage ? "text-[#FF6C68]" : selected ? "text-[#FFB000]" : "text-[#C8CFD5]"}`}
                  >
                    {stage.label}
                  </span>
                  <span className="mt-1.5 block font-mono text-[13px] font-medium tabular-nums text-[#E6E8EB]">
                    {formatRealityMetric(stage.value)}
                  </span>
                  <span className="mt-1 block font-mono text-[9px] tabular-nums text-[#7F8993]">
                    {stage.deltaFromPrior
                      ? `Δ ${formatRealityMetric(stage.deltaFromPrior, true)}`
                      : "REFERENCE"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
