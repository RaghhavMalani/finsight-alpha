import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { loadReplayManifest, readReplayArtifact } from "@/replay/client";
import { useDataMode } from "@/replay/mode";
import {
  validateEnvelope,
  type History,
  type LineageView,
  type Matrix,
  type RegimeKind,
  type Snapshot,
  type Timeline,
} from "./contracts";

export const PUBLIC_ASSETS = ["US-MKT", "IN-MKT"] as const;
export const LOCAL_ASSETS = ["SPY", "QQQ", "IWM"] as const;

async function read<T>(kind: RegimeKind, asset: string | null, signal?: AbortSignal) {
  const path = `/regimes/${kind}${asset ? `?asset=${encodeURIComponent(asset)}` : ""}`;
  return validateEnvelope<T>(await api<unknown>(path, { signal }), kind);
}

/** The SHA-256 of the artifact bound to a Replay route, for the REPLAY badge. */
export function useReplayBinding(kind: RegimeKind, asset: string | null) {
  const mode = useDataMode();
  return useQuery({
    queryKey: ["regimes", "binding", kind, asset],
    enabled: mode === "replay",
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const manifest = await loadReplayManifest();
      const route = `/regimes/${kind}${asset ? `?asset=${asset}` : ""}`;
      const id = manifest.routes[route];
      return id ? { id, ...manifest.artifacts[id] } : null;
    },
  });
}

export function useRegime<T>(kind: RegimeKind, asset: string | null, enabled = true) {
  const mode = useDataMode();
  return useQuery({
    queryKey: ["regimes", mode, kind, asset],
    enabled,
    staleTime: mode === "replay" ? Infinity : 60_000,
    retry: false,
    queryFn: ({ signal }) => read<T>(kind, asset, signal),
  });
}

/** REPLAY: a sealed snapshot addressed by its content identity from the history. */
export function useSealedSnapshot(identity: string | null) {
  return useQuery({
    queryKey: ["regimes", "sealed", identity],
    enabled: Boolean(identity),
    staleTime: Infinity,
    retry: false,
    queryFn: async () =>
      validateEnvelope<Snapshot>(await readReplayArtifact(identity!), "snapshot"),
  });
}

export const useSnapshot = (asset: string) => useRegime<Snapshot>("snapshot", asset);
export const useTimeline = (asset: string) => useRegime<Timeline>("timeline", asset);
export const useLineage = (asset: string, enabled: boolean) =>
  useRegime<LineageView>("lineage", asset, enabled);
export const useHistory = (asset: string) => useRegime<History>("history", asset);
export const useMatrix = () => useRegime<Matrix>("matrix", null);
