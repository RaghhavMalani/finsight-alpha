import { useEffect, useState } from "react";
import { CELESTRAK_GROUPS, normalizeEarthquakes, USGS_MONTH_FEED } from "./geo-data";
import type { Quake, Satellite, RecordedSatellite } from "./geo-data";
import type { OMMJsonObject } from "satellite.js";
import { localLiveAllowed, useDataMode } from "@/replay/mode";
import { loadReplayManifest, readReplayArtifact } from "@/replay/client";

export type Feed<T> = {
  data: T;
  status: "loading" | "live" | "replay" | "unavailable";
  at: number | null;
  note: string | null;
};

/** Poll a public feed, keeping the last good snapshot when a refresh fails. */
export function useFeed<T>(
  load: (signal: AbortSignal) => Promise<{ data: T; note: string | null }>,
  empty: T,
  every: number,
) {
  const mode = useDataMode();
  const [feed, setFeed] = useState<Feed<T>>({
    data: empty,
    status: "loading",
    at: null,
    note: null,
  });
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const run = () =>
      (mode === "replay"
        ? loadRecordedFeed(load)
        : localLiveAllowed()
          ? load(controller.signal)
          : Promise.reject(new Error("Live feeds require local Live mode."))
      )
        .then(
          (result) =>
            alive &&
            setFeed({
              data: result.data,
              status: mode === "replay" ? "replay" : "live",
              at: "at" in result && typeof result.at === "number" ? result.at : Date.now(),
              note: result.note,
            }),
        )
        .catch(
          (e: unknown) =>
            alive &&
            setFeed((f) => ({
              ...f,
              status: f.at ? f.status : "unavailable",
              note: f.at ? f.note : e instanceof Error ? e.message : "Unavailable",
            })),
        );
    void run();
    const timer = mode === "live" ? setInterval(run, every) : null;
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
    // The loader is a module-level function; polling restarts only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  return feed;
}

async function loadRecordedFeed<T>(
  load: (signal: AbortSignal) => Promise<{ data: T; note: string | null }>,
) {
  const manifest = await loadReplayManifest();
  const id = (load as unknown) === loadQuakes ? "world:quakes" : "world:satellites";
  const entry = manifest.artifacts[id];
  if (!entry || entry.status !== "AVAILABLE")
    throw new Error(entry?.reason ?? "No checked World snapshot installed.");
  const value = (await readReplayArtifact(id)) as {
    schema_version: string;
    as_of: string;
    events: Quake[];
    satellites: RecordedSatellite[];
  };
  if (value.as_of !== entry.as_of) throw new Error("Malformed World snapshot.");
  if (id === "world:satellites") {
    if (
      value.schema_version !== "satellite-replay/1" ||
      !Array.isArray(value.satellites) ||
      !value.satellites.length
    )
      throw new Error("Malformed satellite snapshot.");
    const seen = new Set<string>();
    for (const s of value.satellites) {
      const validPoint = (p: RecordedSatellite["trail"][number]) =>
        p &&
        [p.lon, p.lat, p.altitudeKm].every(Number.isFinite) &&
        Math.abs(p.lon) <= 180 &&
        Math.abs(p.lat) <= 90 &&
        p.altitudeKm >= 0;
      if (
        typeof s.id !== "string" ||
        Object.keys(s).sort().join() !== "altitudeKm,epoch,group,id,lat,lon,name,trail" ||
        seen.has(s.id) ||
        typeof s.name !== "string" ||
        !Number.isFinite(Date.parse(s.epoch)) ||
        Date.parse(s.epoch) > Date.parse(value.as_of) ||
        !validPoint(s) ||
        !Array.isArray(s.trail) ||
        s.trail.length !== 20 ||
        !s.trail.every(validPoint) ||
        "line1" in s ||
        "line2" in s ||
        "omm" in s
      )
        throw new Error("Invalid derived satellite.");
      seen.add(s.id);
    }
    return {
      data: value.satellites as T,
      note: `Recorded ${entry.as_of} · ${entry.licence.attribution} · ${entry.licence.status}`,
      at: Date.parse(entry.as_of),
    };
  }
  if (value.schema_version !== "world-replay/1" || !Array.isArray(value.events))
    throw new Error("Malformed earthquake snapshot.");
  const seen = new Set<string>();
  for (const q of value.events) {
    if (
      typeof q.stableId !== "string" ||
      seen.has(q.stableId) ||
      ![q.lon, q.lat, q.depthKm, q.mag, q.time].every(Number.isFinite) ||
      Math.abs(q.lon) > 180 ||
      Math.abs(q.lat) > 90 ||
      q.mag < 4.5 ||
      q.time > Date.parse(value.as_of)
    )
      throw new Error("Invalid recorded earthquake.");
    seen.add(q.stableId);
  }
  return {
    data: value.events as T,
    note: `Recorded ${entry.as_of} · ${entry.sources.join(", ")} · ${entry.licence.status}`,
    at: Date.parse(entry.as_of),
  };
}

export async function loadQuakes(signal: AbortSignal) {
  const response = await fetch(USGS_MONTH_FEED, { signal });
  if (!response.ok) throw new Error(`USGS HTTP ${response.status}`);
  const payload = await response.json();
  const rows = normalizeEarthquakes(payload);
  if (!rows) throw new Error("Malformed USGS feed");
  const generated = Number(payload?.metadata?.generated);
  return {
    data: rows.sort((a, b) => b.time - a.time),
    note: Number.isFinite(generated) ? new Date(generated).toISOString() : null,
  };
}
let satelliteCache: { at: number; result: { data: Satellite[]; note: string } } | null = null;
let satellitePending: Promise<{ data: Satellite[]; note: string }> | null = null;
let satelliteRefusal: string | null = null;
export async function loadSatellites(signal: AbortSignal) {
  if (satelliteRefusal) throw new Error(satelliteRefusal);
  if (satelliteCache && Date.now() - satelliteCache.at < 2 * 3600_000) return satelliteCache.result;
  if (satellitePending) return satellitePending;
  satellitePending = captureSatellites(signal);
  try {
    const result = await satellitePending;
    satelliteCache = { at: Date.now(), result };
    return result;
  } finally {
    satellitePending = null;
  }
}
async function captureSatellites(signal: AbortSignal) {
  // Stop on any source error; do not keep polling a rejected CelesTrak request.
  const snapshots: OMMJsonObject[][] = [];
  for (const url of Object.values(CELESTRAK_GROUPS)) {
    const r = await fetch(url, { signal });
    if (!r.ok) {
      satelliteRefusal = `CelesTrak HTTP ${r.status}; further requests stopped for this page session.`;
      throw new Error(satelliteRefusal);
    }
    const records = await r.json();
    if (!Array.isArray(records)) throw new Error("Malformed CelesTrak OMM feed");
    snapshots.push(records);
  }
  const seen = new Set<string>();
  const rows: Satellite[] = snapshots
    .flat()
    .filter((t) => {
      const id = String(t.NORAD_CAT_ID);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((omm) => ({ name: omm.OBJECT_NAME, omm }));
  if (!rows.length) throw new Error("CelesTrak returned no element sets");
  return {
    data: rows,
    note: "CelesTrak; USSPACECOM / 18th Space Defense Squadron; Space-Track.org",
  };
}
