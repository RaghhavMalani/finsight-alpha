import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import type {
  BaselineDetail,
  RealityDetail,
  ResearchMetric,
  RunSummary,
} from "@/forge/contracts/observer";
import { DEFAULT_BASELINE_ID, DEFAULT_REALITY_ID } from "@/forge/contracts/observer";
import { baselineQuery, realityQuery, runQuery, runsQuery } from "@/forge/data/forge-queries";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";
import { assertRunPreview, buildAgentOverview, recordedOutcome } from "./overview-model";

export function CommandCenter({
  selectedRunId,
  selectedNodeSequence,
}: {
  selectedRunId?: string;
  selectedNodeSequence: number;
}) {
  const baseline = useQuery(baselineQuery(DEFAULT_BASELINE_ID));
  const runs = useQuery(runsQuery());
  const reality = useQuery(realityQuery(DEFAULT_REALITY_ID));
  const navigate = useNavigate();
  const close = () => void navigate({ to: "/forge", search: { run: undefined, node: 1 } });
  if (baseline.isPending || runs.isPending || reality.isPending)
    return <LoadingState label="Agents overview" />;
  const failure = baseline.error ?? runs.error ?? reality.error;
  if (failure || !baseline.data || !runs.data || !reality.data) {
    return (
      <UnavailableState
        title="Agents projections could not be validated"
        error={failure}
        retry={() => {
          void baseline.refetch();
          void runs.refetch();
          void reality.refetch();
        }}
      />
    );
  }
  let overview: ReturnType<typeof buildAgentOverview>;
  try {
    overview = buildAgentOverview(baseline.data, runs.data);
  } catch (error) {
    return <UnavailableState title="Agents evidence is inconsistent" error={error} />;
  }
  const selected = runs.data.items.find((r) => r.runId === selectedRunId);
  const groups = new Map<string, RunSummary[]>();
  for (const run of overview.failures) {
    const checks = Object.entries(run.verificationChecks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name)
      .sort();
    const key = JSON.stringify([run.taskId, checks]);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return (
    <>
      <SurfaceHeader
        eyebrow="Agents · recorded baseline"
        title="Forge v0.2.5 baseline"
        description={
          runs.data.matched +
          " research episodes across " +
          overview.models.length +
          " models. Deterministic verifier grades are recorded alongside every action."
        }
        meta={<Binding baseline={baseline.data} />}
      />
      <section className="agents-card agents-kpis" aria-label="Headline numbers">
        <Kpi
          label="Verified research success"
          value={
            <>
              {overview.verified}
              <small> / {runs.data.matched}</small>
            </>
          }
          note={
            formatMetric(baseline.data.overall.verifiedResearch) + " passed every recorded check"
          }
        />
        <Kpi
          label="Correct verdict"
          value={
            <>
              {overview.correctVerdicts}
              <small> / {runs.data.matched}</small>
            </>
          }
          note="Matches the recorded verifier expectation"
        />
        <Kpi
          label="False alpha accepted"
          value={overview.falseAlpha}
          note="Recorded decisions on synthetic research tasks"
        />
        <Kpi
          label="Inference cost"
          value={"$" + baseline.data.admittedCost.value.toFixed(2)}
          note={
            "Token estimate, not an invoice · " +
            baseline.data.attempts.value +
            " attempts, " +
            baseline.data.excludedAttempts.value +
            " excluded"
          }
        />
      </section>
      <div className="agents-grid">
        <InstrumentPanel
          title="Outcomes by task type"
          code="One square per seed · open the recorded run"
        >
          <div
            className="agents-card-body agents-scroll"
            role="region"
            aria-label="Task outcome matrix"
            tabIndex={0}
          >
            <table className="agents-table agents-matrix">
              <thead>
                <tr>
                  <th scope="col">Task type</th>
                  {overview.models.map((m) => (
                    <th scope="col" key={m.id}>
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.tasks.map((task) => {
                  const taskRuns = runs.data.items.filter((r) => r.taskClass === task);
                  const expectations = [...new Set(taskRuns.map((r) => r.expectedVerdict))];
                  return (
                    <tr key={task}>
                      <th scope="row" className="agents-task">
                        {words(task)}
                        <small>
                          {expectations.length === 1
                            ? "Expected " + expectations[0].toLowerCase()
                            : "Recorded expectations vary"}
                        </small>
                      </th>
                      {overview.models.map((model) => (
                        <td key={model.id}>
                          <div className="agents-seeds">
                            {taskRuns
                              .filter((r) => r.model === model.id)
                              .sort((a, b) => a.seed - b.seed)
                              .map((run) => (
                                <Link
                                  key={run.runId}
                                  to="/forge"
                                  search={{ run: run.runId, node: 1 }}
                                  className="agents-seed"
                                  data-outcome={recordedOutcome(run)}
                                  data-run-id={run.runId}
                                  aria-label={
                                    model.label +
                                    " seed " +
                                    run.seed +
                                    " " +
                                    run.decision?.verdict +
                                    " " +
                                    recordedOutcome(run)
                                  }
                                  title={
                                    run.taskId +
                                    " · seed " +
                                    run.seed +
                                    " · " +
                                    run.decision?.verdict +
                                    " · " +
                                    recordedOutcome(run)
                                  }
                                >
                                  {run.decision?.verdict === "ABSTAIN"
                                    ? "Ø"
                                    : (run.decision?.verdict.slice(0, 1) ?? "?")}
                                </Link>
                              ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="agents-card-foot">
            <div className="agents-legend">
              <StatusMark status="PASS" label="Verified" />
              <StatusMark status="ABSTAIN" label="Right verdict, failed a check" />
              <StatusMark status="FAIL" label="Wrong verdict" />
            </div>
            <span>A = accept · R = reject · Ø = abstain</span>
          </div>
        </InstrumentPanel>
        <InstrumentPanel
          title="What went wrong"
          code={overview.failures.length + " of " + runs.data.matched + " runs"}
        >
          <div className="agents-card-body">
            {[...groups.values()]
              .sort((a, b) => b.length - a.length)
              .map((group) => {
                const first = group[0];
                const failed = Object.entries(first.verificationChecks)
                  .filter(([, passed]) => !passed)
                  .map(([name]) => words(name).toLowerCase());
                return (
                  <article className="agents-issue" key={first.runId}>
                    <header>
                      <h3>
                        {first.verificationChecks.verdict
                          ? "Right verdict, failed a check"
                          : "Verdict mismatch"}
                      </h3>
                      <span className="agents-mono">{group.length}</span>
                    </header>
                    <p>
                      {words(first.taskClass)}. Failed: {failed.join(", ")}. These grades remain
                      unverified.
                    </p>
                    <Link
                      className="agents-link"
                      to="/runs"
                      search={{
                        task: first.taskId,
                        verified: "failed",
                        model: undefined,
                        verdict: undefined,
                        taskClass: undefined,
                        seed: undefined,
                      }}
                    >
                      Show recorded runs →
                    </Link>
                  </article>
                );
              })}
            {overview.failures.length === 0 && (
              <p className="agents-muted">Every admitted run passed its recorded checks.</p>
            )}
          </div>
        </InstrumentPanel>
      </div>
      <InstrumentPanel title="Models" code="Same tasks and seeds · alphabetical, not ranked">
        <div
          className="agents-card-body agents-scroll"
          role="region"
          aria-label="Model observations"
          tabIndex={0}
        >
          <table className="agents-table">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col" className="agents-num">
                  Verified
                </th>
                <th scope="col" className="agents-num">
                  Correct verdict
                </th>
                <th scope="col" className="agents-num">
                  False alpha
                </th>
                <th scope="col" className="agents-num">
                  Cost / verified
                </th>
                <th scope="col" className="agents-num">
                  Mean time
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.models.map((model) => {
                const modelRuns = runs.data.items.filter((r) => r.model === model.id);
                return (
                  <tr key={model.id}>
                    <th scope="row">{model.id}</th>
                    <td className="agents-num" title={model.verifiedResearch.provenance.fieldPath}>
                      {formatMetric(model.verifiedResearch)}
                    </td>
                    <td className="agents-num">
                      {modelRuns.filter((r) => r.verificationChecks.verdict).length} /{" "}
                      {modelRuns.length}
                    </td>
                    <td className="agents-num">
                      {modelRuns.filter((r) => r.falseAlphaAcceptance).length}
                    </td>
                    <td
                      className="agents-num"
                      title={model.costPerVerifiedFinding.provenance.fieldPath}
                    >
                      {formatMetric(model.costPerVerifiedFinding)}
                    </td>
                    <td className="agents-num" title={model.latency.provenance.fieldPath}>
                      {formatMetric(model.latency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="agents-card-foot">
          <span>
            Recorded {new Date(baseline.data.createdAt).toISOString().slice(0, 10)} · model costs
            are token estimates.
          </span>
          <Link
            className="agents-link"
            to="/bench/$benchmarkId"
            params={{ benchmarkId: baseline.data.binding.artifactId }}
            search={{ model: undefined }}
          >
            Inspect baseline and provenance →
          </Link>
        </div>
      </InstrumentPanel>
      <RealityOverview reality={reality.data} />
      <p className="agents-muted text-xs">
        Read-only artifacts. Real API execution on synthetic tasks does not establish market alpha.{" "}
        <Link className="agents-link" to="/artifacts">
          Inspect source bindings →
        </Link>
      </p>
      {selectedRunId && (
        <RunPreview
          key={selectedRunId}
          runId={selectedRunId}
          summary={selected}
          node={selectedNodeSequence}
          close={close}
        />
      )}
    </>
  );
}

function Binding({ baseline }: { baseline: BaselineDetail }) {
  return (
    <details className="agents-prov">
      <summary>
        <StatusMark status="PASS" label="Manifest match" /> · v0.2.5{" "}
        <span className="agents-mono">{baseline.binding.artifactHash.slice(0, 8)}…</span>
      </summary>
      <p className="agents-mono">{baseline.binding.artifactHash}</p>
      <p>{baseline.binding.sourceSchemaVersion}</p>
    </details>
  );
}
function Kpi({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div className="agents-kpi">
      <div>{label}</div>
      <output>{value}</output>
      <p>{note}</p>
    </div>
  );
}
function words(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}
function formatMetric(metric: ResearchMetric) {
  const n = metric.value.toLocaleString("en-US", {
    minimumFractionDigits: metric.precision,
    maximumFractionDigits: metric.precision,
  });
  return metric.unit === "PERCENT"
    ? n + "%"
    : metric.unit === "USD"
      ? "$" + n
      : metric.unit === "SECONDS"
        ? n + "s"
        : n;
}

function RealityOverview({ reality }: { reality: RealityDetail }) {
  const points = reality.checkpoints;
  const values = points.map((p) => p.sharpe.value);
  const min = Math.min(0, ...values),
    max = Math.max(...values),
    span = max - min || 1;
  const x = (i: number) => 48 + (i / Math.max(1, points.length - 1)) * 880;
  const y = (v: number) => 24 + (1 - (v - min) / span) * 150;
  const path = points.map((p, i) => (i ? "L" : "M") + x(i) + "," + y(p.sharpe.value)).join(" ");
  return (
    <div className="agents-grid">
      <InstrumentPanel
        title="Reality ladder · synthetic reference"
        code="Counterfactual results · not market evidence"
      >
        <div className="agents-card-body">
          <svg
            className="agents-ladder"
            viewBox="0 0 960 230"
            role="img"
            aria-label="Recorded synthetic reference Sharpe across increasing realism"
          >
            <line x1="48" x2="928" y1={y(0)} y2={y(0)} stroke="#262B31" />
            <path d={path} fill="none" stroke="#F0A929" strokeWidth="2.5" strokeLinejoin="round" />
            {points.map((p, i) => (
              <g key={p.id}>
                <circle
                  cx={x(i)}
                  cy={y(p.sharpe.value)}
                  r="4.5"
                  fill="#0B0D10"
                  stroke={p.sharpe.value < 0 ? "#F06464" : "#F0A929"}
                  strokeWidth="2"
                />
                <text
                  x={x(i)}
                  y={y(p.sharpe.value) - 12}
                  textAnchor="middle"
                  fill="#E7EAEC"
                  fontFamily="JetBrains Mono, monospace"
                  fontSize="13"
                >
                  {p.sharpe.value.toFixed(2)}
                </text>
                <text
                  x={x(i)}
                  y="200"
                  textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                  fill="#A3ABB2"
                  fontFamily="Inter, sans-serif"
                  fontSize="12"
                >
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
          <dl className="agents-ladder-key">
            {points.map((p) => (
              <div key={p.id}>
                <dt>{p.label}</dt>
                <dd className="agents-mono">{p.sharpe.value.toFixed(2)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="agents-ladder-values">
          <div>
            <span className="agents-muted">Edge that survives</span>
            <output className="agents-mono">{formatMetric(reality.alphaSurvival)}</output>
          </div>
          <div>
            <span className="agents-muted">Biggest loss</span>
            <output className="agents-mono">
              {formatMetric(reality.largestDegradation.change)}
            </output>
            <span className="agents-faint">{reality.largestDegradation.label}</span>
          </div>
          <div>
            <span className="agents-muted">Source artifact</span>
            <output className="agents-mono">{reality.binding.artifactHash.slice(0, 12)}…</output>
            <Link
              className="agents-link"
              to="/reality/$artifactId"
              params={{ artifactId: reality.binding.artifactId }}
              search={{ metric: "sharpe", checkpoint: undefined }}
            >
              Inspect recorded checkpoints →
            </Link>
          </div>
        </div>
        <div className="agents-card-foot">{reality.finding}</div>
      </InstrumentPanel>
      <InstrumentPanel title="By synthetic regime" code="Frozen reference experiment">
        <div className="agents-card-body">
          <table className="agents-table agents-regimes-table">
            <thead>
              <tr>
                <th scope="col">Regime</th>
                <th scope="col" className="agents-num">
                  Start
                </th>
                <th scope="col" className="agents-num">
                  Stressed
                </th>
                <th scope="col" className="agents-num">
                  Survives
                </th>
              </tr>
            </thead>
            <tbody>
              {reality.regimeMatrix.map((row) => (
                <tr key={row.regime}>
                  <th scope="row">{words(row.regime.toLowerCase())}</th>
                  <td className="agents-num">{row.start.toFixed(2)}</td>
                  <td className="agents-num">{row.stressed.toFixed(2)}</td>
                  <td className="agents-num">{row.survival.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agents-muted mt-4">
            Seed counts:{" "}
            {reality.regimeMatrix
              .map((row) => words(row.regime.toLowerCase()) + " " + row.seeds)
              .join(" · ")}
            . These reference results do not certify tradable market alpha.
          </p>
          <p className="agents-faint agents-mono mt-4 break-all">
            Source: /aggregate/regime_matrix · {reality.binding.artifactHash}
          </p>
        </div>
      </InstrumentPanel>
    </div>
  );
}

function RunPreview({
  runId,
  summary,
  node,
  close,
}: {
  runId: string;
  summary: RunSummary | undefined;
  node: number;
  close: () => void;
}) {
  const query = useQuery(runQuery(runId));
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  let error: unknown = query.error;
  if (query.data && summary) {
    try {
      assertRunPreview(summary, query.data);
    } catch (e) {
      error = e;
    }
  }
  if (!summary) error = new Error("This run is not in the admitted baseline.");
  const run = error ? undefined : query.data;
  return (
    <dialog
      ref={dialog}
      className="agents-drawer"
      aria-label="Recorded run detail"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="agents-drawer-head">
        <div>
          <h2>
            {summary
              ? words(summary.taskClass) + " · " + summary.model.replace("gpt-5.6-", "")
              : "Run unavailable"}
          </h2>
          <span className="agents-muted">
            {summary?.taskId} · seed {summary?.seed} · recorded execution
          </span>
        </div>
        <button
          type="button"
          className="agents-close"
          onClick={close}
          aria-label="Close run detail"
          autoFocus
        >
          ×
        </button>
      </header>
      <div className="agents-drawer-body">
        {error ? (
          <UnavailableState
            title="Run detail could not be validated"
            error={error}
            retry={() => void query.refetch()}
          />
        ) : !run ? (
          <LoadingState label="recorded run detail" />
        ) : (
          <>
            <section>
              <h3>Verdict · expected {summary?.expectedVerdict.toLowerCase()}</h3>
              <StatusMark
                status={(run.decision?.verdict as "ACCEPT" | "REJECT" | "ABSTAIN") ?? "INFO"}
              />
              <span className="ml-3">
                <StatusMark
                  status={run.verifiedResearchSuccess ? "PASS" : "ABSTAIN"}
                  label={run.verifiedResearchSuccess ? "Verified" : "Unverified"}
                />
              </span>
              <p className="agents-quote">
                {run.decision?.reason ?? "No decision is bound to this run."}
              </p>
            </section>
            <section>
              <h3>Execution trace · {run.actions.length} actions</h3>
              <p className="agents-muted agents-mono">
                {formatMetric(run.usage.tokens)} tokens · {formatMetric(run.usage.cost)} ·{" "}
                {formatMetric(run.usage.wallSeconds)}
              </p>
              <ol className="agents-steps">
                {run.actions.map((action) => (
                  <li key={action.sequence}>
                    <span className="agents-step-number agents-mono">{action.sequence}</span>
                    <div>
                      <Link
                        className="agents-link"
                        to="/runs/$runId"
                        params={{ runId }}
                        search={{ node: action.sequence, tab: "action" }}
                      >
                        {words(action.tool.replace("research.", ""))}
                      </Link>
                      <small className="agents-mono">
                        {action.tool} · {action.status}
                        {action.engine ? " · " + action.engine : ""}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3>
                Checks · {Object.values(run.verificationChecks).filter(Boolean).length} of{" "}
                {Object.keys(run.verificationChecks).length} passed
              </h3>
              <ul className="agents-checks">
                {Object.entries(run.verificationChecks).map(([name, passed]) => (
                  <li key={name} data-passed={passed}>
                    <span
                      style={{ color: passed ? "#42C98B" : "#F06464" }}
                      aria-label={passed ? "Passed" : "Failed"}
                    >
                      {passed ? "✓" : "×"}
                    </span>
                    {words(name)}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Identifiers</h3>
              <p className="agents-mono break-all">{run.runId}</p>
              <p className="agents-muted break-all">World: {run.worldHash}</p>
            </section>
            <Link
              className="agents-link"
              to="/runs/$runId"
              params={{ runId }}
              search={{ node, tab: "action" }}
            >
              Open full trajectory and evidence inspector →
            </Link>
          </>
        )}
      </div>
    </dialog>
  );
}
