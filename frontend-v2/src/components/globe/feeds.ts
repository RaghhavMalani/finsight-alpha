import { useEffect, useState } from "react";
import { CELESTRAK_GROUPS, normalizeEarthquakes, parseTle, USGS_MONTH_FEED } from "./geo-data";
import type { Quake, Tle } from "./geo-data";
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
  };
  if (
    id !== "world:quakes" ||
    value.schema_version !== "world-replay/1" ||
    value.as_of !== entry.as_of ||
    !Array.isArray(value.events)
  )
    throw new Error("Malformed World snapshot.");
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
export async function loadSatellites(signal: AbortSignal) {
  const texts = await Promise.all(
    Object.values(CELESTRAK_GROUPS).map(async (url) => {
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error(`CelesTrak HTTP ${r.status}`);
      return r.text();
    }),
  );
  const seen = new Set<string>();
  const rows = texts.flatMap(parseTle).filter((t) => {
    const id = t.line1.slice(2, 7);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!rows.length) throw new Error("CelesTrak returned no element sets");
  return { data: rows, note: null };
}
