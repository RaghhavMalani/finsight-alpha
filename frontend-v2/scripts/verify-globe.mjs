import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from "satellite.js";
import {
  geoInputs,
  HUBS,
  normalizeEarthquakes,
  parseTle,
  subsolarPoint,
} from "../src/components/globe/geo-data.ts";
import { SENSOR_PRELUDE, SENSORS } from "../src/components/globe/sensors.ts";

// Usage: node scripts/verify-globe.mjs
// The God's Eye globe must compute the Geo events inputs exactly as src/geo/usgs.py does, reject
// malformed feeds, and ship sensor looks without invented readouts.
let count = 0;
const check = (fn) => {
  fn();
  count++;
};
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const feed = JSON.parse(fixture("usgs-4.5-week.sample.geojson"));
const expected = JSON.parse(fixture("geo-inputs.expected.json"));
const quakes = normalizeEarthquakes(feed);
check(() => assert.equal(quakes.length, feed.features.length));
check(() => {
  // Same values as src/geo/usgs.py inputs_at on the same events (tests/test_neural.py).
  const at = Date.parse(expected.at);
  const { values } = geoInputs(quakes, at, at - 30 * 86_400_000);
  values.forEach((v, i) => assert.ok(Math.abs(v - expected.inputs[i]) < 1e-9, `input ${i}: ${v}`));
});
check(() => {
  // An event younger than a day is pending, not admitted.
  const at = Date.parse(expected.at);
  const fresh = [{ ...quakes[0], stableId: "fresh", mag: 9.1, time: at - 3_600_000 }];
  const r = geoInputs([...quakes, ...fresh], at, at - 30 * 86_400_000);
  assert.equal(r.values[1], expected.inputs[1]);
  assert.equal(r.pending, quakes.filter((q) => q.time + 86_400_000 > at).length + 1);
});
for (const mutate of [
  (x) => (x.features[0].geometry.coordinates[1] = 95),
  (x) => (x.features[0].properties.mag = 11),
  (x) => x.features.push(structuredClone(x.features[0])),
  (x) => delete x.features,
])
  check(() => {
    const copy = structuredClone(feed);
    mutate(copy);
    assert.equal(normalizeEarthquakes(copy), null);
  });

const tles = parseTle(fixture("celestrak-stations.sample.tle"));
check(() => assert.equal(tles.length, 6));
check(() => {
  const iss = tles.find((t) => t.name.startsWith("ISS"));
  const rec = twoline2satrec(iss.line1, iss.line2);
  const date = new Date("2026-10-06T00:00:00Z");
  const pv = propagate(rec, date);
  const geo = eciToGeodetic(pv.position, gstime(date));
  assert.ok(geo.height > 380 && geo.height < 450, `ISS altitude ${geo.height} km`);
  assert.ok(Math.abs(degreesLat(geo.latitude)) <= 51.7, "inside the ISS inclination band");
  assert.ok(Math.abs(degreesLong(geo.longitude)) <= 180);
});

check(() => {
  const s = subsolarPoint(new Date("2026-06-21T12:00:00Z"));
  assert.ok(Math.abs(s.lat - 23.44) < 0.3 && Math.abs(s.lon) < 3, JSON.stringify(s));
});
check(() => assert.equal(HUBS.length, 8));
for (const [name, shader] of Object.entries(SENSORS))
  check(() => {
    assert.ok(shader.fragmentShader.includes("out_FragColor"), name);
    assert.ok(SENSOR_PRELUDE.includes("out highp vec4 out_FragColor"), name);
    // No readout derived from screen brightness: the globe has no temperature to show.
    assert.ok(!/tempHud|framHud|tempC\b/.test(shader.fragmentShader), `${name} invents a readout`);
  });

console.log(`${count} globe feed, geo-input parity, orbit and sensor checks passed`);
