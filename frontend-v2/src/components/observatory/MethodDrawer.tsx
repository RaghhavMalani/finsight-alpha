import { useEffect, useRef } from "react";
import type { ModelTrace } from "./types";
import { GEO_NEGATIVE_CONTROL } from "./neural/world";
import { SourceCredit } from "@/replay/SourceCredit";
import type { PublicationLicense } from "@/replay/contracts";

export type SourceMode = "replay" | "live";

/** Provenance, claims and the replay/live source controls, out of the way of the scene. */
export function MethodDrawer({
  open,
  onClose,
  kind,
  trace,
  hash,
  url,
  mode,
  onMode,
  draftCutoff,
  onDraftCutoff,
  onRun,
  licence,
}: {
  open: boolean;
  onClose: () => void;
  kind: "hmm" | "signal" | "neural";
  trace: ModelTrace | null;
  hash: string | null;
  url: string | null;
  mode: SourceMode;
  onMode: (mode: SourceMode) => void;
  draftCutoff: string;
  onDraftCutoff: (value: string) => void;
  onRun: () => void;
  licence?: PublicationLicense;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) close.current?.focus();
  }, [open]);
  const p = trace?.provenance;
  const rows: [string, string][] = !trace
    ? kind === "neural"
      ? [
          [
            "Lab",
            "Lab worlds are generated in your browser from a seed. Each plants one known rule (or none) between synthetic features and the next day's direction, so you can see whether a network finds it, misses it, or invents an edge in noise. Lab numbers are not market evidence.",
          ],
          [
            "Network",
            "Dense layers trained with Adam on binary cross-entropy, inputs standardized on fit rows only, inverted dropout and L2 on weights. The model shown is the final epoch; no epoch is chosen on validation.",
          ],
          [
            "Split",
            "The production shape: an outer chronological 20% holdout, a 20% validation slice of the development rows, and a one-row purge before each boundary. The holdout stays sealed until you open it, and every opening is counted.",
          ],
        ]
      : []
    : trace.kind === "neural"
      ? [
          ["What it shows", trace.semantics],
          ["Split", trace.split_contract],
          ["Horizon / embargo", `${trace.horizon} day / ${trace.embargo} rows`],
          [
            "Holdout",
            trace.holdout.sealed
              ? (trace.holdout.note ?? "Sealed.")
              : "Evaluated once for the preregistered architecture after refitting on all development rows.",
          ],
          ...(trace.geo_provenance
            ? ([
                [
                  "Geo events",
                  `${GEO_NEGATIVE_CONTROL} ${trace.geo_provenance.disclosure} ${trace.geo_provenance.events.toLocaleString()} USGS events ≥ M${trace.geo_provenance.min_magnitude}, retrieved ${trace.geo_provenance.retrieved_at}.`,
                ],
              ] as [string, string][])
            : []),
        ]
      : trace.kind === "hmm"
        ? [
            ["What it shows", trace.semantics],
            [
              "Axes",
              "State means on rolling_return_20, realized_vol_20 and drawdown_from_252_high, scaled to standard deviations by the fit's own scaler.",
            ],
            [
              "Clouds",
              "Samples from each state's diagonal Gaussian on those three features. Density follows the stationary share of time in each state.",
            ],
          ]
        : [
            ["Importance", trace.importance_semantics],
            ["Split", trace.split_contract],
            ["Horizon / embargo", `${trace.horizon} day / ${trace.embargo} rows`],
            [
              "Model shown",
              `Gradient boosting is the only family with a stage-by-stage trace. The holdout model is ${trace.selected_model}.`,
            ],
          ];
  const validCutoff = !!draftCutoff && Number.isFinite(Date.parse(draftCutoff + "Z"));
  return (
    <aside
      id="obs-method"
      className={`obs-method${open ? " open" : ""}`}
      aria-label="Method and provenance"
      aria-hidden={!open}
    >
      <button ref={close} type="button" className="obs-ghost" onClick={onClose}>
        Close
      </button>
      <h2>
        {kind === "hmm"
          ? "Regime space · method"
          : kind === "neural"
            ? "Neural net · method"
            : "Feature flow · method"}
      </h2>
      {licence && <SourceCredit licence={licence} />}
      {rows.map(([k, v]) => (
        <div key={k}>
          <div className="obs-k">{k}</div>
          <p>{v}</p>
        </div>
      ))}
      <div className="obs-source">
        <div className="obs-k">Source</div>
        <div className="obs-source-modes" role="group" aria-label="Trace source">
          <button
            type="button"
            className="obs-ghost"
            aria-pressed={mode === "replay"}
            onClick={() => onMode("replay")}
          >
            Checked replay
          </button>
          <button
            type="button"
            className="obs-ghost"
            aria-pressed={mode === "live"}
            onClick={() => onMode("live")}
          >
            Live model run
          </button>
        </div>
        <label>
          Cutoff (UTC)
          <input
            aria-label="Model cutoff UTC"
            type="datetime-local"
            value={draftCutoff}
            disabled={mode === "replay"}
            onChange={(e) => onDraftCutoff(e.target.value)}
          />
        </label>
        {mode === "live" && (
          <button type="button" className="obs-ghost" disabled={!validCutoff} onClick={onRun}>
            Run fit
          </button>
        )}
        <p>
          Live runs compute on locally installed evidence. The market collector is stopped.
          Historical posterior states and validation scores do not certify alpha.
        </p>
      </div>
      {trace && (
        <div>
          <div className="obs-k">Claims</div>
          <dl>
            {Object.entries(trace.claims).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k.replaceAll("_", " ")}</dt>
                <dd>{v ? "yes" : "no"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {trace && p && (
        <div>
          <div className="obs-k">Provenance</div>
          <dl>
            <dt>trace sha256</dt>
            <dd>{hash ?? "live run, not a checked artifact"}</dd>
            <dt>input sha256</dt>
            <dd>{p.input_hash}</dd>
            <dt>as of</dt>
            <dd>{trace.as_of}</dd>
            <dt>latest input</dt>
            <dd>
              {p.latest_observation} · available {p.latest_availability}
            </dd>
            <dt>coverage</dt>
            <dd>{p.coverage}</dd>
            <dt>evidence</dt>
            <dd>{p.evidence_mode}</dd>
            <dt>qualities</dt>
            <dd>{p.evidence_quality.join(" · ")}</dd>
            <dt>source</dt>
            <dd>{p.source.join(" · ")}</dd>
            <dt>observations</dt>
            <dd>{p.observations.toLocaleString()}</dd>
            <dt>price basis</dt>
            <dd>{p.price_basis}</dd>
            {(trace.kind === "hmm" || trace.kind === "neural") && (
              <>
                <dt>scaler sha256</dt>
                <dd>{trace.scaler_hash}</dd>
              </>
            )}
            {trace.kind === "neural" && trace.geo_provenance && (
              <>
                <dt>USGS catalog sha256</dt>
                <dd>{trace.geo_provenance.sha256}</dd>
              </>
            )}
          </dl>
          {p.disclosure && <p style={{ marginTop: 10 }}>{p.disclosure}</p>}
          {p.source_urls?.map((source) => (
            <p key={source}>
              <a href={source} target="_blank" rel="noreferrer">
                Original research source
              </a>
            </p>
          ))}
          {url && (
            <p style={{ marginTop: 10 }}>
              <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--obs-fg)" }}>
                Open model trace ↗
              </a>
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
