import { useQuery } from "@tanstack/react-query";
import { artifactsQuery } from "@/forge/data/forge-queries";
import { AgentsShell } from "@/forge/shared/AgentsShell";
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
    <AgentsShell evidence="catalog">
      <SurfaceHeader
        eyebrow="Agents · content-addressed evidence"
        title="Artifacts"
        description="Artifacts behind the recorded Agents observations. Integrity, evidence scope and source bindings remain visible; raw provider evidence is outside this public projection."
        meta={<StatusMark status="INFO" label="Metadata only" />}
      />
      {query.isPending ? (
        <LoadingState label="artifact index" />
      ) : query.error || !query.data ? (
        <UnavailableState
          title="Artifact index unavailable"
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <InstrumentPanel
          title="Source artifacts"
          code={query.data.items.length + " bound to this release"}
        >
          <div className="agents-scroll" role="region" aria-label="Artifact bindings" tabIndex={0}>
            <table className="agents-table">
              <thead>
                <tr>
                  <th scope="col">Artifact</th>
                  <th scope="col">Integrity</th>
                  <th scope="col" className="agents-num">
                    Files
                  </th>
                  <th scope="col">Evidence scope</th>
                  <th scope="col">Source binding</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((a) => (
                  <tr key={a.binding.artifactId}>
                    <td>
                      {a.kind.replaceAll("_", " ").toLowerCase()}
                      <div className="agents-faint agents-mono text-xs">{a.binding.artifactId}</div>
                    </td>
                    <td>
                      <StatusMark
                        status={
                          ["MANIFEST_MATCH", "FROZEN_ARTIFACT"].includes(a.binding.integrityStatus)
                            ? "PASS"
                            : "INFO"
                        }
                        label={a.binding.integrityStatus}
                      />
                    </td>
                    <td className="agents-num" title={a.sourceFileCount.provenance.fieldPath}>
                      {a.sourceFileCount.value}
                    </td>
                    <td className="agents-muted">
                      {a.kind === "REAL_API_BASELINE"
                        ? "Real API · synthetic tasks"
                        : ["REALITY_LADDER", "ENGINE_CERTIFICATION"].includes(a.kind)
                          ? "Synthetic reference"
                          : "Scope unavailable"}
                    </td>
                    <td>
                      <details className="agents-artifact-binding">
                        <summary className="agents-mono">
                          {a.binding.artifactHash.slice(0, 12)}…
                        </summary>
                        <p className="agents-mono break-all">{a.binding.artifactHash}</p>
                        <p className="agents-muted">{a.binding.sourceSchemaVersion}</p>
                        <p className="agents-muted">
                          Source field: {a.sourceFileCount.provenance.fieldPath}
                        </p>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InstrumentPanel>
      )}
    </AgentsShell>
  );
}
