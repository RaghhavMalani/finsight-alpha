import type { Matrix, MatrixCell } from "./contracts";
import { fmt, pct } from "./format";

const COLUMNS: [string, string][] = [
  ["current_state", "Current state"],
  ["volatility_stress", "Volatility stress"],
  ["hmm_confidence", "HMM posterior"],
  ["momentum_state", "Momentum (12–1)"],
  ["factor_exposure", "Factor exposure (partial)"],
  ["event_pressure", "Event pressure"],
  ["data_quality", "Data quality"],
  ["evidence_quality", "Evidence"],
];

function cell(key: string, c: MatrixCell) {
  if (c.status === "UNAVAILABLE")
    return (
      <span className="regimes-cell-off" title={c.reason ?? undefined}>
        UNAVAILABLE
      </span>
    );
  if (key === "hmm_confidence") return pct(c.value as number);
  if (key === "volatility_stress")
    return `${fmt(c.value as number, 2)} · ${String((c.detail as { volatility_state?: string })?.volatility_state ?? "")}`;
  if (key === "factor_exposure")
    return `MKT β ${fmt(c.value as number, 2)} · worst term ${String((c.detail as { neutrality?: string })?.neutrality ?? "—")}`;
  if (key === "data_quality") return `${String(c.value)} open`;
  return String(c.value ?? "—");
}

export function CrossMarketMatrix({
  matrix,
  onLineage,
}: {
  matrix: Matrix;
  onLineage: (asset: string) => void;
}) {
  return (
    <section
      className="regimes-panel regimes-matrix"
      id="regimes-matrix"
      aria-labelledby="regimes-matrix-title"
    >
      <header>
        <h2 id="regimes-matrix-title">9 · Cross-market regime matrix</h2>
      </header>
      <p className="regimes-subtitle">{matrix.semantics}</p>
      <div className="regimes-table-wrap" tabIndex={0}>
        <table className="regimes-table">
          <thead>
            <tr>
              <th scope="col">Market · state_at</th>
              {COLUMNS.map(([, label]) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.asset}>
                <th scope="row">
                  <button className="regimes-link" onClick={() => onLineage(row.asset)}>
                    {row.market}
                  </button>
                  <small>
                    {row.series_label} · {row.state_at?.slice(0, 10)} · {row.observation_unit}s
                  </small>
                </th>
                {COLUMNS.map(([key]) => (
                  <td key={key} data-status={row.cells[key].status}>
                    {cell(key, row.cells[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="regimes-summaries">
        {matrix.summaries.state_agreement.map((p) => (
          <p key={p.pair.join()}>
            {p.pair.join(" vs ")}:{" "}
            {p.same_state === null
              ? "agreement unavailable"
              : p.same_state
                ? "same hmm2 rank"
                : "different hmm2 rank"}{" "}
            at their own state_at (gap {fmt(p.state_at_gap_days, 0)} days); volatility-stress gap{" "}
            {fmt(p.volatility_stress_gap, 2)}.
          </p>
        ))}
        {matrix.summaries.historical_agreement.map((h) => (
          <p key={"h" + h.pair.join()}>
            Historical agreement {pct(h.agreement_share)} over {h.overlapping_dates} shared dates (
            {h.first_overlap} → {h.last_overlap}); {h.method}.
          </p>
        ))}
        <p>
          Rotation (most recent filtered-state change):{" "}
          {matrix.summaries.rotation_observations
            .map((r) => `${r.asset} ${r.last_state_change?.slice(0, 10) ?? "—"}`)
            .join(" · ")}
          . Descriptive ordering only; no transmission or causal reading.
        </p>
      </div>
    </section>
  );
}
