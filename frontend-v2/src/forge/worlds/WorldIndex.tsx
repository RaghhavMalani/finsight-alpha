import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { worldsQuery } from "@/forge/data/forge-queries";
import { AgentsShell } from "@/forge/shared/AgentsShell";
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
    <AgentsShell evidence="worlds">
      <SurfaceHeader
        eyebrow="Agents · evidence bindings"
        title="Worlds"
        description="Synthetic world references from the frozen v0.2.5 trajectories. Standalone world manifests are absent, so policies, interventions and parent relationships remain unavailable."
      />
      {query.isPending ? (
        <LoadingState label="world references" />
      ) : query.error || !query.data ? (
        <UnavailableState
          title="World reference index unavailable"
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <InstrumentPanel
          title="Referenced worlds"
          code={query.data.items.length + " hashes bound to the release"}
        >
          <div className="agents-scroll" role="region" aria-label="World references" tabIndex={0}>
            <table className="agents-table">
              <thead>
                <tr>
                  <th scope="col">World hash</th>
                  <th scope="col">Tasks</th>
                  <th scope="col" className="agents-num">
                    Run references
                  </th>
                  <th scope="col">Manifest</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((w) => (
                  <tr key={w.worldHash}>
                    <td className="agents-mono" title={w.worldHash}>
                      {w.worldHash.slice(0, 12)}…
                    </td>
                    <td>
                      {[...new Set(w.references.map((r) => r.taskId))].map((task) => (
                        <Link
                          key={task}
                          className="agents-link mr-3"
                          to="/runs"
                          search={{
                            task,
                            model: undefined,
                            verdict: undefined,
                            taskClass: undefined,
                            seed: undefined,
                            verified: undefined,
                          }}
                        >
                          {task}
                        </Link>
                      ))}
                    </td>
                    <td className="agents-num">{w.references.length}</td>
                    <td>
                      <StatusMark
                        status="INFO"
                        label={w.manifestAvailable ? "Exported" : "Not exported"}
                      />
                    </td>
                    <td className="agents-muted">Synthetic task world</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="agents-card-foot">
            Run references bind a world by hash. They do not supply its missing manifest or
            establish a real market result.
          </div>
        </InstrumentPanel>
      )}
    </AgentsShell>
  );
}
