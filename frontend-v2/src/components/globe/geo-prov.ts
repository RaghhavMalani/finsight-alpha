import type { Origin } from "@/visual/Num";
import type { GeoProjection } from "./geo-graph";

/**
 * A value read from the Global Eye graph projection. It is not in /replay-manifest.json: the file
 * and its SHA-256 are pinned at build time by geo-pin.generated.ts, and loadGeoProjection refuses
 * any bytes that do not hash to the pin. Pointers address the projection JSON.
 */
export function projectionOrigin(
  proj: GeoProjection,
  ptr: string,
  extra: Partial<Origin> = {},
): Origin {
  return {
    kind: "replay",
    src: proj.url,
    sha256: proj.sha256,
    shaNamedBy: "src/components/globe/geo-pin.generated.ts",
    ptr,
    note: "Pinned graph projection, checked against its compiled SHA-256 on load.",
    ...extra,
  };
}

/** Index of each projection event in the projection's /events array (its insertion order). */
export function eventIndex(proj: GeoProjection) {
  return new Map([...proj.events.keys()].map((id, i) => [id, i]));
}
