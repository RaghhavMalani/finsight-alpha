import type { DynamicsExperiment } from "@/dynamics/contracts";

const WIDTH = 920;
const HEIGHT = 430;
const LEFT = 68;
const RIGHT = 890;
const TOP = 38;
const BOTTOM = 366;
const MILLISECONDS_PER_UNIT: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

function extent(values: number[]): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.12, 0.08);
  return [minimum - padding, maximum + padding];
}

function scale(value: number, domain: [number, number], range: [number, number]): number {
  return range[0] + ((value - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]);
}

export function PhasePortrait({ experiment }: { experiment: DynamicsExperiment }) {
  const millisecondsPerUnit = MILLISECONDS_PER_UNIT[experiment.world.timeUnit] ?? 86_400_000;
  const transitions = experiment.series.slice(0, -1).map((point, index) => ({
    x: point.observed,
    delta:
      (experiment.series[index + 1].observed - point.observed) /
      Math.max(
        (new Date(experiment.series[index + 1].observedAt).getTime() -
          new Date(point.observedAt).getTime()) /
          millisecondsPerUnit,
        Number.EPSILON,
      ),
    holdout: index + 1 >= experiment.trainWindow.endIndex,
  }));
  const xDomain = extent(transitions.map((point) => point.x));
  const yDomain = extent(transitions.map((point) => point.delta));
  const xFor = (value: number) => scale(value, xDomain, [LEFT, RIGHT]);
  const yFor = (value: number) => scale(value, yDomain, [BOTTOM, TOP]);
  const driftAt = (value: number) =>
    experiment.parameters.theta * (experiment.parameters.mu - value);
  const regression = `M ${xFor(xDomain[0])} ${yFor(driftAt(xDomain[0]))} L ${xFor(xDomain[1])} ${yFor(driftAt(xDomain[1]))}`;
  const equilibrium = experiment.parameters.mu;

  return (
    <div className="relative overflow-x-auto bg-[#07090B]" data-testid="dynamics-phase-portrait">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(240,169,41,0.08),transparent_34%),linear-gradient(rgba(82,168,255,0.02),transparent)]" />
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="relative block h-auto min-h-[360px] w-full min-w-[760px]"
        role="img"
        aria-label="Phase portrait of the observable against its next-step change"
      >
        <defs>
          <filter id="dynamics-equilibrium-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {Array.from({ length: 7 }, (_, index) => {
          const x = LEFT + ((RIGHT - LEFT) * index) / 6;
          return <line key={`x-${x}`} x1={x} x2={x} y1={TOP} y2={BOTTOM} stroke="#182029" />;
        })}
        {Array.from({ length: 5 }, (_, index) => {
          const y = TOP + ((BOTTOM - TOP) * index) / 4;
          return (
            <line
              key={`y-${y}`}
              x1={LEFT}
              x2={RIGHT}
              y1={y}
              y2={y}
              stroke="#1D2730"
              strokeDasharray="2 7"
            />
          );
        })}
        {yDomain[0] < 0 && yDomain[1] > 0 ? (
          <line x1={LEFT} x2={RIGHT} y1={yFor(0)} y2={yFor(0)} stroke="#47515B" />
        ) : null}
        {transitions.map((point, index) => (
          <circle
            key={`${point.x}-${index}`}
            cx={xFor(point.x)}
            cy={yFor(point.delta)}
            r={point.holdout ? 3.1 : 2.15}
            fill={point.holdout ? "#FFB000" : "#52A8FF"}
            opacity={point.holdout ? 0.7 : 0.28}
          />
        ))}
        <path d={regression} fill="none" stroke="#E6E8EB" strokeWidth="2.2" />
        <line
          x1={xFor(equilibrium)}
          x2={xFor(equilibrium)}
          y1={TOP}
          y2={BOTTOM}
          stroke="#FFB000"
          strokeDasharray="4 6"
        />
        <circle
          cx={xFor(equilibrium)}
          cy={yFor(0)}
          r="6"
          fill="#FFB000"
          filter="url(#dynamics-equilibrium-glow)"
        />
        <text
          x={xFor(equilibrium) + 11}
          y={yFor(0) - 11}
          fill="#FFB000"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
        >
          INFERRED EQUILIBRIUM μ
        </text>
        <text x={LEFT} y="407" fill="#6F7A85" fontSize="10" fontFamily="JetBrains Mono, monospace">
          Xₜ / OBSERVABLE STATE
        </text>
        <text
          x="18"
          y={(TOP + BOTTOM) / 2}
          fill="#6F7A85"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
          transform={`rotate(-90 18 ${(TOP + BOTTOM) / 2})`}
        >
          ΔX / {experiment.world.timeUnit.toUpperCase()} · IRREGULAR-TIME NORMALIZED
        </text>
        <g transform={`translate(${RIGHT - 238} 18)`}>
          <circle cx="4" cy="0" r="3" fill="#52A8FF" opacity="0.6" />
          <text x="14" y="4" fill="#75808A" fontSize="9" fontFamily="JetBrains Mono, monospace">
            TRAIN
          </text>
          <circle cx="82" cy="0" r="3" fill="#FFB000" />
          <text x="92" y="4" fill="#A48A56" fontSize="9" fontFamily="JetBrains Mono, monospace">
            FUTURE HOLDOUT
          </text>
        </g>
      </svg>
    </div>
  );
}
