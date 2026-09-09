import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import { DEFAULT_BASELINE_ID } from "@/forge/contracts/observer";
import { baselineQuery, runsQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

export function RunIndex({ model, verdict }: { model?: string; verdict?: string }) {
  const runs = useQuery(runsQuery({ model, verdict }));
  const baseline = useQuery(baselineQuery(DEFAULT_BASELINE_ID));
  const failure = runs.error ?? baseline.error;

  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow="Canonical trajectories"
        title="Runs"
        description="Admitted trajectories from the manifest-bound v0.2.5 episode export. Filters are encoded in the URL and survive refresh or sharing."
        meta={<StatusMark status="INFO" label="IMMUTABLE" />}
      />
      <div className="mt-5">
        {runs.isPending || baseline.isPending ? (
          <LoadingState label="run index" />
        ) : failure || !runs.data || !baseline.data ? (
          <UnavailableState
            title="Run index unavailable"
            error={failure}
            retry={() => {
              void runs.refetch();
              void baseline.refetch();
            }}
          />
        ) : (
          <>
            <section aria-label="Run filters" className="border border-[#1D232B] bg-[#0B0E11] p-3">
              <div className="grid gap-3 lg:grid-cols-[auto_1fr] lg:items-center">
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#65707c]">
                  Model
                </div>
                <div className="flex flex-wrap gap-2">
                  <FilterLink
                    label="All models"
                    active={!model}
                    model={undefined}
                    verdict={verdict}
                  />
                  {baseline.data.models.map((item) => (
                    <FilterLink
                      key={item.id}
                      label={item.label}
                      active={model === item.id}
                      model={item.id}
                      verdict={verdict}
                    />
                  ))}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#65707c]">
                  Verdict
                </div>
                <div className="flex flex-wrap gap-2">
                  {[undefined, "ACCEPT", "REJECT", "ABSTAIN"].map((item) => (
                    <Link
                      key={item ?? "all"}
                      to="/runs"
                      search={{ model, verdict: item }}
                      className={`border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] ${
                        verdict === item || (!verdict && item === undefined)
                          ? "border-[#FFB000] bg-[#1b160d] text-[#FFB000]"
                          : "border-[#303842] text-[#8b949e] hover:border-[#59636e]"
                      }`}
                    >
                      {item ?? "All verdicts"}
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            <InstrumentPanel
              title="Observed runs"
              code={runs.data.binding.integrityStatus}
              className="mt-4"
            >
              {runs.data.items.length ? (
                <div className="divide-y divide-[#171d23]">
                  {runs.data.items.map((run) => (
                    <article
                      key={run.runId}
                      className="grid gap-4 px-3 py-4 hover:bg-[#0d1115] lg:grid-cols-[minmax(12rem,0.8fr)_minmax(18rem,1.2fr)_minmax(17rem,1fr)_auto] lg:items-center"
                    >
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.11em] text-[#FFB000]">
                          {run.model.replace("gpt-5.6-", "")} · {run.modelVersion}
                        </div>
                        <div className="mt-1 text-sm font-medium text-[#dce0e4]">{run.taskId}</div>
                      </div>
                      <div className="grid gap-2">
                        <HashValue label="run" value={run.runId} />
                        <HashValue label="world" value={run.worldHash} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <ResearchValue metric={run.usage.cost} compact />
                        <ResearchValue metric={run.usage.wallSeconds} compact />
                      </div>
                      <div className="flex items-center justify-between gap-3 lg:justify-end">
                        <StatusMark
                          status={
                            run.decision?.verdict === "ACCEPT"
                              ? "ACCEPT"
                              : run.decision?.verdict === "REJECT"
                                ? "REJECT"
                                : "ABSTAIN"
                          }
                        />
                        <Link
                          to="/runs/$runId"
                          params={{ runId: run.runId }}
                          search={{ node: 1, tab: "action" }}
                          className="border border-[#3b4651] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#d5dbe0] hover:border-[#FFB000] hover:text-[#FFB000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
                        >
                          Observe
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-[#7B8490]">
                  No frozen trajectories match the URL filters.
                </p>
              )}
            </InstrumentPanel>
          </>
        )}
      </div>
    </ForgeShell>
  );
}

function FilterLink({
  label,
  active,
  model,
  verdict,
}: {
  label: string;
  active: boolean;
  model?: string;
  verdict?: string;
}) {
  return (
    <Link
      to="/runs"
      search={{ model, verdict }}
      className={`border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] ${
        active
          ? "border-[#FFB000] bg-[#1b160d] text-[#FFB000]"
          : "border-[#303842] text-[#8b949e] hover:border-[#59636e]"
      }`}
    >
      {label}
    </Link>
  );
}
