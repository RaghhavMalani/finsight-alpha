import { queryOptions } from "@tanstack/react-query";
import {
  fetchArtifacts,
  fetchBaseline,
  fetchBaselineIndex,
  fetchReality,
  fetchRun,
  fetchRuns,
  fetchWorlds,
} from "@/forge/data/forge-client";

export const baselineIndexQuery = queryOptions({
  queryKey: ["forge", "baselines"],
  queryFn: fetchBaselineIndex,
  staleTime: Number.POSITIVE_INFINITY,
});

export function baselineQuery(baselineId: string) {
  return queryOptions({
    queryKey: ["forge", "baseline", baselineId],
    queryFn: () => fetchBaseline(baselineId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function runsQuery(filters: { model?: string; verdict?: string } = {}) {
  return queryOptions({
    queryKey: ["forge", "runs", filters.model ?? "all", filters.verdict ?? "all"],
    queryFn: () => fetchRuns(filters),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function runQuery(runId: string) {
  return queryOptions({
    queryKey: ["forge", "run", runId],
    queryFn: () => fetchRun(runId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function realityQuery(artifactId: string) {
  return queryOptions({
    queryKey: ["forge", "reality", artifactId],
    queryFn: () => fetchReality(artifactId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export const worldsQuery = queryOptions({
  queryKey: ["forge", "worlds"],
  queryFn: fetchWorlds,
  staleTime: Number.POSITIVE_INFINITY,
});

export const artifactsQuery = queryOptions({
  queryKey: ["forge", "artifacts"],
  queryFn: fetchArtifacts,
  staleTime: Number.POSITIVE_INFINITY,
});
