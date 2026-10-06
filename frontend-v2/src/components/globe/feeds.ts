import { useEffect, useState } from "react";
import { CELESTRAK_GROUPS, normalizeEarthquakes, parseTle, USGS_MONTH_FEED } from "./geo-data";
import type { Quake, Tle } from "./geo-data";

export type Feed<T> = {
  data: T;
  status: "loading" | "live" | "unavailable";
  at: number | null;
  note: string | null;
};

/** Poll a public feed, keeping the last good snapshot when a refresh fails. */
export function useFeed<T>(
  load: (signal: AbortSignal) => Promise<{ data: T; note: string | null }>,
  empty: T,
  every: number,
) {
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
      load(controller.signal)
        .then(({ data, note }) => alive && setFeed({ data, status: "live", at: Date.now(), note }))
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
    const timer = setInterval(run, every);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
    };
    // The loader is a module-level function; polling restarts only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return feed;
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
