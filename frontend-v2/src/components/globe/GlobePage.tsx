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
              <li key={a.key} data-kind={a.kind} data-value={a.value} data-color={cssRgb(a.rgb)} />
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
            <p>
              {mode === "replay"
                ? "Checked USGS earthquakes and a frozen CelesTrak satellite snapshot over eight market hubs. Each layer records its own cutoff."
                : "Live USGS earthquakes and CelesTrak satellites over eight market hubs."}{" "}
              Quake aggregates use a one-day availability lag; hub proximity is descriptive, not a
              company exposure map.
            </p>
            <div className="ge-readouts mono">
              <span>{clock ? utc(clock) : "—"}</span>
              <span>
                {look[0] >= 0 ? "N" : "S"}
                {Math.abs(look[0]).toFixed(1)}° {look[1] >= 0 ? "E" : "W"}
                {Math.abs(look[1]).toFixed(1)}°
              </span>
              <span>ALT {Math.round(look[2]).toLocaleString()} km</span>
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
                  ["quakes", `Quakes ${events.length || ""}`],
                  ["satellites", `Satellites ${satCount || ""}`],
                  ["hubs", "Hubs 8"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={layers[k]}
                  onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
                >
                  {label.trim()}
                </button>
              ))}
            </div>
            <div className="ge-seg" role="group" aria-label="Graph layers">
              {(
                [
                  ["sites", `Sites ${siteCount || ""}`],
                  ["companies", `Companies ${companyCount || ""}`],
                ] as const
              ).map(([k, label]) => (
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
                  {label.trim()}
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
                Satellite positions and ten-minute trails are frozen SGP4 projections from recorded
                OMM elements, for research visualization.
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
                    <span>{label}</span>
                    <code>{name}</code>
                  </div>
                  <b className="mono">
                    {["live", "replay"].includes(quakes.status)
                      ? i === 1 || i === 2
                        ? v.toFixed(2)
                        : v
                      : "—"}
                  </b>
                </div>
              );
            })}
          </div>
          <div className="ge-rows mono">
            <div>
              <span>Window covered</span>
              <b>{inputs.coveredDays.toFixed(1)} of 30 days</b>
            </div>
            <div>
              <span>Events admitted</span>
              <b>{inputs.admitted}</b>
            </div>
            <div>
              <span>Younger than a day</span>
              <b>{inputs.pending} pending</b>
            </div>
            <div>
              <span>USGS generated</span>
              <b>{quakes.note ? quakes.note.slice(0, 16).replace("T", " ") + "Z" : "—"}</b>
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
          <div className="ge-eyebrow">Hub exposure · M4.5+ within 1,000 km, 30 days</div>
          <div className="ge-hubs">
            {exposure.map(([name, n]) => (
              <div key={name}>
                <span>{name}</span>
                <i>
                  <b style={{ width: `${(n / Math.max(1, exposure[0][1])) * 100}%` }} />
                </i>
                <em className="mono">{n}</em>
              </div>
            ))}
          </div>
          <div className="ge-eyebrow">Latest events</div>
          <ol className="ge-list">
            {events.slice(0, 8).map((e) => (
              <li key={e.stableId}>
                <button
                  type="button"
                  onClick={() => setPick((p) => ({ ...p, selected: e.stableId }))}
                >
                  <b className="mono">M{e.mag.toFixed(1)}</b>
                  <span>{e.place ?? "Unnamed"}</span>
                  <em className="mono">{ago(now - e.time)}</em>
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
    </ForgeShell>
  );
}
