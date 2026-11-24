import { useNavigate, useSearch } from "@tanstack/react-router";
import { useDataMode } from "@/replay/mode";
import { useDataEvidence } from "./query";
import { RevisionObservatory } from "./RevisionObservatory";
import { LineageInspector } from "./LineageInspector";
import type { Cost, Coverage, Health, Issue, Lineage, Revision } from "./contracts";
import { ProvenanceProvider } from "@/visual/Num";
import { useRouteProv } from "@/visual/route-origin";
import "./data-organ.css";

const tabs = ["Health", "Revisions", "Lineage", "Costs", "Issues"] as const;
export function DataWorkspace() {
  const query = useDataEvidence(),
    mode = useDataMode();
  const search = useSearch({ from: "/data" }),
    navigate = useNavigate();
  const tab = tabs.find((t) => t.toLowerCase() === search.section) ?? "Health",
    country = search.country;
  const setTab = (value: (typeof tabs)[number]) =>
    navigate({ to: "/data", search: { ...search, section: value.toLowerCase() } });
  const setCountry = (value: string) =>
    navigate({ to: "/data", search: { ...search, country: value } });
  const H = useRouteProv("/data/health"),
    C = useRouteProv("/data/coverage"),
    I = useRouteProv("/data/issues"),
    K = useRouteProv("/data/costs"),
    V = useRouteProv("/data/revisions"),
    M = useRouteProv("/data/disagreement"),
    L = useRouteProv("/data/lineage");
  if (query.isPending)
    return (
      <section className="data-workspace">
        <h1>Data Organ</h1>
        <p role="status">Checking admitted source evidence…</p>
      </section>
    );
  if (query.error || !query.data)
    return (
      <section className="data-workspace" data-state="unavailable">
        <h1>Data evidence unavailable</h1>
        <p role="alert">{query.error?.message ?? "No admitted diagnostics"}</p>
        <button onClick={() => query.refetch()}>Retry evidence</button>
        <p>No weaker provider or calendar fallback is used.</p>
      </section>
    );
  const data = query.data,
    health = data.health.payload.items as Health[],
    coverage = data.coverage.payload.items as Coverage[],
    issues = data.issues.payload.items as Issue[],
    costs = data.costs.payload.example as Cost;
  const visible = coverage.filter(
      (row) =>
        (country === "ALL" || row.country === country) &&
        (!search.source || row.source === search.source),
    ),
    sources = new Set(visible.map((r) => r.source));
  const admitted = coverage.filter((row) => ["ADMITTED", "RETAINED"].includes(row.status)).length;
  const highIssues = issues.filter((i) => i.severity === "HIGH").length;
  const money = (ptr: string, v: string, label: string) =>
    K.N(ptr, Number(v), label, "₹" + v, {
      note: "Recorded as a decimal string; shown exactly as recorded.",
    });
  return (
    <ProvenanceProvider>
      <section className="data-workspace" data-state="ready" data-view={tab.toLowerCase()}>
        <header className="data-title">
          <div>
            <span className="data-eyebrow" data-num-exempt="key-label">
              F10 / DATA ORGAN v0.1
            </span>
            <h1>Evidence before inference.</h1>
            <p>Source health, availability clocks and immutable lineage · US + India</p>
          </div>
          <div className="data-stamp">
            <strong>{mode === "replay" ? "REAL · REPLAY" : "LOCAL · LIVE"}</strong>
            <span>
              {H.D(
                "/as_of",
                data.health.as_of,
                "Evidence as of",
                new Date(data.health.as_of).toISOString().slice(0, 19).replace("T", " "),
              )}{" "}
              UTC
            </span>
            <span>Derived diagnostics · no alpha claim</span>
          </div>
        </header>
        <div className="data-overview">
          <div>
            <b>
              {C.N("/payload/items", admitted, "Sources admitted", String(admitted), {
                formula: "count of /payload/items where status is ADMITTED or RETAINED",
              })}
              <small>
                {" "}
                /{" "}
                {C.N("/payload/items", coverage.length, "Sources", String(coverage.length), {
                  formula: "count of /payload/items",
                })}
              </small>
            </b>
            <span>sources admitted</span>
          </div>
          <div>
            <b>
              {H.N(
                "/payload/items",
                health.reduce((n, h) => n + h.quarantined, 0),
                "Observations quarantined",
                String(health.reduce((n, h) => n + h.quarantined, 0)),
                { formula: "sum of /payload/items/*/quarantined" },
              )}
            </b>
            <span>observations quarantined</span>
          </div>
          <div>
            <b>
              {I.N("/payload/items", highIssues, "Open availability issues", String(highIssues), {
                formula: "count of /payload/items where severity = HIGH",
              })}
            </b>
            <span>open availability issues</span>
          </div>
          <div>
            {/* A design property of the Data Organ (it runs no models), fixed in this page; not read from evidence. */}
            <b data-num-exempt="copy">0</b>
            <span>model runs / holdout openings</span>
          </div>
        </div>
        <nav className="data-tabs" aria-label="Data views">
          {tabs.map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
          <div className="data-country" aria-label="Country filter">
            {["ALL", "US", "INDIA"].map((c) => (
              <button key={c} aria-pressed={country === c} onClick={() => setCountry(c)}>
                {c}
              </button>
            ))}
          </div>
        </nav>
        {tab === "Health" && (
          <div className="data-health-layout">
            <div>
              <section className="data-panel">
                <h2>
                  Captured source health <span>DESCRIPTIVE</span>
                </h2>
                <div className="data-health-table">
                  <table>
                    <thead>
                      <tr>
                        <th>SOURCE / CLOCK</th>
                        <th>ROWS</th>
                        <th>INVALID</th>
                        <th>DUPLICATES</th>
                        <th>OUTLIERS</th>
                        <th>SESSION GAPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health
                        .filter((h) => sources.has(h.source))
                        .map((h) => {
                          const at = `/payload/items/${health.indexOf(h)}`;
                          return (
                            <tr key={h.diagnostic_id}>
                              <td>
                                <strong data-num-exempt="id">{h.source}</strong>
                                <span>{h.clock_quality}</span>
                                <span>
                                  {H.D(
                                    `${at}/window_start`,
                                    h.window_start,
                                    "Window start",
                                    h.window_start,
                                  )}{" "}
                                  →{" "}
                                  {H.D(
                                    `${at}/window_end`,
                                    h.window_end,
                                    "Window end",
                                    h.window_end,
                                  )}
                                </span>
                              </td>
                              <td>{H.N(`${at}/rows`, h.rows, "Rows", h.rows.toLocaleString())}</td>
                              <td className={h.quarantined ? "data-warning" : ""}>
                                {H.N(
                                  `${at}/quarantined`,
                                  h.quarantined,
                                  "Invalid (quarantined)",
                                  String(h.quarantined),
                                )}
                              </td>
                              <td>
                                {H.N(
                                  `${at}/duplicates`,
                                  h.duplicates,
                                  "Duplicates",
                                  String(h.duplicates),
                                )}
                              </td>
                              <td>
                                {H.N(
                                  `${at}/robust_outliers`,
                                  h.robust_outliers,
                                  "Robust outliers",
                                  String(h.robust_outliers),
                                )}
                                {/* The outlier rule this page states; fixed copy, not a measurement. */}
                                <span data-num-exempt="copy">10 × MAD</span>
                              </td>
                              <td
                                className={
                                  h.calendar_status === "UNAVAILABLE" ? "data-warning" : ""
                                }
                              >
                                {h.calendar_status === "NOT_APPLICABLE"
                                  ? "—"
                                  : h.missing_sessions == null
                                    ? "UNAVAILABLE"
                                    : H.N(
                                        `${at}/missing_sessions`,
                                        h.missing_sessions,
                                        "Session gaps",
                                        String(h.missing_sessions),
                                      )}
                                <span>{h.calendar_status}</span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="data-note">
                  Counts inspect captured input before cleaning. Outliers are flags, not bad-data
                  verdicts. Unsupported calendar windows keep gaps unavailable.
                </p>
              </section>
              <section className="data-panel">
                <h2>
                  Coverage registry <span>{country}</span>
                </h2>
                <div className="data-coverage">
                  {visible.map((row) => (
                    <article key={row.source}>
                      <div>
                        <strong>{row.label}</strong>
                        <span>
                          {row.country} · {row.fields.join(" / ") || "No admitted fields"}
                        </span>
                      </div>
                      <b className={row.status === "ADMITTED" ? "data-admitted" : "data-warning"}>
                        {row.status}
                      </b>
                      <p>
                        {row.reason != null ? (
                          C.T(
                            `/payload/items/${coverage.indexOf(row)}/reason`,
                            row.reason,
                            "Reason",
                          )
                        ) : (
                          <>
                            {row.clock_quality} ·{" "}
                            {C.N(
                              `/payload/items/${coverage.indexOf(row)}/rows`,
                              row.rows,
                              "Admitted observations",
                              row.rows.toLocaleString(),
                            )}{" "}
                            admitted observations · {row.licence.status}
                          </>
                        )}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
            <aside className="data-panel data-boundaries">
              <h2>Evidence boundaries</h2>
              <div>
                <b>CAPTURE_ONLY</b>
                <p>
                  French and IIMA are current revised factor releases. Their historical rows were
                  available at capture time; original release vintages are unavailable.
                </p>
              </div>
              <div>
                <b>XNSE / UNAVAILABLE</b>
                <p>
                  No official NSE session manifest supports this window. Neither weekdays nor XBOM
                  is used to fill it.
                </p>
              </div>
              <div>
                <b>MIRROR ≠ CONFIRMATION</b>
                <p>
                  ALFRED UNRATE and BLS share one economic upstream. Their discrepancy is a
                  consistency check.
                </p>
              </div>
              <div>
                <b>RESTRICTED / LOCAL</b>
                <p>
                  Alpaca IEX, Yahoo, NSE prices and VIX remain unavailable publicly. RBI / MOSPI
                  publication permissions remain unresolved.
                </p>
              </div>
              <button onClick={() => setTab("Issues")}>Inspect retained issues →</button>
            </aside>
          </div>
        )}
        {tab === "Revisions" && (
          <RevisionObservatory
            revision={data.revisions.payload.summary as Revision}
            mirror={data.disagreement.payload.summary as Record<string, unknown>}
            V={V}
            M={M}
            cutoff={search.cutoff}
            onCutoff={(cutoff) => navigate({ to: "/data", search: { ...search, cutoff } })}
            country={country}
          />
        )}
        {tab === "Lineage" && (
          <LineageInspector
            items={(data.lineage.payload.items as Lineage[]).filter((r) =>
              sources.has(r.source.source),
            )}
            ptrOf={(item) =>
              `/payload/items/${(data.lineage.payload.items as Lineage[]).indexOf(item)}`
            }
            L={L}
          />
        )}
        {tab === "Costs" && (
          <section className="data-panel">
            <h2>
              India cost evidence <span>NSE CASH EQUITY</span>
            </h2>
            <p>
              {K.T("/payload/label", String(data.costs.payload.label), "Example")} ·{" "}
              {K.D("/payload/example/trade_date", costs.trade_date, "Trade date", costs.trade_date)}
            </p>
            <div className="data-metrics">
              <div>
                <b>
                  {money(
                    "/payload/example/statutory_subtotal",
                    costs.statutory_subtotal,
                    "Statutory subtotal",
                  )}
                </b>
                <span>Statutory subtotal · {costs.statutory_status}</span>
              </div>
              <div>
                <b>
                  {costs.all_in_estimated_trading_cost === null
                    ? "UNAVAILABLE"
                    : money(
                        "/payload/example/all_in_estimated_trading_cost",
                        costs.all_in_estimated_trading_cost,
                        "All-in estimated trading cost",
                      )}
                </b>
                <span>All-in estimated trading cost · {costs.all_in_status}</span>
              </div>
            </div>
            <div className="data-cost-components">
              {costs.components.map((c, ci) => (
                <article key={c.name}>
                  <strong>{c.name}</strong>
                  <b>
                    {c.amount === null
                      ? "UNAVAILABLE"
                      : money(`/payload/example/components/${ci}/amount`, c.amount, c.name)}
                  </b>
                  <p>
                    {c.reason != null ? (
                      K.T(`/payload/example/components/${ci}/reason`, c.reason, "Reason")
                    ) : (
                      <>
                        {K.D(
                          `/payload/example/components/${ci}/effective_from`,
                          c.effective_from,
                          "Effective from",
                          c.effective_from ?? undefined,
                        )}{" "}
                        →{" "}
                        {K.D(
                          `/payload/example/components/${ci}/evidenced_through`,
                          c.evidenced_through,
                          "Evidenced through",
                          c.evidenced_through ?? undefined,
                        )}
                      </>
                    )}
                  </p>
                  {c.evidence && (
                    <a href={c.evidence.source_url} target="_blank" rel="noreferrer">
                      Primary evidence ↗
                    </a>
                  )}
                </article>
              ))}
            </div>
            <p className="data-warning">
              Missing: {costs.all_in_missing.join(", ")}. Missing inputs are never treated as zero.
            </p>
            <p className="data-note">
              {K.T("/payload/example/rounding", costs.rounding, "Rounding")}
            </p>
          </section>
        )}
        {tab === "Issues" && (
          <section className="data-panel">
            <h2>
              Retained issue history{" "}
              <span>
                {I.N("/payload/items", issues.length, "Retained issues", String(issues.length), {
                  formula: "count of /payload/items",
                })}{" "}
                OPEN
              </span>
            </h2>
            <div className="data-issues">
              {issues
                .filter((i) => sources.has(i.source))
                .map((i) => {
                  const at = `/payload/items/${issues.indexOf(i)}`;
                  return (
                    <article key={i.id}>
                      <b className="data-warning">
                        {i.severity} · {i.kind}
                      </b>
                      <strong data-num-exempt="id">{i.source}</strong>
                      <p>{I.T(`${at}/reason`, i.reason, "Reason")}</p>
                      <span>
                        First{" "}
                        {I.D(`${at}/first_seen_at`, i.first_seen_at, "First seen", i.first_seen_at)}{" "}
                        · Last{" "}
                        {I.D(`${at}/last_seen_at`, i.last_seen_at, "Last seen", i.last_seen_at)} ·{" "}
                        {I.N(`${at}/occurrences`, i.occurrences, "Attempts", String(i.occurrences))}{" "}
                        attempt(s)
                      </span>
                      <details data-num-exempt="id">
                        <summary>Evidence references</summary>
                        {i.evidence.map((hash) => (
                          <code key={hash}>{hash}</code>
                        ))}
                      </details>
                    </article>
                  );
                })}
            </div>
          </section>
        )}
        <footer className="data-footer">
          Admitted source bytes → clocks + schema + licence → signal mapping → diagnostic evidence.
          All scientific claim flags remain false.
        </footer>
      </section>
    </ProvenanceProvider>
  );
}
