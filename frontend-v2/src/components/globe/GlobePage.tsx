import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { useReducedMotion } from "@/visual/useReducedMotion";
import {
  CELESTRAK_GROUPS,
  GEO_INPUTS,
  geoInputs,
  HUB_RADIUS_KM,
  HUBS,
  haversineKm,
  LAG_MS,
  nearestHub,
  normalizeEarthquakes,
  parseTle,
  USGS_MONTH_FEED,
  energyJoules,
  type Quake,
  type Satellite,
} from "./geo-data";
import { loadQuakes, loadSatellites, useFeed, type Feed } from "./feeds";
import { loadLand, type LandData } from "./land";
import type { GlobeLayers } from "./GlobeScene";
import { SENSORS, type SensorKind } from "./sensors";
import "./globe.css";
import { useDataMode } from "@/replay/mode";
import { loadReplayManifest } from "@/replay/client";
import type { ReplayManifest } from "@/replay/contracts";
import { SourceCredit } from "@/replay/SourceCredit";
import { api } from "@/lib/api";
import { parseLiveAnswer, useGeoProjection, type GeoAnswer } from "./geo-graph";
import { buildOverlay, cssRgb, drawsChain } from "./geo-overlay";
import { GeoPanel, type GeoSelection, type GeoView } from "./GeoPanel";
import { ProvenanceProvider, Stamp, type Origin } from "@/visual/Num";
import { liveOrigin, manifestOrigin, ref, replayOrigin } from "@/visual/origins";
import { provHelpers } from "@/visual/route-origin";
import { projectionOrigin } from "./geo-prov";

const GlobeScene = lazy(() => import("./GlobeScene"));
const ago = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 60
    ? `${m}m ago`
    : m < 2880
      ? `${Math.round(m / 60)}h ago`
      : `${Math.round(m / 1440)}d ago`;
};
const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + "Z";

export default function GlobePage() {
  const mode = useDataMode();
  const reduced = useReducedMotion();
  const quakes = useFeed<Quake[]>(loadQuakes, [], 5 * 60_000);
  const sats = useFeed<Satellite[]>(loadSatellites, [], 2 * 3600_000);
  const [manifest, setManifest] = useState<ReplayManifest | null>(null);
  const [land, setLand] = useState<LandData | null>(null);
  // Times start unset so server and client render the same markup; the clock starts on mount.
  const [now, setNow] = useState(0);
  const [clock, setClock] = useState<number | null>(null);
  const [layers, setLayers] = useState<GlobeLayers>({ quakes: true, satellites: true, hubs: true });
  const [sensor, setSensor] = useState<SensorKind | null>(null);
  const [pick, setPick] = useState<{ selected: string | null; hover: string | null }>({
    selected: null,
    hover: null,
  });
  const [look, setLook] = useState<[number, number, number]>([24, 150, 10000]);
  const [satCount, setSatCount] = useState(0);
  const [labelsRoot, setLabelsRoot] = useState<HTMLDivElement | null>(null);
  const geo = useGeoProjection();
  const proj = geo.status === "ok" ? geo.projection : null;
  const [graphLayers, setGraphLayers] = useState({ sites: true, companies: false });
  const [view, setView] = useState<GeoView>("point_in_time");
  const [live, setLive] = useState<{ id: string; answer: GeoAnswer | null; note: string } | null>(
    null,
  );
  useEffect(() => {
    void loadLand().then(setLand);
    if (mode === "replay") {
      let alive = true;
      void loadReplayManifest()
        .then((m) => {
          if (alive) {
            const t = Date.parse(m.artifacts["world:quakes"]?.as_of ?? m.as_of);
            setManifest(m);
            setNow(t);
            setClock(t);
          }
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }
    setNow(Date.now());
    setClock(Date.now());
    const a = setInterval(() => setNow(Date.now()), 60_000),
      b = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [mode]);
  const onPick = useCallback(
    (id: string | null, hover: boolean) =>
      setPick((p) => (hover ? { ...p, hover: id } : { ...p, selected: id ?? p.selected })),
    [],
  );
  const onLook = useCallback(
    (lat: number, lon: number, alt: number) => setLook([lat, lon, alt]),
    [],
  );

  const events = quakes.data;
  const coveredFrom = now - 30 * 86_400_000;
  const inputs = useMemo(() => geoInputs(events, now, coveredFrom), [events, now, coveredFrom]);
  const focus = events.find((e) => e.stableId === (pick.hover ?? pick.selected)) ?? null;
  const picked = events.find((e) => e.stableId === pick.selected) ?? null;
  const scenario = proj?.scenarios.find((s) => s.id === pick.selected) ?? null;
  // Local Live asks the API, behind the session gate; Replay only reads the pinned projection.
  // Keyed on the quake's id and values, so a feed refresh does not resend the same request.
  const [pickedId, pLat, pLon, pMag, pTime] = picked
    ? [picked.stableId, picked.lat, picked.lon, picked.mag, picked.time]
    : [null, 0, 0, 0, 0];
  useEffect(() => {
    if (mode !== "live" || !pickedId || !proj) return;
    let alive = true;
    const body = {
      kind: "earthquake",
      lat: pLat,
      lon: pLon,
      magnitude: pMag,
      time: new Date(pTime).toISOString(),
    };
    api<unknown>("/geo/graph/propagate", { method: "POST", body: JSON.stringify(body) })
      .then(
        (raw) =>
          alive &&
          setLive({
            id: pickedId,
            answer: parseLiveAnswer(raw, proj.nodes),
            // propagate() cuts at the earlier of the quake's time and as_of, so this is the
            // point-in-time answer: the graph as it was known when the quake happened.
            note: `Point-in-time answer from POST /geo/graph/propagate: only relationships sourced by the quake's time (${new Date(pTime).toISOString().slice(0, 16)}Z) are used.`,
          }),
      )
      .catch(
        (e: unknown) =>
          alive &&
          setLive({
            id: pickedId,
            answer: null,
            note: `POST /geo/graph/propagate failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      );
    return () => {
      alive = false;
    };
  }, [mode, pickedId, pLat, pLon, pMag, pTime, proj]);
  const selection = useMemo<GeoSelection>(() => {
    if (!proj) return null;
    if (scenario)
      return { event: scenario, answer: scenario.point_in_time, note: null, retrospective: null };
    if (!picked) return null;
    const event = {
      id: picked.stableId,
      origin: mode === "live" ? ("live" as const) : ("recorded" as const),
      label: picked.place ?? "Unnamed location",
      kind: "earthquake",
      lat: picked.lat,
      lon: picked.lon,
      magnitude: picked.mag,
      time: new Date(picked.time).toISOString(),
    };
    if (mode === "live") {
      const answer = live?.id === picked.stableId ? live : null;
      return answer
        ? { event, answer: answer.answer, note: answer.note, retrospective: null }
        : { event, answer: null, note: null, retrospective: null, pending: true };
    }
    const recorded = proj.events.get(picked.stableId);
    if (!recorded)
      return {
        event,
        answer: null,
        note: "this quake is not in the checked projection; nothing is inferred for it.",
        retrospective: null,
      };
    return {
      event: recorded,
      answer:
        view === "retrospective" && recorded.retrospective
          ? recorded.retrospective
          : recorded.point_in_time,
      note: null,
      retrospective: recorded.retrospective,
    };
  }, [proj, scenario, picked, mode, live, view]);
  const overlay = useMemo(
    () =>
      proj &&
      buildOverlay(
        proj,
        graphLayers,
        selection?.answer
          ? {
              lat: selection.event.lat,
              lon: selection.event.lon,
              answer: selection.answer,
              scenario: selection.event.origin === "scenario",
            }
          : null,
      ),
    [proj, graphLayers, selection],
  );
  const chainDrawn = drawsChain(selection?.answer);
  const siteCount = proj ? Object.values(proj.nodes).filter((n) => n.lat != null).length : 0;
  const companyCount = proj
    ? Object.values(proj.nodes).filter((n) => n.type === "company").length
    : 0;
  const exposure = useMemo(
    () =>
      HUBS.map(
        ([name, lat, lon]) =>
          [
            name,
            inputs.month.filter((q) => haversineKm(q.lat, q.lon, lat, lon) <= HUB_RADIUS_KM).length,
          ] as const,
      ).sort((a, b) => b[1] - a[1]),
    [inputs],
  );
  const monthEnergy = inputs.month.reduce((s, q) => s + energyJoules(q.mag), 0);
  // Origins: the checked Replay World artifacts (pointers into their bodies), or in local Live the
  // public feeds this browser fetched (never hashed). The graph projection is the build-time pin.
  const worldAt =
    (id: "world:quakes" | "world:satellites", feed: string) =>
    (ptr: string, extra: Partial<Origin> = {}): Origin =>
      mode === "replay"
        ? replayOrigin(manifest?.artifacts[id] ?? null, ptr, extra)
        : liveOrigin(
            feed,
            ptr,
            {},
            {
              note: "public feed fetched by this browser; not hashed or sealed",
              ...extra,
            },
          );
  const Q = provHelpers(worldAt("world:quakes", USGS_MONTH_FEED));
  const S = provHelpers(worldAt("world:satellites", "CelesTrak GP feeds"));
  const P = proj ? provHelpers((ptr, extra) => projectionOrigin(proj, ptr, extra)) : null;
  const quakeField = (i: number, e: Quake, field: "mag" | "time") =>
    mode === "replay"
      ? `/events/${i}/${field}`
      : `/features (id ${e.stableId})/properties/${field}`;
  const RULE = "events whose time + 1 day ≤ now";
  const nowNote =
    mode === "replay"
      ? "now = the recorded World quake snapshot's as_of"
      : "now = this browser's clock";
  const INPUT_FORMULA = [
    `count of /events with mag ≥ 5 among ${RULE}, within 7 days`,
    `largest /events mag among ${RULE}, within 7 days (4.5, the feed's floor, when there are none)`,
    `log10(1 + Σ energy(mag)) over /events among ${RULE}, within 30 days; energy = 10^(1.5 · mag + 4.8) J`,
    `count of /events within ${HUB_RADIUS_KM.toLocaleString()} km of a hub among ${RULE}, within 30 days`,
  ];
  const feedChip = (f: Feed<unknown>, label: string) => (
    <span className={`ge-chip ${f.status}`} title={f.note ?? undefined}>
      <i />
      {label} ·{" "}
      {f.status === "live"
        ? `live ${f.at ? new Date(f.at).toISOString().slice(11, 16) : ""}Z`
        : f.status}
    </span>
  );
  return (
    <ForgeShell bleed>
      <ProvenanceProvider>
        <div
          className={`globe${sensor ? ` sensor-${sensor}` : ""}${overlay?.scenario ? " ge-scenario" : ""}`}
        >
          <div
            className="ge-stage"
            data-geo-arcs={overlay?.arcs.length ?? 0}
            data-geo-sites={overlay?.sites.length ?? 0}
            data-geo-companies={overlay?.labels.length ?? 0}
          >
            <Suspense fallback={<div className="ge-status">Spinning up the globe…</div>}>
              {now > 0 && (
                <GlobeScene
                  land={land}
                  quakes={events}
                  tles={sats.data}
                  now={now}
                  layers={layers}
                  sensor={sensor}
                  reduced={reduced}
                  selected={pick.selected}
                  onPick={onPick}
                  onLook={onLook}
                  onSatellites={setSatCount}
                  labelsRoot={labelsRoot}
                  overlay={overlay}
                />
              )}
            </Suspense>
            <div className="ge-labels" ref={setLabelsRoot} aria-hidden="true" />
            {overlay?.scenario && (
              <div className="ge-hud ge-hypo" data-geo-hypothetical>
                Scenario · hypothetical — not a recorded event
              </div>
            )}
            {/* The drawn arcs with their value and rendered colour, for checks and assistive tech. */}
            <ol className="ge-arc-list" hidden data-geo-arc-list>
              {overlay?.arcs.map((a) => (
                <li
                  key={a.key}
                  data-kind={a.kind}
                  data-value={a.value}
                  data-color={cssRgb(a.rgb)}
                />
              ))}
            </ol>
            <div className="ge-frame" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <b />
            </div>
            <header className="ge-hud ge-title">
              <div className="ge-eyebrow">FinSight · God's Eye</div>
              <h1>The planet, as public signals</h1>
              {overlay && overlay.moreLabels > 0 && (
                <div className="ge-more mono" data-geo-more={overlay.moreLabels}>
                  +{overlay.moreLabels} more reached{" "}
                  {overlay.moreLabels === 1 ? "security" : "securities"}, listed in the panel
                </div>
              )}
              <p>
                {mode === "replay"
                  ? "Checked USGS earthquakes and a frozen CelesTrak satellite snapshot over eight market hubs. Each layer records its own cutoff."
                  : "Live USGS earthquakes and CelesTrak satellites over eight market hubs."}{" "}
                Quake aggregates use a one-day availability lag; hub proximity is descriptive, not a
                company exposure map.
              </p>
              <div className="ge-readouts mono">
                <span>
                  {clock && mode === "replay" && manifest ? (
                    <Stamp
                      s={ref(
                        manifestOrigin(
                          manifest.artifacts["world:quakes"]?.as_of
                            ? "/artifacts/world:quakes/as_of"
                            : "/as_of",
                        ),
                        manifest.artifacts["world:quakes"]?.as_of ?? manifest.as_of,
                      )}
                      label="Recorded quake snapshot as_of"
                      display={utc(clock)}
                      className="vx-inherit"
                    />
                  ) : clock ? (
                    <span data-num-exempt="date">{utc(clock)}</span>
                  ) : (
                    "—"
                  )}
                </span>
                {/* The camera position is the reader's own view, not data. */}
                <span data-num-exempt="input">
                  {look[0] >= 0 ? "N" : "S"}
                  {Math.abs(look[0]).toFixed(1)}° {look[1] >= 0 ? "E" : "W"}
                  {Math.abs(look[1]).toFixed(1)}°
                </span>
                <span data-num-exempt="input">ALT {Math.round(look[2]).toLocaleString()} km</span>
              </div>
            </header>
            <div className="ge-hud ge-controls">
              <div className="ge-seg" role="radiogroup" aria-label="Sensor">
                <button
                  type="button"
                  role="radio"
                  aria-checked={sensor === null}
                  onClick={() => setSensor(null)}
                >
                  Normal
                </button>
                {(Object.keys(SENSORS) as SensorKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={sensor === k}
                    title={SENSORS[k].hint}
                    onClick={() => setSensor(k)}
                  >
                    {SENSORS[k].label}
                  </button>
                ))}
              </div>
              <div className="ge-seg" role="group" aria-label="Layers">
                {(
                  [
                    [
                      "quakes",
                      "Quakes",
                      events.length
                        ? Q.N(
                            "/events",
                            events.length,
                            "Recorded earthquakes",
                            events.length == null ? undefined : String(events.length),
                            {
                              formula: "count of /events",
                            },
                            "x",
                            true,
                          )
                        : null,
                    ],
                    [
                      "satellites",
                      "Satellites",
                      satCount
                        ? S.N(
                            "/satellites",
                            satCount,
                            "Satellites drawn",
                            satCount == null ? undefined : String(satCount),
                            {
                              formula: "count of /satellites drawn by the globe",
                            },
                            "x",
                            true,
                          )
                        : null,
                    ],
                    ["hubs", "Hubs 8", null],
                  ] as const
                ).map(([k, label, count]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={layers[k]}
                    onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
                  >
                    {label}
                    {count ? <> {count}</> : null}
                  </button>
                ))}
              </div>
              <div className="ge-seg" role="group" aria-label="Graph layers">
                {(
                  [
                    [
                      "sites",
                      "Sites",
                      P && siteCount
                        ? P.N(
                            "/nodes",
                            siteCount,
                            "Sites with coordinates",
                            siteCount == null ? undefined : String(siteCount),
                            {
                              formula: "count of /nodes with a lat",
                            },
                            "x",
                            true,
                          )
                        : null,
                    ],
                    [
                      "companies",
                      "Companies",
                      P && companyCount
                        ? P.N(
                            "/nodes",
                            companyCount,
                            "Companies",
                            companyCount == null ? undefined : String(companyCount),
                            {
                              formula: "count of /nodes with type = company",
                            },
                            "x",
                            true,
                          )
                        : null,
                    ],
                  ] as const
                ).map(([k, label, count]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={!!proj && graphLayers[k] && !(k === "companies" && chainDrawn)}
                    disabled={!proj || (k === "companies" && chainDrawn)}
                    title={
                      !proj
                        ? "Disabled: the graph projection was refused"
                        : k === "companies" && chainDrawn
                          ? "Disabled: the selected event's propagation chain is drawn in its place; clear the selection to show the companies layer"
                          : undefined
                    }
                    onClick={() => setGraphLayers((l) => ({ ...l, [k]: !l[k] }))}
                  >
                    {label}
                    {count ? <> {count}</> : null}
                  </button>
                ))}
              </div>
              <div className="ge-feeds">
                {feedChip(quakes, "USGS")}
                {feedChip(sats, "CelesTrak")}
              </div>
            </div>
            {focus && (
              <section className="ge-hud ge-focus" aria-live="polite">
                <div
                  className="ge-mag"
                  style={{
                    color: focus.mag >= 6 ? "#FF4D6D" : focus.mag >= 5 ? "#FF8A5B" : "#FFD166",
                  }}
                >
                  M{focus.mag.toFixed(1)}
                </div>
                <div>
                  <strong>{focus.place ?? "Unnamed location"}</strong>
                  <span className="mono">
                    {utc(focus.time)} · {ago(now - focus.time)} · depth{" "}
                    {focus.depthKm?.toFixed(0) ?? "?"} km
                  </span>
                  <span>
                    {focus.time + LAG_MS > now
                      ? `Enters the Geo events inputs at ${utc(focus.time + LAG_MS)}.`
                      : (() => {
                          const [hub, km] = nearestHub(focus);
                          const parts = [
                            focus.mag >= 5 && inputs.week.includes(focus)
                              ? "counts toward M5+ (7d)"
                              : null,
                            km <= HUB_RADIUS_KM
                              ? `near-hub: ${hub} ${Math.round(km)} km`
                              : `nearest hub ${hub}, ${Math.round(km).toLocaleString()} km`,
                            monthEnergy > 0 && inputs.month.includes(focus)
                              ? `${((energyJoules(focus.mag) / monthEnergy) * 100).toFixed(1)}% of 30-day energy`
                              : null,
                          ].filter(Boolean);
                          return `In the network's inputs: ${parts.join(" · ")}.`;
                        })()}
                  </span>
                </div>
              </section>
            )}
            {quakes.status === "unavailable" && (
              <div className="ge-status ge-warn" role="alert">
                USGS feed unreachable from this browser ({quakes.note}). Nothing is drawn in its
                place.
              </div>
            )}
          </div>
          <aside className="ge-panel" aria-label="Neural link">
            <GeoPanel
              geo={geo}
              selection={selection}
              view={view}
              onView={setView}
              onScenario={(id) => setPick((p) => ({ ...p, selected: id }))}
              onClear={() => setPick((p) => ({ ...p, selected: null }))}
              arcs={overlay?.arcs.length ?? 0}
              quakeCount={Q.at("/events", {
                formula: "count of /events with mag ≥ 5",
              })}
              choices={events
                .filter((e) => e.mag >= 5)
                .sort((a, b) => b.time - a.time)
                .map((e) => ({
                  id: e.stableId,
                  label: `M${e.mag.toFixed(1)} · ${utc(e.time).slice(0, 10)} · ${e.place ?? "Unnamed"}`,
                }))}
            />
            {mode === "replay" && manifest && (
              <details className="mb-5 text-xs leading-5">
                <summary className="cursor-pointer">Sources, licences and recorded cutoffs</summary>
                {["world:quakes", "world:satellites"].map((id) => {
                  const entry = manifest.artifacts[id];
                  return (
                    entry && (
                      <div key={id} className="mt-3">
                        <p>
                          {id === "world:quakes" ? "Earthquakes" : "Satellite orbital projection"} ·{" "}
                          {entry.as_of}
                        </p>
                        <SourceCredit licence={entry.licence} />
                        {entry.reason && <p>{entry.reason}</p>}
                      </div>
                    )
                  );
                })}
                <p className="mt-2">
                  Satellite positions and ten-minute trails are frozen SGP4 projections from
                  recorded OMM elements, for research visualization.
                </p>
              </details>
            )}
            <div className="ge-eyebrow">Neural link · Geo events input layer</div>
            <p className="ge-lead">
              The same four values a network receives as its Geo events inputs, computed from this
              recorded or live events with the backend's rule: an event counts once it is a day old.
            </p>
            <div className="ge-neurons">
              {GEO_INPUTS.map(([name, label], i) => {
                const v = inputs.values[i];
                return (
                  <div key={name} className="ge-neuron">
                    <i style={{ ["--glow" as string]: `${Math.min(1, 0.25 + i * 0.2)}` }} />
                    <div>
                      <span data-num-exempt="copy">{label}</span>
                      <code data-num-exempt="id">{name}</code>
                    </div>
                    <b className="mono">
                      {["live", "replay"].includes(quakes.status)
                        ? Q.N("/events", v, label, i === 1 || i === 2 ? v.toFixed(2) : String(v), {
                            formula: INPUT_FORMULA[i],
                            note: nowNote,
                          })
                        : "—"}
                    </b>
                  </div>
                );
              })}
            </div>
            <div className="ge-rows mono">
              <div>
                <span>Window covered</span>
                <b>
                  {provHelpers(
                    mode === "replay"
                      ? (ptr, extra) => manifestOrigin(ptr, extra)
                      : (ptr, extra) => liveOrigin("this browser's clock", ptr, {}, extra),
                  ).N(
                    mode === "replay" ? "/artifacts/world:quakes/as_of" : "",
                    inputs.coveredDays,
                    "Days of the window covered",
                    inputs.coveredDays.toFixed(1),
                    {
                      formula:
                        "max(0, min(30, (now − 1 day − max(now − 1 day − 30 days, now − 30 days)) / 1 day)); depends only on now",
                      note: nowNote,
                    },
                  )}{" "}
                  <span data-num-exempt="copy">of 30 days</span>
                </b>
              </div>
              <div>
                <span>Events admitted</span>
                <b>
                  {Q.N(
                    "/events",
                    inputs.admitted,
                    "Events admitted",
                    inputs.admitted == null ? undefined : String(inputs.admitted),
                    {
                      formula: `count of /events among ${RULE}`,
                      note: nowNote,
                    },
                  )}
                </b>
              </div>
              <div>
                <span>Younger than a day</span>
                <b>
                  {Q.N(
                    "/events",
                    inputs.pending,
                    "Events younger than a day",
                    inputs.pending == null ? undefined : String(inputs.pending),
                    {
                      formula: `count of /events whose time + 1 day > now`,
                      note: nowNote,
                    },
                  )}{" "}
                  pending
                </b>
              </div>
              <div>
                <span>USGS generated</span>
                <b>
                  {!quakes.note ? (
                    "—"
                  ) : mode === "replay" && manifest?.artifacts["world:quakes"] ? (
                    <Stamp
                      s={ref(
                        manifestOrigin("/artifacts/world:quakes/as_of"),
                        manifest.artifacts["world:quakes"].as_of,
                      )}
                      label="Recorded quake snapshot as_of"
                      display={quakes.note.slice(0, 16).replace("T", " ") + "Z"}
                      className="vx-inherit"
                    />
                  ) : (
                    <span data-num-exempt="copy">
                      {quakes.note.slice(0, 16).replace("T", " ") + "Z"}
                    </span>
                  )}
                </b>
              </div>
            </div>
            <Link to="/observatory" search={{ scene: "neural", ticker: "SPY" }} className="ge-cta">
              {mode === "replay"
                ? "Inspect recorded neural trace →"
                : "Train a network on these inputs →"}
            </Link>
            <p className="ge-fine">
              These aggregates describe the recorded window, not a forecast. Networks train on the
              installed USGS catalog with the same rule, and its revised magnitudes are disclosed as
              RETROSPECTIVE_CATALOG.
            </p>
            <div className="ge-eyebrow" data-num-exempt="copy">
              Hub exposure · M4.5+ within 1,000 km, 30 days
            </div>
            <div className="ge-hubs">
              {exposure.map(([name, n]) => (
                <div key={name}>
                  <span>{name}</span>
                  <i>
                    <b style={{ width: `${(n / Math.max(1, exposure[0][1])) * 100}%` }} />
                  </i>
                  <em className="mono">
                    {Q.N("/events", n, `Events near ${name}`, n == null ? undefined : String(n), {
                      formula: `count of /events within ${HUB_RADIUS_KM.toLocaleString()} km of ${name} among ${RULE}, within 30 days`,
                      note: nowNote,
                    })}
                  </em>
                </div>
              ))}
            </div>
            <div className="ge-eyebrow">Latest events</div>
            <ol className="ge-list">
              {events.slice(0, 8).map((e, i) => (
                <li key={e.stableId}>
                  <button
                    type="button"
                    onClick={() => setPick((p) => ({ ...p, selected: e.stableId }))}
                  >
                    <b className="mono">
                      {Q.N(
                        quakeField(i, e, "mag"),
                        e.mag,
                        "Magnitude",
                        `M${e.mag.toFixed(1)}`,
                        {},
                        "x",
                        true,
                      )}
                    </b>
                    <span data-num-exempt="copy">{e.place ?? "Unnamed"}</span>
                    <em className="mono">
                      {Q.N(
                        quakeField(i, e, "time"),
                        now - e.time,
                        "Age",
                        ago(now - e.time),
                        {
                          formula: `now − ${quakeField(i, e, "time")}, in ms`,
                          note: nowNote,
                        },
                        "x",
                        true,
                      )}
                    </em>
                  </button>
                </li>
              ))}
            </ol>
            <p className="ge-fine">
              Globe and sensor looks adapted from{" "}
              <a
                href="https://github.com/bilawalsidhu/gods-eye-view"
                target="_blank"
                rel="noreferrer"
              >
                God's Eye View
              </a>{" "}
              by Bilawal Sidhu (MIT). Data: USGS (public domain), CelesTrak, Natural Earth.
            </p>
          </aside>
        </div>
      </ProvenanceProvider>
    </ForgeShell>
  );
}
