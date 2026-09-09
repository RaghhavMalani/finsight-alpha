import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import type { RunDetail } from "@/forge/contracts/observer";
import { runQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { TrajectoryEvidenceInspector } from "@/forge/runs/TrajectoryEvidenceInspector";
import { TrajectoryExplorer } from "@/forge/runs/TrajectoryExplorer";
import { buildTrajectoryViewModel } from "@/forge/runs/trajectory-model";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

type ObserverTab = "action" | "turns" | "checks";

export function RunObserver({
  runId,
  node,
  tab,
}: {
  runId: string;
  node: number;
  tab: ObserverTab;
}) {
  const query = useQuery(runQuery(runId));
  const navigate = useNavigate();

  if (query.isPending) {
    return (
      <ForgeShell>
        <LoadingState label="run observer" />
      </ForgeShell>
    );
  }
  if (query.error || !query.data) {
    return (
      <ForgeShell>
        <UnavailableState
          title="Run projection could not be validated"
          error={query.error}
          retry={() => void query.refetch()}
        />
      </ForgeShell>
    );
  }

  const run = query.data;
  const trajectory = buildTrajectoryViewModel(run);
  const selectedNode =
    trajectory.nodes.find((item) => item.sequence === node) ?? trajectory.nodes[0];

  if (!selectedNode) {
    return (
      <ForgeShell>
        <UnavailableState
          title="Run has no observable actions"
          error={new Error("The frozen trajectory action list is empty.")}
        />
      </ForgeShell>
    );
  }

  const selectNode = (sequence: number) => {
    void navigate({
      to: "/runs/$runId",
      params: { runId },
      search: { node: sequence, tab: "action" },
    });
  };

  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow={`Run · ${run.taskId} · ${run.taskClass.replaceAll("_", " ")}`}
        title={`${run.model.replace("gpt-5.6-", "")} · ${run.decision?.verdict ?? "trajectory"}`}
        description={run.hypothesis ?? "No hypothesis was projected from this frozen trajectory."}
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusMark status={verdictStatus(run.decision?.verdict)} />
            <StatusMark
              status={run.verifiedResearchSuccess ? "PASS" : "INFO"}
              label={run.verifiedResearchSuccess ? "VERIFIED RESEARCH" : "OBSERVED"}
            />
          </div>
        }
      />

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border border-[#1D232B] bg-[#0B0E11] px-3 py-2.5">
        <HashValue label="trajectory" value={run.runId} />
        <HashValue label="world" value={run.worldHash} />
        <HashValue label="task" value={run.taskHash} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(34rem,1fr)_20rem]">
        <InstrumentPanel title="Execution trace" code={`${run.actions.length} ACTIONS`}>
          <TrajectoryExplorer
            model={trajectory}
            selectedSequence={selectedNode.sequence}
            onSelect={selectNode}
          />
          <div className="grid grid-cols-3 gap-px border-t border-[#1D232B] bg-[#1D232B]">
            <ResearchValue metric={run.usage.tokens} className="bg-[#0B0E11] p-3" />
            <ResearchValue metric={run.usage.cost} className="bg-[#0B0E11] p-3" />
            <ResearchValue metric={run.usage.wallSeconds} className="bg-[#0B0E11] p-3" />
          </div>
        </InstrumentPanel>

        <InstrumentPanel title="Evidence inspector" code={tab.toUpperCase()}>
          <nav aria-label="Run observer views" className="flex border-b border-[#1D232B]">
            {(["action", "turns", "checks"] as const).map((item) => (
              <Link
                key={item}
                to="/runs/$runId"
                params={{ runId }}
                search={{ node: selectedNode.sequence, tab: item }}
                aria-current={tab === item ? "page" : undefined}
                className={`border-r border-[#1D232B] px-3 py-2.5 font-mono text-[8px] uppercase tracking-[0.1em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                  tab === item
                    ? "bg-[#111820] text-[#FFB000]"
                    : "text-[#8b949e] hover:text-[#dce0e4]"
                }`}
              >
                {item}
              </Link>
            ))}
          </nav>
          {tab === "action" ? (
            <TrajectoryEvidenceInspector run={run} node={selectedNode} compact />
          ) : null}
          {tab === "turns" ? <TurnInspector run={run} /> : null}
          {tab === "checks" ? <CheckInspector run={run} /> : null}
        </InstrumentPanel>
      </div>

      <section className="mt-3 grid gap-3 border border-[#1D232B] bg-[#0B0E11] p-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">
            Finding
          </div>
          <p className="mt-1.5 text-sm leading-6 text-[#cbd1d6]">
            {run.decision?.reason ?? "No decision is bound to this trajectory."}
          </p>
        </div>
        <StatusMark status={verdictStatus(run.decision?.verdict)} />
      </section>
    </ForgeShell>
  );
}

function TurnInspector({ run }: { run: RunDetail }) {
  return (
    <ol className="max-h-[610px] divide-y divide-[#171d23] overflow-y-auto">
      {run.turns.map((turn) => (
        <li key={turn.sequence} className="p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">
            Model turn {turn.sequence}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-[#c3cad0]">
            {turn.text}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-px bg-[#1D232B]">
            {[turn.inputTokens, turn.outputTokens, turn.cost, turn.latency].map((metric) => (
              <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-2.5" />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CheckInspector({ run }: { run: RunDetail }) {
  return (
    <div className="p-3">
      <ul className="grid gap-1.5">
        {Object.entries(run.verificationChecks).map(([name, passed]) => (
          <li
            key={name}
            className="flex items-center justify-between gap-3 border border-[#1D232B] px-2.5 py-2"
          >
            <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[#b8c0c7]">
              {name.replaceAll("_", " ")}
            </span>
            <span className={passed ? "text-[#35C78A]" : "text-[#FF5A57]"}>
              {passed ? "◆" : "×"}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border border-[#28323b] bg-[#0a1015] p-3 text-[10px] leading-5 text-[#8b949e]">
        Projected from the frozen verification record. The browser does not rerun or reinterpret
        checks.
      </div>
    </div>
  );
}

function verdictStatus(verdict?: string): "ACCEPT" | "REJECT" | "ABSTAIN" {
  if (verdict === "ACCEPT") return "ACCEPT";
  if (verdict === "REJECT") return "REJECT";
  return "ABSTAIN";
}
