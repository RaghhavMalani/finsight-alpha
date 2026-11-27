// Forge v2 successor of frontend-v2/src/forge/worlds/WorldIndex.tsx.
// Kept separate because v1 is frozen phase evidence (scripts/research_archive.py SHARED_PATHS).
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { worldsQuery } from "@/forge/data/forge-queries";
import { AgentsShell } from "@/forge2/shared/AgentsShell";
import { useForgeProv } from "@/forge2/shared/forge-prov";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge2/shared/SurfacePrimitives";

export function WorldIndex() {
  const query = useQuery(worldsQuery);
  const { N } = useForgeProv("/forge/worlds");
  return (
    <AgentsShell evidence="worlds">
      <SurfaceHeader
        eyebrow="Agents · evidence bindings"
        title="Worlds"
        description={
          <span data-num-exempt="copy">
            Synthetic world references from the frozen v0.2.5 trajectories. Standalone world
            manifests are absent, so policies, interventions and parent relationships remain
            unavailable.
          </span>
        }
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
          code={
            <>
              {N(
                "/items",
                query.data.items.length,
                "Referenced worlds",
                String(query.data.items.length),
                { formula: "count of /items" },
              )}{" "}
              hashes bound to the release
            </>
          }
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
                {query.data.items.map((w, i) => (
                  <tr key={w.worldHash}>
                    <td className="agents-mono" title={w.worldHash} data-num-exempt="id">
                      {w.worldHash.slice(0, 12)}…
                    </td>
                    <td data-num-exempt="id">
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
                    <td className="agents-num">
                      {N(
                        `/items/${i}/references`,
                        w.references.length,
                        "Run references",
                        String(w.references.length),
                        { formula: `count of /items/${i}/references` },
                      )}
                    </td>
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
