import { useMemo, useState } from "react";
import type {
  AutopsyMetric,
  AutopsyStage,
  GeneralizationAutopsyArtifact,
} from "@/dynamics/autopsy-contracts";

type Family = "double_well" | "state_diffusion";

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function percent(value: number | null, digits = 1): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(digits)}%`;
}

function decimal(value: number | null, digits = 3): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function signedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)} pp`;
}

function tone(metric: AutopsyMetric, split: "development" | "confirmation") {
  if (metric.gate === null) return "text-[#DDE3E7]";
  return metric[split].marginToGate !== null && metric[split].marginToGate >= 0
    ? "text-[#64C892]"
    : "text-[#E28272]";
}

function MetricMatrix({ metrics }: { metrics: AutopsyMetric[] }) {
  return (
    <section aria-labelledby="autopsy-metrics">
      <div className="border-b border-[#24313A] px-4 py-3">
        <h3 id="autopsy-metrics" className="text-sm font-medium text-[#DCE2E6]">
          Development passed. Confirmation failed.
        </h3>
        <p className="mt-1 text-[10px] leading-4 text-[#74818A]">
          Positive gap always means confirmation became worse. Intervals are Wilson 95%.
        </p>
      </div>
      <div className="grid gap-px bg-[#24313A]">
        {metrics.map((metric) => (
          <article
            key={metric.metric}
            className="grid gap-px bg-[#24313A] lg:grid-cols-[minmax(13rem,1.3fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)]"
          >
            <div className="bg-[#090C0F] px-3 py-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#B9C2C9]">
                {label(metric.metric)}
              </div>
              <div className="mt-1 text-[9px] text-[#65727C]">
                {metric.direction} is better
                {metric.gate === null ? " / descriptive only" : ` / gate ${percent(metric.gate)}`}
              </div>
            </div>
            <div className="bg-[#0A0F13] px-3 py-3">
              <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#62707A]">
                Development
              </div>
              <div className={`mt-1 font-mono text-lg tabular-nums ${tone(metric, "development")}`}>
                {percent(metric.development.value)}
              </div>
              <div
                className="mt-1 font-mono text-[8px] text-[#65727C]"
                title={
                  metric.development.wilson95
                    ? `Wilson 95% ${percent(metric.development.wilson95[0])} to ${percent(
                        metric.development.wilson95[1],
                      )}`
                    : undefined
                }
              >
                {metric.development.numerator}/{metric.development.denominator}
              </div>
            </div>
            <div className="bg-[#0A0F13] px-3 py-3">
              <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#62707A]">
                Confirmation
              </div>
              <div
                className={`mt-1 font-mono text-lg tabular-nums ${tone(metric, "confirmation")}`}
              >
                {percent(metric.confirmation.value)}
              </div>
              <div
                className="mt-1 font-mono text-[8px] text-[#65727C]"
                title={
                  metric.confirmation.wilson95
                    ? `Wilson 95% ${percent(metric.confirmation.wilson95[0])} to ${percent(
                        metric.confirmation.wilson95[1],
                      )}`
                    : undefined
                }
              >
                {metric.confirmation.numerator}/{metric.confirmation.denominator}
              </div>
            </div>
            <div className="bg-[#0A0F13] px-3 py-3">
              <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#62707A]">
                Generalization gap
              </div>
              <div
                className={`mt-1 font-mono text-lg tabular-nums ${
                  metric.worsening > 0 ? "text-[#E28272]" : "text-[#64C892]"
                }`}
              >
                {signedPercent(metric.worsening)}
              </div>
              <div className="mt-1 text-[8px] text-[#65727C]">positive means worse</div>
            </div>
            <div className="bg-[#0A0F13] px-3 py-3">
              <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#62707A]">
                Confirmation margin
              </div>
              <div className="mt-1 font-mono text-lg tabular-nums text-[#D9AE4F]">
                {metric.confirmation.marginToGate === null
                  ? "n/a"
                  : signedPercent(metric.confirmation.marginToGate)}
              </div>
              <div className="mt-1 text-[8px] text-[#65727C]">relative to frozen gate</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StageCell({ stage }: { stage: AutopsyStage }) {
  if (stage.status === "UNAVAILABLE") {
    return (
      <div className="bg-[#0B0E11] px-3 py-3">
        <div className="font-mono text-[9px] uppercase text-[#77828B]">{label(stage.stage)}</div>
        <div className="mt-1 text-[9px] leading-4 text-[#68747D]">UNAVAILABLE: {stage.reason}</div>
      </div>
    );
  }
  const displayed = stage.sequential ?? stage.raw;
  const rawDiffers =
    stage.raw !== null &&
    stage.sequential !== null &&
    stage.raw.numerator !== stage.sequential.numerator;
  return (
    <div className="bg-[#0B0E11] px-3 py-3">
      <div className="font-mono text-[9px] uppercase text-[#AEB7BE]">{label(stage.stage)}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="font-mono text-base tabular-nums text-[#DDE3E7]">
          {percent(displayed?.value ?? null)}
        </span>
        <span className="font-mono text-[8px] text-[#65727C]">
          {stage.sequential ? "sequential" : "raw"}{" "}
          {displayed ? `${displayed.numerator}/${displayed.denominator}` : "n/a"}
        </span>
      </div>
      {rawDiffers ? (
        <div className="mt-1 font-mono text-[8px] text-[#596670]">
          raw {stage.raw?.numerator}/{stage.raw?.denominator}
        </div>
      ) : null}
      <div className="mt-1 text-[8px] text-[#65727C]">
        attrition {stage.attrition === null ? "n/a" : percent(stage.attrition)}
      </div>
    </div>
  );
}

function Waterfall({
  artifact,
  family,
  onFamily,
}: {
  artifact: GeneralizationAutopsyArtifact;
  family: Family;
  onFamily: (family: Family) => void;
}) {
  const source =
    family === "double_well" ? artifact.waterfalls.doubleWell : artifact.waterfalls.stateDiffusion;
  return (
    <section className="border-t border-[#24313A]" aria-labelledby="autopsy-waterfall">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24313A] px-4 py-3">
        <div>
          <h3 id="autopsy-waterfall" className="text-sm font-medium text-[#DCE2E6]">
            Causal waterfall
          </h3>
          <p className="mt-1 text-[10px] text-[#74818A]">
            Attrition is calculated only between compatible sequential stages.
          </p>
        </div>
        <div className="flex border border-[#2C3841]" aria-label="Waterfall family">
          {(["double_well", "state_diffusion"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={family === item}
              onClick={() => onFamily(item)}
              className={`px-3 py-2 font-mono text-[8px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFB000] ${
                family === item
                  ? "bg-[#D9AE4F] text-[#07090B]"
                  : "bg-[#090C0F] text-[#8D98A1] hover:text-[#DDE3E7]"
              }`}
            >
              {label(item)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-px bg-[#24313A] lg:grid-cols-2">
        <div>
          <div className="bg-[#11171C] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E8992]">
            Development
          </div>
          <div className="grid gap-px bg-[#24313A] sm:grid-cols-2">
            {source.development.map((stage) => (
              <StageCell key={stage.stage} stage={stage} />
            ))}
          </div>
        </div>
        <div>
          <div className="bg-[#15120B] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#B9974E]">
            Confirmation
          </div>
          <div className="grid gap-px bg-[#24313A] sm:grid-cols-2">
            {source.confirmation.map((stage) => (
              <StageCell key={stage.stage} stage={stage} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PathInformation({
  artifact,
  family,
}: {
  artifact: GeneralizationAutopsyArtifact;
  family: Family;
}) {
  const source =
    family === "double_well"
      ? artifact.pathSummary.doubleWell
      : artifact.pathSummary.stateDiffusion;
  const wanted =
    family === "double_well"
      ? [
          "left_basin_occupancy",
          "right_basin_occupancy",
          "barrier_region_occupancy",
          "barrier_crossings",
          "completed_basin_transitions",
          "state_space_coverage",
          "samples_near_unstable",
        ]
      : [
          "visited_x_range",
          "minimum_samples_per_support_bin",
          "state_support_coverage",
          "conditional_variance_contrast",
          "true_g_contrast_over_visited_support",
          "estimated_g_contrast",
          "ground_truth_diffusion_range_visited_fraction",
        ];
  const asPercent = new Set([
    "left_basin_occupancy",
    "right_basin_occupancy",
    "barrier_region_occupancy",
    "state_space_coverage",
    "state_support_coverage",
    "ground_truth_diffusion_range_visited_fraction",
  ]);
  return (
    <section className="border-t border-[#24313A]" aria-labelledby="path-information">
      <div className="border-b border-[#24313A] px-4 py-3">
        <h3 id="path-information" className="text-sm font-medium text-[#DCE2E6]">
          Path information
        </h3>
        <p className="mt-1 text-[10px] text-[#74818A]">
          Medians from exact hash-checked trajectory regeneration. No estimator was rerun.
        </p>
      </div>
      <div className="grid gap-px bg-[#24313A] sm:grid-cols-2 xl:grid-cols-4">
        {wanted.map((field) => {
          const row = source[field];
          const render = (value: number | null) =>
            asPercent.has(field) ? percent(value) : decimal(value, 2);
          return (
            <div key={field} className="bg-[#090C0F] px-3 py-3">
              <div className="min-h-8 font-mono text-[8px] uppercase leading-4 text-[#74818A]">
                {label(field)}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[7px] uppercase text-[#596670]">Development</div>
                  <div className="mt-1 font-mono text-base tabular-nums text-[#DDE3E7]">
                    {render(row?.development ?? null)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[7px] uppercase text-[#8B743E]">Confirmation</div>
                  <div className="mt-1 font-mono text-base tabular-nums text-[#D9AE4F]">
                    {render(row?.confirmation ?? null)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DiagnosticFlags({ artifact }: { artifact: GeneralizationAutopsyArtifact }) {
  return (
    <section className="border-t border-[#24313A]" aria-labelledby="diagnostic-flags">
      <div className="border-b border-[#24313A] px-4 py-3">
        <h3 id="diagnostic-flags" className="text-sm font-medium text-[#DCE2E6]">
          Diagnostic flags
        </h3>
        <p className="mt-1 text-[10px] text-[#74818A]">
          Flags are deterministic. Inactive flags carry no synthetic evidence.
        </p>
      </div>
      <div className="grid gap-px bg-[#24313A] md:grid-cols-2 xl:grid-cols-3">
        {artifact.flags.map((flag) => (
          <article
            key={flag.code}
            className={flag.active ? "bg-[#17110D] px-3 py-3" : "bg-[#090C0F] px-3 py-3"}
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className={`font-mono text-[9px] font-semibold uppercase ${
                  flag.active ? "text-[#E39B74]" : "text-[#73808A]"
                }`}
              >
                {flag.code}
              </div>
              <span
                className={`font-mono text-[8px] ${
                  flag.active ? "text-[#E28272]" : "text-[#64C892]"
                }`}
              >
                {flag.active ? "ACTIVE" : "NOT RAISED"}
              </span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[#78848D]">{flag.reason}</p>
            <div className="mt-2 font-mono text-[8px] text-[#5F6B74]">
              {flag.evidenceCount} evidence record
              {flag.evidenceCount === 1 ? "" : "s"} / {flag.affectedWorlds.length} worlds
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ThresholdSensitivityPanel({ artifact }: { artifact: GeneralizationAutopsyArtifact }) {
  return (
    <section className="border-t border-[#24313A]" aria-labelledby="threshold-sensitivity">
      <div className="border-b border-[#24313A] px-4 py-3">
        <h3 id="threshold-sensitivity" className="text-sm font-medium text-[#DCE2E6]">
          Threshold sensitivity
        </h3>
        <p className="mt-1 text-[10px] text-[#74818A]">
          Descriptive distance from frozen gates. No operating point was selected here.
        </p>
      </div>
      <div className="grid gap-px bg-[#24313A] md:grid-cols-2 xl:grid-cols-5">
        {artifact.thresholds.map((threshold) => (
          <article key={threshold.gate} className="bg-[#090C0F] px-3 py-3">
            <div className="min-h-8 font-mono text-[8px] uppercase leading-4 text-[#AAB4BB]">
              {label(threshold.gate)}
            </div>
            <div className="mt-2 font-mono text-[8px] text-[#65727C]">
              frozen {decimal(threshold.frozenThreshold)} / band +/-{" "}
              {decimal(threshold.descriptiveBand)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="font-mono text-[7px] uppercase text-[#596670]">Dev margin</div>
                <div className="mt-1 font-mono text-sm text-[#DDE3E7]">
                  {decimal(threshold.developmentMedianMargin)}
                </div>
                <div className="mt-1 text-[8px] text-[#65727C]">
                  near {threshold.developmentNear[0]}/{threshold.developmentNear[1]}
                </div>
              </div>
              <div>
                <div className="font-mono text-[7px] uppercase text-[#8B743E]">Conf margin</div>
                <div className="mt-1 font-mono text-sm text-[#D9AE4F]">
                  {decimal(threshold.confirmationMedianMargin)}
                </div>
                <div className="mt-1 text-[8px] text-[#65727C]">
                  near {threshold.confirmationNear[0]}/{threshold.confirmationNear[1]}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WorldInspector({
  artifact,
  selectedId,
  onSelected,
}: {
  artifact: GeneralizationAutopsyArtifact;
  selectedId: string;
  onSelected: (value: string) => void;
}) {
  const selected =
    artifact.confirmationWorlds.find((world) => world.cellId === selectedId) ??
    artifact.confirmationWorlds[0];
  if (!selected) return null;
  const pathEntries = Object.entries(selected.path)
    .filter(([key]) => !["cell_id", "split", "world_hash"].includes(key))
    .slice(0, 10);
  return (
    <section className="border-t border-[#24313A]" aria-labelledby="world-inspector">
      <div className="grid gap-3 border-b border-[#24313A] px-4 py-3 md:grid-cols-[1fr_minmax(16rem,24rem)] md:items-end">
        <div>
          <h3 id="world-inspector" className="text-sm font-medium text-[#DCE2E6]">
            Confirmation world inspector
          </h3>
          <p className="mt-1 text-[10px] text-[#74818A]">
            Inspect one frozen world without changing the aggregate conclusion.
          </p>
        </div>
        <label className="block">
          <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#74818A]">
            Frozen world
          </span>
          <select
            value={selected.cellId}
            onChange={(event) => onSelected(event.target.value)}
            className="mt-1 w-full border border-[#34414A] bg-[#080B0E] px-3 py-2 font-mono text-[10px] text-[#DDE3E7] outline-none focus:border-[#D9AE4F]"
          >
            {artifact.confirmationWorlds.map((world) => (
              <option key={world.cellId} value={world.cellId}>
                {world.cellId}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-px bg-[#24313A] xl:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-px bg-[#24313A] sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(selected.stages).map(([stage, passed]) => (
            <div key={stage} className="bg-[#090C0F] px-3 py-3">
              <div className="min-h-8 font-mono text-[8px] uppercase leading-4 text-[#74818A]">
                {label(stage)}
              </div>
              <div
                className={`mt-2 font-mono text-[9px] ${
                  passed === null ? "text-[#77828B]" : passed ? "text-[#64C892]" : "text-[#E28272]"
                }`}
              >
                {passed === null ? "UNAVAILABLE" : passed ? "PASS" : "LOSS"}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-px bg-[#24313A] sm:grid-cols-2">
          {pathEntries.map(([field, value]) => (
            <div key={field} className="bg-[#0B0E11] px-3 py-3">
              <div className="font-mono text-[8px] uppercase text-[#74818A]">{label(field)}</div>
              <div className="mt-1 break-all font-mono text-[10px] text-[#D9AE4F]">
                {typeof value === "number" ? decimal(value, 4) : value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EvidenceSeals({ artifact }: { artifact: GeneralizationAutopsyArtifact }) {
  return (
    <section className="border-t border-[#24313A] px-4 py-3" aria-label="Evidence seals">
      <div className="grid gap-2 lg:grid-cols-3">
        <div>
          <div className="font-mono text-[7px] uppercase text-[#65727C]">Autopsy content</div>
          <div
            className="mt-1 truncate font-mono text-[8px] text-[#AEB7BE]"
            title={artifact.artifactHash}
          >
            {artifact.artifactHash}
          </div>
        </div>
        <div>
          <div className="font-mono text-[7px] uppercase text-[#65727C]">Autopsy source</div>
          <div
            className="mt-1 truncate font-mono text-[8px] text-[#AEB7BE]"
            title={artifact.sourceSha256}
          >
            {artifact.sourceSha256}
          </div>
        </div>
        <div>
          <div className="font-mono text-[7px] uppercase text-[#65727C]">Direct parent</div>
          <div
            className="mt-1 truncate font-mono text-[8px] text-[#AEB7BE]"
            title={artifact.parentSeals.at(-1)?.artifactHash}
          >
            {artifact.parentSeals.at(-1)?.artifactHash}
          </div>
        </div>
      </div>
    </section>
  );
}

export function GeneralizationAutopsy({ artifact }: { artifact: GeneralizationAutopsyArtifact }) {
  const [family, setFamily] = useState<Family>("double_well");
  const firstConfirmation = artifact.confirmationWorlds[0]?.cellId ?? "";
  const [selectedId, setSelectedId] = useState(firstConfirmation);
  const failingMetrics = useMemo(
    () =>
      artifact.metricTable.filter(
        (metric) => metric.gate !== null && (metric.confirmation.marginToGate ?? 0) < 0,
      ).length,
    [artifact.metricTable],
  );
  return (
    <section className="mt-3 overflow-hidden border border-[#34414A] bg-[#080B0E]">
      <header className="grid gap-px bg-[#34414A] xl:grid-cols-[minmax(24rem,1.4fr)_repeat(3,minmax(12rem,0.6fr))]">
        <div className="bg-[#10100D] px-4 py-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#B18D3B]">
            D0.3.3 generalization autopsy
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#F0D697]">
            Where did the information disappear?
          </h2>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#8B8170]">
            Measured development and confirmation evidence remain separate from deterministic
            interpretation.
          </p>
        </div>
        <div className="bg-[#180D0D] px-4 py-4">
          <div className="font-mono text-[7px] uppercase tracking-[0.12em] text-[#96665D]">
            D0.3.3 result
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-[#E28272]">
            {artifact.d033Result}
          </div>
          <div className="mt-1 font-mono text-[8px] text-[#976A63]">SEALED / HISTORICAL</div>
        </div>
        <div className="bg-[#11130F] px-4 py-4">
          <div className="font-mono text-[7px] uppercase tracking-[0.12em] text-[#687665]">
            Frozen protocol
          </div>
          <div className="mt-2 font-mono text-[10px] font-semibold text-[#B8C4B2]">
            NO RETUNING AFTER CONFIRMATION
          </div>
          <div className="mt-2 font-mono text-[8px] text-[#6F7B6C]">
            {failingMetrics} confirmation gates failed
          </div>
        </div>
        <div className="bg-[#15120B] px-4 py-4">
          <div className="font-mono text-[7px] uppercase tracking-[0.12em] text-[#8B743E]">
            Next decision
          </div>
          <div className="mt-2 break-words font-mono text-[10px] font-semibold leading-4 text-[#D9AE4F]">
            {artifact.decision}
          </div>
          <div className="mt-2 font-mono text-[8px] text-[#71613C]">MARKET CLAIM INELIGIBLE</div>
        </div>
      </header>

      <MetricMatrix metrics={artifact.metricTable} />
      <Waterfall artifact={artifact} family={family} onFamily={setFamily} />
      <PathInformation artifact={artifact} family={family} />
      <DiagnosticFlags artifact={artifact} />
      <ThresholdSensitivityPanel artifact={artifact} />
      <WorldInspector artifact={artifact} selectedId={selectedId} onSelected={setSelectedId} />

      <section className="grid gap-px border-t border-[#24313A] bg-[#24313A] lg:grid-cols-2">
        <div className="bg-[#090C0F] px-4 py-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#65727C]">
            SINDy structure stability
          </div>
          <div className="mt-2 font-mono text-[10px] text-[#D9AE4F]">{artifact.sindyStatus}</div>
          <p className="mt-2 text-[10px] leading-4 text-[#74818A]">{artifact.sindyReason}</p>
        </div>
        <div className="bg-[#151108] px-4 py-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#9B7C37]">
            Market claim unchanged
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#D9BE82]">
            {artifact.marketInterpretation}
          </p>
        </div>
      </section>
      <EvidenceSeals artifact={artifact} />
    </section>
  );
}
