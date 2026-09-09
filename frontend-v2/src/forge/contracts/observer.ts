export const OBSERVER_PROJECTION_SCHEMA = "forge-observer-projection/1";
export const DEFAULT_BASELINE_ID = "forge-v0.2.5";
export const DEFAULT_REALITY_ID = "forge-v0.2.4.1";

export type EpistemicType =
  "HISTORICAL" | "COMPUTED" | "MODEL" | "FORECAST" | "COUNTERFACTUAL" | "SIMULATED" | "UNAVAILABLE";

export type Provenance = Readonly<{
  epistemicType: EpistemicType;
  source: string;
  fieldPath: string;
  artifactId: string;
  artifactHash: string;
  sourceSchemaVersion: string;
  asOf: string | null;
  observedAt?: string | null;
  worldHash?: string | null;
  runHash?: string | null;
  seed?: number | null;
  evidenceHash?: string | null;
  engine?: string | null;
  certificationLevel?: string | null;
  method?: string | null;
}>;

export type ResearchMetric = Readonly<{
  id: string;
  label: string;
  value: number;
  unit: "PERCENT" | "USD" | "SECONDS" | "COUNT" | "RATIO" | "NUMBER";
  precision: number;
  provenance: Provenance;
}>;

export type ArtifactBinding = Readonly<{
  artifactId: string;
  artifactHash: string;
  sourceSchemaVersion: string;
  integrityStatus: string;
}>;

export type BaselineModel = Readonly<{
  id: string;
  label: string;
  provider: string;
  episodes: ResearchMetric;
  verifiedResearch: ResearchMetric;
  falseAlpha: ResearchMetric;
  criticalFailures: ResearchMetric;
  costPerVerifiedFinding: ResearchMetric;
  latency: ResearchMetric;
  toolCalls: ResearchMetric;
  engineRuns: ResearchMetric;
}>;

export type BaselineDetail = Readonly<{
  binding: ArtifactBinding;
  tag: string;
  createdAt: string;
  models: readonly BaselineModel[];
  overall: Readonly<{
    verifiedResearch: ResearchMetric;
    falseAlpha: ResearchMetric;
    episodes: ResearchMetric;
    costPerVerifiedFinding: ResearchMetric;
  }>;
  attempts: ResearchMetric;
  excludedAttempts: ResearchMetric;
  allAttemptCost: ResearchMetric;
  admittedCost: ResearchMetric;
  suiteHash: string;
  certificationArtifactHash: string;
  realityLadderArtifactHash: string;
}>;

export type BaselineIndexItem = Readonly<{
  binding: ArtifactBinding;
  tag: string;
  createdAt: string;
  episodes: number;
  attempts: number;
  excludedAttempts: number;
  models: readonly string[];
}>;

export type RunSummary = Readonly<{
  runId: string;
  taskId: string;
  worldHash: string;
  model: string;
  modelVersion: string;
  seed: number;
  completed: boolean;
  failureReason: string | null;
  decision: Readonly<{ verdict: string; reason: string }> | null;
  verifiedResearchSuccess: boolean;
  criticalGateFailure: boolean;
  usage: Readonly<{
    toolCalls: ResearchMetric;
    engineRuns: ResearchMetric;
    tokens: ResearchMetric;
    cost: ResearchMetric;
    wallSeconds: ResearchMetric;
  }>;
}>;

export type RunIndex = Readonly<{
  binding: ArtifactBinding;
  items: readonly RunSummary[];
  matched: number;
}>;

export type RunAction = Readonly<{
  sequence: number;
  tool: string;
  status: string;
  engineRun: boolean;
  highFidelityRun: boolean;
  resultHash: string;
  evidenceHash: string | null;
  stage: string | null;
  engine: string | null;
  certificationLevel: string | null;
  metrics: readonly ResearchMetric[];
}>;

export type RunTurn = Readonly<{
  sequence: number;
  text: string;
  inputTokens: ResearchMetric;
  outputTokens: ResearchMetric;
  cost: ResearchMetric;
  latency: ResearchMetric;
  responseModel: string | null;
  requestHash: string | null;
  responseHash: string | null;
}>;

export type RunDetail = Readonly<{
  binding: ArtifactBinding;
  runId: string;
  taskId: string;
  taskHash: string;
  worldHash: string;
  model: string;
  modelIdentityHash: string;
  seed: number;
  hypothesis: string | null;
  acceptanceCriteria: string | null;
  actions: readonly RunAction[];
  turns: readonly RunTurn[];
  decision: Readonly<{ verdict: string; reason: string }> | null;
  verificationChecks: Readonly<Record<string, boolean>>;
  verifiedResearchSuccess: boolean;
  usage: RunSummary["usage"];
  redactions: readonly string[];
}>;

export type RealityCheckpoint = Readonly<{
  id: string;
  label: string;
  realityLevel: string;
  engine: string;
  sharpe: ResearchMetric;
  maxDrawdown: ResearchMetric;
  slippage: ResearchMetric;
  latencyCost: ResearchMetric;
  runtime: ResearchMetric;
}>;

export type RealityDetail = Readonly<{
  binding: ArtifactBinding;
  primaryMetric: string;
  checkpoints: readonly RealityCheckpoint[];
  alphaSurvival: ResearchMetric;
  finding: string;
  largestDegradation: Readonly<{
    component: string;
    label: string;
    change: ResearchMetric;
  }>;
  certificationArtifactHash: string | null;
}>;

export type WorldReference = Readonly<{
  worldHash: string;
  manifestAvailable: boolean;
  references: readonly Readonly<{ runId: string; taskId: string; seed: number }>[];
}>;

export type WorldIndex = Readonly<{
  binding: ArtifactBinding;
  items: readonly WorldReference[];
}>;

export type ArtifactIndexItem = Readonly<{
  binding: ArtifactBinding;
  kind: string;
  sourceFileCount: ResearchMetric;
}>;

export type ArtifactIndex = Readonly<{ items: readonly ArtifactIndexItem[] }>;

export class ForgeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForgeContractError";
  }
}
