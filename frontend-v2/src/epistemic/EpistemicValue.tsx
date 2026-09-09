import type { EpistemicType, ResearchMetric } from "@/forge/contracts/observer";

const TONE: Record<EpistemicType, string> = {
  HISTORICAL: "text-slate-300 border-slate-600",
  COMPUTED: "text-[#52A8FF] border-[#315d83]",
  MODEL: "text-[#D8A43A] border-[#745f31]",
  FORECAST: "text-[#D8A43A] border-[#745f31]",
  COUNTERFACTUAL: "text-[#A67CFF] border-[#594589]",
  SIMULATED: "text-[#C889FF] border-[#6d477e]",
  UNAVAILABLE: "text-[#7B8490] border-[#3b424b]",
};

function formatMetric(metric: ResearchMetric): string {
  const value = metric.value.toLocaleString("en-US", {
    minimumFractionDigits: metric.precision,
    maximumFractionDigits: metric.precision,
  });
  if (metric.unit === "PERCENT") return `${value}%`;
  if (metric.unit === "USD") return `$${value}`;
  if (metric.unit === "SECONDS") return `${value}s`;
  return value;
}

export function EpistemicBadge({ type }: { type: EpistemicType }) {
  return (
    <span
      className={`inline-flex border px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-[0.12em] ${TONE[type]}`}
    >
      {type}
    </span>
  );
}

export function ResearchValue({
  metric,
  compact = false,
  className = "",
}: {
  metric: ResearchMetric;
  compact?: boolean;
  className?: string;
}) {
  const provenance = metric.provenance;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={compact ? "sr-only" : "text-[11px] text-[#7B8490]"}>{metric.label}</div>
      <div className="flex items-baseline gap-2">
        <output className="font-mono text-[15px] font-medium tabular-nums text-[#E6E8EB]">
          {formatMetric(metric)}
        </output>
        {!compact && <EpistemicBadge type={provenance.epistemicType} />}
      </div>
      <details className="group relative mt-1">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707c] transition-colors hover:text-[#52A8FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]">
          <span aria-hidden="true">↳</span>
          provenance
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-[min(23rem,80vw)] border border-[#27303a] bg-[#0B0E11] p-3 text-left shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 font-mono text-[9px] leading-relaxed">
            <ProvenanceRow label="Class" value={provenance.epistemicType} />
            <ProvenanceRow label="Source" value={provenance.source} />
            <ProvenanceRow label="Field" value={provenance.fieldPath} />
            <ProvenanceRow label="Schema" value={provenance.sourceSchemaVersion} />
            <ProvenanceRow label="Artifact" value={provenance.artifactHash} />
            {provenance.worldHash && <ProvenanceRow label="World" value={provenance.worldHash} />}
            {provenance.runHash && <ProvenanceRow label="Run" value={provenance.runHash} />}
            {provenance.seed !== null && provenance.seed !== undefined && (
              <ProvenanceRow label="Seed" value={String(provenance.seed)} />
            )}
            {provenance.evidenceHash && (
              <ProvenanceRow label="Evidence" value={provenance.evidenceHash} />
            )}
            {provenance.engine && <ProvenanceRow label="Engine" value={provenance.engine} />}
            {provenance.certificationLevel && (
              <ProvenanceRow label="Certification" value={provenance.certificationLevel} />
            )}
            {provenance.method && <ProvenanceRow label="Method" value={provenance.method} />}
          </dl>
        </div>
      </details>
    </div>
  );
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="uppercase tracking-[0.08em] text-[#65707c]">{label}</dt>
      <dd className="break-all text-[#d7dce1]">{value}</dd>
    </>
  );
}

export function HashValue({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 font-mono text-[10px] text-[#9ba5af]">
      <span className="uppercase tracking-[0.1em] text-[#59636e]">{label}</span>
      <span className="truncate" title={value}>
        {value.slice(0, 12)}…
      </span>
    </span>
  );
}
