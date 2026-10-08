// Private OMM inputs -> derived, frozen geodetic positions and ten-minute trails.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  json2satrec,
  propagate,
  eciToGeodetic,
  gstime,
  degreesLat,
  degreesLong,
} from "satellite.js";
const [root, asOf, output] = process.argv.slice(2);
const time = Date.parse(asOf);
if (!root || !output || !Number.isFinite(time))
  throw new Error("Provide source directory, UTC cutoff and output.");
const groups = ["stations", "visual"];
const captures = [],
  seen = new Set(),
  satellites = [];
const point = (rec, at) => {
  const date = new Date(at),
    result = propagate(rec, date);
  if (!result || !result.position || typeof result.position === "boolean" || rec.error)
    throw new Error("Invalid SGP4 propagation");
  const geo = eciToGeodetic(result.position, gstime(date));
  const value = {
    lat: degreesLat(geo.latitude),
    lon: degreesLong(geo.longitude),
    altitudeKm: geo.height,
  };
  if (!Object.values(value).every(Number.isFinite) || value.altitudeKm < 0)
    throw new Error("Invalid orbital position");
  return value;
};
for (const group of groups) {
  const name = `celestrak-${group}.json`,
    bytes = readFileSync(join(root, name));
  const meta = JSON.parse(readFileSync(join(root, `${name}.meta.json`)));
  if (
    createHash("sha256").update(bytes).digest("hex") !== meta.sha256 ||
    meta.source_url !== `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json` ||
    Date.parse(meta.captured_at) > time
  )
    throw new Error("OMM capture identity/hash/cutoff mismatch");
  captures.push(meta);
  const records = JSON.parse(bytes);
  if (!Array.isArray(records) || !records.length) throw new Error("Empty OMM capture");
  for (const record of records) {
    const id = String(record.NORAD_CAT_ID);
    if (seen.has(id)) continue;
    seen.add(id);
    const epoch = Date.parse(`${record.EPOCH}Z`);
    if (!Number.isFinite(epoch) || epoch > time || time - epoch > 14 * 86400000)
      throw new Error(`OMM epoch unavailable or older than 14 days: ${id}`);
    const rec = json2satrec(record);
    if (rec.error) throw new Error(`Invalid OMM record: ${id}`);
    satellites.push({
      id,
      name: record.OBJECT_NAME,
      group,
      epoch: new Date(epoch).toISOString(),
      ...point(rec, time),
      trail: Array.from({ length: 20 }, (_, i) => point(rec, time - (19 - i) * 30000)),
    });
  }
}
writeFileSync(
  output,
  JSON.stringify({
    schema_version: "satellite-replay/1",
    as_of: asOf,
    method:
      "SGP4 from captured CelesTrak OMM; fixed geodetic snapshot with 20 samples at 30-second intervals. Research visualization, not operational tracking.",
    captures,
    satellites,
  }) + "\n",
);
console.log(`Projected ${satellites.length} unique satellites at ${asOf}.`);
