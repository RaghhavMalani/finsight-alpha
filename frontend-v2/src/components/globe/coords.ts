import { Vector3 } from "three";

/** Globe radius in scene units, and the Earth's mean radius it stands for. */
export const R = 5;
export const EARTH_KM = 6371;

/** Latitude/longitude (degrees) to a point on (or above) the globe, y up. */
export function toVec(lat: number, lon: number, radius = R, out = new Vector3()) {
  const p = (lat * Math.PI) / 180,
    l = (lon * Math.PI) / 180;
  return out.set(
    radius * Math.cos(p) * Math.cos(l),
    radius * Math.sin(p),
    -radius * Math.cos(p) * Math.sin(l),
  );
}
