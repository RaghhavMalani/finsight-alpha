import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import { baselineQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

export function BenchDetail({
  benchmarkId,
  selectedModel,
}: {
  benchmarkId: string;
  selectedModel?: string;
}) {
  const query = useQuery(baselineQuery(benchmarkId));
  if (query.isPending)
    return (
      <ForgeShell>
        <LoadingState label="baseline detail" />
      </ForgeShell>
    );
  if (query.error || !query.data) {
    return (
      <ForgeShell>
        <UnavailableState
          title="Baseline could not be validated"
          error={query.error}
          retry={() => void query.refetch()}
        />
      </ForgeShell>
    );
  }
  const baseline = query.data;
  const models = selectedModel
    ? baseline.models.filter((model) => model.id === selectedModel)
    : baseline.models;

  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow={`Bench · ${baseline.tag}`}
        title="Real API model baseline"
        description="The exact frozen v0.2.5 summary and manifest binding. Display rounding is presentation-only; provenance exposes the canonical source field."
        meta={<StatusMark status="PASS" label={baseline.binding.integrityStatus} />}
      />
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.6fr)]">
        <InstrumentPanel title="Model observations" code="SUITE-SPECIFIC">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <caption className="sr-only">Frozen baseline metrics by model</caption>
              <thead>
                <tr className="border-b border-[#1D232B] font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707c]">
                  <th scope="col" className="px-3 py-3 font-medium">
                    Model
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Verified research
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    False alpha
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Critical failures
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Cost / verified
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Latency
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171d23]">
                {models.map((model) => (
                  <tr key={model.id} className="align-top hover:bg-[#0e1216]">
                    <th scope="row" className="px-3 py-4">
                      <Link
                        to="/bench/$benchmarkId"
                        params={{ benchmarkId }}
                        search={{ model: model.id }}
                        className="font-medium text-[#E6E8EB] hover:text-[#FFB000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
                      >
                        {model.label}
                      </Link>
                      <div className="mt-1 font-mono text-[8px] uppercase text-[#59636e]">
                        {model.provider}
                      </div>
                    </th>
                    {[
                      model.verifiedResearch,
                      model.falseAlpha,
                      model.criticalFailures,
                      model.costPerVerifiedFinding,
                      model.latency,
                    ].map((metric) => (
                      <td key={metric.id} className="px-3 py-4">
                        <ResearchValue metric={metric} compact />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedModel && (
            <Link
              to="/bench/$benchmarkId"
              params={{ benchmarkId }}
              search={{ model: undefined }}
              className="block border-t border-[#1D232B] px-3 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#52A8FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]"
            >
              Clear model focus
            </Link>
          )}
        </InstrumentPanel>

        <div className="grid content-start gap-4">
          <InstrumentPanel title="Artifact totals" code={baseline.tag}>
            <div className="grid gap-px bg-[#1D232B] sm:grid-cols-2 xl:grid-cols-1">
              {[
                baseline.overall.episodes,
                baseline.excludedAttempts,
                baseline.allAttemptCost,
                baseline.admittedCost,
              ].map((metric) => (
                <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-3" />
              ))}
            </div>
          </InstrumentPanel>
          <InstrumentPanel title="Bindings" code={baseline.binding.sourceSchemaVersion}>
            <div className="grid gap-3 p-3">
              <HashValue label="baseline" value={baseline.binding.artifactHash} />
              <HashValue label="suite" value={baseline.suiteHash} />
              <HashValue label="certification" value={baseline.certificationArtifactHash} />
              <HashValue label="reality" value={baseline.realityLadderArtifactHash} />
            </div>
          </InstrumentPanel>
          <section className="border border-[#28323b] bg-[#0B0E11] p-4">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#52A8FF]">
              Interpretation boundary
            </div>
            <p className="mt-2 text-sm leading-6 text-[#8b949e]">
              Observer Foundation exposes suite observations and provenance. It does not promote
              them into a global model ranking.
            </p>
          </section>
          <UnavailableRelease label="v0.2.5.1 hardened" />
        </div>
      </div>
    </ForgeShell>
  );
}

function UnavailableRelease({ label }: { label: string }) {
  return (
    <section className="border border-dashed border-[#303842] bg-[#090b0e] p-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#616A75]">
        UNAVAILABLE
      </div>
      <h2 className="mt-2 text-sm font-medium text-[#aab2ba]">{label}</h2>
      <p className="mt-1 text-xs text-[#65707c]">No verified artifact is loaded.</p>
    </section>
  );
}
