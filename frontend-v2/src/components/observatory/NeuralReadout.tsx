import { aucScale, aucTone, TONE_VAR, VERDICT_TITLE } from "./signal-model";
import { epochRow, NEURAL_FAMILY_COLORS, type NeuralView } from "./neural-model";
import type { AucInterval, Verdict } from "./types";
import type { HoldoutResult } from "./neural/lab";

type Validation = {
  auc: number | null;
  auc_ci95: AucInterval | null;
  status: "above_chance" | "below_chance" | "spans_chance" | "unavailable";
  rows: number;
};
export type NeuralSummary = {
  validation: Validation | null;
  holdout: HoldoutResult | null;
  world?: { label: string; rule: string; kind: string; strength: number };
  truth?: { validation_auc_ceiling: number | null; holdout_auc_ceiling: number | null };
};

const STATUS: Record<Validation["status"], [string, Verdict]> = {
  above_chance: ["Above chance on validation", "edge"],
  below_chance: ["Below chance on validation", "none"],
  spans_chance: ["Indistinguishable from chance", "inconclusive"],
  unavailable: ["No validation score", "inconclusive"],
};

/** Loss or AUC by epoch as a small SVG chart with a marker at the scrubbed epoch. */
function Curve({
  series,
  epoch,
  total,
  lo,
  hi,
  guide,
  mark,
}: {
  series: { values: (number | null)[]; color: string; label: string }[];
  epoch: number;
  total: number;
  lo: number;
  hi: number;
  guide?: number;
  mark?: number;
}) {
  const W = 288,
    H = 64,
    x = (e: number) => (e / Math.max(1, total)) * W,
    y = (v: number) => H - ((v - lo) / Math.max(1e-9, hi - lo)) * H;
  return (
    <svg
      className="obs-curve"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {guide != null && guide > lo && guide < hi && (
        <line x1={0} x2={W} y1={y(guide)} y2={y(guide)} className="guide" />
      )}
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={s.color}
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
          points={s.values
            .map((v, i) => (v == null ? null : `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`))
            .filter(Boolean)
            .join(" ")}
        />
      ))}
      {mark != null && <circle cx={x(mark)} cy={4} r={2.5} className="mark" />}
      <line x1={x(epoch)} x2={x(epoch)} y1={0} y2={H} className="now" />
    </svg>
  );
}

function Interval({
  value,
  ci,
  label,
}: {
  value: number | null;
  ci: AucInterval | null;
  label: string;
}) {
  const scale = aucScale([value, ci?.low, ci?.high]);
  return (
    <div
      className="obs-bullet"
      role="img"
      aria-label={`${label} AUC ${value?.toFixed(3) ?? "n/a"}`}
    >
      <div className="track" />
      {ci && (
        <div
          className="ci"
          style={{
            left: `${scale.pos(ci.low)}%`,
            width: `${scale.pos(ci.high) - scale.pos(ci.low)}%`,
          }}
        />
      )}
      <div className="chance" />
      {value != null && <div className="mk" style={{ left: `${scale.pos(value)}%` }} />}
      <span className="ax" style={{ left: "0%", transform: "none" }}>
        {scale.lo.toFixed(2)}
      </span>
      <span className="ax" style={{ left: "50%" }}>
        0.50 chance
      </span>
      <span className="ax" style={{ left: "100%", transform: "translateX(-100%)" }}>
        {scale.hi.toFixed(2)}
      </span>
    </div>
  );
}

/**
 * Opens with what validation supports, never with a bare score. The holdout stays sealed for
 * edited networks; in the lab it can be opened deliberately, and every opening is counted.
 */
export function NeuralReadout({
  view,
  epoch,
  summary,
  compared,
  holdoutLooks,
  onOpenHoldout,
  openingHoldout,
}: {
  view: NeuralView;
  epoch: number;
  summary: NeuralSummary;
  compared: number;
  holdoutLooks: number;
  onOpenHoldout?: () => void;
  openingHoldout?: boolean;
}) {
  const { run } = view,
    a = run.architecture,
    total = a.epochs,
    row = epochRow(view, epoch);
  const v = summary.validation,
    h = summary.holdout,
    status = v ? STATUS[v.status] : null;
  const losses = view.epochs.flatMap((e) => [e.train_loss, e.val_loss]);
  const aucs = view.epochs
    .flatMap((e) => [e.val_auc, e.train_auc])
    .filter((x): x is number => x != null);
  const families = Object.entries(run.family_attribution).sort((x, y) => y[1] - x[1]);
  const maxShare = Math.max(1e-9, ...families.map(([, s]) => s));
  const lab = view.source === "lab";
  return (
    <>
      <div className="obs-eyebrow">
        Neural network · {run.layer_sizes.join(" → ")} · {a.activation} ·{" "}
        {run.parameter_count.toLocaleString()} params
      </div>
      {summary.world && (
        <div className="obs-synthetic">
          <b>Synthetic world</b> · {summary.world.label} · SNR {summary.world.strength.toFixed(1)}
          <span>{summary.world.rule}. Generated in your browser; not market evidence.</span>
        </div>
      )}
      {view.training ? (
        <div>
          <div className="obs-verdict inconclusive">
            Training · epoch {view.epochs.length} / {total}
          </div>
          <p className="obs-lead">Every epoch streams in from the trainer as it finishes.</p>
        </div>
      ) : (
        v &&
        status && (
          <div>
            <div className={`obs-verdict ${status[1]}`}>{status[0]}</div>
            <p className="obs-lead">
              Validation AUC {v.auc == null ? "n/a" : v.auc.toFixed(3)}
              {v.auc_ci95
                ? ` (95% CI ${v.auc_ci95.low.toFixed(3)}–${v.auc_ci95.high.toFixed(3)})`
                : ""}{" "}
              on {v.rows} days the network never trained on.{" "}
              {summary.world?.kind === "null"
                ? "This world has nothing to find, so anything above 0.5 here is noise."
                : summary.truth?.validation_auc_ceiling != null
                  ? `The planted rule allows at most ${summary.truth.validation_auc_ceiling.toFixed(3)}.`
                  : "Validation alone does not certify an edge."}
            </p>
            <Interval value={v.auc} ci={v.auc_ci95} label="Validation" />
          </div>
        )
      )}
      {h && !view.training && (
        <div>
          <div className="obs-k">Untouched holdout · {h.rows} days</div>
          {h.sealed ? (
            <>
              <p className="obs-fine">{h.note}</p>
              {lab && onOpenHoldout && (
                <button
                  type="button"
                  className="obs-ghost obs-open-holdout"
                  disabled={openingHoldout}
                  onClick={onOpenHoldout}
                >
                  {openingHoldout ? "Refitting on development…" : "Open the holdout once"}
                </button>
              )}
            </>
          ) : (
            <>
              <div className={`obs-verdict ${h.verdict}`}>
                {h.verdict ? VERDICT_TITLE[h.verdict] : "—"}
              </div>
              <Interval value={h.auc} ci={h.auc_ci95} label="Holdout" />
              <div className="obs-sub mono">
                AUC {h.auc == null ? "n/a" : h.auc.toFixed(3)}
                {h.auc_ci95
                  ? ` · 95% CI ${h.auc_ci95.low.toFixed(3)}–${h.auc_ci95.high.toFixed(3)}`
                  : ""}
                {summary.truth?.holdout_auc_ceiling != null &&
                  summary.world?.kind !== "null" &&
                  ` · ceiling ${summary.truth.holdout_auc_ceiling.toFixed(3)}`}
              </div>
              {lab && holdoutLooks > 1 && (
                <p className="obs-suppressed">
                  The holdout of this world has been opened {holdoutLooks} times. Choosing among
                  networks by these scores is selection on the holdout.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {view.epochs.length > 0 && (
        <div>
          <div className="obs-k">
            Loss by epoch · <span style={{ color: "#9AA2A9" }}>train</span> ·{" "}
            <span style={{ color: "#F0A929" }}>validation</span>
          </div>
          <Curve
            series={[
              { values: view.epochs.map((e) => e.train_loss), color: "#9AA2A9", label: "train" },
              { values: view.epochs.map((e) => e.val_loss), color: "#F0A929", label: "val" },
            ]}
            epoch={epoch}
            total={total}
            lo={Math.min(...losses) * 0.98}
            hi={Math.max(...losses) * 1.02}
            mark={view.training ? undefined : run.best_val_loss_epoch}
          />
          {!view.training && (
            <p className="obs-fine">
              Lowest validation loss at epoch {run.best_val_loss_epoch}. The model shown is the
              final epoch; no epoch is picked on validation.
            </p>
          )}
        </div>
      )}
      {aucs.length > 0 && (
        <div>
          <div className="obs-k">AUC by epoch · validation vs 0.50 chance</div>
          <Curve
            series={[
              { values: view.epochs.map((e) => e.train_auc), color: "#5F676F", label: "train" },
              {
                values: view.epochs.map((e) => e.val_auc),
                color: row?.val_auc != null ? TONE_VAR[aucTone(row.val_auc)] : "#9AA2A9",
                label: "val",
              },
            ]}
            epoch={epoch}
            total={total}
            lo={Math.min(0.4, ...aucs)}
            hi={Math.max(0.6, ...aucs)}
            guide={0.5}
          />
        </div>
      )}
      {!view.training && families.length > 0 && (
        <div>
          <div className="obs-k">What the network leans on · |gradient × input|</div>
          <div className="obs-attr">
            {families.map(([name, share]) => (
              <div key={name}>
                <span>{name}</span>
                <i>
                  <b
                    style={{
                      width: `${(share / maxShare) * 100}%`,
                      background: NEURAL_FAMILY_COLORS[name] ?? "#8A939B",
                    }}
                  />
                </i>
                <em>{(share * 100).toFixed(1)}%</em>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="obs-rows">
        <div>
          <span>Epoch</span>
          <b>
            {Math.round(epoch)} / {total}
          </b>
        </div>
        <div>
          <span>Validation loss</span>
          <b>{row ? row.val_loss.toFixed(4) : "untrained"}</b>
        </div>
        <div>
          <span>Optimizer</span>
          <b>
            Adam · lr {a.learning_rate} · batch {a.batch_size}
          </b>
        </div>
        <div>
          <span>Regularization</span>
          <b>
            dropout {a.dropout} · L2 {a.l2}
          </b>
        </div>
        <div>
          <span>Networks compared here</span>
          <b>{compared}</b>
        </div>
      </div>
      {compared > 1 && (
        <p className="obs-fine">
          {compared} networks have been scored on this validation slice. The best of them is an
          optimistic estimate; only the holdout can say whether it generalizes.
        </p>
      )}
    </>
  );
}

export function NeuralStatus({ view, epoch }: { view: NeuralView; epoch: number }) {
  const row = epochRow(view, epoch);
  return (
    <>
      Epoch <b>{Math.round(epoch)}</b> / {view.run.architecture.epochs}
      {row && (
        <>
          {" "}
          · val loss <b>{row.val_loss.toFixed(3)}</b> · val AUC{" "}
          <b style={{ color: row.val_auc == null ? undefined : TONE_VAR[aucTone(row.val_auc)] }}>
            {row.val_auc == null ? "n/a" : row.val_auc.toFixed(3)}
          </b>
        </>
      )}
      {view.training && " · training"}
    </>
  );
}
