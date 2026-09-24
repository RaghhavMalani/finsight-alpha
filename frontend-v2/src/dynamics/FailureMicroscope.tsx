import { useMemo, useState } from "react";
import type {
  FailureClassification,
  FailureDecompositionArtifact,
  PowerSurfaceRow,
} from "@/dynamics/failure-contracts";

const ESTIMATOR_LABELS: Record<string, string> = {
  "EST-SPLINE-D03": "Spline",
  "EST-KM-D032": "Kramers–Moyal",
  "EST-LOCALPOLY-D032": "Local polynomial",
  "EST-SINDY-D032": "SINDy",
  "EST-GP-D032": "Sparse GP",
};

const CLASS_TONE: Record<FailureClassification, string> = {
  DATA_LIMITED: "border-[#665226] bg-[#151108] text-[#E1BB62]",
  ESTIMATOR_LIMITED: "border-[#733D35] bg-[#180D0C] text-[#E58F82]",
  IDENTIFIABLE: "border-[#315843] bg-[#0A1610] text-[#76D29E]",
  NEGATIVE_CONTROL: "border-[#35434D] bg-[#0B1115] text-[#93A3AD]",
  OUT_OF_FAMILY_CONTROL: "border-[#3B3C47] bg-[#101016] text-[#9999A8]",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function decimal(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

function PowerBar({
  label,
  value,
  oracle = false,
}: {
  label: string;
  value: number;
  oracle?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3">
      <span
        className={`truncate font-mono text-[8px] uppercase ${oracle ? "text-[#E3C16E]" : "text-[#89959E]"}`}
      >
        {label}
      </span>
      <div className="h-2 bg-[#1B252C]">
        <div
          className={`h-full ${oracle ? "bg-[#D9AE4F]" : "bg-[#5E7A8D]"}`}
          style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        />
      </div>
      <span className="text-right font-mono text-[9px] tabular-nums text-[#C7D0D6]">
        {percent(value)}
      </span>
    </div>
  );
}

function DetectionPanel({ row }: { row: PowerSurfaceRow }) {
  return (
    <section className="border-r border-[#26333D] p-4">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#687680]">
        Detection / sealed power
      </div>
      <div className="mt-4 space-y-3">
        {row.oraclePower !== null ? (
          <PowerBar label="Family oracle" value={row.oraclePower} oracle />
        ) : null}
        {Object.entries(row.practicalPower).map(([id, value]) => (
          <PowerBar key={id} label={ESTIMATOR_LABELS[id] ?? id} value={value} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-px bg-[#26333D]">
        <Metric
          label="Oracle gap"
          value={
            row.identifiabilityGap === null
              ? "—"
              : `${(row.identifiabilityGap * 100).toFixed(0)} pp`
          }
        />
        <Metric label="Runs" value={String(row.runs)} />
      </div>
    </section>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-[#0A0D10] p-3">
      <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#64717A]">{label}</div>
      <div className="mt-1 font-mono text-base tabular-nums text-[#DBE1E5]">{value}</div>
      {note ? <div className="mt-1 text-[8px] leading-3 text-[#61707A]">{note}</div> : null}
    </div>
  );
}

function TermSpectrum({ row }: { row: PowerSurfaceRow }) {
  const spectrum = row.sindyTermStability;
  return (
    <section className="border-r border-[#26333D] p-4">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#687680]">
        SINDy term stability
      </div>
      {spectrum ? (
        <div className="mt-4 space-y-2">
          {Object.entries(spectrum.inclusionFrequency).map(([term, value]) => {
            const expected = spectrum.trueTerms.includes(term);
            return (
              <div key={term} className="grid grid-cols-[2rem_1fr_3rem_1rem] items-center gap-2">
                <span className="font-mono text-[9px] text-[#C9D1D6]">{term}</span>
                <div className="h-1.5 bg-[#1B252C]">
                  <div
                    className={`h-full ${expected ? "bg-[#76C596]" : "bg-[#9D7655]"}`}
                    style={{ width: `${value * 100}%` }}
                  />
                </div>
                <span className="text-right font-mono text-[8px] text-[#89959E]">
                  {percent(value)}
                </span>
                <span
                  className={`font-mono text-[8px] ${expected ? "text-[#76C596]" : "text-[#5D6870]"}`}
                >
                  {expected ? "✓" : "·"}
                </span>
              </div>
            );
          })}
          <div className="mt-4 border-t border-[#26333D] pt-3 font-mono text-[8px] uppercase text-[#697680]">
            Support separable {percent(row.sindySupportSeparationRate)}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-[10px] leading-4 text-[#67747D]">
          Not applicable to this out-of-family control.
        </p>
      )}
    </section>
  );
}

function InformationPanel({ row }: { row: PowerSurfaceRow }) {
  const coefficient = row.coefficientError;
  return (
    <section className="p-4">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#687680]">
        Information / coefficient loss
      </div>
      <div className="mt-4 grid grid-cols-2 gap-px bg-[#26333D]">
        <Metric label="Per-step KL" value={decimal(row.information.medianPerStepKl, 4)} />
        <Metric
          label="Information mass"
          value={decimal(row.information.medianInformationMass, 2)}
        />
        <Metric
          label="Full library error"
          value={coefficient ? decimal(coefficient.medianFullLibrary) : "—"}
        />
        <Metric
          label="Oracle-support error"
          value={coefficient ? decimal(coefficient.medianOracleSupport) : "—"}
        />
      </div>
      {coefficient ? (
        <div className="mt-3 space-y-1 font-mono text-[8px] uppercase text-[#75828B]">
          {Object.entries(coefficient.primaryFailureCounts)
            .filter(([, count]) => count > 0)
            .map(([label, count]) => (
              <div key={label} className="flex justify-between gap-3">
                <span>{label.replaceAll("_", " ")}</span>
                <span>
                  {count}/{row.runs}
                </span>
              </div>
            ))}
        </div>
      ) : null}
    </section>
  );
}

function TopologyWaterfall({ row }: { row: PowerSurfaceRow }) {
  const topology = row.topologyDecomposition;
  if (!topology) return null;
  const stages = [
    ["True drift", topology.trueDriftAccuracy],
    ["Oracle support", topology.oracleSupportAccuracy],
    ["Full SINDy field", topology.fullSindyFieldAccuracy],
    ["Certified SINDy", topology.certifiedSindyAccuracy],
  ] as const;
  return (
    <section className="border-t border-[#26333D] p-4">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#687680]">
        Basin / topology loss waterfall
      </div>
      <div className="mt-4 grid gap-px bg-[#26333D] sm:grid-cols-4">
        {stages.map(([label, value], index) => (
          <div key={label} className="relative bg-[#0A0D10] p-3">
            <div className="font-mono text-[7px] uppercase text-[#65727B]">{label}</div>
            <div className="mt-1 font-mono text-lg text-[#DCE2E6]">{percent(value)}</div>
            {index < stages.length - 1 ? (
              <span className="absolute -right-1.5 top-1/2 z-10 bg-[#0A0D10] text-[#66737D]">
                ›
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function FailureMicroscope({ artifact }: { artifact: FailureDecompositionArtifact }) {
  const initial = artifact.summary.estimatorLimitedCells[0] ?? artifact.surfaces[0]?.cellId ?? "";
  const [selectedCell, setSelectedCell] = useState(initial);
  const row =
    artifact.surfaces.find((item) => item.cellId === selectedCell) ?? artifact.surfaces[0];
  const complexity = useMemo(
    () =>
      artifact.sampleComplexity.find(
        (item) => item.family === row.family && item.effect === row.effect,
      ),
    [artifact.sampleComplexity, row.effect, row.family],
  );
  const counts = artifact.summary.classificationCounts;

  return (
    <section
      className="mt-3 border border-[#26333D] bg-[#0B0E11]"
      aria-labelledby="failure-microscope-title"
    >
      <header className="grid gap-4 border-b border-[#26333D] bg-[#090C0F] px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-[#B89442]">
            D0.3.2.1 · identifiability microscope
          </div>
          <h2 id="failure-microscope-title" className="mt-1 text-lg font-medium text-[#E0E5E8]">
            Localize where the information was lost.
          </h2>
          <p className="mt-2 max-w-4xl text-[11px] leading-5 text-[#7E8A94]">{artifact.question}</p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-[#26333D]">
          <Metric label="Data limited" value={String(counts.DATA_LIMITED)} />
          <Metric label="Estimator limited" value={String(counts.ESTIMATOR_LIMITED)} />
          <Metric label="Identifiable" value={String(counts.IDENTIFIABLE)} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-[#26333D] px-4 py-3">
        <label
          className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#697680]"
          htmlFor="failure-world"
        >
          World
        </label>
        <select
          id="failure-world"
          value={row.cellId}
          onChange={(event) => setSelectedCell(event.target.value)}
          className="min-w-[19rem] border border-[#34434E] bg-[#0A0D10] px-3 py-2 font-mono text-[9px] text-[#C9D1D6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9AE4F]"
        >
          {artifact.surfaces.map((item) => (
            <option key={item.cellId} value={item.cellId}>
              {item.cellId}
            </option>
          ))}
        </select>
        <span
          className={`border px-2 py-1 font-mono text-[8px] font-semibold ${CLASS_TONE[row.classification]}`}
        >
          {row.classification.replaceAll("_", " ")}
        </span>
        <span className="font-mono text-[8px] uppercase text-[#64717A]">
          N {row.observations} · {row.effectBand} · effect {row.effect.toFixed(2)}
        </span>
      </div>

      <div className="grid border-b border-[#26333D] xl:grid-cols-3">
        <DetectionPanel row={row} />
        <TermSpectrum row={row} />
        <InformationPanel row={row} />
      </div>

      <TopologyWaterfall row={row} />

      {complexity ? (
        <section className="border-t border-[#26333D] p-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#687680]">
            Approximate sample complexity / N80
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="font-mono text-[7px] uppercase text-[#66737D]">
                <tr className="border-b border-[#26333D]">
                  <th className="py-2 pr-4">Instrument</th>
                  <th className="px-3 py-2 text-right">N80</th>
                  <th className="px-3 py-2">Basis</th>
                  <th className="px-3 py-2 text-right">Efficiency vs oracle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D262D]">
                <N80Row label="Family oracle" estimate={complexity.oracle} ratio={1} />
                {Object.entries(complexity.practical).map(([id, estimate]) => (
                  <N80Row
                    key={id}
                    label={ESTIMATOR_LABELS[id] ?? id}
                    estimate={estimate}
                    ratio={complexity.sampleEfficiencyRatioVsOracle[id]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <footer className="border-t border-[#6A5424] bg-[#151108] px-4 py-4">
        <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#A78945]">
          D0.3.3 targeted repair{" "}
          {artifact.routing.targetedRepairWarranted ? "WARRANTED" : "NOT WARRANTED"} · new estimator
          NO · Hawkes DEFERRED
        </div>
        <p className="mt-2 max-w-5xl text-sm leading-6 text-[#E3C979]">
          {artifact.realMarketClaim.interpretation}
        </p>
        <div className="mt-2 font-mono text-[7px] uppercase text-[#75653F]">
          Real oracle {artifact.realMarketClaim.oracleClassification} · no rerun · parent{" "}
          {artifact.parentHash.slice(0, 16)}… · artifact {artifact.artifactHash.slice(0, 16)}…
        </div>
      </footer>
    </section>
  );
}

function N80Row({
  label,
  estimate,
  ratio,
}: {
  label: string;
  estimate: { display: string; method: string; extrapolated: boolean };
  ratio: number | null;
}) {
  return (
    <tr>
      <th className="py-2.5 pr-4 text-[10px] font-medium text-[#C8D0D5]" scope="row">
        {label}
      </th>
      <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#DDE3E6]">
        {estimate.display}
      </td>
      <td className="px-3 py-2.5 text-[9px] text-[#6F7C85]">
        {estimate.extrapolated ? "extrapolated · " : ""}
        {estimate.method}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[10px] text-[#91A0AA]">
        {ratio === null ? "—" : `${ratio.toFixed(1)}×`}
      </td>
    </tr>
  );
}
