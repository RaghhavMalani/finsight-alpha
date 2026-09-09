import {
  ForgeContractError,
  OBSERVER_PROJECTION_SCHEMA,
  type ArtifactBinding,
  type ArtifactIndex,
  type BaselineDetail,
  type BaselineIndexItem,
  type EpistemicType,
  type Provenance,
  type RealityCheckpoint,
  type RealityDetail,
  type ResearchMetric,
  type RunAction,
  type RunDetail,
  type RunIndex,
  type RunSummary,
  type RunTurn,
  type WorldIndex,
} from "@/forge/contracts/observer";

type JsonRecord = Record<string, unknown>;

function object(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ForgeContractError(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ForgeContractError(`${label} must be an array.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ForgeContractError(`${label} must be a non-empty string.`);
  }
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ForgeContractError(`${label} must be a finite number.`);
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ForgeContractError(`${label} must be boolean.`);
  return value;
}

function optionalText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, label);
}

function projection(value: unknown): JsonRecord {
  const root = object(value, "Forge observer projection");
  if (root.schema_version !== OBSERVER_PROJECTION_SCHEMA) {
    throw new ForgeContractError(
      `Unsupported observer schema: ${String(root.schema_version ?? "MISSING")}.`,
    );
  }
  return root;
}

function integrityStatus(root: JsonRecord): string {
  return text(object(root.integrity, "integrity").status, "integrity.status");
}

function binding(
  root: JsonRecord,
  hashField: "baseline_id" | "artifact_hash" = "artifact_hash",
): ArtifactBinding {
  return {
    artifactId: text(root.artifact_id, "artifact_id"),
    artifactHash: text(root[hashField], hashField),
    sourceSchemaVersion: text(root.source_schema_version, "source_schema_version"),
    integrityStatus: integrityStatus(root),
  };
}

function provenance(
  artifact: ArtifactBinding,
  fieldPath: string,
  epistemicType: EpistemicType,
  extra: Partial<Provenance> = {},
): Provenance {
  return {
    epistemicType,
    source: artifact.artifactId,
    fieldPath,
    artifactId: artifact.artifactId,
    artifactHash: artifact.artifactHash,
    sourceSchemaVersion: artifact.sourceSchemaVersion,
    asOf: null,
    ...extra,
  };
}

function metric(
  artifact: ArtifactBinding,
  input: {
    id: string;
    label: string;
    value: unknown;
    unit: ResearchMetric["unit"];
    precision: number;
    fieldPath: string;
    epistemicType?: EpistemicType;
    extra?: Partial<Provenance>;
  },
): ResearchMetric {
  return {
    id: input.id,
    label: input.label,
    value: number(input.value, input.fieldPath),
    unit: input.unit,
    precision: input.precision,
    provenance: provenance(
      artifact,
      input.fieldPath,
      input.epistemicType ?? "COMPUTED",
      input.extra,
    ),
  };
}

function baselineBinding(root: JsonRecord): ArtifactBinding {
  return {
    artifactId: text(root.artifact_id, "artifact_id"),
    artifactHash: text(root.baseline_id, "baseline_id"),
    sourceSchemaVersion: text(root.source_schema_version, "source_schema_version"),
    integrityStatus: integrityStatus(root),
  };
}

function displayModel(model: string): string {
  return model.replace("gpt-5.6-", "").replace(/^./, (value) => value.toUpperCase());
}

export function adaptBaselineIndex(value: unknown): readonly BaselineIndexItem[] {
  const root = projection(value);
  return list(root.items, "baseline index items").map((entry, index) => {
    const item = object(entry, `baseline index item ${index}`);
    const itemBinding = baselineBinding(item);
    return {
      binding: itemBinding,
      tag: text(item.tag, "baseline tag"),
      createdAt: text(item.created_at, "baseline created_at"),
      episodes: number(item.episodes, "baseline episodes"),
      attempts: number(item.attempts_total, "baseline attempts_total"),
      excludedAttempts: number(item.excluded_attempts, "baseline excluded_attempts"),
      models: list(item.models, "baseline models").map((model, modelIndex) =>
        text(model, `baseline models[${modelIndex}]`),
      ),
    };
  });
}

export function adaptBaseline(value: unknown): BaselineDetail {
  const root = projection(value);
  const artifact = baselineBinding(root);
  const createdAt = text(root.created_at, "created_at");
  const modelSummaries = list(root.model_summaries, "model_summaries");
  const models = modelSummaries.map((entry, index) => {
    const source = object(entry, `model_summaries[${index}]`);
    const modelId = text(source.model, `model_summaries[${index}].model`);
    const path = `/model_summaries/${index}`;
    const extra = { observedAt: createdAt };
    return {
      id: modelId,
      label: displayModel(modelId),
      provider: text(source.provider, `${path}/provider`),
      episodes: metric(artifact, {
        id: "episodes",
        label: "Episodes",
        value: source.episodes,
        unit: "COUNT",
        precision: 0,
        fieldPath: `${path}/episodes`,
        extra,
      }),
      verifiedResearch: metric(artifact, {
        id: "verified-research",
        label: "Verified research",
        value:
          number(source.verified_research_success_rate, `${path}/verified_research_success_rate`) *
          100,
        unit: "PERCENT",
        precision: 1,
        fieldPath: `${path}/verified_research_success_rate`,
        extra,
      }),
      falseAlpha: metric(artifact, {
        id: "false-alpha",
        label: "False alpha",
        value:
          number(source.false_alpha_acceptance_rate, `${path}/false_alpha_acceptance_rate`) * 100,
        unit: "PERCENT",
        precision: 1,
        fieldPath: `${path}/false_alpha_acceptance_rate`,
        extra,
      }),
      criticalFailures: metric(artifact, {
        id: "critical-failures",
        label: "Critical failures",
        value:
          number(source.critical_gate_failure_rate, `${path}/critical_gate_failure_rate`) * 100,
        unit: "PERCENT",
        precision: 1,
        fieldPath: `${path}/critical_gate_failure_rate`,
        extra,
      }),
      costPerVerifiedFinding: metric(artifact, {
        id: "cost-per-finding",
        label: "Cost / verified",
        value: source.cost_per_verified_finding_usd,
        unit: "USD",
        precision: 5,
        fieldPath: `${path}/cost_per_verified_finding_usd`,
        extra: { ...extra, method: "TOKEN_ESTIMATE_NOT_INVOICE" },
      }),
      latency: metric(artifact, {
        id: "latency",
        label: "Mean latency",
        value: source.mean_latency_seconds,
        unit: "SECONDS",
        precision: 1,
        fieldPath: `${path}/mean_latency_seconds`,
        extra,
      }),
      toolCalls: metric(artifact, {
        id: "tool-calls",
        label: "Mean tool calls",
        value: source.mean_tool_calls,
        unit: "COUNT",
        precision: 1,
        fieldPath: `${path}/mean_tool_calls`,
        extra,
      }),
      engineRuns: metric(artifact, {
        id: "engine-runs",
        label: "Mean engine runs",
        value: source.mean_engine_runs,
        unit: "COUNT",
        precision: 1,
        fieldPath: `${path}/mean_engine_runs`,
        extra,
      }),
    };
  });
  const overall = object(root.overall, "overall");
  const costs = object(root.costs, "costs");
  const bindings = object(root.bindings, "bindings");
  const overallPath = "/overall";
  const extra = { observedAt: createdAt };
  return {
    binding: artifact,
    tag: text(root.tag, "tag"),
    createdAt,
    models,
    overall: {
      verifiedResearch: metric(artifact, {
        id: "overall-verified",
        label: "Verified research",
        value:
          number(
            overall.verified_research_success_rate,
            `${overallPath}/verified_research_success_rate`,
          ) * 100,
        unit: "PERCENT",
        precision: 1,
        fieldPath: `${overallPath}/verified_research_success_rate`,
        extra,
      }),
      falseAlpha: metric(artifact, {
        id: "overall-false-alpha",
        label: "False alpha",
        value:
          number(
            overall.false_alpha_acceptance_rate,
            `${overallPath}/false_alpha_acceptance_rate`,
          ) * 100,
        unit: "PERCENT",
        precision: 1,
        fieldPath: `${overallPath}/false_alpha_acceptance_rate`,
        extra,
      }),
      episodes: metric(artifact, {
        id: "overall-episodes",
        label: "Admitted episodes",
        value: overall.episodes,
        unit: "COUNT",
        precision: 0,
        fieldPath: `${overallPath}/episodes`,
        extra,
      }),
      costPerVerifiedFinding: metric(artifact, {
        id: "overall-cost-per-finding",
        label: "Cost / verified",
        value: overall.cost_per_verified_finding_usd,
        unit: "USD",
        precision: 5,
        fieldPath: `${overallPath}/cost_per_verified_finding_usd`,
        extra: { ...extra, method: "TOKEN_ESTIMATE_NOT_INVOICE" },
      }),
    },
    attempts: metric(artifact, {
      id: "attempts",
      label: "Attempts",
      value: root.attempts_total,
      unit: "COUNT",
      precision: 0,
      fieldPath: "/attempts_total",
      extra,
    }),
    excludedAttempts: metric(artifact, {
      id: "excluded-attempts",
      label: "Excluded attempts",
      value: root.excluded_attempts,
      unit: "COUNT",
      precision: 0,
      fieldPath: "/excluded_attempts",
      extra,
    }),
    allAttemptCost: metric(artifact, {
      id: "all-attempt-cost",
      label: "All-attempt cost",
      value: costs.all_attempts_usd,
      unit: "USD",
      precision: 8,
      fieldPath: "/costs/all_attempts_usd",
      extra: { ...extra, method: text(costs.cost_basis, "costs.cost_basis") },
    }),
    admittedCost: metric(artifact, {
      id: "admitted-cost",
      label: "Admitted cost",
      value: costs.admitted_episodes_usd,
      unit: "USD",
      precision: 8,
      fieldPath: "/costs/admitted_episodes_usd",
      extra: { ...extra, method: text(costs.cost_basis, "costs.cost_basis") },
    }),
    suiteHash: text(bindings.suite_hash, "bindings.suite_hash"),
    certificationArtifactHash: text(
      bindings.certification_artifact_hash,
      "bindings.certification_artifact_hash",
    ),
    realityLadderArtifactHash: text(
      bindings.reality_ladder_artifact_hash,
      "bindings.reality_ladder_artifact_hash",
    ),
  };
}

function decision(value: unknown, label: string): RunSummary["decision"] {
  if (value === null || value === undefined) return null;
  const item = object(value, label);
  return {
    verdict: text(item.verdict, `${label}.verdict`),
    reason: text(item.reason, `${label}.reason`),
  };
}

function runUsage(
  artifact: ArtifactBinding,
  usageValue: unknown,
  path: string,
  runHash: string,
  worldHash: string,
  seed: number,
): RunSummary["usage"] {
  const usage = object(usageValue, path);
  const extra = { runHash, worldHash, seed };
  return {
    toolCalls: metric(artifact, {
      id: "tool-calls",
      label: "Tool calls",
      value: usage.tool_calls,
      unit: "COUNT",
      precision: 0,
      fieldPath: `${path}/tool_calls`,
      extra,
    }),
    engineRuns: metric(artifact, {
      id: "engine-runs",
      label: "Engine runs",
      value: usage.engine_runs,
      unit: "COUNT",
      precision: 0,
      fieldPath: `${path}/engine_runs`,
      extra,
    }),
    tokens: metric(artifact, {
      id: "total-tokens",
      label: "Total tokens",
      value: usage.total_tokens,
      unit: "COUNT",
      precision: 0,
      fieldPath: `${path}/total_tokens`,
      extra,
    }),
    cost: metric(artifact, {
      id: "cost",
      label: "Inference cost",
      value: usage.inference_cost_usd,
      unit: "USD",
      precision: 6,
      fieldPath: `${path}/inference_cost_usd`,
      extra: { ...extra, method: "TOKEN_ESTIMATE_NOT_INVOICE" },
    }),
    wallSeconds: metric(artifact, {
      id: "wall-seconds",
      label: "Wall time",
      value: usage.wall_seconds,
      unit: "SECONDS",
      precision: 3,
      fieldPath: `${path}/wall_seconds`,
      extra,
    }),
  };
}

function adaptRunSummary(entry: unknown, index: number, artifact: ArtifactBinding): RunSummary {
  const item = object(entry, `runs[${index}]`);
  const runId = text(item.run_id, `runs[${index}].run_id`);
  const worldHash = text(item.world_hash, `runs[${index}].world_hash`);
  const seed = number(item.seed, `runs[${index}].seed`);
  const verification = object(item.verification, `runs[${index}].verification`);
  return {
    runId,
    taskId: text(item.task_id, `runs[${index}].task_id`),
    taskClass: text(item.task_class, `runs[${index}].task_class`),
    worldHash,
    model: text(item.model, `runs[${index}].model`),
    modelVersion: text(item.model_version, `runs[${index}].model_version`),
    seed,
    completed: boolean(item.completed, `runs[${index}].completed`),
    failureReason: optionalText(item.failure_reason, `runs[${index}].failure_reason`),
    decision: decision(item.decision, `runs[${index}].decision`),
    verifiedResearchSuccess: boolean(
      verification.verified_research_success,
      `runs[${index}].verification.verified_research_success`,
    ),
    criticalGateFailure: boolean(
      verification.critical_gate_failure,
      `runs[${index}].verification.critical_gate_failure`,
    ),
    usage: runUsage(artifact, item.usage, `/items/${index}/usage`, runId, worldHash, seed),
  };
}

export function adaptRunIndex(value: unknown): RunIndex {
  const root = projection(value);
  const artifact: ArtifactBinding = {
    artifactId: text(root.artifact_id, "artifact_id"),
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    sourceSchemaVersion: text(root.source_schema_version, "source_schema_version"),
    integrityStatus: "MANIFEST_MATCH",
  };
  return {
    binding: artifact,
    items: list(root.items, "run items").map((item, index) =>
      adaptRunSummary(item, index, artifact),
    ),
    matched: number(root.matched, "matched"),
  };
}

function titleCaseMetric(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionMetrics(
  action: JsonRecord,
  index: number,
  artifact: ArtifactBinding,
  runHash: string,
  worldHash: string,
  seed: number,
): readonly ResearchMetric[] {
  const result = object(action.result, `actions[${index}].result`);
  if (result.metrics === undefined) return [];
  const values = object(result.metrics, `actions[${index}].result.metrics`);
  const stage = optionalText(result.stage, `actions[${index}].result.stage`);
  const engine = optionalText(result.engine, `actions[${index}].result.engine`);
  const certificationLevel = optionalText(
    result.certification_level,
    `actions[${index}].result.certification_level`,
  );
  const evidenceHash = optionalText(result.evidence_hash, `actions[${index}].result.evidence_hash`);
  const epistemicType: EpistemicType = stage?.includes("COUNTERFACTUAL")
    ? "COUNTERFACTUAL"
    : "COMPUTED";
  return Object.entries(values).map(([name, value]) =>
    metric(artifact, {
      id: name,
      label: titleCaseMetric(name),
      value,
      unit: name.includes("ratio") ? "RATIO" : "NUMBER",
      precision: 4,
      fieldPath: `/run/actions/${index}/result/metrics/${name}`,
      epistemicType,
      extra: {
        runHash,
        worldHash,
        seed,
        evidenceHash,
        engine,
        certificationLevel,
        method: optionalText(result.execution_mode, `actions[${index}].result.execution_mode`),
      },
    }),
  );
}

export function adaptRun(value: unknown): RunDetail {
  const root = projection(value);
  const artifact: ArtifactBinding = {
    artifactId: text(root.artifact_id, "artifact_id"),
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    sourceSchemaVersion: text(root.source_schema_version, "source_schema_version"),
    integrityStatus: "MANIFEST_MATCH",
  };
  const run = object(root.run, "run");
  const runId = text(run.trajectory_hash, "run.trajectory_hash");
  const worldHash = text(run.world_hash, "run.world_hash");
  const seed = number(run.seed, "run.seed");
  const identity = object(run.model_identity, "run.model_identity");
  const actions = list(run.actions, "run.actions").map((entry, index): RunAction => {
    const action = object(entry, `run.actions[${index}]`);
    const result = object(action.result, `run.actions[${index}].result`);
    return {
      sequence: number(action.sequence, `run.actions[${index}].sequence`),
      tool: text(action.tool, `run.actions[${index}].tool`),
      status: text(action.status, `run.actions[${index}].status`),
      engineRun: boolean(action.engine_run, `run.actions[${index}].engine_run`),
      highFidelityRun: boolean(action.high_fidelity_run, `run.actions[${index}].high_fidelity_run`),
      resultHash: text(action.result_hash, `run.actions[${index}].result_hash`),
      evidenceHash: optionalText(
        result.evidence_hash,
        `run.actions[${index}].result.evidence_hash`,
      ),
      stage: optionalText(result.stage, `run.actions[${index}].result.stage`),
      engine: optionalText(result.engine, `run.actions[${index}].result.engine`),
      certificationLevel: optionalText(
        result.certification_level,
        `run.actions[${index}].result.certification_level`,
      ),
      metrics: actionMetrics(action, index, artifact, runId, worldHash, seed),
    };
  });
  const inspect = list(run.actions, "run.actions").find((entry) => {
    const action = object(entry, "run action");
    return action.tool === "research.inspect_hypothesis";
  });
  let hypothesis: string | null = null;
  let acceptanceCriteria: string | null = null;
  if (inspect) {
    const result = object(object(inspect, "inspect action").result, "inspect result");
    const task = object(result.task, "inspect task");
    hypothesis = optionalText(task.hypothesis, "inspect task hypothesis");
    acceptanceCriteria = optionalText(task.acceptance_criteria, "inspect task acceptance_criteria");
  }
  const turns = list(root.model_turns, "model_turns").map((entry, index): RunTurn => {
    const turn = object(entry, `model_turns[${index}]`);
    const apiEvidence = object(turn.api_evidence, `model_turns[${index}].api_evidence`);
    const extra = { runHash: runId, worldHash, seed };
    return {
      sequence: number(turn.sequence, `model_turns[${index}].sequence`),
      text: text(turn.text, `model_turns[${index}].text`),
      inputTokens: metric(artifact, {
        id: "input-tokens",
        label: "Input tokens",
        value: turn.tokens_in,
        unit: "COUNT",
        precision: 0,
        fieldPath: `/model_turns/${index}/tokens_in`,
        epistemicType: "MODEL",
        extra,
      }),
      outputTokens: metric(artifact, {
        id: "output-tokens",
        label: "Output tokens",
        value: turn.tokens_out,
        unit: "COUNT",
        precision: 0,
        fieldPath: `/model_turns/${index}/tokens_out`,
        epistemicType: "MODEL",
        extra,
      }),
      cost: metric(artifact, {
        id: "turn-cost",
        label: "Turn cost",
        value: turn.cost_usd,
        unit: "USD",
        precision: 6,
        fieldPath: `/model_turns/${index}/cost_usd`,
        extra: { ...extra, method: optionalText(turn.cost_source, "turn.cost_source") },
      }),
      latency: metric(artifact, {
        id: "turn-latency",
        label: "Turn latency",
        value: turn.latency_seconds,
        unit: "SECONDS",
        precision: 3,
        fieldPath: `/model_turns/${index}/latency_seconds`,
        extra,
      }),
      responseModel: optionalText(apiEvidence.response_model, "api_evidence.response_model"),
      requestHash: optionalText(apiEvidence.request_sha256, "api_evidence.request_sha256"),
      responseHash: optionalText(
        apiEvidence.raw_response_sha256,
        "api_evidence.raw_response_sha256",
      ),
    };
  });
  const verification = object(root.verification, "verification");
  const checksValue = object(verification.checks, "verification.checks");
  const verificationChecks = Object.fromEntries(
    Object.entries(checksValue).map(([name, result]) => [name, boolean(result, `checks.${name}`)]),
  );
  return {
    binding: artifact,
    runId,
    taskId: text(run.task_id, "run.task_id"),
    taskClass: text(root.task_class, "task_class"),
    taskHash: text(run.task_hash, "run.task_hash"),
    worldHash,
    model: text(identity.model, "run.model_identity.model"),
    modelIdentityHash: text(run.model_identity_hash, "run.model_identity_hash"),
    seed,
    hypothesis,
    acceptanceCriteria,
    actions,
    turns,
    decision: decision(run.decision, "run.decision"),
    verificationChecks,
    verifiedResearchSuccess: boolean(
      verification.verified_research_success,
      "verification.verified_research_success",
    ),
    usage: runUsage(artifact, run.usage, "/run/usage", runId, worldHash, seed),
    redactions: list(root.redactions, "redactions").map((entry, index) =>
      text(entry, `redactions[${index}]`),
    ),
  };
}

const CHECKPOINT_LABELS: Record<string, string> = {
  L0_ANALYTICAL: "Mathematical",
  L1_VECTORBT: "Vectorized",
  L2_NAUTILUS: "Event replay",
  L3_FEES_SLIPPAGE: "Costs",
  L3_LATENCY: "Latency",
  L4_COUNTERFACTUAL_STRESS: "Stress",
};

export function adaptReality(value: unknown): RealityDetail {
  const root = projection(value);
  const artifact = binding(root);
  const aggregate = object(root.aggregate, "aggregate");
  const checkpoints = list(aggregate.checkpoints, "aggregate.checkpoints").map(
    (entry, index): RealityCheckpoint => {
      const checkpoint = object(entry, `aggregate.checkpoints[${index}]`);
      const id = text(checkpoint.checkpoint, `aggregate.checkpoints[${index}].checkpoint`);
      const realityLevel = text(
        checkpoint.reality_level,
        `aggregate.checkpoints[${index}].reality_level`,
      );
      const engine = text(checkpoint.engine, `aggregate.checkpoints[${index}].engine`);
      const values = object(checkpoint.metrics, `aggregate.checkpoints[${index}].metrics`);
      const epistemicType: EpistemicType = realityLevel.includes("COUNTERFACTUAL")
        ? "COUNTERFACTUAL"
        : "COMPUTED";
      const extra = { engine, method: realityLevel };
      const path = `/aggregate/checkpoints/${index}`;
      return {
        id,
        label: CHECKPOINT_LABELS[id] ?? id,
        realityLevel,
        engine,
        sharpe: metric(artifact, {
          id: `${id}-sharpe`,
          label: "Sharpe",
          value: values.sharpe,
          unit: "NUMBER",
          precision: 4,
          fieldPath: `${path}/metrics/sharpe`,
          epistemicType,
          extra,
        }),
        maxDrawdown: metric(artifact, {
          id: `${id}-drawdown`,
          label: "Max drawdown",
          value: values.max_drawdown,
          unit: "RATIO",
          precision: 4,
          fieldPath: `${path}/metrics/max_drawdown`,
          epistemicType,
          extra,
        }),
        slippage: metric(artifact, {
          id: `${id}-slippage`,
          label: "Slippage",
          value: values.slippage,
          unit: "USD",
          precision: 2,
          fieldPath: `${path}/metrics/slippage`,
          epistemicType,
          extra,
        }),
        latencyCost: metric(artifact, {
          id: `${id}-latency-cost`,
          label: "Latency cost",
          value: values.latency_cost,
          unit: "USD",
          precision: 2,
          fieldPath: `${path}/metrics/latency_cost`,
          epistemicType,
          extra,
        }),
        runtime: metric(artifact, {
          id: `${id}-runtime`,
          label: "Runtime",
          value: checkpoint.runtime_seconds_total,
          unit: "SECONDS",
          precision: 4,
          fieldPath: `${path}/runtime_seconds_total`,
          epistemicType,
          extra,
        }),
      };
    },
  );
  const largest = object(aggregate.largest_degradation, "aggregate.largest_degradation");
  const bindings = object(root.bindings, "bindings");
  return {
    binding: artifact,
    primaryMetric: text(root.primary_metric, "primary_metric"),
    checkpoints,
    alphaSurvival: metric(artifact, {
      id: "alpha-survival",
      label: "Alpha survival",
      value: number(aggregate.alpha_survival_ratio, "aggregate.alpha_survival_ratio") * 100,
      unit: "PERCENT",
      precision: 1,
      fieldPath: "/aggregate/alpha_survival_ratio",
      epistemicType: "COUNTERFACTUAL",
    }),
    finding: text(aggregate.finding, "aggregate.finding"),
    largestDegradation: {
      component: text(largest.component, "largest_degradation.component"),
      label: text(largest.label, "largest_degradation.label"),
      change: metric(artifact, {
        id: "largest-degradation",
        label: "Sharpe change",
        value: largest.sharpe_change,
        unit: "NUMBER",
        precision: 4,
        fieldPath: "/aggregate/largest_degradation/sharpe_change",
        epistemicType: "COUNTERFACTUAL",
      }),
    },
    certificationArtifactHash: optionalText(
      bindings.certification_artifact_hash,
      "bindings.certification_artifact_hash",
    ),
  };
}

export function adaptWorldIndex(value: unknown): WorldIndex {
  const root = projection(value);
  const artifact: ArtifactBinding = {
    artifactId: text(root.artifact_id, "artifact_id"),
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    sourceSchemaVersion: text(root.source_schema_version, "source_schema_version"),
    integrityStatus: "MANIFEST_MATCH",
  };
  return {
    binding: artifact,
    items: list(root.items, "world items").map((entry, index) => {
      const item = object(entry, `world items[${index}]`);
      return {
        worldHash: text(item.world_hash, `world items[${index}].world_hash`),
        manifestAvailable: boolean(
          item.manifest_available,
          `world items[${index}].manifest_available`,
        ),
        references: list(item.references, `world items[${index}].references`).map(
          (reference, referenceIndex) => {
            const ref = object(reference, `world reference ${referenceIndex}`);
            return {
              runId: text(ref.run_id, "world reference run_id"),
              taskId: text(ref.task_id, "world reference task_id"),
              seed: number(ref.seed, "world reference seed"),
            };
          },
        ),
      };
    }),
  };
}

export function adaptArtifactIndex(value: unknown): ArtifactIndex {
  const root = projection(value);
  return {
    items: list(root.items, "artifact items").map((entry, index) => {
      const item = object(entry, `artifact items[${index}]`);
      const itemBinding: ArtifactBinding = {
        artifactId: text(item.artifact_id, "artifact_id"),
        artifactHash: text(item.artifact_hash, "artifact_hash"),
        sourceSchemaVersion: text(item.source_schema_version, "source_schema_version"),
        integrityStatus: text(item.integrity_status, "integrity_status"),
      };
      return {
        binding: itemBinding,
        kind: text(item.kind, "artifact kind"),
        sourceFileCount: metric(itemBinding, {
          id: "source-files",
          label: "Source files",
          value: item.source_file_count,
          unit: "COUNT",
          precision: 0,
          fieldPath: `/items/${index}/source_file_count`,
        }),
      };
    }),
  };
}
