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
            <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">
              Node {String(node.sequence).padStart(2, "0")}
            </div>
            <h2 className="mt-1.5 truncate text-[16px] font-semibold tracking-[-0.02em] text-[#E6E8EB]">
              {node.label}
            </h2>
            <div className="mt-1 truncate font-mono text-[8px] text-[#7f8993]" title={node.tool}>
              {node.tool}
            </div>
          </div>
          <StatusMark status={node.verifierState} label={`VERIFIER ${node.verifierState}`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <EpistemicBadge type={node.epistemicType} />
          {node.certificationLevel ? (
            <span className="border border-[#315d83] px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-[0.12em] text-[#52A8FF]">
              {node.certificationLevel}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-px border-b border-[#1D232B] bg-[#1D232B]">
        <InspectorDatum label="Tokens" value={node.tokens.toLocaleString()} />
        <InspectorDatum label="Cost" value={formatNodeCost(node.cost)} tone="amber" />
        <InspectorDatum label="Elapsed" value={formatNodeLatency(node.latency)} />
      </dl>

      <dl className="grid gap-2 border-b border-[#1D232B] p-3">
        <TextDatum label="Engine" value={node.engine} />
        <TextDatum label="Stage" value={node.stage ?? node.kind} />
        <TextDatum label="Status" value={node.status} />
        <TextDatum label="Cumulative" value={formatNodeLatency(node.cumulativeLatency)} />
      </dl>

      {node.metrics.length ? (
        <div
          className={`grid gap-px border-b border-[#1D232B] bg-[#1D232B] ${compact ? "grid-cols-2" : "sm:grid-cols-2"}`}
        >
          {node.metrics.map((metric) => (
            <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-3" />
          ))}
        </div>
      ) : (
        <div className="border-b border-[#1D232B] p-3 text-[11px] leading-5 text-[#65707c]">
          This action produced no numerical evidence fields.
        </div>
      )}

      <div className="border-b border-[#1D232B] p-3">
        <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">
          Bound checks
        </div>
        <ul className="mt-2 grid gap-1.5">
          {PRIMARY_CHECKS.map((check) => {
            const passed = run.verificationChecks[check];
            return (
              <li key={check} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[#9ba5af]">
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

      <div className="grid gap-2 p-3">
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
      <dt className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#59636e]">{label}</dt>
      <dd
        className={`mt-1 font-mono text-[10px] tabular-nums ${tone === "amber" ? "text-[#FFB000]" : "text-[#d8dde2]"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function TextDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-2">
      <dt className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#59636e]">{label}</dt>
      <dd className="truncate text-right font-mono text-[9px] text-[#c8cfd5]" title={value}>
        {value.replace("gpt-5.6-", "")}
      </dd>
    </div>
  );
}
