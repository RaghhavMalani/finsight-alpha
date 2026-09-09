import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue } from "@/epistemic/EpistemicValue";
import { worldsQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

export function WorldIndex() {
  const query = useQuery(worldsQuery);
  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow="Point-in-time boundaries"
        title="Worlds"
        description="World references observed in frozen v0.2.5 trajectories. The export does not include standalone world manifests, so as-of policies and fork relationships remain unavailable."
        meta={<StatusMark status="INFO" label="REFERENCE INDEX" />}
      />
      <div className="mt-5">
        {query.isPending ? (
          <LoadingState label="world references" />
        ) : query.error || !query.data ? (
          <UnavailableState
            title="World reference index unavailable"
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {query.data.items.map((world) => (
              <InstrumentPanel
                key={world.worldHash}
                title="Observed world reference"
                code={world.manifestAvailable ? "MANIFEST" : "MANIFEST UNAVAILABLE"}
              >
                <div className="p-4">
                  <HashValue label="world" value={world.worldHash} />
                  <div className="mt-4 border border-dashed border-[#303842] bg-[#090b0e] p-3">
                    <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#616A75]">
                      UNAVAILABLE
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#737d87]">
                      No world manifest is present in the frozen baseline export. No policy, parent,
                      or intervention is inferred.
                    </p>
                  </div>
                  <details className="mt-4 border-t border-[#1D232B] pt-3">
                    <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.1em] text-[#52A8FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]">
                      Referencing trajectories
                    </summary>
                    <ul className="mt-3 grid gap-2">
                      {world.references.map((reference) => (
                        <li
                          key={reference.runId}
                          className="flex items-center justify-between gap-3 border border-[#1D232B] p-2"
                        >
                          <span className="text-xs text-[#8b949e]">{reference.taskId}</span>
                          <Link
                            to="/runs/$runId"
                            params={{ runId: reference.runId }}
                            search={{ node: 1, tab: "action" }}
                            className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#52A8FF] hover:text-[#8ac8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
                          >
                            Open run
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </InstrumentPanel>
            ))}
          </div>
        )}
      </div>
    </ForgeShell>
  );
}
