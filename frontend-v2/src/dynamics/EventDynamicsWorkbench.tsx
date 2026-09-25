import { useMemo, useState } from "react";
import type {
  HawkesCertification,
  HawkesDecision,
  HawkesMetric,
  HawkesWorld,
} from "@/dynamics/hawkes-contracts";
import { StatusMark } from "@/forge/shared/SurfacePrimitives";

const METRIC_LABELS: Record<string, string> = {
  false_excitation_discovery_rate: "False excitation",
  true_excitation_detection_rate: "True detection",
  cross_excitation_precision: "Cross-edge precision",
  cross_excitation_recall: "Cross-edge recall",
  branching_ratio_error: "Branching error",
  branching_ratio_ci_coverage: "Branching CI coverage",
  direction_recovery_accuracy: "Direction recovery",
  near_critical_detection: "Near-critical",
  seasonality_confounding_rate: "Seasonality confound",
  common_shock_confounding_rate: "Common-shock confound",
  oos_log_likelihood_gain: "OOS LL gain",
  time_rescaling_calibration_rate: "Residual calibration",
  numerical_failure_rate: "Numerical failure",
  abstention_rate: "Abstention",
};

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function decimal(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function decisionTone(decision: HawkesDecision): string {
  if (decision === "DETECT") return "border-[#50652F] bg-[#10170C] text-[#B9D47A]";
  if (decision === "ABSTAIN") return "border-[#735D2A] bg-[#171208] text-[#DCB760]";
  return "border-[#35414A] bg-[#0C1115] text-[#99A5AD]";
}

function metricValue(metric: HawkesMetric): string {
  if (metric.estimate === null) return "—";
  if (metric.metric === "oos_log_likelihood_gain") return metric.estimate.toFixed(3);
  if (metric.metric === "branching_ratio_error") return metric.estimate.toFixed(3);
  return percent(metric.estimate);
}

export function EventDynamicsWorkbench({ artifact }: { artifact: HawkesCertification }) {
  const defaultWorld =
    artifact.worlds.find((world) => world.id === "directed_cross_excitation") ?? artifact.worlds[0];
  const [selectedId, setSelectedId] = useState(defaultWorld.id);
  const selected = artifact.worlds.find((world) => world.id === selectedId) ?? defaultWorld;
  const failedChecks = Object.values(artifact.capabilityChecks).filter((value) => !value).length;

  return (
    <article className="border border-[#25313A] bg-[#080C0F]" aria-labelledby="event-lab-title">
      <header className="border-b border-[#25313A] px-4 py-5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-[#7B8790]">
              D0.4 / Hawkes event-process certification
            </div>
            <h2
              id="event-lab-title"
              className="mt-2 max-w-4xl text-balance text-2xl font-semibold tracking-[-0.03em] text-[#E7ECEF]"
            >
              Distinguish excitation from clustering while the truth is known.
            </h2>
            <p className="mt-2 max-w-4xl text-[11px] leading-5 text-[#7D8992]">
              {artifact.scientificQuestion}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusMark status="ABSTAIN" label={artifact.programStatus} />
            <StatusMark status="PASS" label="0 MARKET CLAIMS" />
            <StatusMark status="PASS" label="0 CAUSAL CLAIMS" />
          </div>
        </div>
        <div className="mt-4 grid gap-px bg-[#25313A] sm:grid-cols-2 xl:grid-cols-4">
          <HeaderDatum label="Frozen worlds" value={`${artifact.execution.worldsExecuted}`} />
          <HeaderDatum
            label="Capability gates"
            value={`${Object.keys(artifact.capabilityChecks).length - failedChecks}/${Object.keys(artifact.capabilityChecks).length}`}
          />
          <HeaderDatum label="Event clock" value="CONTINUOUS" />
          <HeaderDatum
            label="Development worlds"
            value={`${artifact.execution.developmentWorlds}`}
          />
        </div>
      </header>

      <section className="grid border-b border-[#25313A] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <WorldLedger worlds={artifact.worlds} selectedId={selected.id} onSelect={setSelectedId} />
        <div className="min-w-0 border-t border-[#25313A] lg:border-l lg:border-t-0">
          <WorldHeader world={selected} />
          <div className="grid gap-px bg-[#25313A] xl:grid-cols-[minmax(0,1.12fr)_minmax(22rem,0.88fr)]">
            <div className="min-w-0 bg-[#080C0F]">
              <ExcitationGraph world={selected} />
              <IntensityTimeline world={selected} />
            </div>
            <div className="min-w-0 bg-[#080C0F]">
              <BranchingMatrix world={selected} />
              <ResidualPanel world={selected} />
            </div>
          </div>
          <div className="grid gap-px border-t border-[#25313A] bg-[#25313A] xl:grid-cols-2">
            <FalsificationRegister world={selected} />
            <ModelEvidence world={selected} />
          </div>
        </div>
      </section>

      <MetricVector metrics={artifact.metrics} checks={artifact.capabilityChecks} />

      <footer className="grid gap-px border-t border-[#25313A] bg-[#25313A] md:grid-cols-2">
        <ClaimBoundary artifact={artifact} />
        <EvidenceSeal artifact={artifact} />
      </footer>
    </article>
  );
}

function HeaderDatum({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0A0E11] px-3 py-3">
      <div className="font-mono text-[8px] uppercase tracking-[0.11em] text-[#5E6A73]">{name}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#D9E0E4]">
        {value}
      </div>
    </div>
  );
}

function WorldLedger({
  worlds,
  selectedId,
  onSelect,
}: {
  worlds: HawkesWorld[];
  selectedId: string;
  onSelect: (worldId: string) => void;
}) {
  return (
    <aside className="bg-[#090D10]" aria-label="Frozen D0.4 worlds">
      <div className="border-b border-[#25313A] px-3 py-3">
        <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#6D7982]">
          Frozen world ledger
        </div>
        <p className="mt-1 text-[9px] leading-4 text-[#5E6972]">
          Ground truth remains visible here.
        </p>
      </div>
      <div className="max-h-[44rem] overflow-y-auto [content-visibility:auto]">
        {worlds.map((world, index) => {
          const active = world.id === selectedId;
          return (
            <button
              key={world.id}
              type="button"
              onClick={() => onSelect(world.id)}
              aria-pressed={active}
              className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 border-b border-[#182128] px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#D6A849] ${
                active ? "bg-[#171309]" : "hover:bg-[#0E1418]"
              }`}
            >
              <span className="font-mono text-[8px] text-[#52606A]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-[10px] ${active ? "text-[#E3C67E]" : "text-[#AAB4BA]"}`}
                >
                  {world.label}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[7px] uppercase text-[#58656E]">
                  {label(world.role)}
                </span>
              </span>
              <span
                className={`border px-1.5 py-1 font-mono text-[7px] ${decisionTone(world.decision)}`}
              >
                {world.decision}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function WorldHeader({ world }: { world: HawkesWorld }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#25313A] px-4 py-3">
      <div>
        <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#68757E]">
          World {world.id} / seed {world.seed}
        </div>
        <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#DDE4E8]">
          {world.label}
        </h3>
        <p className="mt-1 max-w-3xl text-[10px] leading-4 text-[#74808A]">{world.notes}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={`border px-2 py-1.5 font-mono text-[8px] ${decisionTone(world.decision)}`}>
          PROCESS {world.decision}
        </span>
        <span className="border border-[#3D3420] bg-[#141107] px-2 py-1.5 font-mono text-[8px] text-[#B89C5F]">
          ρ {world.fit.spectralRadius.toFixed(3)}
        </span>
      </div>
    </header>
  );
}

function ExcitationGraph({ world }: { world: HawkesWorld }) {
  const positions =
    world.dimension === 1
      ? [{ x: 360, y: 145 }]
      : [
          { x: 190, y: 145 },
          { x: 530, y: 145 },
        ];
  const edges = world.fit.branchingMatrix.flatMap((row, target) =>
    row.map((contribution, source) => ({
      source,
      target,
      contribution,
      alpha: world.fit.alpha[target][source],
      beta: world.fit.beta[target][source],
      supported: world.fit.uncertainty.edgeSupport[target][source] === 1,
    })),
  );
  return (
    <section className="border-b border-[#25313A]" aria-labelledby="excitation-graph-title">
      <PanelHeader
        eyebrow="Conditional excitation structure"
        title="Excitation graph"
        meta="solid = bootstrap supported · faint = unresolved"
        id="excitation-graph-title"
      />
      <div className="relative bg-[#070A0D] px-2 py-3">
        <svg
          viewBox="0 0 720 300"
          className="h-auto w-full"
          role="img"
          aria-label={`Fitted excitation graph for ${world.label}`}
        >
          <defs>
            <marker
              id="event-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#C59A43" />
            </marker>
            <pattern id="event-grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#182128" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="720" height="300" fill="url(#event-grid)" opacity="0.7" />
          {edges.map((edge) => {
            const source = positions[edge.source];
            const target = positions[edge.target];
            const opacity = edge.supported
              ? 0.95
              : Math.max(0.14, Math.min(0.32, edge.contribution));
            const width = edge.supported ? 1.8 + edge.contribution * 5 : 1;
            if (edge.source === edge.target) {
              const path = `M ${source.x - 28} ${source.y - 32} C ${source.x - 86} ${source.y - 105}, ${source.x + 86} ${source.y - 105}, ${source.x + 28} ${source.y - 32}`;
              return (
                <g key={`${edge.source}-${edge.target}`} opacity={opacity}>
                  <path
                    d={path}
                    fill="none"
                    stroke={edge.supported ? "#C59A43" : "#53616B"}
                    strokeWidth={width}
                    strokeDasharray={edge.supported ? undefined : "4 6"}
                    markerEnd={edge.supported ? "url(#event-arrow)" : undefined}
                  />
                  <text
                    x={source.x}
                    y={source.y - 93}
                    textAnchor="middle"
                    fill="#8E9AA2"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    G {edge.contribution.toFixed(3)}
                  </text>
                </g>
              );
            }
            const dx = target.x - source.x;
            const direction = Math.sign(dx);
            const startX = source.x + direction * 48;
            const endX = target.x - direction * 54;
            const offset = edge.source < edge.target ? -18 : 24;
            return (
              <g key={`${edge.source}-${edge.target}`} opacity={opacity}>
                <path
                  d={`M ${startX} ${source.y + offset} C ${startX + dx * 0.32} ${source.y + offset * 2}, ${endX - dx * 0.32} ${target.y + offset * 2}, ${endX} ${target.y + offset}`}
                  fill="none"
                  stroke={edge.supported ? "#C59A43" : "#53616B"}
                  strokeWidth={width}
                  strokeDasharray={edge.supported ? undefined : "4 6"}
                  markerEnd={edge.supported ? "url(#event-arrow)" : undefined}
                />
                <text
                  x={(source.x + target.x) / 2}
                  y={source.y + offset * 2 - 5}
                  textAnchor="middle"
                  fill={edge.supported ? "#D8B967" : "#65727B"}
                  fontSize="10"
                  fontFamily="monospace"
                >
                  G {edge.contribution.toFixed(3)}
                </text>
              </g>
            );
          })}
          {positions.map((position, index) => {
            const incidentSupport = edges.some(
              (edge) => edge.supported && (edge.source === index || edge.target === index),
            );
            return (
              <g key={world.channels[index]}>
                <circle
                  cx={position.x}
                  cy={position.y}
                  r="48"
                  fill="#0D1418"
                  stroke={incidentSupport ? "#9F7E37" : "#3A4750"}
                  strokeWidth="1.5"
                />
                <circle cx={position.x} cy={position.y} r="38" fill="#0A0F13" stroke="#202C34" />
                <text
                  x={position.x}
                  y={position.y - 4}
                  textAnchor="middle"
                  fill="#E1E6E9"
                  fontSize="20"
                  fontWeight="600"
                >
                  {world.channels[index]}
                </text>
                <text
                  x={position.x}
                  y={position.y + 17}
                  textAnchor="middle"
                  fill="#6F7C85"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  μ {world.fit.baseline[index].toFixed(3)}
                </text>
              </g>
            );
          })}
          <text x="18" y="282" fill="#526069" fontSize="9" fontFamily="monospace">
            FITTED CONDITIONAL INTENSITY · NOT ECONOMIC CAUSATION
          </text>
        </svg>
      </div>
      <div className="grid gap-px border-t border-[#1D282F] bg-[#1D282F] sm:grid-cols-3">
        <GraphDatum label="Spectral radius" value={world.fit.spectralRadius.toFixed(4)} />
        <GraphDatum
          label="Stability"
          value={world.fit.spectralRadius < 0.98 ? "PASS" : "FAIL"}
          accent={world.fit.spectralRadius < 0.98}
        />
        <GraphDatum
          label="Supported edges"
          value={`${world.fit.uncertainty.edgeSupport.flat().filter((value) => value === 1).length}`}
        />
      </div>
    </section>
  );
}

function GraphDatum({
  label: name,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#090D10] px-3 py-2.5">
      <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#56636C]">{name}</div>
      <div
        className={`mt-1 font-mono text-sm tabular-nums ${accent ? "text-[#B8D179]" : "text-[#CBD3D8]"}`}
      >
        {value}
      </div>
    </div>
  );
}

function intensityAt(world: HawkesWorld, target: number, time: number): number {
  let intensity = world.fit.baseline[target];
  for (let source = 0; source < world.dimension; source += 1) {
    for (const event of world.eventTimes[source]) {
      if (event >= time) break;
      intensity +=
        world.fit.alpha[target][source] *
        Math.exp(-world.fit.beta[target][source] * (time - event));
    }
  }
  return intensity;
}

function IntensityTimeline({ world }: { world: HawkesWorld }) {
  const geometry = useMemo(() => {
    const width = 720;
    const height = 235;
    const left = 38;
    const right = 14;
    const top = 18;
    const bottom = 48;
    const samples = Array.from({ length: 160 }, (_, index) => (world.horizon * index) / 159);
    const values = world.channels.map((_, target) =>
      samples.map((time) => intensityAt(world, target, time)),
    );
    const maximum = Math.max(...values.flat(), ...world.fit.baseline, 0.1) * 1.08;
    const x = (time: number) => left + (time / world.horizon) * (width - left - right);
    const y = (value: number) => top + (1 - value / maximum) * (height - top - bottom);
    const paths = values.map((channel) =>
      channel
        .map(
          (value, index) =>
            `${index === 0 ? "M" : "L"}${x(samples[index]).toFixed(2)},${y(value).toFixed(2)}`,
        )
        .join(" "),
    );
    return { width, height, left, right, top, bottom, maximum, x, y, paths };
  }, [world]);
  const colors = ["#D2A84F", "#8FAE70"];
  return (
    <section aria-labelledby="intensity-title">
      <PanelHeader
        eyebrow="Exact event clock"
        title="Conditional intensity / baseline"
        meta={`${world.eventCounts.reduce((sum, value) => sum + value, 0)} timestamps · train/OOS boundary shown`}
        id="intensity-title"
      />
      <div className="overflow-x-auto bg-[#070A0D] px-2 py-2">
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          className="min-w-[42rem]"
          role="img"
          aria-label={`Event timestamps and fitted intensities for ${world.label}`}
        >
          {[0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={fraction}
              x1={geometry.left}
              x2={geometry.width - geometry.right}
              y1={geometry.y(geometry.maximum * fraction)}
              y2={geometry.y(geometry.maximum * fraction)}
              stroke="#1A242B"
              strokeWidth="1"
            />
          ))}
          <line
            x1={geometry.x(world.trainEnd)}
            x2={geometry.x(world.trainEnd)}
            y1={geometry.top}
            y2={geometry.height - geometry.bottom + 30}
            stroke="#6B5830"
            strokeDasharray="4 4"
          />
          <text
            x={geometry.x(world.trainEnd) + 5}
            y="14"
            fill="#8C7643"
            fontFamily="monospace"
            fontSize="8"
          >
            OOS
          </text>
          {world.fit.baseline.map((baseline, index) => (
            <line
              key={`baseline-${world.channels[index]}`}
              x1={geometry.left}
              x2={geometry.width - geometry.right}
              y1={geometry.y(baseline)}
              y2={geometry.y(baseline)}
              stroke={colors[index]}
              strokeWidth="1"
              strokeDasharray="3 5"
              opacity="0.55"
            />
          ))}
          {geometry.paths.map((path, index) => (
            <path
              key={world.channels[index]}
              d={path}
              fill="none"
              stroke={colors[index]}
              strokeWidth="1.6"
              opacity="0.95"
            />
          ))}
          {world.eventTimes.map((events, channel) =>
            events.map((event, index) => (
              <line
                key={`${channel}-${index}`}
                x1={geometry.x(event)}
                x2={geometry.x(event)}
                y1={geometry.height - geometry.bottom + channel * 13}
                y2={geometry.height - geometry.bottom + 9 + channel * 13}
                stroke={colors[channel]}
                strokeWidth="1"
                opacity="0.85"
              />
            )),
          )}
          {world.channels.map((channel, index) => (
            <text
              key={channel}
              x="13"
              y={geometry.height - geometry.bottom + 8 + index * 13}
              fill={colors[index]}
              fontFamily="monospace"
              fontSize="8"
            >
              {channel}
            </text>
          ))}
          <text x="8" y="11" fill="#59666F" fontFamily="monospace" fontSize="8">
            λ(t)
          </text>
          <text
            x={geometry.width - 55}
            y={geometry.height - 5}
            fill="#59666F"
            fontFamily="monospace"
            fontSize="8"
          >
            TIME →
          </text>
        </svg>
      </div>
    </section>
  );
}

function BranchingMatrix({ world }: { world: HawkesWorld }) {
  return (
    <section className="border-b border-[#25313A]" aria-labelledby="branching-matrix-title">
      <PanelHeader
        eyebrow="Gᵢⱼ = αᵢⱼ / βᵢⱼ"
        title="Branching matrix"
        meta={`ρ(G) ${world.fit.spectralRadius.toFixed(4)} · ${world.fit.spectralRadius < 0.98 ? "stationary" : "unstable"}`}
        id="branching-matrix-title"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead className="bg-[#080B0E] font-mono text-[8px] uppercase text-[#62707A]">
            <tr className="border-b border-[#1C272E]">
              <th className="px-3 py-2 font-medium" scope="col">
                From → to
              </th>
              <th className="px-3 py-2 text-right font-medium" scope="col">
                α
              </th>
              <th className="px-3 py-2 text-right font-medium" scope="col">
                β
              </th>
              <th className="px-3 py-2 text-right font-medium" scope="col">
                G
              </th>
              <th className="px-3 py-2 text-right font-medium" scope="col">
                95% interval
              </th>
              <th className="px-3 py-2 text-right font-medium" scope="col">
                Support
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#182128]">
            {world.fit.branchingMatrix.flatMap((row, target) =>
              row.map((contribution, source) => {
                const supported = world.fit.uncertainty.edgeSupport[target][source] === 1;
                return (
                  <tr
                    key={`${source}-${target}`}
                    className={supported ? "bg-[#11150C]" : undefined}
                  >
                    <th className="px-3 py-2 font-mono text-[9px] text-[#B9C2C8]" scope="row">
                      {world.channels[source]} → {world.channels[target]}
                    </th>
                    <td className="px-3 py-2 text-right font-mono text-[9px] tabular-nums text-[#8E9AA2]">
                      {world.fit.alpha[target][source].toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[9px] tabular-nums text-[#8E9AA2]">
                      {world.fit.beta[target][source].toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[10px] font-semibold tabular-nums text-[#D9E0E4]">
                      {contribution.toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[8px] tabular-nums text-[#73808A]">
                      [{world.fit.uncertainty.lower[target][source].toFixed(3)},{" "}
                      {world.fit.uncertainty.upper[target][source].toFixed(3)}]
                    </td>
                    <td className="px-3 py-2 text-right">
                      <StatusMark
                        status={supported ? "PASS" : "INFO"}
                        label={supported ? "SUPPORTED" : "UNRESOLVED"}
                      />
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResidualPanel({ world }: { world: HawkesWorld }) {
  const chart = useMemo(() => {
    const sorted = [...world.diagnostics.transformedIntervals].sort((left, right) => left - right);
    const width = 420;
    const height = 190;
    const left = 38;
    const right = 16;
    const top = 16;
    const bottom = 28;
    const maximum = Math.max(4, sorted.at(-1) ?? 4);
    const x = (value: number) =>
      left + (Math.min(value, maximum) / maximum) * (width - left - right);
    const y = (value: number) => top + (1 - value) * (height - top - bottom);
    const empirical = sorted
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"}${x(value).toFixed(2)},${y((index + 1) / sorted.length).toFixed(2)}`,
      )
      .join(" ");
    const reference = Array.from({ length: 80 }, (_, index) => {
      const value = (maximum * index) / 79;
      return `${index === 0 ? "M" : "L"}${x(value).toFixed(2)},${y(1 - Math.exp(-value)).toFixed(2)}`;
    }).join(" ");
    return { width, height, left, right, top, bottom, maximum, empirical, reference, x, y };
  }, [world]);
  const residuals = world.diagnostics.timeRescaling;
  return (
    <section aria-labelledby="residual-title">
      <PanelHeader
        eyebrow="Time-rescaling theorem"
        title="Residual calibration"
        meta={`${residuals.count} transformed intervals · Exp(1) reference`}
        id="residual-title"
      />
      <div className="bg-[#070A0D] px-2 py-2">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Empirical time-rescaling CDF for ${world.label}`}
        >
          {[0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={fraction}
              x1={chart.left}
              x2={chart.width - chart.right}
              y1={chart.y(fraction)}
              y2={chart.y(fraction)}
              stroke="#1A242B"
            />
          ))}
          <path
            d={chart.reference}
            fill="none"
            stroke="#58656E"
            strokeWidth="1.2"
            strokeDasharray="4 5"
          />
          <path d={chart.empirical} fill="none" stroke="#C9A04C" strokeWidth="1.8" />
          <text x="7" y="12" fill="#59666F" fontFamily="monospace" fontSize="8">
            CDF
          </text>
          <text
            x={chart.width - 64}
            y={chart.height - 5}
            fill="#59666F"
            fontFamily="monospace"
            fontSize="8"
          >
            Zₖ →
          </text>
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-[#1D282F] bg-[#1D282F]">
        <GraphDatum
          label="KS p-value"
          value={decimal(residuals.ksPvalue, 4)}
          accent={residuals.calibrated}
        />
        <GraphDatum label="Lag-1 residual ρ" value={decimal(residuals.lag1Autocorrelation, 4)} />
        <GraphDatum label="Residual mean" value={decimal(residuals.mean, 4)} />
        <GraphDatum
          label="Calibration"
          value={residuals.calibrated ? "PASS" : "FAIL"}
          accent={residuals.calibrated}
        />
      </div>
    </section>
  );
}

function FalsificationRegister({ world }: { world: HawkesWorld }) {
  return (
    <section className="bg-[#090D10]" aria-labelledby="falsification-title">
      <PanelHeader
        eyebrow="Fail-closed evidence"
        title="Falsification register"
        meta={`${world.diagnostics.falsificationRegister.filter((item) => item.status === "FAIL").length} failed gates`}
        id="falsification-title"
      />
      <ul className="max-h-[28rem] divide-y divide-[#182128] overflow-y-auto [content-visibility:auto]">
        {world.diagnostics.falsificationRegister.map((check) => (
          <li
            key={check.code}
            className={check.status === "FAIL" ? "bg-[#160E09] px-3 py-2.5" : "px-3 py-2.5"}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-[8px] uppercase tracking-[0.07em] text-[#B9C2C8]">
                {label(check.code)}
              </div>
              <StatusMark status={check.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[8px] text-[#65727B]">
              <span>value {decimal(check.value, 4)}</span>
              <span>threshold {check.threshold.toFixed(4)}</span>
              {check.baseline ? <span>baseline {label(check.baseline)}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModelEvidence({ world }: { world: HawkesWorld }) {
  const sorted = [...world.baselines].sort(
    (left, right) => right.oosLogLikelihood - left.oosLogLikelihood,
  );
  return (
    <section className="bg-[#090D10]" aria-labelledby="model-evidence-title">
      <PanelHeader
        eyebrow="Unseen-event tournament"
        title="Likelihood and identifiability"
        meta={`${world.diagnostics.testEvents} OOS events`}
        id="model-evidence-title"
      />
      <div className="grid gap-px bg-[#1D282F] sm:grid-cols-3">
        <GraphDatum label="Hawkes OOS LL" value={world.fit.oosLogLikelihood.toFixed(3)} />
        <GraphDatum label="Best baseline" value={label(world.diagnostics.bestBaseline)} />
        <GraphDatum
          label="OOS gain / event"
          value={world.diagnostics.oosGainPerEvent.toFixed(4)}
          accent={world.diagnostics.oosGainPerEvent >= 0.01}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-left">
          <thead className="bg-[#080B0E] font-mono text-[8px] uppercase text-[#62707A]">
            <tr className="border-b border-[#1C272E]">
              <th className="px-3 py-2 font-medium" scope="col">
                Model
              </th>
              <th className="px-3 py-2 text-right font-medium" scope="col">
                Train LL
              </th>
              <th className="px-3 py-2 text-right font-medium" scope="col">
                OOS LL
              </th>
              <th className="px-3 py-2 text-right font-medium" scope="col">
                Role
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#182128]">
            <tr className="bg-[#12140D]">
              <th className="px-3 py-2 text-[10px] font-medium text-[#D6BD77]" scope="row">
                Exponential Hawkes
              </th>
              <td className="px-3 py-2 text-right font-mono text-[9px] tabular-nums text-[#9AA6AE]">
                {world.fit.trainLogLikelihood.toFixed(3)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-[9px] tabular-nums text-[#D8E0E4]">
                {world.fit.oosLogLikelihood.toFixed(3)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-[8px] text-[#967B3B]">
                CHALLENGER
              </td>
            </tr>
            {sorted.map((baseline, index) => (
              <tr key={baseline.model}>
                <th className="px-3 py-2 text-[10px] font-medium text-[#ABB5BB]" scope="row">
                  {label(baseline.model)}
                </th>
                <td className="px-3 py-2 text-right font-mono text-[9px] tabular-nums text-[#87949C]">
                  {baseline.trainLogLikelihood.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[9px] tabular-nums text-[#AEB8BE]">
                  {baseline.oosLogLikelihood.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[8px] text-[#5F6C75]">
                  {index === 0 ? "BEST NULL" : "NULL"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-px border-t border-[#1D282F] bg-[#1D282F] sm:grid-cols-2">
        <EvidenceRow
          label="Identifiable"
          value={world.fit.identifiability.identifiable ? "YES" : "NO"}
        />
        <EvidenceRow
          label="Events / parameter"
          value={world.fit.identifiability.eventsPerParameter.toFixed(2)}
        />
        <EvidenceRow
          label="Optimizer"
          value={world.fit.optimizer.success ? "CONVERGED" : "FAILED"}
        />
        <EvidenceRow
          label="Bootstrap"
          value={`${world.fit.uncertainty.repetitions} attribution resamples`}
        />
      </dl>
    </section>
  );
}

function EvidenceRow({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#090D10] px-3 py-2.5">
      <dt className="font-mono text-[7px] uppercase tracking-[0.09em] text-[#56636C]">{name}</dt>
      <dd className="mt-1 text-[10px] text-[#B7C0C6]">{value}</dd>
    </div>
  );
}

function MetricVector({
  metrics,
  checks,
}: {
  metrics: HawkesMetric[];
  checks: Record<string, boolean>;
}) {
  return (
    <section aria-labelledby="metric-vector-title">
      <PanelHeader
        eyebrow="No scalar score"
        title="D0.4 capability vector"
        meta={`${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} program gates supported`}
        id="metric-vector-title"
      />
      <div className="grid gap-px bg-[#25313A] sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const limitation =
            metric.metric === "branching_ratio_ci_coverage" ||
            metric.metric === "direction_recovery_accuracy";
          return (
            <article
              key={metric.metric}
              className={limitation ? "bg-[#171109] px-3 py-3" : "bg-[#0A0E11] px-3 py-3"}
            >
              <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#65717A]">
                {METRIC_LABELS[metric.metric] ?? label(metric.metric)}
              </div>
              <div
                className={`mt-2 font-mono text-xl font-semibold tabular-nums ${limitation ? "text-[#D7AF5B]" : "text-[#DCE3E7]"}`}
              >
                {metricValue(metric)}
              </div>
              <div className="mt-1 font-mono text-[7px] text-[#59656E]">
                {metric.numerator.toFixed(metric.numerator % 1 === 0 ? 0 : 2)} /{" "}
                {metric.denominator}
                {metric.wilson95
                  ? ` · 95% ${percent(metric.wilson95[0], 0)}–${percent(metric.wilson95[1], 0)}`
                  : ""}
              </div>
              <p className="mt-2 text-[9px] leading-4 text-[#68747D]">{metric.definition}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ClaimBoundary({ artifact }: { artifact: HawkesCertification }) {
  return (
    <section className="bg-[#161108] px-4 py-4">
      <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#A18442]">
        Interpretation boundary
      </div>
      <h3 className="mt-2 text-sm font-semibold text-[#E2CA8D]">
        Conditional excitation is not economic causation.
      </h3>
      <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#A8915E]">
        A fitted edge states that one event stream changes another stream’s conditional intensity
        under this model. D0.4 contains synthetic timestamps only, tests no execution value, and
        authorizes no market claim.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusMark
          status="PASS"
          label={`CAUSAL ELIGIBLE ${artifact.causalClaimEligible ? "YES" : "NO"}`}
        />
        <StatusMark
          status="PASS"
          label={`MARKET ELIGIBLE ${artifact.marketClaimEligible ? "YES" : "NO"}`}
        />
      </div>
    </section>
  );
}

function EvidenceSeal({ artifact }: { artifact: HawkesCertification }) {
  return (
    <section className="bg-[#090D10] px-4 py-4">
      <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#6B7780]">
        Evidence seal
      </div>
      <dl className="mt-3 space-y-2 font-mono text-[8px]">
        <SealRow label="Artifact" value={artifact.artifactHash} />
        <SealRow label="File" value={artifact.fileSha256} />
        <SealRow
          label="World boundary"
          value={`${artifact.nonlinearBoundary.tag} / ${artifact.nonlinearBoundary.commit}`}
        />
        <SealRow label="Kernel" value="Exponential Hawkes / exact event-time likelihood" />
        <SealRow label="As-of" value="Frozen synthetic D0.4 evidence" />
      </dl>
    </section>
  );
}

function SealRow({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-3">
      <dt className="uppercase text-[#56636C]">{name}</dt>
      <dd className="break-all text-[#8D99A1]">{value}</dd>
    </div>
  );
}

function PanelHeader({
  eyebrow,
  title,
  meta,
  id,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  id: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2 border-b border-[#1D282F] px-3 py-3">
      <div>
        <div className="font-mono text-[7px] uppercase tracking-[0.13em] text-[#5F6C75]">
          {eyebrow}
        </div>
        <h3 id={id} className="mt-1 text-sm font-semibold tracking-[-0.01em] text-[#D7DEE2]">
          {title}
        </h3>
      </div>
      <div className="font-mono text-[7px] uppercase text-[#56636C]">{meta}</div>
    </header>
  );
}
