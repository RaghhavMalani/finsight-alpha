import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useDataMode } from "../replay/mode";
import { CUTOFFS, KNOWN_IDS, KNOWN_METADATA_ENTRIES, type Country } from "./contracts";
import { useInvestigation, type VerifiedSelection } from "../app/terminal/TerminalShell";
import { subjectTicker, type InvestigationContext } from "../app/terminal/context";
import type { ContextBindings } from "../app/terminal/compatibility";
import type { ReplayEntry } from "../replay/contracts";
import { useFactorMetadata } from "./query";
import { EvidenceCatalogue } from "./EvidenceCatalogue";
import { OutputAudit } from "./OutputAudit";
import { EvidenceLedger } from "./EvidenceLedger";
import "./factors.css";
const Diagnostics = lazy(() =>
    import("./RetainedDiagnostics").then((m) => ({ default: m.RetainedDiagnostics })),
  ),
  Drawer = lazy(() => import("./LineageDrawer").then((m) => ({ default: m.LineageDrawer })));
type FactorPanel = "catalog" | "audit" | "ledger";
function factorSelection(context: InvestigationContext) {
  if (context.view.workspace !== "factors") throw new Error("Wrong Factor workspace context.");
  const view = context.view;
  let anchorCountry: string | undefined,
    anchorCutoff: string | undefined,
    anchorKind: string | undefined;
  if (context.anchor) {
    const owners = Object.entries(KNOWN_IDS).flatMap(([key, ids]) =>
      Object.entries(ids)
        .filter(([, id]) => id === context.anchor!.artifactId)
        .map(([kind]) => ({ key, kind })),
    );
    if (owners.length !== 1)
      throw new Error("Exact Factor anchor unavailable; latest was not substituted.");
    [anchorCountry, anchorCutoff] = owners[0].key.split("|");
    anchorKind = owners[0].kind;
    if (
      (context.market && context.market !== anchorCountry) ||
      (view.cutoff && view.cutoff !== anchorCutoff)
    )
      throw new Error("Factor anchor and requested country/cutoff disagree.");
  }
  const country = (context.market ?? anchorCountry ?? "US") as Country,
    cutoff =
      view.cutoff ?? anchorCutoff ?? [...CUTOFFS].sort((a, b) => Date.parse(b) - Date.parse(a))[0],
    panel: FactorPanel =
      view.panel === "audit" || view.panel === "ledger"
        ? view.panel
        : !view.panel && (anchorKind === "audit" || anchorKind === "ledger")
          ? anchorKind
          : "catalog";
  if (!["US", "INDIA"].includes(country) || !CUTOFFS.includes(cutoff as (typeof CUTOFFS)[number]))
    throw new Error("Country or cutoff has no exact retained binding.");
  if (anchorKind && anchorKind !== panel)
    throw new Error(
      "The selected Factor anchor does not own this panel; choose its explicit reviewed view.",
    );
  return { country, cutoff, panel, artifactId: KNOWN_IDS[country + "|" + cutoff][panel] };
}
export function FactorsWorkspace() {
  const investigation = useInvestigation(),
    { context, registerBindings, updateContext } = investigation,
    mode = useDataMode(),
    selection = useMemo(() => {
      try {
        return { value: factorSelection(context), error: null };
      } catch (error) {
        return {
          value: null,
          error: error instanceof Error ? error.message : "Factor selection unavailable.",
        };
      }
    }, [context]),
    country = selection.value?.country ?? "US",
    cutoff = selection.value?.cutoff ?? CUTOFFS[CUTOFFS.length - 1],
    panel = selection.value?.panel ?? "catalog",
    valid = !!selection.value,
    view = context.view.workspace === "factors" ? context.view : { workspace: "factors" as const },
    s = { country, at: cutoff, panel, ticker: subjectTicker(context.subject) };
  const [selected, setSelected] = useState<string | null>(null),
    [lineage, setLineage] = useState(false),
    q = useFactorMetadata(panel, country, cutoff, valid);
  const actualSelected =
    view.factorId ??
    selected ??
    (context.subject?.kind === "market-factor" ? country.toLowerCase() + ":mom" : null);
  const registered = useMemo(() => {
    if (!selection.value || !q.data) return null;
    const current = selection.value,
      artifactId = current.artifactId,
      bindings: ContextBindings = {
        resolveArtifact: (id) => {
          const entry = KNOWN_METADATA_ENTRIES[id] as ReplayEntry | undefined;
          if (!entry) return undefined;
          const owner = Object.entries(KNOWN_IDS)
            .find(([, ids]) => Object.values(ids).includes(id))?.[0]
            .split("|")[0] as Country | undefined;
          return { status: entry.status, kind: entry.kind, market: owner };
        },
        hasSelection: (candidate) => {
          const selectedView = candidate.view;
          return (
            selectedView.workspace === "factors" &&
            (!candidate.anchor || candidate.anchor.artifactId === artifactId) &&
            (!selectedView.cutoff || selectedView.cutoff === current.cutoff) &&
            (!selectedView.factorId ||
              (q.data.kind === "catalog" &&
                q.data.value.payload.items.some(
                  (item) => item.factor_id === selectedView.factorId,
                )))
          );
        },
        hasOrigin: (origin) => origin.kind === "artifact" && origin.artifactId === artifactId,
      },
      verified: VerifiedSelection = {
        artifactId,
        clocks: [{ label: "Factor evidence cutoff", value: q.data.value.evidence_cutoff }],
        limitations: [
          "Read-only retained Factor metadata for this exact country and evidence cutoff. No listing-level assessment is inferred.",
        ],
      };
    return {
      bindings,
      selection: verified,
      enrich: (candidate: InvestigationContext): InvestigationContext => {
        if (candidate.view.workspace !== "factors" || !bindings.hasSelection?.(candidate))
          return candidate;
        return {
          ...candidate,
          anchor: { artifactId },
          market: current.country,
          subject: candidate.subject ?? {
            kind: "market-factor",
            id: current.country === "INDIA" ? "IN-MKT" : "US-MKT",
          },
          view: { ...candidate.view, cutoff: current.cutoff },
        };
      },
    };
  }, [selection, q.data]);
  useEffect(
    () =>
      registered
        ? registerBindings(registered.bindings, registered.selection, registered.enrich)
        : undefined,
    [registered, registerBindings],
  );
  useEffect(() => {
    if (registered && !context.anchor) updateContext(registered.enrich(context), "replace");
  }, [registered, context, updateContext]);
  const go = (next: Record<string, string>) => {
    const nextCountry = (next.country ?? country) as Country,
      nextCutoff = next.at ?? cutoff,
      nextPanel = (next.panel ?? panel) as FactorPanel,
      artifactId = KNOWN_IDS[nextCountry + "|" + nextCutoff]?.[nextPanel];
    if (!artifactId) return;
    updateContext(
      {
        ...context,
        market: nextCountry,
        subject: next.country
          ? { kind: "market-factor", id: nextCountry === "INDIA" ? "IN-MKT" : "US-MKT" }
          : context.subject,
        anchor: { artifactId },
        compare: undefined,
        observationDate: undefined,
        view: {
          workspace: "factors",
          panel: nextPanel,
          cutoff: nextCutoff,
          ...(view.factorId && !next.country ? { factorId: view.factorId } : {}),
        },
      },
      "push",
    );
  };
  return (
    <section
      className="factor-workspace"
      data-factor-workspace
      data-state={!valid || q.error ? "unavailable" : q.isPending ? "loading" : "ready"}
    >
      <header className="factor-title">
        <div>
          <span className="factor-eyebrow">F5 / FACTOR EVIDENCE</span>
          <h1>Know what the evidence permits.</h1>
          <p>US + India · source catalogue, output audit and sealed assessments</p>
        </div>
        <div className="factor-stamp">
          <b>{mode === "replay" ? "REAL · REPLAY" : "LOCAL · LIVE"}</b>
          <span>READ ONLY · NO NEW MODEL RUN</span>
          <small>F5 refresh and F7 caret browsing remain native</small>
        </div>
      </header>
      <div className="factor-controls">
        <label>
          Country
          <select
            aria-label="Factor country"
            value={valid ? country : ""}
            onChange={(e) =>
              go({ country: e.target.value, ticker: e.target.value === "US" ? "US-MKT" : "IN-MKT" })
            }
          >
            {!valid && <option value="">Invalid selection</option>}
            <option value="US">United States</option>
            <option value="INDIA">India</option>
          </select>
        </label>
        <label>
          Sealed cutoff
          <select
            aria-label="Factor cutoff"
            value={valid ? cutoff : ""}
            onChange={(e) => go({ at: e.target.value })}
          >
            {!valid && <option value="">Unavailable cutoff</option>}
            {CUTOFFS.map((c) => (
              <option key={c} value={c}>
                {c.replace("T", " ").replace("Z", " UTC")}
              </option>
            ))}
          </select>
        </label>
        <span className="factor-context">
          Terminal context <b>{s.ticker ?? "No ticker"}</b>
          <small>
            {["US-MKT", "IN-MKT"].includes(s.ticker ?? "")
              ? "Market factor, not a ticker"
              : "No retained ticker-level factor assessment"}
          </small>
        </span>
      </div>
      {!valid ? (
        <div className="factor-panel factor-empty">
          <h2>UNAVAILABLE / unreviewed selection</h2>
          <p role="alert">{selection.error} Choose an explicit reviewed selection.</p>
        </div>
      ) : q.isPending ? (
        <div className="factor-panel">
          <p role="status">Checking metadata, hashes and archive bindings…</p>
        </div>
      ) : q.error || !q.data ? (
        <div className="factor-panel factor-empty">
          <h2>Factor evidence unavailable</h2>
          <p role="alert">{q.error?.message ?? "No reviewed evidence"}</p>
          <p>
            No local runtime is installed. No database, capture or model is created to populate this
            view.
          </p>
          <button onClick={() => q.refetch()}>Retry evidence</button>
        </div>
      ) : (
        <>
          <div className="factor-overview">
            <div>
              <strong>20</strong>
              <span>audited definitions</span>
            </div>
            <div>
              <strong>64</strong>
              <span>55 current + 9 derived channels</span>
            </div>
            <div>
              <strong>
                4 <small>/ 64</small>
              </strong>
              <span>retained views of ONE assessment</span>
            </div>
            <div>
              <strong>0</strong>
              <span>new runs / captures / openings</span>
            </div>
          </div>
          <div className="factor-warning">
            <b>
              {country === "INDIA"
                ? "INDIA · CAPTURE ONLY · CALENDAR UNAVAILABLE · STALE INPUT"
                : "US · CAPTURE ONLY"}
            </b>
            <span>
              Retained MOM against MKT / SMB / HML · DIAGNOSTIC_ASYMPTOTIC · NOT CALIBRATED
            </span>
          </div>
          <nav className="factor-tabs" aria-label="Factor evidence panels">
            {["catalog", "audit", "ledger"].map((t) => (
              <button
                key={t}
                aria-current={s.panel === t ? "page" : undefined}
                onClick={() => go({ panel: t })}
              >
                {
                  (
                    {
                      catalog: "Catalogue",
                      audit: "Output audit",
                      ledger: "Evidence ledger",
                    } as Record<string, string>
                  )[t]
                }
              </button>
            ))}
            <button onClick={() => setLineage(true)}>Lineage ↗</button>
          </nav>
          {q.data.kind === "catalog" ? (
            <>
              <EvidenceCatalogue
                data={q.data.value}
                selected={actualSelected}
                onSelect={setSelected}
              />
              <Suspense fallback={<p>Loading diagnostic view…</p>}>
                <Diagnostics
                  country={country}
                  cutoff={cutoff}
                  selected={actualSelected === country.toLowerCase() + ":mom"}
                  onLineage={() => setLineage(true)}
                />
              </Suspense>
              <section className="factor-panel factor-unavailable">
                <h2>Analytics without an approved contract</h2>
                <div>
                  {q.data.value.payload.unavailable_analytics.map((item) => (
                    <article key={item.id}>
                      <b>{item.id.replaceAll("_", " ")}</b>
                      <span>UNAVAILABLE</span>
                      <p>
                        {item.reason_code.replaceAll("_", " ")}
                        <br />
                        {item.required_evidence.join(" · ")}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : q.data.kind === "audit" ? (
            <OutputAudit data={q.data.value} />
          ) : (
            <EvidenceLedger data={q.data.value} />
          )}
          <footer className="factor-boundaries">
            <b>Scientific claims remain closed.</b>
            <span>
              Inference certification · market claims · causal claims · validated alpha · trusted
              graph · precise edge confidence: all FALSE.
            </span>
            <span>
              Research OS CLOSED / NOT CALIBRATED · replacement NOT CONFIRMED · scheduled regimes
              DISABLED / D6 DEFERRED.
            </span>
          </footer>
          {lineage && (
            <Suspense fallback={<p>Loading lineage…</p>}>
              <Drawer country={country} cutoff={cutoff} onClose={() => setLineage(false)} />
            </Suspense>
          )}
        </>
      )}
    </section>
  );
}
