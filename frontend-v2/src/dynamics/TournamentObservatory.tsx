import { useMemo, useState } from "react";
import type { TournamentArtifact, TournamentSummary } from "@/dynamics/tournament-contracts";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function decimal(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

function shortLabel(estimatorId: string): string {
  return estimatorId.replace("EST-", "").replace("-D032", "").replace("-D03", "");
}

function Gate({ passed }: { passed: boolean }) {
  return (
    <span
      className={`font-mono text-[8px] font-semibold ${passed ? "text-[#70D6A0]" : "text-[#D47B70]"}`}
    >
      {passed ? "PASS" : "MISS"}
    </span>
  );
}

function SummaryRow({ row, graduated }: { row: TournamentSummary; graduated: boolean }) {
  return (
    <tr className="border-t border-[#1D232B] hover:bg-[#0E1318]">
      <th className="sticky left-0 bg-[#0B0E11] px-3 py-3 text-left" scope="row">
        <div className="text-[11px] font-medium text-[#D7DDE1]">{row.label}</div>
        <div className="mt-1 font-mono text-[7px] text-[#5E6B75]">{row.estimatorId}</div>
      </th>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#B7C2CA]">
        {percent(row.linearSpecificity)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#E2C26E]">
        {percent(row.nonlinearDetectionRate)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#B7C2CA]">
        {percent(row.stateDiffusionDetectionRate)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#D9988F]">
        {percent(row.falseNonlinearDiscoveryRate)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#B7C2CA]">
        {percent(row.basinPrecision)} / {percent(row.basinRecall)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#B7C2CA]">
        {percent(row.potentialTopologyAccuracy)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#8E9AA3]">
        {decimal(row.medianDriftReconstructionError)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#8E9AA3]">
        {decimal(row.medianDiffusionReconstructionError)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#8E9AA3]">
        {decimal(row.meanSealedOosNll)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#8E9AA3]">
        {row.meanCalibrationError90 === null ? "—" : percent(row.meanCalibrationError90)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#8E9AA3]">
        {decimal(row.medianRuntimeWorkUnits, 0)}
      </td>
      <td className="px-3 py-3 text-right font-mono text-[10px] text-[#8E9AA3]">
        {percent(row.numericalFailureRate)}
      </td>
      <td className="px-3 py-3 text-right">
        <Gate passed={graduated} />
      </td>
    </tr>
  );
}

export function TournamentObservatory({ artifact }: { artifact: TournamentArtifact }) {
  const [selectedEstimator, setSelectedEstimator] = useState(
    artifact.summaries[0]?.estimatorId ?? "",
  );
  const graduation = useMemo(
    () => new Map(artifact.graduation.map((row) => [row.estimatorId, row])),
    [artifact.graduation],
  );
  const envelope = artifact.envelopes[selectedEstimator];
  const sindy = artifact.summaries.find((row) => row.estimatorId === "EST-SINDY-D032")?.lawRecovery;
  const graduated = artifact.graduation.filter((row) => row.graduated);

  return (
    <section
      className="mt-3 border border-[#26333D] bg-[#0B0E11]"
      aria-labelledby="tournament-title"
    >
      <header className="grid gap-4 border-b border-[#26333D] bg-[#090C0F] px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-[#B89442]">
            D0.3.2 · estimator tournament
          </div>
          <h2 id="tournament-title" className="mt-1 text-lg font-medium text-[#E0E5E8]">
            Same worlds. Different instruments. No winner score.
          </h2>
          <p className="mt-2 max-w-4xl text-[11px] leading-5 text-[#7E8A94]">{artifact.question}</p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[8px] uppercase">
          <span className="border border-[#31414D] px-2 py-1 text-[#9AA7B0]">
            {artifact.worlds} worlds
          </span>
          <span className="border border-[#31414D] px-2 py-1 text-[#9AA7B0]">
            {artifact.fits} fits
          </span>
          <span className="border border-[#735C25] bg-[#171208] px-2 py-1 text-[#E0B857]">
            aggregate winner prohibited
          </span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1540px] border-collapse">
          <thead className="bg-[#0A0D10] font-mono text-[7px] uppercase tracking-[0.08em] text-[#66737D]">
            <tr>
              <th className="sticky left-0 bg-[#0A0D10] px-3 py-2.5 text-left font-medium">
                Estimator
              </th>
              <th className="px-3 py-2.5 text-right font-medium">Specificity</th>
              <th className="px-3 py-2.5 text-right font-medium">Nonlinear</th>
              <th className="px-3 py-2.5 text-right font-medium">State diff.</th>
              <th className="px-3 py-2.5 text-right font-medium">False NL</th>
              <th className="px-3 py-2.5 text-right font-medium">Basin P / R</th>
              <th className="px-3 py-2.5 text-right font-medium">Topology</th>
              <th className="px-3 py-2.5 text-right font-medium">Drift err.</th>
              <th className="px-3 py-2.5 text-right font-medium">Diff. err.</th>
              <th className="px-3 py-2.5 text-right font-medium">OOS NLL</th>
              <th className="px-3 py-2.5 text-right font-medium">Calib. err.</th>
              <th className="px-3 py-2.5 text-right font-medium">Work</th>
              <th className="px-3 py-2.5 text-right font-medium">Failures</th>
              <th className="px-3 py-2.5 text-right font-medium">Graduation</th>
            </tr>
          </thead>
          <tbody>
            {artifact.summaries.map((row) => (
              <SummaryRow
                key={row.estimatorId}
                row={row}
                graduated={graduation.get(row.estimatorId)?.graduated ?? false}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid border-t border-[#26333D] xl:grid-cols-[1.4fr_1fr]">
        <div className="border-b border-[#26333D] xl:border-b-0 xl:border-r">
          <div className="border-b border-[#1D232B] px-4 py-3">
            <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#697680]">
              Estimator-specific identifiability envelope
            </div>
            <nav className="mt-3 flex flex-wrap gap-1" aria-label="Estimator envelope">
              {artifact.summaries.map((row) => (
                <button
                  key={row.estimatorId}
                  type="button"
                  onClick={() => setSelectedEstimator(row.estimatorId)}
                  aria-pressed={selectedEstimator === row.estimatorId}
                  className={`border px-2.5 py-1.5 font-mono text-[8px] uppercase ${selectedEstimator === row.estimatorId ? "border-[#E1B454] bg-[#E1B454] text-[#090C0F]" : "border-[#2B3842] text-[#8C99A2] hover:text-[#D8DEE2]"}`}
                >
                  {shortLabel(row.estimatorId)}
                </button>
              ))}
            </nav>
          </div>
          <div className="grid gap-px bg-[#1D232B] md:grid-cols-2">
            {(["nonlinearDrift", "stateDependentDiffusion"] as const).map((key) => (
              <div key={key} className="bg-[#0B0E11] p-4">
                <div className="font-mono text-[8px] uppercase text-[#697680]">
                  {key === "nonlinearDrift" ? "Cubic drift" : "State diffusion"}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1">
                  {(envelope?.[key] ?? []).map((row) => (
                    <div
                      key={`${row.effect}-${row.observations}`}
                      className={`border px-2 py-2 ${row.identifiable ? "border-[#345C48] bg-[#0C1712]" : "border-[#2A333A] bg-[#0A0D10]"}`}
                    >
                      <div className="font-mono text-[10px] text-[#C9D1D6]">
                        {percent(row.correctSelectionProbability)}
                      </div>
                      <div className="mt-1 font-mono text-[7px] uppercase text-[#66727C]">
                        e {row.effect.toFixed(2)} · n {row.observations}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="border-b border-[#1D232B] p-4">
            <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#697680]">
              SINDy law recovery
            </div>
            {sindy ? (
              <div className="mt-3 grid grid-cols-2 gap-px bg-[#1D232B]">
                {[
                  ["Term precision", percent(sindy.meanTermPrecision)],
                  ["Term recall", percent(sindy.meanTermRecall)],
                  ["Coefficient error", sindy.medianCoefficientError.toFixed(3)],
                  ["Structural match", percent(sindy.structuralEquationMatchRate)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[#0A0D10] p-3">
                    <div className="font-mono text-[7px] uppercase text-[#63707A]">{label}</div>
                    <div className="mt-1 font-mono text-base text-[#D9E0E4]">{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[10px] text-[#6C7881]">
                No law-recovery ledger was produced.
              </p>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#697680]">
                Hard promotion gate
              </div>
              <span
                className={`font-mono text-[8px] font-semibold ${graduated.length ? "text-[#70D6A0]" : "text-[#D7A94F]"}`}
              >
                {graduated.length ? `${graduated.length} GRADUATED` : "NO GRADUATION"}
              </span>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-[#8B969E]">
              Material nonlinear sensitivity must improve while specificity and false-structure
              control survive. Each axis remains visible; nothing is collapsed into a leaderboard
              score.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-[#6A5424] bg-[#151108] px-4 py-4">
        <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#A78945]">
          Real-market boundary · {artifact.realMarketClaim.selectedModel} /{" "}
          {artifact.realMarketClaim.marketClaim}
        </div>
        <p className="mt-2 max-w-5xl text-sm leading-6 text-[#E3C979]">
          {artifact.realMarketClaim.interpretation}
        </p>
        <div className="mt-2 font-mono text-[7px] uppercase text-[#75653F]">
          No rerun · parent {artifact.parentHash.slice(0, 16)}… · artifact{" "}
          {artifact.artifactHash.slice(0, 16)}…
        </div>
      </div>
    </section>
  );
}
