// Forge v2 successor of frontend-v2/src/forge/command-center/CommandCenter.tsx.
// Kept separate because v1 is frozen phase evidence (scripts/research_archive.py SHARED_PATHS).
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
} from "@/forge2/shared/SurfacePrimitives";
import { formatMetric, useForgeProv } from "@/forge2/shared/forge-prov";
import { svgProv } from "@/visual/origins";

/** Counts computed in the page from the run index projection name this rule. */
const RUNS = "count of /items";
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
  const B = useForgeProv(`/forge/baselines/${DEFAULT_BASELINE_ID}`);
  const R = useForgeProv(`/forge/runs?baseline_id=${DEFAULT_BASELINE_ID}`);
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
  const selectedIndex = runs.data.items.findIndex((r) => r.runId === selectedRunId);
  const matched = R.N("/matched", runs.data.matched, "Matched runs", String(runs.data.matched));
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
        title={<span data-num-exempt="id">Forge v0.2.5 baseline</span>}
        description={
          <>
            {R.N("/matched", runs.data.matched, "Research episodes", String(runs.data.matched))}{" "}
            research episodes across{" "}
            {B.N(
              "/model_summaries",
              overview.models.length,
              "Models",
              undefined,
              {
                formula: "count of /model_summaries",
              },
              "int",
            )}{" "}
            models. Deterministic verifier grades are recorded alongside every action.
          </>
        }
        meta={<Binding baseline={baseline.data} />}
      />
      <section className="agents-card agents-kpis" aria-label="Headline numbers">
        <Kpi
          label="Verified research success"
          value={
            <>
              {R.N(
                "/items",
                overview.verified,
                "Verified research success",
                undefined,
                {
                  formula: `${RUNS} where verification/verified_research_success`,
                },
                "int",
              )}
              <small> / {matched}</small>
            </>
          }
          note={<>{B.M(baseline.data.overall.verifiedResearch)} passed every recorded check</>}
        />
        <Kpi
          label="Correct verdict"
          value={
            <>
              {R.N(
                "/items",
                overview.correctVerdicts,
                "Correct verdict",
                undefined,
                {
                  formula: `${RUNS} where verification/checks/verdict`,
                },
                "int",
              )}
              <small> / {matched}</small>
            </>
          }
          note="Matches the recorded verifier expectation"
        />
        <Kpi
          label="False alpha accepted"
          value={R.N(
            "/items",
            overview.falseAlpha,
            "False alpha accepted",
            undefined,
            {
              formula: `${RUNS} where verification/false_alpha_acceptance`,
            },
            "int",
          )}
          note="Recorded decisions on synthetic research tasks"
        />
        <Kpi
          label="Inference cost"
          value={B.M(
            baseline.data.admittedCost,
            "Inference cost (admitted episodes)",
            "$" + baseline.data.admittedCost.value.toFixed(2),
          )}
          note={
            <>
              Token estimate, not an invoice · {B.M(baseline.data.attempts)} attempts,{" "}
              {B.M(baseline.data.excludedAttempts)} excluded
            </>
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
          code={
            <>
              {R.N(
                "/items",
                overview.failures.length,
                "Runs that failed a check",
                undefined,
                {
                  formula: `${RUNS} where not verification/verified_research_success`,
                },
                "int",
              )}{" "}
              of {matched} runs
            </>
          }
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
                      <span className="agents-mono">
                        {R.N(
                          "/items",
                          group.length,
                          "Runs in this group",
                          undefined,
                          {
                            formula: `${RUNS} where not verification/verified_research_success, task_id = ${first.taskId} and failed checks = ${failed.join(", ") || "none"}`,
                          },
                          "int",
                        )}
                      </span>
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
                const where = `${RUNS} where model = ${model.id}`;
                return (
                  <tr key={model.id}>
                    <th scope="row" data-num-exempt="id">
                      {model.id}
                    </th>
                    <td className="agents-num" title={model.verifiedResearch.provenance.fieldPath}>
                      {B.M(model.verifiedResearch)}
                    </td>
                    <td className="agents-num">
                      {R.N(
                        "/items",
                        modelRuns.filter((r) => r.verificationChecks.verdict).length,
                        "Correct verdict",
                        undefined,
                        { formula: `${where} and verification/checks/verdict` },
                        "int",
                      )}{" "}
                      /{" "}
                      {R.N(
                        "/items",
                        modelRuns.length,
                        "Runs",
                        undefined,
                        { formula: where },
                        "int",
                      )}
                    </td>
                    <td className="agents-num">
                      {R.N(
                        "/items",
                        modelRuns.filter((r) => r.falseAlphaAcceptance).length,
                        "False alpha",
                        undefined,
                        { formula: `${where} and verification/false_alpha_acceptance` },
                        "int",
                      )}
                    </td>
                    <td
                      className="agents-num"
                      title={model.costPerVerifiedFinding.provenance.fieldPath}
                    >
                      {B.M(model.costPerVerifiedFinding)}
                    </td>
                    <td className="agents-num" title={model.latency.provenance.fieldPath}>
                      {B.M(model.latency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="agents-card-foot">
          <span>
            Recorded{" "}
            {B.D(
              "/created_at",
              baseline.data.createdAt,
              "Recorded",
              new Date(baseline.data.createdAt).toISOString().slice(0, 10),
            )}{" "}
            · model costs are token estimates.
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
          summaryIndex={selectedIndex}
          node={selectedNodeSequence}
          close={close}
        />
      )}
    </>
  );
}

function Binding({ baseline }: { baseline: BaselineDetail }) {
  return (
    <details className="agents-prov" data-num-exempt="id">
      <summary>
        <StatusMark status="PASS" label="Manifest match" /> · v0.2.5{" "}
        <span className="agents-mono">{baseline.binding.artifactHash.slice(0, 8)}…</span>
      </summary>
      <p className="agents-mono">{baseline.binding.artifactHash}</p>
      <p>{baseline.binding.sourceSchemaVersion}</p>
    </details>
  );
}
function Kpi({ label, value, note }: { label: string; value: ReactNode; note: ReactNode }) {
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

function RealityOverview({ reality }: { reality: RealityDetail }) {
  const L = useForgeProv(`/forge/reality-ladders/${DEFAULT_REALITY_ID}`);
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
            {points.map((p, i) => {
              const sv = svgProv(
                L.at(p.sharpe.provenance.fieldPath),
                `${p.label} Sharpe`,
                p.sharpe.value,
              );
              return (
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
                    {...sv.attrs}
                  >
                    <title>{sv.title}</title>
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
              );
            })}
          </svg>
          <dl className="agents-ladder-key">
            {points.map((p) => (
              <div key={p.id}>
                <dt>{p.label}</dt>
                <dd className="agents-mono">
                  {L.M(p.sharpe, `${p.label} Sharpe`, p.sharpe.value.toFixed(2))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="agents-ladder-values">
          <div>
            <span className="agents-muted">Edge that survives</span>
            <output className="agents-mono">{L.M(reality.alphaSurvival)}</output>
          </div>
          <div>
            <span className="agents-muted">Biggest loss</span>
            <output className="agents-mono">{L.M(reality.largestDegradation.change)}</output>
            <span className="agents-faint">{reality.largestDegradation.label}</span>
          </div>
          <div>
            <span className="agents-muted">Source artifact</span>
            <output className="agents-mono" data-num-exempt="id">
              {reality.binding.artifactHash.slice(0, 12)}…
            </output>
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
        <div className="agents-card-foot">
          {L.T("/aggregate/finding", reality.finding, "Recorded finding")}
        </div>
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
              {reality.regimeMatrix.map((row, i) => {
                const at = `/aggregate/regime_matrix/${i}`;
                return (
                  <tr key={row.regime}>
                    <th scope="row">{words(row.regime.toLowerCase())}</th>
                    <td className="agents-num">
                      {L.N(
                        `${at}/sharpe/L0_ANALYTICAL`,
                        row.start,
                        "Start Sharpe",
                        row.start.toFixed(2),
                      )}
                    </td>
                    <td className="agents-num">
                      {L.N(
                        `${at}/sharpe/L4_COUNTERFACTUAL_STRESS`,
                        row.stressed,
                        "Stressed Sharpe",
                        row.stressed.toFixed(2),
                      )}
                    </td>
                    <td className="agents-num">
                      {L.N(
                        `${at}/alpha_survival_ratio`,
                        row.survival,
                        "Alpha survival",
                        row.survival.toFixed(1) + "%",
                        { formula: `${at}/alpha_survival_ratio × 100` },
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="agents-muted mt-4">
            Seed counts:{" "}
            {reality.regimeMatrix.map((row, i) => (
              <span key={row.regime}>
                {i ? " · " : ""}
                {words(row.regime.toLowerCase())}{" "}
                {L.N(`/aggregate/regime_matrix/${i}/seeds`, row.seeds, "Seeds", String(row.seeds))}
              </span>
            ))}
            . These reference results do not certify tradable market alpha.
          </p>
          <p className="agents-faint agents-mono mt-4 break-all" data-num-exempt="id">
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
  summaryIndex,
  node,
  close,
}: {
  runId: string;
  summary: RunSummary | undefined;
  summaryIndex: number;
  node: number;
  close: () => void;
}) {
  const query = useQuery(runQuery(runId));
  const R = useForgeProv(`/forge/runs?baseline_id=${DEFAULT_BASELINE_ID}`);
  const X = useForgeProv(`/forge/runs/${runId}`);
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
            <span data-num-exempt="id">{summary?.taskId}</span> · seed{" "}
            {R.N(
              `/items/${summaryIndex}/seed`,
              summary?.seed,
              "Seed",
              summary ? String(summary.seed) : undefined,
            )}{" "}
            · recorded execution
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
                {run.decision
                  ? X.T("/run/decision/reason", run.decision.reason, "Recorded decision reason")
                  : "No decision is bound to this run."}
              </p>
            </section>
            <section>
              <h3>
                Execution trace ·{" "}
                {X.N(
                  "/run/actions",
                  run.actions.length,
                  "Actions",
                  undefined,
                  {
                    formula: "count of /run/actions",
                  },
                  "int",
                )}{" "}
                actions
              </h3>
              <p className="agents-muted agents-mono">
                {X.M(run.usage.tokens)} tokens · {X.M(run.usage.cost)} ·{" "}
                {X.M(run.usage.wallSeconds)}
              </p>
              <ol className="agents-steps">
                {run.actions.map((action, i) => (
                  <li key={action.sequence}>
                    <span className="agents-step-number agents-mono">
                      {X.N(
                        `/run/actions/${i}/sequence`,
                        action.sequence,
                        "Action sequence",
                        String(action.sequence),
                      )}
                    </span>
                    <div>
                      <Link
                        className="agents-link"
                        to="/runs/$runId"
                        params={{ runId }}
                        search={{ step: action.sequence, tab: "action" }}
                      >
                        {words(action.tool.replace("research.", ""))}
                      </Link>
                      <small className="agents-mono" data-num-exempt="id">
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
                Checks ·{" "}
                {X.N(
                  "/verification/checks",
                  Object.values(run.verificationChecks).filter(Boolean).length,
                  "Checks passed",
                  undefined,
                  { formula: "count of /verification/checks that are true" },
                  "int",
                )}{" "}
                of{" "}
                {X.N(
                  "/verification/checks",
                  Object.keys(run.verificationChecks).length,
                  "Checks",
                  undefined,
                  { formula: "count of /verification/checks" },
                  "int",
                )}{" "}
                passed
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
              <p className="agents-mono break-all" data-num-exempt="id">
                {run.runId}
              </p>
              <p className="agents-muted break-all" data-num-exempt="id">
                World: {run.worldHash}
              </p>
            </section>
            <Link
              className="agents-link"
              to="/runs/$runId"
              params={{ runId }}
              search={{ step: node, tab: "action" }}
            >
              Open full trajectory and evidence inspector →
            </Link>
          </>
        )}
      </div>
    </dialog>
  );
}
