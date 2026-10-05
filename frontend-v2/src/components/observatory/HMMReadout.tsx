import { fmt } from "./format";
import { occupancy, type HMMView } from "./hmm-model";
import { byOrder } from "./regime-palette";

function Spark({ values, index, color }: { values: number[]; index: number; color: string }) {
  const lo = Math.min(...values),
    hi = Math.max(...values),
    W = 284,
    H = 46;
  const pts = values.map(
    (v, k) =>
      [
        (k / Math.max(1, values.length - 1)) * W,
        H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 10),
      ] as const,
  );
  return (
    <svg
      className="obs-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Log-likelihood by EM iteration"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        points={pts.map((p) => p.join(",")).join(" ")}
      />
      <circle cx={pts[index][0]} cy={pts[index][1]} r="3" fill={color} />
    </svg>
  );
}

/** Current regime, the EM trace, transitions and occupancy at the scrubbed iteration. */
export function HMMReadout({ view, index }: { view: HMMView; index: number }) {
  const { trace, states } = view,
    f = view.frames[index],
    last = view.frames[view.frames.length - 1],
    ordered = byOrder(states);
  const day = f.dominant.length - 1,
    now = states[f.dominant[day]],
    p = f.posterior[day],
    occ = occupancy(f, states.length);
  return (
    <>
      <div className="obs-eyebrow">
        Gaussian HMM · {states.length} states · {trace.feature_names.length} features
      </div>
      <div>
        <div className="obs-k">Current regime</div>
        <div className="obs-big" style={{ color: now.color }}>
          {now.name}
        </div>
        <div className="obs-sub mono">
          posterior {p >= 0.9995 ? "≥ 0.999" : p.toFixed(3)} · {view.dates[day]}
        </div>
      </div>
      <div>
        <div className="obs-k">Log-likelihood</div>
        <div className="obs-num">{fmt(f.loglik, 1)}</div>
        <Spark values={view.frames.map((x) => x.loglik)} index={index} color="#42C98B" />
      </div>
      <div className="obs-rows">
        <div>
          <span>EM iteration</span>
          <b>
            {f.iteration} / {last.iteration}
          </b>
        </div>
        <div>
          <span>Change in fit</span>
          <b>{f.delta == null ? "—" : f.delta.toFixed(4)}</b>
        </div>
        <div>
          <span>Converged</span>
          <b>
            {f.converged
              ? `Yes${trace.tolerance != null ? `, below ${trace.tolerance}` : ""}`
              : "Not yet"}
          </b>
        </div>
        <div>
          <span>Fit window</span>
          <b>{trace.fit_rows.toLocaleString()} days</b>
        </div>
      </div>
      <div>
        <div className="obs-k">Transition probabilities · from row to column</div>
        <div
          className="obs-matrix"
          style={{ gridTemplateColumns: `auto repeat(${states.length}, 1fr)` }}
        >
          <span className="h" />
          {ordered.map((s) => (
            <span key={s.index} className="h" title={s.name}>
              <i className="obs-dotc" style={{ background: s.color, width: 5, height: 5 }} />
              {s.index}
            </span>
          ))}
          {ordered.map((from) => [
            <span key={`r${from.index}`} className="r" title={from.name}>
              <i className="obs-dotc" style={{ background: from.color }} />
              {from.index}
            </span>,
            ...ordered.map((to) => {
              const q = f.transmat[from.index][to.index];
              return (
                <span
                  key={`${from.index}-${to.index}`}
                  style={{
                    background: `color-mix(in srgb, ${from.color} ${Math.round(Math.pow(q, 0.7) * 38)}%, transparent)`,
                    color: q >= 0.2 ? "var(--obs-fg)" : "var(--obs-faint)",
                  }}
                >
                  {q.toFixed(2)}
                </span>
              );
            }),
          ])}
        </div>
      </div>
      <div>
        <div className="obs-k">Last {f.dominant.length} trading days</div>
        <div className="obs-stack">
          {ordered.map((s) =>
            occ[s.index] ? (
              <i
                key={s.index}
                style={{
                  width: `${(occ[s.index] / f.dominant.length) * 100}%`,
                  background: s.color,
                }}
              />
            ) : null,
          )}
        </div>
        <div className="obs-occ">
          {ordered.map((s) => [
            <span key={`n${s.index}`} className={occ[s.index] ? undefined : "z"}>
              <i className="obs-dotc" style={{ background: s.color }} />
              {s.name}
            </span>,
            <b key={`c${s.index}`} style={occ[s.index] ? undefined : { color: "var(--obs-faint)" }}>
              {occ[s.index]}
            </b>,
          ])}
        </div>
      </div>
      <p className="obs-fine">
        Positions are the model's own state means on 3 of its {trace.feature_names.length} features,
        in standard deviations. Clouds sample each state's spread on those features. This is a
        description of the fit, not a forecast.
      </p>
    </>
  );
}

export function HMMStatus({ view, index }: { view: HMMView; index: number }) {
  const f = view.frames[index];
  return (
    <>
      EM <b>{f.iteration}</b> / {view.frames[view.frames.length - 1].iteration} · LL{" "}
      <b>{fmt(f.loglik, 1)}</b>
    </>
  );
}
