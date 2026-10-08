import {
  ForgeContractError,
  type BaselineDetail,
  type RunIndex,
  type RunSummary,
  type RunDetail,
} from "../contracts/observer.ts";

export function assertRunPreview(summary: RunSummary, detail: RunDetail) {
  if (
    summary.runId !== detail.runId ||
    summary.taskId !== detail.taskId ||
    summary.model !== detail.model ||
    summary.seed !== detail.seed ||
    summary.worldHash !== detail.worldHash ||
    summary.verifiedResearchSuccess !== detail.verifiedResearchSuccess ||
    JSON.stringify(Object.entries(summary.verificationChecks).sort()) !==
      JSON.stringify(Object.entries(detail.verificationChecks).sort())
  ) {
    throw new ForgeContractError("Run detail does not match the selected recorded trajectory.");
  }
}

export function recordedOutcome(run: RunSummary): "verified" | "partial" | "failed" {
  return run.verifiedResearchSuccess
    ? "verified"
    : run.verificationChecks.verdict
      ? "partial"
      : "failed";
}

/** Presentation of recorded grades only; never infer a verifier result from task names. */
export function buildAgentOverview(baseline: BaselineDetail, index: RunIndex) {
  const fail = (message: string): never => {
    throw new ForgeContractError(message);
  };
  if (!Number.isFinite(Date.parse(baseline.createdAt))) fail("Invalid baseline observation date.");
  if (
    baseline.binding.integrityStatus !== "MANIFEST_MATCH" ||
    baseline.binding.sourceSchemaVersion !== "forge-real-single-agent-baseline/0.2.5" ||
    baseline.tag !== "FORGE_REAL_SINGLE_AGENT_BASELINE_V0_2_5" ||
    index.binding.artifactHash !== baseline.binding.artifactHash
  ) {
    fail("The Agents overview requires the bound, manifest-matched real API baseline.");
  }
  if (
    !index.items.length ||
    index.matched !== index.items.length ||
    index.items.length !== baseline.overall.episodes.value
  )
    fail("Baseline and run coverage disagree.");
  const models = [...baseline.models].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(models.map((m) => m.id)).size !== models.length) fail("Duplicate model identity.");
  const ids = new Set<string>();
  const cells = new Set<string>();
  for (const run of index.items) {
    const cell = JSON.stringify([run.taskId, run.model, run.seed]);
    if (ids.has(run.runId) || cells.has(cell)) fail("Duplicate run or task/model/seed cell.");
    ids.add(run.runId);
    cells.add(cell);
    if (!models.some((m) => m.id === run.model)) fail("Run model is not bound to this baseline.");
    if (
      !Number.isInteger(run.seed) ||
      !Number.isFinite(run.usage.cost.value) ||
      run.usage.cost.value < 0
    )
      fail("Invalid recorded run usage or seed.");
    const checks = Object.values(run.verificationChecks);
    if (!checks.length || typeof run.verificationChecks.verdict !== "boolean")
      fail("Recorded verdict check is missing.");
    if (
      run.verifiedResearchSuccess !== checks.every(Boolean) ||
      (run.verifiedResearchSuccess &&
        (!run.completed || run.criticalGateFailure || run.falseAlphaAcceptance))
    ) {
      fail("Recorded verification status contradicts its checks.");
    }
    if (run.verificationChecks.verdict !== (run.decision?.verdict === run.expectedVerdict))
      fail("Submitted verdict contradicts the recorded verdict check.");
  }
  const verified = index.items.filter((r) => r.verifiedResearchSuccess).length;
  if (
    Math.abs((verified / index.items.length) * 100 - baseline.overall.verifiedResearch.value) > 1e-8
  )
    fail("Overall verified count disagrees with the baseline.");
  for (const model of models) {
    const runs = index.items.filter((r) => r.model === model.id);
    if (
      runs.length !== model.episodes.value ||
      Math.abs(
        (runs.filter((r) => r.verifiedResearchSuccess).length / runs.length) * 100 -
          model.verifiedResearch.value,
      ) > 1e-8
    )
      fail("Model coverage or verified count disagrees with the baseline.");
  }
  return {
    models,
    tasks: [...new Set(index.items.map((r) => r.taskClass))],
    verified,
    correctVerdicts: index.items.filter((r) => r.verificationChecks.verdict).length,
    falseAlpha: index.items.filter((r) => r.falseAlphaAcceptance).length,
    failures: index.items.filter((r) => !r.verifiedResearchSuccess),
  };
}
