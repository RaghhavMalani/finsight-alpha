import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDataMode } from "@/replay/mode";
import {
  DATA_KINDS,
  validateDataEnvelope,
  validateDataBinding,
  type DataSnapshot,
} from "./contracts";
import { loadReplayManifest } from "@/replay/client";
import { ReplayError } from "@/replay/contracts";

export function useDataEvidence() {
  const mode = useDataMode();
  return useQuery({
    queryKey: ["data-organ", mode],
    queryFn: async ({ signal }) => {
      const manifest = mode === "replay" ? await loadReplayManifest() : null;
      const entries = await Promise.all(
        DATA_KINDS.map(async (kind) => {
          const value = validateDataEnvelope(await api<unknown>("/data/" + kind, { signal }), kind);
          if (value.scope !== (mode === "replay" ? "REAL_DERIVED_DIAGNOSTICS" : "LOCAL_ONLY"))
            throw new ReplayError("Data evidence scope does not match this mode");
          if (manifest)
            validateDataBinding(value, manifest.artifacts[manifest.routes["/data/" + kind]]);
          return [kind, value] as const;
        }),
      );
      if (
        mode === "replay" &&
        entries.some(
          ([, value]) =>
            value.input_hash !== entries[0][1].input_hash || value.as_of !== entries[0][1].as_of,
        )
      )
        throw new ReplayError("Data views do not share one sealed evidence receipt");
      return Object.fromEntries(entries) as DataSnapshot;
    },
    staleTime: 60_000,
    retry: false,
  });
}
