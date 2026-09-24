import { useMemo, useState } from "react";
import type {
  RecoveryRocPoint,
  RepairCase,
  TargetedRecoveryArtifact,
} from "@/dynamics/recovery-contracts";

type Family = "double_well" | "state_diffusion";

function percent(value: number | null, digits = 1): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(digits)}%`;
}

function decimal(value: number | null, digits = 3): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function label(code: string): string {
  return code.replaceAll("_", " ");
}

function Stat({
  title,
  value,
  note,
  tone = "neutral",
}: {
  title: string;
  value: string;
  note?: string;
  tone?: "neutral" | "pass" | "fail";
}) {
  const color =
    tone === "pass" ? "text-[#64C892]" : tone === "fail" ? "text-[#E28272]" : "text-[#DDE3E7]";
  return (
    <div className="min-h-24 bg-[#090C0F] px-3 py-3">
      <div className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#68757E]">{title}</div>
      <div className={`mt-2 font-mono text-xl tabular-nums ${color}`}>{value}</div>
      {note ? <div className="mt-1 text-[9px] leading-4 text-[#6D7982]">{note}</div> : null}
    </div>
  );
}

function Waterfall({ artifact, family }: { artifact: TargetedRecoveryArtifact; family: Family }) {
  const source =
    family === "double_well" ? artifact.waterfall.doubleWell : artifact.waterfall.stateDiffusion;
  const entries =
    family === "double_well"
      ? [
          ["Oracle support", source.oracle_support_topology],
          ["Field topology", source.field_topology],
          ["Root clustering", source.root_clustering],
          ["Stability support", source.stability_support],
          ["Before certification", source.certification_before],
          ["After certification", source.certification_after],
        ]
      : [
          ["Oracle power", source.oracle_power],
          ["Variance signal", source.variance_signal],
          ["g(x) reconstruction", source.g_reconstruction],
          ["Before certification", source.certification_before],
          ["After certification", source.certification_after],
        ];
  return (
    <div className="grid gap-px bg-[#24313A] sm:grid-cols-3 xl:grid-cols-6">
      {entries.map(([name, value]) => (
        <Stat key={name} title={String(name)} value={percent((value as number | null) ?? null)} />
      ))}
    </div>
  );
}

function RootPersistence({ selected }: { selected: RepairCase }) {
  const repair = selected.topologyRepair;
  if (!repair) return null;
  return (
    <section className="border-r border-[#24313A] p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-[#DCE2E6]">Root persistence certificate</h3>
          <p className="mt-1 text-[10px] leading-4 text-[#74818A]">
            Ordered clusters are evaluated as stable, unstable, stable before the holdout gate.
          </p>
        </div>
        <span className="font-mono text-lg tabular-nums text-[#D9AE4F]">
          {percent(repair.certificateScore)}
        </span>
      </div>
      <div className="mt-4 grid gap-px bg-[#24313A]">
        {repair.rootCertificate.length ? (
          repair.rootCertificate.map((root) => (
            <div
              key={root.clusterId}
              className="grid gap-3 bg-[#090C0F] px-3 py-3 sm:grid-cols-[5rem_7rem_7rem_5rem_1fr] sm:items-center"
            >
              <div>
                <div className="font-mono text-[7px] uppercase text-[#68757E]">Topology</div>
                <div className={root.stable ? "mt-1 text-[#64C892]" : "mt-1 text-[#D9AE4F]"}>
                  {root.stable ? "STABLE" : "UNSTABLE"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[7px] uppercase text-[#68757E]">Location</div>
                <div className="mt-1 font-mono tabular-nums text-[#DCE2E6]">
                  {root.location.toFixed(3)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[7px] uppercase text-[#68757E]">95% CI</div>
                <div className="mt-1 font-mono text-[9px] tabular-nums text-[#AAB4BB]">
                  {root.locationCi95[0].toFixed(2)} to {root.locationCi95[1].toFixed(2)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[7px] uppercase text-[#68757E]">Support</div>
                <div className="mt-1 font-mono tabular-nums text-[#DCE2E6]">
                  {percent(root.persistence, 0)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[7px] uppercase text-[#68757E]">Derivative</div>
                  <div className="mt-1 font-mono text-[9px] text-[#AAB4BB]">
                    {root.derivativeMedian.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[7px] uppercase text-[#68757E]">Data support</div>
                  <div className="mt-1 font-mono text-[9px] text-[#AAB4BB]">
                    {root.dataSupport} / {root.occupancyCount}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-[#090C0F] px-3 py-5 text-[10px] text-[#7A8790]">
            No S-U-S root certificate survived the locked operating point in this world.
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-px bg-[#24313A]">
        <Stat title="Sign topology" value={percent(repair.signTopologySupport)} />
        <Stat title="Barrier support" value={percent(repair.barrierSupport)} />
        <Stat title="Holdout NLL gain" value={decimal(repair.holdoutGain, 4)} />
      </div>
    </section>
  );
}

function DiffusionExtraction({ selected }: { selected: RepairCase }) {
  const repair = selected.diffusionRepair;
  if (!repair) return null;
  return (
    <section className="border-r border-[#24313A] p-4">
      <h3 className="text-sm font-medium text-[#DCE2E6]">Conditional variance extraction</h3>
      <p className="mt-1 text-[10px] leading-4 text-[#74818A]">
        Drift is cross-fitted before positive log diffusion is learned from normalized innovations.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-px bg-[#24313A]">
        <Stat title="Twice log LR" value={decimal(repair.twiceLogLikelihoodRatio, 2)} />
        <Stat title="Bootstrap dominance" value={percent(repair.bootstrapDominance)} />
        <Stat title="g max/min" value={`${repair.diffusionRatio.toFixed(2)}x`} />
        <Stat
          title="g reconstruction error"
          value={decimal(repair.reconstructionError, 3)}
          tone={repair.reconstructionPassed ? "pass" : "fail"}
        />
      </div>
      <div className="mt-3 border border-[#24313A] bg-[#090C0F] px-3 py-3 font-mono text-[9px] text-[#8D99A2]">
        Variance signal {repair.varianceSignal ? "PRESENT" : "ABSENT"}. Reconstruction gate{" "}
        {repair.reconstructionPassed ? "PASS" : "FAIL"}.
      </div>
    </section>
  );
}

function RocTable({
  title,
  rows,
  locked,
}: {
  title: string;
  rows: RecoveryRocPoint[];
  locked: number;
}) {
  return (
    <section className="p-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-[#DCE2E6]">{title}</h3>
        <span className="font-mono text-[8px] uppercase text-[#D9AE4F]">Locked {locked}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead className="font-mono text-[7px] uppercase text-[#68757E]">
            <tr className="border-b border-[#24313A]">
              <th className="py-2 pr-3">Threshold</th>
              <th className="px-3 py-2 text-right">Development recall</th>
              <th className="pl-3 py-2 text-right">False discovery</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.threshold}
                className={
                  row.threshold === locked ? "bg-[#171309] text-[#E4C36F]" : "text-[#AAB4BB]"
                }
              >
                <td className="py-2 pr-3 font-mono text-[9px]">{row.threshold}</td>
                <td className="px-3 py-2 text-right font-mono text-[9px]">{percent(row.recall)}</td>
                <td className="pl-3 py-2 text-right font-mono text-[9px]">
                  {percent(row.falseDiscovery)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GateMatrix({ artifact }: { artifact: TargetedRecoveryArtifact }) {
  return (
    <section className="p-4">
      <h3 className="text-sm font-medium text-[#DCE2E6]">Confirmation promotion gates</h3>
      <div className="mt-3 grid gap-px bg-[#24313A] sm:grid-cols-2">
        {Object.entries(artifact.graduationChecks).map(([name, passed]) => (
          <div
            key={name}
            className="flex items-center justify-between gap-3 bg-[#090C0F] px-3 py-2.5"
          >
            <span className="font-mono text-[8px] uppercase text-[#7A8790]">{label(name)}</span>
            <span
              className={`font-mono text-[8px] font-semibold ${passed ? "text-[#64C892]" : "text-[#E28272]"}`}
            >
              {passed ? "PASS" : "FAIL"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RepairMicroscope({ artifact }: { artifact: TargetedRecoveryArtifact }) {
  const [family, setFamily] = useState<Family>("double_well");
  const familyCases = useMemo(
    () => artifact.cases.filter((row) => row.role === family),
    [artifact.cases, family],
  );
  const [selectedId, setSelectedId] = useState("");
  const selected = familyCases.find((row) => row.cellId === selectedId) ?? familyCases[0];
  const metrics = artifact.metrics;
  const attrition = artifact.waterfall.doubleWell.certification_attrition_after ?? null;

  return (
    <section className="mt-3 border border-[#24313A] bg-[#0B0E11]" aria-labelledby="repair-title">
      <header className="grid gap-4 border-b border-[#24313A] bg-[#090C0F] px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#D9AE4F]">
            D0.3.3 targeted nonlinear recovery
          </div>
          <h2 id="repair-title" className="mt-1 text-lg font-medium text-[#E1E6E9]">
            Repair the instrument. Preserve the controls.
          </h2>
          <p className="mt-2 max-w-4xl text-[11px] leading-5 text-[#7E8A93]">{artifact.question}</p>
        </div>
        <div className="border border-[#703B34] bg-[#180D0C] px-4 py-3 text-right">
          <div className="font-mono text-[7px] uppercase tracking-[0.12em] text-[#9F6B63]">
            Confirmation decision
          </div>
          <div className="mt-1 font-mono text-base font-semibold text-[#E28272]">
            {artifact.graduationDecision.replaceAll("_", " ")}
          </div>
          <div className="mt-1 font-mono text-[8px] text-[#9D7A74]">
            {artifact.capabilityStatus.replaceAll("_", " ")}
          </div>
        </div>
      </header>

      <div className="grid gap-px border-b border-[#24313A] bg-[#24313A] sm:grid-cols-2 xl:grid-cols-6">
        <Stat
          title="Linear specificity"
          value={percent(metrics.linearSpecificity)}
          tone={metrics.linearSpecificity >= 0.95 ? "pass" : "fail"}
        />
        <Stat
          title="False nonlinear"
          value={percent(metrics.falseNonlinearDiscoveryRate)}
          tone={metrics.falseNonlinearDiscoveryRate <= 0.05 ? "pass" : "fail"}
        />
        <Stat
          title="False basin"
          value={percent(metrics.falseBasinDiscoveryRate)}
          tone={metrics.falseBasinDiscoveryRate <= 0.05 ? "pass" : "fail"}
        />
        <Stat
          title="Double-well detection"
          value={percent(metrics.doubleWellDetection)}
          tone={metrics.doubleWellDetection >= 0.8 ? "pass" : "fail"}
        />
        <Stat
          title="State diffusion"
          value={percent(metrics.stateDiffusionDetection)}
          tone={metrics.stateDiffusionDetection >= 0.8 ? "pass" : "fail"}
        />
        <Stat title="Certification attrition" value={percent(attrition)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#24313A] px-4 py-3">
        {(["double_well", "state_diffusion"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setFamily(item);
              setSelectedId("");
            }}
            aria-pressed={family === item}
            className={`border px-3 py-2 font-mono text-[8px] font-semibold uppercase transition-colors active:translate-y-px ${
              family === item
                ? "border-[#D9AE4F] bg-[#D9AE4F] text-[#090C0F]"
                : "border-[#34434E] bg-[#090C0F] text-[#95A1A9] hover:text-[#DCE2E6]"
            }`}
          >
            {item === "double_well" ? "Double well" : "State diffusion"}
          </button>
        ))}
        <label
          htmlFor="repair-world"
          className="ml-2 font-mono text-[8px] uppercase text-[#68757E]"
        >
          Confirmation world
        </label>
        <select
          id="repair-world"
          value={selected?.cellId ?? ""}
          onChange={(event) => setSelectedId(event.target.value)}
          className="min-w-[18rem] border border-[#34434E] bg-[#090C0F] px-3 py-2 font-mono text-[9px] text-[#C9D1D6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9AE4F]"
        >
          {familyCases.map((row) => (
            <option key={row.cellId} value={row.cellId}>
              {row.cellId}
            </option>
          ))}
        </select>
        {selected ? (
          <span className="font-mono text-[8px] uppercase text-[#68757E]">
            N {selected.truth.observations} /{" "}
            {selected.after.topologyCertified || selected.after.stateDiffusionCertified
              ? "CERTIFIED"
              : "WITHHELD"}
          </span>
        ) : null}
      </div>

      <Waterfall artifact={artifact} family={family} />

      {selected ? (
        <div className="grid border-b border-[#24313A] xl:grid-cols-[1.25fr_.75fr]">
          {family === "double_well" ? (
            <RootPersistence selected={selected} />
          ) : (
            <DiffusionExtraction selected={selected} />
          )}
          <GateMatrix artifact={artifact} />
        </div>
      ) : null}

      <div className="grid border-b border-[#24313A] xl:grid-cols-2">
        <RocTable
          title="Basin verifier ROC"
          rows={artifact.topologyRoc}
          locked={artifact.lockedTopologyPersistence}
        />
        <div className="border-t border-[#24313A] xl:border-l xl:border-t-0">
          <RocTable
            title="State diffusion verifier ROC"
            rows={artifact.diffusionRoc}
            locked={artifact.lockedDiffusionLlr}
          />
        </div>
      </div>

      <section className="grid gap-px border-b border-[#24313A] bg-[#24313A] sm:grid-cols-2">
        {Object.entries(artifact.historical).map(([cell, result]) => (
          <div key={cell} className="bg-[#090C0F] px-4 py-4">
            <div className="font-mono text-[8px] uppercase text-[#68757E]">
              Historical audit / {cell}
            </div>
            <div className="mt-3 flex items-baseline gap-4 font-mono tabular-nums">
              <span className="text-[#7F8B94]">{percent(result.before)}</span>
              <span className="text-[#56616A]">to</span>
              <span className="text-xl text-[#64C892]">{percent(result.after)}</span>
            </div>
            <div className="mt-1 text-[9px] text-[#68757E]">
              Audited after confirmation. Never used for threshold selection.
            </div>
          </div>
        ))}
      </section>

      <footer className="bg-[#151108] px-4 py-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#A78945]">
              Claim boundary
            </div>
            <p className="mt-1 max-w-5xl text-[11px] leading-5 text-[#C8AD6D]">
              {artifact.realMarketClaim.interpretation} The market result remains{" "}
              {artifact.realMarketClaim.selectedModel} / {artifact.realMarketClaim.marketClaim}; no
              rerun was performed.
            </p>
          </div>
          <div className="font-mono text-[8px] uppercase text-[#8E7948]">
            Hawkes {artifact.routing.hawkesEligible ? "ELIGIBLE" : "DEFERRED"}
          </div>
        </div>
      </footer>
    </section>
  );
}
