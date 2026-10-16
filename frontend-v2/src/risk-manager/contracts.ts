import { PINNED_POLICY, PINNED_CUTOFF, REPLAY_BINDINGS, FILE_BINDINGS } from "./bindings.ts";
import { assertDerivedPayload } from "../replay/contracts.ts";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Category = "PORTFOLIO" | "MODEL" | "DATA" | "RESEARCH_HYGIENE" | "SIMULATOR" | "SYSTEM";
export type Ref = {
  type: "REPLAY_ARTIFACT" | "FROZEN_FILE" | "RISK_OBSERVATION" | "POLICY_ASSERTION";
  artifact_id?: string;
  kind?: string;
  sha256?: string;
  bytes?: number;
  as_of?: string;
  available_at?: string;
  selector_id?: string;
  source_ids?: string[];
  run_id?: string | null;
  path_id?: string;
  assertion_id?: string;
  commit?: string;
  observation_id?: string;
  sweep_fingerprint?: string;
  policy_sha256?: string;
  check_id?: string;
};
export type Scope = {
  kind: string;
  subject_id: string;
  evidence_family: string;
  stable_scope_key: string;
};
export type Remediation = {
  state: string;
  requirement_code: string;
  text: string;
  evidence_required: string[];
};
export type Origin = {
  id: string;
  source: string;
  kind: string;
  severity: Severity;
  status: string;
  reason: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  occurrences: number;
  evidence: string[];
};
export type Issue = {
  schema_version: "risk-issue/1";
  issue_id: string;
  rule_id: string;
  rule_version: number;
  category: Category;
  severity: Severity;
  status: "OPEN" | "RESOLVED";
  currency: string;
  availability: string;
  evidence_class: string;
  scope: Scope;
  country: string;
  asset: string | null;
  model: string | null;
  title: string;
  reason_code: string;
  reason: string;
  first_seen_at: string;
  first_seen_ref: Ref;
  evidence_at: string | null;
  evidence_cutoff: string;
  resolved_at: string | null;
  resolution_ref: Ref | null;
  occurrences: number;
  observation_ids: string[];
  evidence_refs: Ref[];
  remediation: Remediation;
  source_quality: {
    clock_quality: string;
    lineage_status: string;
    permission_status: string;
    limitation_codes: string[];
  };
  claim_flags: Record<string, false>;
  origin_records: Origin[];
  last_observation_id: string;
  policy_sha256: string;
};
export type Coverage = {
  schema_version: "risk-coverage/1";
  check_id: string;
  category: Category;
  scope: Scope;
  availability: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  outcome: "CLEAR" | "FINDING" | "NOT_EVALUATED";
  reason_code: string | null;
  reason: string;
  evidence_class: string;
  evaluated_at: string;
  evidence_at: string | null;
  evidence_refs: Ref[];
  remediation: Remediation;
};
export type Rule = {
  rule_id: string;
  rule_version: number;
  category: Category;
  check_id: string;
  reason_codes: string[];
  severity: Severity;
  predicate: string;
  unit: string;
  input_selectors: string[];
  inherited_policy: string | null;
  remediation: string;
  limitations: string;
};
export type CountRow = { partition: string; category: Category; severity: Severity; count: number };
export type State = {
  schema_version: "risk-state/1";
  kind: "risk-state";
  input_hash: string;
  evidence_cutoff: string;
  published_at: string;
  scope: string;
  sources: string[];
  licence: Record<string, unknown>;
  claim_flags: Record<string, false>;
  payload: {
    state_id: string;
    sweep_fingerprint: string;
    evaluation_cutoff: string;
    policy: { schema_version: string; version: string; sha256: string; rules: Rule[] };
    issues: Issue[];
    coverage: Coverage[];
    counts: CountRow[];
    evidence_index: Ref[];
    historical_origin_counts: CountRow[];
    prior_state_ref: string | null;
  };
};
export type Observation = Omit<
  Issue,
  | "schema_version"
  | "status"
  | "first_seen_at"
  | "first_seen_ref"
  | "resolved_at"
  | "resolution_ref"
  | "occurrences"
  | "observation_ids"
  | "claim_flags"
  | "last_observation_id"
  | "reason_code"
> & {
  schema_version: "risk-observation/1";
  observation_id: string;
  fingerprint: string;
  witnessed_at: string;
  previous_observation_id: string | null;
  outcome: Coverage["outcome"];
  reason_code: string | null;
  assertions: unknown[];
};
export type Transition = {
  issue_id: string;
  transition: string;
  observation_id: string;
  previous_observation_id: string | null;
  at: string;
};
export type Sweep = {
  schema_version: "risk-sweep/1";
  kind: "risk-sweep";
  input_hash: string;
  evidence_cutoff: string;
  published_at: string;
  scope: string;
  sources: string[];
  licence: Record<string, unknown>;
  claim_flags: Record<string, false>;
  payload: {
    sweep_id: string;
    fingerprint: string;
    status: "SUCCEEDED" | "PARTIAL" | "FAILED";
    state_ref: string | null;
    prior_sweep_ref: string | null;
    started_at: string;
    completed_at: string;
    published_at: string;
    evaluation_cutoff: string;
    inputs: { input_id: string; sha256: string; bytes: number }[];
    evaluator_source_hash: string;
    policy_sha256: string;
    observations: Observation[];
    transitions: Transition[];
    transition_counts: { new: number; updated: number; unchanged: number; resolved: number };
    operation_proofs: Record<string, string | number | null>;
    history_index: {
      sweep_id: string;
      sweep_ref: string;
      state_ref: string | null;
      published_at: string;
      status: string;
    }[];
    failure: {
      reason_code: string;
      subsystem: string;
      issue: Issue;
      last_valid_state_ref: string | null;
      attempt_id: string;
    } | null;
  };
};
type Schema = {
  $ref?: string;
  $defs?: Record<string, Schema>;
  const?: unknown;
  enum?: unknown[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
};
const SCHEMAS = {
  "risk-state": {
    $defs: {
      ClaimFlags: {
        additionalProperties: false,
        properties: {
          inference_certified: { const: false, title: "Inference Certified", type: "boolean" },
          market_claim_eligible: { const: false, title: "Market Claim Eligible", type: "boolean" },
          causal_claim_eligible: { const: false, title: "Causal Claim Eligible", type: "boolean" },
          validated_alpha: { const: false, title: "Validated Alpha", type: "boolean" },
          trusted_graph: { const: false, title: "Trusted Graph", type: "boolean" },
          precise_edge_confidence: {
            const: false,
            title: "Precise Edge Confidence",
            type: "boolean",
          },
        },
        required: [
          "inference_certified",
          "market_claim_eligible",
          "causal_claim_eligible",
          "validated_alpha",
          "trusted_graph",
          "precise_edge_confidence",
        ],
        title: "ClaimFlags",
        type: "object",
      },
      CountRow: {
        additionalProperties: false,
        properties: {
          partition: {
            enum: ["CURRENT_REAL", "HISTORICAL", "UNAVAILABLE", "SYNTHETIC", "RESOLVED"],
            title: "Partition",
            type: "string",
          },
          category: {
            enum: ["PORTFOLIO", "MODEL", "DATA", "RESEARCH_HYGIENE", "SIMULATOR", "SYSTEM"],
            title: "Category",
            type: "string",
          },
          severity: {
            enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
            title: "Severity",
            type: "string",
          },
          count: { maximum: 9007199254740991, minimum: 0, title: "Count", type: "integer" },
        },
        required: ["partition", "category", "severity", "count"],
        title: "CountRow",
        type: "object",
      },
      Coverage: {
        additionalProperties: false,
        properties: {
          schema_version: { const: "risk-coverage/1", title: "Schema Version", type: "string" },
          check_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Check Id",
            type: "string",
          },
          category: {
            enum: ["PORTFOLIO", "MODEL", "DATA", "RESEARCH_HYGIENE", "SIMULATOR", "SYSTEM"],
            title: "Category",
            type: "string",
          },
          scope: { $ref: "#/$defs/Scope" },
          availability: {
            enum: ["AVAILABLE", "PARTIAL", "UNAVAILABLE"],
            title: "Availability",
            type: "string",
          },
          outcome: {
            enum: ["CLEAR", "FINDING", "NOT_EVALUATED"],
            title: "Outcome",
            type: "string",
          },
          reason_code: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Reason Code",
          },
          reason: { maxLength: 600, minLength: 1, title: "Reason", type: "string" },
          evidence_class: {
            enum: [
              "REAL_RETAINED",
              "LOCAL_REAL",
              "LOCAL_PAPER_BOOK",
              "LOCAL_MODEL_ESTIMATE",
              "EXAMPLE_PORTFOLIO",
              "RETAINED_SYNTHETIC",
              "SYNTHETIC_TEST_ONLY",
              "UNAVAILABLE",
            ],
            title: "Evidence Class",
            type: "string",
          },
          evaluated_at: { title: "Evaluated At", type: "string" },
          evidence_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "Evidence At" },
          evidence_refs: {
            items: {
              discriminator: {
                mapping: {
                  FROZEN_FILE: "#/$defs/FileRef",
                  POLICY_ASSERTION: "#/$defs/PolicyRef",
                  REPLAY_ARTIFACT: "#/$defs/ReplayRef",
                  RISK_OBSERVATION: "#/$defs/ObservationRef",
                },
                propertyName: "type",
              },
              oneOf: [
                { $ref: "#/$defs/ReplayRef" },
                { $ref: "#/$defs/FileRef" },
                { $ref: "#/$defs/ObservationRef" },
                { $ref: "#/$defs/PolicyRef" },
              ],
            },
            maxItems: 30,
            minItems: 1,
            title: "Evidence Refs",
            type: "array",
          },
          remediation: { $ref: "#/$defs/Remediation" },
        },
        required: [
          "schema_version",
          "check_id",
          "category",
          "scope",
          "availability",
          "outcome",
          "reason_code",
          "reason",
          "evidence_class",
          "evaluated_at",
          "evidence_at",
          "evidence_refs",
          "remediation",
        ],
        title: "Coverage",
        type: "object",
      },
      FileRef: {
        additionalProperties: false,
        properties: {
          type: { const: "FROZEN_FILE", title: "Type", type: "string" },
          commit: {
            const: "16db82c5f2f50b98253df9989c586cd45aa98f6b",
            title: "Commit",
            type: "string",
          },
          path_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Path Id",
            type: "string",
          },
          sha256: { pattern: "^[a-f0-9]{64}$", title: "Sha256", type: "string" },
          bytes: { maximum: 9007199254740991, minimum: 0, title: "Bytes", type: "integer" },
          selector_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Selector Id",
            type: "string",
          },
          assertion_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Assertion Id",
            type: "string",
          },
        },
        required: ["type", "commit", "path_id", "sha256", "bytes", "selector_id", "assertion_id"],
        title: "FileRef",
        type: "object",
      },
      Issue: {
        additionalProperties: false,
        properties: {
          schema_version: { const: "risk-issue/1", title: "Schema Version", type: "string" },
          issue_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Issue Id",
            type: "string",
          },
          rule_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Rule Id",
            type: "string",
          },
          rule_version: { const: 1, title: "Rule Version", type: "integer" },
          category: {
            enum: ["PORTFOLIO", "MODEL", "DATA", "RESEARCH_HYGIENE", "SIMULATOR", "SYSTEM"],
            title: "Category",
            type: "string",
          },
          severity: {
            enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
            title: "Severity",
            type: "string",
          },
          status: { enum: ["OPEN", "RESOLVED"], title: "Status", type: "string" },
          currency: {
            enum: ["CURRENT", "HISTORICAL_ONLY", "UNCONFIRMED"],
            title: "Currency",
            type: "string",
          },
          availability: {
            enum: ["AVAILABLE", "PARTIAL", "UNAVAILABLE"],
            title: "Availability",
            type: "string",
          },
          evidence_class: {
            enum: [
              "REAL_RETAINED",
              "LOCAL_REAL",
              "LOCAL_PAPER_BOOK",
              "LOCAL_MODEL_ESTIMATE",
              "EXAMPLE_PORTFOLIO",
              "RETAINED_SYNTHETIC",
              "SYNTHETIC_TEST_ONLY",
              "UNAVAILABLE",
            ],
            title: "Evidence Class",
            type: "string",
          },
          scope: { $ref: "#/$defs/Scope" },
          country: {
            enum: ["US", "INDIA", "CROSS_MARKET", "NONE"],
            title: "Country",
            type: "string",
          },
          asset: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Asset",
          },
          model: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Model",
          },
          title: { maxLength: 120, minLength: 1, title: "Title", type: "string" },
          reason_code: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Reason Code",
            type: "string",
          },
          reason: { maxLength: 600, minLength: 1, title: "Reason", type: "string" },
          first_seen_at: { title: "First Seen At", type: "string" },
          first_seen_ref: { $ref: "#/$defs/ObservationRef" },
          evidence_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "Evidence At" },
          evidence_cutoff: { title: "Evidence Cutoff", type: "string" },
          resolved_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "Resolved At" },
          resolution_ref: { anyOf: [{ $ref: "#/$defs/ObservationRef" }, { type: "null" }] },
          occurrences: {
            maximum: 9007199254740991,
            minimum: 1,
            title: "Occurrences",
            type: "integer",
          },
          observation_ids: {
            items: { pattern: "^[a-f0-9]{64}$", type: "string" },
            maxItems: 100,
            minItems: 1,
            title: "Observation Ids",
            type: "array",
          },
          evidence_refs: {
            items: {
              discriminator: {
                mapping: {
                  FROZEN_FILE: "#/$defs/FileRef",
                  POLICY_ASSERTION: "#/$defs/PolicyRef",
                  REPLAY_ARTIFACT: "#/$defs/ReplayRef",
                  RISK_OBSERVATION: "#/$defs/ObservationRef",
                },
                propertyName: "type",
              },
              oneOf: [
                { $ref: "#/$defs/ReplayRef" },
                { $ref: "#/$defs/FileRef" },
                { $ref: "#/$defs/ObservationRef" },
                { $ref: "#/$defs/PolicyRef" },
              ],
            },
            maxItems: 30,
            minItems: 1,
            title: "Evidence Refs",
            type: "array",
          },
          source_quality: { $ref: "#/$defs/SourceQuality" },
          remediation: { $ref: "#/$defs/Remediation" },
          claim_flags: { $ref: "#/$defs/ClaimFlags" },
          origin_records: {
            items: { $ref: "#/$defs/Origin" },
            maxItems: 100,
            title: "Origin Records",
            type: "array",
          },
          last_observation_id: {
            pattern: "^[a-f0-9]{64}$",
            title: "Last Observation Id",
            type: "string",
          },
          policy_sha256: { pattern: "^[a-f0-9]{64}$", title: "Policy Sha256", type: "string" },
        },
        required: [
          "schema_version",
          "issue_id",
          "rule_id",
          "rule_version",
          "category",
          "severity",
          "status",
          "currency",
          "availability",
          "evidence_class",
          "scope",
          "country",
          "asset",
          "model",
          "title",
          "reason_code",
          "reason",
          "first_seen_at",
          "first_seen_ref",
          "evidence_at",
          "evidence_cutoff",
          "resolved_at",
          "resolution_ref",
          "occurrences",
          "observation_ids",
          "evidence_refs",
          "source_quality",
          "remediation",
          "claim_flags",
          "origin_records",
          "last_observation_id",
          "policy_sha256",
        ],
        title: "Issue",
        type: "object",
      },
      Licence: {
        additionalProperties: false,
        properties: {
          status: { const: "FIRST_PARTY", title: "Status", type: "string" },
          permitted_uses: {
            items: { const: "publish_derived", type: "string" },
            title: "Permitted Uses",
            type: "array",
          },
          dataset_key: {
            const: "project:risk-manager-evidence",
            title: "Dataset Key",
            type: "string",
          },
          valid_through: { title: "Valid Through", type: "null" },
        },
        required: ["status", "permitted_uses", "dataset_key", "valid_through"],
        title: "Licence",
        type: "object",
      },
      ObservationRef: {
        additionalProperties: false,
        properties: {
          type: { const: "RISK_OBSERVATION", title: "Type", type: "string" },
          observation_id: { pattern: "^[a-f0-9]{64}$", title: "Observation Id", type: "string" },
          sweep_fingerprint: {
            pattern: "^[a-f0-9]{64}$",
            title: "Sweep Fingerprint",
            type: "string",
          },
        },
        required: ["type", "observation_id", "sweep_fingerprint"],
        title: "ObservationRef",
        type: "object",
      },
      Origin: {
        additionalProperties: false,
        properties: {
          id: { pattern: "^[a-f0-9]{64}$", title: "Id", type: "string" },
          source: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Source",
            type: "string",
          },
          kind: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Kind",
            type: "string",
          },
          severity: {
            enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
            title: "Severity",
            type: "string",
          },
          status: { enum: ["OPEN", "RESOLVED"], title: "Status", type: "string" },
          reason: { maxLength: 600, minLength: 1, title: "Reason", type: "string" },
          first_seen_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "First Seen At" },
          last_seen_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "Last Seen At" },
          occurrences: {
            maximum: 9007199254740991,
            minimum: 0,
            title: "Occurrences",
            type: "integer",
          },
          evidence: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Evidence",
            type: "array",
          },
        },
        required: [
          "id",
          "source",
          "kind",
          "severity",
          "status",
          "reason",
          "first_seen_at",
          "last_seen_at",
          "occurrences",
          "evidence",
        ],
        title: "Origin",
        type: "object",
      },
      PolicyProjection: {
        additionalProperties: false,
        properties: {
          schema_version: { const: "risk-policy/1", title: "Schema Version", type: "string" },
          version: { const: "0.1", title: "Version", type: "string" },
          sha256: { pattern: "^[a-f0-9]{64}$", title: "Sha256", type: "string" },
          rules: { items: { $ref: "#/$defs/RuleSpec" }, title: "Rules", type: "array" },
        },
        required: ["schema_version", "version", "sha256", "rules"],
        title: "PolicyProjection",
        type: "object",
      },
      PolicyRef: {
        additionalProperties: false,
        properties: {
          type: { const: "POLICY_ASSERTION", title: "Type", type: "string" },
          policy_sha256: { pattern: "^[a-f0-9]{64}$", title: "Policy Sha256", type: "string" },
          check_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Check Id",
            type: "string",
          },
        },
        required: ["type", "policy_sha256", "check_id"],
        title: "PolicyRef",
        type: "object",
      },
      Remediation: {
        additionalProperties: false,
        properties: {
          state: {
            enum: ["REQUIRED", "BLOCKED_EXTERNAL", "DEFERRED", "INFORMATIONAL"],
            title: "State",
            type: "string",
          },
          requirement_code: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Requirement Code",
            type: "string",
          },
          text: { maxLength: 600, minLength: 1, title: "Text", type: "string" },
          evidence_required: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Evidence Required",
            type: "array",
          },
        },
        required: ["state", "requirement_code", "text", "evidence_required"],
        title: "Remediation",
        type: "object",
      },
      ReplayRef: {
        additionalProperties: false,
        properties: {
          type: { const: "REPLAY_ARTIFACT", title: "Type", type: "string" },
          artifact_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Artifact Id",
            type: "string",
          },
          kind: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Kind",
            type: "string",
          },
          sha256: { pattern: "^[a-f0-9]{64}$", title: "Sha256", type: "string" },
          bytes: { maximum: 9007199254740991, minimum: 0, title: "Bytes", type: "integer" },
          as_of: { title: "As Of", type: "string" },
          available_at: { title: "Available At", type: "string" },
          selector_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Selector Id",
            type: "string",
          },
          source_ids: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Source Ids",
            type: "array",
          },
          run_id: {
            anyOf: [{ pattern: "^[a-f0-9]{64}$", type: "string" }, { type: "null" }],
            title: "Run Id",
          },
        },
        required: [
          "type",
          "artifact_id",
          "kind",
          "sha256",
          "bytes",
          "as_of",
          "available_at",
          "selector_id",
          "source_ids",
          "run_id",
        ],
        title: "ReplayRef",
        type: "object",
      },
      RuleSpec: {
        additionalProperties: false,
        properties: {
          rule_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Rule Id",
            type: "string",
          },
          rule_version: { const: 1, title: "Rule Version", type: "integer" },
          category: {
            enum: ["PORTFOLIO", "MODEL", "DATA", "RESEARCH_HYGIENE", "SIMULATOR", "SYSTEM"],
            title: "Category",
            type: "string",
          },
          check_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Check Id",
            type: "string",
          },
          reason_codes: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Reason Codes",
            type: "array",
          },
          severity: {
            enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
            title: "Severity",
            type: "string",
          },
          predicate: { maxLength: 600, minLength: 1, title: "Predicate", type: "string" },
          unit: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Unit",
            type: "string",
          },
          input_selectors: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Input Selectors",
            type: "array",
          },
          inherited_policy: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Inherited Policy",
          },
          remediation: { maxLength: 600, minLength: 1, title: "Remediation", type: "string" },
          limitations: { maxLength: 600, minLength: 1, title: "Limitations", type: "string" },
        },
        required: [
          "rule_id",
          "rule_version",
          "category",
          "check_id",
          "reason_codes",
          "severity",
          "predicate",
          "unit",
          "input_selectors",
          "inherited_policy",
          "remediation",
          "limitations",
        ],
        title: "RuleSpec",
        type: "object",
      },
      Scope: {
        additionalProperties: false,
        properties: {
          kind: {
            enum: [
              "PUBLIC_PLATFORM",
              "MODEL",
              "SOURCE",
              "RESEARCH_FAMILY",
              "PORTFOLIO",
              "SIMULATOR_COMPARISON",
            ],
            title: "Kind",
            type: "string",
          },
          subject_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Subject Id",
            type: "string",
          },
          evidence_family: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Evidence Family",
            type: "string",
          },
          stable_scope_key: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Stable Scope Key",
            type: "string",
          },
        },
        required: ["kind", "subject_id", "evidence_family", "stable_scope_key"],
        title: "Scope",
        type: "object",
      },
      SourceQuality: {
        additionalProperties: false,
        properties: {
          clock_quality: {
            enum: [
              "PUBLICATION_TIMESTAMP",
              "RECEIVE_TIMESTAMP_CAPTURED",
              "CONSERVATIVE_MARKET_TIME",
              "CONSERVATIVE_VINTAGE_DAY",
              "CAPTURE_ONLY",
              "NOT_APPLICABLE",
              "UNAVAILABLE",
            ],
            title: "Clock Quality",
            type: "string",
          },
          lineage_status: {
            enum: ["VERIFIED", "PARTIAL", "UNAVAILABLE", "INVALID"],
            title: "Lineage Status",
            type: "string",
          },
          permission_status: {
            enum: ["DERIVED_ALLOWED", "METADATA_ONLY", "LOCAL_ONLY", "UNAVAILABLE"],
            title: "Permission Status",
            type: "string",
          },
          limitation_codes: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Limitation Codes",
            type: "array",
          },
        },
        required: ["clock_quality", "lineage_status", "permission_status", "limitation_codes"],
        title: "SourceQuality",
        type: "object",
      },
      StatePayload: {
        additionalProperties: false,
        properties: {
          state_id: { pattern: "^[a-f0-9]{64}$", title: "State Id", type: "string" },
          sweep_fingerprint: {
            pattern: "^[a-f0-9]{64}$",
            title: "Sweep Fingerprint",
            type: "string",
          },
          evaluation_cutoff: { title: "Evaluation Cutoff", type: "string" },
          policy: { $ref: "#/$defs/PolicyProjection" },
          issues: {
            items: { $ref: "#/$defs/Issue" },
            maxItems: 1000,
            title: "Issues",
            type: "array",
          },
          coverage: {
            items: { $ref: "#/$defs/Coverage" },
            maxItems: 1000,
            minItems: 1,
            title: "Coverage",
            type: "array",
          },
          counts: { items: { $ref: "#/$defs/CountRow" }, title: "Counts", type: "array" },
          evidence_index: {
            items: {
              discriminator: {
                mapping: {
                  FROZEN_FILE: "#/$defs/FileRef",
                  POLICY_ASSERTION: "#/$defs/PolicyRef",
                  REPLAY_ARTIFACT: "#/$defs/ReplayRef",
                  RISK_OBSERVATION: "#/$defs/ObservationRef",
                },
                propertyName: "type",
              },
              oneOf: [
                { $ref: "#/$defs/ReplayRef" },
                { $ref: "#/$defs/FileRef" },
                { $ref: "#/$defs/ObservationRef" },
                { $ref: "#/$defs/PolicyRef" },
              ],
            },
            title: "Evidence Index",
            type: "array",
          },
          historical_origin_counts: {
            items: { $ref: "#/$defs/CountRow" },
            title: "Historical Origin Counts",
            type: "array",
          },
          prior_state_ref: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Prior State Ref",
          },
        },
        required: [
          "state_id",
          "sweep_fingerprint",
          "evaluation_cutoff",
          "policy",
          "issues",
          "coverage",
          "counts",
          "evidence_index",
          "historical_origin_counts",
          "prior_state_ref",
        ],
        title: "StatePayload",
        type: "object",
      },
    },
    additionalProperties: false,
    properties: {
      schema_version: { const: "risk-state/1", title: "Schema Version", type: "string" },
      kind: { const: "risk-state", title: "Kind", type: "string" },
      input_hash: { pattern: "^[a-f0-9]{64}$", title: "Input Hash", type: "string" },
      evidence_cutoff: { title: "Evidence Cutoff", type: "string" },
      published_at: { title: "Published At", type: "string" },
      scope: { const: "RETAINED_RISK_EVIDENCE", title: "Scope", type: "string" },
      sources: {
        items: { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
        title: "Sources",
        type: "array",
      },
      licence: { $ref: "#/$defs/Licence" },
      claim_flags: { $ref: "#/$defs/ClaimFlags" },
      payload: { $ref: "#/$defs/StatePayload" },
    },
    required: [
      "schema_version",
      "kind",
      "input_hash",
      "evidence_cutoff",
      "published_at",
      "scope",
      "sources",
      "licence",
      "claim_flags",
      "payload",
    ],
    title: "StateEnvelope",
    type: "object",
  },
  "risk-sweep": {
    $defs: {
      Assertion: {
        additionalProperties: false,
        properties: {
          assertion_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Assertion Id",
            type: "string",
          },
          outcome: {
            enum: ["CLEAR", "FINDING", "NOT_EVALUATED"],
            title: "Outcome",
            type: "string",
          },
          unit: {
            enum: [
              "status",
              "boolean",
              "observations",
              "calendar_days",
              "pairs",
              "test_slots",
              "events",
            ],
            title: "Unit",
            type: "string",
          },
          value: {
            anyOf: [
              { type: "string" },
              { type: "boolean" },
              { type: "integer" },
              { type: "number" },
              { type: "null" },
            ],
            title: "Value",
          },
          comparison: {
            enum: ["EXACT", "GT", "LT", "IN", "REQUIRED", "NONE"],
            title: "Comparison",
            type: "string",
          },
          threshold: {
            anyOf: [
              { type: "string" },
              { type: "boolean" },
              { type: "integer" },
              { type: "number" },
              { type: "null" },
            ],
            title: "Threshold",
          },
        },
        required: ["assertion_id", "outcome", "unit", "value", "comparison", "threshold"],
        title: "Assertion",
        type: "object",
      },
      ClaimFlags: {
        additionalProperties: false,
        properties: {
          inference_certified: { const: false, title: "Inference Certified", type: "boolean" },
          market_claim_eligible: { const: false, title: "Market Claim Eligible", type: "boolean" },
          causal_claim_eligible: { const: false, title: "Causal Claim Eligible", type: "boolean" },
          validated_alpha: { const: false, title: "Validated Alpha", type: "boolean" },
          trusted_graph: { const: false, title: "Trusted Graph", type: "boolean" },
          precise_edge_confidence: {
            const: false,
            title: "Precise Edge Confidence",
            type: "boolean",
          },
        },
        required: [
          "inference_certified",
          "market_claim_eligible",
          "causal_claim_eligible",
          "validated_alpha",
          "trusted_graph",
          "precise_edge_confidence",
        ],
        title: "ClaimFlags",
        type: "object",
      },
      Failure: {
        additionalProperties: false,
        properties: {
          reason_code: {
            enum: [
              "REQUIRED_READER_FAILED",
              "RULE_EVALUATION_FAILED",
              "PUBLICATION_FAILED",
              "ARTIFACT_INTEGRITY_BREACH",
              "HISTORY_CHAIN_INVALID",
            ],
            title: "Reason Code",
            type: "string",
          },
          subsystem: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Subsystem",
            type: "string",
          },
          issue: { $ref: "#/$defs/Issue" },
          last_valid_state_ref: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Last Valid State Ref",
          },
          attempt_id: { pattern: "^[a-f0-9]{64}$", title: "Attempt Id", type: "string" },
        },
        required: ["reason_code", "subsystem", "issue", "last_valid_state_ref", "attempt_id"],
        title: "Failure",
        type: "object",
      },
      FileRef: {
        additionalProperties: false,
        properties: {
          type: { const: "FROZEN_FILE", title: "Type", type: "string" },
          commit: {
            const: "16db82c5f2f50b98253df9989c586cd45aa98f6b",
            title: "Commit",
            type: "string",
          },
          path_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Path Id",
            type: "string",
          },
          sha256: { pattern: "^[a-f0-9]{64}$", title: "Sha256", type: "string" },
          bytes: { maximum: 9007199254740991, minimum: 0, title: "Bytes", type: "integer" },
          selector_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Selector Id",
            type: "string",
          },
          assertion_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Assertion Id",
            type: "string",
          },
        },
        required: ["type", "commit", "path_id", "sha256", "bytes", "selector_id", "assertion_id"],
        title: "FileRef",
        type: "object",
      },
      HistoryEntry: {
        additionalProperties: false,
        properties: {
          sweep_id: { pattern: "^[a-f0-9]{64}$", title: "Sweep Id", type: "string" },
          sweep_ref: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Sweep Ref",
            type: "string",
          },
          state_ref: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "State Ref",
          },
          published_at: { title: "Published At", type: "string" },
          status: { enum: ["SUCCEEDED", "PARTIAL", "FAILED"], title: "Status", type: "string" },
        },
        required: ["sweep_id", "sweep_ref", "state_ref", "published_at", "status"],
        title: "HistoryEntry",
        type: "object",
      },
      Input: {
        additionalProperties: false,
        properties: {
          input_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Input Id",
            type: "string",
          },
          sha256: { pattern: "^[a-f0-9]{64}$", title: "Sha256", type: "string" },
          bytes: { maximum: 9007199254740991, minimum: 0, title: "Bytes", type: "integer" },
        },
        required: ["input_id", "sha256", "bytes"],
        title: "Input",
        type: "object",
      },
      Issue: {
        additionalProperties: false,
        properties: {
          schema_version: { const: "risk-issue/1", title: "Schema Version", type: "string" },
          issue_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Issue Id",
            type: "string",
          },
          rule_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Rule Id",
            type: "string",
          },
          rule_version: { const: 1, title: "Rule Version", type: "integer" },
          category: {
            enum: ["PORTFOLIO", "MODEL", "DATA", "RESEARCH_HYGIENE", "SIMULATOR", "SYSTEM"],
            title: "Category",
            type: "string",
          },
          severity: {
            enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
            title: "Severity",
            type: "string",
          },
          status: { enum: ["OPEN", "RESOLVED"], title: "Status", type: "string" },
          currency: {
            enum: ["CURRENT", "HISTORICAL_ONLY", "UNCONFIRMED"],
            title: "Currency",
            type: "string",
          },
          availability: {
            enum: ["AVAILABLE", "PARTIAL", "UNAVAILABLE"],
            title: "Availability",
            type: "string",
          },
          evidence_class: {
            enum: [
              "REAL_RETAINED",
              "LOCAL_REAL",
              "LOCAL_PAPER_BOOK",
              "LOCAL_MODEL_ESTIMATE",
              "EXAMPLE_PORTFOLIO",
              "RETAINED_SYNTHETIC",
              "SYNTHETIC_TEST_ONLY",
              "UNAVAILABLE",
            ],
            title: "Evidence Class",
            type: "string",
          },
          scope: { $ref: "#/$defs/Scope" },
          country: {
            enum: ["US", "INDIA", "CROSS_MARKET", "NONE"],
            title: "Country",
            type: "string",
          },
          asset: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Asset",
          },
          model: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Model",
          },
          title: { maxLength: 120, minLength: 1, title: "Title", type: "string" },
          reason_code: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Reason Code",
            type: "string",
          },
          reason: { maxLength: 600, minLength: 1, title: "Reason", type: "string" },
          first_seen_at: { title: "First Seen At", type: "string" },
          first_seen_ref: { $ref: "#/$defs/ObservationRef" },
          evidence_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "Evidence At" },
          evidence_cutoff: { title: "Evidence Cutoff", type: "string" },
          resolved_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "Resolved At" },
          resolution_ref: { anyOf: [{ $ref: "#/$defs/ObservationRef" }, { type: "null" }] },
          occurrences: {
            maximum: 9007199254740991,
            minimum: 1,
            title: "Occurrences",
            type: "integer",
          },
          observation_ids: {
            items: { pattern: "^[a-f0-9]{64}$", type: "string" },
            maxItems: 100,
            minItems: 1,
            title: "Observation Ids",
            type: "array",
          },
          evidence_refs: {
            items: {
              discriminator: {
                mapping: {
                  FROZEN_FILE: "#/$defs/FileRef",
                  POLICY_ASSERTION: "#/$defs/PolicyRef",
                  REPLAY_ARTIFACT: "#/$defs/ReplayRef",
                  RISK_OBSERVATION: "#/$defs/ObservationRef",
                },
                propertyName: "type",
              },
              oneOf: [
                { $ref: "#/$defs/ReplayRef" },
                { $ref: "#/$defs/FileRef" },
                { $ref: "#/$defs/ObservationRef" },
                { $ref: "#/$defs/PolicyRef" },
              ],
            },
            maxItems: 30,
            minItems: 1,
            title: "Evidence Refs",
            type: "array",
          },
          source_quality: { $ref: "#/$defs/SourceQuality" },
          remediation: { $ref: "#/$defs/Remediation" },
          claim_flags: { $ref: "#/$defs/ClaimFlags" },
          origin_records: {
            items: { $ref: "#/$defs/Origin" },
            maxItems: 100,
            title: "Origin Records",
            type: "array",
          },
          last_observation_id: {
            pattern: "^[a-f0-9]{64}$",
            title: "Last Observation Id",
            type: "string",
          },
          policy_sha256: { pattern: "^[a-f0-9]{64}$", title: "Policy Sha256", type: "string" },
        },
        required: [
          "schema_version",
          "issue_id",
          "rule_id",
          "rule_version",
          "category",
          "severity",
          "status",
          "currency",
          "availability",
          "evidence_class",
          "scope",
          "country",
          "asset",
          "model",
          "title",
          "reason_code",
          "reason",
          "first_seen_at",
          "first_seen_ref",
          "evidence_at",
          "evidence_cutoff",
          "resolved_at",
          "resolution_ref",
          "occurrences",
          "observation_ids",
          "evidence_refs",
          "source_quality",
          "remediation",
          "claim_flags",
          "origin_records",
          "last_observation_id",
          "policy_sha256",
        ],
        title: "Issue",
        type: "object",
      },
      Licence: {
        additionalProperties: false,
        properties: {
          status: { const: "FIRST_PARTY", title: "Status", type: "string" },
          permitted_uses: {
            items: { const: "publish_derived", type: "string" },
            title: "Permitted Uses",
            type: "array",
          },
          dataset_key: {
            const: "project:risk-manager-evidence",
            title: "Dataset Key",
            type: "string",
          },
          valid_through: { title: "Valid Through", type: "null" },
        },
        required: ["status", "permitted_uses", "dataset_key", "valid_through"],
        title: "Licence",
        type: "object",
      },
      Observation: {
        additionalProperties: false,
        properties: {
          schema_version: { const: "risk-observation/1", title: "Schema Version", type: "string" },
          observation_id: { pattern: "^[a-f0-9]{64}$", title: "Observation Id", type: "string" },
          issue_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Issue Id",
            type: "string",
          },
          rule_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Rule Id",
            type: "string",
          },
          rule_version: { const: 1, title: "Rule Version", type: "integer" },
          category: {
            enum: ["PORTFOLIO", "MODEL", "DATA", "RESEARCH_HYGIENE", "SIMULATOR", "SYSTEM"],
            title: "Category",
            type: "string",
          },
          severity: {
            enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
            title: "Severity",
            type: "string",
          },
          scope: { $ref: "#/$defs/Scope" },
          country: {
            enum: ["US", "INDIA", "CROSS_MARKET", "NONE"],
            title: "Country",
            type: "string",
          },
          asset: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Asset",
          },
          model: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Model",
          },
          title: { maxLength: 120, minLength: 1, title: "Title", type: "string" },
          reason_code: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Reason Code",
          },
          reason: { maxLength: 600, minLength: 1, title: "Reason", type: "string" },
          outcome: {
            enum: ["CLEAR", "FINDING", "NOT_EVALUATED"],
            title: "Outcome",
            type: "string",
          },
          currency: {
            enum: ["CURRENT", "HISTORICAL_ONLY", "UNCONFIRMED"],
            title: "Currency",
            type: "string",
          },
          availability: {
            enum: ["AVAILABLE", "PARTIAL", "UNAVAILABLE"],
            title: "Availability",
            type: "string",
          },
          evidence_class: {
            enum: [
              "REAL_RETAINED",
              "LOCAL_REAL",
              "LOCAL_PAPER_BOOK",
              "LOCAL_MODEL_ESTIMATE",
              "EXAMPLE_PORTFOLIO",
              "RETAINED_SYNTHETIC",
              "SYNTHETIC_TEST_ONLY",
              "UNAVAILABLE",
            ],
            title: "Evidence Class",
            type: "string",
          },
          evidence_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "Evidence At" },
          evidence_cutoff: { title: "Evidence Cutoff", type: "string" },
          witnessed_at: { title: "Witnessed At", type: "string" },
          policy_sha256: { pattern: "^[a-f0-9]{64}$", title: "Policy Sha256", type: "string" },
          fingerprint: { pattern: "^[a-f0-9]{64}$", title: "Fingerprint", type: "string" },
          previous_observation_id: {
            anyOf: [{ pattern: "^[a-f0-9]{64}$", type: "string" }, { type: "null" }],
            title: "Previous Observation Id",
          },
          evidence_refs: {
            items: {
              discriminator: {
                mapping: {
                  FROZEN_FILE: "#/$defs/FileRef",
                  POLICY_ASSERTION: "#/$defs/PolicyRef",
                  REPLAY_ARTIFACT: "#/$defs/ReplayRef",
                  RISK_OBSERVATION: "#/$defs/ObservationRef",
                },
                propertyName: "type",
              },
              oneOf: [
                { $ref: "#/$defs/ReplayRef" },
                { $ref: "#/$defs/FileRef" },
                { $ref: "#/$defs/ObservationRef" },
                { $ref: "#/$defs/PolicyRef" },
              ],
            },
            maxItems: 30,
            minItems: 1,
            title: "Evidence Refs",
            type: "array",
          },
          source_quality: { $ref: "#/$defs/SourceQuality" },
          remediation: { $ref: "#/$defs/Remediation" },
          origin_records: {
            items: { $ref: "#/$defs/Origin" },
            maxItems: 100,
            title: "Origin Records",
            type: "array",
          },
          assertions: {
            items: { $ref: "#/$defs/Assertion" },
            maxItems: 8,
            title: "Assertions",
            type: "array",
          },
        },
        required: [
          "schema_version",
          "observation_id",
          "issue_id",
          "rule_id",
          "rule_version",
          "category",
          "severity",
          "scope",
          "country",
          "asset",
          "model",
          "title",
          "reason_code",
          "reason",
          "outcome",
          "currency",
          "availability",
          "evidence_class",
          "evidence_at",
          "evidence_cutoff",
          "witnessed_at",
          "policy_sha256",
          "fingerprint",
          "previous_observation_id",
          "evidence_refs",
          "source_quality",
          "remediation",
          "origin_records",
          "assertions",
        ],
        title: "Observation",
        type: "object",
      },
      ObservationRef: {
        additionalProperties: false,
        properties: {
          type: { const: "RISK_OBSERVATION", title: "Type", type: "string" },
          observation_id: { pattern: "^[a-f0-9]{64}$", title: "Observation Id", type: "string" },
          sweep_fingerprint: {
            pattern: "^[a-f0-9]{64}$",
            title: "Sweep Fingerprint",
            type: "string",
          },
        },
        required: ["type", "observation_id", "sweep_fingerprint"],
        title: "ObservationRef",
        type: "object",
      },
      OperationProofs: {
        additionalProperties: false,
        properties: {
          provider_captures: { const: 0, title: "Provider Captures", type: "integer" },
          model_runs: { const: 0, title: "Model Runs", type: "integer" },
          plugin_runs: { const: 0, title: "Plugin Runs", type: "integer" },
          series_runs: { const: 0, title: "Series Runs", type: "integer" },
          factor_fits: { const: 0, title: "Factor Fits", type: "integer" },
          research_attempts: { const: 0, title: "Research Attempts", type: "integer" },
          holdout_openings: { const: 0, title: "Holdout Openings", type: "integer" },
          simulator_runs: { const: 0, title: "Simulator Runs", type: "integer" },
          before_inventory_sha256: {
            anyOf: [{ pattern: "^[a-f0-9]{64}$", type: "string" }, { type: "null" }],
            title: "Before Inventory Sha256",
          },
          after_inventory_sha256: {
            anyOf: [{ pattern: "^[a-f0-9]{64}$", type: "string" }, { type: "null" }],
            title: "After Inventory Sha256",
          },
          forbidden_call_guard: {
            const: "ENFORCED",
            title: "Forbidden Call Guard",
            type: "string",
          },
        },
        required: [
          "provider_captures",
          "model_runs",
          "plugin_runs",
          "series_runs",
          "factor_fits",
          "research_attempts",
          "holdout_openings",
          "simulator_runs",
          "before_inventory_sha256",
          "after_inventory_sha256",
          "forbidden_call_guard",
        ],
        title: "OperationProofs",
        type: "object",
      },
      Origin: {
        additionalProperties: false,
        properties: {
          id: { pattern: "^[a-f0-9]{64}$", title: "Id", type: "string" },
          source: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Source",
            type: "string",
          },
          kind: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Kind",
            type: "string",
          },
          severity: {
            enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
            title: "Severity",
            type: "string",
          },
          status: { enum: ["OPEN", "RESOLVED"], title: "Status", type: "string" },
          reason: { maxLength: 600, minLength: 1, title: "Reason", type: "string" },
          first_seen_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "First Seen At" },
          last_seen_at: { anyOf: [{ type: "string" }, { type: "null" }], title: "Last Seen At" },
          occurrences: {
            maximum: 9007199254740991,
            minimum: 0,
            title: "Occurrences",
            type: "integer",
          },
          evidence: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Evidence",
            type: "array",
          },
        },
        required: [
          "id",
          "source",
          "kind",
          "severity",
          "status",
          "reason",
          "first_seen_at",
          "last_seen_at",
          "occurrences",
          "evidence",
        ],
        title: "Origin",
        type: "object",
      },
      PolicyRef: {
        additionalProperties: false,
        properties: {
          type: { const: "POLICY_ASSERTION", title: "Type", type: "string" },
          policy_sha256: { pattern: "^[a-f0-9]{64}$", title: "Policy Sha256", type: "string" },
          check_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Check Id",
            type: "string",
          },
        },
        required: ["type", "policy_sha256", "check_id"],
        title: "PolicyRef",
        type: "object",
      },
      Remediation: {
        additionalProperties: false,
        properties: {
          state: {
            enum: ["REQUIRED", "BLOCKED_EXTERNAL", "DEFERRED", "INFORMATIONAL"],
            title: "State",
            type: "string",
          },
          requirement_code: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Requirement Code",
            type: "string",
          },
          text: { maxLength: 600, minLength: 1, title: "Text", type: "string" },
          evidence_required: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Evidence Required",
            type: "array",
          },
        },
        required: ["state", "requirement_code", "text", "evidence_required"],
        title: "Remediation",
        type: "object",
      },
      ReplayRef: {
        additionalProperties: false,
        properties: {
          type: { const: "REPLAY_ARTIFACT", title: "Type", type: "string" },
          artifact_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Artifact Id",
            type: "string",
          },
          kind: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Kind",
            type: "string",
          },
          sha256: { pattern: "^[a-f0-9]{64}$", title: "Sha256", type: "string" },
          bytes: { maximum: 9007199254740991, minimum: 0, title: "Bytes", type: "integer" },
          as_of: { title: "As Of", type: "string" },
          available_at: { title: "Available At", type: "string" },
          selector_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Selector Id",
            type: "string",
          },
          source_ids: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Source Ids",
            type: "array",
          },
          run_id: {
            anyOf: [{ pattern: "^[a-f0-9]{64}$", type: "string" }, { type: "null" }],
            title: "Run Id",
          },
        },
        required: [
          "type",
          "artifact_id",
          "kind",
          "sha256",
          "bytes",
          "as_of",
          "available_at",
          "selector_id",
          "source_ids",
          "run_id",
        ],
        title: "ReplayRef",
        type: "object",
      },
      Scope: {
        additionalProperties: false,
        properties: {
          kind: {
            enum: [
              "PUBLIC_PLATFORM",
              "MODEL",
              "SOURCE",
              "RESEARCH_FAMILY",
              "PORTFOLIO",
              "SIMULATOR_COMPARISON",
            ],
            title: "Kind",
            type: "string",
          },
          subject_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Subject Id",
            type: "string",
          },
          evidence_family: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Evidence Family",
            type: "string",
          },
          stable_scope_key: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Stable Scope Key",
            type: "string",
          },
        },
        required: ["kind", "subject_id", "evidence_family", "stable_scope_key"],
        title: "Scope",
        type: "object",
      },
      SourceQuality: {
        additionalProperties: false,
        properties: {
          clock_quality: {
            enum: [
              "PUBLICATION_TIMESTAMP",
              "RECEIVE_TIMESTAMP_CAPTURED",
              "CONSERVATIVE_MARKET_TIME",
              "CONSERVATIVE_VINTAGE_DAY",
              "CAPTURE_ONLY",
              "NOT_APPLICABLE",
              "UNAVAILABLE",
            ],
            title: "Clock Quality",
            type: "string",
          },
          lineage_status: {
            enum: ["VERIFIED", "PARTIAL", "UNAVAILABLE", "INVALID"],
            title: "Lineage Status",
            type: "string",
          },
          permission_status: {
            enum: ["DERIVED_ALLOWED", "METADATA_ONLY", "LOCAL_ONLY", "UNAVAILABLE"],
            title: "Permission Status",
            type: "string",
          },
          limitation_codes: {
            items: {
              maxLength: 240,
              minLength: 1,
              pattern: "^[A-Za-z0-9_.:/@|+-]+$",
              type: "string",
            },
            title: "Limitation Codes",
            type: "array",
          },
        },
        required: ["clock_quality", "lineage_status", "permission_status", "limitation_codes"],
        title: "SourceQuality",
        type: "object",
      },
      SweepPayload: {
        additionalProperties: false,
        properties: {
          sweep_id: { pattern: "^[a-f0-9]{64}$", title: "Sweep Id", type: "string" },
          fingerprint: { pattern: "^[a-f0-9]{64}$", title: "Fingerprint", type: "string" },
          status: { enum: ["SUCCEEDED", "PARTIAL", "FAILED"], title: "Status", type: "string" },
          prior_sweep_ref: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "Prior Sweep Ref",
          },
          state_ref: {
            anyOf: [
              { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
              { type: "null" },
            ],
            title: "State Ref",
          },
          started_at: { title: "Started At", type: "string" },
          completed_at: { title: "Completed At", type: "string" },
          published_at: { title: "Published At", type: "string" },
          evaluation_cutoff: { title: "Evaluation Cutoff", type: "string" },
          inputs: { items: { $ref: "#/$defs/Input" }, title: "Inputs", type: "array" },
          evaluator_source_hash: {
            pattern: "^[a-f0-9]{64}$",
            title: "Evaluator Source Hash",
            type: "string",
          },
          policy_sha256: { pattern: "^[a-f0-9]{64}$", title: "Policy Sha256", type: "string" },
          observations: {
            items: { $ref: "#/$defs/Observation" },
            maxItems: 1000,
            title: "Observations",
            type: "array",
          },
          transitions: {
            items: { $ref: "#/$defs/Transition" },
            maxItems: 1000,
            title: "Transitions",
            type: "array",
          },
          transition_counts: { $ref: "#/$defs/TransitionCounts" },
          operation_proofs: { $ref: "#/$defs/OperationProofs" },
          history_index: {
            items: { $ref: "#/$defs/HistoryEntry" },
            maxItems: 20,
            title: "History Index",
            type: "array",
          },
          failure: { anyOf: [{ $ref: "#/$defs/Failure" }, { type: "null" }] },
        },
        required: [
          "sweep_id",
          "fingerprint",
          "status",
          "prior_sweep_ref",
          "state_ref",
          "started_at",
          "completed_at",
          "published_at",
          "evaluation_cutoff",
          "inputs",
          "evaluator_source_hash",
          "policy_sha256",
          "observations",
          "transitions",
          "transition_counts",
          "operation_proofs",
          "history_index",
          "failure",
        ],
        title: "SweepPayload",
        type: "object",
      },
      Transition: {
        additionalProperties: false,
        properties: {
          issue_id: {
            maxLength: 240,
            minLength: 1,
            pattern: "^[A-Za-z0-9_.:/@|+-]+$",
            title: "Issue Id",
            type: "string",
          },
          transition: {
            enum: ["NEW", "UNCHANGED", "UPDATED", "RESOLVED"],
            title: "Transition",
            type: "string",
          },
          observation_id: { pattern: "^[a-f0-9]{64}$", title: "Observation Id", type: "string" },
          previous_observation_id: {
            anyOf: [{ pattern: "^[a-f0-9]{64}$", type: "string" }, { type: "null" }],
            title: "Previous Observation Id",
          },
          at: { title: "At", type: "string" },
        },
        required: ["issue_id", "transition", "observation_id", "previous_observation_id", "at"],
        title: "Transition",
        type: "object",
      },
      TransitionCounts: {
        additionalProperties: false,
        properties: {
          new: { maximum: 9007199254740991, minimum: 0, title: "New", type: "integer" },
          unchanged: { maximum: 9007199254740991, minimum: 0, title: "Unchanged", type: "integer" },
          updated: { maximum: 9007199254740991, minimum: 0, title: "Updated", type: "integer" },
          resolved: { maximum: 9007199254740991, minimum: 0, title: "Resolved", type: "integer" },
        },
        required: ["new", "unchanged", "updated", "resolved"],
        title: "TransitionCounts",
        type: "object",
      },
    },
    additionalProperties: false,
    properties: {
      schema_version: { const: "risk-sweep/1", title: "Schema Version", type: "string" },
      kind: { const: "risk-sweep", title: "Kind", type: "string" },
      input_hash: { pattern: "^[a-f0-9]{64}$", title: "Input Hash", type: "string" },
      evidence_cutoff: { title: "Evidence Cutoff", type: "string" },
      published_at: { title: "Published At", type: "string" },
      scope: { const: "RETAINED_RISK_EVIDENCE", title: "Scope", type: "string" },
      sources: {
        items: { maxLength: 240, minLength: 1, pattern: "^[A-Za-z0-9_.:/@|+-]+$", type: "string" },
        title: "Sources",
        type: "array",
      },
      licence: { $ref: "#/$defs/Licence" },
      claim_flags: { $ref: "#/$defs/ClaimFlags" },
      payload: { $ref: "#/$defs/SweepPayload" },
    },
    required: [
      "schema_version",
      "kind",
      "input_hash",
      "evidence_cutoff",
      "published_at",
      "scope",
      "sources",
      "licence",
      "claim_flags",
      "payload",
    ],
    title: "SweepEnvelope",
    type: "object",
  },
} as unknown as Record<"risk-state" | "risk-sweep", Schema>;

export function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(object)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + stable(object[key]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}
function fail(message: string): never {
  throw new Error(message);
}

/** Decode before JSON.parse could discard duplicate keys; no permissive reviver. */
export function strictJSON(text: string): unknown {
  let at = 0;
  const space = () => {
    while (/[ \t\n\r]/.test(text[at] ?? "") && at < text.length) at++;
  };
  const string = (): string => {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") {
        at++;
        continue;
      }
      if (char === '"') return JSON.parse(text.slice(start, at)) as string;
    }
    return fail("Unterminated JSON string.");
  };
  const value = (): unknown => {
    space();
    if (text[at] === '"') return string();
    if (text[at] === "{") {
      at++;
      space();
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (text[at] === "}") {
        at++;
        return result;
      }
      while (at < text.length) {
        space();
        if (text[at] !== '"') fail("Object key required.");
        const key = string();
        space();
        if (Object.hasOwn(result, key)) fail("Duplicate JSON key.");
        if (text[at++] !== ":") fail("JSON colon required.");
        result[key] = value();
        space();
        const delimiter = text[at++];
        if (delimiter === "}") return result;
        if (delimiter !== ",") fail("JSON object delimiter required.");
      }
      return fail("Unterminated JSON object.");
    }
    if (text[at] === "[") {
      at++;
      space();
      const result: unknown[] = [];
      if (text[at] === "]") {
        at++;
        return result;
      }
      while (at < text.length) {
        result.push(value());
        space();
        const delimiter = text[at++];
        if (delimiter === "]") return result;
        if (delimiter !== ",") fail("JSON array delimiter required.");
      }
      return fail("Unterminated JSON array.");
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(at),
    );
    if (!token) return fail("Invalid JSON token.");
    at += token[0].length;
    const result: unknown = JSON.parse(token[0]);
    if (typeof result === "number" && !Number.isFinite(result)) fail("Nonfinite JSON.");
    return result;
  };
  const result = value();
  space();
  if (at !== text.length) fail("Trailing JSON content.");
  return result;
}
function validate(
  value: unknown,
  schema: Schema,
  defs: Record<string, Schema>,
  path: string,
): void {
  if (schema.$ref) return validate(value, defs[schema.$ref.split("/").at(-1)!], defs, path);
  const choices = schema.anyOf ?? schema.oneOf;
  if (choices) {
    for (const choice of choices) {
      try {
        validate(value, choice, defs, path);
        return;
      } catch {
        /* next closed variant */
      }
    }
    return fail("Unreviewed union at " + path);
  }
  if ("const" in schema && stable(value) !== stable(schema.const))
    fail("Literal substitution at " + path);
  if (schema.enum && !schema.enum.some((v) => stable(v) === stable(value)))
    fail("Unknown enum at " + path);
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      fail("Object required at " + path);
    const object = value as Record<string, unknown>,
      properties = schema.properties ?? {};
    if ((schema.required ?? []).some((key) => !Object.hasOwn(object, key)))
      fail("Missing field at " + path);
    if (
      schema.additionalProperties === false &&
      Object.keys(object).some((key) => !Object.hasOwn(properties, key))
    )
      fail("Unknown field at " + path);
    for (const [key, child] of Object.entries(object)) {
      if (!properties[key]) fail("Unreviewed property at " + path);
      validate(child, properties[key], defs, path + "." + key);
      if (
        (key.endsWith("_at") || ["as_of", "evidence_cutoff", "evaluation_cutoff"].includes(key)) &&
        child !== null &&
        (typeof child !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(child) ||
          !Number.isFinite(Date.parse(child)) ||
          new Date(child).toISOString().slice(0, 19) !== child.slice(0, 19))
      )
        fail("Invalid UTC clock at " + path);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) fail("Array required at " + path);
    const array = value as unknown[];
    if (array.length < (schema.minItems ?? 0) || array.length > (schema.maxItems ?? Infinity))
      fail("Array bound at " + path);
    for (const child of array) validate(child, schema.items!, defs, path);
  } else if (schema.type === "string") {
    if (typeof value !== "string") fail("String required at " + path);
    const text = value as string;
    if (
      text.length < (schema.minLength ?? 0) ||
      text.length > (schema.maxLength ?? Infinity) ||
      (schema.pattern && !new RegExp(schema.pattern).test(text))
    )
      fail("String bound at " + path);
  } else if (schema.type === "integer" || schema.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isSafeInteger(value))
    )
      fail("Numeric type at " + path);
    const number = value as number;
    if (number < (schema.minimum ?? -Infinity) || number > (schema.maximum ?? Infinity))
      fail("Number bound at " + path);
  } else if (schema.type === "boolean" && typeof value !== "boolean")
    fail("Boolean required at " + path);
  else if (schema.type === "null" && value !== null) fail("Null required at " + path);
}
export function partition(issue: Issue): string {
  if (issue.status === "RESOLVED") return "RESOLVED";
  if (["RETAINED_SYNTHETIC", "SYNTHETIC_TEST_ONLY"].includes(issue.evidence_class))
    return "SYNTHETIC";
  if (issue.evidence_class === "UNAVAILABLE") return "UNAVAILABLE";
  return issue.currency === "CURRENT" ? "CURRENT_REAL" : "HISTORICAL";
}
const PRODUCTION_CLASSES = new Set(["REAL_RETAINED", "UNAVAILABLE", "RETAINED_SYNTHETIC"]);
const INPUT_BINDINGS = new Map<string, { input_id: string; sha256: string; bytes: number }>([
  ...Object.values(REPLAY_BINDINGS).map(
    (binding) =>
      [
        binding.artifact_id,
        { input_id: binding.artifact_id, sha256: binding.sha256, bytes: binding.bytes },
      ] as const,
  ),
  ...Object.entries(FILE_BINDINGS).map(
    ([id, binding]) =>
      [id, { input_id: id, sha256: binding.sha256, bytes: binding.bytes }] as const,
  ),
]);
const REVIEWED_INPUTS = Array.from(INPUT_BINDINGS.values()).sort((a, b) =>
  a.input_id < b.input_id ? -1 : a.input_id > b.input_id ? 1 : 0,
);

function safeStrings(value: unknown): void {
  if (typeof value === "string") {
    if (value.includes(String.fromCharCode(92))) fail("Backslash path/escape carrier.");
    const candidates: string[] = [];
    const decoder = new TextDecoder("utf-8", { fatal: true });
    if (value.length >= 4 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      try {
        candidates.push(decoder.decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0))));
      } catch {
        /* Ordinary identifier. */
      }
    }
    if (value.length >= 4 && value.length % 2 === 0 && /^[a-fA-F0-9]+$/.test(value)) {
      try {
        candidates.push(
          decoder.decode(Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16))),
        );
      } catch {
        /* Digest bytes. */
      }
    }
    for (const decoded of candidates) {
      let payload: unknown;
      try {
        payload = JSON.parse(decoded);
      } catch {
        /* Not encoded JSON. */
      }
      if (payload !== null && typeof payload === "object") fail("Encoded JSON payload carrier.");
      safeStrings(decoded);
    }
    if (
      /(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|(?:file|data|mailto|tel|blob|javascript):|[A-Za-z]:[\\/]|\.\.\/|(?<![A-Za-z0-9_.])\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+)/i.test(
        value,
      ) ||
      /(?:api[_-]?key|password|authorization|secret|token)\s*[:=]\s*\S+/i.test(value) ||
      (value.length > 80 && /^[A-Za-z0-9+/]+={0,2}$/.test(value))
    )
      fail("Unreviewed public carrier.");
  } else if (Array.isArray(value)) value.forEach(safeStrings);
  else if (value && typeof value === "object") Object.values(value).forEach(safeStrings);
}
function unique(values: string[], name: string): void {
  if (new Set(values).size !== values.length) fail("Duplicate " + name + ".");
}
function refsValid(refs: Ref[], policy: string): void {
  for (const ref of refs) {
    if (ref.type === "POLICY_ASSERTION") {
      if (
        ref.policy_sha256 !== policy ||
        !PINNED_POLICY.rules.some((rule) => ref.check_id?.startsWith(rule.check_id + ":"))
      )
        fail("Policy reference substituted.");
    } else if (ref.type === "FROZEN_FILE") {
      const binding = FILE_BINDINGS[ref.path_id as keyof typeof FILE_BINDINGS];
      if (
        !binding ||
        ref.selector_id !== ref.path_id ||
        ref.assertion_id !== ref.path_id ||
        ref.sha256 !== binding.sha256 ||
        ref.bytes !== binding.bytes
      )
        fail("Frozen reference substituted.");
    } else if (ref.type === "REPLAY_ARTIFACT") {
      if (ref.run_id !== null) fail("Container has no singular producing run.");
      if (ref.selector_id === "risk_coverage") {
        if (
          !/^risk:state:[a-f0-9]{64}$/.test(ref.artifact_id ?? "") ||
          ref.kind !== "risk-state" ||
          ref.run_id !== null ||
          ref.sha256 !== ref.artifact_id?.split(":").at(-1)
        )
          fail("Coverage reference substituted.");
      } else {
        const binding = REPLAY_BINDINGS[ref.selector_id as keyof typeof REPLAY_BINDINGS];
        if (
          !binding ||
          stable([
            ref.artifact_id,
            ref.kind,
            ref.sha256,
            ref.bytes,
            ref.as_of,
            ref.available_at,
            ref.source_ids,
          ]) !==
            stable([
              binding.artifact_id,
              binding.kind,
              binding.sha256,
              binding.bytes,
              binding.as_of,
              binding.available_at,
              binding.sources,
            ])
        )
          fail("Original evidence reference substituted.");
      }
    }
  }
}
function ruleValid(item: Issue | Observation, policy: State["payload"]["policy"]): void {
  const rule = policy.rules.find((r) => r.rule_id === item.rule_id);
  if (
    !rule ||
    item.rule_version !== rule.rule_version ||
    (item.rule_id !== "R-COVERAGE" && item.category !== rule.category) ||
    (item.reason_code !== null && !rule.reason_codes.includes(item.reason_code))
  )
    fail("Unknown rule/reason binding.");
  if (item.policy_sha256 !== policy.sha256 || !PRODUCTION_CLASSES.has(item.evidence_class))
    fail("Unreviewed policy/evidence class.");
  if (item.asset && ["US-MKT", "IN-MKT"].includes(item.asset)) {
    const expected = item.asset === "US-MKT" ? "US" : "INDIA";
    if (
      item.country !== expected ||
      item.evidence_refs.some(
        (ref) =>
          ref.type === "REPLAY_ARTIFACT" &&
          /^(model_|lineage_)/.test(ref.selector_id ?? "") &&
          !ref.selector_id?.endsWith(expected),
      )
    )
      fail("Country/evidence substitution.");
  }
  refsValid(item.evidence_refs, policy.sha256);
  if (item.evidence_at && Date.parse(item.evidence_at) > Date.parse(item.evidence_cutoff))
    fail("Future evidence.");
}
function issueValid(issue: Issue, policy: State["payload"]["policy"]): void {
  ruleValid(issue, policy);
  unique(issue.observation_ids, "Issue observation");
  if (
    !issue.observation_ids.includes(issue.last_observation_id) ||
    !issue.observation_ids.includes(issue.first_seen_ref.observation_id ?? "")
  )
    fail("Issue observation chain substituted.");
  if (issue.status === "RESOLVED") {
    if (
      !issue.resolution_ref ||
      !issue.resolved_at ||
      Date.parse(issue.resolved_at) < Date.parse(issue.first_seen_at)
    )
      fail("Resolution lacks positive proof.");
  } else if (issue.resolution_ref !== null || issue.resolved_at !== null)
    fail("Open Issue has resolution.");
  if (Date.parse(issue.first_seen_at) < Date.parse(issue.evidence_cutoff))
    fail("Detection precedes cutoff.");
}
export function validateRisk(value: unknown, kind: "risk-state" | "risk-sweep"): State | Sweep {
  const validationStarted = performance.now();
  assertDerivedPayload(value);
  safeStrings(value);
  validate(value, SCHEMAS[kind], SCHEMAS[kind].$defs ?? {}, "risk");
  const v = value as State | Sweep;
  if (
    v.evidence_cutoff !== PINNED_CUTOFF ||
    Date.parse(v.published_at) < Date.parse(v.evidence_cutoff) ||
    v.payload.evaluation_cutoff !== v.evidence_cutoff ||
    stable(v.licence) !==
      stable({
        status: "FIRST_PARTY",
        permitted_uses: ["publish_derived"],
        dataset_key: "project:risk-manager-evidence",
        valid_through: null,
      })
  )
    fail("Envelope cutoff or publication rights substituted.");
  if (kind === "risk-state") {
    const state = v as State,
      p = state.payload,
      expected = new Map<string, number>();
    if (stable(p.policy) !== stable(PINNED_POLICY) || state.input_hash !== p.sweep_fingerprint)
      fail("State policy/fingerprint substituted.");
    unique(
      p.issues.map((issue) => issue.issue_id),
      "Issue identity",
    );
    unique(
      p.coverage.map((row) => row.check_id),
      "coverage slot",
    );
    for (const issue of p.issues) {
      issueValid(issue, p.policy);
      const key = [partition(issue), issue.category, issue.severity].join("|");
      expected.set(key, (expected.get(key) ?? 0) + 1);
    }
    unique(
      p.counts.map((c) => [c.partition, c.category, c.severity].join("|")),
      "count partition",
    );
    const actual = new Map(
      p.counts.map((c) => [[c.partition, c.category, c.severity].join("|"), c.count]),
    );
    if (
      actual.size !== expected.size ||
      [...expected].some(([key, count]) => actual.get(key) !== count)
    )
      fail("Issue counts substituted.");
    for (const row of p.coverage) {
      if (
        !PRODUCTION_CLASSES.has(row.evidence_class) ||
        (row.availability === "UNAVAILABLE" && row.outcome !== "NOT_EVALUATED")
      )
        fail("Missing check shown healthy.");
      if (row.evidence_at && Date.parse(row.evidence_at) > Date.parse(v.evidence_cutoff))
        fail("Future coverage evidence.");
      refsValid(row.evidence_refs, p.policy.sha256);
    }
    refsValid(p.evidence_index, p.policy.sha256);
  } else {
    const sweep = v as Sweep,
      p = sweep.payload;
    if (
      p.policy_sha256 !== PINNED_POLICY.sha256 ||
      sweep.input_hash !== p.fingerprint ||
      sweep.published_at !== p.published_at ||
      !(
        Date.parse(p.started_at) <= Date.parse(p.completed_at) &&
        Date.parse(p.completed_at) <= Date.parse(p.published_at)
      ) ||
      Date.parse(p.evaluation_cutoff) > Date.parse(p.started_at)
    )
      fail("Sweep clocks/policy/fingerprint substituted.");
    if ((p.status === "FAILED") !== (p.failure !== null) || (p.status !== "FAILED" && !p.state_ref))
      fail("Sweep failure mismatch.");
    if (
      p.status === "FAILED" &&
      (p.transition_counts.resolved !== 0 || p.state_ref !== p.failure?.last_valid_state_ref)
    )
      fail("Failure substituted state or resolved Issues.");
    if (
      p.status !== "FAILED" &&
      (!p.operation_proofs.before_inventory_sha256 ||
        p.operation_proofs.before_inventory_sha256 !== p.operation_proofs.after_inventory_sha256)
    )
      fail("Retained inventory changed or unverified.");
    unique(
      p.inputs.map((input) => input.input_id),
      "input binding",
    );
    unique(
      p.observations.map((observation) => observation.observation_id),
      "observation",
    );
    unique(
      p.transitions.map((transition) => transition.issue_id),
      "transition Issue",
    );
    if (p.status !== "FAILED" && stable(p.inputs) !== stable(REVIEWED_INPUTS))
      fail("Reviewed sweep input inventory substituted.");
    const observations = new Map(
      p.observations.map((observation) => [observation.observation_id, observation]),
    );
    for (const observation of p.observations) {
      ruleValid(observation, PINNED_POLICY as unknown as State["payload"]["policy"]);
      if (
        Date.parse(observation.witnessed_at) < Date.parse(observation.evidence_cutoff) ||
        (observation.outcome !== "CLEAR" && observation.reason_code === null)
      )
        fail("Observation lacks witnessed proof.");
    }
    for (const transition of p.transitions) {
      const observation = observations.get(transition.observation_id);
      if (
        !observation ||
        observation.issue_id !== transition.issue_id ||
        transition.at !== observation.witnessed_at
      )
        fail("Transition observation substituted.");
    }
    for (const key of ["new", "updated", "unchanged", "resolved"] as const) {
      if (
        p.transition_counts[key] !==
        p.transitions.filter((transition) => transition.transition === key.toUpperCase()).length
      )
        fail("Transition count substituted.");
    }
    unique(
      p.history_index.map((row) => row.sweep_id),
      "historical sweep",
    );
    if (
      p.history_index.some(
        (row) =>
          row.sweep_id === p.sweep_id ||
          Date.parse(row.published_at) > Date.parse(p.published_at) ||
          !/^risk:sweep:[a-f0-9]{64}$/.test(row.sweep_ref) ||
          (row.state_ref !== null && !/^risk:state:[a-f0-9]{64}$/.test(row.state_ref)),
      )
    )
      fail("Sweep history substituted.");
    if (p.failure)
      issueValid(p.failure.issue, PINNED_POLICY as unknown as State["payload"]["policy"]);
  }
  performance.measure("risk-contract-validation", {
    start: validationStarted,
    end: performance.now(),
  });
  return v;
}
export async function verifyRiskIdentity(value: State | Sweep): Promise<void> {
  const digest = async (object: unknown) => {
    const bytes = new TextEncoder().encode(stable(object));
    const hashed = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hashed), (b) => b.toString(16).padStart(2, "0")).join("");
  };
  const identity = async (item: Issue | Observation) => {
    const s = item.scope;
    const id =
      "risk-issue:" +
      (await digest([
        "risk-identity/1",
        item.rule_id,
        item.rule_version,
        item.category,
        s.kind,
        s.subject_id,
        s.evidence_family,
        s.stable_scope_key,
        item.evidence_class,
      ]));
    if (item.issue_id !== id) fail("Stable Issue identity substituted.");
  };
  if (value.kind === "risk-state") {
    const { state_id, ...bare } = value.payload;
    if (state_id !== (await digest(bare))) fail("State identity substituted.");
    await Promise.all(value.payload.issues.map(identity));
  } else {
    await Promise.all(value.payload.observations.map(identity));
    if (value.payload.failure) await identity(value.payload.failure.issue);
  }
}
export const severityOrder: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};
export function stamp(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "UNAVAILABLE";
}
