import { EpistemicBadge, HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import type {
  RealityTerrainStage,
  RealityTerrainViewModel,
} from "@/forge/reality/reality-terrain-model";
import { formatRealityMetric } from "@/forge/reality/reality-terrain-model";
import { StatusMark } from "@/forge/shared/SurfacePrimitives";

function whyStageMatters(stage: RealityTerrainStage, model: RealityTerrainViewModel): string {
  if (stage.id === "L4_COUNTERFACTUAL_STRESS") {
    return `${model.largestDegradation.label} is the largest measured source of degradation.`;
  }
  if (stage.id === "L1_VECTORBT") {
    return "This certified VectorBT screen establishes the reference performance for the measured Reality Gap.";
  }
  if (stage.deltaFromPrior?.value === 0) {
    return `The ${stage.checkpointLabel.toLowerCase()} preserved the prior measured ${model.metricLabel.toLowerCase()}.`;
  }
  return `This checkpoint changed measured ${model.metricLabel.toLowerCase()} by ${formatRealityMetric(stage.deltaFromPrior ?? stage.cumulativeDecay, true)} from the prior stage.`;
}

export function RealityEvidenceInspector({
  model,
  stage,
}: {
  model: RealityTerrainViewModel;
  stage: RealityTerrainStage;
}) {
  const counterfactual = stage.id === "L4_COUNTERFACTUAL_STRESS";

  return (
    <aside aria-label="Selected Reality Terrain evidence" aria-live="polite" className="min-w-0">
      <div
        className={`border-b p-4 ${counterfactual ? "border-[#572E31] bg-[#120D0E]" : "border-[#1D232B]"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${counterfactual ? "text-[#FF6C68]" : "text-[#FFB000]"}`}
            >
              {counterfactual ? "Counterfactual stress" : stage.label}
            </div>
            <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-[#E6E8EB]">
              {stage.checkpointLabel}
            </h2>
          </div>
          <StatusMark status="INFO" label={stage.realityLevel.replace(/^L\d_/, "")} />
        </div>
        <p className="mt-3 text-[12px] leading-5 text-[#A9B2BA]">{whyStageMatters(stage, model)}</p>
      </div>

      <div className="grid grid-cols-3 gap-px border-b border-[#1D232B] bg-[#1D232B]">
        <ResearchValue metric={stage.value} className="bg-[#0B0E11] p-3" />
        {stage.deltaFromPrior ? (
          <ResearchValue metric={stage.deltaFromPrior} className="bg-[#0B0E11] p-3" />
        ) : (
          <div className="bg-[#0B0E11] p-3">
            <div className="text-[11px] text-[#7B8490]">Change from prior</div>
            <div className="mt-1 font-mono text-[15px] text-[#65707C]">—</div>
          </div>
        )}
        <ResearchValue metric={stage.alphaSurvival} className="bg-[#0B0E11] p-3" />
      </div>

      {counterfactual ? (
        <div className="border-b border-[#572E31] bg-[#100B0C] p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8F5B5D]">
            Largest source of degradation
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-medium text-[#E0C7C7]">
              {model.largestDegradation.label}
            </span>
            <span className="font-mono text-[15px] font-semibold tabular-nums text-[#FF5A57]">
              {formatRealityMetric(model.largestDegradation.change, true)}
            </span>
          </div>
        </div>
      ) : null}

      <dl className="grid gap-2.5 border-b border-[#1D232B] p-3">
        <TextDatum label="Engine" value={stage.engine} />
        <TextDatum label="Stage" value={stage.realityLevel} />
        <TextDatum
          label="Cert"
          value={stage.certificationLevel ?? "UNAVAILABLE"}
          tone={stage.certificationLevel ? "blue" : "muted"}
        />
      </dl>

      <div className="grid grid-cols-3 gap-px border-b border-[#1D232B] bg-[#1D232B]">
        {[stage.slippage, stage.latencyCost, stage.runtime].map((metric) => (
          <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-3" />
        ))}
      </div>

      <div className="border-b border-[#1D232B] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#65707C]">
            Evidence class
          </span>
          <EpistemicBadge type={stage.value.provenance.epistemicType} />
        </div>
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-2 font-mono text-[9px] leading-4">
          <dt className="uppercase tracking-[0.08em] text-[#59636E]">Field</dt>
          <dd className="break-all text-right text-[#B8C0C7]">
            {stage.value.provenance.fieldPath}
          </dd>
          <dt className="uppercase tracking-[0.08em] text-[#59636E]">Method</dt>
          <dd className="break-all text-right text-[#B8C0C7]">{stage.value.provenance.method}</dd>
        </dl>
      </div>

      <div className="grid gap-2.5 p-3">
        <HashValue label="artifact" value={model.artifactHash} />
        {stage.certificationHash ? (
          <HashValue label="engine cert" value={stage.certificationHash} />
        ) : null}
        {model.certificationArtifactHash ? (
          <HashValue label="cert source" value={model.certificationArtifactHash} />
        ) : null}
      </div>
    </aside>
  );
}

function TextDatum({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "blue" | "muted";
}) {
  const color =
    tone === "blue" ? "text-[#52A8FF]" : tone === "muted" ? "text-[#65707C]" : "text-[#D8DDE2]";
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#65707C]">{label}</dt>
      <dd
        className={`truncate text-right font-mono text-[10px] font-medium ${color}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
