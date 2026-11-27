import { fmt } from "./format";
import { occupancy, type HMMView } from "./hmm-model";
import { byOrder } from "./regime-palette";
import { provHelpers } from "@/visual/route-origin";

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
  const { N, D } = provHelpers(view.at),
    fp = `/frames/${index}`;
  const nStates = N("/n_states", trace.n_states, "HMM states");
  const nFeatures = N("/feature_names", trace.feature_names.length, "Fit features", undefined, {
    formula: "count of /feature_names",
  });
  const tail = (label: string) =>
    N(`${fp}/posterior_tail`, f.dominant.length, label, undefined, {
      formula: `count of ${fp}/posterior_tail`,
    });
  return (
    <>
      <div className="obs-eyebrow">
        Gaussian HMM · {nStates} states · {nFeatures} features
      </div>
      <div>
        <div className="obs-k">Current regime</div>
        <div className="obs-big" style={{ color: now.color }}>
          {now.name}
        </div>
        <div className="obs-sub mono">
          posterior{" "}
          {N(
            `${fp}/posterior_tail/${day}`,
            p,
            "Posterior of the current regime",
            p >= 0.9995 ? "≥ 0.999" : p.toFixed(3),
            {
              formula: `max over states of ${fp}/posterior_tail/${day}`,
            },
          )}{" "}
          · {D(`/dates_tail/${day}`, trace.dates_tail[day], "Session", view.dates[day])}
        </div>
      </div>
      <div>
        <div className="obs-k">Log-likelihood</div>
        <div className="obs-num">
          {N(`${fp}/loglik`, f.loglik, "Log-likelihood", fmt(f.loglik, 1))}
        </div>
        <Spark values={view.frames.map((x) => x.loglik)} index={index} color="#42C98B" />
      </div>
      <div className="obs-rows">
        <div>
          <span>EM iteration</span>
          <b>
            {N(`${fp}/iteration`, f.iteration, "EM iteration")} /{" "}
            {N(`/frames/${view.frames.length - 1}/iteration`, last.iteration, "Last EM iteration")}
          </b>
        </div>
        <div>
          <span>Change in fit</span>
          <b>
            {f.delta == null
              ? "—"
              : N(`${fp}/convergence_delta`, f.delta, "Change in fit", f.delta.toFixed(4))}
          </b>
        </div>
        <div>
          <span>Converged</span>
          <b>
            {f.converged ? (
              <>
                Yes
                {trace.tolerance != null ? (
                  <>
                    , below{" "}
                    {N(
                      "/tolerance",
                      trace.tolerance,
                      "Convergence tolerance",
                      String(trace.tolerance),
                    )}
                  </>
                ) : null}
              </>
            ) : (
              "Not yet"
            )}
          </b>
        </div>
        <div>
          <span>Fit window</span>
          <b>
            {N("/fit_rows", trace.fit_rows, "Fit window", trace.fit_rows.toLocaleString())} days
          </b>
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
            <span key={s.index} className="h" title={s.name} data-num-exempt="id">
              <i className="obs-dotc" style={{ background: s.color, width: 5, height: 5 }} />
              {s.index}
            </span>
          ))}
          {ordered.map((from) => [
            <span key={`r${from.index}`} className="r" title={from.name} data-num-exempt="id">
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
                  {N(
                    `${fp}/transmat/${from.index}/${to.index}`,
                    q,
                    `Transition ${from.name} → ${to.name}`,
                    q.toFixed(2),
                  )}
                </span>
              );
            }),
          ])}
        </div>
      </div>
      <div>
        <div className="obs-k">Last {tail("Sessions in the posterior tail")} trading days</div>
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
              {N(`${fp}/posterior_tail`, occ[s.index], `Days in ${s.name}`, undefined, {
                formula: `count of ${fp}/posterior_tail rows whose largest posterior is state ${s.index}`,
              })}
            </b>,
          ])}
        </div>
      </div>
      <p className="obs-fine">
        Positions are the model's own state means on 3 of its {nFeatures} features, in standard
        deviations. Clouds sample each state's spread on those features. This is a description of
        the fit, not a forecast.
      </p>
    </>
  );
}

export function HMMStatus({ view, index }: { view: HMMView; index: number }) {
  const f = view.frames[index],
    n = view.frames.length - 1;
  const { N } = provHelpers(view.at);
  return (
    <>
      EM <b>{N(`/frames/${index}/iteration`, f.iteration, "EM iteration")}</b> /{" "}
      {N(`/frames/${n}/iteration`, view.frames[n].iteration, "Last EM iteration")} · LL{" "}
      <b>{N(`/frames/${index}/loglik`, f.loglik, "Log-likelihood", fmt(f.loglik, 1))}</b>
    </>
  );
}
