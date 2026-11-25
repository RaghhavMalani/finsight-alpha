import { useQuery } from "@tanstack/react-query";
import type { Origin } from "@/visual/Num";
import { replayOrigin } from "@/visual/origins";
import { provHelpers } from "@/visual/route-origin";
import { loadFactorReadManifest } from "./manifest";

/**
 * Provenance for a value read from a checked Factor artifact. The page reads every Factor artifact
 * through the checked Factor read manifest (its own SHA-256 is pinned in read-plan.generated.ts);
 * the origin names the artifact URL and the digest that manifest gives for it.
 */
export function useFactorProv(artifactId: string | null | undefined) {
  const manifest = useQuery({
    queryKey: ["factor-read-manifest"],
    queryFn: loadFactorReadManifest,
    staleTime: Infinity,
    retry: false,
  });
  const entry = artifactId ? manifest.data?.artifacts[artifactId] : undefined;
  return {
    ...provHelpers((ptr: string, extra: Partial<Origin> = {}) => replayOrigin(entry, ptr, extra)),
    entry,
  };
}
