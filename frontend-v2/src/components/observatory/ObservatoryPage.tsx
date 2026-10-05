import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { Panel } from "@/components/terminal/Panel";
import { API_BASE } from "@/lib/api";
import { useTrainingStream } from "./useTrainingStream";
import { validateManifest, type Manifest } from "./types";
import "./observatory.css";

const HMMScene = lazy(() => import("./HMMScene")),
  SignalScene = lazy(() => import("./SignalScene"));
const CUTOFF = "2026-10-03T04:15:00Z";
export default function ObservatoryPage() {
  const search = useSearch({ from: "/observatory" });
  const navigate = useNavigate({ from: "/observatory" });
  const kind = search.scene,
    ticker = search.ticker;
  const setKind = (scene: "hmm" | "signal") => void navigate({ search: { scene, ticker } });
  const setTicker = (next: "SPY" | "QQQ" | "IWM") =>
    void navigate({ search: { scene: kind, ticker: next } });
  const [mode, setMode] = useState<"replay" | "live">("replay"),
    [draftCutoff, setDraftCutoff] = useState(CUTOFF.slice(0, 16)),
    [cutoff, setCutoff] = useState(CUTOFF);
  const [manifest, setManifest] = useState<Manifest | null>(null),
    [manifestError, setManifestError] = useState<string | null>(null);
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
        ? (manifestError ?? (manifest && !artifact ? "No checked replay for this request" : null))
        : null);
  return (
    <ForgeShell>
      <div className="observatory">
        <div className="obs-page-heading">
          <div>
            <div className="obs-eyebrow">RESEARCH INSTRUMENT / 007</div>
            <h1>
              Model Observatory<span>.</span>
            </h1>
            <p>Watch the fit. Inspect the evidence.</p>
          </div>
          <div className="obs-identity">
            POINT-IN-TIME BOUNDED
            <br />
            <span>REAL SPY / QQQ / IWM EVIDENCE</span>
          </div>
        </div>
        <div className="obs-toolbar">
          <div className="obs-tabs" role="tablist" aria-label="Model scenes">
            <button role="tab" aria-selected={kind === "hmm"} onClick={() => setKind("hmm")}>
              01 HMM REGIMES
            </button>
            <button role="tab" aria-selected={kind === "signal"} onClick={() => setKind("signal")}>
              02 SIGNAL FOREST
            </button>
          </div>
          <label>
            TICKER
            <select
              aria-label="Observatory ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value as typeof ticker)}
            >
              {["SPY", "QQQ", "IWM"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            SOURCE
            <select
              aria-label="Trace source"
              value={mode}
              onChange={(e) => setMode(e.target.value as "replay" | "live")}
            >
              <option value="replay">CHECKED REPLAY</option>
              <option value="live">LIVE MODEL RUN</option>
            </select>
          </label>
          <label>
            AS_OF (UTC)
            <input
              aria-label="Model cutoff UTC"
              type="datetime-local"
              value={mode === "replay" ? asOf.slice(0, 16) : draftCutoff}
              disabled={mode === "replay"}
              onChange={(e) => setDraftCutoff(e.target.value)}
            />
          </label>
          {mode === "live" && (
            <button
              className="obs-run"
              disabled={!draftCutoff || !Number.isFinite(Date.parse(draftCutoff + "Z"))}
              onClick={() => setCutoff(new Date(draftCutoff + "Z").toISOString())}
            >
              RUN FIT ↗
            </button>
          )}
        </div>
        <Panel
          code={kind === "hmm" ? "OBS.HMM" : "OBS.GBM"}
          title={kind === "hmm" ? "HMM REGIME OBSERVATORY" : "SIGNAL MODEL FOREST"}
          source={mode === "replay" ? "REPLAY" : "LIVE MODEL RUN"}
          asOf={asOf}
          right={
            <span className="obs-panel-status">
              {trace
                ? `${trace.feature_names.length} FEATURES / SEED ${trace.seed}`
                : "EVIDENCE CHECK"}
            </span>
          }
        >
          {error ? (
            <div className="obs-empty" role="alert">
              <strong>TRACE UNAVAILABLE</strong>
              <p>{error}</p>
            </div>
          ) : !trace ? (
            <div className="obs-empty" role="status">
              {stream.loading
                ? "LOADING / VERIFYING MODEL EVIDENCE"
                : "LOADING CHECKED REPLAY MANIFEST"}
            </div>
          ) : (
            <Suspense fallback={<div className="obs-empty">INITIALIZING MODEL GEOMETRY</div>}>
              {trace.kind === "hmm" ? (
                <HMMScene key={`${ticker}:${asOf}:${mode}`} trace={trace} hash={stream.hash} />
              ) : (
                <SignalScene key={`${ticker}:${asOf}:${mode}`} trace={trace} hash={stream.hash} />
              )}
            </Suspense>
          )}
        </Panel>
        {trace && (
          <div className="obs-provenance">
            <div>
              <span>MARKET EVIDENCE</span>
              <strong>
                {trace.provenance.coverage} · {trace.provenance.evidence_mode}
              </strong>
              <p>{trace.provenance.disclosure}</p>
            </div>
            <div>
              <span>ACTUAL LATEST INPUT</span>
              <strong>{trace.provenance.latest_observation}</strong>
              <p>
                AVAILABLE {trace.provenance.latest_availability} ·{" "}
                {trace.provenance.observations.toLocaleString()} ADMITTED BARS
              </p>
            </div>
            <details>
              <summary>PROVENANCE / SHA-256 ↗</summary>
              <a
                href={url ?? undefined}
                className="text-info inline-block my-3"
                target="_blank"
                rel="noreferrer"
              >
                OPEN MODEL TRACE ↗
              </a>
              <dl>
                <div>
                  <dt>INPUT</dt>
                  <dd>{trace.provenance.input_hash}</dd>
                </div>
                {stream.hash && (
                  <div>
                    <dt>ARTIFACT</dt>
                    <dd>{stream.hash}</dd>
                  </div>
                )}
                <div>
                  <dt>SOURCE</dt>
                  <dd>{trace.provenance.source.join(" · ")}</dd>
                </div>
                <div>
                  <dt>QUALITIES</dt>
                  <dd>{trace.provenance.evidence_quality.join(" · ")}</dd>
                </div>
                <div>
                  <dt>PRICE BASIS</dt>
                  <dd>{trace.provenance.price_basis}</dd>
                </div>
                {trace.kind === "hmm" && (
                  <div>
                    <dt>SCALER</dt>
                    <dd>{trace.scaler_hash}</dd>
                  </div>
                )}
              </dl>
            </details>
          </div>
        )}
        <div className="obs-page-note">
          LIVE MODEL RUN computes on installed evidence. The market collector is stopped. Historical
          posterior states and validation scores do not certify alpha.
        </div>
      </div>
    </ForgeShell>
  );
}
