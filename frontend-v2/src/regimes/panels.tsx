import { useState } from "react";
import type { HmmSummary, ModuleStatus, Snapshot, Term, Timeline } from "./contracts";
import { fmt, pct } from "./format";

const STATE_COLORS = ["#3E7CB1", "#E0A23B", "#C4553E", "#8E6BBF"];
const VOL_COLORS: Record<string, string> = {
  UNRESOLVED: "#2A333B",
  LOW_VOL: "#3E7CB1",
  NORMAL: "#5E8C6A",
  HIGH_VOL: "#E0A23B",
  VOL_CLUSTER: "#C98A2E",
  VOL_BREAK: "#C4553E",
  VOL_SHOCK: "#E0483E",
};

export function ModuleUnavailable({ title, status }: { title: string; status: ModuleStatus }) {
  return (
    <div
      className="regimes-unavailable"
      data-status={status.status}
      role="note"
      aria-label={`${title} ${status.status}`}
    >
      <strong>
        {title} — {status.status.replace("_", " ")}
      </strong>
      {status.reason && <p>{status.reason}</p>}
      {status.unblock && (
        <p className="regimes-unblock">
          <span>Would unblock:</span> {status.unblock}
        </p>
      )}
    </div>
  );
}

export function Panel({
  id,
  title,
  subtitle,
  status,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  status?: ModuleStatus;
  children?: React.ReactNode;
}) {
  return (
    <section className="regimes-panel" id={`regimes-${id}`} aria-labelledby={`regimes-${id}-title`}>
      <header>
        <h2 id={`regimes-${id}-title`}>{title}</h2>
        {status && (
          <span className="regimes-chip" data-status={status.status}>
            {status.status.replace("_", " ")}
          </span>
        )}
      </header>
      {subtitle && <p className="regimes-subtitle">{subtitle}</p>}
      {status &&
        status.status !== "AVAILABLE" &&
        status.reason &&
        status.status !== "UNAVAILABLE" && <p className="regimes-partial">{status.reason}</p>}
      {children}
    </section>
  );
}

function runs<T>(codes: T[]) {
  const out: { start: number; end: number; value: T }[] = [];
  codes.forEach((value, i) => {
    const last = out[out.length - 1];
    if (last && last.value === value) last.end = i;
    else out.push({ start: i, end: i, value });
  });
  return out;
}

/** A categorical band on the shared date axis; the warm-up before `offset` stays blank. */
export function StateBand({
  codes,
  labels,
  colors,
  offset = 0,
  total,
  height = 18,
  label,
}: {
  codes: number[];
  labels: string[];
  colors: (index: number, label: string) => string;
  offset?: number;
  total?: number;
  height?: number;
  label: string;
}) {
  const n = Math.max(total ?? offset + codes.length, 1);
  return (
    <svg
      className="regimes-band"
      viewBox={`0 0 ${n} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {runs(codes).map((r) => (
        <rect
          key={r.start}
          x={offset + r.start}
          width={r.end - r.start + 1}
          y={0}
          height={height}
          fill={colors(r.value, labels[r.value])}
        />
      ))}
    </svg>
  );
}

export function Line({
  values,
  height = 90,
  stroke = "#F0A929",
  label,
}: {
  values: (number | null)[];
  height?: number;
  stroke?: string;
  label: string;
}) {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!finite.length) return <p className="regimes-muted">No finite values</p>;
  const max = Math.max(...finite),
    min = Math.min(...finite),
    span = max - min || 1,
    n = values.length;
  const step = Math.max(1, Math.floor(n / 1600));
  let path = "",
    open = false;
  for (let i = 0; i < n; i += step) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) {
      open = false;
      continue;
    }
    const x = (i / Math.max(n - 1, 1)) * 1000,
      y = height - ((v - min) / span) * (height - 6) - 3;
    path += `${open ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    open = true;
  }
  return (
    <svg
      className="regimes-line"
      viewBox={`0 0 1000 ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function TimelinePanel({
  snapshot,
  timeline,
  status,
}: {
  snapshot: Snapshot;
  timeline: Timeline | undefined;
  status: ModuleStatus;
}) {
  const hmm = timeline?.hmm2;
  const dates = timeline?.dates ?? [];
  const [index, setIndex] = useState<number | null>(null);
  const at = dates.length ? Math.min(index ?? dates.length - 1, dates.length - 1) : null;
  const own = hmm && at !== null ? at - hmm.offset : -1;
  return (
    <Panel
      id="timeline"
      title="1 · Regime timeline"
      subtitle={timeline ? timeline.path_semantics : snapshot.layers.within_run}
      status={status}
    >
      {!timeline || !hmm ? (
        <p className="regimes-muted" role="status">
          Verifying the within-run path…
        </p>
      ) : (
        <>
          <div className="regimes-band-row">
            <span>hmm2 filtered state</span>
            <StateBand
              codes={hmm.state_codes}
              offset={hmm.offset}
              total={dates.length}
              labels={hmm.labels}
              colors={(i) => STATE_COLORS[i % 4]}
              label="hmm2 filtered state path"
            />
          </div>
          <div className="regimes-band-row">
            <span>hmm4 filtered state</span>
            <StateBand
              codes={timeline.hmm4.state_codes}
              offset={timeline.hmm4.offset}
              total={dates.length}
              labels={timeline.hmm4.labels}
              colors={(i) => STATE_COLORS[i % 4]}
              label="hmm4 filtered state path"
            />
          </div>
          <div className="regimes-band-row">
            <span>volatility state</span>
            <StateBand
              codes={timeline.volatility.state_codes}
              total={dates.length}
              labels={timeline.volatility.states}
              colors={(_, label) => VOL_COLORS[label] ?? "#555"}
              label="Frozen D0.4.2 volatility state path"
            />
          </div>
          <div className="regimes-axis">
            <span>{dates[0]}</span>
            <span>{dates[dates.length - 1]}</span>
          </div>
          <label className="regimes-scrub">
            <span>Within-run scrubber · PARAMETER_RETROSPECTIVE</span>
            <input
              type="range"
              min={0}
              max={dates.length - 1}
              value={at ?? 0}
              onChange={(e) => setIndex(Number(e.target.value))}
              aria-label="Scrub the within-run filtered state path"
            />
          </label>
          {at !== null && (
            <p className="regimes-readout" aria-live="polite">
              {dates[at]} ·{" "}
              {own >= 0
                ? `${hmm.labels[hmm.state_codes[own]]} · filtered confidence ${pct(hmm.confidence[own])}`
                : "hmm2 warm-up · no filtered state before the minimum observations"}
            </p>
          )}
          <ul className="regimes-legend">
            {hmm.labels.map((l, i) => (
              <li key={l}>
                <i style={{ background: STATE_COLORS[i % 4] }} />
                {l}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

export function VolatilityPanel({
  snapshot,
  timeline,
  status,
}: {
  snapshot: Snapshot;
  timeline?: Timeline;
  status: ModuleStatus;
}) {
  const g = snapshot.volatility.garch as Record<string, number | string | boolean | null>;
  const lm = snapshot.volatility.arch_lm as Record<string, number | string> | null;
  const unit = snapshot.observation_unit;
  const annual = snapshot.current.volatility.realized_vol_20_annualised as number | undefined;
  return (
    <Panel
      id="volatility"
      title="2 · Volatility clustering"
      subtitle="Frozen D0.4.2 states per observation · ARCH-LM and arch GARCH(1,1) as DIAGNOSTIC_ASYMPTOTIC"
      status={status}
    >
      <div className="regimes-kv">
        <div>
          <span>State</span>
          <strong>{String(snapshot.current.volatility.volatility_state)}</strong>
        </div>
        <div>
          <span>RV20 (per observation)</span>
          <strong>{fmt(snapshot.current.volatility.realized_vol_20 as number, 4)}</strong>
        </div>
        {annual !== undefined && (
          <div>
            <span>RV20 annualised (√252, XNYS)</span>
            <strong>{pct(annual)}</strong>
          </div>
        )}
        <div>
          <span>GARCH α + β</span>
          <strong>
            {g.fit_status === "CONVERGED" ? fmt(g.persistence as number, 4) : "not identified"}
          </strong>
        </div>
        <div>
          <span>Half-life ({unit}s)</span>
          <strong>
            {g.half_life_observations === null
              ? String(g.half_life_domain ?? "—").split(":")[0]
              : fmt(g.half_life_observations as number, 1)}
          </strong>
        </div>
        <div>
          <span>Fit status</span>
          <strong>{String(g.fit_status ?? g.status ?? "—")}</strong>
        </div>
        <div>
          <span>ARCH-LM p (5 lags)</span>
          <strong>
            {lm && lm.status === "AVAILABLE"
              ? (lm.lm_pvalue as number) < 1e-4
                ? "< 0.0001"
                : fmt(lm.lm_pvalue as number, 4)
              : "—"}
          </strong>
        </div>
      </div>
      {timeline && (
        <Line
          values={timeline.volatility.rv_20}
          label="Realized volatility, 20 observations, per observation"
        />
      )}
      <p className="regimes-footnote">
        ω {fmt(g.omega_percent2 as number, 4)} · α {fmt(g.alpha as number, 4)} · β{" "}
        {fmt(g.beta as number, 4)} · {String(g.inference ?? "")}. Confidence means window
        sufficiency, never a calibrated probability.
      </p>
    </Panel>
  );
}

function Posterior({ hmm, label }: { hmm: HmmSummary; label: string }) {
  const rows = hmm.posterior_tail?.rows ?? [];
  if (!rows.length) return null;
  const k = rows[0].length,
    n = rows.length;
  const bands = Array.from({ length: k }, (_, s) => {
    const top = rows.map((r, i) => {
      const y = 60 - 60 * r.slice(0, s + 1).reduce((a, b) => a + b, 0);
      return `${((i / Math.max(n - 1, 1)) * 1000).toFixed(1)},${y.toFixed(2)}`;
    });
    const bottom = rows
      .map((r, i) => {
        const y = 60 - 60 * r.slice(0, s).reduce((a, b) => a + b, 0);
        return `${((i / Math.max(n - 1, 1)) * 1000).toFixed(1)},${y.toFixed(2)}`;
      })
      .reverse();
    return (
      <polygon
        key={s}
        points={[...top, ...bottom].join(" ")}
        fill={STATE_COLORS[s % 4]}
        opacity={0.85}
      />
    );
  });
  return (
    <svg
      className="regimes-line"
      viewBox="0 0 1000 60"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {bands}
    </svg>
  );
}

export function HmmPanel({ snapshot, status }: { snapshot: Snapshot; status: ModuleStatus }) {
  const two = snapshot.hmm.hmm2,
    four = snapshot.hmm.hmm4;
  return (
    <Panel
      id="hmm"
      title="3 · HMM state probabilities"
      subtitle="Forward-filtered posteriors only; full-sequence smoothing is never shown"
      status={status}
    >
      {two.status === "UNAVAILABLE" ? (
        <p>{two.reason}</p>
      ) : (
        <>
          <div className="regimes-kv">
            <div>
              <span>hmm2 (diagnostic)</span>
              <strong>{two.current_state}</strong>
            </div>
            <div>
              <span>Filtered posterior</span>
              <strong>{(two.current_posterior ?? []).map((p) => pct(p)).join(" / ")}</strong>
            </div>
            <div>
              <span>Convergence</span>
              <strong>
                {two.converged ? `CONVERGED · ${two.iterations} it` : "UNCONVERGED · retained"}
              </strong>
            </div>
            <div>
              <span>hmm4 (existing)</span>
              <strong>
                {four.status === "UNAVAILABLE"
                  ? "UNAVAILABLE"
                  : `${four.current_state} · ${four.converged ? "converged" : "UNCONVERGED"}`}
              </strong>
            </div>
          </div>
          <Posterior hmm={two} label="Last 250 filtered hmm2 posteriors" />
          <p className="regimes-footnote">
            {two.labelling_rule}. {two.convergence_rule}.
          </p>
        </>
      )}
    </Panel>
  );
}

export function TransitionPanel({
  snapshot,
  status,
}: {
  snapshot: Snapshot;
  status: ModuleStatus;
}) {
  const h = snapshot.hmm.hmm2;
  if (!h.transition_matrix)
    return <Panel id="transitions" title="4 · Transition matrix" status={status} />;
  return (
    <Panel
      id="transitions"
      title="4 · Transition matrix"
      subtitle={`Per observed record · expected duration in ${h.duration_unit}`}
      status={status}
    >
      <div className="regimes-table-wrap" tabIndex={0}>
        <table className="regimes-table">
          <caption className="sr-only">hmm2 transition probabilities</caption>
          <thead>
            <tr>
              <th scope="col">from \ to</th>
              {h.labels!.map((l) => (
                <th key={l} scope="col">
                  {l}
                </th>
              ))}
              <th scope="col">duration</th>
              <th scope="col">entropy</th>
              <th scope="col">occupancy</th>
            </tr>
          </thead>
          <tbody>
            {h.transition_matrix.map((row, i) => (
              <tr key={i}>
                <th scope="row">{h.labels![i]}</th>
                {row.map((p, j) => (
                  <td
                    key={j}
                    style={{ background: `rgba(240,169,41,${(0.08 + 0.6 * p).toFixed(3)})` }}
                  >
                    {fmt(p, 3)}
                  </td>
                ))}
                <td>{fmt(h.expected_duration?.[i] ?? null, 1)}</td>
                <td>{fmt(h.transition_entropy?.[i], 3)}</td>
                <td>{pct(h.occupancy?.[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="regimes-footnote">
        Per-state return mean {h.return_mean?.map((m) => fmt(m, 5)).join(" / ")} · variance{" "}
        {h.return_variance?.map((v) => v.toExponential(2)).join(" / ")} (per observation; numbers,
        not sentiment labels).
      </p>
    </Panel>
  );
}

function TermTable({ terms }: { terms: Term[] }) {
  return (
    <div className="regimes-table-wrap" tabIndex={0}>
      <table className="regimes-table">
        <thead>
          <tr>
            <th scope="col">term</th>
            <th scope="col">coef</th>
            <th scope="col">HAC se</th>
            <th scope="col">95% interval</th>
            <th scope="col">neutrality</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => (
            <tr key={t.term}>
              <th scope="row">{t.term === "intercept" ? "intercept (descriptive)" : t.term}</th>
              <td>{fmt(t.coefficient, 4)}</td>
              <td>{fmt(t.hac_se, 4)}</td>
              <td>
                [{fmt(t.interval_95[0], 3)}, {fmt(t.interval_95[1], 3)}]
              </td>
              <td>{t.neutrality ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FactorPanel({ snapshot, status }: { snapshot: Snapshot; status: ModuleStatus }) {
  const f = snapshot.factors;
  const d = f.decomposition?.cumulative;
  const scale = Math.max(
    Math.abs(d?.raw ?? 0),
    Math.abs(d?.explained ?? 0),
    Math.abs(d?.residual ?? 0),
    1e-12,
  );
  return (
    <Panel
      id="factors"
      title="6 · Factor neutrality"
      subtitle={`${f.name ?? "PARTIAL_FACTOR_DIAGNOSTIC"} · target ${f.target} on ${f.controls?.join(", ")}`}
      status={status}
    >
      <p className="regimes-partial">{f.seven_factor}</p>
      {f.full_window?.terms && <TermTable terms={f.full_window.terms} />}
      <p className="regimes-footnote">
        R² {fmt(f.full_window?.r_squared ?? null, 3)} · n {f.full_window?.n ?? "—"} ·{" "}
        {f.full_window?.inference}
      </p>
      {d && (
        <div
          className="regimes-bars"
          role="img"
          aria-label="Raw versus factor-explained versus residual cumulative attribution"
        >
          {(["raw", "explained", "residual"] as const).map((k) => (
            <div key={k}>
              <span>
                {k === "raw" ? "RAW" : k === "explained" ? "FACTOR-EXPLAINED" : "FACTOR-RESIDUAL"}
              </span>
              <i
                style={{
                  width: `${(50 * Math.abs(d[k] ?? 0)) / scale}%`,
                  marginLeft:
                    (d[k] ?? 0) < 0 ? `${50 - (50 * Math.abs(d[k] ?? 0)) / scale}%` : "50%",
                }}
              />
              <b>{fmt(d[k], 4)}</b>
            </div>
          ))}
        </div>
      )}
      <p className="regimes-footnote">{f.decomposition?.semantics}</p>
    </Panel>
  );
}

function SummaryTable({
  rows,
  caption,
  sharpe = false,
}: {
  rows: Record<string, Record<string, unknown>>;
  caption: string;
  sharpe?: boolean;
}) {
  return (
    <div className="regimes-table-wrap" tabIndex={0}>
      <table className="regimes-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">state</th>
            <th scope="col">n</th>
            <th scope="col">mean</th>
            <th scope="col">median</th>
            <th scope="col">positive</th>
            <th scope="col">{sharpe ? "descriptive Sharpe" : "MAD / SD"}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(rows).map(([state, s]) => (
            <tr key={state}>
              <th scope="row">{state}</th>
              <td>{String(s.n)}</td>
              <td>{fmt(s.mean as number, 4)}</td>
              <td>{fmt(s.median as number, 4)}</td>
              <td>{pct(s.positive_fraction as number)}</td>
              <td>
                {sharpe
                  ? `${fmt(s.descriptive_sharpe as number, 2)} (${String(s.sharpe_unit)})`
                  : `${fmt(s.mad as number, 4)} / ${fmt(s.sd as number, 4)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MomentumPanels({ snapshot, status }: { snapshot: Snapshot; status: ModuleStatus }) {
  const m = snapshot.momentum,
    frozen = snapshot.frozen_research;
  return (
    <div className="regimes-split" id="regimes-momentum">
      <Panel
        id="momentum-signal"
        title="7 · Momentum by regime"
        subtitle="CURRENT DESCRIPTIVE REGIME VIEW"
        status={status}
      >
        <div className="regimes-kv">
          <div>
            <span>Current 12–1 signal</span>
            <strong>
              {pct(snapshot.current.momentum?.momentum_signal ?? null, 2)} ·{" "}
              {snapshot.current.momentum?.momentum_sign ?? "—"}
            </strong>
          </div>
          <div>
            <span>Window</span>
            <strong>{m.index_label}</strong>
          </div>
        </div>
        {m.signal_by_state && (
          <SummaryTable
            rows={m.signal_by_state as never}
            caption="12–1 market-factor signal distribution by hmm2 state (the signal itself, not a return)"
          />
        )}
        <p className="regimes-footnote">{m.definition}</p>
      </Panel>
      <Panel
        id="mom-factor"
        title="MOM FACTOR BY REGIME"
        subtitle="cross-sectional momentum-factor diagnostic"
      >
        {m.mom_factor_by_regime && (
          <SummaryTable
            rows={m.mom_factor_by_regime as never}
            caption="Next-observation published MOM factor by lagged filtered state"
            sharpe
          />
        )}
        <p className="regimes-footnote">{m.mom_factor_semantics}</p>
      </Panel>
      <section className="regimes-frozen" aria-labelledby="regimes-frozen-title">
        <h2 id="regimes-frozen-title">{frozen.title}</h2>
        <dl>
          {Object.entries(frozen.verdicts).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p>
          Research OS {frozen.research_os} · inference replacement {frozen.inference_replacement}
        </p>
        <p className="regimes-footnote">
          {frozen.note} · {frozen.source} sha256 {frozen.sha256.slice(0, 12)}…
        </p>
      </section>
    </div>
  );
}

export function SeasonalityPanel({ status }: { status: ModuleStatus }) {
  return (
    <Panel id="seasonality" title="5 · Intraday seasonality" status={status}>
      {status.status === "UNAVAILABLE" && (
        <ModuleUnavailable title="INTRADAY SEASONALITY" status={status} />
      )}
    </Panel>
  );
}

export function EventPanel({ status, iohmm }: { status: ModuleStatus; iohmm?: ModuleStatus }) {
  return (
    <Panel id="events" title="8 · Event pressure" status={status}>
      <ModuleUnavailable title="EVENT PRESSURE" status={status} />
      {iohmm && <ModuleUnavailable title="HAWKES → HMM (IOHMM)" status={iohmm} />}
      <p className="regimes-footnote">
        Synthetic event worlds remain test fixtures. Causal graphs and edge confidence are never
        shown.
      </p>
    </Panel>
  );
}
