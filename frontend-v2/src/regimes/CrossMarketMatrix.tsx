import type { Matrix, MatrixCell } from "./contracts";
import { fmt, pct } from "./format";
import { seg } from "./prov";
import { Stamp, type Origin } from "@/visual/Num";
import { ref } from "@/visual/origins";
import { provHelpers, type RouteProv } from "@/visual/route-origin";

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

function cell(key: string, c: MatrixCell, ptr: string, P: RouteProv) {
  if (c.status === "UNAVAILABLE")
    return (
      <span className="regimes-cell-off" title={c.reason ?? undefined}>
        UNAVAILABLE
      </span>
    );
  const v = typeof c.value === "number" ? c.value : null;
  if (key === "hmm_confidence") return P.N(ptr, v, "HMM posterior", pct(v));
  if (key === "volatility_stress")
    return (
      <>
        {P.N(ptr, v, "Volatility stress", fmt(v, 2))} ·{" "}
        {String((c.detail as { volatility_state?: string })?.volatility_state ?? "")}
      </>
    );
  if (key === "factor_exposure")
    return (
      <>
        MKT β {P.N(ptr, v, "Market beta", fmt(v, 2))} · worst term{" "}
        {String((c.detail as { neutrality?: string })?.neutrality ?? "—")}
      </>
    );
  if (key === "data_quality")
    return <>{P.N(ptr, v, "Open issues", c.value == null ? undefined : String(c.value))} open</>;
  if (typeof c.value === "number") return P.N(ptr, c.value, key);
  return String(c.value ?? "—");
}

export function CrossMarketMatrix({
  matrix,
  at,
  onLineage,
}: {
  matrix: Matrix;
  at: (ptr: string, extra?: Partial<Origin>) => Origin;
  onLineage: (asset: string) => void;
}) {
  const P = provHelpers(at);
  const day = (ptr: string, v: string | null | undefined, label: string) =>
    v ? (
      <Stamp s={ref(at(ptr), v)} label={label} display={v.slice(0, 10)} className="vx-inherit" />
    ) : (
      "—"
    );
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
                <th key={label} scope="col" data-num-exempt="copy">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, r) => (
              <tr key={row.asset}>
                <th scope="row">
                  <button className="regimes-link" onClick={() => onLineage(row.asset)}>
                    {row.market}
                  </button>
                  <small>
                    {row.series_label} ·{" "}
                    {row.state_at
                      ? day(`/payload/rows/${r}/state_at`, row.state_at, `${row.asset} state_at`)
                      : null}{" "}
                    · {row.observation_unit}s
                  </small>
                </th>
                {COLUMNS.map(([key]) => (
                  <td key={key} data-status={row.cells[key].status}>
                    {cell(key, row.cells[key], `/payload/rows/${r}/cells/${seg(key)}/value`, P)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="regimes-summaries">
        {matrix.summaries.state_agreement.map((p, i) => (
          <p key={p.pair.join()}>
            {p.pair.join(" vs ")}:{" "}
            {p.same_state === null
              ? "agreement unavailable"
              : p.same_state
                ? "same hmm2 rank"
                : "different hmm2 rank"}{" "}
            at their own state_at (gap{" "}
            {P.N(
              `/payload/summaries/state_agreement/${i}/state_at_gap_days`,
              p.state_at_gap_days,
              "state_at gap in days",
              fmt(p.state_at_gap_days, 0),
            )}{" "}
            days); volatility-stress gap{" "}
            {P.N(
              `/payload/summaries/state_agreement/${i}/volatility_stress_gap`,
              p.volatility_stress_gap,
              "Volatility-stress gap",
              fmt(p.volatility_stress_gap, 2),
            )}
            .
          </p>
        ))}
        {matrix.summaries.historical_agreement.map((h, i) => {
          const hp = `/payload/summaries/historical_agreement/${i}`;
          return (
            <p key={"h" + h.pair.join()}>
              Historical agreement{" "}
              {P.N(
                `${hp}/agreement_share`,
                h.agreement_share,
                "Historical agreement",
                pct(h.agreement_share),
              )}{" "}
              over {P.N(`${hp}/overlapping_dates`, h.overlapping_dates, "Shared dates")} shared
              dates (
              {P.D(
                `${hp}/first_overlap`,
                h.first_overlap,
                "First overlap",
                h.first_overlap ?? undefined,
              )}{" "}
              →{" "}
              {P.D(
                `${hp}/last_overlap`,
                h.last_overlap,
                "Last overlap",
                h.last_overlap ?? undefined,
              )}
              ); {h.method}.
            </p>
          );
        })}
        <p>
          Rotation (most recent filtered-state change):{" "}
          {matrix.summaries.rotation_observations.map((r, i) => (
            <span key={r.asset}>
              {i ? " · " : ""}
              {r.asset}{" "}
              {day(
                `/payload/summaries/rotation_observations/${i}/last_state_change`,
                r.last_state_change,
                `${r.asset} last state change`,
              )}
            </span>
          ))}
          . Descriptive ordering only; no transmission or causal reading.
        </p>
      </div>
    </section>
  );
}
