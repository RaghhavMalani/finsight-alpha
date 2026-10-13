import { useRetained } from "./query";
import type { Country } from "./contracts";
const n = (v: number | null) => (v === null ? "Unavailable" : v.toFixed(5));
export function RetainedDiagnostics({
  country,
  cutoff,
  selected,
  onLineage,
}: {
  country: Country;
  cutoff: string;
  selected: boolean;
  onLineage: () => void;
}) {
  const q = useRetained(country, cutoff, selected);
  if (!selected)
    return (
      <section className="factor-panel factor-empty">
        <h2>Select MOM to inspect retained exposures.</h2>
        <p>
          Only MOM has a sealed assessment against MKT, SMB and HML. RF is a risk-free component. No
          other component is fitted here.
        </p>
      </section>
    );
  if (q.isPending)
    return (
      <section className="factor-panel">
        <p role="status">Verifying original numerical references…</p>
      </section>
    );
  if (q.error || !q.data)
    return (
      <section className="factor-panel" data-diagnostics="unavailable">
        <h2>Retained diagnostics unavailable</h2>
        <p role="alert">{q.error?.message ?? "No sealed assessment"}</p>
      </section>
    );
  const { value, neutrality, refs } = q.data,
    rows = value.rolling_tail,
    values = rows.flatMap((r) => [r.mkt, r.smb, r.hml]),
    lo = Math.min(0, ...values),
    hi = Math.max(0, ...values),
    y = (v: number) => 130 - ((v - lo) / (hi - lo || 1)) * 110;
  return (
    <section className="factor-panel" data-diagnostics="ready">
      <div className="factor-section-head">
        <h2>MOM / retained exposure assessment</h2>
        <button onClick={onLineage}>Inspect lineage ↗</button>
      </div>
      <div className="factor-badges">
        <span>REAL · SEALED REPLAY</span>
        <span>DIAGNOSTIC_ASYMPTOTIC</span>
        <span>NOT CALIBRATED</span>
      </div>
      <p className="factor-footnote">
        Market factor, not a ticker · prior-only rolling coefficients · retrospective full-window
        HAC diagnostic. No causal, alpha or inference claim.
      </p>
      <div className="factor-diagnostic-summary">
        <div>
          <strong>{n(value.full_window.r_squared)}</strong>
          <span>Retained full-window R²</span>
        </div>
        <div>
          <strong>{n(value.stability)}</strong>
          <span>Retained stability</span>
        </div>
        <div>
          <strong>{neutrality}</strong>
          <span>Existing neutrality label</span>
        </div>
        <div>
          <strong>{value.full_window.n.toLocaleString()}</strong>
          <span>Assessment observations</span>
        </div>
      </div>
      <div className="factor-chart">
        <div className="factor-chart-title">
          <b>Rolling coefficients</b>
          <span>
            <i className="mkt" />
            MKT <i className="smb" />
            SMB <i className="hml" />
            HML
          </span>
        </div>
        <svg
          viewBox="0 0 800 160"
          role="img"
          aria-label="Existing rolling MKT SMB HML coefficients for MOM"
        >
          <line x1="12" x2="788" y1={y(0)} y2={y(0)} stroke="#38404b" strokeDasharray="4 4" />
          {(["mkt", "smb", "hml"] as const).map((key, i) => (
            <polyline
              key={key}
              points={rows
                .map((r, j) => `${12 + (j / Math.max(1, rows.length - 1)) * 776},${y(r[key])}`)
                .join(" ")}
              fill="none"
              stroke={["#F0A929", "#63b3ba", "#9b88cc"][i]}
              strokeWidth="1.6"
            />
          ))}
          <text x="12" y="155" fill="#919aa8" fontSize="10">
            {rows[0]?.observed_at.slice(0, 10)}
          </text>
          <text x="788" y="155" textAnchor="end" fill="#919aa8" fontSize="10">
            {rows.at(-1)?.observed_at.slice(0, 10)}
          </text>
        </svg>
      </div>
      <div className="factor-table-wrap">
        <table>
          <caption>Original full-window coefficients · {value.full_window.inference}</caption>
          <thead>
            <tr>
              <th>Term</th>
              <th>Coefficient</th>
              <th>HAC SE</th>
              <th>Diagnostic 95% interval</th>
            </tr>
          </thead>
          <tbody>
            {value.full_window.terms.map((t) => (
              <tr key={t.term}>
                <th>{t.term.toUpperCase()}</th>
                <td>{n(t.coefficient)}</td>
                <td>{n(t.hac_se)}</td>
                <td>
                  {n(t.interval_95[0])} / {n(t.interval_95[1])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="factor-footnote factor-hash">
        Original {refs.factors.artifact_id}
        <br />
        Run {refs.factors.run_id}
        <br />
        Cutoff {cutoff}
      </p>
    </section>
  );
}
