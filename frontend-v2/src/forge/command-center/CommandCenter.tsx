import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ResearchValue, HashValue } from "@/epistemic/EpistemicValue";
import { DEFAULT_BASELINE_ID, DEFAULT_REALITY_ID } from "@/forge/contracts/observer";
import { baselineQuery, realityQuery, runsQuery } from "@/forge/data/forge-queries";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

export function CommandCenter({ selectedRunId }: { selectedRunId?: string }) {
  const baseline = useQuery(baselineQuery(DEFAULT_BASELINE_ID));
  const runs = useQuery(runsQuery());
  const reality = useQuery(realityQuery(DEFAULT_REALITY_ID));

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

  const selected =
    runs.data.items.find((item) => item.runId === selectedRunId) ?? runs.data.items[0];

  return (
    <div>
      <SurfaceHeader
        eyebrow="Observer Foundation · v0.2.5"
        title="Command Center"
        description="A read-only view across immutable runs, baseline evidence, and the bound Reality Ladder. This surface never creates or grades research truth."
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusMark status="PASS" label={baseline.data.binding.integrityStatus} />
            <StatusMark status="INFO" label="READ ONLY" />
          </div>
        }
      />

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(15rem,0.72fr)_minmax(25rem,1.5fr)_minmax(18rem,0.85fr)]">
        <InstrumentPanel title="Runs" code="TRAJECTORIES">
          <div className="divide-y divide-[#171d23]">
            {runs.data.items.slice(0, 7).map((run) => {
              const active = run.runId === selected?.runId;
              return (
                <Link
                  key={run.runId}
                  to="/forge"
                  search={{ run: run.runId }}
                  className={`block px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                    active ? "bg-[#111820]" : "hover:bg-[#0e1216]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#d6dbe0]">
                      {run.model.replace("gpt-5.6-", "")}
                    </span>
                    <StatusMark
                      status={
                        run.decision?.verdict === "ACCEPT"
                          ? "ACCEPT"
                          : run.decision?.verdict === "REJECT"
                            ? "REJECT"
                            : "ABSTAIN"
                      }
                    />
                  </div>
                  <div className="mt-2 text-xs text-[#8b949e]">{run.taskId}</div>
                  <div className="mt-2">
                    <HashValue label="run" value={run.runId} />
                  </div>
                </Link>
              );
            })}
          </div>
          <Link
            to="/runs"
            search={{ model: undefined, verdict: undefined }}
            className="block border-t border-[#1D232B] px-3 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#52A8FF] hover:text-[#8ac8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]"
          >
            Open run index →
          </Link>
        </InstrumentPanel>

        <InstrumentPanel title="Selected trajectory" code="CANONICAL PROJECTION">
          {selected ? (
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#65707c]">
                    {selected.taskId}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#E6E8EB]">
                    {selected.model.replace("gpt-5.6-", "")} ·{" "}
                    {selected.decision?.verdict ?? "No decision"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7B8490]">
                    {selected.decision?.reason ?? "The frozen trajectory contains no decision."}
                  </p>
                </div>
                <StatusMark
                  status={
                    selected.verifiedResearchSuccess
                      ? "PASS"
                      : selected.criticalGateFailure
                        ? "FAIL"
                        : "INFO"
                  }
                  label={
                    selected.verifiedResearchSuccess
                      ? "VERIFIED RESEARCH"
                      : selected.criticalGateFailure
                        ? "CRITICAL GATE"
                        : "OBSERVED"
                  }
                />
              </div>
              <div className="mt-6 grid gap-px bg-[#1D232B] sm:grid-cols-2 lg:grid-cols-3">
                {[selected.usage.tokens, selected.usage.cost, selected.usage.wallSeconds].map(
                  (metric) => (
                    <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-3" />
                  ),
                )}
              </div>
              <div className="mt-5 grid gap-2 font-mono text-[9px]">
                <HashValue label="trajectory" value={selected.runId} />
                <HashValue label="world" value={selected.worldHash} />
              </div>
              <Link
                to="/runs/$runId"
                params={{ runId: selected.runId }}
                search={{ node: 1, tab: "action" }}
                className="mt-6 inline-flex border border-[#FFB000] bg-[#FFB000] px-4 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.11em] text-[#07090B] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
              >
                Inspect trajectory
              </Link>
            </div>
          ) : (
            <p className="p-5 text-sm text-[#7B8490]">
              No admitted trajectories are present in the frozen baseline.
            </p>
          )}
        </InstrumentPanel>

        <div className="grid content-start gap-4">
          <InstrumentPanel title="Baseline" code={baseline.data.tag}>
            <div className="grid gap-px bg-[#1D232B] sm:grid-cols-2 xl:grid-cols-1">
              {[
                baseline.data.overall.verifiedResearch,
                baseline.data.overall.falseAlpha,
                baseline.data.overall.episodes,
                baseline.data.overall.costPerVerifiedFinding,
              ].map((metric) => (
                <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-3" />
              ))}
            </div>
            <Link
              to="/bench/$benchmarkId"
              params={{ benchmarkId: DEFAULT_BASELINE_ID }}
              search={{ model: undefined }}
              className="block border-t border-[#1D232B] px-3 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#52A8FF] hover:text-[#8ac8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]"
            >
              Open Bench →
            </Link>
          </InstrumentPanel>
          <InstrumentPanel title="Reality binding" code={reality.data.primaryMetric}>
            <div className="p-3">
              <ResearchValue metric={reality.data.alphaSurvival} />
              <div className="mt-4">
                <HashValue label="artifact" value={reality.data.binding.artifactHash} />
              </div>
              <Link
                to="/reality/$artifactId"
                params={{ artifactId: DEFAULT_REALITY_ID }}
                search={{ checkpoint: undefined, metric: "sharpe" }}
                className="mt-4 inline-flex font-mono text-[9px] uppercase tracking-[0.1em] text-[#A67CFF] hover:text-[#c3a6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
              >
                Open ladder →
              </Link>
            </div>
          </InstrumentPanel>
        </div>
      </div>
    </div>
  );
}
