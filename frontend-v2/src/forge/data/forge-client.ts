import { api } from "@/lib/api";
import {
  adaptArtifactIndex,
  adaptBaseline,
  adaptBaselineIndex,
  adaptReality,
  adaptRun,
  adaptRunIndex,
  adaptWorldIndex,
} from "@/forge/data/forge-adapters";

export async function fetchBaselineIndex() {
  return adaptBaselineIndex(await api<unknown>("/forge/baselines"));
}

export async function fetchBaseline(baselineId: string) {
  return adaptBaseline(await api<unknown>(`/forge/baselines/${encodeURIComponent(baselineId)}`));
}

export async function fetchRuns(filters: { model?: string; verdict?: string } = {}) {
  const params = new URLSearchParams({ baseline_id: "forge-v0.2.5" });
  if (filters.model) params.set("model", filters.model);
  if (filters.verdict) params.set("verdict", filters.verdict);
  return adaptRunIndex(await api<unknown>(`/forge/runs?${params}`));
}

export async function fetchRun(runId: string) {
  return adaptRun(await api<unknown>(`/forge/runs/${encodeURIComponent(runId)}`));
}

export async function fetchReality(artifactId: string) {
  return adaptReality(
    await api<unknown>(`/forge/reality-ladders/${encodeURIComponent(artifactId)}`),
  );
}

export async function fetchWorlds() {
  return adaptWorldIndex(await api<unknown>("/forge/worlds"));
}

export async function fetchArtifacts() {
  return adaptArtifactIndex(await api<unknown>("/forge/artifacts"));
}
