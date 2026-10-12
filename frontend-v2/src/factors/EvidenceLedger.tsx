import type { Ledger } from "./contracts";
export function EvidenceLedger({ data }: { data: Ledger }) {
  return (
    <section className="factor-panel">
      <div className="factor-section-head">
        <h2>Evidence ledger</h2>
        <span>Read-only stages · no factor-zoo funnel</span>
      </div>
      <p className="factor-footnote">
        PARTIAL is a retained descriptive diagnostic, never a passed inference gate. Research OS
        stays CLOSED / NOT CALIBRATED; its replacement stays NOT CONFIRMED.
      </p>
      <div className="factor-ledger">
        {data.payload.candidates.map((c) => (
          <article key={c.candidate_id}>
            <header>
              <h3>{c.label}</h3>
              <span>
                {c.evidence_class} · {c.country}
              </span>
            </header>
            {Object.entries(c.stages).map(([key, s]) => (
              <details key={key} open={key === "RAW_TEST"}>
                <summary>
                  <span>{key.replaceAll("_", " ")}</span>
                  <b>{s.status}</b>
                </summary>
                <p>
                  <strong>{s.reason_code.replaceAll("_", " ")}</strong>
                  {s.underlying_verdict && <> · {s.underlying_verdict.replaceAll("_", " ")}</>}
                  <br />
                  {s.reason}
                </p>
                <ul>
                  {s.evidence_refs.map((r, i) => (
                    <li key={i} className="factor-hash">
                      {r.type === "replay_artifact" ? r.artifact_id : r.path}
                      <br />
                      {r.json_pointer}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </article>
        ))}
      </div>
      <div className="factor-cost-boundary">
        <h3>Factor economics unavailable</h3>
        <p>
          No portfolio weights or turnover contract exists. India’s statutory subtotal is separate
          from all-in estimated trading cost; absent brokerage, spread, slippage or DP inputs remain
          partial/unavailable.
        </p>
      </div>
    </section>
  );
}
