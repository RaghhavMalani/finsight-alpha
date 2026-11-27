import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { canonicalRoute, loadReplayManifest } from "@/replay/client";
import { useDataMode } from "@/replay/mode";
import type { Origin } from "@/visual/Num";
import { liveOrigin, manifestOrigin, replayOrigin } from "@/visual/origins";
import { provHelpers, type RouteProv } from "@/visual/route-origin";
import type { RegimeKind } from "./contracts";

/** Escapes one JSON-pointer segment (RFC 6901). */
export const seg = (key: string | number) => String(key).replace(/~/g, "~0").replace(/\//g, "~1");

/**
 * Origins for a regime envelope, resolved the way `query.ts` reads it: by content identity (a
 * selected sealed snapshot), by kind + cutoff + source (a Replay timeline or lineage at a cutoff), or
 * by the manifest route. Replay names that entry's URL and SHA-256; local Live names the endpoint
 * (never hashed). Pointers address the envelope body, so values sit under `/payload`.
 */
export function useRegimeOrigin(
  kind: RegimeKind,
  asset: string | null,
  asOf: string | null = null,
  identity: string | null = null,
) {
  const mode = useDataMode();
  const manifest = useQuery({
    queryKey: ["replay", "manifest"],
    queryFn: loadReplayManifest,
    staleTime: Infinity,
    retry: false,
    enabled: mode === "replay",
  });
  const data = manifest.data;
  const path = `/regimes/${kind}${asset ? `?asset=${encodeURIComponent(asset)}` : ""}`;
  return useCallback(
    (ptr: string, extra: Partial<Origin> = {}): Origin => {
      if (mode !== "replay") return liveOrigin(`GET ${path}`, ptr, {}, extra);
      let id: string | null = identity;
      if (!id && asOf && data) {
        const source = asset === "US-MKT" ? "ken-french:daily-factors" : "iima:daily-factors";
        const hits = Object.entries(data.artifacts).filter(
          ([, e]) =>
            e.kind === `regimes-${kind}` &&
            e.as_of === asOf &&
            e.sources.length === 1 &&
            e.sources[0] === source,
        );
        id = hits.length === 1 ? hits[0][0] : null;
      }
      if (!id && !asOf) id = data?.routes[canonicalRoute(path)] ?? null;
      return replayOrigin(id ? data?.artifacts[id] : null, ptr, extra);
    },
    [mode, data, path, identity, asOf, asset],
  );
}

/** The manifest entry's own digest: read from the manifest, which has no digest of its own. */
export function manifestDigestOrigin(id: string): Origin {
  return manifestOrigin(`/artifacts/${seg(id)}/sha256`);
}

const SnapshotProv = createContext<RouteProv | null>(null);

/** Supplies the origin of the snapshot whose values the panels below render. */
export function SnapshotProvenance({
  at,
  children,
}: {
  at: (ptr: string, extra?: Partial<Origin>) => Origin;
  children: ReactNode;
}) {
  return <SnapshotProv.Provider value={provHelpers(at)}>{children}</SnapshotProv.Provider>;
}

export function useSnapshotProv(): RouteProv {
  const p = useContext(SnapshotProv);
  if (!p) throw new Error("useSnapshotProv needs a SnapshotProvenance");
  return p;
}
