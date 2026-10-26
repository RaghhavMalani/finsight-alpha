import { useQuery } from "@tanstack/react-query";
import { useDataMode } from "../replay/mode";
import { api } from "../lib/api";
import { canonicalRoute } from "../replay/client";
import { loadFactorReadManifest, readFactorArtifact } from "./manifest";
import { validateEnvelope, type Term } from "../regimes/contracts";
import {
  KNOWN_IDS,
  KNOWN_BUNDLES,
  KNOWN_ENTRIES,
  KNOWN_METADATA_ENTRIES,
  stable,
  validateMetadata,
  type Kind,
  type Country,
  type Catalog,
  type Audit,
  type Ledger,
  type Lineage,
} from "./contracts";
export async function loadMetadata(k: Kind, c: Country, cutoff: string) {
  const id = KNOWN_IDS[c + "|" + cutoff]?.[k];
  if (!id) throw new Error("UNAVAILABLE: unreviewed cutoff");
  const m = await loadFactorReadManifest(),
    entry = m.artifacts[id],
    route = canonicalRoute(
      "/factor-evidence/" + k + "?country=" + c + "&as_of=" + encodeURIComponent(cutoff),
    );
  if (
    stable(entry) !== stable(KNOWN_METADATA_ENTRIES[id]) ||
    m.routes[route] !== id ||
    entry?.kind !== "factors-" + k ||
    entry.scope !== "READ_ONLY_FACTOR_EVIDENCE" ||
    entry.licence?.status !== "FIRST_PARTY" ||
    entry.licence.dataset_key !== "project:factor-evidence" ||
    entry.licence.permitted_uses?.join(",") !== "publish_derived"
  )
    throw new Error("Metadata publication binding unavailable");
  return validateMetadata(await readFactorArtifact(id), k, c, cutoff);
}
type MetadataPanel = Exclude<Kind, "lineage">;
export function useFactorMetadata(k: MetadataPanel, c: Country, cutoff: string, valid: boolean) {
  const mode = useDataMode();
  return useQuery({
    queryKey: ["factor-metadata", mode, k, c, cutoff],
    enabled: valid,
    retry: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      if (mode === "live") {
        await api(
          "/factor-evidence/" + k + "?country=" + c + "&as_of=" + encodeURIComponent(cutoff),
          { signal },
        );
        throw new Error("UNAVAILABLE: no installed local runtime");
      }
      const metadata = await loadMetadata(k, c, cutoff);
      if (signal.aborted) throw new DOMException("Selection changed", "AbortError");
      if (k === "catalog") return { kind: k, value: metadata as Catalog };
      if (k === "audit") return { kind: k, value: metadata as Audit };
      return { kind: k, value: metadata as Ledger };
    },
  });
}
export type Retained = {
  rolling_tail: { observed_at: string; mkt: number; smb: number; hml: number }[];
  full_window: {
    status: string;
    n: number;
    r_squared: number | null;
    terms: Term[];
    inference: string;
  };
  stability: number | null;
};
export async function loadRetained(c: Country, cutoff: string) {
  const b = KNOWN_BUNDLES[c]?.[cutoff];
  if (!b) throw new Error("No reviewed retained reference");
  const m = await loadFactorReadManifest();
  for (const ref of Object.values(b.refs))
    if (stable(m.artifacts[ref.artifact_id]) !== stable(KNOWN_ENTRIES[ref.artifact_id]))
      throw new Error("Numerical entry or licence changed");
  const values = await Promise.all(
    ["factors", "snapshot", "lineage"].map((k) => readFactorArtifact(b.refs[k].artifact_id)),
  );
  const [f, s, l] = values.map((v, i) =>
    validateEnvelope<Record<string, unknown>>(
      v,
      ["factors", "snapshot", "lineage"][i] as "factors" | "snapshot" | "lineage",
    ),
  );
  const snap = s.payload as {
      country: string;
      asset: string;
      run_ids: { factors: string };
      current: { factors: { neutrality: string } };
    },
    chain = (l.payload as { runs: { factors: { run_id: string; status: string } } }).runs.factors;
  if (
    snap.country !== c ||
    snap.asset !== b.refs.factors.asset ||
    snap.run_ids.factors !== b.refs.factors.run_id ||
    chain.run_id !== b.refs.lineage.run_id ||
    chain.status !== "VERIFIED" ||
    [f, s, l].some((x) => x.asOf !== cutoff)
  )
    throw new Error("Retained country/cutoff/run/lineage mismatch");
  return {
    value: f.payload as unknown as Retained,
    neutrality: snap.current.factors.neutrality,
    refs: b.refs,
  };
}
export function useRetained(c: Country, cutoff: string, enabled: boolean) {
  const mode = useDataMode();
  return useQuery({
    queryKey: ["factor-retained", mode, c, cutoff],
    enabled: enabled && mode === "replay",
    retry: false,
    staleTime: Infinity,
    queryFn: () => loadRetained(c, cutoff),
  });
}
export function useFactorLineage(c: Country, cutoff: string) {
  return useQuery({
    queryKey: ["factor-lineage", c, cutoff],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => (await loadMetadata("lineage", c, cutoff)) as Lineage,
  });
}
