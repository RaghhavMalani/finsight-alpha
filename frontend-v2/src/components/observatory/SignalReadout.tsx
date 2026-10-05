import { decimal, type SignalTrace } from "./types";

export function SignalReadout({ trace, index }: { trace: SignalTrace; index: number }) {
  const allFrames = trace.folds.flatMap((f) => f.frames);
  const frame = allFrames[index],
    fold = trace.folds[frame.fold - 1];
  const final = index === allFrames.length - 1;
  const eligible = trace.folds.reduce(
    (n, f) =>
      n + f.frames.reduce((m, s) => m + s.feature_importance.filter((w) => w > 0).length, 0),
    0,
  );
  const ranked = frame.feature_importance
    .map((weight, i) => ({ weight, name: trace.feature_names[i] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  return (
    <>
      <div className="obs-eyebrow">02 / MODEL SELECTION</div>
      <h2>
        Features flow.
        <br />
        Evidence stays apart.
      </h2>
      <p>
        Each layer is an expanding development fold. The curves carry cumulative impurity importance
        from the GBM trees fitted through each stage.
      </p>
      <div className="obs-stat">
        <span>VALIDATION AUC · GBM</span>
        <strong>{decimal(frame.val_auc)}</strong>
      </div>
      <dl>
        <div>
          <dt>LOGLOSS</dt>
          <dd>{decimal(frame.val_logloss, 4)}</dd>
        </div>
        <div>
          <dt>FIT / VALIDATION</dt>
          <dd>
            {fold.fit_rows} / {fold.validation_rows} ROWS
          </dd>
        </div>
        <div>
          <dt>HORIZON / EMBARGO</dt>
          <dd>
            {trace.horizon} / {trace.embargo} ROWS
          </dd>
        </div>
        <div>
          <dt>STAGE / FOLD</dt>
          <dd>
            {frame.stage} / {frame.fold}
          </dd>
        </div>
      </dl>
      <div className="obs-eyebrow">STAGE {frame.stage} / TOP FEATURES</div>
      <div className="obs-feature-list">
        {ranked.map((v) => (
          <div key={v.name}>
            <span>{v.name}</span>
            <b>{decimal(v.weight)}</b>
            <i style={{ width: `${v.weight * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="obs-holdout">
        <div className="obs-eyebrow">UNTOUCHED OOS HOLDOUT</div>
        <strong>
          {final ? `AUC ${decimal(trace.holdout.auc)}` : "LOCKED UNTIL SELECTION COMPLETES"}
        </strong>
        <p>
          {final
            ? `${trace.selected_model} · ${trace.holdout.rows} rows · ${trace.holdout.start.slice(0, 10)} → ${trace.holdout.end.slice(0, 10)}`
            : "No holdout curves participate in fit or model-family selection."}
        </p>
      </div>
      <p className="obs-note">
        Family selection uses the final development validation slice. Earlier GBM folds are
        diagnostics. Showing the strongest of {eligible.toLocaleString()} nonzero feature-stage
        edges. The GBM trace is a candidate; the final selected family can differ.
      </p>
      <details className="obs-adapters">
        <summary>MODEL FAMILY SELECTION / STAGE ADAPTERS</summary>
        {trace.selection.map((s) => (
          <div key={s.model}>
            <b>{s.model}</b>
            <span>
              VALIDATION AUC {final ? decimal(s.validation_auc) : "PENDING"} · STAGE TRACE{" "}
              {s.stage_trace}
            </span>
            <small>{s.stage_trace_note}</small>
          </div>
        ))}
      </details>
    </>
  );
}
