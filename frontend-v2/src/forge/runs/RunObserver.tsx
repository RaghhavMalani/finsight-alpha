import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HashValue, ResearchValue } from "@/epistemic/EpistemicValue";
import type { RunAction, RunDetail } from "@/forge/contracts/observer";
import { runQuery } from "@/forge/data/forge-queries";
import { ForgeShell } from "@/app/shell/ForgeShell";
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
  if (query.isPending)
    return (
      <ForgeShell>
        <LoadingState label="run observer" />
      </ForgeShell>
    );
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
  const selectedAction = run.actions.find((action) => action.sequence === node) ?? run.actions[0];

  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow={`Run · ${run.taskId}`}
        title={`${run.model.replace("gpt-5.6-", "")} trajectory`}
        description={run.hypothesis ?? "No hypothesis was projected from this frozen trajectory."}
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusMark
              status={
                run.decision?.verdict === "ACCEPT"
                  ? "ACCEPT"
                  : run.decision?.verdict === "REJECT"
                    ? "REJECT"
                    : "ABSTAIN"
              }
            />
            <StatusMark
              status={run.verifiedResearchSuccess ? "PASS" : "INFO"}
              label={run.verifiedResearchSuccess ? "VERIFIED RESEARCH" : "OBSERVED"}
            />
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap gap-3 border border-[#1D232B] bg-[#0B0E11] px-3 py-3">
        <HashValue label="trajectory" value={run.runId} />
        <HashValue label="world" value={run.worldHash} />
        <HashValue label="task" value={run.taskHash} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(17rem,0.7fr)_minmax(25rem,1.3fr)]">
        <InstrumentPanel title="Trajectory" code="ORDERED ACTIONS">
          <ol className="divide-y divide-[#171d23]">
            {run.actions.map((action) => (
              <li key={action.sequence}>
                <Link
                  to="/runs/$runId"
                  params={{ runId }}
                  search={{ node: action.sequence, tab: "action" }}
                  aria-current={
                    selectedAction?.sequence === action.sequence && tab === "action"
                      ? "step"
                      : undefined
                  }
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                    selectedAction?.sequence === action.sequence && tab === "action"
                      ? "bg-[#111820]"
                      : "hover:bg-[#0d1115]"
                  }`}
                >
                  <span className="font-mono text-[9px] text-[#65707c]">
                    {String(action.sequence).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-[#dce0e4]">{action.tool}</span>
                    <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707c]">
                      {action.engine ?? "No engine"} ·{" "}
                      {action.certificationLevel ?? "No certification"}
                    </span>
                  </span>
                  <StatusMark
                    status={
                      action.status === "OK" || action.status === "OBSERVED" ? "PASS" : "INFO"
                    }
                    label={action.status}
                  />
                </Link>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-px border-t border-[#1D232B] bg-[#1D232B] p-0">
            <ResearchValue metric={run.usage.tokens} className="bg-[#0B0E11] p-3" />
            <ResearchValue metric={run.usage.cost} className="bg-[#0B0E11] p-3" />
          </div>
        </InstrumentPanel>

        <InstrumentPanel title="Evidence inspector" code={tab.toUpperCase()}>
          <nav aria-label="Run observer views" className="flex border-b border-[#1D232B]">
            {(["action", "turns", "checks"] as const).map((item) => (
              <Link
                key={item}
                to="/runs/$runId"
                params={{ runId }}
                search={{ node: selectedAction?.sequence ?? node, tab: item }}
                aria-current={tab === item ? "page" : undefined}
                className={`border-r border-[#1D232B] px-3 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                  tab === item
                    ? "bg-[#111820] text-[#FFB000]"
                    : "text-[#8b949e] hover:text-[#dce0e4]"
                }`}
              >
                {item}
              </Link>
            ))}
          </nav>
          {tab === "action" && selectedAction && <ActionInspector action={selectedAction} />}
          {tab === "turns" && <TurnInspector run={run} />}
          {tab === "checks" && <CheckInspector run={run} />}
        </InstrumentPanel>
      </div>

      <section className="mt-4 grid gap-3 border border-[#1D232B] bg-[#0B0E11] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#65707c]">
            Finding
          </div>
          <p className="mt-2 text-sm leading-6 text-[#cbd1d6]">
            {run.decision?.reason ?? "No decision is bound to this trajectory."}
          </p>
        </div>
        <StatusMark
          status={
            run.decision?.verdict === "ACCEPT"
              ? "ACCEPT"
              : run.decision?.verdict === "REJECT"
                ? "REJECT"
                : "ABSTAIN"
          }
        />
      </section>
    </ForgeShell>
  );
}

function ActionInspector({ action }: { action: RunAction }) {
  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#65707c]">
            Selected action
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[#E6E8EB]">{action.tool}</h2>
        </div>
        <StatusMark
          status={action.status === "OK" || action.status === "OBSERVED" ? "PASS" : "INFO"}
          label={action.status}
        />
      </div>
      <dl className="mt-5 grid gap-3 border-y border-[#1D232B] py-4 sm:grid-cols-2">
        <TextDatum label="Engine" value={action.engine ?? "UNAVAILABLE"} />
        <TextDatum label="Certification" value={action.certificationLevel ?? "UNAVAILABLE"} />
        <TextDatum label="Stage" value={action.stage ?? "UNAVAILABLE"} />
        <TextDatum
          label="Fidelity"
          value={
            action.highFidelityRun
              ? "HIGH FIDELITY"
              : action.engineRun
                ? "ENGINE RUN"
                : "OBSERVED ACTION"
          }
        />
      </dl>
      {action.metrics.length ? (
        <div className="mt-4 grid gap-px bg-[#1D232B] sm:grid-cols-2">
          {action.metrics.map((metric) => (
            <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-3" />
          ))}
        </div>
      ) : (
        <div className="mt-4 border border-dashed border-[#303842] p-4 text-sm text-[#7B8490]">
          No measured values were projected for this action.
        </div>
      )}
      <div className="mt-4 grid gap-2">
        <HashValue label="result" value={action.resultHash} />
        {action.evidenceHash && <HashValue label="evidence" value={action.evidenceHash} />}
      </div>
    </div>
  );
}

function TurnInspector({ run }: { run: RunDetail }) {
  return (
    <ol className="divide-y divide-[#171d23]">
      {run.turns.map((turn) => (
        <li key={turn.sequence} className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#65707c]">
            Model turn {turn.sequence}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#c3cad0]">{turn.text}</p>
          <div className="mt-4 grid gap-px bg-[#1D232B] sm:grid-cols-2 lg:grid-cols-4">
            {[turn.inputTokens, turn.outputTokens, turn.cost, turn.latency].map((metric) => (
              <ResearchValue key={metric.id} metric={metric} className="bg-[#0B0E11] p-3" />
            ))}
          </div>
          <div className="mt-3 grid gap-2">
            {turn.requestHash && <HashValue label="request" value={turn.requestHash} />}
            {turn.responseHash && <HashValue label="response" value={turn.responseHash} />}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CheckInspector({ run }: { run: import("@/forge/contracts/observer").RunDetail }) {
  return (
    <div className="p-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        {Object.entries(run.verificationChecks).map(([name, passed]) => (
          <li
            key={name}
            className="flex items-center justify-between gap-3 border border-[#1D232B] p-3"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#b8c0c7]">
              {name.replaceAll("_", " ")}
            </span>
            <StatusMark status={passed ? "PASS" : "FAIL"} />
          </li>
        ))}
      </ul>
      <div className="mt-4 border border-[#28323b] bg-[#0a1015] p-3 text-xs leading-5 text-[#8b949e]">
        These states are projected from the frozen verification record. The browser does not rerun
        or reinterpret checks.
      </div>
    </div>
  );
}

function TextDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707c]">{label}</dt>
      <dd
        className={`mt-1 break-words font-mono text-[10px] ${value === "UNAVAILABLE" ? "text-[#616A75]" : "text-[#cdd3d8]"}`}
      >
        {value}
      </dd>
    </div>
  );
}
