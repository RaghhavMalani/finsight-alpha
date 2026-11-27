// Forge v2 successor of frontend-v2/src/forge/bench/BenchIndex.tsx.
// Kept separate because v1 is frozen phase evidence (scripts/research_archive.py SHARED_PATHS).
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { baselineIndexQuery } from "@/forge/data/forge-queries";
import { AgentsShell } from "@/forge2/shared/AgentsShell";
import { useForgeProv } from "@/forge2/shared/forge-prov";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge2/shared/SurfacePrimitives";

export function BenchIndex() {
  const query = useQuery(baselineIndexQuery);
  const { N, D } = useForgeProv("/forge/baselines");
  return (
    <AgentsShell>
      <SurfaceHeader
        eyebrow="Agents · immutable baselines"
        title="Bench"
        description="Released baselines are frozen sets of runs with manifests. These observations describe a release, rather than a global model ranking."
      />
      {query.isPending ? (
        <LoadingState label="baseline index" />
      ) : query.error || !query.data ? (
        <UnavailableState
          title="Baseline index unavailable"
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <InstrumentPanel title="Baselines" code="Manifest-bound releases">
          <div className="agents-scroll" role="region" aria-label="Baseline releases" tabIndex={0}>
            <table className="agents-table">
              <thead>
                <tr>
                  <th scope="col">Baseline</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="agents-num">
                    Episodes
                  </th>
                  <th scope="col" className="agents-num">
                    Attempts
                  </th>
                  <th scope="col" className="agents-num">
                    Excluded
                  </th>
                  <th scope="col">Models</th>
                  <th scope="col">Created</th>
                  <th scope="col">Integrity</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((b, i) => (
                  <tr key={b.binding.artifactHash}>
                    <td>
                      <Link
                        data-num-exempt="id"
                        className="agents-link"
                        to="/bench/$benchmarkId"
                        params={{ benchmarkId: b.binding.artifactId }}
                        search={{ model: undefined }}
                      >
                        {b.binding.artifactId}
                      </Link>
                      <div className="agents-faint text-xs">
                        Real API · single agent · synthetic tasks
                      </div>
                    </td>
                    <td>
                      <StatusMark status="PASS" label="Released" />
                    </td>
                    <td className="agents-num">
                      {N(`/items/${i}/episodes`, b.episodes, "Episodes", String(b.episodes))}
                    </td>
                    <td className="agents-num">
                      {N(`/items/${i}/attempts_total`, b.attempts, "Attempts", String(b.attempts))}
                    </td>
                    <td className="agents-num">
                      {N(
                        `/items/${i}/excluded_attempts`,
                        b.excludedAttempts,
                        "Excluded attempts",
                        String(b.excludedAttempts),
                      )}
                    </td>
                    <td>
                      {b.models
                        .map((m) => m.replace("gpt-5.6-", ""))
                        .sort()
                        .join(", ")}
                    </td>
                    <td className="agents-mono">
                      {D(
                        `/items/${i}/created_at`,
                        b.createdAt,
                        "Created",
                        b.createdAt.slice(0, 10),
                      )}
                    </td>
                    <td>
                      <StatusMark
                        status={b.binding.integrityStatus === "MANIFEST_MATCH" ? "PASS" : "INFO"}
                        label={b.binding.integrityStatus}
                      />
                    </td>
                  </tr>
                ))}
                {["v0.2.5.1 hardened", "v0.3 multi-agent"].map((label) => (
                  <tr key={label}>
                    <td data-num-exempt="id">{label}</td>
                    <td>
                      <StatusMark status="INFO" label="Not released" />
                    </td>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <td key={i} className="agents-faint">
                        —
                      </td>
                    ))}
                    <td className="agents-muted">No verified artifact loaded</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="agents-card-foot">
            A pending release has no evidence or measurements to show. Existing baseline hashes and
            canonical values are preserved.
          </div>
        </InstrumentPanel>
      )}
    </AgentsShell>
  );
}
