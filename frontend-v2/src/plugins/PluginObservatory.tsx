import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { loadReplayManifest, readReplayArtifact } from "@/replay/client";
import { useDataMode } from "@/replay/mode";
import { validatePluginReplay, type PluginReplay } from "./contracts";
import "./plugins.css";

const number = (value: number | null | undefined) =>
  value == null ? "Unavailable" : value.toPrecision(4);

export default function PluginObservatory() {
  const mode = useDataMode();
  const [run, setRun] = useState<PluginReplay | null>(null),
    [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (mode !== "replay") return;
    let active = true;
    loadReplayManifest()
      .then(async (manifest) => {
        const id = manifest.routes["/plugins/momentum-fixture"];
        if (!id || !manifest.artifacts[id])
          throw new Error("No checked plugin run in this manifest");
        return validatePluginReplay(await readReplayArtifact(id), manifest.artifacts[id]);
      })
      .then((value) => {
        if (active) setRun(value);
      })
      .catch((e) => {
        if (active) setError(String(e.message ?? e));
      });
    return () => {
      active = false;
    };
  }, [mode]);
  const frame =
    run?.observatory.frames[
      Math.min(step ?? run.observatory.frames.length - 1, run.observatory.frames.length - 1)
    ];
  const values = run?.predictions.map((p) => p.signals.momentum_signal) ?? [];
  const minimum = Math.min(...values, 0),
    maximum = Math.max(...values, 0),
    span = maximum - minimum || 1;
  const path = values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(20 + (i * 820) / Math.max(1, values.length - 1)).toFixed(2)},${(180 - ((v - minimum) / span) * 140).toFixed(2)}`,
    )
    .join(" ");
  return (
    <ForgeShell>
      <section className="plugin-page">
        <nav className="plugin-nav" aria-label="Observatory scenes">
          <Link to="/observatory" search={{ scene: "hmm", ticker: "US-MKT" }}>
            HMM
          </Link>
          <Link to="/observatory" search={{ scene: "signal", ticker: "US-MKT" }}>
            Signals
          </Link>
          <Link to="/observatory" search={{ scene: "neural", ticker: "US-MKT" }}>
            Neural
          </Link>
          <span aria-current="page">Plugin runs</span>
        </nav>
        <header className="plugin-heading">
          <div>
            <p className="plugin-kicker">F8 / NERVOUS SYSTEM V0.1</p>
            <h1>One plugin. An accountable run.</h1>
            <p>
              The store admits information. The platform records selection and every holdout
              opening.
            </p>
          </div>
          <span className="plugin-scope">SYNTHETIC REFERENCE · CHECKED REPLAY</span>
        </header>
        {mode !== "replay" ? (
          <div role="alert" className="plugin-unavailable">
            <h2>Local plugin runs use the SDK</h2>
            <p>
              Run your model through the local CLI and registry. Select Replay to inspect the
              checked public reference.
            </p>
          </div>
        ) : error ? (
          <div role="alert" className="plugin-unavailable">
            <h2>Plugin evidence unavailable</h2>
            <p>{error}</p>
          </div>
        ) : !run || !frame ? (
          <p role="status">Checking run identity, source permission and artifact bytes…</p>
        ) : (
          <>
            <div className="plugin-status" aria-label="Capability status">
              <span>
                COMPUTATION <b>READY</b>
              </span>
              <span>
                INFERENCE <b className="plugin-negative">NOT_CONFIRMED</b>
              </span>
              <span>
                MARKET CLAIM <b className="plugin-negative">FALSE</b>
              </span>
              <span>
                VALIDATED ALPHA <b className="plugin-negative">FALSE</b>
              </span>
            </div>
            <div className="plugin-layout">
              <div>
                <section className="plugin-panel">
                  <div className="plugin-panel-title">
                    <h2>MomentumModel</h2>
                    <span>Platform trace / {frame.stage}</span>
                  </div>
                  <p className="plugin-subtitle">
                    Existing synthetic world · return signals · availability-aware decisions. This
                    run demonstrates the SDK; it is not a market momentum study.
                  </p>
                  <div className="plugin-splits" aria-label="Chronological split">
                    {(["fit", "validation", "holdout"] as const).map((name) => (
                      <div key={name} style={{ flex: run.contract.splits.groups[name].length }}>
                        <span>{name}</span>
                        <b>{run.contract.splits.groups[name].length} rows</b>
                      </div>
                    ))}
                  </div>
                  <p className="plugin-meta">
                    Purge {run.contract.splits.horizon_purge_rows} row · embargo{" "}
                    {run.contract.splits.embargo_rows} rows · selection uses validation only
                  </p>
                  <div className="plugin-timeline">
                    <label htmlFor="plugin-step">
                      Recorded event {frame.step + 1} / {run.observatory.frames.length}
                    </label>
                    <input
                      id="plugin-step"
                      aria-label="Recorded platform event"
                      type="range"
                      min={0}
                      max={run.observatory.frames.length - 1}
                      value={frame.step}
                      onChange={(e) => setStep(Number(e.target.value))}
                    />
                  </div>
                  <div className="plugin-readout" aria-live="polite">
                    <strong>{frame.stage.toUpperCase()}</strong>
                    <span>{frame.rows} rows</span>
                    <span>MSE {number(frame.metrics.mse)}</span>
                    <span>Correlation {number(frame.metrics.correlation)}</span>
                  </div>
                  {frame.stage === "holdout" ? (
                    <>
                      <svg
                        className="plugin-chart"
                        viewBox="0 0 860 210"
                        role="img"
                        aria-label="Actual held-out derived momentum signal, in decimal return units"
                      >
                        <line
                          x1="20"
                          x2="840"
                          y1={180 - ((0 - minimum) / span) * 140}
                          y2={180 - ((0 - minimum) / span) * 140}
                        />
                        <path d={path} />
                        <text x="20" y="20">
                          {(maximum * 100).toFixed(3)}%
                        </text>
                        <text x="20" y="204">
                          {(minimum * 100).toFixed(3)}%
                        </text>
                        <text x="840" y="204" textAnchor="end">
                          {run.predictions.length} registered holdout decisions
                        </text>
                      </svg>
                      <p className="plugin-meta">
                        Derived signal only · {run.predictions[0].decision_at.slice(0, 10)}–
                        {run.predictions.at(-1)?.decision_at.slice(0, 10)}
                      </p>
                    </>
                  ) : (
                    <p className="plugin-selection-note">
                      Candidate {run.arena.selected.candidate + 1} was frozen on validation. The
                      final holdout is outside selection.
                    </p>
                  )}
                </section>
                <section className="plugin-panel">
                  <div className="plugin-panel-title">
                    <h2>Honesty hooks</h2>
                    <span>Engineering controls</span>
                  </div>
                  <p className="plugin-subtitle">
                    One null world and one planted effect test the plumbing. They do not estimate
                    type-I error or certify inference.
                  </p>
                  <div className="plugin-hooks">
                    {Object.entries(run.honesty).map(([name, hook]) => (
                      <article key={name}>
                        <h3>{name.replaceAll("_", " ")}</h3>
                        <b>{hook.status.replaceAll("_", " ")}</b>
                        {hook.metrics ? (
                          <p>
                            MSE {number(hook.metrics.mse)} · correlation{" "}
                            {number(hook.metrics.correlation)}
                          </p>
                        ) : (
                          <p>
                            {hook.reason ??
                              (name === "leakage_sabotage"
                                ? "A feature published after its decision was rejected."
                                : `OLS point exposure · R² ${number(hook.r_squared)}`)}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              </div>
              <aside>
                <section className="plugin-panel">
                  <div className="plugin-panel-title">
                    <h2>Run registry</h2>
                    <span>Sealed</span>
                  </div>
                  <dl className="plugin-facts">
                    <dt>Attempts at publication</dt>
                    <dd>{run.accounting.attempts}</dd>
                    <dt>Candidates completed</dt>
                    <dd>{run.accounting.counts.CANDIDATE_COMPLETED}</dd>
                    <dt>This run's holdout openings</dt>
                    <dd>{run.holdout_openings}</dd>
                    <dt>Seed</dt>
                    <dd>{run.contract.seed}</dd>
                    <dt>Artifact cutoff</dt>
                    <dd>{run.contract.as_of.replace("T", " ")}</dd>
                  </dl>
                  <details>
                    <summary>Identity and source</summary>
                    <div className="plugin-identity">
                      <p>Run / {run.run_id}</p>
                      <p>Commit / {run.contract.code.commit}</p>
                      <p>Data / {run.contract.data_hash}</p>
                      <p>Source / project:nervous-fixture</p>
                      <p>Licence / FIRST_PARTY · publish_derived</p>
                    </div>
                  </details>
                </section>
                <section className="plugin-panel">
                  <div className="plugin-panel-title">
                    <h2>Risk hooks</h2>
                    <span>{run.issues.length} recorded issues</span>
                  </div>
                  {run.issues.length ? (
                    run.issues.map((issue) => (
                      <article className="plugin-issue" key={issue.id}>
                        <b>
                          {issue.severity} · {issue.kind.replaceAll("_", " ")}
                        </b>
                        <p>{issue.reason}</p>
                        <span>
                          {issue.status} · {issue.first_seen_at.slice(0, 10)}
                        </span>
                      </article>
                    ))
                  ) : (
                    <p className="plugin-subtitle">
                      No issue was raised by the installed hooks. Broader Risk Manager sweeps arrive
                      in Phase 7.
                    </p>
                  )}
                </section>
                <section className="plugin-panel plugin-boundary">
                  <h2>The inference line stays closed</h2>
                  <p>
                    HAC: NOT_CALIBRATED. Selected replacement: NOT_CONFIRMED. The 2/30 passing
                    historical settings remain descriptive evidence.
                  </p>
                  <p>
                    Computation readiness grants no inference certificate, market claim or validated
                    alpha.
                  </p>
                </section>
              </aside>
            </div>
          </>
        )}
      </section>
    </ForgeShell>
  );
}
