// Forge v2 successor of frontend-v2/src/forge/reality/RealityLadder.tsx.
// Kept separate because v1 is frozen phase evidence (scripts/research_archive.py SHARED_PATHS).
// U4 (wireframe §4.3): a 2D checkpoint chart of one metric against realism level, a table toggle
// over the same records, a provenance panel, and the largest degradation with its Δ computed from
// the checkpoint records (ladder-model.ts) and compared with the artifact's own record.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import type { RealityCheckpoint, RealityDetail, ResearchMetric } from "@/forge/contracts/observer";
import { realityQuery } from "@/forge/data/forge-queries";
import { AgentsShell } from "@/forge2/shared/AgentsShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge2/shared/SurfacePrimitives";
import { useForgeProv, type ForgeProv } from "@/forge2/shared/forge-prov";
import {
  REALITY_METRICS,
  checkpointMetric,
  formatDelta,
  ladderSteps,
  largestSharpeDegradation,
  type RealityMetric,
} from "./ladder-model";

type LadderSearch = { checkpoint?: string; metric: RealityMetric; view: RealityView };

export type { RealityMetric } from "./ladder-model";
export type RealityView = "chart" | "table";

const COMPUTED = "#52A8FF";
const COUNTERFACTUAL = "#A67CFF";

function pointColor(c: RealityCheckpoint) {
  return c.sharpe.provenance.epistemicType === "COUNTERFACTUAL" ? COUNTERFACTUAL : COMPUTED;
}

/** A signed change between two checkpoint values, with both source fields named. */
function deltaNum(R: ForgeProv, to: ResearchMetric, from: ResearchMetric, label: string) {
  const d = to.value - from.value;
  const s = formatDelta(d, to.precision);
  const signed = /^[−+]/.test(s);
  const body = signed ? s.slice(1) : s;
  const display =
    (signed ? s[0] : "") +
    (to.unit === "USD" ? "$" : "") +
    body +
    (to.unit === "SECONDS" ? "s" : "");
  return R.N(to.provenance.fieldPath, d, label, display, {
    ptr2: from.provenance.fieldPath,
    formula: `${to.provenance.fieldPath} − ${from.provenance.fieldPath}`,
  });
}

export function RealityLadder({
  artifactId,
  checkpointId,
  metric,
  view,
}: {
  artifactId: string;
  checkpointId?: string;
  metric: RealityMetric;
  view: RealityView;
}) {
  const query = useQuery(realityQuery(artifactId));
  const R = useForgeProv(`/forge/reality-ladders/${artifactId}`);
  if (query.isPending)
    return (
      <AgentsShell evidence="synthetic">
        <LoadingState label="Reality Ladder" />
      </AgentsShell>
    );
  if (query.error || !query.data) {
    return (
      <AgentsShell evidence="synthetic">
        <UnavailableState
          title="Reality Ladder could not be validated"
          error={query.error}
          retry={() => void query.refetch()}
        />
      </AgentsShell>
    );
  }
  const reality = query.data;
  const selected =
    reality.checkpoints.find((item) => item.id === checkpointId) ?? reality.checkpoints[0];
  const metricLabel = REALITY_METRICS.find((m) => m.key === metric)?.label ?? metric;
  const search = (patch: Partial<LadderSearch>): LadderSearch => ({
    checkpoint: selected?.id,
    metric,
    view,
    ...patch,
  });

  return (
    <AgentsShell evidence="synthetic">
      <SurfaceHeader
        eyebrow={
          <span data-num-exempt="id">{`Reality Ladder · ${reality.binding.artifactId} · aggregate`}</span>
        }
        title="Where alpha meets friction"
        description={R.T("/aggregate/finding", reality.finding, "Recorded finding")}
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusMark status="INFO" label={reality.binding.integrityStatus} />
            <span className="border border-[#594589] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#A67CFF]">
              Synthetic reference experiment
            </span>
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Reality metric" className="f2-tabs">
          {REALITY_METRICS.map((item) => (
            <Link
              key={item.key}
              to="/reality/$artifactId"
              params={{ artifactId }}
              search={search({ metric: item.key })}
              aria-current={metric === item.key ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Representation" className="f2-tabs">
          {(["chart", "table"] as const).map((item) => (
            <Link
              key={item}
              to="/reality/$artifactId"
              params={{ artifactId }}
              search={search({ view: item })}
              aria-current={view === item ? "page" : undefined}
              data-view={item}
            >
              {item === "chart" ? "2D chart" : "Table"}
            </Link>
          ))}
        </nav>
      </div>

      <div className="f2-ladder-grid mt-3">
        <InstrumentPanel
          title={view === "chart" ? `${metricLabel} by realism level` : "Checkpoint table"}
          code="SAME RECORDS"
        >
          {view === "chart" ? (
            <LadderChart
              reality={reality}
              metric={metric}
              metricLabel={metricLabel}
              selectedId={selected?.id}
              artifactId={artifactId}
              R={R}
              search={search}
            />
          ) : (
            <LadderTable
              reality={reality}
              metric={metric}
              metricLabel={metricLabel}
              selectedId={selected?.id}
              R={R}
            />
          )}
        </InstrumentPanel>

        <div className="grid content-start gap-3">
          {selected && (
            <InstrumentPanel title={selected.label} code={selected.engine}>
              <div className="grid gap-px bg-[#1D232B] grid-cols-2">
                {REALITY_METRICS.map((m) => {
                  const value = checkpointMetric(selected, m.key);
                  return (
                    <ResearchValue
                      key={value.id}
                      metric={value}
                      value={R.M(value)}
                      className="bg-[#0B0E11] p-3"
                    />
                  );
                })}
              </div>
            </InstrumentPanel>
          )}
          <ProvenancePanel reality={reality} R={R} />
        </div>
      </div>

      <Degradation reality={reality} R={R} />
    </AgentsShell>
  );
}

function LadderChart({
  reality,
  metric,
  metricLabel,
  selectedId,
  artifactId,
  R,
  search,
}: {
  reality: RealityDetail;
  metric: RealityMetric;
  metricLabel: string;
  selectedId?: string;
  artifactId: string;
  R: ForgeProv;
  search: (patch: Partial<LadderSearch>) => LadderSearch;
}) {
  const W = 640;
  const H = 280;
  const pad = { l: 44, r: 44, t: 40, b: 28 };
  const cps = reality.checkpoints;
  const values = cps.map((c) => checkpointMetric(c, metric).value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    pad.l + (cps.length < 2 ? 0 : (i / (cps.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const pts = cps.map((c, i) => [x(i), y(values[i])] as const);
  return (
    <figure>
      <div className="f2-chart" data-testid="ladder-chart">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${metricLabel} at each of the ${cps.length} checkpoints, in artifact order. The checkpoint table holds the same records.`}
        >
          {[min, max].map((v, i) => (
            <line
              key={i}
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              stroke="#1D232B"
              strokeDasharray="3 4"
            />
          ))}
          <polyline
            points={pts.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="#4c5762"
            strokeWidth="1.5"
          />
          {cps.map((c, i) => (
            <g key={c.id}>
              {c.id === selectedId ? (
                <circle
                  cx={pts[i][0]}
                  cy={pts[i][1]}
                  r="11"
                  fill="none"
                  stroke="#FFB000"
                  strokeWidth="2"
                />
              ) : null}
              <circle cx={pts[i][0]} cy={pts[i][1]} r="6" fill={pointColor(c)} />
            </g>
          ))}
        </svg>
        {cps.map((c, i) => {
          const m = checkpointMetric(c, metric);
          return (
            <span
              key={c.id}
              className="f2-chart-label"
              data-below={i % 2 === 1 && values[i] === values[i - 1] ? "true" : undefined}
              style={{ left: `${(pts[i][0] / W) * 100}%`, top: `${(pts[i][1] / H) * 100}%` }}
            >
              {R.M(m)}
            </span>
          );
        })}
        {cps.map((c, i) => (
          <Link
            key={c.id}
            to="/reality/$artifactId"
            params={{ artifactId }}
            search={search({ checkpoint: c.id })}
            className="f2-chart-point"
            aria-label={`Select checkpoint ${c.label} (${c.realityLevel})`}
            aria-current={c.id === selectedId ? "step" : undefined}
            style={{ left: `${(pts[i][0] / W) * 100}%`, top: `${(pts[i][1] / H) * 100}%` }}
          />
        ))}
      </div>
      <div className="f2-chart-axis" aria-hidden="true">
        {cps.map((c, i) => (
          <span
            key={c.id}
            title={c.realityLevel}
            data-row={i % 2}
            data-edge={i === 0 ? "first" : i === cps.length - 1 ? "last" : undefined}
            style={i === 0 || i === cps.length - 1 ? {} : { left: `${(pts[i][0] / W) * 100}%` }}
          >
            {c.label}
          </span>
        ))}
      </div>
      <figcaption className="f2-legend">
        <span>x · checkpoint, in artifact order (increasing realism) →</span>
        <span>
          y · {metricLabel}; dashed lines at the highest (
          {R.M(checkpointMetric(cps[values.indexOf(max)], metric))}) and lowest (
          {R.M(checkpointMetric(cps[values.indexOf(min)], metric))}) recorded values
        </span>
        <span>
          <span className="f2-swatch" style={{ background: COMPUTED }} aria-hidden="true" />
          computed
        </span>
        <span>
          <span className="f2-swatch" style={{ background: COUNTERFACTUAL }} aria-hidden="true" />
          counterfactual
        </span>
        <span>amber ring · selected checkpoint</span>
      </figcaption>
    </figure>
  );
}

function LadderTable({
  reality,
  metric,
  metricLabel,
  selectedId,
  R,
}: {
  reality: RealityDetail;
  metric: RealityMetric;
  metricLabel: string;
  selectedId?: string;
  R: ForgeProv;
}) {
  const steps = ladderSteps(reality.checkpoints, metric);
  return (
    <div className="overflow-x-auto">
      <table className="f2-ladder-table" data-testid="ladder-table">
        <caption className="sr-only">All Reality Ladder checkpoint records</caption>
        <thead>
          <tr>
            <th scope="col">Checkpoint</th>
            <th scope="col">Engine</th>
            {REALITY_METRICS.map((m) => (
              <th key={m.key} scope="col">
                {m.label}
              </th>
            ))}
            <th scope="col">Δ {metricLabel}</th>
          </tr>
        </thead>
        <tbody>
          {reality.checkpoints.map((c, i) => {
            const step = i > 0 ? steps[i - 1] : null;
            return (
              <tr key={c.id} aria-selected={c.id === selectedId} data-checkpoint={c.id}>
                <th scope="row">
                  {c.label}
                  <div className="agents-faint text-[12px]" data-num-exempt="id">
                    {c.id}
                  </div>
                </th>
                <td>{c.engine}</td>
                {REALITY_METRICS.map((m) => (
                  <td key={m.key}>{R.M(checkpointMetric(c, m.key))}</td>
                ))}
                <td data-delta-for={c.id}>
                  {step
                    ? deltaNum(
                        R,
                        checkpointMetric(step.to, metric),
                        checkpointMetric(step.from, metric),
                        `Δ ${metricLabel}`,
                      )
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProvenancePanel({ reality, R }: { reality: RealityDetail; R: ForgeProv }) {
  return (
    <InstrumentPanel title="Provenance" code="ARTIFACT-BOUND">
      <dl className="f2-kv">
        <dt>artifact</dt>
        <dd data-num-exempt="id">{reality.binding.artifactId}</dd>
        <dt>schema</dt>
        <dd data-num-exempt="id">{reality.binding.sourceSchemaVersion}</dd>
        <dt>integrity</dt>
        <dd>{reality.binding.integrityStatus}</dd>
        <dt>primary metric</dt>
        <dd>{reality.primaryMetric}</dd>
        <dt>alpha survival</dt>
        <dd>{R.M(reality.alphaSurvival)}</dd>
      </dl>
      <div className="grid gap-2 border-t border-[#1D232B] p-3">
        <HashValue label="artifact" value={reality.binding.artifactHash} />
        {reality.certificationArtifactHash ? (
          <HashValue label="certification" value={reality.certificationArtifactHash} />
        ) : (
          <span className="text-[12px] text-[#8b949e]">
            certification artifact · unavailable (not bound)
          </span>
        )}
      </div>
    </InstrumentPanel>
  );
}

function Degradation({ reality, R }: { reality: RealityDetail; R: ForgeProv }) {
  const worst = largestSharpeDegradation(reality.checkpoints);
  const recorded = reality.largestDegradation.change;
  if (!worst)
    return (
      <section className="agents-card mt-3" data-testid="largest-degradation">
        <div className="f2-degradation">No checkpoint step lowers Sharpe in these records.</div>
      </section>
    );
  const agrees = Math.abs(worst.delta - recorded.value) < 1e-9;
  return (
    <section
      className="agents-card mt-3"
      data-testid="largest-degradation"
      data-from={worst.from.id}
      data-to={worst.to.id}
    >
      <div className="f2-degradation">
        <span className="font-mono text-[12px] uppercase text-[#8b949e]">Largest degradation</span>
        <span>
          {worst.from.label} → {worst.to.label}
        </span>
        <span>
          Δ Sharpe{" "}
          <output data-testid="largest-delta">
            {deltaNum(R, worst.to.sharpe, worst.from.sharpe, "Largest Sharpe degradation")}
          </output>
        </span>
        <span className="text-[12px] text-[#8b949e]">
          computed from the checkpoint records; the artifact records{" "}
          {reality.largestDegradation.label} at {R.M(recorded)}
        </span>
        <StatusMark
          status={agrees ? "PASS" : "FAIL"}
          label={agrees ? "MATCHES THE ARTIFACT" : "DOES NOT MATCH THE ARTIFACT"}
        />
      </div>
    </section>
  );
}
