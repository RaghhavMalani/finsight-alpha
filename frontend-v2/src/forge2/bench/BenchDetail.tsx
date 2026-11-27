// Forge v2 successor of frontend-v2/src/forge/bench/BenchDetail.tsx.
// Kept separate because v1 is frozen phase evidence (scripts/research_archive.py SHARED_PATHS).
// U4: metric tabs over the artifact's own fields, an observed-relation sentence computed from
// those fields (bench-model.ts), and releases without a verified artifact shown as UNAVAILABLE.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue } from "@/epistemic/EpistemicValue";
import { ClassChips, MetricCell } from "@/forge2/shared/MetricCell";
import { DEFAULT_REALITY_ID, type BaselineModel } from "@/forge/contracts/observer";
import { baselineIndexQuery, baselineQuery, realityQuery } from "@/forge/data/forge-queries";
import { AgentsShell } from "@/forge2/shared/AgentsShell";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge2/shared/SurfacePrimitives";
import { useForgeProv, type ForgeProv } from "@/forge2/shared/forge-prov";
import {
  BENCH_FIELDS,
  BENCH_METRICS,
  benchMetric,
  formatBenchValue,
  observedRelation,
  type BenchField,
  type BenchMetricKey,
} from "./bench-model";

/**
 * Releases the design plan names (docs/forge-ui-v3-preimplementation.md §4.4). A release is shown
 * with values only when the baseline index lists a verified artifact for it.
 */
const PLANNED_RELEASES = [
  { id: "forge-v0.2.5.1", label: "v0.2.5.1 hardened" },
  { id: "forge-v0.3", label: "v0.3 multi-agent" },
] as const;

export function BenchDetail({
  benchmarkId,
  selectedModel,
  metric,
}: {
  benchmarkId: string;
  selectedModel?: string;
  metric: BenchMetricKey;
}) {
  const query = useQuery(baselineQuery(benchmarkId));
  const index = useQuery(baselineIndexQuery);
  const reality = useQuery(realityQuery(DEFAULT_REALITY_ID));
  const B = useForgeProv(`/forge/baselines/${benchmarkId}`);
  if (query.isPending)
    return (
      <AgentsShell>
        <LoadingState label="baseline detail" />
      </AgentsShell>
    );
  if (query.error || !query.data) {
    return (
      <AgentsShell>
        <UnavailableState
          title="Baseline could not be validated"
          error={query.error}
          retry={() => void query.refetch()}
        />
      </AgentsShell>
    );
  }
  const baseline = query.data;
  const tab = benchMetric(metric);
  const selected = new Set(tab.fields);
  const models = baseline.models;
  const verified = baseline.binding.integrityStatus === "MANIFEST_MATCH";
  const listed = new Set((index.data ?? []).map((item) => item.binding.artifactId));
  const totals = [
    baseline.overall.episodes,
    baseline.excludedAttempts,
    baseline.allAttemptCost,
    baseline.admittedCost,
  ];
  const ladderBound =
    reality.data && reality.data.binding.artifactHash === baseline.realityLadderArtifactHash;

  return (
    <AgentsShell>
      <SurfaceHeader
        eyebrow={<span data-num-exempt="id">{`Bench · ${baseline.tag}`}</span>}
        title="Real API model baseline"
        description={
          <span data-num-exempt="copy">
            The frozen v0.2.5 summary and manifest binding. Display rounding is presentation-only;
            every value opens its source field.
          </span>
        }
        meta={
          <StatusMark
            status={verified ? "PASS" : "INFO"}
            label={verified ? `VERIFIED · ${baseline.binding.integrityStatus}` : "UNVERIFIED"}
          />
        }
      />

      <nav aria-label="Bench metric" className="f2-tabs mt-4">
        {BENCH_METRICS.map((item) => (
          <Link
            key={item.key}
            to="/bench/$benchmarkId"
            params={{ benchmarkId }}
            search={{ model: selectedModel, metric: item.key }}
            aria-current={item.key === tab.key ? "page" : undefined}
            data-metric={item.key}
          >
            {item.tab}
          </Link>
        ))}
      </nav>

      <div className="f2-bench-grid mt-3">
        <InstrumentPanel
          title="Observed relation"
          code={tab.tab.toUpperCase()}
          className="f2-area-relation"
        >
          <div className="f2-panel-body">
            <p className="f2-sentence" data-testid="bench-relation">
              {observedRelation(models, tab).map((part, i) =>
                "text" in part ? (
                  <span key={i}>{part.text}</span>
                ) : (
                  <span key={i}>{B.M(part.field.get(part.model))}</span>
                ),
              )}
            </p>
            <p className="f2-scope" data-testid="bench-scope">
              Observed in this suite (
              {B.M(
                baseline.overall.episodes,
                "Admitted episodes",
                String(baseline.overall.episodes.value),
              )}{" "}
              admitted episodes); not a global ranking. Ties and order use the displayed precision.
            </p>
          </div>
        </InstrumentPanel>

        <InstrumentPanel title="Model observations" code="SUITE-SPECIFIC" className="f2-area-table">
          <p className="f2-scroll-hint">
            Model is pinned; swipe the table for cost, latency and use →
          </p>
          <div className="f2-scroll">
            <div className="overflow-x-auto">
              <table className="f2-bench-table">
                <caption className="sr-only">Frozen baseline metrics by model</caption>
                <thead>
                  <tr>
                    <th scope="col">Model</th>
                    {BENCH_FIELDS.map((field) => (
                      <th
                        key={field.header}
                        scope="col"
                        data-selected={selected.has(field) ? "true" : undefined}
                      >
                        {field.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models
                    .filter((m) => !selectedModel || m.id === selectedModel)
                    .map((model) => (
                      <tr key={model.id}>
                        <th scope="row">
                          <Link
                            to="/bench/$benchmarkId"
                            params={{ benchmarkId }}
                            search={{ model: model.id, metric: tab.key }}
                          >
                            {model.label}
                          </Link>
                        </th>
                        {BENCH_FIELDS.map((field) => (
                          <td
                            key={field.header}
                            data-selected={selected.has(field) ? "true" : undefined}
                          >
                            {B.M(field.get(model))}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          {selectedModel && (
            <Link
              to="/bench/$benchmarkId"
              params={{ benchmarkId }}
              search={{ model: undefined, metric: tab.key }}
              className="block border-t border-[#1D232B] px-3 py-3 text-[12px] text-[#52A8FF]"
            >
              Clear model focus
            </Link>
          )}
          {tab.fields.map((field) => (
            <Bars key={field.header} models={models} field={field} B={B} />
          ))}
        </InstrumentPanel>

        <div className="f2-area-side grid content-start gap-3">
          <InstrumentPanel title="Artifact" code={<ClassChips metrics={totals} />}>
            <div className="f2-subhead">
              <span data-num-exempt="id">{baseline.binding.sourceSchemaVersion}</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[#1D232B]">
              {totals.map((m) => (
                <MetricCell key={m.id} metric={m} value={B.M(m)} />
              ))}
            </div>
            <div className="grid gap-2 p-3">
              <HashValue label="baseline" value={baseline.binding.artifactHash} />
              <HashValue label="suite" value={baseline.suiteHash} />
              <HashValue label="certification" value={baseline.certificationArtifactHash} />
              <HashValue label="reality ladder" value={baseline.realityLadderArtifactHash} />
              {ladderBound ? (
                <Link
                  to="/reality/$artifactId"
                  params={{ artifactId: DEFAULT_REALITY_ID }}
                  search={{ checkpoint: undefined, metric: "sharpe", view: "chart" }}
                  className="agents-link text-[12px]"
                >
                  Open the bound Reality Ladder →
                </Link>
              ) : null}
            </div>
          </InstrumentPanel>

          <InstrumentPanel title="Other releases" code="UNAVAILABLE">
            {PLANNED_RELEASES.filter((r) => !listed.has(r.id)).map((r) => (
              <div key={r.id} className="f2-release" data-release={r.id}>
                <strong>UNAVAILABLE</strong>
                <span data-num-exempt="id">{r.label}</span>
                <span>no verified artifact loaded</span>
              </div>
            ))}
          </InstrumentPanel>
        </div>
      </div>
    </AgentsShell>
  );
}

/** Bar length encodes the named field, scaled to the largest observed value (zero at the left). */
function Bars({
  models,
  field,
  B,
}: {
  models: readonly BaselineModel[];
  field: BenchField;
  B: ForgeProv;
}) {
  const max = Math.max(...models.map((m) => field.get(m).value));
  return (
    <figure className="border-t border-[#1D232B]">
      <div className="f2-bars" role="list" aria-label={`${field.name} by model`}>
        {models.map((m) => {
          const metric = field.get(m);
          return (
            <div key={m.id} className="f2-bar" role="listitem">
              <span>{m.label}</span>
              <span className="f2-bar-track" aria-hidden="true">
                <span
                  className="f2-bar-fill"
                  style={{ width: max > 0 ? `${(metric.value / max) * 100}%` : "0%" }}
                />
              </span>
              <span>{B.M(metric, metric.label, formatBenchValue(metric))}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="f2-legend">
        <span>
          <span className="f2-swatch bg-[#52A8FF]" aria-hidden="true" />
          bar length · {field.name}, from zero to the largest observed value
        </span>
      </figcaption>
    </figure>
  );
}
