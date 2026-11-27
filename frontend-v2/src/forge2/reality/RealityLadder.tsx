// Forge v2 successor of frontend-v2/src/forge/reality/RealityLadder.tsx.
// Kept separate because v1 is frozen phase evidence (scripts/research_archive.py SHARED_PATHS).
// U4 (wireframe §4.3): a 2D checkpoint chart of one metric against realism level, a table toggle
// over the same records, a provenance panel, and the largest degradation with its Δ computed from
// the checkpoint records (ladder-model.ts) and compared with the artifact's own record.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue } from "@/epistemic/EpistemicValue";
import type { RealityCheckpoint, RealityDetail, ResearchMetric } from "@/forge/contracts/observer";
import { realityQuery } from "@/forge/data/forge-queries";
import { AgentsShell } from "@/forge2/shared/AgentsShell";
import { ClassChips, MetricCell } from "@/forge2/shared/MetricCell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge2/shared/SurfacePrimitives";
import { useForgeProv, type ForgeProv } from "@/forge2/shared/forge-prov";
import { useMediaQuery } from "@/forge2/shared/motion";
import {
  REALITY_METRICS,
  checkpointMetric,
  degradationAgrees,
  equalRuns,
  formatDelta,
  ladderSteps,
  largestSharpeDegradation,
  niceTicks,
  shortCodes,
  type LadderStep,
  type RealityMetric,
} from "./ladder-model";

export type { RealityMetric } from "./ladder-model";
export type RealityView = "chart" | "table";

type LadderSearch = { checkpoint?: string; metric: RealityMetric; view: RealityView };

const COMPUTED = "#52A8FF";
const COUNTERFACTUAL = "#A67CFF";
const LINE = "#4c5762";
const WORST = "#E6E8EB";

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
  const narrow = useMediaQuery("(max-width: 600px)", false);
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
  const chosen = reality.checkpoints.find((item) => item.id === checkpointId);
  const selected = chosen ?? reality.checkpoints[0];
  const codes = shortCodes(reality.checkpoints);
  const metricLabel = REALITY_METRICS.find((m) => m.key === metric)?.label ?? metric;
  const search = (patch: Partial<LadderSearch>): LadderSearch => ({
    checkpoint: chosen?.id,
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

      {/* Key state first (review S2): the degradation sits directly under the title. */}
      <Degradation reality={reality} R={R} />

      {checkpointId !== undefined && !chosen ? (
        <p className="f2-notice mt-3" role="status" data-testid="checkpoint-notice">
          Checkpoint <span data-num-exempt="input">{checkpointId}</span> is not in this artifact; no
          checkpoint is selected, and the detail shows the first, {selected.label} (
          <span data-num-exempt="id">{selected.id}</span>).
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
              codes={codes}
              selectedId={chosen?.id}
              artifactId={artifactId}
              narrow={narrow}
              R={R}
              search={search}
            />
          ) : (
            <LadderTable
              reality={reality}
              metric={metric}
              metricLabel={metricLabel}
              selectedId={chosen?.id}
              R={R}
            />
          )}
        </InstrumentPanel>

        <div className="grid content-start gap-3">
          <InstrumentPanel
            title={chosen ? selected.label : `${selected.label} · first checkpoint`}
            code={
              <ClassChips metrics={REALITY_METRICS.map((m) => checkpointMetric(selected, m.key))} />
            }
          >
            <div className="f2-subhead">
              <span data-num-exempt="id">{selected.id}</span>
              <span>{selected.engine}</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[#1D232B]">
              {REALITY_METRICS.map((m) => {
                const value = checkpointMetric(selected, m.key);
                return <MetricCell key={value.id} metric={value} value={R.M(value)} />;
              })}
            </div>
          </InstrumentPanel>
          <ProvenancePanel reality={reality} R={R} />
        </div>
      </div>
    </AgentsShell>
  );
}

function LadderChart({
  reality,
  metric,
  metricLabel,
  codes,
  selectedId,
  artifactId,
  narrow,
  R,
  search,
}: {
  reality: RealityDetail;
  metric: RealityMetric;
  metricLabel: string;
  codes: string[];
  selectedId?: string;
  artifactId: string;
  narrow: boolean;
  R: ForgeProv;
  search: (patch: Partial<LadderSearch>) => LadderSearch;
}) {
  const W = 640;
  // About 220px tall at 390px wide (review S1), the same proportions as before on wider screens.
  const H = narrow ? 420 : 280;
  const pad = { l: 44, r: 44, t: 40, b: 20 };
  const cps = reality.checkpoints;
  const values = cps.map((c) => checkpointMetric(c, metric).value);
  const { ticks, decimals } = niceTicks(values);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const span = hi - lo || 1;
  const x = (i: number) =>
    pad.l + (cps.length < 2 ? 0 : (i / (cps.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b);
  const pts = cps.map((c, i) => [x(i), y(values[i])] as const);
  const worst = metric === "sharpe" ? largestSharpeDegradation(cps) : null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <figure>
      <div className="f2-chart" data-testid="ladder-chart">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${metricLabel} at each of the ${cps.length} checkpoints, in artifact order. The checkpoint table holds the same records.`}
        >
          {ticks.map((t) => (
            <line
              key={t}
              x1={pad.l}
              x2={W - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="#1D232B"
              strokeDasharray={t === 0 ? undefined : "3 4"}
            />
          ))}
          <polyline
            points={pts.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={LINE}
            strokeWidth="1.5"
          />
          {worst ? (
            <line
              data-testid="worst-segment"
              x1={pts[worst.fromIndex][0]}
              y1={pts[worst.fromIndex][1]}
              x2={pts[worst.toIndex][0]}
              y2={pts[worst.toIndex][1]}
              stroke={WORST}
              strokeWidth="4"
            />
          ) : null}
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
        {ticks.map((t) => (
          <span
            key={t}
            className="f2-chart-tick"
            style={{ top: pct(y(t), H) }}
            data-num-exempt="axis"
          >
            {t.toFixed(decimals)}
          </span>
        ))}
        {/* A run of equal recorded values is labelled once ("L0–L2 = 4.7991"), at its centre. */}
        {equalRuns(values).map(([a, b]) => {
          const m = checkpointMetric(cps[a], metric);
          return (
            <span
              key={a}
              className="f2-chart-label"
              data-run={`${cps[a].id}..${cps[b].id}`}
              style={{
                left: pct((pts[a][0] + pts[b][0]) / 2, W),
                top: pct(pts[a][1], H),
              }}
            >
              {a === b ? null : `${codes[a]}–${codes[b]} = `}
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
            style={{ left: pct(pts[i][0], W), top: pct(pts[i][1], H) }}
          />
        ))}
      </div>
      <div className="f2-chart-axis" aria-hidden="true">
        {cps.map((c, i) => (
          <span
            key={c.id}
            title={c.label}
            data-edge={i === 0 ? "first" : i === cps.length - 1 ? "last" : undefined}
            style={i === 0 || i === cps.length - 1 ? {} : { left: pct(pts[i][0], W) }}
          >
            {codes[i]}
          </span>
        ))}
      </div>
      <figcaption className="f2-legend" data-testid="ladder-legend">
        <span>x · checkpoint in artifact order (increasing realism):</span>
        {cps.map((c, i) => (
          <span key={c.id}>
            {codes[i]} {c.label}
          </span>
        ))}
        <span>y · {metricLabel}, axis marks from zero</span>
        <span>
          <span className="f2-swatch" style={{ background: LINE }} aria-hidden="true" />
          grey line · checkpoint order
        </span>
        <span>
          <span className="f2-swatch" style={{ background: COMPUTED }} aria-hidden="true" />
          computed
        </span>
        <span>
          <span className="f2-swatch" style={{ background: COUNTERFACTUAL }} aria-hidden="true" />
          counterfactual
        </span>
        {worst ? (
          <span>
            <span className="f2-swatch" style={{ background: WORST }} aria-hidden="true" />
            thick segment · largest Sharpe degradation
          </span>
        ) : null}
        <span>amber ring · selected checkpoint{selectedId ? "" : " (none selected)"}</span>
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

/**
 * The largest Sharpe degradation computed from the records, beside the artifact's own record. They
 * match only when the recorded component names the same checkpoint pair and the Δ is equal.
 */
function Degradation({ reality, R }: { reality: RealityDetail; R: ForgeProv }) {
  const worst: LadderStep | null = largestSharpeDegradation(reality.checkpoints);
  const rec = reality.largestDegradation;
  const agrees = degradationAgrees(worst, {
    component: rec.component,
    change: rec.change.value,
  });
  return (
    <section
      className="agents-card mt-3"
      data-testid="largest-degradation"
      data-from={worst?.from.id}
      data-to={worst?.to.id}
      data-match={agrees ? "true" : "false"}
    >
      <div className="f2-degradation">
        <span className="font-mono text-[12px] uppercase text-[#8b949e]">Largest degradation</span>
        {worst ? (
          <>
            <span>
              {worst.from.label} → {worst.to.label}
            </span>
            <span>
              Δ Sharpe{" "}
              <output data-testid="largest-delta">
                {deltaNum(R, worst.to.sharpe, worst.from.sharpe, "Largest Sharpe degradation")}
              </output>
            </span>
          </>
        ) : (
          <span>No checkpoint step lowers Sharpe in these records.</span>
        )}
        <span className="text-[12px] text-[#8b949e]">
          {worst ? "computed from the checkpoint records; " : ""}the artifact records {rec.label} (
          <span data-num-exempt="id">{rec.component}</span>) at {R.M(rec.change)}
        </span>
        <StatusMark
          status={agrees ? "PASS" : "FAIL"}
          label={agrees ? "MATCHES THE ARTIFACT" : "DOES NOT MATCH THE ARTIFACT"}
        />
      </div>
    </section>
  );
}
