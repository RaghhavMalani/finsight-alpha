/**
 * Live public signals for the God's Eye globe and the neural net's Geo events inputs.
 *
 * normalizeEarthquakes and parseTle are ported from God's Eye View
 * (https://github.com/bilawalsidhu/gods-eye-view, src/layers/earthquakes/records.js and
 * src/sources/tle.js; MIT License, Copyright (c) 2026 Bilawal Sidhu; full text in
 * THIRD_PARTY_NOTICES.md). geoInputs restates src/geo/usgs.py so the globe shows exactly the
 * values a network's Geo events layer would receive.
 */

export const USGS_MONTH_FEED =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";
export const CELESTRAK_GROUPS = {
  stations: "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
  visual: "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle",
} as const;

/** The backend's hubs (src/geo/usgs.py HUBS) and its 1,000 km near-hub radius. */
export const HUBS: [string, number, number][] = [
  ["New York", 40.7069, -74.0113],
  ["San Francisco Bay", 37.3875, -122.0575],
  ["Los Angeles", 34.0522, -118.2437],
  ["Tokyo", 35.6828, 139.7595],
  ["Hsinchu", 24.8138, 120.9675],
  ["Seoul", 37.5665, 126.978],
  ["Shenzhen", 22.5431, 114.0579],
  ["Mexico City", 19.4326, -99.1332],
];
export const HUB_RADIUS_KM = 1000;
export const LAG_MS = 86_400_000;
const DAY = 86_400_000;

export type Quake = {
  stableId: string;
  lon: number;
  lat: number;
  depthKm: number | null;
  mag: number;
  place: string | null;
  time: number;
};

/** Validate a complete feed before it can replace displayed events; null if malformed. */
export function normalizeEarthquakes(geojson: unknown, minMag = 4.5): Quake[] | null {
  const features = (geojson as { features?: unknown })?.features;
  if (!Array.isArray(features)) return null;
  const rows: Quake[] = [];
  const ids = new Set<string>();
  for (const [index, feature] of features.entries()) {
    const coordinates = feature?.geometry?.coordinates;
    const properties = feature?.properties;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !properties ||
      typeof properties !== "object" ||
      Array.isArray(properties) ||
      (feature.geometry.type != null && feature.geometry.type !== "Point")
    )
      return null;
    const [lon, lat, depthKm] = coordinates;
    const mag = properties.mag;
    if (
      !Number.isFinite(lon) ||
      Math.abs(lon) > 180 ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      (depthKm != null && !Number.isFinite(depthKm)) ||
      (mag != null && (!Number.isFinite(mag) || mag > 10))
    )
      return null;
    // A missing magnitude cannot establish that an event meets the feed's threshold.
    if (mag == null || mag < minMag || !Number.isFinite(properties.time)) continue;
    const stableId =
      feature.id == null || feature.id === "" ? `event-${index + 1}` : String(feature.id);
    if (ids.has(stableId)) return null;
    ids.add(stableId);
    rows.push({
      stableId,
      lon,
      lat,
      depthKm: depthKm ?? null,
      mag,
      place: typeof properties.place === "string" ? properties.place : null,
      time: properties.time,
    });
  }
  return rows;
}

export type Tle = { name: string; line1: string; line2: string };
/** Three-line TLE text into entries; blocks whose lines are not TLE lines 1 and 2 are skipped. */
export function parseTle(text: string): Tle[] {
  const lines = String(text)
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const result: Tle[] = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const [name, line1, line2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (line1.startsWith("1 ") && line2.startsWith("2 ")) result.push({ name, line1, line2 });
  }
  return result;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180,
    dp = (lat2 - lat1) * r,
    dl = (lon2 - lon1) * r;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dl / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(a));
}
export const nearestHub = (q: { lat: number; lon: number }) =>
  HUBS.map(([name, lat, lon]) => [name, haversineKm(q.lat, q.lon, lat, lon)] as const).sort(
    (a, b) => a[1] - b[1],
  )[0];
export const energyJoules = (mag: number) => 10 ** (1.5 * mag + 4.8);

export const GEO_INPUTS = [
  ["geo_quake_count_m5_7d", "M5+ events, 7 days"],
  ["geo_quake_max_mag_7d", "Largest magnitude, 7 days"],
  ["geo_quake_energy_log_30d", "log₁₀ seismic energy (J), 30 days"],
  ["geo_quake_near_hub_30d", "Events ≤1,000 km of a hub, 30 days"],
] as const;

/**
 * The four Geo events inputs at time `at`, with src/geo/usgs.py's rule: an event counts only
 * once its time + 1 day <= at. `coveredFrom` is the start of the feed's window; a 30-day
 * window reaching before it is reported as partial instead of silently undercounting.
 */
export function geoInputs(quakes: Quake[], at: number, coveredFrom: number, minMag = 4.5) {
  const admitted = quakes.filter((q) => q.time + LAG_MS <= at);
  const week = admitted.filter((q) => q.time + LAG_MS > at - 7 * DAY),
    month = admitted.filter((q) => q.time + LAG_MS > at - 30 * DAY);
  const windowStart = at - LAG_MS - 30 * DAY;
  return {
    values: [
      week.filter((q) => q.mag >= 5).length,
      week.length ? Math.max(...week.map((q) => q.mag)) : minMag,
      Math.log10(month.reduce((s, q) => s + energyJoules(q.mag), 0) + 1),
      month.filter((q) => nearestHub(q)[1] <= HUB_RADIUS_KM).length,
    ],
    admitted: admitted.length,
    pending: quakes.length - admitted.length,
    week,
    month,
    /** Days of the 30-day window the feed actually covers. */
    coveredDays: Math.max(
      0,
      Math.min(30, (at - LAG_MS - Math.max(windowStart, coveredFrom)) / DAY),
    ),
  };
}

/** Subsolar latitude/longitude (degrees) for the day/night terminator; ~0.1° accuracy. */
export function subsolarPoint(date: Date) {
  const d = date.getTime() / DAY - 10957.5; // days since J2000.0
  const g = ((357.529 + 0.98560028 * d) * Math.PI) / 180;
  const q = 280.459 + 0.98564736 * d;
  const L = ((q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const e = ((23.439 - 0.00000036 * d) * Math.PI) / 180;
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const lon = (((ra * 180) / Math.PI - gmst * 15 + 540) % 360) - 180;
  return { lat: (decl * 180) / Math.PI, lon };
}
