import { useQuery } from "@tanstack/react-query";
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { ForgeShell } from "@/app/shell/ForgeShell";
import type {
  DynamicsCertification,
  DynamicsCheckStatus,
  DynamicsExperiment,
  DynamicsPowerMap,
  DynamicsVerdict,
  StatArbExperiment,
} from "@/dynamics/contracts";
import { NonlinearWorkbench } from "@/dynamics/NonlinearWorkbench";
import { PhasePortrait } from "@/dynamics/PhasePortrait";
import { PowerObservatory } from "@/dynamics/PowerObservatory";
import { TournamentObservatory } from "@/dynamics/TournamentObservatory";
import { FailureMicroscope } from "@/dynamics/FailureMicroscope";
import { RepairMicroscope } from "@/dynamics/RepairMicroscope";
import {
  failureDecompositionQuery,
  identifiabilityQuery,
  nonlinearDynamicsQuery,
  ouPowerQuery,
  referenceDynamicsQuery,
  targetedRecoveryQuery,
  tournamentQuery,
} from "@/dynamics/query";
import {
  InstrumentPanel,
  LoadingState,
  StatusMark,
  SurfaceHeader,
  UnavailableState,
} from "@/forge/shared/SurfacePrimitives";

const PotentialLandscape3D = lazy(() => import("@/dynamics/PotentialLandscape3D"));

const PIPELINE = [
  ["01", "Theory"],
  ["02", "Market map"],
  ["03", "PIT world"],
  ["04", "Exact fit"],
  ["05", "Forecast"],
  ["06", "Falsify"],
  ["07", "Compare"],
  ["08", "Claim gate"],
] as const;

const THEORY_RACK = [
  ["OU", "Ornstein–Uhlenbeck", "THEORY"],
  ["RW", "Random walk", "BASELINE"],
  ["P0", "Persistence", "BASELINE"],
  ["HM", "Historical mean", "BASELINE"],
  ["AR", "AR(1)", "BASELINE"],
  ["RZ", "Rolling z-score", "BASELINE"],
] as const;

function format(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

function humanize(code: string): string {
  return code.replaceAll("_", " ");
}

export function DynamicsLab() {
  const query = useQuery(referenceDynamicsQuery);
  const nonlinearQuery = useQuery(nonlinearDynamicsQuery);
  const identifiability = useQuery(identifiabilityQuery);
  const tournament = useQuery(tournamentQuery);
  const failureDecomposition = useQuery(failureDecompositionQuery);
  const targetedRecovery = useQuery(targetedRecoveryQuery);
  const [view, setView] = useState<"potential" | "phase">("potential");
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [powerVisible, setPowerVisible] = useState(false);
  const powerQuery = useQuery({ ...ouPowerQuery, enabled: powerVisible });

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mounted || webglAvailable !== null) return;
    const canvas = document.createElement("canvas");
    setWebglAvailable(Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl")));
  }, [mounted, webglAvailable]);

  if (
    query.isPending ||
    nonlinearQuery.isPending ||
    identifiability.isPending ||
    tournament.isPending ||
    failureDecomposition.isPending ||
    targetedRecovery.isPending
  ) {
    return (
      <ForgeShell>
        <LoadingState label="Dynamics theory certification" />
      </ForgeShell>
    );
  }
  if (
    query.error ||
    nonlinearQuery.error ||
    identifiability.error ||
    tournament.error ||
    failureDecomposition.error ||
    targetedRecovery.error ||
    !query.data ||
    !nonlinearQuery.data ||
    !identifiability.data ||
    !tournament.data ||
    !failureDecomposition.data ||
    !targetedRecovery.data
  ) {
    return (
      <ForgeShell>
        <UnavailableState
          title="Dynamics Lab failed closed"
          error={
            query.error ??
            nonlinearQuery.error ??
            identifiability.error ??
            tournament.error ??
            failureDecomposition.error ??
            targetedRecovery.error
          }
          retry={() => {
            void query.refetch();
            void nonlinearQuery.refetch();
            void identifiability.refetch();
            void tournament.refetch();
            void failureDecomposition.refetch();
            void targetedRecovery.refetch();
          }}
        />
      </ForgeShell>
    );
  }

  const { experiment, certification, statArb } = query.data;
  const halfLifeInterval = experiment.parameterUncertainty.half_life;

  return (
    <ForgeShell>
      <SurfaceHeader
        eyebrow="FinSight Dynamics Lab / D0.3.3 targeted recovery"
        title="Repair the instrument. Preserve the controls."
        description="Development worlds lock the repair before untouched confirmation. The frozen confirmation result remains the final scientific gate."
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusMark status="INFO" label="FROZEN CONTROL" />
            <StatusMark
              status={experiment.finalMarketClaim}
              label={`MARKET ${experiment.finalMarketClaim}`}
            />
          </div>
        }
      />

      <WorldSeal experiment={experiment} />

      <section
        className="mt-3 overflow-x-auto border border-[#1D232B] bg-[#090C0F]"
        aria-label="Theory certification pipeline"
      >
        <ol className="grid min-w-[940px] grid-cols-8">
          {PIPELINE.map(([number, label], index) => (
            <li
              key={number}
              className={`relative border-r border-[#1D232B] px-3 py-3 last:border-r-0 ${
                index === PIPELINE.length - 1 ? "bg-[#15120B]" : ""
              }`}
            >
              <div className="font-mono text-[8px] tracking-[0.14em] text-[#59636E]">{number}</div>
              <div
                className={`mt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] ${
                  index === PIPELINE.length - 1 ? "text-[#FFB000]" : "text-[#B6BEC6]"
                }`}
              >
                {label}
              </div>
              {index < PIPELINE.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1.5 top-1/2 z-10 -translate-y-1/2 bg-[#090C0F] font-mono text-[9px] text-[#44505B]"
                >
                  ›
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-3 grid gap-px border border-[#1D232B] bg-[#1D232B] sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="θ / reversion" value={format(experiment.parameters.theta)} suffix="day⁻¹" />
        <Metric label="μ / equilibrium" value={format(experiment.parameters.mu)} />
        <Metric label="σ / diffusion" value={format(experiment.parameters.sigma)} suffix="√day⁻¹" />
        <Metric
          label="Half-life / 95% CI"
          value={format(experiment.parameters.halfLife, 2)}
          subvalue={`${format(halfLifeInterval?.ciLow ?? null, 2)} — ${format(halfLifeInterval?.ciHigh ?? null, 2)} d`}
        />
        <Metric
          label="OOS proper-score edge"
          value={format(experiment.comparison.deltaBaseline, 4)}
          subvalue={`vs ${experiment.comparison.bestBaseline}`}
          tone={experiment.comparison.deltaBaseline > 0 ? "green" : "red"}
        />
        <Metric
          label="Theory false-accept rate"
          value={`${(certification.headline.theoryFalseAcceptRate * 100).toFixed(1)}%`}
          subvalue={`${certification.headline.falseAccepts} / ${certification.headline.negativeControls} false worlds`}
          tone={certification.headline.falseAccepts === 0 ? "green" : "red"}
        />
      </section>

      <VerdictStrip experiment={experiment} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[13rem_minmax(38rem,1fr)_22rem]">
        <TheoryRack experiment={experiment} />

        <InstrumentPanel
          title="State-space instrument"
          code={view === "potential" ? "3D / U(X)" : "2D / ΔX·ΔT⁻¹"}
        >
          <nav
            aria-label="Dynamics representation"
            className="flex border-b border-[#1D232B] bg-[#090C0F]"
          >
            {(["potential", "phase"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                aria-pressed={view === item}
                className={`border-r border-[#1D232B] px-4 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                  view === item
                    ? "bg-[#FFB000] text-[#07090B]"
                    : "text-[#8F99A3] hover:bg-[#111820] hover:text-[#DCE0E4]"
                }`}
              >
                {item === "potential" ? "Potential landscape" : "Phase portrait"}
              </button>
            ))}
          </nav>
          {view === "phase" ? (
            <PhasePortrait experiment={experiment} />
          ) : mounted && webglAvailable ? (
            <DynamicsCanvasBoundary fallback={<PhaseFallback experiment={experiment} />}>
              <Suspense fallback={<CanvasLoading />}>
                <PotentialLandscape3D experiment={experiment} reducedMotion={reducedMotion} />
              </Suspense>
            </DynamicsCanvasBoundary>
          ) : webglAvailable === false ? (
            <PhaseFallback experiment={experiment} />
          ) : (
            <CanvasLoading />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1D232B] px-3 py-2.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#697580]">
            <span>Exact likelihood / each observed Δt</span>
            <span>{experiment.holdoutWindow.observations} observations / sealed future</span>
          </div>
        </InstrumentPanel>

        <FalsificationPanel experiment={experiment} />
      </div>

      <section className="mt-3 border border-[#584416] bg-[#151108] px-4 py-4">
        <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-[#9B7C37]">
          Decision sentence / machine-derived
        </div>
        <p className="mt-2 max-w-6xl text-base leading-7 text-[#F0D697]">
          {experiment.decisionSummary}
        </p>
      </section>

      <StatArbLaboratory statArb={statArb} />
      <NonlinearWorkbench payload={nonlinearQuery.data} />
      <PowerObservatory artifact={identifiability.data} />
      <TournamentObservatory artifact={tournament.data} />
      <FailureMicroscope artifact={failureDecomposition.data} />
      <RepairMicroscope artifact={targetedRecovery.data} />

      <PowerMapSection
        visible={powerVisible}
        power={powerQuery.data}
        error={powerQuery.error}
        pending={powerQuery.isFetching}
        onRun={() => setPowerVisible(true)}
        onRetry={() => void powerQuery.refetch()}
      />

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(42rem,1.35fr)_minmax(28rem,1fr)]">
        <TheoryTournament experiment={experiment} />
        <CertificationPanel certification={certification} />
      </div>

      <section className="mt-3 grid gap-px border border-[#1D232B] bg-[#1D232B] lg:grid-cols-3">
        <BoundaryCard
          code="CLAIM BOUNDARY"
          title="A calibration is not a market fact."
          body="The reference world is controlled synthetic evidence. It can validate implementation behavior, never establish that a traded observable follows OU dynamics."
        />
        <BoundaryCard
          code="ECONOMIC GATE"
          title="Execution remains unmeasured."
          body="Costs, latency, capacity, and fill survival are absent. Scientific and predictive acceptance therefore cannot promote a market claim."
        />
        <BoundaryCard
          code="D0.3.2 / CONDITIONAL"
          title="Estimator tournament only if power is insufficient"
          body="The frozen frontier decides whether spline likelihood is adequate or whether Kramers-Moyal, local polynomial, SINDy, or Gaussian-process estimators earn a controlled tournament."
          accent
        />
      </section>
    </ForgeShell>
  );
}

function WorldSeal({ experiment }: { experiment: DynamicsExperiment }) {
  return (
    <section
      className="mt-4 border border-[#24313A] bg-[#0A0F13]"
      aria-label="Sealed research world"
    >
      <div className="grid gap-px bg-[#1D232B] md:grid-cols-[1.1fr_1fr_1fr_1fr]">
        <SealCell label="Observable" value={experiment.observable} />
        <SealCell label="World as-of" value={new Date(experiment.world.asOf).toISOString()} />
        <SealCell
          label="Train window"
          value={`${experiment.trainWindow.observations} obs · ${experiment.trainWindow.elapsedTime.toFixed(1)} ${experiment.trainWindow.timeUnit}`}
        />
        <SealCell
          label="Sealed holdout"
          value={`${experiment.holdoutWindow.observations} obs · untouched ${experiment.hypothesisLedger.holdoutUntouched ? "YES" : "NO"}`}
          accent={experiment.hypothesisLedger.holdoutUntouched}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1D232B] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#63707A]">
        <span>World hash {experiment.world.worldHash.slice(0, 18)}…</span>
        <span>
          {experiment.hypothesisLedger.hypothesesConsidered} hypothesis · selected{" "}
          {new Date(experiment.hypothesisLedger.selectionTimestamp).toISOString().slice(0, 10)}
        </span>
      </div>
    </section>
  );
}

function SealCell({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#0A0F13] px-3 py-2.5">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#596670]">{label}</div>
      <div className={`mt-1 text-[11px] ${accent ? "text-[#42C98B]" : "text-[#B7C0C7]"}`}>
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  subvalue,
  suffix,
  tone = "default",
}: {
  label: string;
  value: string;
  subvalue?: string;
  suffix?: string;
  tone?: "default" | "green" | "red";
}) {
  const color =
    tone === "green" ? "text-[#42C98B]" : tone === "red" ? "text-[#F06464]" : "text-[#E6E8EB]";
  return (
    <div className="min-h-24 bg-[#0B0E11] px-4 py-3">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65707C]">{label}</div>
      <div className={`mt-1 font-mono text-[18px] font-semibold tabular-nums ${color}`}>
        {value}{" "}
        {suffix ? <span className="text-[9px] font-normal text-[#65707C]">{suffix}</span> : null}
      </div>
      {subvalue ? <div className="mt-1 font-mono text-[8px] text-[#6E7983]">{subvalue}</div> : null}
    </div>
  );
}

function VerdictStrip({ experiment }: { experiment: DynamicsExperiment }) {
  return (
    <section className="mt-3 grid gap-px border border-[#1D232B] bg-[#1D232B] md:grid-cols-4">
      <VerdictCell
        label="Scientific"
        verdict={experiment.scientificVerdict}
        detail="assumptions + stability"
      />
      <VerdictCell
        label="Predictive"
        verdict={experiment.predictiveVerdict}
        detail="sealed holdout vs baselines"
      />
      <VerdictCell
        label="Economic"
        verdict={experiment.economicVerdict}
        detail="costs + execution survival"
      />
      <VerdictCell
        label="Final market claim"
        verdict={experiment.finalMarketClaim}
        detail={experiment.marketClaimEligible ? "eligible" : "gate closed"}
        primary
      />
    </section>
  );
}

function VerdictCell({
  label,
  verdict,
  detail,
  primary = false,
}: {
  label: string;
  verdict: DynamicsVerdict;
  detail: string;
  primary?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${primary ? "bg-[#151108]" : "bg-[#0B0E11]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#6B7680]">
          {label}
        </span>
        <StatusMark status={verdict} />
      </div>
      <div className="mt-2 text-[10px] text-[#7D8790]">{detail}</div>
    </div>
  );
}

function TheoryRack({ experiment }: { experiment: DynamicsExperiment }) {
  return (
    <InstrumentPanel title="Theory rack" code="ONE THEORY / FIVE BASELINES">
      <div className="divide-y divide-[#171D23]">
        {THEORY_RACK.map(([code, name, role], index) => (
          <div
            key={code}
            className={`px-3 py-2.5 ${index === 0 ? "bg-[#14140F]" : "bg-[#0B0E11]"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`font-mono text-[9px] ${index === 0 ? "text-[#FFB000]" : "text-[#77828C]"}`}
              >
                {code}
              </span>
              <span className="font-mono text-[7px] tracking-[0.1em] text-[#505A64]">{role}</span>
            </div>
            <div
              className={`mt-1 text-[11px] ${index === 0 ? "text-[#E2E5E7]" : "text-[#929CA5]"}`}
            >
              {name}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#1D232B] p-3">
        <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#59636E]">
          Equation
        </div>
        <div className="mt-2 font-mono text-[10px] leading-5 text-[#C9D0D6]">
          {experiment.equation}
        </div>
      </div>
    </InstrumentPanel>
  );
}

const STAT_ARB_PIPELINE = [
  "PIT universe",
  "Pair family",
  "Cointegration",
  "BH correction",
  "Frozen hedge",
  "OU certify",
  "Sealed OOS",
  "Execution",
] as const;

function StatArbLaboratory({ statArb }: { statArb: StatArbExperiment }) {
  const ledger = statArb.discoveryLedger;
  const survivor = statArb.pairArtifacts.find((pair) => pair.certified);
  const screens = [...statArb.screeningLedger]
    .sort((left, right) => left.adjustedPValue - right.adjustedPValue)
    .slice(0, 7);

  return (
    <section className="mt-3 border border-[#26333D] bg-[#090D10]" aria-labelledby="stat-arb-title">
      <header className="grid gap-4 border-b border-[#26333D] px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#6C7D89]">
            D0.2.1 / Selection-aware certification freeze
          </div>
          <h2
            id="stat-arb-title"
            className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[#E2E7EA]"
          >
            The winning chart carries the losing search family with it.
          </h2>
          <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#7B8790]">
            Every eligible pair is screened inside one sealed world. Only corrected candidates may
            estimate a hedge ratio, and that ratio freezes before the OU holdout opens.
          </p>
        </div>
        <div className="flex gap-2">
          <StatusMark
            status={statArb.selectionVerdict}
            label={`SELECTION ${statArb.selectionVerdict}`}
          />
          <StatusMark
            status={statArb.economicVerdict}
            label={`ECONOMIC ${statArb.economicVerdict}`}
          />
        </div>
      </header>

      <ol className="grid overflow-x-auto border-b border-[#26333D] bg-[#0A0E11] sm:grid-cols-4 xl:grid-cols-8">
        {STAT_ARB_PIPELINE.map((stage, index) => (
          <li key={stage} className="border-b border-r border-[#1B252C] px-3 py-2.5 sm:border-b-0">
            <span className="font-mono text-[7px] text-[#48545D]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.07em] text-[#8A959E]">
              {stage}
            </div>
          </li>
        ))}
      </ol>

      <div
        className="grid gap-px border-b border-[#26333D] bg-[#1D282F] lg:grid-cols-[1.4fr_1fr_1fr]"
        aria-label="Selection-aware certification freeze metrics"
      >
        <div className="bg-[#0B1014] px-4 py-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65717A]">
            Candidate compression
          </div>
          <div className="mt-1 font-mono text-lg font-semibold tracking-[0.05em] text-[#DCE3E6]">
            {statArb.candidateCompression.notation}
          </div>
          <div className="mt-1 text-[9px] text-[#65717A]">
            screened → BH → scientific + predictive → economic
          </div>
        </div>
        <div className="bg-[#10140F] px-4 py-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#708064]">
            Search survival rate
          </div>
          <div className="mt-1 flex items-baseline gap-2 font-mono">
            <span className="text-xl font-semibold tabular-nums text-[#C4D895]">
              {(statArb.searchSurvivalRate.value * 100).toFixed(2)}%
            </span>
            <span className="text-[9px] text-[#718064]">{statArb.searchSurvivalRate.fraction}</span>
          </div>
          <div className="mt-1 text-[9px] text-[#65717A]">
            economic certifications / hypotheses screened
          </div>
        </div>
        <div className="bg-[#0B1014] px-4 py-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#65717A]">
            Frozen artifact
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusMark status={statArb.freeze.frozen ? "PASS" : "FAIL"} />
            <span className="font-mono text-[10px] text-[#B7C0C6]">{statArb.freeze.milestone}</span>
          </div>
          <div className="mt-2 font-mono text-[8px] text-[#596670]">
            SHA-256 {statArb.artifactHash.slice(0, 16)}…
          </div>
        </div>
      </div>

      <div className="grid gap-px border-b border-[#26333D] bg-[#1D282F] sm:grid-cols-3 xl:grid-cols-6">
        <DiscoveryCount label="Eligible securities" value={ledger.eligibleSecurities} />
        <DiscoveryCount label="Candidate pairs" value={ledger.candidatePairs} />
        <DiscoveryCount label="Pairs screened" value={ledger.pairsScreened} />
        <DiscoveryCount label="Corrected candidates" value={ledger.cointegratedCandidates} />
        <DiscoveryCount label="OU certified" value={ledger.certified} accent />
        <DiscoveryCount label="Economic survivors" value={ledger.economicSurvivors} warning />
      </div>

      <div className="grid gap-px bg-[#1D282F] xl:grid-cols-[18rem_minmax(28rem,1fr)_22rem]">
        <aside className="bg-[#0B1014]">
          <div className="border-b border-[#1D282F] px-3 py-2.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#6C7A84]">
            Discovery ledger
          </div>
          <dl className="divide-y divide-[#182128]">
            <EvidenceRow label="Run" value={ledger.discoveryRunId.replace("discovery-", "")} />
            <EvidenceRow label="World" value={`${statArb.world.worldHash.slice(0, 12)}…`} />
            <EvidenceRow
              label="As-of"
              value={new Date(statArb.world.asOf).toISOString().slice(0, 10)}
            />
            <EvidenceRow label="Universe" value={ledger.searchUniverse.join(" · ")} />
            <EvidenceRow label="Transform" value={statArb.world.priceTransform.toUpperCase()} />
            <EvidenceRow label="Correction" value={ledger.correctionMethod} accent />
            <EvidenceRow
              label="Selected"
              value={new Date(ledger.selectionTimestamp).toISOString().slice(0, 10)}
            />
            <EvidenceRow label="Hedge fit" value={`${ledger.hedgeRatioWindow.observations} obs`} />
            <EvidenceRow
              label="Holdout"
              value={`${ledger.holdoutWindow.observations} obs`}
              accent
            />
          </dl>
        </aside>

        <div className="min-w-0 bg-[#0A0E11]">
          <div className="flex items-center justify-between border-b border-[#1D282F] px-3 py-2.5">
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#6C7A84]">
              Search family / strongest evidence first
            </span>
            <span className="font-mono text-[8px] text-[#53606A]">
              all {ledger.pairsScreened} retained
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <thead className="font-mono text-[8px] uppercase text-[#596670]">
                <tr className="border-b border-[#182128]">
                  <th className="px-3 py-2 font-medium" scope="col">
                    Pair
                  </th>
                  <th className="px-3 py-2 text-right font-medium" scope="col">
                    EG t-stat
                  </th>
                  <th className="px-3 py-2 text-right font-medium" scope="col">
                    Raw p
                  </th>
                  <th className="px-3 py-2 text-right font-medium" scope="col">
                    BH-adjusted
                  </th>
                  <th className="px-3 py-2 text-right font-medium" scope="col">
                    Gate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182128]">
                {screens.map((screen) => (
                  <tr key={screen.pairId} className={screen.selected ? "bg-[#11170F]" : ""}>
                    <th
                      className={`px-3 py-2.5 font-mono text-[10px] ${screen.selected ? "text-[#B5C98B]" : "text-[#9AA4AC]"}`}
                      scope="row"
                    >
                      {screen.pairId}
                    </th>
                    <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#7C8790]">
                      {screen.statistic.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#7C8790]">
                      {screen.pValue.toFixed(4)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#B8C0C6]">
                      {screen.adjustedPValue.toFixed(4)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <StatusMark
                        status={screen.selected ? "PASS" : "FAIL"}
                        label={screen.selected ? "SELECT" : "KILL"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#1D282F] px-3 py-3 font-mono text-[8px] leading-4 text-[#5F6C75]">
            {ledger.cointegrationTest} · {ledger.selectionMetric}
          </div>
        </div>

        <aside className="bg-[#0B1014]">
          <div className="border-b border-[#1D282F] px-3 py-2.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#6C7A84]">
            Surviving residual
          </div>
          {survivor ? (
            <div>
              <div className="border-b border-[#1D282F] bg-[#12180F] p-3">
                <div className="font-mono text-sm font-semibold text-[#C9D99C]">
                  {survivor.pairId}
                </div>
                <div className="mt-1 text-[10px] text-[#738067]">
                  scientific + predictive survivor
                </div>
              </div>
              <dl className="divide-y divide-[#182128]">
                <EvidenceRow
                  label="BH p"
                  value={survivor.cointegration.adjustedPValue.toFixed(4)}
                  accent
                />
                <EvidenceRow label="Hedge β" value={survivor.hedgeRatio.beta.toFixed(4)} />
                <EvidenceRow
                  label="Frozen"
                  value={survivor.hedgeRatio.frozenBeforeHoldout ? "YES" : "NO"}
                  accent
                />
                <EvidenceRow label="OU θ" value={survivor.ou.theta.toFixed(4)} />
                <EvidenceRow label="Half-life" value={`${format(survivor.ou.halfLife, 2)} days`} />
                <EvidenceRow label="NLL edge" value={survivor.ou.baselineEdge.toFixed(4)} accent />
              </dl>
              <div className="border-t border-[#1D282F] p-3">
                <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#596670]">
                  Execution reality
                </div>
                <ul className="space-y-2">
                  {survivor.executionReality.map((stage) => (
                    <li key={stage.stage} className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-[#7C8790]">{stage.stage}</span>
                      {checkStatus(stage.status)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <StatusMark status="REJECT" label="NO SURVIVOR" />
              <p className="mt-3 text-[11px] leading-5 text-[#77828B]">
                No corrected candidate survived both OU falsification and the sealed forecast
                tournament.
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-[#26333D] px-4 py-3">
        <p className="max-w-4xl text-[11px] leading-5 text-[#89949C]">{statArb.decisionSummary}</p>
        <span className="font-mono text-[8px] uppercase text-[#53606A]">
          artifact {statArb.artifactHash.slice(0, 16)}…
        </span>
      </div>
    </section>
  );
}

function DiscoveryCount({
  label,
  value,
  accent = false,
  warning = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warning?: boolean;
}) {
  const tone = accent ? "text-[#AFCB75]" : warning ? "text-[#D6AE55]" : "text-[#E0E5E8]";
  return (
    <div className="bg-[#0B1014] px-3 py-3">
      <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#596670]">{label}</div>
      <div className={`mt-1 font-mono text-xl font-semibold tabular-nums ${tone}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function PowerMapSection({
  visible,
  power,
  error,
  pending,
  onRun,
  onRetry,
}: {
  visible: boolean;
  power: DynamicsPowerMap | undefined;
  error: Error | null;
  pending: boolean;
  onRun: () => void;
  onRetry: () => void;
}) {
  if (!visible) {
    return (
      <section className="mt-3 grid border border-[#26333D] bg-[#0A0E11] lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="px-4 py-5">
          <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-[#6C7D89]">
            Scientific power / pilot map
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[#DCE2E5]">
            Measure when the verifier can tell.
          </h2>
          <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#77848D]">
            Run the full certification engine across frozen changes in reversion, diffusion, sample
            size, clock density, measurement noise, and structural breaks.
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          className="m-4 border border-[#806528] bg-[#171309] px-4 py-3 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#D8B966] transition-colors hover:bg-[#211A0A] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C79D3B]"
        >
          Run 72 frozen worlds
        </button>
      </section>
    );
  }

  if (pending && !power) {
    return (
      <section
        className="mt-3 grid min-h-40 place-items-center border border-[#26333D] bg-[#0A0E11]"
        role="status"
      >
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#7B8790]">
          Certifying 72 frozen worlds…
        </div>
      </section>
    );
  }

  if (error || !power) {
    return (
      <section className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-[#5A2929] bg-[#170C0C] px-4 py-4">
        <p className="text-[11px] text-[#C98B8B]">
          The power experiment failed closed: {error?.message ?? "No artifact returned."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="border border-[#744040] px-3 py-2 font-mono text-[8px] uppercase text-[#D7A0A0] hover:bg-[#241010] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C96F6F]"
        >
          Retry experiment
        </button>
      </section>
    );
  }

  return (
    <section
      className="mt-3 border border-[#26333D] bg-[#0A0E11]"
      aria-labelledby="power-map-title"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#26333D] px-4 py-4">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-[#6C7D89]">
            Scientific power / pilot map
          </div>
          <h2
            id="power-map-title"
            className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[#DCE2E5]"
          >
            Probability of the correct scientific decision
          </h2>
          <p className="mt-1 text-[10px] text-[#6F7C85]">{power.method}</p>
        </div>
        <span className="font-mono text-[8px] uppercase text-[#596670]">
          {power.cells.length} cells · {power.repetitionsPerCell} worlds each · frozen{" "}
          {power.frozen ? "yes" : "no"}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[62rem] border-collapse text-left">
          <thead className="bg-[#090C0F] font-mono text-[8px] uppercase tracking-[0.08em] text-[#65717A]">
            <tr className="border-b border-[#1D282F]">
              <th className="px-3 py-2.5 font-medium" scope="col">
                Control
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Half-life
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                n
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Δt
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Noise
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Break
              </th>
              <th className="px-3 py-2.5 font-medium" scope="col">
                Correct certification
              </th>
              <th className="px-3 py-2.5 text-right font-medium" scope="col">
                Abstain
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#182128]">
            {power.cells.map((cell) => (
              <tr key={cell.id} className={cell.expected === "REJECT" ? "bg-[#150F0C]" : ""}>
                <th className="px-3 py-2.5" scope="row">
                  <div className="text-[11px] text-[#B8C1C7]">{humanize(cell.id)}</div>
                  <div className="mt-1 font-mono text-[7px] uppercase text-[#596670]">
                    expect {cell.expected}
                  </div>
                </th>
                <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#929DA5]">
                  {cell.halfLife.toFixed(2)}d
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#929DA5]">
                  {cell.observations}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#929DA5]">
                  {cell.deltaTime.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#929DA5]">
                  {cell.measurementNoise.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#929DA5]">
                  {cell.breakMagnitude.toFixed(2)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="grid grid-cols-10 gap-0.5" aria-hidden="true">
                      {Array.from({ length: 10 }, (_, index) => (
                        <span
                          key={index}
                          className={`h-2 w-2 ${index < Math.round(cell.correctCertificationProbability * 10) ? "bg-[#9BBE65]" : "bg-[#253038]"}`}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-[#C6D59E]">
                      {(cell.correctCertificationProbability * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[10px] tabular-nums text-[#D0A950]">
                  {(cell.abstentionProbability * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#26333D] px-4 py-2.5 font-mono text-[8px] uppercase text-[#53606A]">
        axes {power.axes.join(" · ")} · run {power.runHash.slice(0, 16)}…
      </div>
    </section>
  );
}

function TheoryTournament({ experiment }: { experiment: DynamicsExperiment }) {
  return (
    <InstrumentPanel title="Theory tournament" code="SAME WORLD · TARGET · HOLDOUT">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="bg-[#090C0F] font-mono text-[8px] uppercase tracking-[0.1em] text-[#66717C]">
            <tr className="border-b border-[#1D232B]">
              <th className="px-3 py-3 font-medium" scope="col">
                Theory
              </th>
              <th className="px-3 py-3 font-medium" scope="col">
                Complexity
              </th>
              <th className="px-3 py-3 text-right font-medium" scope="col">
                NLL ↓
              </th>
              <th className="px-3 py-3 text-right font-medium" scope="col">
                RMSE ↓
              </th>
              <th className="px-3 py-3 text-right font-medium" scope="col">
                90% cover
              </th>
              <th className="px-3 py-3 text-right font-medium" scope="col">
                Parameters
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#171D23]">
            {experiment.tournament.map((entry) => (
              <tr
                key={entry.theory}
                className={entry.role === "challenger" ? "bg-[#13140F]" : "hover:bg-[#0F1317]"}
              >
                <th
                  className={`px-3 py-3 text-xs font-medium ${entry.role === "challenger" ? "text-[#FFB000]" : "text-[#C6CDD3]"}`}
                  scope="row"
                >
                  {entry.theory}
                </th>
                <td className="px-3 py-3 font-mono text-[8px] text-[#68737D]">
                  {entry.complexity}
                </td>
                <td className="px-3 py-3 text-right font-mono text-[11px] tabular-nums text-[#DCE1E5]">
                  {format(entry.score.negativeLogLikelihood, 4)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-[11px] tabular-nums text-[#DCE1E5]">
                  {format(entry.score.rmse, 4)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-[11px] tabular-nums text-[#9DA6AE]">
                  {(entry.score.coverage90 * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-3 text-right font-mono text-[11px] tabular-nums text-[#9DA6AE]">
                  {entry.parameters}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#1D232B] px-3 py-2.5 text-[10px] text-[#78838D]">
        {experiment.comparison.explanation}
      </div>
    </InstrumentPanel>
  );
}

function checkStatus(status: DynamicsCheckStatus) {
  if (status === "PASS") return <StatusMark status="PASS" />;
  if (status === "FAIL") return <StatusMark status="FAIL" />;
  return <StatusMark status="INFO" label="NOT MEASURED" />;
}

function FalsificationPanel({ experiment }: { experiment: DynamicsExperiment }) {
  return (
    <InstrumentPanel title="Kill register" code="CRITICAL / FAIL CLOSED">
      <ul className="max-h-[548px] divide-y divide-[#171D23] overflow-y-auto [content-visibility:auto]">
        {experiment.falsification.map((check) => (
          <li
            key={check.code}
            className={check.status === "FAIL" ? "bg-[#190D0D] px-3 py-2.5" : "px-3 py-2.5"}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.07em] text-[#C4CBD1]">
                {humanize(check.code)}
              </div>
              {checkStatus(check.status)}
            </div>
            <p className="mt-1 text-[10px] leading-4 text-[#68737D]">{check.message}</p>
          </li>
        ))}
      </ul>
    </InstrumentPanel>
  );
}

function CertificationPanel({ certification }: { certification: DynamicsCertification }) {
  return (
    <InstrumentPanel title="Frozen adversarial suite" code={certification.suiteId}>
      <div className="grid grid-cols-2 gap-px border-b border-[#1D232B] bg-[#1D232B] xl:grid-cols-4">
        <div className="bg-[#0A100D] p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#607369]">
            False accepts
          </div>
          <div className="mt-1 font-mono text-xl font-semibold text-[#42C98B]">
            {(certification.headline.theoryFalseAcceptRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-[#0B0E11] p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707C]">
            True accepts
          </div>
          <div className="mt-1 font-mono text-xl font-semibold text-[#DCE1E5]">
            {certification.headline.trueAccepts}/{certification.headline.positiveControls}
          </div>
        </div>
        <div className="bg-[#0B0E11] p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707C]">
            Abstention rate
          </div>
          <div className="mt-1 font-mono text-xl font-semibold text-[#D6AE55]">
            {(certification.headline.abstentionRate * 100).toFixed(1)}%
          </div>
          <div className="mt-1 font-mono text-[8px] text-[#59636E]">
            {certification.headline.abstentions}/{certification.headline.totalControls}
          </div>
        </div>
        <div className="bg-[#0B0E11] p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#65707C]">
            False reject rate
          </div>
          <div className="mt-1 font-mono text-xl font-semibold text-[#DCE1E5]">
            {(certification.headline.falseRejectRate * 100).toFixed(1)}%
          </div>
          <div className="mt-1 font-mono text-[8px] text-[#59636E]">
            {certification.headline.falseRejects}/{certification.headline.positiveControls}
          </div>
        </div>
      </div>
      <ul className="divide-y divide-[#171D23]">
        {certification.tasks.map((task) => (
          <li key={task.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5">
            <div>
              <div className="text-[11px] text-[#B9C1C8]">{task.label}</div>
              <div className="mt-1 font-mono text-[8px] uppercase text-[#59636E]">
                expected {task.expected}
                {task.killedBy.length > 0
                  ? ` · killed by ${humanize(task.killedBy[0])}`
                  : " · survived"}
              </div>
            </div>
            <StatusMark
              status={task.correct ? "PASS" : "FAIL"}
              label={task.correct ? "CORRECT" : "MISS"}
            />
          </li>
        ))}
      </ul>
      <div className="border-t border-[#1D232B] px-3 py-2 font-mono text-[8px] uppercase text-[#59636E]">
        Frozen {certification.frozen ? "YES" : "NO"} · run {certification.runHash.slice(0, 14)}…
      </div>
    </InstrumentPanel>
  );
}

function BoundaryCard({
  code,
  title,
  body,
  accent = false,
}: {
  code: string;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <article className={`min-h-36 px-4 py-4 ${accent ? "bg-[#151108]" : "bg-[#0B0E11]"}`}>
      <div
        className={`font-mono text-[8px] uppercase tracking-[0.14em] ${accent ? "text-[#B18D3B]" : "text-[#59636E]"}`}
      >
        {code}
      </div>
      <h2 className="mt-2 text-sm font-medium text-[#D9DEE2]">{title}</h2>
      <p className="mt-2 text-[11px] leading-5 text-[#74808A]">{body}</p>
    </article>
  );
}

function CanvasLoading() {
  return (
    <div className="grid h-[500px] place-items-center bg-[#07090B]" role="status">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#77828C]">
        Loading spatial instrument…
      </div>
    </div>
  );
}

function PhaseFallback({ experiment }: { experiment: DynamicsExperiment }) {
  return (
    <div>
      <div
        className="border-b border-[#745F31] bg-[#151108] px-3 py-2 text-[10px] text-[#D8B86A]"
        role="status"
      >
        WebGL is unavailable. The authoritative phase-space projection remains visible.
      </div>
      <PhasePortrait experiment={experiment} />
    </div>
  );
}

class DynamicsCanvasBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Spatial rendering fails closed into the SVG evidence view.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
