import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { BaselineDetail, ResearchMetric, RunSummary } from "@/forge/contracts/observer";
import { DEFAULT_BASELINE_ID, DEFAULT_REALITY_ID } from "@/forge/contracts/observer";
import { baselineQuery, realityQuery, runQuery, runsQuery } from "@/forge/data/forge-queries";
import { TrajectoryEvidenceInspector } from "@/forge/runs/TrajectoryEvidenceInspector";
import { TrajectoryExplorer } from "@/forge/runs/TrajectoryExplorer";
import { buildTrajectoryViewModel } from "@/forge/runs/trajectory-model";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

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
  const selectedSummary =
    runs.data?.items.find((item) => item.runId === selectedRunId) ?? runs.data?.items[0];
  const detail = useQuery({
    ...runQuery(selectedSummary?.runId ?? ""),
    enabled: Boolean(selectedSummary?.runId),
  });
  const navigate = useNavigate();

  if (baseline.isPending || runs.isPending || reality.isPending) {
    return <LoadingState label="Forge Command Center" />;
  }
  const failure = baseline.error ?? runs.error ?? reality.error;
  if (failure || !baseline.data || !runs.data || !reality.data) {
    return (
      <UnavailableState
        title="Command Center projections could not be validated"
        error={failure}
        retry={() => {
          void baseline.refetch();
          void runs.refetch();
          void reality.refetch();
        }}
      />
    );
  }

  if (!selectedSummary) {
    return (
      <UnavailableState
        title="No admitted trajectories are present"
        error={new Error("The frozen baseline contains no selectable run.")}
      />
    );
  }

  if (detail.isPending) {
    return (
      <div>
        <CommandCenterHeader baseline={baseline.data} runCount={runs.data.matched} />
        <div className="mt-3">
          <LoadingState label="selected trajectory" />
        </div>
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <UnavailableState
        title="Selected trajectory could not be projected"
        error={detail.error}
        retry={() => void detail.refetch()}
      />
    );
  }

  const trajectory = buildTrajectoryViewModel(detail.data);
  const selectedNode =
    trajectory.nodes.find((node) => node.sequence === selectedNodeSequence) ?? trajectory.nodes[0];

  if (!selectedNode) {
    return (
      <UnavailableState
        title="Selected trajectory has no actions"
        error={new Error("The frozen trajectory action list is empty.")}
      />
    );
  }

  const selectNode = (sequence: number) => {
    void navigate({
      to: "/forge",
      search: { run: detail.data.runId, node: sequence },
    });
  };

  return (
    <div>
      <CommandCenterHeader baseline={baseline.data} runCount={runs.data.matched} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[13.5rem_minmax(32rem,1fr)_18.5rem]">
        <InstrumentPanel title="Run index" code={`${runs.data.matched} TRAJECTORIES`}>
          <CommandRunRail
            runs={runs.data.items}
            baseline={baseline.data}
            selectedRunId={selectedSummary.runId}
          />
        </InstrumentPanel>

        <InstrumentPanel
          title={`${detail.data.model.replace("gpt-5.6-", "")} · ${detail.data.taskId}`}
          code={detail.data.decision?.verdict ?? "NO DECISION"}
        >
          <TrajectoryExplorer
            model={trajectory}
            selectedSequence={selectedNode.sequence}
            onSelect={selectNode}
          />
          <div className="grid grid-cols-2 gap-px border-t border-[#1D232B] bg-[#1D232B] sm:grid-cols-5">
            <RunMetric label="Tokens" value={detail.data.usage.tokens.value.toLocaleString()} />
            <RunMetric label="Cost" value={formatMetric(detail.data.usage.cost)} tone="amber" />
            <RunMetric label="Wall" value={formatMetric(detail.data.usage.wallSeconds)} />
            <RunMetric label="Trajectory" value={`${detail.data.runId.slice(0, 8)}…`} />
            <Link
              to="/runs/$runId"
              params={{ runId: detail.data.runId }}
              search={{ node: selectedNode.sequence, tab: "action" }}
              className="flex min-h-12 items-center justify-center bg-[#0B0E11] px-3 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-[#FFB000] hover:bg-[#111820] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]"
            >
              Replay →
            </Link>
          </div>
        </InstrumentPanel>

        <InstrumentPanel title="Evidence" code={selectedNode.label}>
          <TrajectoryEvidenceInspector run={detail.data} node={selectedNode} compact />
        </InstrumentPanel>
      </div>

      <DenseBaselineTable
        baseline={baseline.data}
        realityArtifactHash={reality.data.binding.artifactHash}
      />
    </div>
  );
}

function CommandCenterHeader({
  baseline,
  runCount,
}: {
  baseline: BaselineDetail;
  runCount: number;
}) {
  return (
    <header className="border-y border-[#1D232B] bg-[#090c0f] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E6E8EB]">
          Command Center <span className="text-[#59636e]">/</span>{" "}
          <span className="text-[#FFB000]">v0.2.5</span> <span className="text-[#59636e]">/</span>{" "}
          <span className="text-[#8b949e]">Read only</span>
        </h1>
        <div className="flex gap-2">
          <StatusMark status="PASS" label={baseline.binding.integrityStatus} />
          <StatusMark status="INFO" label="FROZEN" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#7f8993]">
        <span>{runCount} episodes</span>
        <span aria-hidden="true" className="text-[#303842]">
          ·
        </span>
        <span>{baseline.models.length} models</span>
        <span aria-hidden="true" className="text-[#303842]">
          ·
        </span>
        <span className="text-[#35C78A]">manifest match</span>
        <span aria-hidden="true" className="text-[#303842]">
          ·
        </span>
        <span>node data is frozen evidence</span>
      </div>
    </header>
  );
}

function CommandRunRail({
  runs,
  baseline,
  selectedRunId,
}: {
  runs: readonly RunSummary[];
  baseline: BaselineDetail;
  selectedRunId: string;
}) {
  const selected = runs.find((run) => run.runId === selectedRunId);

  return (
    <div className="max-h-[548px] overflow-y-auto">
      {baseline.models.map((model) => {
        const modelRuns = runs.filter((run) => run.model === model.id);
        const activeModel = selected?.model === model.id;
        const counts = verdictCounts(modelRuns);
        return (
          <details
            key={model.id}
            open={activeModel}
            className="border-b border-[#1D232B] last:border-b-0"
          >
            <summary
              className={`cursor-pointer list-none px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${activeModel ? "bg-[#10151a]" : "hover:bg-[#0e1216]"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${activeModel ? "text-[#FFB000]" : "text-[#cfd5da]"}`}
                >
                  {model.label}
                </span>
                <span className="font-mono text-[8px] text-[#65707c]">{modelRuns.length}</span>
              </span>
              <span className="mt-2 grid grid-cols-3 gap-1 font-mono text-[7px] uppercase tracking-[0.06em] text-[#65707c]">
                <span>A {counts.ACCEPT}</span>
                <span>R {counts.REJECT}</span>
                <span>Ø {counts.ABSTAIN}</span>
              </span>
            </summary>
            <div className="border-t border-[#1D232B]">
              {modelRuns.map((run) => {
                const active = run.runId === selectedRunId;
                return (
                  <Link
                    key={run.runId}
                    to="/forge"
                    search={{ run: run.runId, node: 1 }}
                    aria-current={active ? "true" : undefined}
                    className={`relative block border-l-2 px-2.5 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                      active
                        ? "border-l-[#FFB000] bg-[#17160f]"
                        : "border-l-transparent hover:bg-[#0e1216]"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[8px] text-[#c8cfd5]">{run.taskId}</span>
                      <span className={verdictTone(run.decision?.verdict)}>
                        {run.decision?.verdict ?? "NONE"}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 font-mono text-[7px] text-[#65707c]">
                      <span>seed {run.seed}</span>
                      {active ? (
                        <span className="font-semibold uppercase tracking-[0.1em] text-[#FFB000]">
                          selected
                        </span>
                      ) : (
                        <span>{run.runId.slice(0, 7)}</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
      <Link
        to="/runs"
        search={{
          model: undefined,
          verdict: undefined,
          task: undefined,
          taskClass: undefined,
          seed: undefined,
          verified: undefined,
        }}
        className="block border-t border-[#1D232B] px-3 py-3 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-[#52A8FF] hover:bg-[#111820] hover:text-[#8ac8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]"
      >
        Filter all runs →
      </Link>
    </div>
  );
}

function DenseBaselineTable({
  baseline,
  realityArtifactHash,
}: {
  baseline: BaselineDetail;
  realityArtifactHash: string;
}) {
  return (
    <section className="mt-3 border border-[#1D232B] bg-[#0B0E11]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1D232B] px-3 py-2">
        <div>
          <h2 className="text-[12px] font-medium text-[#dce0e4]">Baseline comparison</h2>
          <div className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.1em] text-[#59636e]">
            {baseline.tag}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden font-mono text-[7px] uppercase tracking-[0.08em] text-[#59636e] md:inline">
            Reality {realityArtifactHash.slice(0, 10)}…
          </span>
          <Link
            to="/bench/$benchmarkId"
            params={{ benchmarkId: DEFAULT_BASELINE_ID }}
            search={{ model: undefined }}
            className="font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-[#52A8FF] hover:text-[#8ac8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
          >
            Open Bench →
          </Link>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left font-mono text-[9px] tabular-nums">
          <thead className="bg-[#090c0f] uppercase tracking-[0.08em] text-[#65707c]">
            <tr>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 text-right font-medium">Verified</th>
              <th className="px-3 py-2 text-right font-medium">False α</th>
              <th className="px-3 py-2 text-right font-medium">$ / verified</th>
              <th className="px-3 py-2 text-right font-medium">Latency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#171d23]">
            {baseline.models.map((model) => (
              <tr key={model.id} className="hover:bg-[#0e1216]">
                <th className="px-3 py-2 font-semibold text-[#dce0e4]">{model.label}</th>
                <MetricCell metric={model.verifiedResearch} tone="green" />
                <MetricCell metric={model.falseAlpha} />
                <MetricCell metric={model.costPerVerifiedFinding} tone="amber" />
                <MetricCell metric={model.latency} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCell({
  metric,
  tone = "default",
}: {
  metric: ResearchMetric;
  tone?: "default" | "green" | "amber";
}) {
  const color =
    tone === "green" ? "text-[#35C78A]" : tone === "amber" ? "text-[#FFB000]" : "text-[#cbd1d6]";
  return (
    <td
      className={`px-3 py-2 text-right ${color}`}
      title={`${metric.provenance.source} · ${metric.provenance.fieldPath}`}
    >
      {formatMetric(metric)}
    </td>
  );
}

function RunMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber";
}) {
  return (
    <div className="min-h-12 bg-[#0B0E11] px-3 py-2">
      <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#59636e]">{label}</div>
      <div
        className={`mt-1 truncate font-mono text-[9px] tabular-nums ${tone === "amber" ? "text-[#FFB000]" : "text-[#d8dde2]"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function formatMetric(metric: ResearchMetric): string {
  const value = metric.value.toLocaleString("en-US", {
    minimumFractionDigits: metric.precision,
    maximumFractionDigits: metric.precision,
  });
  if (metric.unit === "PERCENT") return `${value}%`;
  if (metric.unit === "USD") return `$${value}`;
  if (metric.unit === "SECONDS") return `${value}s`;
  return value;
}

function verdictCounts(runs: readonly RunSummary[]) {
  return runs.reduce(
    (counts, run) => {
      const verdict = run.decision?.verdict;
      if (verdict === "ACCEPT" || verdict === "REJECT" || verdict === "ABSTAIN") {
        counts[verdict] += 1;
      }
      return counts;
    },
    { ACCEPT: 0, REJECT: 0, ABSTAIN: 0 },
  );
}

function verdictTone(verdict?: string): string {
  if (verdict === "ACCEPT") return "font-mono text-[7px] font-semibold text-[#35C78A]";
  if (verdict === "REJECT") return "font-mono text-[7px] font-semibold text-[#FF5A57]";
  return "font-mono text-[7px] font-semibold text-[#D8A43A]";
}
