import { useState } from "react";
import type { Audit } from "./contracts";
export function OutputAudit({ data }: { data: Audit }) {
  const [filter, setFilter] = useState(""),
    [status, setStatus] = useState("ALL"),
    rows = data.payload.items.filter(
      (r) =>
        (status === "ALL" || r.eligibility_status === status) &&
        `${r.plugin_id} ${r.output} ${r.reason}`.toLowerCase().includes(filter.toLowerCase()),
    ),
    counts = data.payload.items.reduce<Record<string, number>>(
      (a, r) => ({ ...a, [r.eligibility_status]: (a[r.eligibility_status] ?? 0) + 1 }),
      {},
    );
  return (
    <section className="factor-panel">
      <div className="factor-section-head">
        <h2>Declaration audit</h2>
        <span>20 definitions · 55 current + 9 derived channels</span>
      </div>
      <div className="factor-audit-filter">
        <label>
          Find output
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Plugin, channel or reason"
          />
        </label>
        <label>
          Eligibility
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>ALL</option>
            {Object.entries(counts).map(([k, n]) => (
              <option key={k} value={k}>
                {k} · {n}
              </option>
            ))}
          </select>
        </label>
        <span>{rows.length} / 64 reviewed channels</span>
      </div>
      <p className="factor-footnote">
        ELIGIBLE_RETAINED permits display only. Every output remains unauthorized as a new
        regression response. Four retained views belong to one assessment.
      </p>
      <div className="factor-audit-list">
        {rows.map((r) => (
          <details key={r.class_path + r.output_channel + r.output}>
            <summary>
              <span>
                <b>{r.plugin_id}</b>
                <small>
                  {r.output_channel} / {r.output}
                </small>
              </span>
              <span className="factor-audit-type">
                {r.declared_type} · {r.semantic_unit}
              </span>
              <em>{r.eligibility_status}</em>
            </summary>
            <div className="factor-audit-detail">
              <p>{r.reason}</p>
              <dl>
                <dt>Evidence</dt>
                <dd>
                  {r.evidence_class} · {r.asset_scope.join(" / ")}
                </dd>
                <dt>Chronology</dt>
                <dd>{r.chronology}</dd>
                <dt>Alignment</dt>
                <dd>{r.alignment_rule}</dd>
                <dt>Controls</dt>
                <dd>{r.allowed_controls.join(", ") || "None admitted"}</dd>
                <dt>Blockers</dt>
                <dd>{r.blockers.join(" · ") || "Retained display only"}</dd>
                <dt>Target boundary</dt>
                <dd>{r.target_meaning}</dd>
                <dt>Declaration</dt>
                <dd className="factor-hash">
                  {r.class_path} · v{r.plugin_version}
                </dd>
                <dt>References</dt>
                <dd>
                  {r.retained_diagnostic_refs.length
                    ? r.retained_diagnostic_refs.map((ref) => (
                        <span className="factor-hash" key={ref.artifact_id}>
                          {ref.artifact_id}
                          <br />
                        </span>
                      ))
                    : "UNAVAILABLE"}
                </dd>
              </dl>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
