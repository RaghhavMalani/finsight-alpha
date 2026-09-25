import { queryOptions } from "@tanstack/react-query";
import { fetchDynamicsLabPayload, fetchOUPowerMap } from "@/dynamics/contracts";
import { fetchIdentifiabilityArtifact } from "@/dynamics/identifiability-contracts";
import { fetchNonlinearLabPayload } from "@/dynamics/nonlinear-contracts";
import { fetchTournamentArtifact } from "@/dynamics/tournament-contracts";
import { fetchFailureDecomposition } from "@/dynamics/failure-contracts";
import { fetchTargetedRecovery } from "@/dynamics/recovery-contracts";
import { fetchGeneralizationAutopsy } from "@/dynamics/autopsy-contracts";
import { fetchEvidenceCompleteReplication } from "@/dynamics/replication-contracts";
import { fetchHawkesCertification } from "@/dynamics/hawkes-contracts";

export const referenceDynamicsQuery = queryOptions({
  queryKey: ["dynamics", "theory-certification", "d0.2.1-reference-1"],
  queryFn: fetchDynamicsLabPayload,
  staleTime: Number.POSITIVE_INFINITY,
});

export const nonlinearDynamicsQuery = queryOptions({
  queryKey: ["dynamics", "nonlinear-certification", "d0.3-reference-1"],
  queryFn: fetchNonlinearLabPayload,
  staleTime: Number.POSITIVE_INFINITY,
});

export const identifiabilityQuery = queryOptions({
  queryKey: ["dynamics", "nonlinear-identifiability", "d0.3.1-reference-1"],
  queryFn: fetchIdentifiabilityArtifact,
  staleTime: Number.POSITIVE_INFINITY,
});

export const tournamentQuery = queryOptions({
  queryKey: ["dynamics", "estimator-tournament", "d0.3.2-reference-1"],
  queryFn: fetchTournamentArtifact,
  staleTime: Number.POSITIVE_INFINITY,
});

export const failureDecompositionQuery = queryOptions({
  queryKey: ["dynamics", "failure-decomposition", "d0.3.2.1-reference-1"],
  queryFn: fetchFailureDecomposition,
  staleTime: Number.POSITIVE_INFINITY,
});

export const targetedRecoveryQuery = queryOptions({
  queryKey: ["dynamics", "targeted-recovery", "d0.3.3-reference-1"],
  queryFn: fetchTargetedRecovery,
  staleTime: Number.POSITIVE_INFINITY,
});

export const generalizationAutopsyQuery = queryOptions({
  queryKey: ["dynamics", "generalization-autopsy", "d0.3.3.1-reference-1"],
  queryFn: fetchGeneralizationAutopsy,
  staleTime: Number.POSITIVE_INFINITY,
});

export const evidenceCompleteReplicationQuery = queryOptions({
  queryKey: ["dynamics", "evidence-complete-replication", "d0.3.4-reference-1"],
  queryFn: fetchEvidenceCompleteReplication,
  staleTime: Number.POSITIVE_INFINITY,
});

export const hawkesCertificationQuery = queryOptions({
  queryKey: ["dynamics", "hawkes-event-process", "d0.4-reference-1"],
  queryFn: fetchHawkesCertification,
  staleTime: Number.POSITIVE_INFINITY,
});

export const ouPowerQuery = queryOptions({
  queryKey: ["dynamics", "ou-power", "pilot-power-1", 6],
  queryFn: fetchOUPowerMap,
  staleTime: Number.POSITIVE_INFINITY,
});
