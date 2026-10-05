import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { API_BASE } from "@/lib/api";
import { HMMReadout } from "./HMMReadout";
import { MethodDrawer, type SourceMode } from "./MethodDrawer";
import type { Metrics } from "./SceneFrame";
import { SignalReadout } from "./SignalReadout";
import { Timeline } from "./Timeline";
import { useReducedMotion } from "./useReducedMotion";
import { useTrainingStream } from "./useTrainingStream";
import { manifestTickers, validateManifest, type Manifest, type ModelTrace } from "./types";
import "./observatory.css";

const ObservatoryStage = lazy(() => import("./ObservatoryStage"));
const CUTOFF = "2026-10-03T04:15:00Z";
type Kind = "hmm" | "signal";

const TITLE: Record<Kind, (ticker: string) => [string, string]> = {
  hmm: (ticker) => [
    "Where the market sits, by the model's own map",
    `Each glow is one regime the Gaussian HMM learned from ${ticker}, placed by its average 20-day return, volatility and drawdown. Bundles show how often one regime hands over to another.`,
  ],
  signal: () => [
    "What the signal model leans on, fold by fold",
    "Columns are walk-forward folds. Every line is one feature, re-sorted by how much the trees used it in that fold. Brighter lines carry more weight.",
  ],
};

/** Scrub positions in a trace: EM iterations, or every boosting stage of every fold. */
function stepCount(trace: ModelTrace) {
  return trace.kind === "hmm"
    ? trace.frames.length
    : trace.folds.reduce((n, f) => n + f.frames.length, 0);
}

export default function ObservatoryPage() {
  const search = useSearch({ from: "/observatory" });
  const navigate = useNavigate({ from: "/observatory" });
  const kind = search.scene,
    ticker = search.ticker;
  const setKind = (scene: Kind) => void navigate({ search: { scene, ticker } });
  const setTicker = (next: string) => void navigate({ search: { scene: kind, ticker: next } });
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<SourceMode>("replay"),
    [draftCutoff, setDraftCutoff] = useState(CUTOFF.slice(0, 16)),
    [cutoff, setCutoff] = useState(CUTOFF);
  const [manifest, setManifest] = useState<Manifest | null>(null),
    [manifestError, setManifestError] = useState<string | null>(null);
  const [methodOpen, setMethodOpen] = useState(false),
    [showFps, setShowFps] = useState(false),
    [fps, setFps] = useState<number | null>(null),
    [, setMetrics] = useState<Metrics | null>(null),
    [labelsRoot, setLabelsRoot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/artifacts/observatory/manifest.json", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Replay manifest unavailable");
        return r.json();
      })
      .then((value) => {
        setManifest(validateManifest(value));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setManifestError(e.message);
      });
    return () => controller.abort();
  }, []);
  const tickers = manifest ? manifestTickers(manifest) : [ticker];
  const artifact = manifest?.artifacts[`${ticker}:${kind}`];
  const endpoint = kind === "hmm" ? "/regime/hmm/trace" : "/ml/trace";
  const asOf = mode === "replay" ? (manifest?.as_of ?? CUTOFF) : cutoff;
  const params = new URLSearchParams({
    ticker,
    as_of: asOf,
    source: "real",
    ...(kind === "hmm" ? { n_states: "4" } : {}),
  });
  const url = mode === "replay" ? (artifact?.url ?? null) : `${API_BASE}${endpoint}?${params}`;
  const stream = useTrainingStream(
    url,
    { kind, ticker, asOf },
    mode === "replay" ? artifact?.sha256 : undefined,
    mode === "replay" ? artifact?.input_hash : undefined,
  );
  const trace = stream.data,
    error =
      stream.error ??
      (mode === "replay"
        ? (manifestError ??
          (manifest && !artifact ? `No checked replay for ${ticker} in the manifest` : null))
        : null);

  // Scrub position and playback belong to one trace; a new trace starts at its final frame.
  const traceKey = trace ? `${stream.identity}:${stream.hash}` : "";
  const count = trace ? stepCount(trace) : 1;
  const [scrub, setScrub] = useState({ key: "", index: 0, playing: false });
  const current =
    scrub.key === traceKey ? scrub : { key: traceKey, index: count - 1, playing: false };
  const index = Math.min(current.index, count - 1),
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
    const stepSeconds = kind === "hmm" ? 0.32 : 9 / count;
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

  const [title, lead] = TITLE[kind](ticker);
  const shortSha = stream.hash ? `${stream.hash.slice(0, 8)}…${stream.hash.slice(-4)}` : null;
  return (
    <ForgeShell bleed>
      <div className="observatory" data-scene={kind}>
        <header className="obs-bar">
          <div className="obs-brand">Model Observatory</div>
          <nav className="obs-tabs" role="tablist" aria-label="Scene">
            <button role="tab" aria-selected={kind === "hmm"} onClick={() => setKind("hmm")}>
              Regime space
            </button>
            <button role="tab" aria-selected={kind === "signal"} onClick={() => setKind("signal")}>
              Feature flow
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
              className={`obs-chip${mode === "live" ? " obs-live" : ""}`}
              title={stream.hash ? `sha256 ${stream.hash}` : endpoint}
            >
              <span className="obs-dot" />
              {mode === "replay" ? `Replay${shortSha ? ` · ${shortSha}` : ""}` : "Live model run"}
            </span>
            <span className="obs-chip">As of {asOf.slice(0, 10)}</span>
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
        <main className="obs-stage">
          <Suspense fallback={<div className="obs-status">Initializing model geometry…</div>}>
            <ObservatoryStage
              kind={kind}
              trace={trace}
              index={index}
              reduced={reduced}
              labelsRoot={labelsRoot}
              onMetrics={setMetrics}
              onFps={setFps}
            />
          </Suspense>
          <div className="obs-labels" ref={setLabelsRoot} />
          {error ? (
            <div className="obs-status" role="alert">
              <div>
                <strong>Trace unavailable</strong>
                {error}
              </div>
            </div>
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
          <div className="obs-hud obs-hint">Drag to orbit · scroll to zoom · hover to inspect</div>
          {showFps && (
            <div className="obs-hud obs-fps">
              {fps == null ? "measuring" : `${Math.round(fps)} fps`}
            </div>
          )}
        </main>
        {trace && (
          <aside className="obs-readout" aria-live="polite">
            {trace.kind === "hmm" ? (
              <HMMReadout trace={trace} index={index} />
            ) : (
              <SignalReadout trace={trace} index={index} />
            )}
          </aside>
        )}
        <Timeline
          count={count}
          value={index}
          playing={playing}
          reduced={reduced}
          label={kind === "hmm" ? "EM" : "Boosting stage"}
          status={trace ? `${index + 1} / ${count}` : "—"}
          axis={["", "", ""]}
          paint={null}
          onScrub={(i) => setIndex(i)}
          onPlay={togglePlay}
        />
        <MethodDrawer
          open={methodOpen}
          onClose={() => setMethodOpen(false)}
          kind={kind}
          trace={trace}
          hash={stream.hash}
          url={url}
          mode={mode}
          onMode={setMode}
          draftCutoff={mode === "replay" ? asOf.slice(0, 16) : draftCutoff}
          onDraftCutoff={setDraftCutoff}
          onRun={() => setCutoff(new Date(draftCutoff + "Z").toISOString())}
        />
      </div>
    </ForgeShell>
  );
}
