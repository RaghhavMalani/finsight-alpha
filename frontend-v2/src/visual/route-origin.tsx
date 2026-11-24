import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { canonicalRoute, loadReplayManifest } from "@/replay/client";
import { useDataMode } from "@/replay/mode";
import { Num, Src, Stamp, type NumFormat, type Origin } from "./Num";
import { liveOrigin, num, ref, replayOrigin } from "./origins";

/**
 * Origins for values read through `api(route)`. In Replay that body is the checked artifact the
 * Replay manifest routes `route` to (its URL and the manifest's SHA-256); in local Live it is the
 * API response for `route` (never hashed). Pointers address that JSON body.
 */
export function useRouteOrigin(route: string) {
  const mode = useDataMode();
  const manifest = useQuery({
    queryKey: ["replay", "manifest"],
    queryFn: loadReplayManifest,
    staleTime: Infinity,
    retry: false,
    enabled: mode === "replay",
  });
  const data = manifest.data;
  return useCallback(
    (ptr: string, extra: Partial<Origin> = {}): Origin => {
      if (mode !== "replay") return liveOrigin(`GET ${route}`, ptr, {}, extra);
      const id = data?.routes[canonicalRoute(route)];
      return replayOrigin(id ? data?.artifacts[id] : null, ptr, extra);
    },
    [mode, data, route],
  );
}

/** Render helpers bound to one route: numbers, timestamps and recorded text with origins. */
export function useRouteProv(route: string) {
  return provHelpers(useRouteOrigin(route));
}

/** Render helpers for one source, given how to build an origin for a pointer into it. */
export function provHelpers(at: (ptr: string, extra?: Partial<Origin>) => Origin) {
  const N = (
    ptr: string,
    v: number | null | undefined,
    label: string,
    display?: string,
    extra: Partial<Origin> = {},
    fmt: NumFormat = "x",
  ) => (
    <Num n={num(at(ptr, extra), v, fmt)} label={label} display={display} className="vx-inherit" />
  );
  const D = (ptr: string, v: string | null | undefined, label: string, display?: string) => (
    <Stamp s={ref(at(ptr), v)} label={label} display={display} className="vx-inherit" />
  );
  /** Recorded text, shown verbatim. */
  const T = (ptr: string, t: string | null | undefined, label: string) => (
    <Src t={{ ...at(ptr), t: t ?? null }} label={label} />
  );
  return { at, N, D, T };
}
export type RouteProv = ReturnType<typeof provHelpers>;
