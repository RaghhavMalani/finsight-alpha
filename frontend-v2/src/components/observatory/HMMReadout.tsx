import { PALETTE, decimal, type HMMTrace } from "./types";

export function HMMReadout({ trace, index }: { trace: HMMTrace; index: number }) {
  const frame = trace.frames[index];
  const likelihoods = trace.frames.map((f) => f.loglik),
    min = Math.min(...likelihoods),
    max = Math.max(...likelihoods);
  return (
    <>
      <div className="obs-eyebrow">01 / OPTIMIZATION TRACE</div>
      <h2>
        One fit.
        <br />
        Every EM step.
      </h2>
      <p>{trace.semantics}</p>
      <div className="obs-stat">
        <span>LOG LIKELIHOOD</span>
        <strong>{decimal(frame.loglik, 1)}</strong>
      </div>
      <svg
        viewBox="0 0 240 65"
        role="img"
        aria-label="Log likelihood by EM iteration"
        className="obs-sparkline"
      >
        <polyline
          fill="none"
          stroke="#42C98B"
          strokeWidth="1.2"
          points={likelihoods
            .map(
              (v, i) =>
                `${(i / (likelihoods.length - 1 || 1)) * 240},${60 - ((v - min) / (max - min || 1)) * 55}`,
            )
            .join(" ")}
        />
        <circle
          cx={(index / (trace.frames.length - 1 || 1)) * 240}
          cy={60 - ((frame.loglik - min) / (max - min || 1)) * 55}
          r="3"
          fill="#42C98B"
        />
      </svg>
      <dl>
        <div>
          <dt>ITERATION</dt>
          <dd>
            {frame.iteration} / {trace.frames.length} RECORDED
          </dd>
        </div>
        <div>
          <dt>Δ LIKELIHOOD</dt>
          <dd>{decimal(frame.convergence_delta, 4)}</dd>
        </div>
        <div>
          <dt>CONVERGED</dt>
          <dd>{frame.converged ? "YES" : "NO"}</dd>
        </div>
        <div>
          <dt>SEED / COVARIANCE</dt>
          <dd>{trace.seed} / FULL</dd>
        </div>
        <div>
          <dt>POSTERIOR TAIL</dt>
          <dd>{trace.dates_tail.length} OBSERVATIONS</dd>
        </div>
      </dl>
      <div className="obs-eyebrow">TRANSITION PROBABILITIES</div>
      <table className="obs-matrix">
        <thead>
          <tr>
            <th>FROM / TO</th>
            {frame.transmat.map((_, i) => (
              <th key={i}>S{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {frame.transmat.map((row, i) => (
            <tr key={i}>
              <th style={{ color: PALETTE[i] }}>S{i}</th>
              {row.map((p, j) => (
                <td key={j} style={{ color: p > 0.2 ? PALETTE[i] : "#636C74" }}>
                  {p.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="obs-note">
        State arcs encode transition probability in width and brightness. Particle curves encode
        posterior probability. Cluster spokes encode |standardized mean|.
      </p>
    </>
  );
}
