import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { API_BASE } from "@/lib/api";
import { HMMReadout, HMMStatus } from "./HMMReadout";
import { hmmView, paintRegimeRibbon } from "./hmm-model";
import { MethodDrawer, type SourceMode } from "./MethodDrawer";
import { NeuralEditor } from "./NeuralEditor";
import { NEURAL_FAMILY_COLORS, paintNeuralRibbon } from "./neural-model";
import { NeuralReadout, NeuralStatus } from "./NeuralReadout";
import { useNeuralRuns } from "./useNeuralRuns";
import { byOrder } from "./regime-palette";
import { FAMILY_COLORS, paintAucRibbon, signalView } from "./signal-model";
import { SignalReadout, SignalStatus } from "./SignalReadout";
import { Timeline } from "./Timeline";
import { useReducedMotion } from "./useReducedMotion";
import { useTrainingStream } from "./useTrainingStream";
import { manifestTickers, type Manifest, type ModelTrace } from "./types";
import { loadReplayManifest } from "@/replay/client";
import { observatoryManifest } from "@/replay/observatory";
import { changeDataMode, useDataMode } from "@/replay/mode";
import { useQueryClient } from "@tanstack/react-query";
import type { ReplayManifest } from "@/replay/contracts";
import "./observatory.css";

const ObservatoryStage = lazy(() => import("./ObservatoryStage"));
const CUTOFF = "2026-10-03T04:15:00Z";
type Kind = "hmm" | "signal" | "neural";
/** Width of the network editor docked over the stage's left edge (300px card + 16px margins). */
const EDITOR = 332;

const TITLE: Record<Kind, (ticker: string) => [string, string]> = {
  hmm: (ticker) => [
    "Where the market sits, by the model's own map",
    `Each glow is one regime the Gaussian HMM learned from ${ticker}, placed by its average 20-day return, volatility and drawdown. Bundles show how often one regime hands over to another.`,
  ],
  signal: () => [
    "What the signal model leans on, fold by fold",
    "Columns are walk-forward folds. Every line is one feature, re-sorted by how much the trees used it in that fold. Brighter lines carry more weight.",
  ],
  neural: () => [
    "A network learning, epoch by epoch",
    "Columns are layers and every curve is a weight: cyan pushes toward up, magenta toward down, brighter is larger. Edit the network on the left and train it.",
  ],
};

/** Scrub positions in a trace: EM iterations, or every boosting stage of every fold. */
function stepCount(trace: ModelTrace) {
  return trace.kind === "hmm"
    ? trace.frames.length
    : trace.kind === "signal"
      ? trace.folds.reduce((n, f) => n + f.frames.length, 0)
      : trace.epochs.length + 1;
}

export default function ObservatoryPage() {
  const search = useSearch({ from: "/observatory" });
  const navigate = useNavigate({ from: "/observatory" });
  const kind = search.scene,
    ticker = search.ticker;
  const setKind = (scene: Kind) => void navigate({ search: { scene, ticker } });
  const setTicker = (next: string) => void navigate({ search: { scene: kind, ticker: next } });
  const reduced = useReducedMotion();
  const mode = useDataMode();
  const queryClient = useQueryClient();
  const setMode = (next: SourceMode) => {
    void changeDataMode(next, queryClient);
  };
  const [sharedManifest, setSharedManifest] = useState<ReplayManifest | null>(null);
  const [draftCutoff, setDraftCutoff] = useState(CUTOFF.slice(0, 16)),
    [cutoff, setCutoff] = useState(CUTOFF);
  const [manifest, setManifest] = useState<Manifest | null>(null),
    [manifestError, setManifestError] = useState<string | null>(null);
  const [methodOpen, setMethodOpen] = useState(false),
    [showFps, setShowFps] = useState(false),
    [fps, setFps] = useState<number | null>(null),
    [labelsRoot, setLabelsRoot] = useState<HTMLDivElement | null>(null),
    [tip, setTip] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadReplayManifest()
      .then((value) => {
        if (controller.signal.aborted) return;
        setSharedManifest(value);
        setManifest(observatoryManifest(value));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setManifestError(e.message);
      });
    return () => controller.abort();
  }, []);
  const tickers = [
    ...new Set([
      ticker,
      ...(manifest ? manifestTickers(manifest) : []),
      "SPY",
      "QQQ",
      "IWM",
      "RELIANCE.NS",
    ]),
  ];
  const neuralScene = kind === "neural";
  const artifact = neuralScene ? undefined : manifest?.artifacts[`${ticker}:${kind}`];
  const endpoint = kind === "hmm" ? "/regime/hmm/trace" : "/ml/trace";
  const asOf = mode === "replay" ? (artifact?.as_of ?? manifest?.as_of ?? CUTOFF) : cutoff;
  const params = new URLSearchParams({
    ticker,
    as_of: asOf,
    source: "real",
    ...(kind === "hmm" ? { n_states: "4" } : {}),
  });
  const url = neuralScene
    ? null
    : mode === "replay"
      ? (artifact?.url ?? null)
      : `${API_BASE}${endpoint}?${params}`;
  const stream = useTrainingStream(
    url,
    { kind: neuralScene ? "signal" : kind, ticker, asOf },
    mode === "replay" ? artifact?.sha256 : undefined,
    mode === "replay" ? artifact?.input_hash : undefined,
  );
  const nn = useNeuralRuns({ manifest, ticker, cutoff });
  const [editorOpen, setEditorOpen] = useState(true);
  const neural = neuralScene ? nn.view : null;
  const trace = neuralScene ? nn.trace : stream.data,
    error = neuralScene
      ? nn.error
      : (stream.error ??
        (mode === "replay"
          ? (manifestError ??
            (manifest && !artifact
              ? (sharedManifest?.artifacts[`observatory:${ticker}:${kind}`]?.reason ??
                `No publication-licensed replay for ${ticker} in the manifest`)
              : null))
          : null));

  // Scrub position and playback belong to one trace; a new trace starts at its final frame.
  const hmm = useMemo(
      () => (!neuralScene && trace?.kind === "hmm" ? hmmView(trace) : null),
      [trace, neuralScene],
    ),
    signal = useMemo(
      () => (!neuralScene && trace?.kind === "signal" ? signalView(trace) : null),
      [trace, neuralScene],
    );
  // A lab run keeps one scrub identity while it streams, so the scrubber can follow it.
  const traceKey = neuralScene
    ? neural
      ? `neural:${neural.source}:${neural.structureKey.replace(/,(true|false)]$/, "]")}:${neural.run.architecture.seed}`
      : ""
    : trace
      ? `${stream.identity}:${stream.hash}`
      : "";
  const count = neuralScene ? (neural ? neural.lastEpoch + 1 : 1) : trace ? stepCount(trace) : 1;
  const [scrub, setScrub] = useState({ key: "", index: 0, playing: false });
  const current =
    scrub.key === traceKey ? scrub : { key: traceKey, index: count - 1, playing: false };
  // While a lab network trains, the scrubber rides the newest epoch.
  const index = neural?.training ? count - 1 : Math.min(current.index, count - 1),
    playing = current.playing && !reduced;
  // Scrubbing by hand stops playback, as in the reference.
  const setIndex = useCallback(
    (next: number) => setScrub({ key: traceKey, index: next, playing: false }),
    [traceKey],
  );
  const togglePlay = useCallback(() => {
    setScrub((s) => {
      const base = s.key === traceKey ? s : { key: traceKey, index: count - 1, playing: false };
      if (base.playing) return { ...base, playing: false };
      return { key: traceKey, index: base.index >= count - 1 ? 0 : base.index, playing: true };
    });
  }, [traceKey, count]);
  const playFrom = useRef({ start: 0, index: 0 });
  useEffect(() => {
    if (!playing) return;
    const stepSeconds = kind === "hmm" ? 0.32 : kind === "neural" ? 6 / count : 9 / count;
    playFrom.current = { start: performance.now(), index };
    let raf = requestAnimationFrame(function step(now) {
      const elapsed = (now - playFrom.current.start) / 1000;
      const next = Math.min(count - 1, playFrom.current.index + Math.floor(elapsed / stepSeconds));
      setScrub((s) =>
        s.key !== traceKey || !s.playing || s.index === next
          ? s
          : { key: traceKey, index: next, playing: next < count - 1 },
      );
      if (next < count - 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
    // Playback restarts only when play is pressed, not on every frame it advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, traceKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === "Escape") setMethodOpen(false);
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (target?.matches("select, textarea, input:not([type=range]), [contenteditable='true']"))
        return;
      if (e.key === "d" || e.key === "D") setShowFps((v) => !v);
      if (e.key === " " && !target?.matches("button, a, summary")) {
        e.preventDefault();
        if (!reduced) togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reduced, togglePlay]);

  const ribbon = useMemo(
    () =>
      hmm
        ? paintRegimeRibbon(hmm, index)
        : signal
          ? paintAucRibbon(signal, index)
          : neural
            ? paintNeuralRibbon(neural, index)
            : null,
    [hmm, signal, neural, index],
  );
  const [title, lead] = TITLE[kind](ticker);
  const hash = neuralScene ? nn.hash : stream.hash;
  const shortSha = hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : null;
  const editorWidth = neuralScene && editorOpen ? EDITOR : 0;
  const sourceChip = neuralScene
    ? nn.source === "lab"
      ? "Lab · synthetic world"
      : nn.source === "replay"
        ? `Replay${shortSha ? ` · ${shortSha}` : ""}`
        : "Live model run"
    : mode === "replay"
      ? `Replay${shortSha ? ` · ${shortSha}` : ""}`
      : "Live model run";
  return (
    <ForgeShell bleed>
      <div
        className="observatory"
        data-scene={kind}
        data-editor={neuralScene && editorOpen ? "open" : undefined}
      >
        <header className="obs-bar">
          <div className="obs-brand">Model Observatory</div>
          <nav className="obs-tabs" role="tablist" aria-label="Scene">
            <button role="tab" aria-selected={kind === "hmm"} onClick={() => setKind("hmm")}>
              Regime space
            </button>
            <button role="tab" aria-selected={kind === "signal"} onClick={() => setKind("signal")}>
              Feature flow
            </button>
            <button role="tab" aria-selected={kind === "neural"} onClick={() => setKind("neural")}>
              Neural net
            </button>
          </nav>
          <div className="obs-chips">
            <label className="obs-chip obs-ticker">
              <select
                aria-label="Observatory ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
              >
                {tickers.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <span
              className={`obs-chip${(neuralScene ? nn.source === "live" : mode === "live") ? " obs-live" : ""}${neuralScene && nn.source === "lab" ? " obs-synthetic-chip" : ""}`}
              title={hash ? `sha256 ${hash}` : neuralScene ? "In-browser lab" : endpoint}
            >
              <span className="obs-dot" />
              {sourceChip}
            </span>
            {!(neuralScene && nn.source === "lab") && (
              <span className="obs-chip">As of {(neuralScene ? nn.asOf : asOf).slice(0, 10)}</span>
            )}
            <button
              type="button"
              className="obs-ghost"
              aria-controls="obs-method"
              aria-expanded={methodOpen}
              onClick={() => setMethodOpen(true)}
            >
              Method
            </button>
          </div>
        </header>
        <div className="obs-stage">
          <Suspense
            fallback={
              neuralScene ? null : <div className="obs-status">Initializing model geometry…</div>
            }
          >
            <ObservatoryStage
              kind={kind}
              hmm={hmm}
              signal={signal}
              neural={neural}
              editorWidth={editorWidth}
              index={index}
              reduced={reduced}
              labelsRoot={labelsRoot}
              tip={tip}
              onFps={showFps ? setFps : undefined}
            />
          </Suspense>
          <div className="obs-labels" ref={setLabelsRoot} />
          <div className="obs-tip" ref={setTip} role="tooltip" />
          {error ? (
            <div className="obs-status" role="alert">
              <div>
                <strong>Trace unavailable</strong>
                {error}
              </div>
            </div>
          ) : neuralScene ? (
            !neural && (
              <div className="obs-status nn-empty" role="status">
                {nn.loading
                  ? "Training on installed evidence…"
                  : nn.source === "live"
                    ? "Set the network on the left, then train it on installed evidence."
                    : "Set the network on the left and press Train. It learns in your browser, epoch by epoch."}
              </div>
            )
          ) : (
            !trace && (
              <div className="obs-status" role="status">
                {stream.loading ? "Verifying model evidence…" : "Loading checked replay manifest…"}
              </div>
            )
          )}
          <section className="obs-hud obs-title">
            <h1>{title}</h1>
            <p>{lead}</p>
          </section>
          {hmm && (
            <div className="obs-hud obs-legend">
              {byOrder(hmm.states).map((st) => (
                <span key={st.index}>
                  <i style={{ background: st.color, color: st.color }} />
                  {st.name}
                </span>
              ))}
            </div>
          )}
          {signal && (
            <div className="obs-hud obs-legend">
              {signal.families.map((name) => (
                <span key={name}>
                  <i style={{ background: FAMILY_COLORS[name], color: FAMILY_COLORS[name] }} />
                  {name}
                </span>
              ))}
            </div>
          )}
          {neural && (
            <div className="obs-hud obs-legend">
              <span>
                <i style={{ background: "#3FE0FF", color: "#3FE0FF" }} />
                Positive weight
              </span>
              <span>
                <i style={{ background: "#FF4FD8", color: "#FF4FD8" }} />
                Negative weight
              </span>
              {neural.families.map((name) => (
                <span key={name}>
                  <i
                    style={{
                      background: NEURAL_FAMILY_COLORS[name],
                      color: NEURAL_FAMILY_COLORS[name],
                    }}
                  />
                  {name}
                </span>
              ))}
            </div>
          )}
          {neuralScene && (
            <NeuralEditor
              open={editorOpen}
              onToggle={() => setEditorOpen((v) => !v)}
              source={nn.source}
              onSource={nn.setSource}
              replayAvailable={nn.replayAvailable}
              architecture={nn.architecture}
              onArchitecture={nn.setArchitecture}
              families={nn.families}
              onFamilies={nn.setFamilies}
              world={nn.world}
              onWorld={nn.setWorld}
              training={nn.training}
              loading={nn.loading}
              progress={neural ? neural.epochs.length / neural.run.architecture.epochs : 0}
              onTrain={() => void nn.train()}
              onStop={nn.stop}
            />
          )}
          <div className="obs-hud obs-hint">Drag to orbit · scroll to zoom · hover to inspect</div>
          {showFps && (
            <div className="obs-hud obs-fps">
              {fps == null ? "measuring" : `${Math.round(fps)} fps`}
            </div>
          )}
        </div>
        {(hmm || signal || neural) && (
          <aside className="obs-readout" aria-live="polite">
            {hmm && <HMMReadout view={hmm} index={index} />}
            {signal && <SignalReadout view={signal} index={index} />}
            {neural && (
              <NeuralReadout
                view={neural}
                epoch={index}
                summary={nn.summary}
                compared={nn.compared}
                holdoutLooks={nn.holdoutLooks}
                onOpenHoldout={nn.openHoldout}
                openingHoldout={nn.openingHoldout}
              />
            )}
          </aside>
        )}
        <Timeline
          count={count}
          value={index}
          playing={playing}
          reduced={reduced}
          label={kind === "hmm" ? "EM" : kind === "neural" ? "Epoch" : "Boosting stage"}
          status={
            hmm ? (
              <HMMStatus view={hmm} index={index} />
            ) : signal ? (
              <SignalStatus view={signal} index={index} />
            ) : neural ? (
              <NeuralStatus view={neural} epoch={index} />
            ) : (
              "—"
            )
          }
          axis={
            hmm
              ? [hmm.dates[0], "Regime by day · last 250 sessions", hmm.dates[hmm.dates.length - 1]]
              : signal
                ? [
                    "Fold 1",
                    "Validation AUC above / below 0.50, every boosting stage",
                    `Fold ${signal.folds.length}`,
                  ]
                : neural
                  ? [
                      "Epoch 0",
                      "Validation AUC above / below 0.50, every epoch",
                      `Epoch ${neural.run.architecture.epochs}`,
                    ]
                  : ["", "", ""]
          }
          paint={ribbon}
          onScrub={(i) => setIndex(i)}
          onPlay={togglePlay}
        />
        <MethodDrawer
          open={methodOpen}
          onClose={() => setMethodOpen(false)}
          kind={kind}
          trace={trace}
          hash={hash}
          url={url}
          mode={neuralScene ? (nn.source === "live" ? "live" : "replay") : mode}
          onMode={neuralScene ? (m) => nn.setSource(m) : setMode}
          draftCutoff={mode === "replay" ? asOf.slice(0, 16) : draftCutoff}
          onDraftCutoff={setDraftCutoff}
          onRun={() => setCutoff(new Date(draftCutoff + "Z").toISOString())}
        />
      </div>
    </ForgeShell>
  );
}
