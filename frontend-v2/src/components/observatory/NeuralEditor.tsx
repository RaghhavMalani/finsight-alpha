import { NEURAL_FAMILY_COLORS, type NeuralSource } from "./neural-model";
import { ACTIVATIONS, architectureErrors, LIMITS, type Architecture } from "./neural/mlp";
import {
  GEO_FAMILY,
  GEO_NEGATIVE_CONTROL,
  LAB_FEATURES,
  WORLDS,
  type WorldKind,
  type WorldSpec,
} from "./neural/world";
import { NEURAL_FAMILIES } from "./types";
import { useDataMode } from "@/replay/mode";

const SOURCES: [NeuralSource, string, string][] = [
  ["lab", "Lab", "Synthetic worlds, trained in your browser"],
  ["replay", "Replay", "Checked network trained on real PIT evidence"],
  ["live", "Live", "Train on installed evidence via the backend"],
];

/** Log-scale slider helpers for rates that span orders of magnitude. */
const toLog = (v: number, lo: number, hi: number) =>
  v <= 0 ? 0 : (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
const fromLog = (t: number, lo: number, hi: number) =>
  Number((10 ** (Math.log10(lo) + t * (Math.log10(hi) - Math.log10(lo)))).toPrecision(2));

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="nn-slider">
      <span>
        {label}
        <b>{display}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ["--p" as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/**
 * Edit the network: layers, widths, activation, regularization, optimizer and the input
 * families it may see. Lab runs train in the browser on synthetic worlds; live runs send the
 * same specification to the backend, which enforces the same bounds.
 */
export function NeuralEditor({
  open,
  onToggle,
  source,
  onSource,
  replayAvailable,
  architecture,
  onArchitecture,
  families,
  onFamilies,
  world,
  onWorld,
  training,
  loading,
  progress,
  onTrain,
  onStop,
}: {
  open: boolean;
  onToggle: () => void;
  source: NeuralSource;
  onSource: (s: NeuralSource) => void;
  replayAvailable: boolean;
  architecture: Architecture;
  onArchitecture: (a: Architecture) => void;
  families: string[];
  onFamilies: (f: string[]) => void;
  world: WorldSpec;
  onWorld: (w: WorldSpec) => void;
  training: boolean;
  loading: boolean;
  progress: number;
  onTrain: () => void;
  onStop: () => void;
}) {
  const mode = useDataMode();
  const a = architecture,
    set = (patch: Partial<Architecture>) => onArchitecture({ ...a, ...patch });
  const errors = architectureErrors(a);
  const editable = source !== "replay";
  const setWidth = (i: number, w: number) =>
    set({ hidden: a.hidden.map((x, k) => (k === i ? Math.max(2, Math.min(64, w)) : x)) });
  const inputs = LAB_FEATURES.reduce(
    (n, [f, names]) => n + (families.includes(f) ? names.length : 0),
    0,
  );
  if (!open)
    return (
      <button type="button" className="obs-ghost nn-reopen" onClick={onToggle}>
        Edit network
      </button>
    );
  return (
    <section className="nn-editor" aria-label="Network editor">
      <header>
        <h2>Network</h2>
        <button type="button" className="obs-ghost" onClick={onToggle} aria-label="Collapse editor">
          Hide
        </button>
      </header>
      <div className="nn-sources" role="radiogroup" aria-label="Training source">
        {SOURCES.map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={source === key}
            disabled={mode === "replay" && key !== "replay"}
            title={hint}
            onClick={() => onSource(key)}
          >
            {label}
            {key === "replay" && !replayAvailable && <small>none</small>}
          </button>
        ))}
      </div>
      {source === "lab" && (
        <div className="nn-group">
          <div className="obs-k">World</div>
          <select
            aria-label="Synthetic world"
            value={world.kind}
            onChange={(e) => onWorld({ ...world, kind: e.target.value as WorldKind })}
          >
            {(Object.keys(WORLDS) as WorldKind[]).map((k) => (
              <option key={k} value={k}>
                {WORLDS[k].label}
              </option>
            ))}
          </select>
          <p className="nn-note">{WORLDS[world.kind].rule}.</p>
          <Slider
            label="Signal / noise"
            value={world.strength}
            display={world.kind === "null" ? "none" : world.strength.toFixed(1)}
            min={0.2}
            max={2.5}
            step={0.1}
            onChange={(strength) => onWorld({ ...world, strength })}
          />
          <Slider
            label="World seed"
            value={world.seed}
            display={String(world.seed)}
            min={1}
            max={64}
            step={1}
            onChange={(seed) => onWorld({ ...world, seed })}
          />
        </div>
      )}
      <fieldset className="nn-group" disabled={!editable}>
        <div className="obs-k">Hidden layers</div>
        <div className="nn-layers">
          {a.hidden.map((w, i) => (
            <div key={i} className="nn-layer">
              <span>H{i + 1}</span>
              <button
                type="button"
                aria-label={`Narrow layer ${i + 1}`}
                onClick={() => setWidth(i, w > 8 ? w - 4 : w - 1)}
              >
                −
              </button>
              <input
                aria-label={`Layer ${i + 1} width`}
                type="number"
                min={LIMITS.width[0]}
                max={LIMITS.width[1]}
                value={w}
                onChange={(e) => setWidth(i, Math.round(Number(e.target.value) || 2))}
              />
              <button
                type="button"
                aria-label={`Widen layer ${i + 1}`}
                onClick={() => setWidth(i, w >= 8 ? w + 4 : w + 1)}
              >
                +
              </button>
              <i style={{ width: `${(w / 64) * 100}%` }} />
              <button
                type="button"
                className="nn-x"
                aria-label={`Remove layer ${i + 1}`}
                disabled={a.hidden.length <= 1}
                onClick={() => set({ hidden: a.hidden.filter((_, k) => k !== i) })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="obs-ghost"
          disabled={a.hidden.length >= 4}
          onClick={() =>
            set({ hidden: [...a.hidden, Math.max(2, a.hidden[a.hidden.length - 1] ?? 16)] })
          }
        >
          + Add layer
        </button>
        <div className="obs-k">Activation</div>
        <div className="nn-seg" role="radiogroup" aria-label="Activation">
          {ACTIVATIONS.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={a.activation === name}
              onClick={() => set({ activation: name })}
            >
              {name}
            </button>
          ))}
        </div>
        <Slider
          label="Dropout"
          value={a.dropout}
          display={a.dropout.toFixed(2)}
          min={0}
          max={0.6}
          step={0.05}
          onChange={(dropout) => set({ dropout })}
        />
        <Slider
          label="L2 weight decay"
          value={a.l2 === 0 ? 0 : toLog(a.l2, 1e-6, 1e-1)}
          display={a.l2 === 0 ? "0" : a.l2.toExponential(0)}
          min={0}
          max={1}
          step={0.05}
          onChange={(t) => set({ l2: t === 0 ? 0 : fromLog(t, 1e-6, 1e-1) })}
        />
        <Slider
          label="Learning rate"
          value={toLog(a.learning_rate, 1e-4, 1e-1)}
          display={a.learning_rate.toExponential(0)}
          min={0}
          max={1}
          step={0.05}
          onChange={(t) => set({ learning_rate: fromLog(t, 1e-4, 1e-1) })}
        />
        <Slider
          label="Epochs"
          value={a.epochs}
          display={String(a.epochs)}
          min={5}
          max={200}
          step={5}
          onChange={(epochs) => set({ epochs })}
        />
        <Slider
          label="Batch size"
          value={a.batch_size}
          display={String(a.batch_size)}
          min={16}
          max={256}
          step={16}
          onChange={(batch_size) => set({ batch_size })}
        />
        <Slider
          label="Seed"
          value={a.seed}
          display={String(a.seed)}
          min={0}
          max={99}
          step={1}
          onChange={(seed) => set({ seed })}
        />
        <div className="obs-k">Inputs</div>
        <div className="nn-families">
          {NEURAL_FAMILIES.map((f) => {
            const on = families.includes(f);
            return (
              <label
                key={f}
                style={{ ["--c" as string]: NEURAL_FAMILY_COLORS[f] }}
                title={f === GEO_FAMILY ? GEO_NEGATIVE_CONTROL : undefined}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    onFamilies(
                      on
                        ? families.filter((x) => x !== f)
                        : NEURAL_FAMILIES.filter((x) => x === f || families.includes(x)),
                    )
                  }
                />
                {f}
                {f === GEO_FAMILY && <em className="nn-control">negative control</em>}
              </label>
            );
          })}
        </div>
        {families.includes(GEO_FAMILY) && (
          <p className="nn-control-note">
            {source === "lab"
              ? "Geo events here are synthetic. On real data they are an exogenous negative control: earthquakes shouldn't predict next-day direction, so edge found there is treated as overfitting."
              : GEO_NEGATIVE_CONTROL}
          </p>
        )}
      </fieldset>
      {errors.length > 0 && <p className="obs-suppressed">{errors[0]}</p>}
      {!families.length && <p className="obs-suppressed">Choose at least one input family.</p>}
      <div className="nn-actions">
        {training ? (
          <>
            <div
              className="nn-progress"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${progress * 100}%` }} />
            </div>
            <button type="button" className="obs-ghost" onClick={onStop}>
              Stop
            </button>
          </>
        ) : (
          <button
            type="button"
            className="nn-train"
            disabled={!editable || loading || errors.length > 0 || !families.length}
            onClick={onTrain}
          >
            {loading
              ? "Training on the backend…"
              : source === "live"
                ? "Train on real evidence"
                : "Train network"}
          </button>
        )}
        <p className="nn-note">
          {source === "lab"
            ? `${[inputs, ...a.hidden, 1].join(" → ")}. Trains in a Web Worker; nothing leaves your browser.`
            : source === "live"
              ? "Sends this specification to the signed-in backend. Its holdout stays sealed."
              : "Replays are fixed: the preregistered network, evaluated once on its holdout."}
        </p>
      </div>
    </section>
  );
}
