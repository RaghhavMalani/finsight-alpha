import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { ReplayError } from "@/replay/contracts";
import { useDataMode } from "@/replay/mode";
import { lookupInstrument } from "@/markets/instruments";
import type { Snapshot } from "./contracts";
import { CrossMarketMatrix } from "./CrossMarketMatrix";
import { LineageDrawer } from "./LineageDrawer";
import {
  EventPanel,
  FactorPanel,
  HmmPanel,
  MomentumPanels,
  SeasonalityPanel,
  TimelinePanel,
  TransitionPanel,
  VolatilityPanel,
} from "./panels";
import { fmt, pct } from "./format";
import { Hash, ProvenanceProvider, Stamp } from "@/visual/Num";
import { ref } from "@/visual/origins";
import { provHelpers } from "@/visual/route-origin";
import { manifestDigestOrigin, SnapshotProvenance, useRegimeOrigin, useSnapshotProv } from "./prov";
import {
  LOCAL_ASSETS,
  PUBLIC_ASSETS,
  useHistory,
  useLineage,
  useMatrix,
  useReplayBinding,
  useSealedSnapshot,
  useSnapshot,
  useTimeline,
} from "./query";
import "./regimes.css";

const MODES = ["now", "replay", "compare"] as const;
type Mode = (typeof MODES)[number];

function resolveAsset(search: Record<string, unknown>, dataMode: string) {
  const raw = String(search.asset ?? search.ticker ?? "US-MKT").toUpperCase();
  if ((PUBLIC_ASSETS as readonly string[]).includes(raw)) return { asset: raw, note: null };
  if (dataMode === "live" && (LOCAL_ASSETS as readonly string[]).includes(raw))
    return { asset: raw, note: null };
  const india = raw.endsWith(".NS") || lookupInstrument(raw)?.market === "INDIA";
  return {
    asset: india ? "IN-MKT" : "US-MKT",
    note:
      raw === "US-MKT" || raw === "IN-MKT"
        ? null
        : `${raw} has no public regime evidence (no derived-publication grant or admitted source). Showing the ${
            india ? "INDIA" : "US"
          } MARKET-FACTOR REGIME, which is a market factor, not ${raw}.`,
  };
}

function Badges({
  snapshot,
  digest,
}: {
  snapshot: Snapshot;
  digest: { id: string; sha256: string | null } | null;
}) {
  const mode = useDataMode();
  const sha = digest?.sha256 ?? null;
  const first =
    mode === "replay" ? `REPLAY · sha256 ${sha ? sha.slice(0, 12) : "…"}` : "LOCAL MODEL RUN";
  return (
    <ul className="regimes-badges" aria-label="Evidence badges">
      <li key={first} data-badge={first}>
        {mode === "replay" ? (
          <>
            REPLAY · <span data-num-exempt="id">sha256</span>{" "}
            {digest && sha ? (
              <Hash
                h={ref(manifestDigestOrigin(digest.id), sha)}
                label="Snapshot artifact SHA-256"
                display={sha.slice(0, 12)}
                className="vx-inherit"
              />
            ) : (
              "…"
            )}
          </>
        ) : (
          first
        )}
      </li>
      {snapshot.badges.map((b) => (
        <li key={b} data-badge={b}>
          {b}
        </li>
      ))}
    </ul>
  );
}

function useTiles(snapshot: Snapshot) {
  const { N } = useSnapshotProv();
  return useMemo((): { label: string; value: ReactNode; note: ReactNode }[] => {
    const hmm = snapshot.current.regime,
      g = snapshot.volatility.garch as Record<string, number | string | null>;
    const serious = snapshot.issues.filter(
      (i) => i.severity === "MEDIUM" || i.severity === "HIGH",
    ).length;
    return [
      {
        label: "CURRENT REGIME",
        value: hmm?.hmm_state ?? "UNAVAILABLE",
        note: "hmm2 filtered state at state_at",
      },
      {
        label: "VOL STATE",
        value: String(snapshot.current.volatility.volatility_state ?? "—"),
        note: <span data-num-exempt="copy">frozen D0.4.2 rule</span>,
      },
      {
        label: "HMM POSTERIOR",
        value: N(
          "/payload/current/regime/hmm_posterior",
          hmm?.hmm_posterior,
          "hmm2 filtered posterior",
          pct(hmm?.hmm_posterior ?? null),
        ),
        note: "filtered, not calibrated",
      },
      {
        label: "PERSISTENCE",
        value: (
          <>
            {N(
              "/payload/current/regime/expected_duration",
              hmm?.expected_duration,
              "hmm2 expected duration",
              fmt(hmm?.expected_duration ?? null, 1),
            )}{" "}
            {snapshot.observation_unit}s
          </>
        ),
        note:
          g.fit_status === "CONVERGED" ? (
            <>
              GARCH α+β{" "}
              {N(
                "/payload/volatility/garch/persistence",
                g.persistence as number | null,
                "GARCH α+β",
                fmt((g.persistence as number | null) ?? null, 3),
              )}
            </>
          ) : (
            `GARCH persistence not identified (${String(g.fit_status ?? "—")})`
          ),
      },
      {
        label: "DATA QUALITY",
        value: snapshot.evidence_quality.weakest ?? "—",
        note: (
          <>
            {N("/payload/issues", serious, "Medium/high issue hooks", String(serious), {
              formula: "count of /payload/issues where severity = MEDIUM or HIGH",
            })}{" "}
            medium/high issues
          </>
        ),
      },
    ];
  }, [snapshot, N]);
}

function Tiles({ snapshot }: { snapshot: Snapshot }) {
  const tiles = useTiles(snapshot);
  return (
    <div className="regimes-tiles" role="list" aria-label="Current regime summary">
      {tiles.map((t) => (
        <div key={t.label} role="listitem" className="regimes-tile">
          <span>{t.label}</span>
          <strong>{t.value}</strong>
          <small>{t.note}</small>
        </div>
      ))}
    </div>
  );
}

function CompareClock({ s }: { s: Snapshot }) {
  const { D } = useSnapshotProv();
  return (
    <p className="regimes-footnote">
      requested{" "}
      {D("/payload/requested_as_of", s.requested_as_of, "Requested as_of", s.requested_as_of)} ·
      state_at{" "}
      {s.state_at ? D("/payload/state_at", s.state_at, "Actual state_at", s.state_at) : "—"} ·{" "}
      {s.observation_unit} steps
    </p>
  );
}

function Dashboard({ snapshot }: { snapshot: Snapshot }) {
  const timeline = useTimeline(snapshot.asset, snapshot.requested_as_of);
  const s = snapshot.module_statuses;
  const usableTimeline = timeline.data?.payload;
  const tp = provHelpers(useRegimeOrigin("timeline", snapshot.asset, snapshot.requested_as_of));
  return (
    <div className="regimes-grid">
      <TimelinePanel snapshot={snapshot} timeline={usableTimeline} status={s.hmm} tp={tp} />
      <VolatilityPanel snapshot={snapshot} timeline={usableTimeline} status={s.volatility} />
      <HmmPanel snapshot={snapshot} status={s.hmm} />
      <TransitionPanel snapshot={snapshot} status={s.hmm} />
      <SeasonalityPanel status={s.seasonality} />
      <FactorPanel snapshot={snapshot} status={s.factors} />
      <MomentumPanels snapshot={snapshot} status={s.momentum} />
      <EventPanel status={s.events} iohmm={s.iohmm} />
    </div>
  );
}

function Issues({ snapshot }: { snapshot: Snapshot }) {
  const { N } = useSnapshotProv();
  return (
    <details className="regimes-issues">
      <summary>
        {N("/payload/issues", snapshot.issues.length, "Open issue hooks", undefined, {
          formula: "count of /payload/issues",
        })}{" "}
        open issue hooks · fracture{" "}
        {snapshot.fracture ? (
          <>
            partial subtotal{" "}
            {N(
              "/payload/fracture/available_contribution_sum",
              snapshot.fracture.available_contribution_sum,
              "Fracture partial subtotal",
              snapshot.fracture.available_contribution_sum.toFixed(3),
            )}{" "}
            (coverage{" "}
            {N(
              "/payload/fracture/coverage",
              snapshot.fracture.coverage,
              "Fracture coverage",
              pct(snapshot.fracture.coverage, 0),
            )}
            ; full score unavailable)
          </>
        ) : (
          "unavailable"
        )}
      </summary>
      <ul>
        {snapshot.issues.map((i) => (
          <li key={i.id} data-severity={i.severity}>
            <b>{i.kind}</b> · {i.severity} · {i.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function RegimeIntelligence() {
  const dataMode = useDataMode();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const { asset, note } = resolveAsset(search, dataMode);
  const mode: Mode = (MODES as readonly string[]).includes(String(search.mode))
    ? (search.mode as Mode)
    : "now";
  const [lineageFor, setLineageFor] = useState<string | null>(null);
  const snapshot = useSnapshot(asset);
  const history = useHistory(asset);
  const selected = typeof search.at === "string" ? search.at : null;
  const sealedEntry = history.data?.payload.entries.find((e) => e.as_of === selected) ?? null;
  const selecting = mode === "replay" && dataMode === "replay" && selected !== null;
  const selectedIdentity = selecting ? (sealedEntry?.snapshot_artifact ?? null) : null;
  const sealed = useSealedSnapshot(selectedIdentity, asset, selected);
  const binding = useReplayBinding("snapshot", asset, selectedIdentity);
  const otherAsset = asset === "IN-MKT" ? "US-MKT" : "IN-MKT";
  const other = useSnapshot(otherAsset);
  const snapAt = useRegimeOrigin("snapshot", asset, null, selectedIdentity);
  const otherAt = useRegimeOrigin("snapshot", otherAsset);
  const historyProv = provHelpers(useRegimeOrigin("history", asset));
  const matrixAt = useRegimeOrigin("matrix", null);
  const matrix = useMatrix();
  const go = (patch: Record<string, unknown>) =>
    void navigate({ to: "/dynamics", search: { ...search, ...patch } as never });
  const assets = dataMode === "live" ? [...PUBLIC_ASSETS, ...LOCAL_ASSETS] : [...PUBLIC_ASSETS];
  const evidenceError = selecting
    ? (history.error ??
      sealed.error ??
      (history.data && !sealedEntry
        ? new ReplayError("Requested cutoff is not in the sealed history.")
        : null))
    : snapshot.error;
  const current = evidenceError
    ? undefined
    : selecting
      ? sealed.data?.payload
      : snapshot.data?.payload;
  const P = provHelpers(snapAt);
  const lineage = useLineage(
    lineageFor ?? asset,
    lineageFor !== null,
    lineageFor === asset ? (current?.requested_as_of ?? null) : null,
  );

  return (
    <ProvenanceProvider>
      <section
        className="regimes-workspace"
        aria-label="Regime intelligence"
        data-state={current ? "ready" : evidenceError ? "unavailable" : "loading"}
        data-mode={mode}
        data-asset={asset}
      >
        <header className="regimes-title">
          <div>
            <span className="regimes-eyebrow">F4 / REGIMES · PHASE 5</span>
            <h1>
              {current?.market ??
                (asset === "IN-MKT" ? "INDIA MARKET-FACTOR REGIME" : "US MARKET-FACTOR REGIME")}
            </h1>
            <p>
              {current
                ? `${current.series_label} · ${current.not_a ?? ""}`
                : "Registered volatility/HMM stack over admitted evidence"}
            </p>
            {note && (
              <p className="regimes-note" role="note">
                {note}
              </p>
            )}
          </div>
          <div className="regimes-controls">
            <div role="group" aria-label="Market">
              {assets.map((a) => (
                <button
                  key={a}
                  aria-pressed={a === asset}
                  onClick={() => go({ asset: a, ticker: undefined, at: undefined })}
                >
                  {a}
                </button>
              ))}
            </div>
            <div role="tablist" aria-label="Regime mode">
              {MODES.map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={m === mode}
                  onClick={() => go({ mode: m })}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </header>

        {!current ? (
          <div className="regimes-state" role={evidenceError ? "alert" : "status"}>
            {evidenceError ? (
              <>
                <strong>Regime evidence unavailable</strong>
                <p>{evidenceError.message}</p>
                <p>No synthetic world, weaker provider or proxy is substituted.</p>
                <button
                  onClick={() =>
                    selecting
                      ? selectedIdentity
                        ? sealed.refetch()
                        : history.refetch()
                      : snapshot.refetch()
                  }
                >
                  Retry evidence
                </button>
              </>
            ) : (
              <p>Verifying sealed regime evidence…</p>
            )}
          </div>
        ) : (
          <SnapshotProvenance at={snapAt}>
            <div className="regimes-clock">
              <span>
                requested as_of{" "}
                <b>
                  {P.D(
                    "/payload/requested_as_of",
                    current.requested_as_of,
                    "Requested as_of",
                    current.requested_as_of,
                  )}
                </b>
              </span>
              <span>
                actual state_at{" "}
                <b>
                  {current.state_at
                    ? P.D(
                        "/payload/state_at",
                        current.state_at,
                        "Actual state_at",
                        current.state_at,
                      )
                    : "—"}
                </b>
              </span>
              {current.stale_calendar_days !== null && (
                <span>
                  age{" "}
                  <b>
                    {P.N(
                      "/payload/stale_calendar_days",
                      current.stale_calendar_days,
                      "Age in calendar days",
                      String(Math.round(current.stale_calendar_days)),
                    )}{" "}
                    calendar days
                  </b>
                </span>
              )}
              <span>
                evidence <b>{current.evidence_quality.present.join(" + ")}</b>
              </span>
              <button className="regimes-link" onClick={() => setLineageFor(asset)}>
                Why is this regime state available?
              </button>
            </div>
            <Badges snapshot={current} digest={binding.data ?? null} />
            <Tiles snapshot={current} />

            {mode === "replay" && (
              <section className="regimes-panel" aria-labelledby="regimes-sealed-title">
                <header>
                  <h2 id="regimes-sealed-title">Sealed multi-cutoff timeline</h2>
                </header>
                <p className="regimes-subtitle">
                  {history.data?.payload.semantics ?? current.layers.sealed}
                </p>
                {dataMode === "live" ? (
                  <p className="regimes-muted">
                    Local mode shows the latest sealed local run; the public sealed history lives in
                    Replay.
                  </p>
                ) : (
                  <ol className="regimes-history">
                    {(history.data?.payload.entries ?? []).map((e, i) => {
                      const at = `/payload/entries/${i}`;
                      return (
                        <li key={e.as_of}>
                          <button
                            aria-pressed={e.as_of === (selected ?? current.requested_as_of)}
                            onClick={() => go({ at: e.as_of })}
                          >
                            as_of{" "}
                            <Stamp
                              s={ref(historyProv.at(`${at}/as_of`), e.as_of)}
                              label="Sealed run as_of"
                              display={e.as_of}
                              inert
                              className="vx-inherit"
                            />{" "}
                            · state_at{" "}
                            <Stamp
                              s={ref(historyProv.at(`${at}/state_at`), e.state_at)}
                              label="Sealed run state_at"
                              display={e.state_at.slice(0, 10)}
                              inert
                              className="vx-inherit"
                            />{" "}
                            · {e.hmm2_state}{" "}
                            {historyProv.N(
                              `${at}/hmm2_posterior`,
                              e.hmm2_posterior,
                              "hmm2 posterior",
                              pct(e.hmm2_posterior),
                              {},
                              "x",
                              true,
                            )}{" "}
                            · {e.volatility_state} · {e.evidence}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <p className="regimes-footnote">
                  CAPTURE_ONLY evidence is invisible before its capture clock, so REPLAY cutoffs are
                  the actual published runs, never earlier backfilled dates.
                </p>
              </section>
            )}

            {mode === "compare" ? (
              <section className="regimes-compare" aria-label="Compare markets">
                {[current, other.data?.payload].map((s, i) =>
                  s ? (
                    <SnapshotProvenance key={s.asset} at={i === 0 ? snapAt : otherAt}>
                      <article className="regimes-panel">
                        <header>
                          <h2>{s.market}</h2>
                        </header>
                        <Badges snapshot={s} digest={null} />
                        <CompareClock s={s} />
                        <Tiles snapshot={s} />
                        <ul className="regimes-modules">
                          {Object.entries(s.module_statuses).map(([k, v]) => (
                            <li key={k} data-status={v.status}>
                              <b>{k}</b> {v.status}
                              {v.reason ? ` · ${v.reason}` : ""}
                            </li>
                          ))}
                        </ul>
                      </article>
                    </SnapshotProvenance>
                  ) : (
                    <p key={i} role="status">
                      {other.error?.message ?? "Verifying comparison market…"}
                    </p>
                  ),
                )}
                <p className="regimes-footnote">
                  Each side keeps its own as_of, state_at and evidence quality. Nothing is aligned,
                  filled or ranked.
                </p>
              </section>
            ) : (
              <Dashboard snapshot={current} />
            )}

            {matrix.data ? (
              <CrossMarketMatrix
                matrix={matrix.data.payload}
                at={matrixAt}
                onLineage={(a) => setLineageFor(a)}
              />
            ) : (
              <p className="regimes-muted" role="status">
                {matrix.error?.message ?? "Verifying the cross-market matrix…"}
              </p>
            )}
            <Issues snapshot={current} />
            <p className="regimes-footnote regimes-layers">
              {current.layers.current} · {current.layers.within_run} · {current.layers.sealed}. All
              market, alpha, inference and causal claim flags are false.
            </p>
          </SnapshotProvenance>
        )}
        {lineageFor && (
          <LineageDrawer lineage={lineage.data?.payload} onClose={() => setLineageFor(null)} />
        )}
      </section>
    </ProvenanceProvider>
  );
}
