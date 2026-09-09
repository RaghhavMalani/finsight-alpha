import { useQuery } from "@tanstack/react-query";
import { HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import { artifactsQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

export function ArtifactIndex() {
  const query = useQuery(artifactsQuery);
  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow="Content-addressed evidence"
        title="Artifacts"
        description="Metadata for artifacts directly validated or bound by the observer projection. Raw evidence remains outside this Phase 1 surface."
        meta={<StatusMark status="INFO" label="METADATA ONLY" />}
      />
      <div className="mt-5">
        {query.isPending ? (
          <LoadingState label="artifact index" />
        ) : query.error || !query.data ? (
          <UnavailableState
            title="Artifact index unavailable"
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {query.data.items.map((artifact) => (
              <InstrumentPanel
                key={artifact.binding.artifactId}
                title={artifact.kind.replaceAll("_", " ")}
                code={artifact.binding.artifactId}
              >
                <div className="p-4">
                  <StatusMark
                    status={
                      artifact.binding.integrityStatus === "MANIFEST_MATCH" ||
                      artifact.binding.integrityStatus === "FROZEN_ARTIFACT"
                        ? "PASS"
                        : "INFO"
                    }
                    label={artifact.binding.integrityStatus}
                  />
                  <div className="mt-4">
                    <HashValue label="artifact" value={artifact.binding.artifactHash} />
                  </div>
                  <div className="mt-4">
                    <ResearchValue metric={artifact.sourceFileCount} />
                  </div>
                  <div className="mt-4 break-words border-t border-[#1D232B] pt-3 font-mono text-[8px] leading-5 text-[#65707c]">
                    {artifact.binding.sourceSchemaVersion}
                  </div>
                </div>
              </InstrumentPanel>
            ))}
          </div>
        )}
      </div>
    </ForgeShell>
  );
}
