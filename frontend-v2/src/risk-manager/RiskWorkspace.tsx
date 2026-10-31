import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataMode } from "@/replay/mode";
import { loadRisk, readChecked, type RiskBundle } from "./client";
import { filterIssues } from "./filters";
import { partition, stamp, stable, type Issue, type State, type Sweep } from "./contracts";
import { IssueFeed } from "./IssueFeed";
import { IssueInspector } from "./IssueInspector";
import { CoverageMatrix } from "./CoverageMatrix";
import { SweepHistory } from "./SweepHistory";

import { loadRiskReadManifest } from "./manifest";
import { RISK_READ_PLAN } from "./read-plan.generated";
import { MONITORING_CATALOG } from "./monitoring-catalog.generated";
import { checkedIssueReferences } from "./evidence";
import { validateReplayManifest, type ReplayEntry, type ReplayManifest } from "@/replay/contracts";
import { useInvestigation, type VerifiedSelection } from "@/app/terminal/TerminalShell";
import {
  subjectMarket,
  type InvestigationContext,
  type InvestigationView,
} from "@/app/terminal/context";
import type { ContextBindings } from "@/app/terminal/compatibility";

const PINNED_METADATA_RESERVATION = 48 * 1024 + 128 * 1024 + RISK_READ_PLAN.projection.bytes;
type RiskView = Extract<InvestigationView, { workspace: "risk" }>;
type RetainedRiskBundle = RiskBundle & { stateSweepRef?: string };
function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Risk selection cancelled.", "AbortError");
}
function riskBudget(bytes: number): void {
  if (bytes > 256 * 1024 || PINNED_METADATA_RESERVATION + bytes > 512 * 1024)
    throw new Error("Selected Risk evidence exceeds the bounded read budget.");
}
function ownerSweepRef(bundle: RiskBundle): string | undefined {
  if (bundle.stateSweep === bundle.sweep) return bundle.sweepRef;
  return bundle.manifest.routes[
    "/risk-manager/sweep?sweep_id=" + bundle.stateSweep.payload.sweep_id
  ];
}
/** Exact pinned selection; the original client and every full-payload validator stay unchanged. */
export async function loadRiskSelection(
  signal?: AbortSignal,
  anchorId?: string,
  sweepId?: string,
): Promise<RetainedRiskBundle> {
  if (anchorId && !/^risk:(state|sweep):[a-f0-9]{64}$/.test(anchorId))
    throw new Error("CONTEXT NOT APPLICABLE: the selected artifact is not Risk evidence.");
  if (sweepId && !/^[a-f0-9]{64}$/.test(sweepId))
    throw new Error("Unknown retained sweep selector.");
  if (!anchorId && !sweepId) {
    const bundle = await loadRisk(signal);
    return { ...bundle, stateSweepRef: ownerSweepRef(bundle) };
  }
  riskBudget(0);
  cancelled(signal);
  const [base, catalog] = await Promise.all([
    loadRiskReadManifest(false),
    import("@/app/terminal/catalog").then(({ loadTerminalShard }) => loadTerminalShard("risk")),
  ]);
  cancelled(signal);
  if (base.as_of !== catalog.manifestBinding.asOf)
    throw new Error("Risk navigation metadata belongs to different publication snapshots.");
  const matches = catalog.bundles.filter(
    (bundle) =>
      bundle.kind === "risk" &&
      (!sweepId || bundle.identity === sweepId) &&
      (!anchorId || bundle.anchor === anchorId || bundle.artifacts.sweep === anchorId),
  );
  if (matches.length !== 1)
    throw new Error(
      "Exact Risk state/sweep owner is unavailable or ambiguous; latest was not substituted.",
    );
  const selected = matches[0],
    identity = selected.identity,
    sweepRef = selected.artifacts.sweep,
    selectedStateRef = selected.artifacts.state;
  if (
    !identity ||
    !sweepRef ||
    !selectedStateRef ||
    selected.anchor !== selectedStateRef ||
    catalog.routes["/risk-manager/sweep?sweep_id=" + identity] !== sweepRef ||
    catalog.routes["/risk-manager/state?sweep_id=" + identity] !== selectedStateRef
  )
    throw new Error("Pinned Risk route pair is not an exact declared owner.");
  const artifacts: ReplayManifest["artifacts"] = { ...base.artifacts };
  const add = (id: string, entry: ReplayEntry) => {
    const prior = artifacts[id];
    if (prior && stable(prior) !== stable(entry))
      throw new Error("Duplicate Risk evidence metadata differs from its admitted binding.");
    artifacts[id] = entry;
  };
  for (const [id, entry] of Object.entries(catalog.bindings)) add(id, entry);
  type Monitoring = {
    artifacts: Readonly<Record<string, { artifact_id: string; entry: ReplayEntry }>>;
    health_history: Readonly<Record<string, ReplayEntry>>;
  };
  for (const bundle of (MONITORING_CATALOG as unknown as { bundles: readonly Monitoring[] })
    .bundles) {
    for (const binding of Object.values(bundle.artifacts)) add(binding.artifact_id, binding.entry);
    for (const [id, entry] of Object.entries(bundle.health_history)) add(id, entry);
  }
  const routes = { ...base.routes };
  for (const [route, id] of Object.entries(catalog.routes)) {
    if (routes[route] && routes[route] !== id)
      throw new Error("Risk route metadata changed between checked snapshots.");
    routes[route] = id;
  }
  const manifest = validateReplayManifest({ ...base, artifacts, routes });
  const declaredBytes = (id: string) => {
    const entry = manifest.artifacts[id];
    if (!entry || entry.status !== "AVAILABLE" || entry.bytes <= 0 || entry.bytes > 128 * 1024)
      throw new Error("Risk artifact is outside its admitted read bound.");
    return entry.bytes;
  };
  let riskBytes = declaredBytes(sweepRef) + declaredBytes(selectedStateRef);
  riskBudget(riskBytes);
  const [receipt, selectedState] = await Promise.all([
    readChecked(sweepRef, manifest, signal),
    readChecked(selectedStateRef, manifest, signal),
  ]);
  if (receipt.kind !== "risk-sweep" || selectedState.kind !== "risk-state")
    throw new Error("Risk route kind substituted.");
  const sweep = receipt,
    stateRef = sweep.payload.state_ref;
  if (selectedStateRef !== stateRef)
    throw new Error("Risk receipt/state route pair is not atomic.");
  const state: State = selectedState;
  if (
    sweep.payload.sweep_id !== identity ||
    (sweepId && sweep.payload.sweep_id !== sweepId) ||
    sweep.evidence_cutoff !== selected.cutoff
  )
    throw new Error("Sweep selector or owning cutoff substituted.");
  if (
    sweep.payload.status !== "FAILED" &&
    (state.payload.sweep_fingerprint !== sweep.payload.fingerprint ||
      state.payload.policy.sha256 !== sweep.payload.policy_sha256 ||
      state.evidence_cutoff !== sweep.evidence_cutoff ||
      state.published_at !== sweep.published_at)
  )
    throw new Error("Risk state/sweep lineage mismatch.");
  let stateSweep: Sweep = sweep,
    stateSweepRef = sweepRef;
  const compactState = state.payload.issues.some(
    (issue) =>
      issue.evidence_refs.length === 1 && issue.evidence_refs[0].type === "RISK_OBSERVATION",
  );
  if (compactState && sweep.payload.status === "FAILED") {
    let parent = sweep.payload.prior_sweep_ref;
    const visited = new Set([sweepRef]);
    let found = false;
    while (parent) {
      if (visited.has(parent)) throw new Error("Risk source receipt history cycle.");
      visited.add(parent);
      const bytes = declaredBytes(parent);
      riskBudget(riskBytes + bytes);
      riskBytes += bytes;
      const ancestor = await readChecked(parent, manifest, signal);
      if (ancestor.kind !== "risk-sweep" || ancestor.payload.state_ref !== stateRef)
        throw new Error("Failure source receipt changed the last valid state.");
      if (ancestor.payload.status !== "FAILED") {
        stateSweep = ancestor;
        stateSweepRef = parent;
        found = true;
        break;
      }
      parent = ancestor.payload.prior_sweep_ref;
    }
    if (
      !found ||
      state.payload.sweep_fingerprint !== stateSweep.payload.fingerprint ||
      state.evidence_cutoff !== stateSweep.evidence_cutoff ||
      state.published_at !== stateSweep.published_at ||
      state.payload.policy.sha256 !== stateSweep.payload.policy_sha256
    )
      throw new Error("Last valid state source receipt substituted.");
  }
  for (const issue of state.payload.issues) checkedIssueReferences(issue, stateSweep);
  cancelled(signal);
  return { state, sweep, stateSweep, manifest, stateRef, sweepRef, stateSweepRef };
}
const LocalRiskLab = lazy(() => import("@/components/risk/LocalRiskLab"));
const PARTITIONS = [
  ["CURRENT_REAL", "Current real"],
  ["UNAVAILABLE", "Unavailable"],
  ["HISTORICAL", "Historical"],
  ["SYNTHETIC", "Retained synthetic"],
  ["RESOLVED", "Resolved"],
] as const;
export function RiskWorkspace() {
  const mode = useDataMode();
  const { context, updateContext, updateView, registerBindings } = useInvestigation();
  const riskView: RiskView =
    context.view.workspace === "risk" ? context.view : { workspace: "risk" };
  const anchorId = context.anchor?.artifactId,
    sweepId = riskView.sweepId,
    selected = riskView.issueId ?? null;
  const view = riskView.partition ?? "CURRENT_REAL",
    category = riskView.category ?? "ALL",
    severity = riskView.severity ?? "ALL",
    country = riskView.country ?? context.market ?? "ALL",
    status = riskView.status ?? "ALL",
    evidenceClass = riskView.evidenceClass ?? "ALL",
    query = riskView.query ?? "";
  const [labOpen, setLabOpen] = useState(false);
  const tab = labOpen && mode === "live" ? "lab" : (riskView.panel ?? "feed");
  const [loaded, setLoaded] = useState<{
    bundle: RetainedRiskBundle;
    mode: string;
    latest: boolean;
  } | null>(null);
  const loadedRef = useRef<typeof loaded>(null),
    latestContext = useRef(context);
  latestContext.current = context;
  const updateContextRef = useRef(updateContext);
  updateContextRef.current = updateContext;
  const [error, setError] = useState<string | null>(null),
    [coverageAuthorized, setCoverageAuthorized] = useState<string | null>(null);
  const foreignAnchor = !!anchorId && !/^risk:(state|sweep):[a-f0-9]{64}$/.test(anchorId);
  const unsupportedSubject = context.subject?.kind === "reference-listing";
  const matchesSelection = (item: NonNullable<typeof loaded>) =>
    item.mode === mode &&
    !foreignAnchor &&
    !unsupportedSubject &&
    (!anchorId || anchorId === item.bundle.stateRef || anchorId === item.bundle.sweepRef) &&
    (!sweepId || sweepId === item.bundle.sweep.payload.sweep_id) &&
    (!!anchorId || !!sweepId || item.latest);
  const bundle = loaded && matchesSelection(loaded) ? loaded.bundle : null;
  useEffect(() => {
    if (foreignAnchor || unsupportedSubject) {
      setLoaded(null);
      setError(
        foreignAnchor
          ? "CONTEXT NOT APPLICABLE: the selected artifact belongs to another workspace. No Risk payload was selected."
          : "CONTEXT NOT APPLICABLE: this reference listing has no admitted Risk assessment. Clear the listing or explicitly choose a country filter.",
      );
      return;
    }
    const prior = loadedRef.current;
    if (
      prior &&
      prior.mode === mode &&
      (!anchorId || anchorId === prior.bundle.stateRef || anchorId === prior.bundle.sweepRef) &&
      (!sweepId || sweepId === prior.bundle.sweep.payload.sweep_id) &&
      (!!anchorId || !!sweepId || prior.latest)
    ) {
      setLoaded(prior);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoaded(null);
    setError(null);
    void loadRiskSelection(controller.signal, anchorId, sweepId)
      .then((next) => {
        if (controller.signal.aborted) return;
        const item = { bundle: next, mode, latest: !anchorId && !sweepId };
        loadedRef.current = item;
        setLoaded(item);
        if (!anchorId && !sweepId) {
          const current = latestContext.current;
          if (current.view.workspace === "risk" && !current.anchor && !current.view.sweepId)
            updateContextRef.current(
              {
                ...current,
                anchor: { artifactId: next.stateRef ?? next.sweepRef },
                view: { ...current.view, sweepId: next.sweep.payload.sweep_id },
              },
              "replace",
            );
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Risk evidence unavailable.");
      });
    return () => controller.abort();
  }, [mode, anchorId, sweepId, foreignAnchor, unsupportedSubject]);
  const issues: Issue[] = useMemo(
    () =>
      bundle
        ? [
            ...(bundle.state?.payload.issues ?? []),
            ...(bundle.sweep.payload.failure ? [bundle.sweep.payload.failure.issue] : []),
          ]
        : [],
    [bundle],
  );
  const real = issues.filter((issue) => partition(issue) === "CURRENT_REAL");
  const filtered = useMemo(
    () => filterIssues(issues, { view, category, severity, country, status, evidenceClass, query }),
    [issues, view, category, severity, country, status, evidenceClass, query],
  );
  const current = issues.find((issue) => issue.issue_id === selected) ?? null;
  const close = useCallback(() => updateView({ issueId: undefined }, "push"), [updateView]);
  const choosePanel = (panel: string) => {
    if (panel === "lab") {
      setLabOpen(true);
      return;
    }
    setLabOpen(false);
    if (panel === "coverage") setCoverageAuthorized(bundle?.sweepRef ?? null);
    updateView({ panel: panel as RiskView["panel"] }, "push");
  };
  const chooseCountry = (value: RiskView["country"]) => {
    const market = value === "US" || value === "INDIA" ? value : undefined;
    const next = { ...context, market, view: { ...riskView, country: value } };
    if (
      context.subject &&
      (context.subject.kind === "reference-listing" ||
        !market ||
        subjectMarket(context.subject) !== market)
    )
      delete next.subject;
    updateContext(next, "push");
  };
  const chooseSweep = (id?: string) =>
    updateContext(
      {
        ...context,
        anchor: undefined,
        view: { ...riskView, panel: "feed", sweepId: id, issueId: undefined },
      },
      "push",
    );
  const registered = useMemo(() => {
    if (!bundle) return null;
    const owner = bundle.stateSweepRef;
    const bindings: ContextBindings = {
      resolveArtifact: (id) => {
        const entry = bundle.manifest.artifacts[id];
        return entry ? { status: entry.status, kind: entry.kind } : undefined;
      },
      hasSelection: (candidate) => {
        const view = candidate.view;
        return (
          view.workspace === "risk" &&
          (!candidate.anchor ||
            candidate.anchor.artifactId === bundle.stateRef ||
            candidate.anchor.artifactId === bundle.sweepRef) &&
          (!view.sweepId || view.sweepId === bundle.sweep.payload.sweep_id) &&
          (!view.issueId || issues.some((issue) => issue.issue_id === view.issueId))
        );
      },
      hasOrigin: (origin) =>
        origin.kind === "risk-issue"
          ? !!owner &&
            origin.stateArtifactId === bundle.stateRef &&
            origin.sweepArtifactId === owner &&
            !!bundle.state?.payload.issues.some((issue) => issue.issue_id === origin.issueId)
          : origin.kind === "artifact" &&
            (origin.artifactId === bundle.stateRef || origin.artifactId === bundle.sweepRef),
    };
    const selection: VerifiedSelection = {
      artifactId: bundle.stateRef ?? bundle.sweepRef,
      clocks: [
        {
          label: "Evidence cutoff",
          value: bundle.state?.evidence_cutoff ?? bundle.sweep.evidence_cutoff,
        },
        {
          label: bundle.state ? "Published state" : "Published sweep",
          value: bundle.state?.published_at ?? bundle.sweep.published_at,
        },
        ...(bundle.sweep.payload.status === "FAILED"
          ? [{ label: "Failed sweep published", value: bundle.sweep.published_at }]
          : []),
      ],
      limitations: [
        "Immutable retained Risk metadata; unavailable checks do not imply a clear assessment.",
      ],
    };
    const enrich = (candidate: InvestigationContext): InvestigationContext => {
      if (candidate.view.workspace !== "risk" || !bindings.hasSelection?.(candidate))
        return candidate;
      const selectedIssue = candidate.view.issueId;
      const issue = selectedIssue
        ? bundle.state?.payload.issues.find((item) => item.issue_id === selectedIssue)
        : undefined;
      return {
        ...candidate,
        anchor: { artifactId: bundle.stateRef ?? bundle.sweepRef },
        view: { ...candidate.view, sweepId: bundle.sweep.payload.sweep_id },
        ...(issue && bundle.stateRef && owner
          ? {
              origin: {
                kind: "risk-issue",
                issueId: issue.issue_id,
                stateArtifactId: bundle.stateRef,
                sweepArtifactId: owner,
              } as const,
            }
          : {}),
      };
    };
    return { bindings, selection, enrich };
  }, [bundle, issues]);
  useEffect(
    () =>
      registered
        ? registerBindings(registered.bindings, registered.selection, registered.enrich)
        : undefined,
    [registered, registerBindings],
  );
  return (
    <div data-risk-workspace className="mx-auto w-full max-w-[1680px] space-y-4 p-3 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-4">
        <div>
          <p className="mono-caps text-[9px] text-primary">F3 / EVIDENCE-DRIVEN IMMUNE SYSTEM</p>
          <h1 className="mt-2 font-mono text-2xl font-medium tracking-tight md:text-3xl">
            RISK MANAGER
          </h1>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
            Retained evidence. Deterministic rules. Immutable findings. Public portfolio checks are
            unavailable.
          </p>
        </div>
        <div className="border border-primary/40 bg-primary/5 px-4 py-3">
          <p className="mono-caps text-[10px] text-primary">
            {error
              ? "EVIDENCE UNAVAILABLE"
              : bundle?.sweep.payload.status === "FAILED"
                ? "SWEEP FAILED"
                : !bundle
                  ? "VERIFYING EVIDENCE"
                  : bundle.sweep.payload.status === "SUCCEEDED"
                    ? "EVIDENCE EVALUATED"
                    : "PARTIAL COVERAGE"}
          </p>
          <p className="mt-1 font-mono text-[9px] text-faint">
            NO UNMEASURED CHECK IS ASSUMED CLEAR
          </p>
        </div>
      </header>
      <nav
        aria-label="Risk workspace panels"
        className="flex flex-wrap gap-1 border-b border-divider pb-3"
      >
        {[
          ["feed", "Issue console"],
          ["coverage", "Coverage"],
          ["history", "Sweep history"],
          ...(mode === "live" ? [["lab", "Local paper book / risk lab"]] : []),
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => choosePanel(key)}
            aria-current={tab === key ? "page" : undefined}
            className={
              "mono-caps border px-3 py-2 text-[9px] " +
              (tab === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-divider text-muted-foreground")
            }
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "lab" && mode === "live" ? (
        <Suspense
          fallback={
            <p className="p-6 text-muted-foreground">Loading authenticated local paper lab…</p>
          }
        >
          <LocalRiskLab />
        </Suspense>
      ) : (
        <>
          {error && (
            <div role="alert" className="border border-down/40 bg-down/5 p-4">
              <h2 className="mono-caps text-[11px] text-down">RISK EVIDENCE LOAD FAILED</h2>
              <p className="mt-2 text-sm">{error}</p>
              {unsupportedSubject && (
                <button
                  className="mt-3 text-primary underline"
                  onClick={() => updateContext({ ...context, subject: undefined }, "push")}
                >
                  Clear unsupported listing
                </button>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                No successful assessment is inferred. The page will not substitute zero Issues.
              </p>
            </div>
          )}
          {!bundle && !error && (
            <p
              role="status"
              className="border border-divider p-8 font-mono text-sm text-muted-foreground"
            >
              VERIFYING SEALED STATE / RECEIPT…
            </p>
          )}
          {bundle && (
            <>
              {selected && !current && (
                <p role="alert" className="border border-down/40 p-3 text-sm">
                  ISSUE UNAVAILABLE IN THIS EXACT STATE. The requested Issue was not replaced or
                  inferred resolved.
                </p>
              )}
              {(anchorId || sweepId) && (
                <div className="flex flex-wrap justify-between gap-2 border border-divider p-3 font-mono text-[10px]">
                  <span>HISTORIC SWEEP · EXACT RETAINED STATE / INPUTS / POLICY</span>
                  <button onClick={() => chooseSweep(undefined)} className="text-primary underline">
                    Return to latest sweep
                  </button>
                </div>
              )}
              {bundle.sweep.payload.failure && (
                <div role="alert" className="border border-down/50 bg-down/5 p-4">
                  <h2 className="mono-caps text-[11px] text-down">
                    FAILED SWEEP · PREVIOUS STATE RETAINED
                  </h2>
                  <p className="mt-2 text-[12px]">{bundle.sweep.payload.failure.issue.reason}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Last valid publication: {stamp(bundle.state?.published_at ?? null)}. No prior
                    Issue was resolved by this failure.
                  </p>
                </div>
              )}
              <section
                aria-label="Immune status"
                className="grid grid-cols-2 border border-divider bg-raised/30 lg:grid-cols-4"
              >
                {[
                  [
                    String(real.length),
                    "CURRENT REAL FINDINGS",
                    real.filter((i) => ["HIGH", "CRITICAL"].includes(i.severity)).length +
                      " HIGH / CRITICAL",
                  ],
                  [
                    String(issues.filter((i) => partition(i) === "UNAVAILABLE").length),
                    "UNAVAILABLE FINDINGS",
                    "NOT EVALUATED ≠ CLEAR",
                  ],
                  [
                    stamp(bundle.sweep.evidence_cutoff),
                    "EVIDENCE CUTOFF",
                    "PINNED · NO WALL-CLOCK AGING",
                  ],
                  [
                    stamp(bundle.sweep.published_at),
                    "LAST PUBLISHED SWEEP",
                    bundle.sweep.payload.status,
                  ],
                ].map(([value, label, detail]) => (
                  <div key={label} className="min-w-0 border-b border-r border-divider p-4">
                    <p className="mono-caps text-[8px] text-faint">{label}</p>
                    <p
                      className={
                        "mt-2 font-mono " +
                        (label.includes("FINDINGS") ? "text-3xl" : "text-[11px] leading-relaxed")
                      }
                    >
                      {value}
                    </p>
                    <p className="mono-caps mt-2 text-[7px] text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </section>
              {tab === "feed" && (
                <>
                  <div className="flex flex-wrap gap-1">
                    {PARTITIONS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => {
                          updateView({ partition: key }, "push");
                        }}
                        aria-pressed={view === key}
                        className={
                          "border px-3 py-2 font-mono text-[10px] " +
                          (view === key
                            ? "border-primary text-primary"
                            : "border-divider text-faint")
                        }
                      >
                        {label}{" "}
                        <span className="ml-1">
                          {issues.filter((i) => partition(i) === key).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-[minmax(200px,1fr)_repeat(5,auto)]">
                    <input
                      aria-label="Search risk issues"
                      maxLength={160}
                      placeholder="Search subject, rule or finding"
                      value={query}
                      onChange={(e) => updateView({ query: e.target.value }, "replace")}
                      className="col-span-2 border border-divider bg-background px-3 py-2 text-[11px] md:col-span-1"
                    />
                    <select
                      aria-label="Issue category"
                      value={category}
                      onChange={(e) =>
                        updateView({ category: e.target.value as RiskView["category"] }, "push")
                      }
                      className="border border-divider bg-background p-2 font-mono text-[9px]"
                    >
                      {[
                        "ALL",
                        "DATA",
                        "MODEL",
                        "PORTFOLIO",
                        "RESEARCH_HYGIENE",
                        "SIMULATOR",
                        "SYSTEM",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Issue severity"
                      value={severity}
                      onChange={(e) =>
                        updateView({ severity: e.target.value as RiskView["severity"] }, "push")
                      }
                      className="border border-divider bg-background p-2 font-mono text-[9px]"
                    >
                      {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Issue country"
                      value={country}
                      onChange={(e) => chooseCountry(e.target.value as RiskView["country"])}
                      className="border border-divider bg-background p-2 font-mono text-[9px]"
                    >
                      {["ALL", "US", "INDIA", "CROSS_MARKET", "NONE"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Issue status"
                      value={status}
                      onChange={(e) =>
                        updateView({ status: e.target.value as RiskView["status"] }, "push")
                      }
                      className="border border-divider bg-background p-2 font-mono text-[9px]"
                    >
                      {["ALL", "OPEN", "RESOLVED"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Issue evidence class"
                      value={evidenceClass}
                      onChange={(e) =>
                        updateView(
                          { evidenceClass: e.target.value as RiskView["evidenceClass"] },
                          "push",
                        )
                      }
                      className="col-span-2 border border-divider bg-background p-2 font-mono text-[9px] md:col-span-1"
                    >
                      {["ALL", "REAL_RETAINED", "UNAVAILABLE", "RETAINED_SYNTHETIC"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  {current && !filtered.some((issue) => issue.issue_id === current.issue_id) && (
                    <p role="status" className="border border-divider p-3 text-[11px]">
                      Selected Issue is outside these filters. Its exact retained details remain
                      open.
                    </p>
                  )}
                  <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <IssueFeed
                      issues={filtered}
                      selected={selected}
                      onSelect={(id) => updateView({ issueId: id }, "push")}
                    />
                    <IssueInspector
                      key={selected ?? "none"}
                      issue={current}
                      bundle={bundle}
                      onClose={close}
                    />
                  </div>
                  <div className="border border-divider bg-raised/20 p-4 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="mono-caps mr-3 text-[9px] text-primary">
                      COVERAGE BOUNDARY
                    </span>
                    PSI / KS, calibration drift, consumer abstention receipts, public VaR / CVaR,
                    concentration, factor exposure, liquidity and real simulator disagreement remain
                    unavailable.
                    <button
                      onClick={() => choosePanel("coverage")}
                      className="ml-3 text-primary underline underline-offset-4"
                    >
                      Inspect all retained check slots →
                    </button>
                  </div>
                </>
              )}
              {tab === "coverage" &&
                (coverageAuthorized === bundle.sweepRef ? (
                  <CoverageMatrix bundle={bundle} />
                ) : (
                  <section className="border border-divider p-5">
                    <h2 className="mono-caps text-[11px]">COMPLETE RETAINED CHECK SLOTS</h2>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      The selected state and receipt are verified. Open the complete coverage
                      evidence explicitly.
                    </p>
                    <button
                      className="mt-3 text-primary underline"
                      onClick={() => setCoverageAuthorized(bundle.sweepRef)}
                    >
                      Inspect complete coverage
                    </button>
                  </section>
                ))}
              {tab === "changes" && (
                <p role="status" className="border border-divider p-5">
                  Changes require a verified compatible second anchor. No comparison was inferred.
                </p>
              )}
              {tab === "history" && (
                <SweepHistory bundle={bundle} onSelect={(id) => chooseSweep(id)} />
              )}
              <footer className="flex flex-wrap justify-between gap-2 border-t border-divider pt-3 font-mono text-[8px] leading-relaxed text-faint">
                <span>DERIVED METADATA ONLY · CLAIMS CLOSED · NO REAL USER PORTFOLIO</span>
                <span>MANUAL SWEEP AVAILABLE / SCHEDULE DISABLED · D6 DEFERRED</span>
              </footer>
            </>
          )}
        </>
      )}
    </div>
  );
}
