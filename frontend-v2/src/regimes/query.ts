import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ReplayError } from "@/replay/contracts";
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
export function useReplayBinding(
  kind: RegimeKind,
  asset: string | null,
  identity: string | null = null,
) {
  const mode = useDataMode();
  return useQuery({
    queryKey: ["regimes", "binding", kind, asset, identity],
    enabled: mode === "replay",
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const manifest = await loadReplayManifest();
      const route = `/regimes/${kind}${asset ? `?asset=${asset}` : ""}`;
      const id = identity ?? manifest.routes[route];
      return id ? { id, ...manifest.artifacts[id] } : null;
    },
  });
}

export function useRegime<T>(
  kind: RegimeKind,
  asset: string | null,
  enabled = true,
  asOf: string | null = null,
) {
  const mode = useDataMode();
  return useQuery({
    queryKey: ["regimes", mode, kind, asset, asOf],
    enabled,
    staleTime: mode === "replay" ? Infinity : 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (mode !== "replay" || !asOf) return read<T>(kind, asset, signal);
      const source = asset === "US-MKT" ? "ken-french:daily-factors" : "iima:daily-factors";
      const manifest = await loadReplayManifest();
      const entries = Object.entries(manifest.artifacts).filter(
        ([, entry]) =>
          entry.kind === `regimes-${kind}` &&
          entry.as_of === asOf &&
          entry.sources.length === 1 &&
          entry.sources[0] === source,
      );
      if (entries.length !== 1)
        throw new ReplayError("Selected cutoff has no unique bound " + kind + " artifact.");
      const value = validateEnvelope<T>(await readReplayArtifact(entries[0][0]), kind);
      if ((value.payload as Record<string, unknown>).asset !== asset || value.asOf !== asOf)
        throw new ReplayError("Selected evidence does not match its market and sealed cutoff.");
      return value;
    },
  });
}

/** REPLAY: a sealed snapshot addressed by its content identity from the history. */
export function useSealedSnapshot(identity: string | null, asset: string, asOf: string | null) {
  return useQuery({
    queryKey: ["regimes", "sealed", identity, asset, asOf],
    enabled: Boolean(identity),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const value = validateEnvelope<Snapshot>(await readReplayArtifact(identity!), "snapshot");
      if (value.payload.asset !== asset || value.payload.requested_as_of !== asOf)
        throw new ReplayError("Selected snapshot does not match its market and sealed cutoff.");
      return value;
    },
  });
}

export const useSnapshot = (asset: string) => useRegime<Snapshot>("snapshot", asset);
export const useTimeline = (asset: string, asOf: string | null = null) =>
  useRegime<Timeline>("timeline", asset, true, asOf);
export const useLineage = (asset: string, enabled: boolean, asOf: string | null = null) =>
  useRegime<LineageView>("lineage", asset, enabled, asOf);
export const useHistory = (asset: string) => useRegime<History>("history", asset);
export const useMatrix = () => useRegime<Matrix>("matrix", null);
