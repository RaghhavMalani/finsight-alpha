import { monthRange } from "./format";
import {
  aucScale,
  aucTone,
  familyColor,
  foldAuc,
  importanceAt,
  stabilityNote,
  TONE_VAR,
  verdictLead,
  VERDICT_TITLE,
  type SignalView,
} from "./signal-model";

/**
 * Opens with the exporter's verdict, never with a validation score. Every colour follows the
 * number it encodes, so a ticker whose families clear chance reads green, not broken.
 */
export function SignalReadout({ view, index }: { view: SignalView; index: number }) {
  const { trace } = view,
    ho = trace.holdout,
    ci = ho.auc_ci95 ?? null;
  const [f, s] = view.frames[index],
    fold = view.folds[f],
    imp = importanceAt(view, f + 1, index)!;
  const top = imp
    .map((_, i) => i)
    .sort((a, b) => imp[b] - imp[a])
    .slice(0, 6);
  const families = [...trace.selection].sort(
    (a, b) => (b.validation_auc ?? -1) - (a.validation_auc ?? -1),
  );
  const holdoutScale = aucScale([ho.auc, ci?.low, ci?.high]),
    familyScale = aucScale(families.map((m) => m.validation_auc)),
    foldAucs = view.folds.map((_, k) => foldAuc(view, k, index)),
    foldScale = aucScale(view.folds.map((x) => x.auc[x.auc.length - 1]));
  const note = stabilityNote(trace);
  const name = (model: string) => model.replaceAll("_", " ");
  return (
    <>
      <div className="obs-eyebrow">
        Gradient boosting · {view.features.length} features · {view.folds.length} folds
      </div>
      <div>
        {trace.verdict ? (
          <div className={`obs-verdict ${trace.verdict}`} data-verdict={trace.verdict}>
            {VERDICT_TITLE[trace.verdict]}
          </div>
        ) : (
          <div className="obs-verdict">No verdict in this trace</div>
        )}
        <p className="obs-lead">{verdictLead(trace)}</p>
      </div>
      <div>
        <div className="obs-k">
          Untouched holdout · {name(ho.model)} · {ho.rows} days
        </div>
        <div className="obs-bullet" role="img" aria-label={`Holdout AUC ${ho.auc?.toFixed(3)}`}>
          <div className="track" />
          {ci && (
            <div
              className="ci"
              title={`95% bootstrap interval, ${ci.valid_resamples.toLocaleString()} resamples`}
              style={{
                left: `${holdoutScale.pos(ci.low)}%`,
                width: `${holdoutScale.pos(ci.high) - holdoutScale.pos(ci.low)}%`,
              }}
            />
          )}
          <div className="chance" />
          {ho.auc != null && (
            <div className="mk" style={{ left: `${holdoutScale.pos(ho.auc)}%` }} />
          )}
          <span className="ax" style={{ left: "0%", transform: "none" }}>
            {holdoutScale.lo.toFixed(2)}
          </span>
          <span className="ax" style={{ left: "50%" }}>
            0.50 chance
          </span>
          <span className="ax" style={{ left: "100%", transform: "translateX(-100%)" }}>
            {holdoutScale.hi.toFixed(2)}
          </span>
        </div>
        <div className="obs-sub mono">
          AUC {ho.auc == null ? "n/a" : ho.auc.toFixed(3)}
          {ci ? ` · 95% CI ${ci.low.toFixed(3)}–${ci.high.toFixed(3)}` : ""} ·{" "}
          {monthRange(ho.start.slice(0, 10), ho.end.slice(0, 10))}
        </div>
      </div>
      <div>
        <div className="obs-k">Validation AUC by model family</div>
        {trace.suppressed && (
          <p className="obs-suppressed">
            Selection suppressed: no family beat a coin flip, so picking the best of them would be
            selection on noise.
          </p>
        )}
        <div className="obs-fam">
          {families.map((m) => {
            const a = m.validation_auc,
              tone = a == null ? null : aucTone(a);
            const x = a == null ? 50 : familyScale.pos(a);
            return [
              <span key={`n${m.model}`}>
                {name(m.model)}
                {m.model === trace.selected_model && (
                  <span className="obs-tag">{trace.suppressed ? "suppressed" : "picked"}</span>
                )}
                {m.stage_trace === "AVAILABLE" && <span className="obs-tag">shown</span>}
              </span>,
              <span key={`b${m.model}`} className="fb">
                {tone && (
                  <i
                    style={{
                      left: `${Math.min(50, x)}%`,
                      width: `${Math.abs(x - 50)}%`,
                      background: TONE_VAR[tone],
                    }}
                  />
                )}
              </span>,
              <b key={`v${m.model}`} style={{ color: tone ? TONE_VAR[tone] : "var(--obs-faint)" }}>
                {a == null ? "n/a" : a.toFixed(3)}
              </b>,
            ];
          })}
        </div>
      </div>
      <div>
        <div className="obs-k">Gradient boosting, per fold</div>
        <div
          className="obs-folds"
          style={{ gridTemplateColumns: `repeat(${view.folds.length}, 1fr)` }}
        >
          {view.folds.map((x, k) => {
            const a = foldAucs[k];
            return (
              <div key={x.fold}>
                {a != null && <b style={{ color: TONE_VAR[aucTone(a)] }}>{a.toFixed(2)}</b>}
                <i
                  style={{
                    height:
                      a == null ? 2 : Math.min(44, Math.max(3, (foldScale.pos(a) / 100) * 44)),
                    background: a == null ? "var(--obs-line)" : TONE_VAR[aucTone(a)],
                  }}
                />
                F{x.fold}
              </div>
            );
          })}
        </div>
      </div>
      {note && <p className="obs-fine">{note}</p>}
      <div>
        <div className="obs-k">
          Most used · fold {fold.fold}, stage {fold.stages[s]}
        </div>
        <div className="obs-top">
          {top.map((i) => (
            <div key={i}>
              <i className="obs-dotc" style={{ background: familyColor(view, i) }} />
              <em>{view.features[i]}</em>
              <b>{imp[i].toFixed(3)}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function SignalStatus({ view, index }: { view: SignalView; index: number }) {
  const [k, s] = view.frames[index],
    fold = view.folds[k],
    a = fold.auc[s];
  return (
    <>
      Fold <b>{fold.fold}</b> / {view.folds.length} · stage <b>{fold.stages[s]}</b> · val AUC{" "}
      <b style={{ color: a == null ? undefined : TONE_VAR[aucTone(a)] }}>
        {a == null ? "n/a" : a.toFixed(3)}
      </b>
    </>
  );
}
