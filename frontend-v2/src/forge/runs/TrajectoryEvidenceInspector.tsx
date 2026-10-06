import { EpistemicBadge, HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import type { RunDetail } from "@/forge/contracts/observer";
import type { TrajectoryNode } from "@/forge/runs/trajectory-model";
import { formatNodeCost, formatNodeLatency } from "@/forge/runs/trajectory-model";
import { StatusMark } from "@/forge/shared/SurfacePrimitives";

const PRIMARY_CHECKS = [
  "artifact_binding",
  "trajectory_actions",
  "required_evidence",
  "decision_binding",
] as const;

function nodeImpact(run: RunDetail, node: TrajectoryNode): string {
  if (node.kind === "DECISION") {
    return run.decision?.reason ?? "The frozen trajectory contains no bound decision reason.";
  }
  if (node.metrics.length > 0) {
    return `This action recorded ${node.metrics.map((metric) => metric.label).join(", ")} as numerical evidence for the next decision state.`;
  }
  if (node.evidenceHash) {
    return `This action bound ${node.engine} output to evidence ${node.evidenceHash.slice(0, 12)}…`;
  }
  return "This frozen action advances the recorded trajectory without a numerical evidence field.";
}

export function TrajectoryEvidenceInspector({
  run,
  node,
  compact = false,
}: {
  run: RunDetail;
  node: TrajectoryNode;
  compact?: boolean;
}) {
  return (
    <aside aria-label="Selected node evidence" aria-live="polite" className="min-w-0">
      <div className="border-b border-[#1D232B] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#71808C]">
              Node {String(node.sequence).padStart(2, "0")}
            </div>
            <h2 className="mt-1.5 truncate text-[17px] font-semibold tracking-[-0.02em] text-[#E6E8EB]">
              {node.label}
            </h2>
            <div className="mt-1 truncate font-mono text-[9px] text-[#8C97A1]" title={node.tool}>
              {node.tool}
            </div>
          </div>
          <StatusMark status={node.verifierState} label={`VERIFIER ${node.verifierState}`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <EpistemicBadge type={node.epistemicType} />
          {node.certificationLevel ? (
            <span className="border border-[#315D83] px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.12em] text-[#52A8FF]">
              {node.certificationLevel}
            </span>
          ) : null}
        </div>
      </div>

      {node.metrics.length ? (
        <div
          className={`grid gap-px border-b border-[#1D232B] bg-[#1D232B] ${compact ? "grid-cols-2" : "sm:grid-cols-2"}`}
        >
          {node.metrics.map((metric) => (
            <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-3" />
          ))}
        </div>
      ) : null}

      <section
        className="border-b border-[#1D232B] bg-[#0A0F13] p-3"
        aria-label="Why this node mattered"
      >
        <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#52A8FF]">
          Why this node mattered
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-[#AEB7BF]">{nodeImpact(run, node)}</p>
      </section>

      <dl className="grid grid-cols-3 gap-px border-b border-[#1D232B] bg-[#1D232B]">
        <InspectorDatum label="Tokens" value={node.tokens.toLocaleString()} />
        <InspectorDatum label="Cost" value={formatNodeCost(node.cost)} tone="amber" />
        <InspectorDatum label="Elapsed" value={formatNodeLatency(node.latency)} />
      </dl>

      <dl className="grid gap-2.5 border-b border-[#1D232B] p-3">
        <TextDatum label="Engine" value={node.engine} />
        <TextDatum label="Stage" value={node.stage ?? node.kind} />
        <TextDatum label="Status" value={node.status} />
        <TextDatum label="Cumulative" value={formatNodeLatency(node.cumulativeLatency)} />
      </dl>

      {!node.metrics.length ? (
        <div className="border-b border-[#1D232B] p-3 text-[11px] leading-5 text-[#71808C]">
          This action produced no numerical evidence fields.
        </div>
      ) : null}

      <div className="border-b border-[#1D232B] p-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#71808C]">
          Bound checks
        </div>
        <ul className="mt-2 grid gap-2">
          {PRIMARY_CHECKS.map((check) => {
            const passed = run.verificationChecks[check];
            return (
              <li key={check} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#AAB3BB]">
                  {check.replaceAll("_", " ")}
                </span>
                <span
                  className={passed ? "text-[#35C78A]" : "text-[#FF5A57]"}
                  aria-label={passed ? "passed" : "failed"}
                >
                  {passed ? "◆" : "×"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-2.5 p-3">
        <HashValue label="result" value={node.resultHash} />
        {node.evidenceHash ? <HashValue label="evidence" value={node.evidenceHash} /> : null}
        <HashValue label="world" value={run.worldHash} />
      </div>
    </aside>
  );
}

function InspectorDatum({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber";
}) {
  return (
    <div className="bg-[#0B0E11] p-2.5">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#65707C]">{label}</dt>
      <dd
        className={`mt-1 font-mono text-[11px] font-medium tabular-nums ${tone === "amber" ? "text-[#FFB000]" : "text-[#D8DDE2]"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function TextDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#65707C]">{label}</dt>
      <dd
        className="truncate text-right font-mono text-[10px] font-medium text-[#C8CFD5]"
        title={value}
      >
        {value.replace("gpt-5.6-", "")}
      </dd>
    </div>
  );
}
