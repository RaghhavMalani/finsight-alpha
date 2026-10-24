import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useDataMode } from "@/replay/mode";
import { loadRisk, type RiskBundle } from "./client";
import { filterIssues } from "./filters";
import { partition, stamp, type Issue } from "./contracts";
import { IssueFeed } from "./IssueFeed";
import { IssueInspector } from "./IssueInspector";
import { CoverageMatrix } from "./CoverageMatrix";
import { SweepHistory } from "./SweepHistory";

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
  const [tab, setTab] = useState("feed");
  const [bundle, setBundle] = useState<RiskBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState("CURRENT_REAL");
  const [category, setCategory] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [country, setCountry] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [evidenceClass, setEvidenceClass] = useState("ALL");
  const [query, setQuery] = useState("");
  const [sweepId, setSweepId] = useState<string | undefined>();
  useEffect(() => {
    const controller = new AbortController();
    setBundle(null);
    setSelected(null);
    setError(null);
    setTab("feed");
    void loadRisk(controller.signal, sweepId)
      .then((b) => {
        if (controller.signal.aborted) return;
        setBundle(b);
        if (window.matchMedia("(min-width: 1024px)").matches)
          setSelected(
            (
              b.sweep.payload.failure?.issue ??
              b.state?.payload.issues.find((i) => partition(i) === "CURRENT_REAL")
            )?.issue_id ?? null,
          );
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Risk evidence unavailable.");
      });
    return () => controller.abort();
  }, [mode, sweepId]);
  const close = useCallback(() => setSelected(null), []);
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
  const real = issues.filter((i) => partition(i) === "CURRENT_REAL");
  const filtered = useMemo(
    () => filterIssues(issues, { view, category, severity, country, status, evidenceClass, query }),
    [issues, view, category, severity, country, status, evidenceClass, query],
  );
  const current = filtered.find((i) => i.issue_id === selected) ?? null;
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
            onClick={() => setTab(key)}
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
              {sweepId && (
                <div className="flex flex-wrap justify-between gap-2 border border-divider p-3 font-mono text-[10px]">
                  <span>HISTORIC SWEEP · EXACT RETAINED STATE / INPUTS / POLICY</span>
                  <button onClick={() => setSweepId(undefined)} className="text-primary underline">
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
                          setView(key);
                          setSelected(null);
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
                      placeholder="Search subject, rule or finding"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="col-span-2 border border-divider bg-background px-3 py-2 text-[11px] md:col-span-1"
                    />
                    <select
                      aria-label="Issue category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
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
                      onChange={(e) => setSeverity(e.target.value)}
                      className="border border-divider bg-background p-2 font-mono text-[9px]"
                    >
                      {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Issue country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="border border-divider bg-background p-2 font-mono text-[9px]"
                    >
                      {["ALL", "US", "INDIA", "CROSS_MARKET", "NONE"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Issue status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="border border-divider bg-background p-2 font-mono text-[9px]"
                    >
                      {["ALL", "OPEN", "RESOLVED"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Issue evidence class"
                      value={evidenceClass}
                      onChange={(e) => setEvidenceClass(e.target.value)}
                      className="col-span-2 border border-divider bg-background p-2 font-mono text-[9px] md:col-span-1"
                    >
                      {["ALL", "REAL_RETAINED", "UNAVAILABLE", "RETAINED_SYNTHETIC"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <IssueFeed issues={filtered} selected={selected} onSelect={setSelected} />
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
                      onClick={() => setTab("coverage")}
                      className="ml-3 text-primary underline underline-offset-4"
                    >
                      Inspect all retained check slots →
                    </button>
                  </div>
                </>
              )}
              {tab === "coverage" && <CoverageMatrix bundle={bundle} />}
              {tab === "history" && (
                <SweepHistory bundle={bundle} onSelect={(id) => setSweepId(id)} />
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
