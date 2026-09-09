import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue } from "@/epistemic/EpistemicValue";
import { baselineIndexQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

export function BenchIndex() {
  const query = useQuery(baselineIndexQuery);
  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow="Immutable baselines"
        title="Bench"
        description="Versioned model and system observations. Bench presents release artifacts; it does not compute a global model ranking."
      />
      <div className="mt-5">
        {query.isPending ? (
          <LoadingState label="baseline index" />
        ) : query.error || !query.data ? (
          <UnavailableState
            title="Baseline index unavailable"
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {query.data.map((baseline) => (
              <InstrumentPanel
                key={baseline.binding.artifactHash}
                title={baseline.tag}
                code="REAL API BASELINE"
              >
                <div className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <StatusMark status="PASS" label={baseline.binding.integrityStatus} />
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#65707c]">
                      {baseline.models.map((model) => model.replace("gpt-5.6-", "")).join(" · ")}
                    </span>
                  </div>
                  <div className="mt-4">
                    <HashValue label="baseline" value={baseline.binding.artifactHash} />
                  </div>
                  <Link
                    to="/bench/$benchmarkId"
                    params={{ benchmarkId: baseline.binding.artifactId }}
                    search={{ model: undefined }}
                    className="mt-5 inline-flex border border-[#FFB000] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#FFB000] hover:bg-[#FFB000] hover:text-[#07090B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
                  >
                    Inspect baseline
                  </Link>
                </div>
              </InstrumentPanel>
            ))}
            <UnavailableRelease label="v0.2.5.1 hardened" />
            <UnavailableRelease label="v0.3 multi-agent" />
          </div>
        )}
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
      <h2 className="mt-2 text-base font-medium text-[#aab2ba]">{label}</h2>
      <p className="mt-2 text-sm text-[#65707c]">No verified artifact is loaded.</p>
    </section>
  );
}
