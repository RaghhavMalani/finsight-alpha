import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { DynamicsLab } from "@/dynamics/DynamicsLab";
import { FailureMicroscope } from "@/dynamics/FailureMicroscope";
import { EventDynamicsWorkbench } from "@/dynamics/EventDynamicsWorkbench";
import { GeneralizationAutopsy } from "@/dynamics/GeneralizationAutopsy";
import { NonlinearWorkbench } from "@/dynamics/NonlinearWorkbench";
import { PowerObservatory } from "@/dynamics/PowerObservatory";
import { RepairMicroscope } from "@/dynamics/RepairMicroscope";
import { ReplicationConsole } from "@/dynamics/ReplicationConsole";
import { TournamentObservatory } from "@/dynamics/TournamentObservatory";
import {
  evidenceCompleteReplicationQuery,
  failureDecompositionQuery,
  generalizationAutopsyQuery,
  hawkesCertificationQuery,
  identifiabilityQuery,
  nonlinearDynamicsQuery,
  targetedRecoveryQuery,
  tournamentQuery,
} from "@/dynamics/query";
import { LoadingState, StatusMark, UnavailableState } from "@/forge/shared/SurfacePrimitives";

type ProgramKey = "mean-reversion" | "nonlinear" | "event-dynamics";
type MilestoneKey =
  | "d0.2.1"
  | "d0.3"
  | "d0.3.1"
  | "d0.3.2"
  | "d0.3.2.1"
  | "d0.3.3"
  | "d0.3.3.1"
  | "d0.3.3.2"
  | "d0.3.4"
  | "d0.4";

type Selection = { program: ProgramKey; milestone: MilestoneKey };

const PROGRAMS: Array<{
  key: ProgramKey;
  label: string;
  summary: string;
  milestones: Array<{ key: MilestoneKey; label: string; result: string }>;
}> = [
  {
    key: "mean-reversion",
    label: "Mean reversion",
    summary: "Selection-aware OU certification",
    milestones: [{ key: "d0.2.1", label: "D0.2.1", result: "Reference freeze" }],
  },
  {
    key: "nonlinear",
    label: "Nonlinear SDE",
    summary: "Identifiability and topology program",
    milestones: [
      { key: "d0.3", label: "D0.3", result: "Reference world" },
      { key: "d0.3.1", label: "D0.3.1", result: "Power frontier" },
      { key: "d0.3.2", label: "D0.3.2", result: "Estimator tournament" },
      { key: "d0.3.2.1", label: "D0.3.2.1", result: "Failure decomposition" },
      { key: "d0.3.3", label: "D0.3.3", result: "Targeted recovery" },
      { key: "d0.3.3.1", label: "D0.3.3.1", result: "Generalization autopsy" },
      { key: "d0.3.3.2", label: "D0.3.3.2", result: "Evidence contract" },
      { key: "d0.3.4", label: "D0.3.4", result: "Evidence-complete replication" },
    ],
  },
  {
    key: "event-dynamics",
    label: "Event dynamics",
    summary: "Excitation versus ordinary clustering",
    milestones: [{ key: "d0.4", label: "D0.4", result: "Hawkes certification" }],
  },
];

const DEFAULT_SELECTION: Selection = { program: "event-dynamics", milestone: "d0.4" };

function validSelection(program: string | null, milestone: string | null): Selection {
  const match = PROGRAMS.find((candidate) => candidate.key === program);
  const selected = match?.milestones.find((candidate) => candidate.key === milestone);
  if (!match || !selected) return DEFAULT_SELECTION;
  return { program: match.key, milestone: selected.key };
}

function readSelection(): Selection {
  if (typeof window === "undefined") return DEFAULT_SELECTION;
  const params = new URLSearchParams(window.location.search);
  return validSelection(params.get("program"), params.get("milestone"));
}

function selectionHref(selection: Selection): string {
  const params = new URLSearchParams();
  params.set("program", selection.program);
  params.set("milestone", selection.milestone);
  return `/dynamics?${params.toString()}`;
}

export function DynamicsNavigator() {
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);

  useEffect(() => {
    const sync = () => setSelection(readSelection());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const choose = (next: Selection) => {
    const params = new URLSearchParams(window.location.search);
    params.set("program", next.program);
    params.set("milestone", next.milestone);
    window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
    setSelection(next);
  };

  const followMilestone = (event: MouseEvent<HTMLAnchorElement>, next: Selection) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    choose(next);
  };

  return (
    <ForgeShell>
      <header className="border border-[#25313A] bg-[#090D10] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-[#6D7A84]">
              FinSight Forge / Dynamics research program
            </div>
            <h1 className="mt-2 max-w-4xl text-balance text-2xl font-semibold tracking-[-0.03em] text-[#E8ECEF] sm:text-3xl">
              Every milestone keeps its evidence, boundary, and result separate.
            </h1>
            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#7D8992]">
              Navigate the frozen experiment lineage. D0.4 tests event-process identification on
              synthetic timestamps and keeps both market and causal claims ineligible.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusMark status="INFO" label="READ-ONLY EVIDENCE" />
            <StatusMark status="ABSTAIN" label="MARKET ABSTAIN" />
          </div>
        </div>
      </header>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          className="border border-[#25313A] bg-[#090D10] lg:sticky lg:top-3"
          aria-label="Dynamics milestones"
        >
          <div className="border-b border-[#25313A] px-3 py-3 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#6C7882]">
            Program ledger
          </div>
          <div className="max-h-[36rem] overflow-x-auto lg:max-h-none lg:overflow-visible">
            <div className="flex min-w-max gap-px bg-[#202930] lg:block lg:min-w-0">
              {PROGRAMS.map((program) => (
                <section key={program.key} className="w-64 bg-[#090D10] lg:w-auto">
                  <div className="border-b border-[#1B232A] px-3 py-3">
                    <h2 className="text-[11px] font-semibold text-[#C9D0D5]">{program.label}</h2>
                    <p className="mt-1 text-[8px] leading-4 text-[#5F6B75]">{program.summary}</p>
                  </div>
                  <div className="p-1.5">
                    {program.milestones.map((milestone) => {
                      const active =
                        selection.program === program.key && selection.milestone === milestone.key;
                      const next = { program: program.key, milestone: milestone.key };
                      return (
                        <a
                          key={milestone.key}
                          href={selectionHref(next)}
                          aria-current={active ? "page" : undefined}
                          onClick={(event) => followMilestone(event, next)}
                          className={`mb-1 grid w-full grid-cols-[4.2rem_1fr] items-center gap-2 border px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                            active
                              ? "border-[#80631F] bg-[#171309] text-[#F1D18B]"
                              : "border-transparent text-[#7A8790] hover:border-[#28343D] hover:bg-[#0D1317] hover:text-[#C7CFD5]"
                          }`}
                        >
                          <span className="font-mono text-[9px] font-semibold">
                            {milestone.label}
                          </span>
                          <span className="text-[8px] leading-3">{milestone.result}</span>
                        </a>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </aside>

        <main id="dynamics-milestone" className="min-w-0" aria-live="polite">
          <MilestoneSurface selection={selection} />
        </main>
      </div>
    </ForgeShell>
  );
}

function MilestoneSurface({ selection }: { selection: Selection }) {
  const is = (milestone: MilestoneKey) => selection.milestone === milestone;
  const nonlinear = useQuery({ ...nonlinearDynamicsQuery, enabled: is("d0.3") });
  const identifiability = useQuery({ ...identifiabilityQuery, enabled: is("d0.3.1") });
  const tournament = useQuery({ ...tournamentQuery, enabled: is("d0.3.2") });
  const failure = useQuery({ ...failureDecompositionQuery, enabled: is("d0.3.2.1") });
  const recovery = useQuery({ ...targetedRecoveryQuery, enabled: is("d0.3.3") });
  const autopsy = useQuery({ ...generalizationAutopsyQuery, enabled: is("d0.3.3.1") });
  const replication = useQuery({
    ...evidenceCompleteReplicationQuery,
    enabled: is("d0.3.4"),
  });
  const hawkes = useQuery({
    ...hawkesCertificationQuery,
    enabled: is("d0.4"),
  });

  if (selection.program === "mean-reversion") {
    return <DynamicsLab baseOnly embedded />;
  }
  if (selection.program === "event-dynamics") {
    return querySurface(hawkes, "D0.4 Hawkes event-process certification", (data) => (
      <EventDynamicsWorkbench artifact={data} />
    ));
  }
  if (is("d0.3.3.2")) return <EvidenceContractBoundary />;
  if (is("d0.3")) {
    return querySurface(nonlinear, "D0.3 nonlinear reference world", (data) => (
      <NonlinearWorkbench payload={data} />
    ));
  }
  if (is("d0.3.1")) {
    return querySurface(identifiability, "D0.3.1 identifiability frontier", (data) => (
      <PowerObservatory artifact={data} />
    ));
  }
  if (is("d0.3.2")) {
    return querySurface(tournament, "D0.3.2 estimator tournament", (data) => (
      <TournamentObservatory artifact={data} />
    ));
  }
  if (is("d0.3.2.1")) {
    return querySurface(failure, "D0.3.2.1 failure decomposition", (data) => (
      <FailureMicroscope artifact={data} />
    ));
  }
  if (is("d0.3.3")) {
    return querySurface(recovery, "D0.3.3 targeted recovery", (data) => (
      <RepairMicroscope artifact={data} />
    ));
  }
  if (is("d0.3.3.1")) {
    return querySurface(autopsy, "D0.3.3.1 generalization autopsy", (data) => (
      <GeneralizationAutopsy artifact={data} />
    ));
  }
  return querySurface(replication, "D0.3.4 evidence-complete replication", (data) => (
    <ReplicationConsole artifact={data} />
  ));
}

function querySurface<T>(
  query: { isPending: boolean; error: Error | null; data?: T; refetch: () => unknown },
  label: string,
  render: (data: T) => ReactNode,
): ReactNode {
  if (query.isPending) return <LoadingState label={label} />;
  if (query.error || !query.data) {
    return (
      <UnavailableState
        title={`${label} failed closed`}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  }
  return render(query.data);
}

function EvidenceContractBoundary() {
  return (
    <article
      className="border border-[#25313A] bg-[#090D10]"
      aria-labelledby="evidence-contract-title"
    >
      <header className="border-b border-[#25313A] px-4 py-5 sm:px-5">
        <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-[#7D8992]">
          D0.3.3.2 / Evidence contract
        </div>
        <h2 id="evidence-contract-title" className="mt-2 text-xl font-semibold text-[#E5E9EC]">
          Instrumentation was frozen before replication.
        </h2>
        <p className="mt-2 max-w-3xl text-[10px] leading-5 text-[#77838C]">
          This milestone added observability, not scientific evidence. It defined the per-world
          coefficient, support, topology, and diffusion records required to make D0.3.4 auditable.
        </p>
      </header>
      <div className="grid gap-px bg-[#25313A] sm:grid-cols-3">
        <BoundaryMetric label="Scientific worlds" value="0" />
        <BoundaryMetric label="Threshold changes" value="0" />
        <BoundaryMetric label="Market reruns" value="0" />
      </div>
      <section className="border-t border-[#25313A] bg-[#151108] px-4 py-4 sm:px-5">
        <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#9B7C37]">
          Claim boundary
        </div>
        <p className="mt-2 max-w-3xl text-[10px] leading-5 text-[#D8BE82]">
          No performance number belongs to D0.3.3.2. Its output is a fail-closed evidence schema and
          verifier contract; the 400-world outcome belongs exclusively to D0.3.4.
        </p>
      </section>
    </article>
  );
}

function BoundaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0A0E11] px-4 py-4">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#66727B]">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#DCE2E6]">
        {value}
      </div>
    </div>
  );
}
