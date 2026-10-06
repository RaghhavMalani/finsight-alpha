import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import landUrl from "world-atlas/land-110m.json?url";
import countriesUrl from "world-atlas/countries-110m.json?url";

/** Natural Earth 1:110m land (public domain) via world-atlas, as dots and line rings. */
export type LandData = {
  dots: [number, number][];
  coasts: [number, number][][];
  borders: [number, number][][];
};

type Ring = [number, number][];
type Poly = { rings: Ring[]; box: [number, number, number, number] };

function inRing(lon: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A point is on land when it is inside a polygon's outer ring and outside its holes. */
function onLand(lon: number, lat: number, polys: Poly[]) {
  for (const p of polys) {
    const [x0, y0, x1, y1] = p.box;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (inRing(lon, lat, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(lon, lat, h)))
      return true;
  }
  return false;
}

let cached: Promise<LandData> | null = null;
export function loadLand(): Promise<LandData> {
  cached ??= (async () => {
    const [land, countries] = (await Promise.all(
      [landUrl, countriesUrl].map((u) => fetch(u).then((r) => r.json())),
    )) as Topology[];
    const shape = feature(land, land.objects.land as GeometryCollection);
    const polys: Poly[] = [];
    for (const f of shape.features) {
      const g = f.geometry;
      const list =
        g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const rings of list as Ring[][]) {
        const xs = rings[0].map((p) => p[0]),
          ys = rings[0].map((p) => p[1]);
        polys.push({
          rings,
          box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        });
      }
    }
    // An equal-area-ish grid: 0.9° in latitude, longitude spacing widened toward the poles.
    const dots: [number, number][] = [];
    for (let lat = -84; lat <= 84; lat += 0.9) {
      const step = 0.9 / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
      for (let lon = -180; lon < 180; lon += step)
        if (onLand(lon, lat, polys)) dots.push([lat, lon]);
    }
    const lines = (m: { coordinates: Ring[] }) => m.coordinates;
    return {
      dots,
      coasts: lines(
        mesh(land, land.objects.land as GeometryCollection) as unknown as { coordinates: Ring[] },
      ),
      borders: lines(
        mesh(
          countries,
          countries.objects.countries as GeometryCollection,
          (a, b) => a !== b,
        ) as unknown as {
          coordinates: Ring[];
        },
      ),
    };
  })();
  return cached;
}
