import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { DEFAULT_BASELINE_ID } from "@/forge/contracts/observer";
import { baselineQuery, runsQuery } from "@/forge/data/forge-queries";
import { AgentsShell } from "@/forge/shared/AgentsShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";
import { buildAgentOverview, recordedOutcome } from "@/forge/command-center/overview-model";

type RunFilters = {
  model: string | undefined;
  verdict: string | undefined;
  task: string | undefined;
  taskClass: string | undefined;
  seed: number | undefined;
  verified: "verified" | "failed" | undefined;
};
export function RunIndex(filters: RunFilters) {
  const runs = useQuery(runsQuery());
  const baseline = useQuery(baselineQuery(DEFAULT_BASELINE_ID));
  const navigate = useNavigate();
  if (runs.isPending || baseline.isPending)
    return (
      <AgentsShell>
        <LoadingState label="run index" />
      </AgentsShell>
    );
  const failure = runs.error ?? baseline.error;
  if (failure || !runs.data || !baseline.data)
    return (
      <AgentsShell>
        <UnavailableState
          title="Run index unavailable"
          error={failure}
          retry={() => {
            void runs.refetch();
            void baseline.refetch();
          }}
        />
      </AgentsShell>
    );
  try {
    buildAgentOverview(baseline.data, runs.data);
  } catch (error) {
    return (
      <AgentsShell>
        <UnavailableState title="Run index evidence is inconsistent" error={error} />
      </AgentsShell>
    );
  }
  const needle = filters.task?.trim().toLowerCase();
  const items = runs.data.items.filter(
    (r) =>
      (!filters.model || r.model === filters.model) &&
      (!filters.verdict || r.decision?.verdict === filters.verdict) &&
      (!filters.taskClass || r.taskClass === filters.taskClass) &&
      (filters.seed === undefined || r.seed === filters.seed) &&
      (!filters.verified || r.verifiedResearchSuccess === (filters.verified === "verified")) &&
      (!needle ||
        r.taskId.toLowerCase().includes(needle) ||
        r.taskClass.toLowerCase().includes(needle)),
  );
  const classes = [...new Set(runs.data.items.map((r) => r.taskClass))];
  const seeds = [...new Set(runs.data.items.map((r) => r.seed))].sort((a, b) => a - b);
  const update = (patch: Partial<RunFilters>) =>
    void navigate({ to: "/runs", search: { ...filters, ...patch }, replace: true });
  return (
    <AgentsShell>
      <SurfaceHeader
        eyebrow="Agents · admitted trajectories"
        title="Runs"
        description="Every trajectory in the frozen v0.2.5 baseline. Filters persist in the URL; open a run to inspect its actions, source evidence and verifier checks."
        meta={<StatusMark status="INFO" label="Read only" />}
      />
      <InstrumentPanel title="Recorded runs" code={items.length + " of " + runs.data.matched}>
        <div className="agents-filters" aria-label="Run filters">
          <label>
            Task search
            <input
              type="search"
              value={filters.task ?? ""}
              placeholder="Task id or class"
              onChange={(e) => update({ task: e.target.value || undefined })}
            />
          </label>
          <label>
            Task class
            <select
              value={filters.taskClass ?? ""}
              onChange={(e) => update({ taskClass: e.target.value || undefined })}
            >
              <option value="">All task types</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seed
            <select
              value={filters.seed ?? ""}
              onChange={(e) =>
                update({ seed: e.target.value ? Number(e.target.value) : undefined })
              }
            >
              <option value="">All seeds</option>
              {seeds.map((seed) => (
                <option key={seed}>{seed}</option>
              ))}
            </select>
          </label>
          <div className="agents-segment" role="group" aria-label="Model filter">
            {[undefined, ...baseline.data.models.map((m) => m.id).sort()].map((m) => (
              <button
                key={m ?? "all"}
                type="button"
                aria-pressed={filters.model === m}
                onClick={() => update({ model: m })}
              >
                {m?.replace("gpt-5.6-", "") ?? "All models"}
              </button>
            ))}
          </div>
          <label>
            Verdict
            <select
              value={filters.verdict ?? ""}
              onChange={(e) => update({ verdict: e.target.value || undefined })}
            >
              <option value="">All verdicts</option>
              {["ACCEPT", "REJECT", "ABSTAIN"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Verification
            <select
              value={filters.verified ?? ""}
              onChange={(e) =>
                update({ verified: (e.target.value as RunFilters["verified"]) || undefined })
              }
            >
              <option value="">All grades</option>
              <option value="verified">Verified</option>
              <option value="failed">Unverified</option>
            </select>
          </label>
          <button
            className="agents-link"
            type="button"
            onClick={() =>
              update({
                model: undefined,
                verdict: undefined,
                task: undefined,
                taskClass: undefined,
                seed: undefined,
                verified: undefined,
              })
            }
          >
            Clear filters
          </button>
        </div>
        <div className="agents-scroll" role="region" aria-label="Recorded run table" tabIndex={0}>
          <table className="agents-table">
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Model</th>
                <th scope="col" className="agents-num">
                  Seed
                </th>
                <th scope="col">Verdict</th>
                <th scope="col">Grade</th>
                <th scope="col" className="agents-num">
                  Tokens
                </th>
                <th scope="col" className="agents-num">
                  Cost
                </th>
                <th scope="col" className="agents-num">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((run) => (
                <tr key={run.runId}>
                  <td>
                    <Link
                      className="agents-link"
                      to="/runs/$runId"
                      params={{ runId: run.runId }}
                      search={{ node: 1, tab: "action" }}
                    >
                      {run.taskId}
                    </Link>
                    <div className="agents-faint text-xs">{run.taskClass.replaceAll("_", " ")}</div>
                  </td>
                  <td>{run.model.replace("gpt-5.6-", "")}</td>
                  <td className="agents-num">{run.seed}</td>
                  <td>
                    <StatusMark
                      status={(run.decision?.verdict as "ACCEPT" | "REJECT" | "ABSTAIN") ?? "INFO"}
                      label={run.decision?.verdict ?? "No decision"}
                    />
                  </td>
                  <td>
                    <StatusMark
                      status={
                        recordedOutcome(run) === "verified"
                          ? "PASS"
                          : recordedOutcome(run) === "partial"
                            ? "ABSTAIN"
                            : "FAIL"
                      }
                      label={
                        recordedOutcome(run) === "verified"
                          ? "Verified"
                          : recordedOutcome(run) === "partial"
                            ? "Failed check"
                            : "Wrong verdict"
                      }
                    />
                  </td>
                  <td className="agents-num">{run.usage.tokens.value.toLocaleString("en-US")}</td>
                  <td className="agents-num">{"$" + run.usage.cost.value.toFixed(5)}</td>
                  <td className="agents-num">{run.usage.wallSeconds.value.toFixed(1)}s</td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={8} className="agents-muted">
                    No frozen trajectories match the URL filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="agents-card-foot">
          Inference cost is a token estimate, not an invoice. Verification grades are recorded; the
          browser does not rerun the verifier.
        </div>
      </InstrumentPanel>
    </AgentsShell>
  );
}
