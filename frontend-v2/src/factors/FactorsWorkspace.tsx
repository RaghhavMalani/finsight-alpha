import { useState, lazy, Suspense } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useDataMode } from "../replay/mode";
import { CUTOFFS, type Country } from "./contracts";
import { useFactorMetadata } from "./query";
import { EvidenceCatalogue } from "./EvidenceCatalogue";
import { OutputAudit } from "./OutputAudit";
import { EvidenceLedger } from "./EvidenceLedger";
import "./factors.css";
const Diagnostics = lazy(() =>
    import("./RetainedDiagnostics").then((m) => ({ default: m.RetainedDiagnostics })),
  ),
  Drawer = lazy(() => import("./LineageDrawer").then((m) => ({ default: m.LineageDrawer })));
export function FactorsWorkspace() {
  const s = useSearch({ from: "/factors" }),
    mode = useDataMode();
  return <FactorSelection key={[s.country, s.at, s.ticker, mode].join("|")} />;
}
function FactorSelection() {
  const s = useSearch({ from: "/factors" }),
    navigate = useNavigate(),
    mode = useDataMode(),
    country = s.country as Country,
    cutoff = s.at,
    valid =
      ["US", "INDIA"].includes(country) && CUTOFFS.includes(cutoff as (typeof CUTOFFS)[number]);
  const [selected, setSelected] = useState<string | null>(
      ["US-MKT", "IN-MKT"].includes(s.ticker ?? "") ? country.toLowerCase() + ":mom" : null,
    ),
    [lineage, setLineage] = useState(false),
    q = useFactorMetadata(country, cutoff, valid);
  const go = (next: Record<string, string>) =>
    navigate({ to: "/factors", search: { ...s, ...next } });
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
          <p role="alert">
            Country or cutoff has no exact retained binding. Choose an explicit reviewed selection.
          </p>
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
          {s.panel === "catalog" ? (
            <>
              <EvidenceCatalogue data={q.data.catalog} selected={selected} onSelect={setSelected} />
              <Suspense fallback={<p>Loading diagnostic view…</p>}>
                <Diagnostics
                  country={country}
                  cutoff={cutoff}
                  selected={selected === country.toLowerCase() + ":mom"}
                  onLineage={() => setLineage(true)}
                />
              </Suspense>
              <section className="factor-panel factor-unavailable">
                <h2>Analytics without an approved contract</h2>
                <div>
                  {q.data.catalog.payload.unavailable_analytics.map((item) => (
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
          ) : s.panel === "audit" ? (
            <OutputAudit data={q.data.audit} />
          ) : (
            <EvidenceLedger data={q.data.ledger} />
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
