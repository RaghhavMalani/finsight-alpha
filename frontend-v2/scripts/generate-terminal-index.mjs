/** Deterministic build-only navigation/display metadata. No provider, model, Python or publication. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import {
  validateReplayManifest,
  validateMarketReplay,
  assertDerivedPayload,
} from "../src/replay/contracts.ts";
import { validateEnvelope } from "../src/regimes/contracts.ts";
import { validateDataEnvelope, validateDataBinding } from "../src/data-organ/contracts.ts";
import { validateMetadata, KNOWN_IDS, KNOWN_METADATA_ENTRIES } from "../src/factors/contracts.ts";
import { validateRisk, verifyRiskIdentity, partition } from "../src/risk-manager/contracts.ts";
import { strictJSON } from "../src/risk-manager/strict-json.ts";
import { validateTrace } from "../src/components/observatory/types.ts";
import { adaptRunIndex } from "../src/forge/data/forge-adapters.ts";
import { INSTRUMENTS } from "../src/markets/instruments.ts";
import { WORKSPACE_PATHS } from "../src/app/terminal/context.ts";
import {
  SHARD_NAMES,
  TERMINAL_CONTRACT,
  stableTerminal,
  packTerminalPayload,
  unpackTerminalPayload,
  validateTerminalShard,
} from "../src/app/terminal/catalog.ts";

// Closed field/type declarations reviewed against the pinned public source contracts.
const CLOSED_SOURCE_FIELDS = {
  "forge-runs": {
    $: {
      types: ["object"],
      keys: [
        "artifact_hash",
        "artifact_id",
        "items",
        "matched",
        "schema_version",
        "source_schema_version",
      ],
      required: [
        "artifact_hash",
        "artifact_id",
        "items",
        "matched",
        "schema_version",
        "source_schema_version",
      ],
    },
    "$.artifact_hash": { types: ["string"] },
    "$.artifact_id": { types: ["string"] },
    "$.items": { types: ["array"] },
    "$.items[]": {
      types: ["object"],
      keys: [
        "completed",
        "decision",
        "episode_key",
        "failure_reason",
        "model",
        "model_version",
        "record_hash",
        "run_id",
        "seed",
        "task_class",
        "task_id",
        "usage",
        "verification",
        "world_hash",
      ],
      required: [
        "completed",
        "decision",
        "episode_key",
        "failure_reason",
        "model",
        "model_version",
        "record_hash",
        "run_id",
        "seed",
        "task_class",
        "task_id",
        "usage",
        "verification",
        "world_hash",
      ],
    },
    "$.items[].completed": { types: ["boolean"] },
    "$.items[].decision": {
      types: ["object"],
      keys: ["reason", "verdict"],
      required: ["reason", "verdict"],
    },
    "$.items[].decision.reason": { types: ["string"] },
    "$.items[].decision.verdict": { types: ["string"] },
    "$.items[].episode_key": { types: ["string"] },
    "$.items[].failure_reason": { types: ["null"] },
    "$.items[].model": { types: ["string"] },
    "$.items[].model_version": { types: ["string"] },
    "$.items[].record_hash": { types: ["string"] },
    "$.items[].run_id": { types: ["string"] },
    "$.items[].seed": { types: ["number"] },
    "$.items[].task_class": { types: ["string"] },
    "$.items[].task_id": { types: ["string"] },
    "$.items[].usage": {
      types: ["object"],
      keys: [
        "cached_input_tokens",
        "engine_runs",
        "high_fidelity_runs",
        "inference_cost_usd",
        "model_calls",
        "reasoning_tokens",
        "tokens_in",
        "tokens_out",
        "tool_calls",
        "total_tokens",
        "wall_seconds",
      ],
      required: [
        "cached_input_tokens",
        "engine_runs",
        "high_fidelity_runs",
        "inference_cost_usd",
        "model_calls",
        "reasoning_tokens",
        "tokens_in",
        "tokens_out",
        "tool_calls",
        "total_tokens",
        "wall_seconds",
      ],
    },
    "$.items[].usage.cached_input_tokens": { types: ["number"] },
    "$.items[].usage.engine_runs": { types: ["number"] },
    "$.items[].usage.high_fidelity_runs": { types: ["number"] },
    "$.items[].usage.inference_cost_usd": { types: ["number"] },
    "$.items[].usage.model_calls": { types: ["number"] },
    "$.items[].usage.reasoning_tokens": { types: ["number"] },
    "$.items[].usage.tokens_in": { types: ["number"] },
    "$.items[].usage.tokens_out": { types: ["number"] },
    "$.items[].usage.tool_calls": { types: ["number"] },
    "$.items[].usage.total_tokens": { types: ["number"] },
    "$.items[].usage.wall_seconds": { types: ["number"] },
    "$.items[].verification": {
      types: ["object"],
      keys: [
        "abstention_accurate",
        "behavioral_score",
        "checks",
        "correct_acceptance",
        "correct_rejection",
        "critical_gate_failure",
        "expected_verdict",
        "false_alpha_acceptance",
        "submitted_verdict",
        "task_id",
        "trajectory_hash",
        "unnecessary_high_fidelity_promotion",
        "verified_research_success",
      ],
      required: [
        "abstention_accurate",
        "behavioral_score",
        "checks",
        "correct_acceptance",
        "correct_rejection",
        "critical_gate_failure",
        "expected_verdict",
        "false_alpha_acceptance",
        "submitted_verdict",
        "task_id",
        "trajectory_hash",
        "unnecessary_high_fidelity_promotion",
        "verified_research_success",
      ],
    },
    "$.items[].verification.abstention_accurate": { types: ["boolean"] },
    "$.items[].verification.behavioral_score": { types: ["number"] },
    "$.items[].verification.checks": {
      types: ["object"],
      keys: [
        "artifact_binding",
        "budget",
        "completed",
        "decision_binding",
        "efficient_routing",
        "model_action_binding",
        "model_identity",
        "model_metering",
        "prompt_identity",
        "required_evidence",
        "sealed_data_hidden",
        "task_identity",
        "tool_schema_identity",
        "trajectory_actions",
        "usage_counters",
        "verdict",
      ],
      required: [
        "artifact_binding",
        "budget",
        "completed",
        "decision_binding",
        "efficient_routing",
        "model_action_binding",
        "model_identity",
        "model_metering",
        "prompt_identity",
        "required_evidence",
        "sealed_data_hidden",
        "task_identity",
        "tool_schema_identity",
        "trajectory_actions",
        "usage_counters",
        "verdict",
      ],
    },
    "$.items[].verification.checks.artifact_binding": { types: ["boolean"] },
    "$.items[].verification.checks.budget": { types: ["boolean"] },
    "$.items[].verification.checks.completed": { types: ["boolean"] },
    "$.items[].verification.checks.decision_binding": { types: ["boolean"] },
    "$.items[].verification.checks.efficient_routing": { types: ["boolean"] },
    "$.items[].verification.checks.model_action_binding": { types: ["boolean"] },
    "$.items[].verification.checks.model_identity": { types: ["boolean"] },
    "$.items[].verification.checks.model_metering": { types: ["boolean"] },
    "$.items[].verification.checks.prompt_identity": { types: ["boolean"] },
    "$.items[].verification.checks.required_evidence": { types: ["boolean"] },
    "$.items[].verification.checks.sealed_data_hidden": { types: ["boolean"] },
    "$.items[].verification.checks.task_identity": { types: ["boolean"] },
    "$.items[].verification.checks.tool_schema_identity": { types: ["boolean"] },
    "$.items[].verification.checks.trajectory_actions": { types: ["boolean"] },
    "$.items[].verification.checks.usage_counters": { types: ["boolean"] },
    "$.items[].verification.checks.verdict": { types: ["boolean"] },
    "$.items[].verification.correct_acceptance": { types: ["boolean"] },
    "$.items[].verification.correct_rejection": { types: ["boolean"] },
    "$.items[].verification.critical_gate_failure": { types: ["boolean"] },
    "$.items[].verification.expected_verdict": { types: ["string"] },
    "$.items[].verification.false_alpha_acceptance": { types: ["boolean"] },
    "$.items[].verification.submitted_verdict": { types: ["string"] },
    "$.items[].verification.task_id": { types: ["string"] },
    "$.items[].verification.trajectory_hash": { types: ["string"] },
    "$.items[].verification.unnecessary_high_fidelity_promotion": { types: ["boolean"] },
    "$.items[].verification.verified_research_success": { types: ["boolean"] },
    "$.items[].world_hash": { types: ["string"] },
    "$.matched": { types: ["number"] },
    "$.schema_version": { types: ["string"] },
    "$.source_schema_version": { types: ["string"] },
  },
  "market-series": {
    $: {
      types: ["object"],
      keys: ["as_of", "method", "schema_version", "ticker", "weeks"],
      required: ["as_of", "method", "schema_version", "ticker", "weeks"],
    },
    "$.as_of": { types: ["string"] },
    "$.method": {
      types: ["object"],
      keys: [
        "annualization_sessions",
        "base",
        "granularity",
        "hmm",
        "regime_semantics",
        "volatility_window_sessions",
      ],
      required: [
        "annualization_sessions",
        "base",
        "granularity",
        "hmm",
        "regime_semantics",
        "volatility_window_sessions",
      ],
    },
    "$.method.annualization_sessions": { types: ["number"] },
    "$.method.base": { types: ["number"] },
    "$.method.granularity": { types: ["string"] },
    "$.method.hmm": {
      types: ["object"],
      keys: [
        "as_of",
        "converged",
        "feature_names",
        "fit_rows",
        "n_states",
        "seed",
        "source_coverage",
        "source_input_hash",
        "status",
        "trace_sha256",
      ],
      required: [
        "as_of",
        "converged",
        "feature_names",
        "fit_rows",
        "n_states",
        "seed",
        "source_coverage",
        "source_input_hash",
        "status",
        "trace_sha256",
      ],
    },
    "$.method.hmm.as_of": { types: ["string"] },
    "$.method.hmm.converged": { types: ["boolean"] },
    "$.method.hmm.feature_names": { types: ["array"] },
    "$.method.hmm.feature_names[]": { types: ["string"] },
    "$.method.hmm.fit_rows": { types: ["number"] },
    "$.method.hmm.n_states": { types: ["number"] },
    "$.method.hmm.seed": { types: ["number"] },
    "$.method.hmm.source_coverage": {
      types: ["object"],
      keys: [
        "as_of",
        "country",
        "coverage",
        "disclosure",
        "evidence_mode",
        "evidence_quality",
        "factor_coverage",
        "input_hash",
        "latest_availability",
        "latest_observation",
        "library_start",
        "market_end",
        "market_start",
        "missing_market_rows",
        "observations",
        "price_basis",
        "raw_snapshot_ids",
        "return_definition",
        "series_label",
        "source",
        "source_captures",
        "source_urls",
        "split_clock",
      ],
      required: [
        "as_of",
        "country",
        "coverage",
        "disclosure",
        "evidence_mode",
        "evidence_quality",
        "factor_coverage",
        "input_hash",
        "latest_availability",
        "latest_observation",
        "library_start",
        "market_end",
        "market_start",
        "missing_market_rows",
        "observations",
        "price_basis",
        "raw_snapshot_ids",
        "return_definition",
        "series_label",
        "source",
        "source_captures",
        "source_urls",
        "split_clock",
      ],
    },
    "$.method.hmm.source_coverage.as_of": { types: ["string"] },
    "$.method.hmm.source_coverage.country": { types: ["string"] },
    "$.method.hmm.source_coverage.coverage": { types: ["string"] },
    "$.method.hmm.source_coverage.disclosure": { types: ["string"] },
    "$.method.hmm.source_coverage.evidence_mode": { types: ["string"] },
    "$.method.hmm.source_coverage.evidence_quality": { types: ["array"] },
    "$.method.hmm.source_coverage.evidence_quality[]": { types: ["string"] },
    "$.method.hmm.source_coverage.factor_coverage": {
      types: ["object"],
      keys: ["HML", "MKT", "MOM", "SMB"],
      required: ["HML", "MKT", "MOM", "SMB"],
    },
    "$.method.hmm.source_coverage.factor_coverage.HML": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.method.hmm.source_coverage.factor_coverage.HML.rows": { types: ["number"] },
    "$.method.hmm.source_coverage.factor_coverage.HML.start": { types: ["string"] },
    "$.method.hmm.source_coverage.factor_coverage.MKT": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.method.hmm.source_coverage.factor_coverage.MKT.rows": { types: ["number"] },
    "$.method.hmm.source_coverage.factor_coverage.MKT.start": { types: ["string"] },
    "$.method.hmm.source_coverage.factor_coverage.MOM": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.method.hmm.source_coverage.factor_coverage.MOM.rows": { types: ["number"] },
    "$.method.hmm.source_coverage.factor_coverage.MOM.start": { types: ["string"] },
    "$.method.hmm.source_coverage.factor_coverage.SMB": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.method.hmm.source_coverage.factor_coverage.SMB.rows": { types: ["number"] },
    "$.method.hmm.source_coverage.factor_coverage.SMB.start": { types: ["string"] },
    "$.method.hmm.source_coverage.input_hash": { types: ["string"] },
    "$.method.hmm.source_coverage.latest_availability": { types: ["string"] },
    "$.method.hmm.source_coverage.latest_observation": { types: ["string"] },
    "$.method.hmm.source_coverage.library_start": { types: ["string"] },
    "$.method.hmm.source_coverage.market_end": { types: ["string"] },
    "$.method.hmm.source_coverage.market_start": { types: ["string"] },
    "$.method.hmm.source_coverage.missing_market_rows": { types: ["number"] },
    "$.method.hmm.source_coverage.observations": { types: ["number"] },
    "$.method.hmm.source_coverage.price_basis": { types: ["string"] },
    "$.method.hmm.source_coverage.raw_snapshot_ids": { types: ["array"] },
    "$.method.hmm.source_coverage.raw_snapshot_ids[]": { types: ["string"] },
    "$.method.hmm.source_coverage.return_definition": { types: ["string"] },
    "$.method.hmm.source_coverage.series_label": { types: ["string"] },
    "$.method.hmm.source_coverage.source": { types: ["array"] },
    "$.method.hmm.source_coverage.source[]": { types: ["string"] },
    "$.method.hmm.source_coverage.source_captures": { types: ["array"] },
    "$.method.hmm.source_coverage.source_captures[]": {
      types: ["object"],
      keys: ["captured_at", "sha256", "source_url"],
      required: ["captured_at", "sha256", "source_url"],
    },
    "$.method.hmm.source_coverage.source_captures[].captured_at": { types: ["string"] },
    "$.method.hmm.source_coverage.source_captures[].sha256": { types: ["string"] },
    "$.method.hmm.source_coverage.source_captures[].source_url": { types: ["string"] },
    "$.method.hmm.source_coverage.source_urls": { types: ["array"] },
    "$.method.hmm.source_coverage.source_urls[]": { types: ["string"] },
    "$.method.hmm.source_coverage.split_clock": { types: ["string"] },
    "$.method.hmm.source_input_hash": { types: ["string"] },
    "$.method.hmm.status": { types: ["string"] },
    "$.method.hmm.trace_sha256": { types: ["string"] },
    "$.method.regime_semantics": { types: ["string"] },
    "$.method.volatility_window_sessions": { types: ["number"] },
    "$.schema_version": { types: ["string"] },
    "$.ticker": { types: ["string"] },
    "$.weeks": { types: ["array"] },
    "$.weeks[]": {
      types: ["object"],
      keys: ["drawdown", "realized_volatility", "regime", "relative_performance", "week"],
      required: ["drawdown", "realized_volatility", "regime", "relative_performance", "week"],
    },
    "$.weeks[].drawdown": { types: ["number"] },
    "$.weeks[].realized_volatility": { types: ["null", "number"] },
    "$.weeks[].regime": { types: ["null", "string"] },
    "$.weeks[].relative_performance": { types: ["number"] },
    "$.weeks[].week": { types: ["string"] },
  },
  "trace-hmm": {
    $: {
      types: ["object"],
      keys: [
        "as_of",
        "claims",
        "converged",
        "dates_tail",
        "feature_names",
        "feature_start",
        "fit_rows",
        "frames",
        "kind",
        "labels",
        "latest_feature",
        "max_iter",
        "n_states",
        "provenance",
        "scaler",
        "scaler_hash",
        "schema_version",
        "seed",
        "semantics",
        "source",
        "ticker",
        "tolerance",
      ],
      required: [
        "as_of",
        "claims",
        "converged",
        "dates_tail",
        "feature_names",
        "feature_start",
        "fit_rows",
        "frames",
        "kind",
        "labels",
        "latest_feature",
        "max_iter",
        "n_states",
        "provenance",
        "scaler",
        "scaler_hash",
        "schema_version",
        "seed",
        "semantics",
        "source",
        "ticker",
        "tolerance",
      ],
    },
    "$.as_of": { types: ["string"] },
    "$.claims": {
      types: ["object"],
      keys: ["causal_claim_eligible", "market_claim_eligible", "validated_alpha"],
      required: ["causal_claim_eligible", "market_claim_eligible", "validated_alpha"],
    },
    "$.claims.causal_claim_eligible": { types: ["boolean"] },
    "$.claims.market_claim_eligible": { types: ["boolean"] },
    "$.claims.validated_alpha": { types: ["boolean"] },
    "$.converged": { types: ["boolean"] },
    "$.dates_tail": { types: ["array"] },
    "$.dates_tail[]": { types: ["string"] },
    "$.feature_names": { types: ["array"] },
    "$.feature_names[]": { types: ["string"] },
    "$.feature_start": { types: ["string"] },
    "$.fit_rows": { types: ["number"] },
    "$.frames": { types: ["array"] },
    "$.frames[]": {
      types: ["object"],
      keys: [
        "converged",
        "convergence_delta",
        "covariance_diagonal",
        "iteration",
        "loglik",
        "means",
        "posterior_tail",
        "transmat",
      ],
      required: [
        "converged",
        "convergence_delta",
        "covariance_diagonal",
        "iteration",
        "loglik",
        "means",
        "posterior_tail",
        "transmat",
      ],
    },
    "$.frames[].converged": { types: ["boolean"] },
    "$.frames[].convergence_delta": { types: ["null", "number"] },
    "$.frames[].covariance_diagonal": { types: ["array"] },
    "$.frames[].covariance_diagonal[]": { types: ["array"] },
    "$.frames[].covariance_diagonal[][]": { types: ["number"] },
    "$.frames[].iteration": { types: ["number"] },
    "$.frames[].loglik": { types: ["number"] },
    "$.frames[].means": { types: ["array"] },
    "$.frames[].means[]": { types: ["array"] },
    "$.frames[].means[][]": { types: ["number"] },
    "$.frames[].posterior_tail": { types: ["array"] },
    "$.frames[].posterior_tail[]": { types: ["array"] },
    "$.frames[].posterior_tail[][]": { types: ["number"] },
    "$.frames[].transmat": { types: ["array"] },
    "$.frames[].transmat[]": { types: ["array"] },
    "$.frames[].transmat[][]": { types: ["number"] },
    "$.kind": { types: ["string"] },
    "$.labels": { types: ["object"], keys: ["0", "1", "2", "3"], required: ["0", "1", "2", "3"] },
    "$.labels.0": { types: ["string"] },
    "$.labels.1": { types: ["string"] },
    "$.labels.2": { types: ["string"] },
    "$.labels.3": { types: ["string"] },
    "$.latest_feature": { types: ["string"] },
    "$.max_iter": { types: ["number"] },
    "$.n_states": { types: ["number"] },
    "$.provenance": {
      types: ["object"],
      keys: [
        "as_of",
        "country",
        "coverage",
        "disclosure",
        "evidence_mode",
        "evidence_quality",
        "factor_coverage",
        "input_hash",
        "latest_availability",
        "latest_observation",
        "library_start",
        "market_end",
        "market_start",
        "missing_market_rows",
        "observations",
        "price_basis",
        "raw_snapshot_ids",
        "return_definition",
        "series_label",
        "source",
        "source_captures",
        "source_urls",
        "split_clock",
      ],
      required: [
        "as_of",
        "country",
        "coverage",
        "disclosure",
        "evidence_mode",
        "evidence_quality",
        "factor_coverage",
        "input_hash",
        "latest_availability",
        "latest_observation",
        "library_start",
        "market_end",
        "market_start",
        "missing_market_rows",
        "observations",
        "price_basis",
        "raw_snapshot_ids",
        "return_definition",
        "series_label",
        "source",
        "source_captures",
        "source_urls",
        "split_clock",
      ],
    },
    "$.provenance.as_of": { types: ["string"] },
    "$.provenance.country": { types: ["string"] },
    "$.provenance.coverage": { types: ["string"] },
    "$.provenance.disclosure": { types: ["string"] },
    "$.provenance.evidence_mode": { types: ["string"] },
    "$.provenance.evidence_quality": { types: ["array"] },
    "$.provenance.evidence_quality[]": { types: ["string"] },
    "$.provenance.factor_coverage": {
      types: ["object"],
      keys: ["HML", "MKT", "MOM", "SMB"],
      required: ["HML", "MKT", "MOM", "SMB"],
    },
    "$.provenance.factor_coverage.HML": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.provenance.factor_coverage.HML.rows": { types: ["number"] },
    "$.provenance.factor_coverage.HML.start": { types: ["string"] },
    "$.provenance.factor_coverage.MKT": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.provenance.factor_coverage.MKT.rows": { types: ["number"] },
    "$.provenance.factor_coverage.MKT.start": { types: ["string"] },
    "$.provenance.factor_coverage.MOM": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.provenance.factor_coverage.MOM.rows": { types: ["number"] },
    "$.provenance.factor_coverage.MOM.start": { types: ["string"] },
    "$.provenance.factor_coverage.SMB": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.provenance.factor_coverage.SMB.rows": { types: ["number"] },
    "$.provenance.factor_coverage.SMB.start": { types: ["string"] },
    "$.provenance.input_hash": { types: ["string"] },
    "$.provenance.latest_availability": { types: ["string"] },
    "$.provenance.latest_observation": { types: ["string"] },
    "$.provenance.library_start": { types: ["string"] },
    "$.provenance.market_end": { types: ["string"] },
    "$.provenance.market_start": { types: ["string"] },
    "$.provenance.missing_market_rows": { types: ["number"] },
    "$.provenance.observations": { types: ["number"] },
    "$.provenance.price_basis": { types: ["string"] },
    "$.provenance.raw_snapshot_ids": { types: ["array"] },
    "$.provenance.raw_snapshot_ids[]": { types: ["string"] },
    "$.provenance.return_definition": { types: ["string"] },
    "$.provenance.series_label": { types: ["string"] },
    "$.provenance.source": { types: ["array"] },
    "$.provenance.source[]": { types: ["string"] },
    "$.provenance.source_captures": { types: ["array"] },
    "$.provenance.source_captures[]": {
      types: ["object"],
      keys: ["captured_at", "sha256", "source_url"],
      required: ["captured_at", "sha256", "source_url"],
    },
    "$.provenance.source_captures[].captured_at": { types: ["string"] },
    "$.provenance.source_captures[].sha256": { types: ["string"] },
    "$.provenance.source_captures[].source_url": { types: ["string"] },
    "$.provenance.source_urls": { types: ["array"] },
    "$.provenance.source_urls[]": { types: ["string"] },
    "$.provenance.split_clock": { types: ["string"] },
    "$.scaler": {
      types: ["object"],
      keys: ["features", "mean", "scale", "variance"],
      required: ["features", "mean", "scale", "variance"],
    },
    "$.scaler.features": { types: ["array"] },
    "$.scaler.features[]": { types: ["string"] },
    "$.scaler.mean": { types: ["array"] },
    "$.scaler.mean[]": { types: ["number"] },
    "$.scaler.scale": { types: ["array"] },
    "$.scaler.scale[]": { types: ["number"] },
    "$.scaler.variance": { types: ["array"] },
    "$.scaler.variance[]": { types: ["number"] },
    "$.scaler_hash": { types: ["string"] },
    "$.schema_version": { types: ["string"] },
    "$.seed": { types: ["number"] },
    "$.semantics": { types: ["string"] },
    "$.source": { types: ["string"] },
    "$.ticker": { types: ["string"] },
    "$.tolerance": { types: ["number"] },
  },
  "trace-signal": {
    $: {
      types: ["object"],
      keys: [
        "as_of",
        "claims",
        "embargo",
        "families",
        "family",
        "feature_names",
        "folds",
        "holdout",
        "horizon",
        "importance_semantics",
        "inference",
        "kind",
        "provenance",
        "rho",
        "schema_version",
        "seed",
        "selected_model",
        "selection",
        "source",
        "split_contract",
        "suppressed",
        "ticker",
        "verdict",
        "verdict_reason",
      ],
      required: [
        "as_of",
        "claims",
        "embargo",
        "families",
        "family",
        "feature_names",
        "folds",
        "holdout",
        "horizon",
        "importance_semantics",
        "inference",
        "kind",
        "provenance",
        "rho",
        "schema_version",
        "seed",
        "selected_model",
        "selection",
        "source",
        "split_contract",
        "suppressed",
        "ticker",
        "verdict",
        "verdict_reason",
      ],
    },
    "$.as_of": { types: ["string"] },
    "$.claims": {
      types: ["object"],
      keys: ["causal_claim_eligible", "market_claim_eligible", "validated_alpha"],
      required: ["causal_claim_eligible", "market_claim_eligible", "validated_alpha"],
    },
    "$.claims.causal_claim_eligible": { types: ["boolean"] },
    "$.claims.market_claim_eligible": { types: ["boolean"] },
    "$.claims.validated_alpha": { types: ["boolean"] },
    "$.embargo": { types: ["number"] },
    "$.families": { types: ["array"] },
    "$.families[]": { types: ["string"] },
    "$.family": { types: ["array"] },
    "$.family[]": { types: ["string"] },
    "$.feature_names": { types: ["array"] },
    "$.feature_names[]": { types: ["string"] },
    "$.folds": { types: ["array"] },
    "$.folds[]": {
      types: ["object"],
      keys: [
        "fit_end",
        "fit_indices",
        "fit_rows",
        "fit_start",
        "fold",
        "frames",
        "model",
        "stage_trace",
        "training_target_information_end",
        "validation_end",
        "validation_feature_start",
        "validation_indices",
        "validation_rows",
        "validation_start",
      ],
      required: [
        "fit_end",
        "fit_indices",
        "fit_rows",
        "fit_start",
        "fold",
        "frames",
        "model",
        "stage_trace",
        "training_target_information_end",
        "validation_end",
        "validation_feature_start",
        "validation_indices",
        "validation_rows",
        "validation_start",
      ],
    },
    "$.folds[].fit_end": { types: ["string"] },
    "$.folds[].fit_indices": { types: ["array"] },
    "$.folds[].fit_indices[]": { types: ["number"] },
    "$.folds[].fit_rows": { types: ["number"] },
    "$.folds[].fit_start": { types: ["string"] },
    "$.folds[].fold": { types: ["number"] },
    "$.folds[].frames": { types: ["array"] },
    "$.folds[].frames[]": {
      types: ["object"],
      keys: ["feature_importance", "fold", "stage", "val_auc", "val_logloss"],
      required: ["feature_importance", "fold", "stage", "val_auc", "val_logloss"],
    },
    "$.folds[].frames[].feature_importance": { types: ["array"] },
    "$.folds[].frames[].feature_importance[]": { types: ["number"] },
    "$.folds[].frames[].fold": { types: ["number"] },
    "$.folds[].frames[].stage": { types: ["number"] },
    "$.folds[].frames[].val_auc": { types: ["number"] },
    "$.folds[].frames[].val_logloss": { types: ["number"] },
    "$.folds[].model": { types: ["string"] },
    "$.folds[].stage_trace": { types: ["string"] },
    "$.folds[].training_target_information_end": { types: ["string"] },
    "$.folds[].validation_end": { types: ["string"] },
    "$.folds[].validation_feature_start": { types: ["string"] },
    "$.folds[].validation_indices": { types: ["array"] },
    "$.folds[].validation_indices[]": { types: ["number"] },
    "$.folds[].validation_rows": { types: ["number"] },
    "$.folds[].validation_start": { types: ["string"] },
    "$.holdout": {
      types: ["object"],
      keys: [
        "auc",
        "auc_ci95",
        "baseline_accuracy",
        "end",
        "feature_start",
        "indices",
        "label",
        "model",
        "rows",
        "start",
        "training_target_information_end",
        "visible_after_selection",
      ],
      required: [
        "auc",
        "auc_ci95",
        "baseline_accuracy",
        "end",
        "feature_start",
        "indices",
        "label",
        "model",
        "rows",
        "start",
        "training_target_information_end",
        "visible_after_selection",
      ],
    },
    "$.holdout.auc": { types: ["number"] },
    "$.holdout.auc_ci95": {
      types: ["object"],
      keys: ["high", "low", "resamples", "seed", "valid_resamples"],
      required: ["high", "low", "resamples", "seed", "valid_resamples"],
    },
    "$.holdout.auc_ci95.high": { types: ["number"] },
    "$.holdout.auc_ci95.low": { types: ["number"] },
    "$.holdout.auc_ci95.resamples": { types: ["number"] },
    "$.holdout.auc_ci95.seed": { types: ["number"] },
    "$.holdout.auc_ci95.valid_resamples": { types: ["number"] },
    "$.holdout.baseline_accuracy": { types: ["number"] },
    "$.holdout.end": { types: ["string"] },
    "$.holdout.feature_start": { types: ["string"] },
    "$.holdout.indices": { types: ["array"] },
    "$.holdout.indices[]": { types: ["number"] },
    "$.holdout.label": { types: ["string"] },
    "$.holdout.model": { types: ["string"] },
    "$.holdout.rows": { types: ["number"] },
    "$.holdout.start": { types: ["string"] },
    "$.holdout.training_target_information_end": { types: ["string"] },
    "$.holdout.visible_after_selection": { types: ["boolean"] },
    "$.horizon": { types: ["number"] },
    "$.importance_semantics": { types: ["string"] },
    "$.inference": {
      types: ["object"],
      keys: ["date", "included_in_labeled_rows"],
      required: ["date", "included_in_labeled_rows"],
    },
    "$.inference.date": { types: ["string"] },
    "$.inference.included_in_labeled_rows": { types: ["boolean"] },
    "$.kind": { types: ["string"] },
    "$.provenance": {
      types: ["object"],
      keys: [
        "as_of",
        "country",
        "coverage",
        "disclosure",
        "evidence_mode",
        "evidence_quality",
        "factor_coverage",
        "input_hash",
        "latest_availability",
        "latest_observation",
        "library_start",
        "market_end",
        "market_start",
        "missing_market_rows",
        "observations",
        "price_basis",
        "raw_snapshot_ids",
        "return_definition",
        "series_label",
        "source",
        "source_captures",
        "source_urls",
        "split_clock",
      ],
      required: [
        "as_of",
        "country",
        "coverage",
        "disclosure",
        "evidence_mode",
        "evidence_quality",
        "factor_coverage",
        "input_hash",
        "latest_availability",
        "latest_observation",
        "library_start",
        "market_end",
        "market_start",
        "missing_market_rows",
        "observations",
        "price_basis",
        "raw_snapshot_ids",
        "return_definition",
        "series_label",
        "source",
        "source_captures",
        "source_urls",
        "split_clock",
      ],
    },
    "$.provenance.as_of": { types: ["string"] },
    "$.provenance.country": { types: ["string"] },
    "$.provenance.coverage": { types: ["string"] },
    "$.provenance.disclosure": { types: ["string"] },
    "$.provenance.evidence_mode": { types: ["string"] },
    "$.provenance.evidence_quality": { types: ["array"] },
    "$.provenance.evidence_quality[]": { types: ["string"] },
    "$.provenance.factor_coverage": {
      types: ["object"],
      keys: ["HML", "MKT", "MOM", "SMB"],
      required: ["HML", "MKT", "MOM", "SMB"],
    },
    "$.provenance.factor_coverage.HML": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.provenance.factor_coverage.HML.rows": { types: ["number"] },
    "$.provenance.factor_coverage.HML.start": { types: ["string"] },
    "$.provenance.factor_coverage.MKT": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.provenance.factor_coverage.MKT.rows": { types: ["number"] },
    "$.provenance.factor_coverage.MKT.start": { types: ["string"] },
    "$.provenance.factor_coverage.MOM": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.provenance.factor_coverage.MOM.rows": { types: ["number"] },
    "$.provenance.factor_coverage.MOM.start": { types: ["string"] },
    "$.provenance.factor_coverage.SMB": {
      types: ["object"],
      keys: ["rows", "start"],
      required: ["rows", "start"],
    },
    "$.provenance.factor_coverage.SMB.rows": { types: ["number"] },
    "$.provenance.factor_coverage.SMB.start": { types: ["string"] },
    "$.provenance.input_hash": { types: ["string"] },
    "$.provenance.latest_availability": { types: ["string"] },
    "$.provenance.latest_observation": { types: ["string"] },
    "$.provenance.library_start": { types: ["string"] },
    "$.provenance.market_end": { types: ["string"] },
    "$.provenance.market_start": { types: ["string"] },
    "$.provenance.missing_market_rows": { types: ["number"] },
    "$.provenance.observations": { types: ["number"] },
    "$.provenance.price_basis": { types: ["string"] },
    "$.provenance.raw_snapshot_ids": { types: ["array"] },
    "$.provenance.raw_snapshot_ids[]": { types: ["string"] },
    "$.provenance.return_definition": { types: ["string"] },
    "$.provenance.series_label": { types: ["string"] },
    "$.provenance.source": { types: ["array"] },
    "$.provenance.source[]": { types: ["string"] },
    "$.provenance.source_captures": { types: ["array"] },
    "$.provenance.source_captures[]": {
      types: ["object"],
      keys: ["captured_at", "sha256", "source_url"],
      required: ["captured_at", "sha256", "source_url"],
    },
    "$.provenance.source_captures[].captured_at": { types: ["string"] },
    "$.provenance.source_captures[].sha256": { types: ["string"] },
    "$.provenance.source_captures[].source_url": { types: ["string"] },
    "$.provenance.source_urls": { types: ["array"] },
    "$.provenance.source_urls[]": { types: ["string"] },
    "$.provenance.split_clock": { types: ["string"] },
    "$.rho": { types: ["array"] },
    "$.rho[]": { types: ["number"] },
    "$.schema_version": { types: ["string"] },
    "$.seed": { types: ["number"] },
    "$.selected_model": { types: ["string"] },
    "$.selection": { types: ["array"] },
    "$.selection[]": {
      types: ["object"],
      keys: ["model", "stage_trace", "stage_trace_note", "validation_auc"],
      required: ["model", "stage_trace", "stage_trace_note", "validation_auc"],
    },
    "$.selection[].model": { types: ["string"] },
    "$.selection[].stage_trace": { types: ["string"] },
    "$.selection[].stage_trace_note": { types: ["string"] },
    "$.selection[].validation_auc": { types: ["number"] },
    "$.source": { types: ["string"] },
    "$.split_contract": { types: ["string"] },
    "$.suppressed": { types: ["boolean"] },
    "$.ticker": { types: ["string"] },
    "$.verdict": { types: ["string"] },
    "$.verdict_reason": { types: ["string"] },
  },
  "regimes-history": {
    $: {
      types: ["object"],
      keys: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      required: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
    },
    "$.as_of": { types: ["string"] },
    "$.claims": {
      types: ["object"],
      keys: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
      required: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
    },
    "$.claims.causal_claim_eligible": { types: ["boolean"] },
    "$.claims.inference_certified": { types: ["boolean"] },
    "$.claims.market_claim_eligible": { types: ["boolean"] },
    "$.claims.precise_edge_confidence": { types: ["boolean"] },
    "$.claims.trusted_graph": { types: ["boolean"] },
    "$.claims.validated_alpha": { types: ["boolean"] },
    "$.input_hash": { types: ["string"] },
    "$.kind": { types: ["string"] },
    "$.payload": {
      types: ["object"],
      keys: ["asset", "entries", "semantics"],
      required: ["asset", "entries", "semantics"],
    },
    "$.payload.asset": { types: ["string"] },
    "$.payload.entries": { types: ["array"] },
    "$.payload.entries[]": {
      types: ["object"],
      keys: [
        "as_of",
        "evidence",
        "hmm2_posterior",
        "hmm2_state",
        "momentum_sign",
        "run_ids",
        "snapshot_artifact",
        "state_at",
        "volatility_state",
      ],
      required: [
        "as_of",
        "evidence",
        "hmm2_posterior",
        "hmm2_state",
        "momentum_sign",
        "run_ids",
        "snapshot_artifact",
        "state_at",
        "volatility_state",
      ],
    },
    "$.payload.entries[].as_of": { types: ["string"] },
    "$.payload.entries[].evidence": { types: ["string"] },
    "$.payload.entries[].hmm2_posterior": { types: ["number"] },
    "$.payload.entries[].hmm2_state": { types: ["string"] },
    "$.payload.entries[].momentum_sign": { types: ["string"] },
    "$.payload.entries[].run_ids": {
      types: ["object"],
      keys: ["factors", "hmm2", "hmm4", "momentum", "volatility"],
      required: ["factors", "hmm2", "hmm4", "momentum", "volatility"],
    },
    "$.payload.entries[].run_ids.factors": { types: ["string"] },
    "$.payload.entries[].run_ids.hmm2": { types: ["string"] },
    "$.payload.entries[].run_ids.hmm4": { types: ["string"] },
    "$.payload.entries[].run_ids.momentum": { types: ["string"] },
    "$.payload.entries[].run_ids.volatility": { types: ["string"] },
    "$.payload.entries[].snapshot_artifact": { types: ["string"] },
    "$.payload.entries[].state_at": { types: ["string"] },
    "$.payload.entries[].volatility_state": { types: ["string"] },
    "$.payload.semantics": { types: ["string"] },
    "$.schema_version": { types: ["string"] },
    "$.sources": { types: ["array"] },
    "$.sources[]": { types: ["string"] },
  },
  "regimes-lineage": {
    $: {
      types: ["object"],
      keys: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      required: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
    },
    "$.as_of": { types: ["string"] },
    "$.claims": {
      types: ["object"],
      keys: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
      required: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
    },
    "$.claims.causal_claim_eligible": { types: ["boolean"] },
    "$.claims.inference_certified": { types: ["boolean"] },
    "$.claims.market_claim_eligible": { types: ["boolean"] },
    "$.claims.precise_edge_confidence": { types: ["boolean"] },
    "$.claims.trusted_graph": { types: ["boolean"] },
    "$.claims.validated_alpha": { types: ["boolean"] },
    "$.input_hash": { types: ["string"] },
    "$.kind": { types: ["string"] },
    "$.payload": {
      types: ["object"],
      keys: ["asset", "chain", "question", "runs", "source_values"],
      required: ["asset", "chain", "question", "runs", "source_values"],
    },
    "$.payload.asset": { types: ["string"] },
    "$.payload.chain": { types: ["string"] },
    "$.payload.question": { types: ["string"] },
    "$.payload.runs": {
      types: ["object"],
      keys: ["factors", "hmm2", "hmm4", "momentum", "volatility"],
      required: ["factors", "hmm2", "hmm4", "momentum", "volatility"],
    },
    "$.payload.runs.factors": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.factors.as_of": { types: ["string"] },
    "$.payload.runs.factors.code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.factors.data_hash": { types: ["string"] },
    "$.payload.runs.factors.execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.factors.execution.commit": { types: ["string"] },
    "$.payload.runs.factors.execution.dependency_manifest_hash": { types: ["string"] },
    "$.payload.runs.factors.execution.dirty_computation": { types: ["boolean"] },
    "$.payload.runs.factors.lineage_digest": { types: ["string"] },
    "$.payload.runs.factors.plugin": { types: ["string"] },
    "$.payload.runs.factors.plugin_version": { types: ["string"] },
    "$.payload.runs.factors.producers": { types: ["array"] },
    "$.payload.runs.factors.producers[]": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.factors.producers[].as_of": { types: ["string"] },
    "$.payload.runs.factors.producers[].code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.factors.producers[].data_hash": { types: ["string"] },
    "$.payload.runs.factors.producers[].execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.factors.producers[].execution.commit": { types: ["string"] },
    "$.payload.runs.factors.producers[].execution.dependency_manifest_hash": { types: ["string"] },
    "$.payload.runs.factors.producers[].execution.dirty_computation": { types: ["boolean"] },
    "$.payload.runs.factors.producers[].lineage_digest": { types: ["string"] },
    "$.payload.runs.factors.producers[].plugin": { types: ["string"] },
    "$.payload.runs.factors.producers[].plugin_version": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers": { types: ["array"] },
    "$.payload.runs.factors.producers[].producers[]": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.factors.producers[].producers[].as_of": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].data_hash": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.factors.producers[].producers[].execution.commit": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].execution.dependency_manifest_hash": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].execution.dirty_computation": {
      types: ["boolean"],
    },
    "$.payload.runs.factors.producers[].producers[].lineage_digest": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].plugin": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].plugin_version": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].producers": { types: ["array"] },
    "$.payload.runs.factors.producers[].producers[].profile_sha256": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].run_id": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources": { types: ["array"] },
    "$.payload.runs.factors.producers[].producers[].sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].admissions": { types: ["array"] },
    "$.payload.runs.factors.producers[].producers[].sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].analysis_window": {
      types: ["array"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].analysis_window[]": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].availability_rule": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].calendar.meaning": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].calendar.source_url": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].calendar.status": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].calendar.version": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].capture_sha256": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].captured_at": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].field_definition": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: ["hml", "mkt", "rf", "smb"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.hml.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.hml.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.hml.rows": {
      types: ["number"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.mkt.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.mkt.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.mkt.rows": {
      types: ["number"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.rf.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.rf.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.rf.rows": {
      types: ["number"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.smb.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.smb.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.smb.rows": {
      types: ["number"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].licence_decision.dataset_key": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].licence_decision.permitted_uses": {
      types: ["array"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].licence_decision.permitted_uses[]": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].licence_decision.status": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].price_basis": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].signals": { types: ["number"] },
    "$.payload.runs.factors.producers[].producers[].sources[].source": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].source_url": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].source_version_id": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].unit": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].state_at": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].status": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].windows": {
      types: ["object"],
      keys: ["mkt"],
      required: ["mkt"],
    },
    "$.payload.runs.factors.producers[].producers[].windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.factors.producers[].producers[].windows.mkt.first_observed": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].windows.mkt.last_observed": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].windows.mkt.observations": {
      types: ["number"],
    },
    "$.payload.runs.factors.producers[].profile_sha256": { types: ["string"] },
    "$.payload.runs.factors.producers[].run_id": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources": { types: ["array"] },
    "$.payload.runs.factors.producers[].sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.factors.producers[].sources[].admissions": { types: ["array"] },
    "$.payload.runs.factors.producers[].sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].analysis_window": { types: ["array"] },
    "$.payload.runs.factors.producers[].sources[].analysis_window[]": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].availability_rule": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.factors.producers[].sources[].calendar.meaning": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].calendar.source_url": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].calendar.status": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].calendar.version": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].capture_sha256": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].captured_at": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].field_definition": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: ["hml", "mkt", "rf", "smb"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.hml.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.hml.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.hml.rows": { types: ["number"] },
    "$.payload.runs.factors.producers[].sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.mkt.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.mkt.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.mkt.rows": { types: ["number"] },
    "$.payload.runs.factors.producers[].sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.rf.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.rf.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.rf.rows": { types: ["number"] },
    "$.payload.runs.factors.producers[].sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.smb.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.smb.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.smb.rows": { types: ["number"] },
    "$.payload.runs.factors.producers[].sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.factors.producers[].sources[].licence_decision.dataset_key": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].licence_decision.permitted_uses": {
      types: ["array"],
    },
    "$.payload.runs.factors.producers[].sources[].licence_decision.permitted_uses[]": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].licence_decision.status": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].price_basis": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].signals": { types: ["number"] },
    "$.payload.runs.factors.producers[].sources[].source": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].source_url": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].source_version_id": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].unit": { types: ["string"] },
    "$.payload.runs.factors.producers[].state_at": { types: ["string"] },
    "$.payload.runs.factors.producers[].status": { types: ["string"] },
    "$.payload.runs.factors.producers[].windows": {
      types: ["object"],
      keys: ["mkt", "realized_vol_20"],
      required: ["mkt", "realized_vol_20"],
    },
    "$.payload.runs.factors.producers[].windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.factors.producers[].windows.mkt.first_observed": { types: ["string"] },
    "$.payload.runs.factors.producers[].windows.mkt.last_observed": { types: ["string"] },
    "$.payload.runs.factors.producers[].windows.mkt.observations": { types: ["number"] },
    "$.payload.runs.factors.producers[].windows.realized_vol_20": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.factors.producers[].windows.realized_vol_20.first_observed": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].windows.realized_vol_20.last_observed": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].windows.realized_vol_20.observations": {
      types: ["number"],
    },
    "$.payload.runs.factors.profile_sha256": { types: ["string"] },
    "$.payload.runs.factors.run_id": { types: ["string"] },
    "$.payload.runs.factors.sources": { types: ["array"] },
    "$.payload.runs.factors.sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.factors.sources[].admissions": { types: ["array"] },
    "$.payload.runs.factors.sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.factors.sources[].analysis_window": { types: ["array"] },
    "$.payload.runs.factors.sources[].analysis_window[]": { types: ["string"] },
    "$.payload.runs.factors.sources[].availability_rule": { types: ["string"] },
    "$.payload.runs.factors.sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.factors.sources[].calendar.meaning": { types: ["string"] },
    "$.payload.runs.factors.sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.factors.sources[].calendar.source_url": { types: ["string"] },
    "$.payload.runs.factors.sources[].calendar.status": { types: ["string"] },
    "$.payload.runs.factors.sources[].calendar.version": { types: ["string"] },
    "$.payload.runs.factors.sources[].capture_sha256": { types: ["string"] },
    "$.payload.runs.factors.sources[].captured_at": { types: ["string"] },
    "$.payload.runs.factors.sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.factors.sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.factors.sources[].field_definition": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: [],
    },
    "$.payload.runs.factors.sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.sources[].library_coverage.hml.first_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.hml.last_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.hml.rows": { types: ["number"] },
    "$.payload.runs.factors.sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.sources[].library_coverage.mkt.first_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.mkt.last_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.mkt.rows": { types: ["number"] },
    "$.payload.runs.factors.sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.sources[].library_coverage.rf.first_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.rf.last_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.rf.rows": { types: ["number"] },
    "$.payload.runs.factors.sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.sources[].library_coverage.smb.first_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.smb.last_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.smb.rows": { types: ["number"] },
    "$.payload.runs.factors.sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.factors.sources[].licence_decision.dataset_key": { types: ["string"] },
    "$.payload.runs.factors.sources[].licence_decision.permitted_uses": { types: ["array"] },
    "$.payload.runs.factors.sources[].licence_decision.permitted_uses[]": { types: ["string"] },
    "$.payload.runs.factors.sources[].licence_decision.status": { types: ["string"] },
    "$.payload.runs.factors.sources[].price_basis": { types: ["string"] },
    "$.payload.runs.factors.sources[].signals": { types: ["number"] },
    "$.payload.runs.factors.sources[].source": { types: ["string"] },
    "$.payload.runs.factors.sources[].source_url": { types: ["string"] },
    "$.payload.runs.factors.sources[].source_version_id": { types: ["string"] },
    "$.payload.runs.factors.sources[].unit": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.sources[].library_coverage.mom.first_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.mom.last_date": { types: ["string"] },
    "$.payload.runs.factors.sources[].library_coverage.mom.rows": { types: ["number"] },
    "$.payload.runs.factors.state_at": { types: ["string"] },
    "$.payload.runs.factors.status": { types: ["string"] },
    "$.payload.runs.factors.windows": {
      types: ["object"],
      keys: ["hml", "hmm2_state", "mkt", "mom", "smb"],
      required: ["hml", "hmm2_state", "mkt", "mom", "smb"],
    },
    "$.payload.runs.factors.windows.hml": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.factors.windows.hml.first_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.hml.last_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.hml.observations": { types: ["number"] },
    "$.payload.runs.factors.windows.hmm2_state": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.factors.windows.hmm2_state.first_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.hmm2_state.last_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.hmm2_state.observations": { types: ["number"] },
    "$.payload.runs.factors.windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.factors.windows.mkt.first_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.mkt.last_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.mkt.observations": { types: ["number"] },
    "$.payload.runs.factors.windows.mom": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.factors.windows.mom.first_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.mom.last_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.mom.observations": { types: ["number"] },
    "$.payload.runs.factors.windows.smb": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.factors.windows.smb.first_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.smb.last_observed": { types: ["string"] },
    "$.payload.runs.factors.windows.smb.observations": { types: ["number"] },
    "$.payload.runs.hmm2": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.hmm2.as_of": { types: ["string"] },
    "$.payload.runs.hmm2.code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.hmm2.data_hash": { types: ["string"] },
    "$.payload.runs.hmm2.execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.hmm2.execution.commit": { types: ["string"] },
    "$.payload.runs.hmm2.execution.dependency_manifest_hash": { types: ["string"] },
    "$.payload.runs.hmm2.execution.dirty_computation": { types: ["boolean"] },
    "$.payload.runs.hmm2.lineage_digest": { types: ["string"] },
    "$.payload.runs.hmm2.plugin": { types: ["string"] },
    "$.payload.runs.hmm2.plugin_version": { types: ["string"] },
    "$.payload.runs.hmm2.producers": { types: ["array"] },
    "$.payload.runs.hmm2.producers[]": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.hmm2.producers[].as_of": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].data_hash": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.hmm2.producers[].execution.commit": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].execution.dependency_manifest_hash": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].execution.dirty_computation": { types: ["boolean"] },
    "$.payload.runs.hmm2.producers[].lineage_digest": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].plugin": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].plugin_version": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].producers": { types: ["array"] },
    "$.payload.runs.hmm2.producers[].profile_sha256": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].run_id": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources": { types: ["array"] },
    "$.payload.runs.hmm2.producers[].sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.hmm2.producers[].sources[].admissions": { types: ["array"] },
    "$.payload.runs.hmm2.producers[].sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].analysis_window": { types: ["array"] },
    "$.payload.runs.hmm2.producers[].sources[].analysis_window[]": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].availability_rule": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.hmm2.producers[].sources[].calendar.meaning": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].calendar.source_url": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].calendar.status": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].calendar.version": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].capture_sha256": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].captured_at": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].field_definition": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: ["hml", "mkt", "rf", "smb"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.hml.first_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.hml.last_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.hml.rows": { types: ["number"] },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.mkt.first_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.mkt.last_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.mkt.rows": { types: ["number"] },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.rf.first_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.rf.last_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.rf.rows": { types: ["number"] },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.smb.first_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.smb.last_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.smb.rows": { types: ["number"] },
    "$.payload.runs.hmm2.producers[].sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.hmm2.producers[].sources[].licence_decision.dataset_key": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].licence_decision.permitted_uses": {
      types: ["array"],
    },
    "$.payload.runs.hmm2.producers[].sources[].licence_decision.permitted_uses[]": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].licence_decision.status": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].price_basis": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].signals": { types: ["number"] },
    "$.payload.runs.hmm2.producers[].sources[].source": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].source_url": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].source_version_id": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].unit": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].state_at": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].status": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].windows": {
      types: ["object"],
      keys: ["mkt"],
      required: ["mkt"],
    },
    "$.payload.runs.hmm2.producers[].windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.hmm2.producers[].windows.mkt.first_observed": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].windows.mkt.last_observed": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].windows.mkt.observations": { types: ["number"] },
    "$.payload.runs.hmm2.profile_sha256": { types: ["string"] },
    "$.payload.runs.hmm2.run_id": { types: ["string"] },
    "$.payload.runs.hmm2.sources": { types: ["array"] },
    "$.payload.runs.hmm2.sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.hmm2.sources[].admissions": { types: ["array"] },
    "$.payload.runs.hmm2.sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].analysis_window": { types: ["array"] },
    "$.payload.runs.hmm2.sources[].analysis_window[]": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].availability_rule": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.hmm2.sources[].calendar.meaning": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].calendar.source_url": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].calendar.status": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].calendar.version": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].capture_sha256": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].captured_at": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].field_definition": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: ["hml", "mkt", "rf", "smb"],
    },
    "$.payload.runs.hmm2.sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.sources[].library_coverage.hml.first_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.hml.last_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.hml.rows": { types: ["number"] },
    "$.payload.runs.hmm2.sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.sources[].library_coverage.mkt.first_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.mkt.last_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.mkt.rows": { types: ["number"] },
    "$.payload.runs.hmm2.sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.sources[].library_coverage.rf.first_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.rf.last_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.rf.rows": { types: ["number"] },
    "$.payload.runs.hmm2.sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.sources[].library_coverage.smb.first_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.smb.last_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.smb.rows": { types: ["number"] },
    "$.payload.runs.hmm2.sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.hmm2.sources[].licence_decision.dataset_key": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].licence_decision.permitted_uses": { types: ["array"] },
    "$.payload.runs.hmm2.sources[].licence_decision.permitted_uses[]": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].licence_decision.status": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].price_basis": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].signals": { types: ["number"] },
    "$.payload.runs.hmm2.sources[].source": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].source_url": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].source_version_id": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].unit": { types: ["string"] },
    "$.payload.runs.hmm2.state_at": { types: ["string"] },
    "$.payload.runs.hmm2.status": { types: ["string"] },
    "$.payload.runs.hmm2.windows": {
      types: ["object"],
      keys: ["mkt", "realized_vol_20"],
      required: ["mkt", "realized_vol_20"],
    },
    "$.payload.runs.hmm2.windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.hmm2.windows.mkt.first_observed": { types: ["string"] },
    "$.payload.runs.hmm2.windows.mkt.last_observed": { types: ["string"] },
    "$.payload.runs.hmm2.windows.mkt.observations": { types: ["number"] },
    "$.payload.runs.hmm2.windows.realized_vol_20": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.hmm2.windows.realized_vol_20.first_observed": { types: ["string"] },
    "$.payload.runs.hmm2.windows.realized_vol_20.last_observed": { types: ["string"] },
    "$.payload.runs.hmm2.windows.realized_vol_20.observations": { types: ["number"] },
    "$.payload.runs.hmm4": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.hmm4.as_of": { types: ["string"] },
    "$.payload.runs.hmm4.code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.hmm4.data_hash": { types: ["string"] },
    "$.payload.runs.hmm4.execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.hmm4.execution.commit": { types: ["string"] },
    "$.payload.runs.hmm4.execution.dependency_manifest_hash": { types: ["string"] },
    "$.payload.runs.hmm4.execution.dirty_computation": { types: ["boolean"] },
    "$.payload.runs.hmm4.lineage_digest": { types: ["string"] },
    "$.payload.runs.hmm4.plugin": { types: ["string"] },
    "$.payload.runs.hmm4.plugin_version": { types: ["string"] },
    "$.payload.runs.hmm4.producers": { types: ["array"] },
    "$.payload.runs.hmm4.profile_sha256": { types: ["string"] },
    "$.payload.runs.hmm4.run_id": { types: ["string"] },
    "$.payload.runs.hmm4.sources": { types: ["array"] },
    "$.payload.runs.hmm4.sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.hmm4.sources[].admissions": { types: ["array"] },
    "$.payload.runs.hmm4.sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].analysis_window": { types: ["array"] },
    "$.payload.runs.hmm4.sources[].analysis_window[]": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].availability_rule": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.hmm4.sources[].calendar.meaning": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].calendar.source_url": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].calendar.status": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].calendar.version": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].capture_sha256": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].captured_at": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].field_definition": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: ["hml", "mkt", "rf", "smb"],
    },
    "$.payload.runs.hmm4.sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm4.sources[].library_coverage.hml.first_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.hml.last_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.hml.rows": { types: ["number"] },
    "$.payload.runs.hmm4.sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm4.sources[].library_coverage.mkt.first_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.mkt.last_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.mkt.rows": { types: ["number"] },
    "$.payload.runs.hmm4.sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm4.sources[].library_coverage.rf.first_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.rf.last_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.rf.rows": { types: ["number"] },
    "$.payload.runs.hmm4.sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm4.sources[].library_coverage.smb.first_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.smb.last_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.smb.rows": { types: ["number"] },
    "$.payload.runs.hmm4.sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.hmm4.sources[].licence_decision.dataset_key": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].licence_decision.permitted_uses": { types: ["array"] },
    "$.payload.runs.hmm4.sources[].licence_decision.permitted_uses[]": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].licence_decision.status": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].price_basis": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].signals": { types: ["number"] },
    "$.payload.runs.hmm4.sources[].source": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].source_url": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].source_version_id": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].unit": { types: ["string"] },
    "$.payload.runs.hmm4.state_at": { types: ["string"] },
    "$.payload.runs.hmm4.status": { types: ["string"] },
    "$.payload.runs.hmm4.windows": { types: ["object"], keys: ["mkt"], required: ["mkt"] },
    "$.payload.runs.hmm4.windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.hmm4.windows.mkt.first_observed": { types: ["string"] },
    "$.payload.runs.hmm4.windows.mkt.last_observed": { types: ["string"] },
    "$.payload.runs.hmm4.windows.mkt.observations": { types: ["number"] },
    "$.payload.runs.momentum": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.momentum.as_of": { types: ["string"] },
    "$.payload.runs.momentum.code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.momentum.data_hash": { types: ["string"] },
    "$.payload.runs.momentum.execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.momentum.execution.commit": { types: ["string"] },
    "$.payload.runs.momentum.execution.dependency_manifest_hash": { types: ["string"] },
    "$.payload.runs.momentum.execution.dirty_computation": { types: ["boolean"] },
    "$.payload.runs.momentum.lineage_digest": { types: ["string"] },
    "$.payload.runs.momentum.plugin": { types: ["string"] },
    "$.payload.runs.momentum.plugin_version": { types: ["string"] },
    "$.payload.runs.momentum.producers": { types: ["array"] },
    "$.payload.runs.momentum.producers[]": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.momentum.producers[].as_of": { types: ["string"] },
    "$.payload.runs.momentum.producers[].code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.momentum.producers[].data_hash": { types: ["string"] },
    "$.payload.runs.momentum.producers[].execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.momentum.producers[].execution.commit": { types: ["string"] },
    "$.payload.runs.momentum.producers[].execution.dependency_manifest_hash": { types: ["string"] },
    "$.payload.runs.momentum.producers[].execution.dirty_computation": { types: ["boolean"] },
    "$.payload.runs.momentum.producers[].lineage_digest": { types: ["string"] },
    "$.payload.runs.momentum.producers[].plugin": { types: ["string"] },
    "$.payload.runs.momentum.producers[].plugin_version": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers": { types: ["array"] },
    "$.payload.runs.momentum.producers[].producers[]": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.momentum.producers[].producers[].as_of": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].data_hash": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.momentum.producers[].producers[].execution.commit": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].execution.dependency_manifest_hash": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].execution.dirty_computation": {
      types: ["boolean"],
    },
    "$.payload.runs.momentum.producers[].producers[].lineage_digest": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].plugin": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].plugin_version": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].producers": { types: ["array"] },
    "$.payload.runs.momentum.producers[].producers[].profile_sha256": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].run_id": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].sources": { types: ["array"] },
    "$.payload.runs.momentum.producers[].producers[].sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].admissions": { types: ["array"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].analysis_window": {
      types: ["array"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].analysis_window[]": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].availability_rule": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].calendar.meaning": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].calendar.source_url": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].calendar.status": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].calendar.version": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].capture_sha256": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].captured_at": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].clock_quality": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].field_definition": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: ["hml", "mkt", "rf", "smb"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.hml.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.hml.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.hml.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.mkt.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.mkt.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.mkt.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.rf.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.rf.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.rf.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.smb.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.smb.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.smb.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].licence_decision.dataset_key": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].licence_decision.permitted_uses": {
      types: ["array"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].licence_decision.permitted_uses[]": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].licence_decision.status": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].price_basis": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].signals": { types: ["number"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].source": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].source_url": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].source_version_id": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].unit": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].state_at": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].status": { types: ["string"] },
    "$.payload.runs.momentum.producers[].producers[].windows": {
      types: ["object"],
      keys: ["mkt"],
      required: ["mkt"],
    },
    "$.payload.runs.momentum.producers[].producers[].windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.momentum.producers[].producers[].windows.mkt.first_observed": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].windows.mkt.last_observed": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].windows.mkt.observations": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].profile_sha256": { types: ["string"] },
    "$.payload.runs.momentum.producers[].run_id": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources": { types: ["array"] },
    "$.payload.runs.momentum.producers[].sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.momentum.producers[].sources[].admissions": { types: ["array"] },
    "$.payload.runs.momentum.producers[].sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].analysis_window": { types: ["array"] },
    "$.payload.runs.momentum.producers[].sources[].analysis_window[]": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].availability_rule": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.momentum.producers[].sources[].calendar.meaning": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].calendar.source_url": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].calendar.status": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].calendar.version": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].capture_sha256": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].captured_at": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].field_definition": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: ["hml", "mkt", "rf", "smb"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.hml.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.hml.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.hml.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.mkt.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.mkt.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.mkt.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.rf.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.rf.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.rf.rows": { types: ["number"] },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.smb.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.smb.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.smb.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.momentum.producers[].sources[].licence_decision.dataset_key": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].licence_decision.permitted_uses": {
      types: ["array"],
    },
    "$.payload.runs.momentum.producers[].sources[].licence_decision.permitted_uses[]": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].licence_decision.status": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].price_basis": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].signals": { types: ["number"] },
    "$.payload.runs.momentum.producers[].sources[].source": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].source_url": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].source_version_id": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].unit": { types: ["string"] },
    "$.payload.runs.momentum.producers[].state_at": { types: ["string"] },
    "$.payload.runs.momentum.producers[].status": { types: ["string"] },
    "$.payload.runs.momentum.producers[].windows": {
      types: ["object"],
      keys: ["mkt", "realized_vol_20"],
      required: ["mkt", "realized_vol_20"],
    },
    "$.payload.runs.momentum.producers[].windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.momentum.producers[].windows.mkt.first_observed": { types: ["string"] },
    "$.payload.runs.momentum.producers[].windows.mkt.last_observed": { types: ["string"] },
    "$.payload.runs.momentum.producers[].windows.mkt.observations": { types: ["number"] },
    "$.payload.runs.momentum.producers[].windows.realized_vol_20": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.momentum.producers[].windows.realized_vol_20.first_observed": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].windows.realized_vol_20.last_observed": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].windows.realized_vol_20.observations": {
      types: ["number"],
    },
    "$.payload.runs.momentum.profile_sha256": { types: ["string"] },
    "$.payload.runs.momentum.run_id": { types: ["string"] },
    "$.payload.runs.momentum.sources": { types: ["array"] },
    "$.payload.runs.momentum.sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.momentum.sources[].admissions": { types: ["array"] },
    "$.payload.runs.momentum.sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.momentum.sources[].analysis_window": { types: ["array"] },
    "$.payload.runs.momentum.sources[].analysis_window[]": { types: ["string"] },
    "$.payload.runs.momentum.sources[].availability_rule": { types: ["string"] },
    "$.payload.runs.momentum.sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.momentum.sources[].calendar.meaning": { types: ["string"] },
    "$.payload.runs.momentum.sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.momentum.sources[].calendar.source_url": { types: ["string"] },
    "$.payload.runs.momentum.sources[].calendar.status": { types: ["string"] },
    "$.payload.runs.momentum.sources[].calendar.version": { types: ["string"] },
    "$.payload.runs.momentum.sources[].capture_sha256": { types: ["string"] },
    "$.payload.runs.momentum.sources[].captured_at": { types: ["string"] },
    "$.payload.runs.momentum.sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.momentum.sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.momentum.sources[].field_definition": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: [],
    },
    "$.payload.runs.momentum.sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.sources[].library_coverage.hml.first_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.hml.last_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.hml.rows": { types: ["number"] },
    "$.payload.runs.momentum.sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.sources[].library_coverage.mkt.first_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.mkt.last_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.mkt.rows": { types: ["number"] },
    "$.payload.runs.momentum.sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.sources[].library_coverage.rf.first_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.rf.last_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.rf.rows": { types: ["number"] },
    "$.payload.runs.momentum.sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.sources[].library_coverage.smb.first_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.smb.last_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.smb.rows": { types: ["number"] },
    "$.payload.runs.momentum.sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.momentum.sources[].licence_decision.dataset_key": { types: ["string"] },
    "$.payload.runs.momentum.sources[].licence_decision.permitted_uses": { types: ["array"] },
    "$.payload.runs.momentum.sources[].licence_decision.permitted_uses[]": { types: ["string"] },
    "$.payload.runs.momentum.sources[].licence_decision.status": { types: ["string"] },
    "$.payload.runs.momentum.sources[].price_basis": { types: ["string"] },
    "$.payload.runs.momentum.sources[].signals": { types: ["number"] },
    "$.payload.runs.momentum.sources[].source": { types: ["string"] },
    "$.payload.runs.momentum.sources[].source_url": { types: ["string"] },
    "$.payload.runs.momentum.sources[].source_version_id": { types: ["string"] },
    "$.payload.runs.momentum.sources[].unit": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.sources[].library_coverage.mom.first_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.mom.last_date": { types: ["string"] },
    "$.payload.runs.momentum.sources[].library_coverage.mom.rows": { types: ["number"] },
    "$.payload.runs.momentum.state_at": { types: ["string"] },
    "$.payload.runs.momentum.status": { types: ["string"] },
    "$.payload.runs.momentum.windows": {
      types: ["object"],
      keys: ["hmm2_state", "mkt", "mom"],
      required: ["hmm2_state", "mkt", "mom"],
    },
    "$.payload.runs.momentum.windows.hmm2_state": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.momentum.windows.hmm2_state.first_observed": { types: ["string"] },
    "$.payload.runs.momentum.windows.hmm2_state.last_observed": { types: ["string"] },
    "$.payload.runs.momentum.windows.hmm2_state.observations": { types: ["number"] },
    "$.payload.runs.momentum.windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.momentum.windows.mkt.first_observed": { types: ["string"] },
    "$.payload.runs.momentum.windows.mkt.last_observed": { types: ["string"] },
    "$.payload.runs.momentum.windows.mkt.observations": { types: ["number"] },
    "$.payload.runs.momentum.windows.mom": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.momentum.windows.mom.first_observed": { types: ["string"] },
    "$.payload.runs.momentum.windows.mom.last_observed": { types: ["string"] },
    "$.payload.runs.momentum.windows.mom.observations": { types: ["number"] },
    "$.payload.runs.volatility": {
      types: ["object"],
      keys: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
      required: [
        "as_of",
        "code_manifest_sha256",
        "data_hash",
        "execution",
        "lineage_digest",
        "plugin",
        "plugin_version",
        "producers",
        "profile_sha256",
        "run_id",
        "sources",
        "state_at",
        "status",
        "windows",
      ],
    },
    "$.payload.runs.volatility.as_of": { types: ["string"] },
    "$.payload.runs.volatility.code_manifest_sha256": { types: ["string"] },
    "$.payload.runs.volatility.data_hash": { types: ["string"] },
    "$.payload.runs.volatility.execution": {
      types: ["object"],
      keys: ["commit", "dependency_manifest_hash", "dirty_computation"],
      required: ["commit", "dependency_manifest_hash", "dirty_computation"],
    },
    "$.payload.runs.volatility.execution.commit": { types: ["string"] },
    "$.payload.runs.volatility.execution.dependency_manifest_hash": { types: ["string"] },
    "$.payload.runs.volatility.execution.dirty_computation": { types: ["boolean"] },
    "$.payload.runs.volatility.lineage_digest": { types: ["string"] },
    "$.payload.runs.volatility.plugin": { types: ["string"] },
    "$.payload.runs.volatility.plugin_version": { types: ["string"] },
    "$.payload.runs.volatility.producers": { types: ["array"] },
    "$.payload.runs.volatility.profile_sha256": { types: ["string"] },
    "$.payload.runs.volatility.run_id": { types: ["string"] },
    "$.payload.runs.volatility.sources": { types: ["array"] },
    "$.payload.runs.volatility.sources[]": {
      types: ["object"],
      keys: [
        "admissions",
        "analysis_window",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "library_coverage",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
      required: [
        "admissions",
        "availability_rule",
        "calendar",
        "capture_sha256",
        "captured_at",
        "clock_quality",
        "feed_scope",
        "field_definition",
        "licence_decision",
        "price_basis",
        "signals",
        "source",
        "source_url",
        "source_version_id",
        "unit",
      ],
    },
    "$.payload.runs.volatility.sources[].admissions": { types: ["array"] },
    "$.payload.runs.volatility.sources[].admissions[]": { types: ["string"] },
    "$.payload.runs.volatility.sources[].analysis_window": { types: ["array"] },
    "$.payload.runs.volatility.sources[].analysis_window[]": { types: ["string"] },
    "$.payload.runs.volatility.sources[].availability_rule": { types: ["string"] },
    "$.payload.runs.volatility.sources[].calendar": {
      types: ["object"],
      keys: ["meaning", "mic", "reason", "source_url", "status", "version"],
      required: ["mic", "status"],
    },
    "$.payload.runs.volatility.sources[].calendar.meaning": { types: ["string"] },
    "$.payload.runs.volatility.sources[].calendar.mic": { types: ["string"] },
    "$.payload.runs.volatility.sources[].calendar.source_url": { types: ["string"] },
    "$.payload.runs.volatility.sources[].calendar.status": { types: ["string"] },
    "$.payload.runs.volatility.sources[].calendar.version": { types: ["string"] },
    "$.payload.runs.volatility.sources[].capture_sha256": { types: ["string"] },
    "$.payload.runs.volatility.sources[].captured_at": { types: ["string"] },
    "$.payload.runs.volatility.sources[].clock_quality": { types: ["string"] },
    "$.payload.runs.volatility.sources[].feed_scope": { types: ["string"] },
    "$.payload.runs.volatility.sources[].field_definition": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage": {
      types: ["object"],
      keys: ["hml", "mkt", "mom", "rf", "smb"],
      required: ["hml", "mkt", "rf", "smb"],
    },
    "$.payload.runs.volatility.sources[].library_coverage.hml": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.volatility.sources[].library_coverage.hml.first_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.hml.last_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.hml.rows": { types: ["number"] },
    "$.payload.runs.volatility.sources[].library_coverage.mkt": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.volatility.sources[].library_coverage.mkt.first_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.mkt.last_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.mkt.rows": { types: ["number"] },
    "$.payload.runs.volatility.sources[].library_coverage.rf": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.volatility.sources[].library_coverage.rf.first_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.rf.last_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.rf.rows": { types: ["number"] },
    "$.payload.runs.volatility.sources[].library_coverage.smb": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.volatility.sources[].library_coverage.smb.first_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.smb.last_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.smb.rows": { types: ["number"] },
    "$.payload.runs.volatility.sources[].licence_decision": {
      types: ["object"],
      keys: ["dataset_key", "permitted_uses", "status"],
      required: ["dataset_key", "permitted_uses", "status"],
    },
    "$.payload.runs.volatility.sources[].licence_decision.dataset_key": { types: ["string"] },
    "$.payload.runs.volatility.sources[].licence_decision.permitted_uses": { types: ["array"] },
    "$.payload.runs.volatility.sources[].licence_decision.permitted_uses[]": { types: ["string"] },
    "$.payload.runs.volatility.sources[].licence_decision.status": { types: ["string"] },
    "$.payload.runs.volatility.sources[].price_basis": { types: ["string"] },
    "$.payload.runs.volatility.sources[].signals": { types: ["number"] },
    "$.payload.runs.volatility.sources[].source": { types: ["string"] },
    "$.payload.runs.volatility.sources[].source_url": { types: ["string"] },
    "$.payload.runs.volatility.sources[].source_version_id": { types: ["string"] },
    "$.payload.runs.volatility.sources[].unit": { types: ["string"] },
    "$.payload.runs.volatility.state_at": { types: ["string"] },
    "$.payload.runs.volatility.status": { types: ["string"] },
    "$.payload.runs.volatility.windows": { types: ["object"], keys: ["mkt"], required: ["mkt"] },
    "$.payload.runs.volatility.windows.mkt": {
      types: ["object"],
      keys: ["first_observed", "last_observed", "observations"],
      required: ["first_observed", "last_observed", "observations"],
    },
    "$.payload.runs.volatility.windows.mkt.first_observed": { types: ["string"] },
    "$.payload.runs.volatility.windows.mkt.last_observed": { types: ["string"] },
    "$.payload.runs.volatility.windows.mkt.observations": { types: ["number"] },
    "$.payload.source_values": { types: ["string"] },
    "$.schema_version": { types: ["string"] },
    "$.sources": { types: ["array"] },
    "$.sources[]": { types: ["string"] },
    "$.payload.runs.factors.producers[].producers[].sources[].calendar.reason": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.mom.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.mom.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].producers[].sources[].library_coverage.mom.rows": {
      types: ["number"],
    },
    "$.payload.runs.factors.producers[].sources[].calendar.reason": { types: ["string"] },
    "$.payload.runs.factors.producers[].sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.mom.first_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.mom.last_date": {
      types: ["string"],
    },
    "$.payload.runs.factors.producers[].sources[].library_coverage.mom.rows": { types: ["number"] },
    "$.payload.runs.factors.sources[].calendar.reason": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].calendar.reason": { types: ["string"] },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.mom.first_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.mom.last_date": {
      types: ["string"],
    },
    "$.payload.runs.hmm2.producers[].sources[].library_coverage.mom.rows": { types: ["number"] },
    "$.payload.runs.hmm2.sources[].calendar.reason": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm2.sources[].library_coverage.mom.first_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.mom.last_date": { types: ["string"] },
    "$.payload.runs.hmm2.sources[].library_coverage.mom.rows": { types: ["number"] },
    "$.payload.runs.hmm4.sources[].calendar.reason": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.hmm4.sources[].library_coverage.mom.first_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.mom.last_date": { types: ["string"] },
    "$.payload.runs.hmm4.sources[].library_coverage.mom.rows": { types: ["number"] },
    "$.payload.runs.momentum.producers[].producers[].sources[].calendar.reason": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.mom.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.mom.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].producers[].sources[].library_coverage.mom.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.producers[].sources[].calendar.reason": { types: ["string"] },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.mom.first_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.mom.last_date": {
      types: ["string"],
    },
    "$.payload.runs.momentum.producers[].sources[].library_coverage.mom.rows": {
      types: ["number"],
    },
    "$.payload.runs.momentum.sources[].calendar.reason": { types: ["string"] },
    "$.payload.runs.volatility.sources[].calendar.reason": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.mom": {
      types: ["object"],
      keys: ["first_date", "last_date", "rows"],
      required: ["first_date", "last_date", "rows"],
    },
    "$.payload.runs.volatility.sources[].library_coverage.mom.first_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.mom.last_date": { types: ["string"] },
    "$.payload.runs.volatility.sources[].library_coverage.mom.rows": { types: ["number"] },
  },
  "regimes-matrix": {
    $: {
      types: ["object"],
      keys: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      required: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
    },
    "$.as_of": { types: ["string"] },
    "$.claims": {
      types: ["object"],
      keys: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
      required: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
    },
    "$.claims.causal_claim_eligible": { types: ["boolean"] },
    "$.claims.inference_certified": { types: ["boolean"] },
    "$.claims.market_claim_eligible": { types: ["boolean"] },
    "$.claims.precise_edge_confidence": { types: ["boolean"] },
    "$.claims.trusted_graph": { types: ["boolean"] },
    "$.claims.validated_alpha": { types: ["boolean"] },
    "$.input_hash": { types: ["string"] },
    "$.kind": { types: ["string"] },
    "$.payload": {
      types: ["object"],
      keys: ["rows", "semantics", "summaries"],
      required: ["rows", "semantics", "summaries"],
    },
    "$.payload.rows": { types: ["array"] },
    "$.payload.rows[]": {
      types: ["object"],
      keys: [
        "asset",
        "badges",
        "cells",
        "market",
        "observation_unit",
        "series_label",
        "state_at",
        "tier",
      ],
      required: [
        "asset",
        "badges",
        "cells",
        "market",
        "observation_unit",
        "series_label",
        "state_at",
        "tier",
      ],
    },
    "$.payload.rows[].asset": { types: ["string"] },
    "$.payload.rows[].badges": { types: ["array"] },
    "$.payload.rows[].badges[]": { types: ["string"] },
    "$.payload.rows[].cells": {
      types: ["object"],
      keys: [
        "current_state",
        "data_quality",
        "event_pressure",
        "evidence_quality",
        "factor_exposure",
        "hmm_confidence",
        "momentum_state",
        "volatility_stress",
      ],
      required: [
        "current_state",
        "data_quality",
        "event_pressure",
        "evidence_quality",
        "factor_exposure",
        "hmm_confidence",
        "momentum_state",
        "volatility_stress",
      ],
    },
    "$.payload.rows[].cells.current_state": {
      types: ["object"],
      keys: ["detail", "reason", "run_id", "status", "value"],
      required: ["detail", "reason", "run_id", "status", "value"],
    },
    "$.payload.rows[].cells.current_state.detail": { types: ["null"] },
    "$.payload.rows[].cells.current_state.reason": { types: ["null", "string"] },
    "$.payload.rows[].cells.current_state.run_id": { types: ["string"] },
    "$.payload.rows[].cells.current_state.status": { types: ["string"] },
    "$.payload.rows[].cells.current_state.value": { types: ["string"] },
    "$.payload.rows[].cells.data_quality": {
      types: ["object"],
      keys: ["detail", "reason", "run_id", "status", "value"],
      required: ["detail", "reason", "run_id", "status", "value"],
    },
    "$.payload.rows[].cells.data_quality.detail": {
      types: ["object"],
      keys: ["open_issue_kinds"],
      required: ["open_issue_kinds"],
    },
    "$.payload.rows[].cells.data_quality.detail.open_issue_kinds": { types: ["array"] },
    "$.payload.rows[].cells.data_quality.detail.open_issue_kinds[]": { types: ["string"] },
    "$.payload.rows[].cells.data_quality.reason": { types: ["null"] },
    "$.payload.rows[].cells.data_quality.run_id": { types: ["null"] },
    "$.payload.rows[].cells.data_quality.status": { types: ["string"] },
    "$.payload.rows[].cells.data_quality.value": { types: ["number"] },
    "$.payload.rows[].cells.event_pressure": {
      types: ["object"],
      keys: ["detail", "reason", "run_id", "status", "value"],
      required: ["detail", "reason", "run_id", "status", "value"],
    },
    "$.payload.rows[].cells.event_pressure.detail": { types: ["null"] },
    "$.payload.rows[].cells.event_pressure.reason": { types: ["string"] },
    "$.payload.rows[].cells.event_pressure.run_id": { types: ["null"] },
    "$.payload.rows[].cells.event_pressure.status": { types: ["string"] },
    "$.payload.rows[].cells.event_pressure.value": { types: ["null"] },
    "$.payload.rows[].cells.evidence_quality": {
      types: ["object"],
      keys: ["detail", "reason", "run_id", "status", "value"],
      required: ["detail", "reason", "run_id", "status", "value"],
    },
    "$.payload.rows[].cells.evidence_quality.detail": {
      types: ["object"],
      keys: ["present", "weakest"],
      required: ["present", "weakest"],
    },
    "$.payload.rows[].cells.evidence_quality.detail.present": { types: ["array"] },
    "$.payload.rows[].cells.evidence_quality.detail.present[]": { types: ["string"] },
    "$.payload.rows[].cells.evidence_quality.detail.weakest": { types: ["string"] },
    "$.payload.rows[].cells.evidence_quality.reason": { types: ["null"] },
    "$.payload.rows[].cells.evidence_quality.run_id": { types: ["null"] },
    "$.payload.rows[].cells.evidence_quality.status": { types: ["string"] },
    "$.payload.rows[].cells.evidence_quality.value": { types: ["string"] },
    "$.payload.rows[].cells.factor_exposure": {
      types: ["object"],
      keys: ["detail", "reason", "run_id", "status", "value"],
      required: ["detail", "reason", "run_id", "status", "value"],
    },
    "$.payload.rows[].cells.factor_exposure.detail": {
      types: ["object"],
      keys: ["meaning", "neutrality", "target"],
      required: ["meaning", "neutrality", "target"],
    },
    "$.payload.rows[].cells.factor_exposure.detail.meaning": { types: ["string"] },
    "$.payload.rows[].cells.factor_exposure.detail.neutrality": { types: ["string"] },
    "$.payload.rows[].cells.factor_exposure.detail.target": { types: ["string"] },
    "$.payload.rows[].cells.factor_exposure.reason": { types: ["string"] },
    "$.payload.rows[].cells.factor_exposure.run_id": { types: ["string"] },
    "$.payload.rows[].cells.factor_exposure.status": { types: ["string"] },
    "$.payload.rows[].cells.factor_exposure.value": { types: ["number"] },
    "$.payload.rows[].cells.hmm_confidence": {
      types: ["object"],
      keys: ["detail", "reason", "run_id", "status", "value"],
      required: ["detail", "reason", "run_id", "status", "value"],
    },
    "$.payload.rows[].cells.hmm_confidence.detail": { types: ["null"] },
    "$.payload.rows[].cells.hmm_confidence.reason": { types: ["null", "string"] },
    "$.payload.rows[].cells.hmm_confidence.run_id": { types: ["string"] },
    "$.payload.rows[].cells.hmm_confidence.status": { types: ["string"] },
    "$.payload.rows[].cells.hmm_confidence.value": { types: ["number"] },
    "$.payload.rows[].cells.momentum_state": {
      types: ["object"],
      keys: ["detail", "reason", "run_id", "status", "value"],
      required: ["detail", "reason", "run_id", "status", "value"],
    },
    "$.payload.rows[].cells.momentum_state.detail": {
      types: ["object"],
      keys: ["definition", "signal"],
      required: ["definition", "signal"],
    },
    "$.payload.rows[].cells.momentum_state.detail.definition": { types: ["string"] },
    "$.payload.rows[].cells.momentum_state.detail.signal": { types: ["number"] },
    "$.payload.rows[].cells.momentum_state.reason": { types: ["null", "string"] },
    "$.payload.rows[].cells.momentum_state.run_id": { types: ["string"] },
    "$.payload.rows[].cells.momentum_state.status": { types: ["string"] },
    "$.payload.rows[].cells.momentum_state.value": { types: ["string"] },
    "$.payload.rows[].cells.volatility_stress": {
      types: ["object"],
      keys: ["detail", "reason", "run_id", "status", "value"],
      required: ["detail", "reason", "run_id", "status", "value"],
    },
    "$.payload.rows[].cells.volatility_stress.detail": {
      types: ["object"],
      keys: ["mapping", "volatility_state"],
      required: ["mapping", "volatility_state"],
    },
    "$.payload.rows[].cells.volatility_stress.detail.mapping": { types: ["string"] },
    "$.payload.rows[].cells.volatility_stress.detail.volatility_state": { types: ["string"] },
    "$.payload.rows[].cells.volatility_stress.reason": { types: ["null", "string"] },
    "$.payload.rows[].cells.volatility_stress.run_id": { types: ["string"] },
    "$.payload.rows[].cells.volatility_stress.status": { types: ["string"] },
    "$.payload.rows[].cells.volatility_stress.value": { types: ["number"] },
    "$.payload.rows[].market": { types: ["string"] },
    "$.payload.rows[].observation_unit": { types: ["string"] },
    "$.payload.rows[].series_label": { types: ["string"] },
    "$.payload.rows[].state_at": { types: ["string"] },
    "$.payload.rows[].tier": { types: ["string"] },
    "$.payload.semantics": { types: ["string"] },
    "$.payload.summaries": {
      types: ["object"],
      keys: [
        "historical_agreement",
        "rotation_observations",
        "state_agreement",
        "volatility_dispersion",
      ],
      required: [
        "historical_agreement",
        "rotation_observations",
        "state_agreement",
        "volatility_dispersion",
      ],
    },
    "$.payload.summaries.historical_agreement": { types: ["array"] },
    "$.payload.summaries.historical_agreement[]": {
      types: ["object"],
      keys: [
        "agreement_share",
        "first_overlap",
        "last_overlap",
        "method",
        "overlapping_dates",
        "pair",
      ],
      required: [
        "agreement_share",
        "first_overlap",
        "last_overlap",
        "method",
        "overlapping_dates",
        "pair",
      ],
    },
    "$.payload.summaries.historical_agreement[].agreement_share": { types: ["number"] },
    "$.payload.summaries.historical_agreement[].first_overlap": { types: ["string"] },
    "$.payload.summaries.historical_agreement[].last_overlap": { types: ["string"] },
    "$.payload.summaries.historical_agreement[].method": { types: ["string"] },
    "$.payload.summaries.historical_agreement[].overlapping_dates": { types: ["number"] },
    "$.payload.summaries.historical_agreement[].pair": { types: ["array"] },
    "$.payload.summaries.historical_agreement[].pair[]": { types: ["string"] },
    "$.payload.summaries.rotation_observations": { types: ["array"] },
    "$.payload.summaries.rotation_observations[]": {
      types: ["object"],
      keys: ["asset", "last_state_change", "state"],
      required: ["asset", "last_state_change", "state"],
    },
    "$.payload.summaries.rotation_observations[].asset": { types: ["string"] },
    "$.payload.summaries.rotation_observations[].last_state_change": { types: ["string"] },
    "$.payload.summaries.rotation_observations[].state": { types: ["string"] },
    "$.payload.summaries.state_agreement": { types: ["array"] },
    "$.payload.summaries.state_agreement[]": {
      types: ["object"],
      keys: ["pair", "same_state", "state_at", "state_at_gap_days", "volatility_stress_gap"],
      required: ["pair", "same_state", "state_at", "state_at_gap_days", "volatility_stress_gap"],
    },
    "$.payload.summaries.state_agreement[].pair": { types: ["array"] },
    "$.payload.summaries.state_agreement[].pair[]": { types: ["string"] },
    "$.payload.summaries.state_agreement[].same_state": { types: ["boolean"] },
    "$.payload.summaries.state_agreement[].state_at": { types: ["array"] },
    "$.payload.summaries.state_agreement[].state_at[]": { types: ["string"] },
    "$.payload.summaries.state_agreement[].state_at_gap_days": { types: ["number"] },
    "$.payload.summaries.state_agreement[].volatility_stress_gap": { types: ["number"] },
    "$.payload.summaries.volatility_dispersion": { types: ["number"] },
    "$.schema_version": { types: ["string"] },
    "$.sources": { types: ["array"] },
    "$.sources[]": { types: ["string"] },
  },
  "regimes-snapshot": {
    $: {
      types: ["object"],
      keys: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      required: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
    },
    "$.as_of": { types: ["string"] },
    "$.claims": {
      types: ["object"],
      keys: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
      required: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
    },
    "$.claims.causal_claim_eligible": { types: ["boolean"] },
    "$.claims.inference_certified": { types: ["boolean"] },
    "$.claims.market_claim_eligible": { types: ["boolean"] },
    "$.claims.precise_edge_confidence": { types: ["boolean"] },
    "$.claims.trusted_graph": { types: ["boolean"] },
    "$.claims.validated_alpha": { types: ["boolean"] },
    "$.input_hash": { types: ["string"] },
    "$.kind": { types: ["string"] },
    "$.payload": {
      types: ["object"],
      keys: [
        "asset",
        "badges",
        "calendar",
        "claims",
        "country",
        "coupling",
        "current",
        "evidence_quality",
        "evidence_scope",
        "factors",
        "fracture",
        "frozen_research",
        "hmm",
        "input_hash",
        "issues",
        "layers",
        "market",
        "module_statuses",
        "momentum",
        "not_a",
        "observation_unit",
        "profile_sha256",
        "requested_as_of",
        "run_ids",
        "series_label",
        "stale_calendar_days",
        "state_at",
        "tier",
        "volatility",
      ],
      required: [
        "asset",
        "badges",
        "calendar",
        "claims",
        "country",
        "coupling",
        "current",
        "evidence_quality",
        "evidence_scope",
        "factors",
        "fracture",
        "frozen_research",
        "hmm",
        "input_hash",
        "issues",
        "layers",
        "market",
        "module_statuses",
        "momentum",
        "not_a",
        "observation_unit",
        "profile_sha256",
        "requested_as_of",
        "run_ids",
        "series_label",
        "stale_calendar_days",
        "state_at",
        "tier",
        "volatility",
      ],
    },
    "$.payload.asset": { types: ["string"] },
    "$.payload.badges": { types: ["array"] },
    "$.payload.badges[]": { types: ["string"] },
    "$.payload.calendar": {
      types: ["object"],
      keys: [
        "evidence",
        "expected_sessions",
        "identity",
        "meaning",
        "mic",
        "missing_examples",
        "missing_sessions",
        "reason",
        "status",
        "unexpected_dates",
        "unexpected_examples",
        "unit",
      ],
      required: ["identity", "status", "unit"],
    },
    "$.payload.calendar.evidence": {
      types: ["object"],
      keys: ["end", "mic", "package", "package_version", "sessions_hash", "start"],
      required: ["end", "mic", "package", "package_version", "sessions_hash", "start"],
    },
    "$.payload.calendar.evidence.end": { types: ["string"] },
    "$.payload.calendar.evidence.mic": { types: ["string"] },
    "$.payload.calendar.evidence.package": { types: ["string"] },
    "$.payload.calendar.evidence.package_version": { types: ["string"] },
    "$.payload.calendar.evidence.sessions_hash": { types: ["string"] },
    "$.payload.calendar.evidence.start": { types: ["string"] },
    "$.payload.calendar.expected_sessions": { types: ["number"] },
    "$.payload.calendar.identity": { types: ["string"] },
    "$.payload.calendar.meaning": { types: ["string"] },
    "$.payload.calendar.missing_examples": { types: ["array"] },
    "$.payload.calendar.missing_sessions": { types: ["number"] },
    "$.payload.calendar.status": { types: ["string"] },
    "$.payload.calendar.unexpected_dates": { types: ["number"] },
    "$.payload.calendar.unexpected_examples": { types: ["array"] },
    "$.payload.calendar.unit": { types: ["string"] },
    "$.payload.claims": {
      types: ["object"],
      keys: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
      required: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
    },
    "$.payload.claims.causal_claim_eligible": { types: ["boolean"] },
    "$.payload.claims.inference_certified": { types: ["boolean"] },
    "$.payload.claims.market_claim_eligible": { types: ["boolean"] },
    "$.payload.claims.precise_edge_confidence": { types: ["boolean"] },
    "$.payload.claims.trusted_graph": { types: ["boolean"] },
    "$.payload.claims.validated_alpha": { types: ["boolean"] },
    "$.payload.country": { types: ["string"] },
    "$.payload.coupling": {
      types: ["object"],
      keys: ["bound_producer_runs", "hmm2_run", "semantics", "volatility_run"],
      required: ["bound_producer_runs", "hmm2_run", "semantics", "volatility_run"],
    },
    "$.payload.coupling.bound_producer_runs": { types: ["array"] },
    "$.payload.coupling.bound_producer_runs[]": { types: ["string"] },
    "$.payload.coupling.hmm2_run": { types: ["string"] },
    "$.payload.coupling.semantics": { types: ["string"] },
    "$.payload.coupling.volatility_run": { types: ["string"] },
    "$.payload.current": {
      types: ["object"],
      keys: ["factors", "hmm4", "momentum", "regime", "units", "volatility"],
      required: ["factors", "hmm4", "momentum", "regime", "units", "volatility"],
    },
    "$.payload.current.factors": {
      types: ["object"],
      keys: ["intercept", "market_beta", "neutrality", "r_squared"],
      required: ["intercept", "market_beta", "neutrality", "r_squared"],
    },
    "$.payload.current.factors.intercept": { types: ["number"] },
    "$.payload.current.factors.market_beta": { types: ["number"] },
    "$.payload.current.factors.neutrality": { types: ["string"] },
    "$.payload.current.factors.r_squared": { types: ["number"] },
    "$.payload.current.hmm4": {
      types: ["object"],
      keys: ["expected_duration", "hmm_converged", "hmm_posterior", "hmm_state"],
      required: ["expected_duration", "hmm_converged", "hmm_posterior", "hmm_state"],
    },
    "$.payload.current.hmm4.expected_duration": { types: ["number"] },
    "$.payload.current.hmm4.hmm_converged": { types: ["boolean"] },
    "$.payload.current.hmm4.hmm_posterior": { types: ["number"] },
    "$.payload.current.hmm4.hmm_state": { types: ["string"] },
    "$.payload.current.momentum": {
      types: ["object"],
      keys: ["momentum_sign", "momentum_signal"],
      required: ["momentum_sign", "momentum_signal"],
    },
    "$.payload.current.momentum.momentum_sign": { types: ["string"] },
    "$.payload.current.momentum.momentum_signal": { types: ["number"] },
    "$.payload.current.regime": {
      types: ["object"],
      keys: ["expected_duration", "hmm_converged", "hmm_posterior", "hmm_state"],
      required: ["expected_duration", "hmm_converged", "hmm_posterior", "hmm_state"],
    },
    "$.payload.current.regime.expected_duration": { types: ["number"] },
    "$.payload.current.regime.hmm_converged": { types: ["boolean"] },
    "$.payload.current.regime.hmm_posterior": { types: ["number"] },
    "$.payload.current.regime.hmm_state": { types: ["string"] },
    "$.payload.current.units": {
      types: ["object"],
      keys: ["duration", "volatility"],
      required: ["duration", "volatility"],
    },
    "$.payload.current.units.duration": { types: ["string"] },
    "$.payload.current.units.volatility": { types: ["string"] },
    "$.payload.current.volatility": {
      types: ["object"],
      keys: [
        "arch_lm_pvalue",
        "ewma_vol",
        "garch_half_life",
        "garch_persistence",
        "realized_vol_20",
        "realized_vol_20_annualised",
        "volatility_state",
      ],
      required: [
        "arch_lm_pvalue",
        "ewma_vol",
        "garch_half_life",
        "garch_persistence",
        "realized_vol_20",
        "volatility_state",
      ],
    },
    "$.payload.current.volatility.arch_lm_pvalue": { types: ["number"] },
    "$.payload.current.volatility.ewma_vol": { types: ["number"] },
    "$.payload.current.volatility.garch_half_life": { types: ["number"] },
    "$.payload.current.volatility.garch_persistence": { types: ["number"] },
    "$.payload.current.volatility.realized_vol_20": { types: ["number"] },
    "$.payload.current.volatility.realized_vol_20_annualised": { types: ["number"] },
    "$.payload.current.volatility.volatility_state": { types: ["string"] },
    "$.payload.evidence_quality": {
      types: ["object"],
      keys: ["present", "weakest"],
      required: ["present", "weakest"],
    },
    "$.payload.evidence_quality.present": { types: ["array"] },
    "$.payload.evidence_quality.present[]": { types: ["string"] },
    "$.payload.evidence_quality.weakest": { types: ["string"] },
    "$.payload.evidence_scope": { types: ["string"] },
    "$.payload.factors": {
      types: ["object"],
      keys: [
        "by_state",
        "controls",
        "decomposition",
        "full_window",
        "name",
        "regime_states",
        "rolling_semantics",
        "seven_factor",
        "stability",
        "status",
        "target",
      ],
      required: [
        "by_state",
        "controls",
        "decomposition",
        "full_window",
        "name",
        "regime_states",
        "rolling_semantics",
        "seven_factor",
        "stability",
        "status",
        "target",
      ],
    },
    "$.payload.factors.by_state": {
      types: ["object"],
      keys: ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
      required: ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
    },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2": {
      types: ["object"],
      keys: [
        "condition",
        "inference",
        "n",
        "r_squared",
        "raw_mean",
        "residual_mean",
        "status",
        "terms",
      ],
      required: [
        "condition",
        "inference",
        "n",
        "r_squared",
        "raw_mean",
        "residual_mean",
        "status",
        "terms",
      ],
    },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.condition": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.inference": { types: ["string"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.n": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.r_squared": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.raw_mean": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.residual_mean": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.status": { types: ["string"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms": { types: ["array"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms[]": {
      types: ["object"],
      keys: ["coefficient", "hac_se", "interval_95", "neutrality", "t", "term"],
      required: ["coefficient", "hac_se", "interval_95", "neutrality", "t", "term"],
    },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms[].coefficient": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms[].hac_se": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms[].interval_95": { types: ["array"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms[].interval_95[]": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms[].neutrality": { types: ["null", "string"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms[].t": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_1_OF_2.terms[].term": { types: ["string"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2": {
      types: ["object"],
      keys: [
        "condition",
        "inference",
        "n",
        "r_squared",
        "raw_mean",
        "residual_mean",
        "status",
        "terms",
      ],
      required: [
        "condition",
        "inference",
        "n",
        "r_squared",
        "raw_mean",
        "residual_mean",
        "status",
        "terms",
      ],
    },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.condition": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.inference": { types: ["string"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.n": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.r_squared": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.raw_mean": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.residual_mean": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.status": { types: ["string"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms": { types: ["array"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms[]": {
      types: ["object"],
      keys: ["coefficient", "hac_se", "interval_95", "neutrality", "t", "term"],
      required: ["coefficient", "hac_se", "interval_95", "neutrality", "t", "term"],
    },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms[].coefficient": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms[].hac_se": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms[].interval_95": { types: ["array"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms[].interval_95[]": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms[].neutrality": { types: ["null", "string"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms[].t": { types: ["number"] },
    "$.payload.factors.by_state.VOL_RANK_2_OF_2.terms[].term": { types: ["string"] },
    "$.payload.factors.controls": { types: ["array"] },
    "$.payload.factors.controls[]": { types: ["string"] },
    "$.payload.factors.decomposition": {
      types: ["object"],
      keys: ["cumulative", "observations", "semantics"],
      required: ["cumulative", "observations", "semantics"],
    },
    "$.payload.factors.decomposition.cumulative": {
      types: ["object"],
      keys: ["explained", "raw", "residual"],
      required: ["explained", "raw", "residual"],
    },
    "$.payload.factors.decomposition.cumulative.explained": { types: ["number"] },
    "$.payload.factors.decomposition.cumulative.raw": { types: ["number"] },
    "$.payload.factors.decomposition.cumulative.residual": { types: ["number"] },
    "$.payload.factors.decomposition.observations": { types: ["number"] },
    "$.payload.factors.decomposition.semantics": { types: ["string"] },
    "$.payload.factors.full_window": {
      types: ["object"],
      keys: [
        "condition",
        "inference",
        "n",
        "r_squared",
        "raw_mean",
        "residual_mean",
        "status",
        "terms",
      ],
      required: [
        "condition",
        "inference",
        "n",
        "r_squared",
        "raw_mean",
        "residual_mean",
        "status",
        "terms",
      ],
    },
    "$.payload.factors.full_window.condition": { types: ["number"] },
    "$.payload.factors.full_window.inference": { types: ["string"] },
    "$.payload.factors.full_window.n": { types: ["number"] },
    "$.payload.factors.full_window.r_squared": { types: ["number"] },
    "$.payload.factors.full_window.raw_mean": { types: ["number"] },
    "$.payload.factors.full_window.residual_mean": { types: ["number"] },
    "$.payload.factors.full_window.status": { types: ["string"] },
    "$.payload.factors.full_window.terms": { types: ["array"] },
    "$.payload.factors.full_window.terms[]": {
      types: ["object"],
      keys: ["coefficient", "hac_se", "interval_95", "neutrality", "t", "term"],
      required: ["coefficient", "hac_se", "interval_95", "neutrality", "t", "term"],
    },
    "$.payload.factors.full_window.terms[].coefficient": { types: ["number"] },
    "$.payload.factors.full_window.terms[].hac_se": { types: ["number"] },
    "$.payload.factors.full_window.terms[].interval_95": { types: ["array"] },
    "$.payload.factors.full_window.terms[].interval_95[]": { types: ["number"] },
    "$.payload.factors.full_window.terms[].neutrality": { types: ["null", "string"] },
    "$.payload.factors.full_window.terms[].t": { types: ["number"] },
    "$.payload.factors.full_window.terms[].term": { types: ["string"] },
    "$.payload.factors.name": { types: ["string"] },
    "$.payload.factors.regime_states": { types: ["string"] },
    "$.payload.factors.rolling_semantics": { types: ["string"] },
    "$.payload.factors.seven_factor": { types: ["string"] },
    "$.payload.factors.stability": { types: ["number"] },
    "$.payload.factors.status": { types: ["string"] },
    "$.payload.factors.target": { types: ["string"] },
    "$.payload.fracture": {
      types: ["object"],
      keys: [
        "available_contribution_sum",
        "contributions",
        "coverage",
        "score",
        "state",
        "status",
        "weights",
      ],
      required: [
        "available_contribution_sum",
        "contributions",
        "coverage",
        "score",
        "state",
        "status",
        "weights",
      ],
    },
    "$.payload.fracture.available_contribution_sum": { types: ["number"] },
    "$.payload.fracture.contributions": {
      types: ["object"],
      keys: ["correlation", "event", "factor", "liquidity", "macro", "volatility"],
      required: ["correlation", "event", "factor", "liquidity", "macro", "volatility"],
    },
    "$.payload.fracture.contributions.correlation": { types: ["null"] },
    "$.payload.fracture.contributions.event": { types: ["null"] },
    "$.payload.fracture.contributions.factor": { types: ["null"] },
    "$.payload.fracture.contributions.liquidity": { types: ["null"] },
    "$.payload.fracture.contributions.macro": { types: ["null"] },
    "$.payload.fracture.contributions.volatility": { types: ["number"] },
    "$.payload.fracture.coverage": { types: ["number"] },
    "$.payload.fracture.score": { types: ["null"] },
    "$.payload.fracture.state": { types: ["string"] },
    "$.payload.fracture.status": { types: ["string"] },
    "$.payload.fracture.weights": {
      types: ["object"],
      keys: ["correlation", "event", "factor", "liquidity", "macro", "volatility"],
      required: ["correlation", "event", "factor", "liquidity", "macro", "volatility"],
    },
    "$.payload.fracture.weights.correlation": { types: ["number"] },
    "$.payload.fracture.weights.event": { types: ["number"] },
    "$.payload.fracture.weights.factor": { types: ["number"] },
    "$.payload.fracture.weights.liquidity": { types: ["number"] },
    "$.payload.fracture.weights.macro": { types: ["number"] },
    "$.payload.fracture.weights.volatility": { types: ["number"] },
    "$.payload.frozen_research": {
      types: ["object"],
      keys: [
        "inference_replacement",
        "note",
        "research_os",
        "sha256",
        "source",
        "title",
        "verdicts",
      ],
      required: [
        "inference_replacement",
        "note",
        "research_os",
        "sha256",
        "source",
        "title",
        "verdicts",
      ],
    },
    "$.payload.frozen_research.inference_replacement": { types: ["string"] },
    "$.payload.frozen_research.note": { types: ["string"] },
    "$.payload.frozen_research.research_os": { types: ["string"] },
    "$.payload.frozen_research.sha256": { types: ["string"] },
    "$.payload.frozen_research.source": { types: ["string"] },
    "$.payload.frozen_research.title": { types: ["string"] },
    "$.payload.frozen_research.verdicts": {
      types: ["object"],
      keys: ["CROSS_MARKET", "ECONOMIC", "REGIME_DEPENDENCE", "STATISTICAL"],
      required: ["CROSS_MARKET", "ECONOMIC", "REGIME_DEPENDENCE", "STATISTICAL"],
    },
    "$.payload.frozen_research.verdicts.CROSS_MARKET": { types: ["string"] },
    "$.payload.frozen_research.verdicts.ECONOMIC": { types: ["string"] },
    "$.payload.frozen_research.verdicts.REGIME_DEPENDENCE": { types: ["string"] },
    "$.payload.frozen_research.verdicts.STATISTICAL": { types: ["string"] },
    "$.payload.hmm": { types: ["object"], keys: ["hmm2", "hmm4"], required: ["hmm2", "hmm4"] },
    "$.payload.hmm.hmm2": {
      types: ["object"],
      keys: [
        "config",
        "converged",
        "convergence_rule",
        "covariances_standardized",
        "current_posterior",
        "current_state",
        "duration_unit",
        "expected_duration",
        "feature_units",
        "features",
        "iterations",
        "labelling_rule",
        "labels",
        "log_likelihood",
        "mahalanobis_current",
        "means_standardized",
        "n_states",
        "occupancy",
        "occupancy_counts",
        "ood",
        "ood_limit",
        "path_semantics",
        "posterior_semantics",
        "posterior_tail",
        "recent_switches",
        "return_mean",
        "return_variance",
        "rows",
        "seed",
        "semantic_hash",
        "status",
        "switch_window",
        "transition_entropy",
        "transition_matrix",
      ],
      required: [
        "config",
        "converged",
        "convergence_rule",
        "covariances_standardized",
        "current_posterior",
        "current_state",
        "duration_unit",
        "expected_duration",
        "feature_units",
        "features",
        "iterations",
        "labelling_rule",
        "labels",
        "log_likelihood",
        "mahalanobis_current",
        "means_standardized",
        "n_states",
        "occupancy",
        "occupancy_counts",
        "ood",
        "ood_limit",
        "path_semantics",
        "posterior_semantics",
        "posterior_tail",
        "recent_switches",
        "return_mean",
        "return_variance",
        "rows",
        "seed",
        "semantic_hash",
        "status",
        "switch_window",
        "transition_entropy",
        "transition_matrix",
      ],
    },
    "$.payload.hmm.hmm2.config": { types: ["string"] },
    "$.payload.hmm.hmm2.converged": { types: ["boolean"] },
    "$.payload.hmm.hmm2.convergence_rule": { types: ["string"] },
    "$.payload.hmm.hmm2.covariances_standardized": { types: ["array"] },
    "$.payload.hmm.hmm2.covariances_standardized[]": { types: ["array"] },
    "$.payload.hmm.hmm2.covariances_standardized[][]": { types: ["array"] },
    "$.payload.hmm.hmm2.covariances_standardized[][][]": { types: ["number"] },
    "$.payload.hmm.hmm2.current_posterior": { types: ["array"] },
    "$.payload.hmm.hmm2.current_posterior[]": { types: ["number"] },
    "$.payload.hmm.hmm2.current_state": { types: ["string"] },
    "$.payload.hmm.hmm2.duration_unit": { types: ["string"] },
    "$.payload.hmm.hmm2.expected_duration": { types: ["array"] },
    "$.payload.hmm.hmm2.expected_duration[]": { types: ["number"] },
    "$.payload.hmm.hmm2.feature_units": { types: ["string"] },
    "$.payload.hmm.hmm2.features": { types: ["array"] },
    "$.payload.hmm.hmm2.features[]": { types: ["string"] },
    "$.payload.hmm.hmm2.iterations": { types: ["number"] },
    "$.payload.hmm.hmm2.labelling_rule": { types: ["string"] },
    "$.payload.hmm.hmm2.labels": { types: ["array"] },
    "$.payload.hmm.hmm2.labels[]": { types: ["string"] },
    "$.payload.hmm.hmm2.log_likelihood": { types: ["number"] },
    "$.payload.hmm.hmm2.mahalanobis_current": { types: ["array"] },
    "$.payload.hmm.hmm2.mahalanobis_current[]": { types: ["number"] },
    "$.payload.hmm.hmm2.means_standardized": { types: ["array"] },
    "$.payload.hmm.hmm2.means_standardized[]": { types: ["array"] },
    "$.payload.hmm.hmm2.means_standardized[][]": { types: ["number"] },
    "$.payload.hmm.hmm2.n_states": { types: ["number"] },
    "$.payload.hmm.hmm2.occupancy": { types: ["array"] },
    "$.payload.hmm.hmm2.occupancy[]": { types: ["number"] },
    "$.payload.hmm.hmm2.occupancy_counts": { types: ["array"] },
    "$.payload.hmm.hmm2.occupancy_counts[]": { types: ["number"] },
    "$.payload.hmm.hmm2.ood": { types: ["boolean"] },
    "$.payload.hmm.hmm2.ood_limit": { types: ["number"] },
    "$.payload.hmm.hmm2.path_semantics": { types: ["string"] },
    "$.payload.hmm.hmm2.posterior_semantics": { types: ["string"] },
    "$.payload.hmm.hmm2.posterior_tail": {
      types: ["object"],
      keys: ["dates", "rows"],
      required: ["dates", "rows"],
    },
    "$.payload.hmm.hmm2.posterior_tail.dates": { types: ["array"] },
    "$.payload.hmm.hmm2.posterior_tail.dates[]": { types: ["string"] },
    "$.payload.hmm.hmm2.posterior_tail.rows": { types: ["array"] },
    "$.payload.hmm.hmm2.posterior_tail.rows[]": { types: ["array"] },
    "$.payload.hmm.hmm2.posterior_tail.rows[][]": { types: ["number"] },
    "$.payload.hmm.hmm2.recent_switches": { types: ["number"] },
    "$.payload.hmm.hmm2.return_mean": { types: ["array"] },
    "$.payload.hmm.hmm2.return_mean[]": { types: ["number"] },
    "$.payload.hmm.hmm2.return_variance": { types: ["array"] },
    "$.payload.hmm.hmm2.return_variance[]": { types: ["number"] },
    "$.payload.hmm.hmm2.rows": { types: ["number"] },
    "$.payload.hmm.hmm2.seed": { types: ["number"] },
    "$.payload.hmm.hmm2.semantic_hash": { types: ["string"] },
    "$.payload.hmm.hmm2.status": { types: ["string"] },
    "$.payload.hmm.hmm2.switch_window": { types: ["number"] },
    "$.payload.hmm.hmm2.transition_entropy": { types: ["array"] },
    "$.payload.hmm.hmm2.transition_entropy[]": { types: ["number"] },
    "$.payload.hmm.hmm2.transition_matrix": { types: ["array"] },
    "$.payload.hmm.hmm2.transition_matrix[]": { types: ["array"] },
    "$.payload.hmm.hmm2.transition_matrix[][]": { types: ["number"] },
    "$.payload.hmm.hmm4": {
      types: ["object"],
      keys: [
        "config",
        "converged",
        "convergence_rule",
        "covariances_standardized",
        "current_posterior",
        "current_state",
        "duration_unit",
        "expected_duration",
        "feature_units",
        "features",
        "iterations",
        "labelling_rule",
        "labels",
        "log_likelihood",
        "mahalanobis_current",
        "means_standardized",
        "n_states",
        "occupancy",
        "occupancy_counts",
        "ood",
        "ood_limit",
        "path_semantics",
        "posterior_semantics",
        "posterior_tail",
        "recent_switches",
        "return_mean",
        "return_variance",
        "rows",
        "seed",
        "semantic_hash",
        "status",
        "switch_window",
        "transition_entropy",
        "transition_matrix",
      ],
      required: [
        "config",
        "converged",
        "convergence_rule",
        "covariances_standardized",
        "current_posterior",
        "current_state",
        "duration_unit",
        "expected_duration",
        "feature_units",
        "features",
        "iterations",
        "labelling_rule",
        "labels",
        "log_likelihood",
        "mahalanobis_current",
        "means_standardized",
        "n_states",
        "occupancy",
        "occupancy_counts",
        "ood",
        "ood_limit",
        "path_semantics",
        "posterior_semantics",
        "posterior_tail",
        "recent_switches",
        "return_mean",
        "return_variance",
        "rows",
        "seed",
        "semantic_hash",
        "status",
        "switch_window",
        "transition_entropy",
        "transition_matrix",
      ],
    },
    "$.payload.hmm.hmm4.config": { types: ["string"] },
    "$.payload.hmm.hmm4.converged": { types: ["boolean"] },
    "$.payload.hmm.hmm4.convergence_rule": { types: ["string"] },
    "$.payload.hmm.hmm4.covariances_standardized": { types: ["array"] },
    "$.payload.hmm.hmm4.covariances_standardized[]": { types: ["array"] },
    "$.payload.hmm.hmm4.covariances_standardized[][]": { types: ["array"] },
    "$.payload.hmm.hmm4.covariances_standardized[][][]": { types: ["number"] },
    "$.payload.hmm.hmm4.current_posterior": { types: ["array"] },
    "$.payload.hmm.hmm4.current_posterior[]": { types: ["number"] },
    "$.payload.hmm.hmm4.current_state": { types: ["string"] },
    "$.payload.hmm.hmm4.duration_unit": { types: ["string"] },
    "$.payload.hmm.hmm4.expected_duration": { types: ["array"] },
    "$.payload.hmm.hmm4.expected_duration[]": { types: ["number"] },
    "$.payload.hmm.hmm4.feature_units": { types: ["string"] },
    "$.payload.hmm.hmm4.features": { types: ["array"] },
    "$.payload.hmm.hmm4.features[]": { types: ["string"] },
    "$.payload.hmm.hmm4.iterations": { types: ["number"] },
    "$.payload.hmm.hmm4.labelling_rule": { types: ["string"] },
    "$.payload.hmm.hmm4.labels": { types: ["array"] },
    "$.payload.hmm.hmm4.labels[]": { types: ["string"] },
    "$.payload.hmm.hmm4.log_likelihood": { types: ["number"] },
    "$.payload.hmm.hmm4.mahalanobis_current": { types: ["array"] },
    "$.payload.hmm.hmm4.mahalanobis_current[]": { types: ["number"] },
    "$.payload.hmm.hmm4.means_standardized": { types: ["array"] },
    "$.payload.hmm.hmm4.means_standardized[]": { types: ["array"] },
    "$.payload.hmm.hmm4.means_standardized[][]": { types: ["number"] },
    "$.payload.hmm.hmm4.n_states": { types: ["number"] },
    "$.payload.hmm.hmm4.occupancy": { types: ["array"] },
    "$.payload.hmm.hmm4.occupancy[]": { types: ["number"] },
    "$.payload.hmm.hmm4.occupancy_counts": { types: ["array"] },
    "$.payload.hmm.hmm4.occupancy_counts[]": { types: ["number"] },
    "$.payload.hmm.hmm4.ood": { types: ["boolean"] },
    "$.payload.hmm.hmm4.ood_limit": { types: ["number"] },
    "$.payload.hmm.hmm4.path_semantics": { types: ["string"] },
    "$.payload.hmm.hmm4.posterior_semantics": { types: ["string"] },
    "$.payload.hmm.hmm4.posterior_tail": {
      types: ["object"],
      keys: ["dates", "rows"],
      required: ["dates", "rows"],
    },
    "$.payload.hmm.hmm4.posterior_tail.dates": { types: ["array"] },
    "$.payload.hmm.hmm4.posterior_tail.dates[]": { types: ["string"] },
    "$.payload.hmm.hmm4.posterior_tail.rows": { types: ["array"] },
    "$.payload.hmm.hmm4.posterior_tail.rows[]": { types: ["array"] },
    "$.payload.hmm.hmm4.posterior_tail.rows[][]": { types: ["number"] },
    "$.payload.hmm.hmm4.recent_switches": { types: ["number"] },
    "$.payload.hmm.hmm4.return_mean": { types: ["array"] },
    "$.payload.hmm.hmm4.return_mean[]": { types: ["number"] },
    "$.payload.hmm.hmm4.return_variance": { types: ["array"] },
    "$.payload.hmm.hmm4.return_variance[]": { types: ["number"] },
    "$.payload.hmm.hmm4.rows": { types: ["number"] },
    "$.payload.hmm.hmm4.seed": { types: ["number"] },
    "$.payload.hmm.hmm4.semantic_hash": { types: ["string"] },
    "$.payload.hmm.hmm4.status": { types: ["string"] },
    "$.payload.hmm.hmm4.switch_window": { types: ["number"] },
    "$.payload.hmm.hmm4.transition_entropy": { types: ["array"] },
    "$.payload.hmm.hmm4.transition_entropy[]": { types: ["number"] },
    "$.payload.hmm.hmm4.transition_matrix": { types: ["array"] },
    "$.payload.hmm.hmm4.transition_matrix[]": { types: ["array"] },
    "$.payload.hmm.hmm4.transition_matrix[][]": { types: ["number"] },
    "$.payload.input_hash": { types: ["string"] },
    "$.payload.issues": { types: ["array"] },
    "$.payload.issues[]": {
      types: ["object"],
      keys: ["asset", "evidence", "id", "kind", "reason", "severity", "status"],
      required: ["asset", "evidence", "id", "kind", "reason", "severity", "status"],
    },
    "$.payload.issues[].asset": { types: ["string"] },
    "$.payload.issues[].evidence": { types: ["string"] },
    "$.payload.issues[].id": { types: ["string"] },
    "$.payload.issues[].kind": { types: ["string"] },
    "$.payload.issues[].reason": { types: ["string"] },
    "$.payload.issues[].severity": { types: ["string"] },
    "$.payload.issues[].status": { types: ["string"] },
    "$.payload.layers": {
      types: ["object"],
      keys: ["current", "sealed", "within_run"],
      required: ["current", "sealed", "within_run"],
    },
    "$.payload.layers.current": { types: ["string"] },
    "$.payload.layers.sealed": { types: ["string"] },
    "$.payload.layers.within_run": { types: ["string"] },
    "$.payload.market": { types: ["string"] },
    "$.payload.module_statuses": {
      types: ["object"],
      keys: [
        "coupling",
        "events",
        "factors",
        "fracture",
        "hmm",
        "hmm4",
        "iohmm",
        "momentum",
        "seasonality",
        "volatility",
      ],
      required: [
        "coupling",
        "events",
        "factors",
        "fracture",
        "hmm",
        "hmm4",
        "iohmm",
        "momentum",
        "seasonality",
        "volatility",
      ],
    },
    "$.payload.module_statuses.coupling": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.coupling.badges": { types: ["array"] },
    "$.payload.module_statuses.coupling.reason": { types: ["null", "string"] },
    "$.payload.module_statuses.coupling.status": { types: ["string"] },
    "$.payload.module_statuses.coupling.unblock": { types: ["null"] },
    "$.payload.module_statuses.events": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.events.badges": { types: ["array"] },
    "$.payload.module_statuses.events.reason": { types: ["string"] },
    "$.payload.module_statuses.events.status": { types: ["string"] },
    "$.payload.module_statuses.events.unblock": { types: ["string"] },
    "$.payload.module_statuses.factors": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.factors.badges": { types: ["array"] },
    "$.payload.module_statuses.factors.reason": { types: ["string"] },
    "$.payload.module_statuses.factors.status": { types: ["string"] },
    "$.payload.module_statuses.factors.unblock": { types: ["null"] },
    "$.payload.module_statuses.fracture": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.fracture.badges": { types: ["array"] },
    "$.payload.module_statuses.fracture.reason": { types: ["string"] },
    "$.payload.module_statuses.fracture.status": { types: ["string"] },
    "$.payload.module_statuses.fracture.unblock": { types: ["null"] },
    "$.payload.module_statuses.hmm": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.hmm.badges": { types: ["array"] },
    "$.payload.module_statuses.hmm.reason": { types: ["null", "string"] },
    "$.payload.module_statuses.hmm.status": { types: ["string"] },
    "$.payload.module_statuses.hmm.unblock": { types: ["null"] },
    "$.payload.module_statuses.hmm4": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.hmm4.badges": { types: ["array"] },
    "$.payload.module_statuses.hmm4.reason": { types: ["null", "string"] },
    "$.payload.module_statuses.hmm4.status": { types: ["string"] },
    "$.payload.module_statuses.hmm4.unblock": { types: ["null"] },
    "$.payload.module_statuses.iohmm": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.iohmm.badges": { types: ["array"] },
    "$.payload.module_statuses.iohmm.reason": { types: ["string"] },
    "$.payload.module_statuses.iohmm.status": { types: ["string"] },
    "$.payload.module_statuses.iohmm.unblock": { types: ["null"] },
    "$.payload.module_statuses.momentum": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.momentum.badges": { types: ["array"] },
    "$.payload.module_statuses.momentum.reason": { types: ["null", "string"] },
    "$.payload.module_statuses.momentum.status": { types: ["string"] },
    "$.payload.module_statuses.momentum.unblock": { types: ["null"] },
    "$.payload.module_statuses.seasonality": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.seasonality.badges": { types: ["array"] },
    "$.payload.module_statuses.seasonality.reason": { types: ["string"] },
    "$.payload.module_statuses.seasonality.status": { types: ["string"] },
    "$.payload.module_statuses.seasonality.unblock": { types: ["string"] },
    "$.payload.module_statuses.volatility": {
      types: ["object"],
      keys: ["badges", "reason", "status", "unblock"],
      required: ["badges", "reason", "status", "unblock"],
    },
    "$.payload.module_statuses.volatility.badges": { types: ["array"] },
    "$.payload.module_statuses.volatility.reason": { types: ["null", "string"] },
    "$.payload.module_statuses.volatility.status": { types: ["string"] },
    "$.payload.module_statuses.volatility.unblock": { types: ["null"] },
    "$.payload.momentum": {
      types: ["object"],
      keys: [
        "definition",
        "index_label",
        "mom_factor_by_regime",
        "mom_factor_semantics",
        "signal_by_state",
        "signal_by_state_semantics",
        "status",
        "verdicts",
      ],
      required: [
        "definition",
        "index_label",
        "mom_factor_by_regime",
        "mom_factor_semantics",
        "signal_by_state",
        "signal_by_state_semantics",
        "status",
        "verdicts",
      ],
    },
    "$.payload.momentum.definition": { types: ["string"] },
    "$.payload.momentum.index_label": { types: ["string"] },
    "$.payload.momentum.mom_factor_by_regime": {
      types: ["object"],
      keys: ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
      required: ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
    },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2": {
      types: ["object"],
      keys: [
        "descriptive_sharpe",
        "mad",
        "mean",
        "median",
        "n",
        "positive_fraction",
        "sd",
        "sharpe_unit",
      ],
      required: [
        "descriptive_sharpe",
        "mad",
        "mean",
        "median",
        "n",
        "positive_fraction",
        "sd",
        "sharpe_unit",
      ],
    },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2.descriptive_sharpe": {
      types: ["number"],
    },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2.mad": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2.mean": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2.median": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2.n": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2.positive_fraction": {
      types: ["number"],
    },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2.sd": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_1_OF_2.sharpe_unit": { types: ["string"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2": {
      types: ["object"],
      keys: [
        "descriptive_sharpe",
        "mad",
        "mean",
        "median",
        "n",
        "positive_fraction",
        "sd",
        "sharpe_unit",
      ],
      required: [
        "descriptive_sharpe",
        "mad",
        "mean",
        "median",
        "n",
        "positive_fraction",
        "sd",
        "sharpe_unit",
      ],
    },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2.descriptive_sharpe": {
      types: ["number"],
    },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2.mad": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2.mean": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2.median": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2.n": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2.positive_fraction": {
      types: ["number"],
    },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2.sd": { types: ["number"] },
    "$.payload.momentum.mom_factor_by_regime.VOL_RANK_2_OF_2.sharpe_unit": { types: ["string"] },
    "$.payload.momentum.mom_factor_semantics": { types: ["string"] },
    "$.payload.momentum.signal_by_state": {
      types: ["object"],
      keys: ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
      required: ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
    },
    "$.payload.momentum.signal_by_state.VOL_RANK_1_OF_2": {
      types: ["object"],
      keys: ["mad", "mean", "median", "n", "positive_fraction", "sd"],
      required: ["mad", "mean", "median", "n", "positive_fraction", "sd"],
    },
    "$.payload.momentum.signal_by_state.VOL_RANK_1_OF_2.mad": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_1_OF_2.mean": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_1_OF_2.median": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_1_OF_2.n": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_1_OF_2.positive_fraction": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_1_OF_2.sd": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_2_OF_2": {
      types: ["object"],
      keys: ["mad", "mean", "median", "n", "positive_fraction", "sd"],
      required: ["mad", "mean", "median", "n", "positive_fraction", "sd"],
    },
    "$.payload.momentum.signal_by_state.VOL_RANK_2_OF_2.mad": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_2_OF_2.mean": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_2_OF_2.median": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_2_OF_2.n": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_2_OF_2.positive_fraction": { types: ["number"] },
    "$.payload.momentum.signal_by_state.VOL_RANK_2_OF_2.sd": { types: ["number"] },
    "$.payload.momentum.signal_by_state_semantics": { types: ["string"] },
    "$.payload.momentum.status": { types: ["string"] },
    "$.payload.momentum.verdicts": { types: ["string"] },
    "$.payload.not_a": { types: ["string"] },
    "$.payload.observation_unit": { types: ["string"] },
    "$.payload.profile_sha256": { types: ["string"] },
    "$.payload.requested_as_of": { types: ["string"] },
    "$.payload.run_ids": {
      types: ["object"],
      keys: ["factors", "hmm2", "hmm4", "momentum", "volatility"],
      required: ["factors", "hmm2", "hmm4", "momentum", "volatility"],
    },
    "$.payload.run_ids.factors": { types: ["string"] },
    "$.payload.run_ids.hmm2": { types: ["string"] },
    "$.payload.run_ids.hmm4": { types: ["string"] },
    "$.payload.run_ids.momentum": { types: ["string"] },
    "$.payload.run_ids.volatility": { types: ["string"] },
    "$.payload.series_label": { types: ["string"] },
    "$.payload.stale_calendar_days": { types: ["number"] },
    "$.payload.state_at": { types: ["string"] },
    "$.payload.tier": { types: ["string"] },
    "$.payload.volatility": {
      types: ["object"],
      keys: [
        "arch_lm",
        "cluster_contributions",
        "cluster_score",
        "components",
        "confidence_meaning",
        "descriptive_engine",
        "garch",
        "state_counts",
        "status",
      ],
      required: [
        "arch_lm",
        "cluster_contributions",
        "cluster_score",
        "components",
        "confidence_meaning",
        "descriptive_engine",
        "garch",
        "state_counts",
        "status",
      ],
    },
    "$.payload.volatility.arch_lm": {
      types: ["object"],
      keys: [
        "f_pvalue",
        "f_statistic",
        "inference",
        "lags",
        "lm_pvalue",
        "lm_statistic",
        "observations",
        "semantics",
        "status",
      ],
      required: [
        "f_pvalue",
        "f_statistic",
        "inference",
        "lags",
        "lm_pvalue",
        "lm_statistic",
        "observations",
        "semantics",
        "status",
      ],
    },
    "$.payload.volatility.arch_lm.f_pvalue": { types: ["number"] },
    "$.payload.volatility.arch_lm.f_statistic": { types: ["number"] },
    "$.payload.volatility.arch_lm.inference": { types: ["string"] },
    "$.payload.volatility.arch_lm.lags": { types: ["number"] },
    "$.payload.volatility.arch_lm.lm_pvalue": { types: ["number"] },
    "$.payload.volatility.arch_lm.lm_statistic": { types: ["number"] },
    "$.payload.volatility.arch_lm.observations": { types: ["number"] },
    "$.payload.volatility.arch_lm.semantics": { types: ["string"] },
    "$.payload.volatility.arch_lm.status": { types: ["string"] },
    "$.payload.volatility.cluster_contributions": {
      types: ["object"],
      keys: ["absolute_dependence", "persistence", "squared_dependence", "vol_level"],
      required: ["absolute_dependence", "persistence", "squared_dependence", "vol_level"],
    },
    "$.payload.volatility.cluster_contributions.absolute_dependence": { types: ["number"] },
    "$.payload.volatility.cluster_contributions.persistence": { types: ["number"] },
    "$.payload.volatility.cluster_contributions.squared_dependence": { types: ["number"] },
    "$.payload.volatility.cluster_contributions.vol_level": { types: ["number"] },
    "$.payload.volatility.cluster_score": { types: ["number"] },
    "$.payload.volatility.components": {
      types: ["object"],
      keys: [
        "abs_return_ac",
        "break_ratio",
        "ewma_vol",
        "observations",
        "persistence",
        "realized_vol",
        "rolling_variance",
        "rv_20",
        "rv_5",
        "rv_60",
        "shock_score",
        "squared_return_ac",
        "vol_of_vol",
        "vol_z",
      ],
      required: [
        "abs_return_ac",
        "break_ratio",
        "ewma_vol",
        "observations",
        "persistence",
        "realized_vol",
        "rolling_variance",
        "rv_20",
        "rv_5",
        "rv_60",
        "shock_score",
        "squared_return_ac",
        "vol_of_vol",
        "vol_z",
      ],
    },
    "$.payload.volatility.components.abs_return_ac": { types: ["number"] },
    "$.payload.volatility.components.break_ratio": { types: ["number"] },
    "$.payload.volatility.components.ewma_vol": { types: ["number"] },
    "$.payload.volatility.components.observations": { types: ["number"] },
    "$.payload.volatility.components.persistence": { types: ["number"] },
    "$.payload.volatility.components.realized_vol": { types: ["number"] },
    "$.payload.volatility.components.rolling_variance": { types: ["number"] },
    "$.payload.volatility.components.rv_20": { types: ["number"] },
    "$.payload.volatility.components.rv_5": { types: ["number"] },
    "$.payload.volatility.components.rv_60": { types: ["number"] },
    "$.payload.volatility.components.shock_score": { types: ["number"] },
    "$.payload.volatility.components.squared_return_ac": { types: ["number"] },
    "$.payload.volatility.components.vol_of_vol": { types: ["number"] },
    "$.payload.volatility.components.vol_z": { types: ["number"] },
    "$.payload.volatility.confidence_meaning": { types: ["string"] },
    "$.payload.volatility.descriptive_engine": { types: ["string"] },
    "$.payload.volatility.garch": {
      types: ["object"],
      keys: [
        "alpha",
        "arch_identification",
        "beta",
        "converged",
        "estimator",
        "fit_status",
        "half_life_domain",
        "half_life_observations",
        "inference",
        "log_likelihood",
        "mu_percent",
        "observations",
        "omega_percent2",
        "optimizer_message",
        "persistence",
        "robust_pvalues",
        "robust_std_err",
        "status",
        "unconditional_vol",
        "units",
      ],
      required: [
        "alpha",
        "beta",
        "converged",
        "estimator",
        "fit_status",
        "half_life_domain",
        "half_life_observations",
        "inference",
        "log_likelihood",
        "mu_percent",
        "observations",
        "omega_percent2",
        "optimizer_message",
        "persistence",
        "robust_pvalues",
        "robust_std_err",
        "status",
        "unconditional_vol",
        "units",
      ],
    },
    "$.payload.volatility.garch.alpha": { types: ["number"] },
    "$.payload.volatility.garch.arch_identification": {
      types: ["object"],
      keys: ["alpha_lower_95", "identified", "rule"],
      required: ["alpha_lower_95", "identified", "rule"],
    },
    "$.payload.volatility.garch.arch_identification.alpha_lower_95": { types: ["number"] },
    "$.payload.volatility.garch.arch_identification.identified": { types: ["boolean"] },
    "$.payload.volatility.garch.arch_identification.rule": { types: ["string"] },
    "$.payload.volatility.garch.beta": { types: ["number"] },
    "$.payload.volatility.garch.converged": { types: ["boolean"] },
    "$.payload.volatility.garch.estimator": { types: ["string"] },
    "$.payload.volatility.garch.fit_status": { types: ["string"] },
    "$.payload.volatility.garch.half_life_domain": { types: ["string"] },
    "$.payload.volatility.garch.half_life_observations": { types: ["number"] },
    "$.payload.volatility.garch.inference": { types: ["string"] },
    "$.payload.volatility.garch.log_likelihood": { types: ["number"] },
    "$.payload.volatility.garch.mu_percent": { types: ["number"] },
    "$.payload.volatility.garch.observations": { types: ["number"] },
    "$.payload.volatility.garch.omega_percent2": { types: ["number"] },
    "$.payload.volatility.garch.optimizer_message": { types: ["string"] },
    "$.payload.volatility.garch.persistence": { types: ["number"] },
    "$.payload.volatility.garch.robust_pvalues": {
      types: ["object"],
      keys: ["alpha[1]", "beta[1]", "mu", "omega"],
      required: ["alpha[1]", "beta[1]", "mu", "omega"],
    },
    "$.payload.volatility.garch.robust_pvalues.alpha[1]": { types: ["number"] },
    "$.payload.volatility.garch.robust_pvalues.beta[1]": { types: ["number"] },
    "$.payload.volatility.garch.robust_pvalues.mu": { types: ["number"] },
    "$.payload.volatility.garch.robust_pvalues.omega": { types: ["number"] },
    "$.payload.volatility.garch.robust_std_err": {
      types: ["object"],
      keys: ["alpha[1]", "beta[1]", "mu", "omega"],
      required: ["alpha[1]", "beta[1]", "mu", "omega"],
    },
    "$.payload.volatility.garch.robust_std_err.alpha[1]": { types: ["number"] },
    "$.payload.volatility.garch.robust_std_err.beta[1]": { types: ["number"] },
    "$.payload.volatility.garch.robust_std_err.mu": { types: ["number"] },
    "$.payload.volatility.garch.robust_std_err.omega": { types: ["number"] },
    "$.payload.volatility.garch.status": { types: ["string"] },
    "$.payload.volatility.garch.unconditional_vol": { types: ["number"] },
    "$.payload.volatility.garch.units": { types: ["string"] },
    "$.payload.volatility.state_counts": {
      types: ["object"],
      keys: [
        "HIGH_VOL",
        "LOW_VOL",
        "NORMAL",
        "UNRESOLVED",
        "VOL_BREAK",
        "VOL_CLUSTER",
        "VOL_SHOCK",
      ],
      required: [
        "HIGH_VOL",
        "LOW_VOL",
        "NORMAL",
        "UNRESOLVED",
        "VOL_BREAK",
        "VOL_CLUSTER",
        "VOL_SHOCK",
      ],
    },
    "$.payload.volatility.state_counts.HIGH_VOL": { types: ["number"] },
    "$.payload.volatility.state_counts.LOW_VOL": { types: ["number"] },
    "$.payload.volatility.state_counts.NORMAL": { types: ["number"] },
    "$.payload.volatility.state_counts.UNRESOLVED": { types: ["number"] },
    "$.payload.volatility.state_counts.VOL_BREAK": { types: ["number"] },
    "$.payload.volatility.state_counts.VOL_CLUSTER": { types: ["number"] },
    "$.payload.volatility.state_counts.VOL_SHOCK": { types: ["number"] },
    "$.payload.volatility.status": { types: ["string"] },
    "$.schema_version": { types: ["string"] },
    "$.sources": { types: ["array"] },
    "$.sources[]": { types: ["string"] },
    "$.payload.calendar.mic": { types: ["string"] },
    "$.payload.calendar.reason": { types: ["string"] },
  },
  "regimes-timeline": {
    $: {
      types: ["object"],
      keys: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      required: ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
    },
    "$.as_of": { types: ["string"] },
    "$.claims": {
      types: ["object"],
      keys: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
      required: [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
    },
    "$.claims.causal_claim_eligible": { types: ["boolean"] },
    "$.claims.inference_certified": { types: ["boolean"] },
    "$.claims.market_claim_eligible": { types: ["boolean"] },
    "$.claims.precise_edge_confidence": { types: ["boolean"] },
    "$.claims.trusted_graph": { types: ["boolean"] },
    "$.claims.validated_alpha": { types: ["boolean"] },
    "$.input_hash": { types: ["string"] },
    "$.kind": { types: ["string"] },
    "$.payload": {
      types: ["object"],
      keys: [
        "asset",
        "dates",
        "hmm2",
        "hmm4",
        "momentum_signal_tail",
        "observation_unit",
        "path_semantics",
        "posterior_semantics",
        "run_ids",
        "volatility",
      ],
      required: [
        "asset",
        "dates",
        "hmm2",
        "hmm4",
        "momentum_signal_tail",
        "observation_unit",
        "path_semantics",
        "posterior_semantics",
        "run_ids",
        "volatility",
      ],
    },
    "$.payload.asset": { types: ["string"] },
    "$.payload.dates": { types: ["array"] },
    "$.payload.dates[]": { types: ["string"] },
    "$.payload.hmm2": {
      types: ["object"],
      keys: ["confidence", "labels", "offset", "state_codes"],
      required: ["confidence", "labels", "offset", "state_codes"],
    },
    "$.payload.hmm2.confidence": { types: ["array"] },
    "$.payload.hmm2.confidence[]": { types: ["number"] },
    "$.payload.hmm2.labels": { types: ["array"] },
    "$.payload.hmm2.labels[]": { types: ["string"] },
    "$.payload.hmm2.offset": { types: ["number"] },
    "$.payload.hmm2.state_codes": { types: ["array"] },
    "$.payload.hmm2.state_codes[]": { types: ["number"] },
    "$.payload.hmm4": {
      types: ["object"],
      keys: ["confidence", "labels", "offset", "state_codes"],
      required: ["confidence", "labels", "offset", "state_codes"],
    },
    "$.payload.hmm4.confidence": { types: ["array"] },
    "$.payload.hmm4.confidence[]": { types: ["number"] },
    "$.payload.hmm4.labels": { types: ["array"] },
    "$.payload.hmm4.labels[]": { types: ["string"] },
    "$.payload.hmm4.offset": { types: ["number"] },
    "$.payload.hmm4.state_codes": { types: ["array"] },
    "$.payload.hmm4.state_codes[]": { types: ["number"] },
    "$.payload.momentum_signal_tail": { types: ["array"] },
    "$.payload.momentum_signal_tail[]": { types: ["array"] },
    "$.payload.momentum_signal_tail[][]": { types: ["string", "number"] },
    "$.payload.observation_unit": { types: ["string"] },
    "$.payload.path_semantics": { types: ["string"] },
    "$.payload.posterior_semantics": { types: ["string"] },
    "$.payload.run_ids": {
      types: ["object"],
      keys: ["factors", "hmm2", "hmm4", "momentum", "volatility"],
      required: ["factors", "hmm2", "hmm4", "momentum", "volatility"],
    },
    "$.payload.run_ids.factors": { types: ["string"] },
    "$.payload.run_ids.hmm2": { types: ["string"] },
    "$.payload.run_ids.hmm4": { types: ["string"] },
    "$.payload.run_ids.momentum": { types: ["string"] },
    "$.payload.run_ids.volatility": { types: ["string"] },
    "$.payload.volatility": {
      types: ["object"],
      keys: ["rv_20", "rv_unit", "state_codes", "states", "tail"],
      required: ["rv_20", "rv_unit", "state_codes", "states", "tail"],
    },
    "$.payload.volatility.rv_20": { types: ["array"] },
    "$.payload.volatility.rv_20[]": { types: ["null", "number"] },
    "$.payload.volatility.rv_unit": { types: ["string"] },
    "$.payload.volatility.state_codes": { types: ["array"] },
    "$.payload.volatility.state_codes[]": { types: ["number"] },
    "$.payload.volatility.states": { types: ["array"] },
    "$.payload.volatility.states[]": { types: ["string"] },
    "$.payload.volatility.tail": { types: ["array"] },
    "$.payload.volatility.tail[]": {
      types: ["object"],
      keys: [
        "cluster_score",
        "ewma_vol",
        "garch_vol",
        "observed_at",
        "rv_20",
        "rv_5",
        "rv_60",
        "state",
        "vol_z",
      ],
      required: [
        "cluster_score",
        "ewma_vol",
        "garch_vol",
        "observed_at",
        "rv_20",
        "rv_5",
        "rv_60",
        "state",
        "vol_z",
      ],
    },
    "$.payload.volatility.tail[].cluster_score": { types: ["number"] },
    "$.payload.volatility.tail[].ewma_vol": { types: ["number"] },
    "$.payload.volatility.tail[].garch_vol": { types: ["number"] },
    "$.payload.volatility.tail[].observed_at": { types: ["string"] },
    "$.payload.volatility.tail[].rv_20": { types: ["number"] },
    "$.payload.volatility.tail[].rv_5": { types: ["number"] },
    "$.payload.volatility.tail[].rv_60": { types: ["number"] },
    "$.payload.volatility.tail[].state": { types: ["string"] },
    "$.payload.volatility.tail[].vol_z": { types: ["number"] },
    "$.schema_version": { types: ["string"] },
    "$.sources": { types: ["array"] },
    "$.sources[]": { types: ["string"] },
  },
};
export const TERMINAL_GENERATED_MODULE_NAMES = [...SHARD_NAMES, "observatory-window"];
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const seal = (value) => hash(Buffer.from(stableTerminal(value)));
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const dataKinds = ["health", "coverage", "issues", "lineage", "revisions", "costs", "disagreement"];
const regimeKinds = ["snapshot", "timeline", "factors", "lineage", "history", "matrix"];
const claimKeys = [
  "causal_claim_eligible",
  "inference_certified",
  "market_claim_eligible",
  "precise_edge_confidence",
  "trusted_graph",
  "validated_alpha",
];
const marketFor = (asset) => (asset === "IN-MKT" ? "INDIA" : asset === "US-MKT" ? "US" : undefined);
const assetFor = (market) => (market === "INDIA" ? "IN-MKT" : "US-MKT");
const day = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
function checkClaims(value, path = "root") {
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkClaims(v, path + "." + i));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value)) {
    if (key === "claims" || key === "claim_flags")
      assert(
        Object.values(v).every((x) => x === false),
        "Scientific claim promoted: " + path,
      );
    checkClaims(v, path + "." + key);
  }
}
function closedSource(value, contract, path = "$") {
  const rule = CLOSED_SOURCE_FIELDS[contract]?.[path];
  assert(rule, "Unreviewed source contract path: " + contract + path);
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  assert(rule.types.includes(type), "Source type changed: " + contract + path);
  if (Array.isArray(value)) for (const item of value) closedSource(item, contract, path + "[]");
  else if (value && typeof value === "object") {
    assert(
      Object.keys(value).every((k) => rule.keys.includes(k)),
      "Unknown source field: " + contract + path,
    );
    assert(
      rule.required.every((k) => Object.hasOwn(value, k)),
      "Missing source field: " + contract + path,
    );
    for (const [key, item] of Object.entries(value)) closedSource(item, contract, path + "." + key);
  }
}
export async function validateTerminalSource(id, entry, value) {
  assertDerivedPayload(value);
  checkClaims(value);
  if (entry.kind.startsWith("data-organ-")) {
    const kind = entry.kind.slice(11);
    assert(dataKinds.includes(kind));
    validateDataBinding(validateDataEnvelope(value, kind), entry);
  } else if (entry.kind.startsWith("regimes-")) {
    const kind = entry.kind.slice(8);
    assert(regimeKinds.includes(kind));
    if (kind !== "factors") closedSource(value, "regimes-" + kind);
    else
      assert.equal(
        Object.keys(value).sort().join(),
        CLOSED_SOURCE_FIELDS["regimes-snapshot"]["$"].keys.slice().sort().join(),
        "Undeclared Regime factor envelope field",
      );
    const result = validateEnvelope(value, kind);
    assert.equal(result.mode, "replay");
    assert.equal(result.asOf, entry.as_of);
    assert.equal(result.inputHash, entry.input_hash);
    assert.equal(stableTerminal(result.sources), stableTerminal(entry.sources));
    if (value.payload.asset) {
      const expectedSource =
        value.payload.asset === "US-MKT" ? "ken-french:daily-factors" : "iima:daily-factors";
      assert.equal(stableTerminal(value.sources), stableTerminal([expectedSource]));
    }
  } else if (entry.kind.startsWith("factors-")) {
    const kind = entry.kind.slice(8),
      selected = Object.entries(KNOWN_IDS).find(([, ids]) => ids[kind] === id)?.[0];
    assert(selected, "Factor metadata has no reviewed selection");
    assert.equal(stableTerminal(KNOWN_METADATA_ENTRIES[id]), stableTerminal(entry));
    const [country, cutoff] = selected.split("|");
    validateMetadata(value, kind, country, cutoff);
  } else if (entry.kind === "market-series") {
    closedSource(value, "market-series");
    validateMarketReplay(value, id.slice(7), entry.as_of);
    assert.equal(value.method.hmm.source_input_hash, entry.input_hash);
  } else if (entry.kind === "risk-state" || entry.kind === "risk-sweep") {
    const result = validateRisk(value, entry.kind);
    await verifyRiskIdentity(result);
    assert.equal(result.input_hash, entry.input_hash);
    assert.equal(result.published_at, entry.as_of);
  } else if (entry.kind === "hmm" || entry.kind === "signal") {
    closedSource(value, "trace-" + entry.kind);
    const result = validateTrace(value, {
      kind: entry.kind,
      ticker: id.split(":")[1],
      asOf: entry.as_of,
    });
    assert.equal(result.provenance.input_hash, entry.input_hash);
  } else if (id === "forge:runs") {
    closedSource(value, "forge-runs");
    adaptRunIndex(value);
  } else throw new Error("No approved source projection contract: " + id);
  return value;
}
function newPayload() {
  return { bindings: {}, routes: {}, entities: [], edges: [], projections: [], bundles: [] };
}
function unique(items, key) {
  const result = new Map();
  for (const item of items) {
    const k = key(item),
      prior = result.get(k);
    if (prior)
      assert.equal(
        stableTerminal(prior),
        stableTerminal(item),
        "Conflicting retained metadata: " + k,
      );
    result.set(k, item);
  }
  return [...result.values()];
}
export async function deriveTerminalCatalog(manifest, { manifestBytes, readArtifactBytes }) {
  validateReplayManifest(manifest);
  assert(
    manifestBytes && hash(manifestBytes) && typeof readArtifactBytes === "function",
    "Exact manifest bytes and source reader required",
  );
  assert.equal(
    stableTerminal(strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes))),
    stableTerminal(manifest),
    "Manifest snapshot substituted",
  );
  const payloads = Object.fromEntries(SHARD_NAMES.map((name) => [name, newPayload()])),
    values = new Map(),
    sourceChecks = [],
    closedReadSet = new Set();
  const manifestBinding = {
    sha256: hash(manifestBytes),
    bytes: manifestBytes.length,
    asOf: manifest.as_of,
  };
  async function source(id) {
    if (values.has(id)) return values.get(id);
    const entry = manifest.artifacts[id];
    assert(entry?.status === "AVAILABLE", "Unadmitted terminal source: " + id);
    assert(
      ["ACTIVE", "FIRST_PARTY", "PUBLIC_DOMAIN", "TEST_ONLY"].includes(entry.licence.status) &&
        entry.licence.permitted_uses.includes("publish_derived"),
      "No publication grant: " + id,
    );
    assert(
      entry.licence.valid_through === null ||
        Date.parse(entry.licence.valid_through) > Date.parse(entry.as_of),
      "Expired terminal source grant",
    );
    assert(
      entry.bytes <= 16 * 1024 * 1024 &&
        /^\/artifacts\/replay\/[a-zA-Z0-9_.-]+\.json$/.test(entry.url),
      "Terminal source read bound/path",
    );
    const bytes = Buffer.from(await readArtifactBytes(id, entry));
    assert.equal(bytes.length, entry.bytes, "Original byte count changed: " + id);
    assert.equal(hash(bytes), entry.sha256, "Original checksum changed: " + id);
    const value = strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    await validateTerminalSource(id, entry, value);
    values.set(id, value);
    closedReadSet.add(id);
    sourceChecks.push({
      artifactId: id,
      sha256: entry.sha256,
      bytes: entry.bytes,
      kind: entry.kind,
      status: "VERIFIED_COMPLETE_ORIGINAL",
    });
    return value;
  }
  function binding(name, id) {
    const entry = manifest.artifacts[id];
    assert(entry?.status === "AVAILABLE", "Unavailable binding: " + id);
    payloads[name].bindings[id] = entry;
    return entry;
  }
  function entity(
    name,
    {
      id,
      type,
      namespace,
      label,
      market,
      artifactId = null,
      cutoff = null,
      workspace,
      view,
      versions,
      versionChoices,
    },
  ) {
    const choices =
      versionChoices ??
      (versions
        ? versions.map((artifactId) => ({
            artifactId,
            cutoff: manifest.artifacts[artifactId].as_of,
            view,
          }))
        : artifactId
          ? [{ artifactId, cutoff, view }]
          : []);
    if (artifactId) binding(name, artifactId);
    for (const choice of choices) binding(name, choice.artifactId);
    const semantic = ["signal", "admission", "source-version", "capture", "model-run"].includes(
      type,
    );
    const key = [
      type,
      namespace,
      id,
      semantic ? "semantic" : (artifactId ?? "static-reference"),
    ].join("|");
    const e = {
      key,
      id,
      type,
      namespace,
      label,
      ...(market ? { market } : {}),
      artifactId,
      cutoff,
      workspace,
      view,
      availability: "AVAILABLE",
      ...(choices.length ? { versionChoices: choices } : {}),
    };
    const prior = payloads[name].entities.find((x) => x.key === key);
    if (prior) {
      if (semantic) {
        const all = unique([...(prior.versionChoices ?? []), ...choices], stableTerminal).sort(
          (a, b) => compare(a.cutoff + a.artifactId, b.cutoff + b.artifactId),
        );
        if (compare(cutoff, prior.cutoff) > 0) Object.assign(prior, e);
        prior.versionChoices = all;
        return prior;
      }
      assert.equal(stableTerminal(prior), stableTerminal(e), "Terminal entity conflict");
      return prior;
    }
    payloads[name].entities.push(e);
    return e;
  }
  function artifactEntity(name, id, workspace, view, market) {
    const e = binding(name, id);
    // An artifact's identity belongs to its checked source, never to the Issue that references it.
    if (e.kind.startsWith("factors-")) {
      assert(values.has(id), "Factor artifact metadata requires its full validated owner");
      const kind = e.kind.slice(8),
        selection = Object.entries(KNOWN_IDS).find(([, ids]) => ids[kind] === id)?.[0];
      assert(selection, "Factor artifact has no reviewed source selection");
      const [country, cutoff] = selection.split("|");
      market = country;
      workspace = "factors";
      view = { workspace: "factors", panel: kind, cutoff };
    } else if (e.kind.startsWith("regimes-")) {
      const value = values.get(id);
      assert(value, "Regime artifact metadata requires its full validated owner");
      const kind = e.kind.slice(8);
      market = marketFor(value.payload.asset);
      workspace = "regimes";
      view = {
        workspace: "regimes",
        panel:
          kind === "timeline"
            ? "timeline"
            : kind === "lineage"
              ? "evidence"
              : kind === "factors"
                ? "factors"
                : "overview",
        cutoff: value.as_of,
      };
    } else if (e.kind.startsWith("data-organ-")) {
      const value = values.get(id);
      assert(value, "Data artifact metadata requires its full validated owner");
      market = undefined;
      workspace = "data";
      view = { workspace: "data", panel: value.kind };
    }
    return entity(name, {
      id,
      type: "artifact",
      namespace: e.kind,
      label: e.kind + " · " + e.as_of,
      market,
      artifactId: id,
      cutoff: e.as_of,
      workspace,
      view,
    });
  }
  function edge(name, from, to, relation, artifactId, selector) {
    binding(name, artifactId);
    payloads[name].edges.push({ from: from.key, to: to.key, relation, artifactId, selector });
  }
  function copyEntity(name, value) {
    if (value.artifactId) binding(name, value.artifactId);
    for (const choice of value.versionChoices ?? []) binding(name, choice.artifactId);
    const prior = payloads[name].entities.find((x) => x.key === value.key);
    if (!prior) payloads[name].entities.push(value);
    else assert.equal(stableTerminal(prior), stableTerminal(value));
    return value;
  }
  function projection(
    name,
    selector,
    id,
    originalFullRowCount,
    start,
    end,
    selectedFields,
    limitations,
  ) {
    const entry = binding(name, id),
      p = {
        schema_version: "terminal-display/1",
        generator_contract: TERMINAL_CONTRACT,
        selector,
        source: { artifactId: id, entry },
        originalFullRowCount,
        range: { start, end },
        limitations,
        selectedFields,
      };
    p.projectionDigest = seal(p);
    payloads[name].projections.push(p);
    return p;
  }
  // Static navigation/reference identities are not claims of quote or execution coverage.
  for (const [workspace] of Object.entries(WORKSPACE_PATHS))
    if (workspace !== "execution")
      entity("seed", {
        id: workspace,
        type: "workspace",
        namespace: "terminal",
        label: workspace.toUpperCase(),
        workspace,
        view: { workspace },
      });
  for (const ref of INSTRUMENTS)
    entity("seed", {
      id: ref.providerSymbol,
      type: "reference-listing",
      namespace: ref.code,
      label: ref.name + " · reference identity; quote coverage not implied",
      market: ref.market,
      workspace: "market",
      view: { workspace: "market", panel: "overview" },
    });
  // Exact original weekly values, never rebased or recomputed. All omitted rows remain in the original.
  for (const asset of ["US-MKT", "IN-MKT"]) {
    const id = "market:" + asset,
      original = await source(id),
      count = original.weeks.length,
      start = Math.max(0, count - 52);
    const selected = {
      schema_version: "market-window/1",
      ticker: original.ticker,
      as_of: original.as_of,
      method: original.method,
      weeks: original.weeks.slice(start),
    };
    assert.equal(
      stableTerminal(selected.weeks),
      stableTerminal(original.weeks.slice(start)),
      "Weekly projection selection changed",
    );
    projection("market", "market-week-window", id, count, start, count, selected, [
      "Build-verified exact display window; complete original bytes have not been verified by this browser.",
      "Full weekly history remains in the immutable original; values keep their original historical base.",
      original.method.regime_semantics,
    ]);
    const view = { workspace: "market", panel: "overview" },
      item = entity("market", {
        id: asset,
        type: "market-factor",
        namespace: "market-factor",
        label: asset + " · historical market factor, not a security",
        market: marketFor(asset),
        artifactId: id,
        cutoff: original.as_of,
        workspace: "market",
        view,
      });
    copyEntity("seed", item);
  }
  // Every admitted Data epoch and all seven exact entries remain addressable.
  const dataEpochs = new Map(),
    currentDataIssues = manifest.routes["/data/issues"],
    currentDataLineage = manifest.routes["/data/lineage"];
  for (const [id, entry] of Object.entries(manifest.artifacts).sort(([a], [b]) => compare(a, b)))
    if (entry.status === "AVAILABLE" && entry.kind.startsWith("data-organ-")) {
      const value = await source(id),
        kind = value.kind,
        epoch = value.as_of + "|" + value.input_hash;
      if (!dataEpochs.has(epoch))
        dataEpochs.set(epoch, { kind: "data", anchor: "", cutoff: value.as_of, artifacts: {} });
      const bundle = dataEpochs.get(epoch);
      assert(!bundle.artifacts[kind], "Duplicate Data kind at one sealed epoch");
      bundle.artifacts[kind] = id;
      if (kind === "issues") bundle.anchor = id;
      artifactEntity("data", id, "data", { workspace: "data", panel: kind });
    }
  for (const bundle of dataEpochs.values()) {
    assert.equal(
      Object.keys(bundle.artifacts).sort().join(),
      [...dataKinds].sort().join(),
      "Incomplete seven-view Data epoch",
    );
    payloads.data.bundles.push(bundle);
  }
  const dataOrigins = await source(currentDataIssues),
    originNodes = new Map();
  const sourceCountries = new Map(
    (await source(manifest.routes["/data/coverage"])).payload.items.map((item) => [
      item.source,
      item.country,
    ]),
  );
  for (const item of dataOrigins.payload.items) {
    const market = sourceCountries.get(item.source);
    const origin = entity("data", {
      id: item.id,
      type: "data-origin",
      namespace: "data-organ",
      label:
        item.source + " · " + item.kind + " · " + item.severity + " · retained origin metadata",
      market,
      artifactId: currentDataIssues,
      cutoff: dataOrigins.as_of,
      workspace: "data",
      view: { workspace: "data", panel: "issues", sourceId: item.source, originId: item.id },
    });
    originNodes.set(item.id, origin);
  }
  const lineageIds = [...dataEpochs.values()]
    .map((b) => b.artifacts.lineage)
    .sort((a, b) => compare(manifest.artifacts[a].as_of, manifest.artifacts[b].as_of));
  for (const id of lineageIds) {
    const value = await source(id),
      name = id === currentDataLineage ? "data" : "history";
    for (const row of value.payload.items) {
      const sourceId = row.source.source,
        market = sourceCountries.get(sourceId),
        view = { workspace: "data", panel: "lineage", sourceId };
      const signal = entity(name, {
        id: row.signal_id,
        type: "signal",
        namespace: "data-organ",
        label: "Admitted signal · " + sourceId,
        market,
        artifactId: id,
        cutoff: value.as_of,
        workspace: "data",
        view,
      });
      for (const [field, type, relation, selector] of [
        ["admission_id", "admission", "DECLARED_ADMISSION", "declared_admission"],
        [
          "source_version_id",
          "source-version",
          "DECLARED_SOURCE_VERSION",
          "declared_source_version",
        ],
        ["capture_sha256", "capture", "DECLARED_CAPTURE", "declared_capture"],
      ]) {
        const node = entity(name, {
          id: row[field],
          type,
          namespace: "data-organ",
          label: type + " · " + sourceId,
          market,
          artifactId: id,
          cutoff: value.as_of,
          workspace: "data",
          view: {
            ...view,
            ...(field === "admission_id"
              ? { admissionId: row[field] }
              : field === "source_version_id"
                ? { sourceVersionId: row[field] }
                : {}),
          },
        });
        edge(name, signal, node, relation, id, selector);
      }
    }
  }
  for (const item of (await source(manifest.routes["/data/coverage"])).payload.items)
    entity("data", {
      id: item.source,
      type: "data-source",
      namespace: "data-organ",
      label: item.source + " · " + item.status + " · source metadata",
      market: ["US", "INDIA"].includes(item.country) ? item.country : undefined,
      artifactId: manifest.routes["/data/coverage"],
      cutoff: manifest.artifacts[manifest.routes["/data/coverage"]].as_of,
      workspace: "data",
      view: { workspace: "data", panel: "health", sourceId: item.source },
    });
  // Regime versions, exact declared producing runs and windowed historical paths.
  const regimeBundles = new Map();
  for (const [id, entry] of Object.entries(manifest.artifacts).sort(([a], [b]) => compare(a, b)))
    if (entry.status === "AVAILABLE" && entry.kind.startsWith("regimes-")) {
      const value = await source(id),
        kind = value.kind,
        asset = value.payload.asset,
        market = marketFor(asset);
      binding("regimes", id);
      if (asset) {
        const key = asset + "|" + value.as_of;
        if (!regimeBundles.has(key))
          regimeBundles.set(key, {
            kind: "regimes",
            anchor: "",
            cutoff: value.as_of,
            market,
            artifacts: {},
          });
        const bundle = regimeBundles.get(key);
        bundle.artifacts[kind] = id;
        if (kind === "snapshot") bundle.anchor = id;
      }
      artifactEntity(
        "regimes",
        id,
        "regimes",
        {
          workspace: "regimes",
          panel:
            kind === "timeline"
              ? "timeline"
              : kind === "lineage"
                ? "evidence"
                : kind === "factors"
                  ? "factors"
                  : "overview",
          cutoff: value.as_of,
        },
        market,
      );
      if (kind === "snapshot" && manifest.routes["/regimes/snapshot?asset=" + asset] === id) {
        projection(
          "regimes",
          "frozen-research-summary",
          id,
          1,
          0,
          1,
          value.payload.frozen_research,
          [
            "Already-public frozen Research OS summary only; no private source file is published.",
            "CLOSED / NOT_CALIBRATED; inference replacement NOT_CONFIRMED; no new experiment or holdout opening.",
          ],
        );
      }
      if (kind === "timeline" && manifest.routes["/regimes/timeline?asset=" + asset] === id) {
        const p = value.payload,
          n = p.dates.length,
          start = Math.max(0, n - 100),
          selected = structuredClone(p),
          dates = new Set(p.dates.slice(start));
        selected.dates = p.dates.slice(start);
        for (const name of ["hmm2", "hmm4"]) {
          const series = p[name],
            from = Math.max(0, start - series.offset);
          selected[name] = {
            ...series,
            offset: Math.max(0, series.offset - start),
            state_codes: series.state_codes.slice(from),
            confidence: series.confidence.slice(from),
          };
          assert.equal(
            selected[name].offset + selected[name].state_codes.length,
            selected.dates.length,
            "Timeline offset selection changed",
          );
        }
        selected.volatility = {
          ...p.volatility,
          state_codes: p.volatility.state_codes.slice(start),
          rv_20: p.volatility.rv_20.slice(start),
          tail: p.volatility.tail.filter((row) => dates.has(row.observed_at.slice(0, 10))),
        };
        selected.momentum_signal_tail = p.momentum_signal_tail.filter((row) =>
          dates.has(row[0].slice(0, 10)),
        );
        projection("regimes", "regime-timeline-window", id, n, start, n, selected, [
          "Build-verified exact last 100 observation window; complete original is available on explicit inspection.",
          p.path_semantics,
          p.posterior_semantics,
          p.observation_unit === "observation"
            ? "India calendar unavailable; observation steps are not exchange sessions."
            : "Retained historical sessions, not a live market prediction.",
        ]);
      }
      if (kind === "lineage") {
        const map = new Map();
        function run(chain) {
          assert(
            chain.status === "VERIFIED" && /^[a-f0-9]{64}$/.test(chain.run_id),
            "Unverified declared producer",
          );
          const node = entity("regimes", {
            id: chain.run_id,
            type: "model-run",
            namespace: "regime",
            label: chain.plugin + " · retained producing run",
            market,
            artifactId: id,
            cutoff: value.as_of,
            workspace: "regimes",
            view: {
              workspace: "regimes",
              panel: "evidence",
              cutoff: value.as_of,
              runId: chain.run_id,
            },
          });
          map.set(chain.run_id, node);
          for (const producer of chain.producers ?? [])
            edge("regimes", node, run(producer), "DECLARED_PRODUCER", id, "declared_producer");
          for (const declared of chain.sources ?? []) {
            for (const [sourceId, type, relation, selector] of [
              [
                declared.source_version_id,
                "source-version",
                "DECLARED_SOURCE_VERSION",
                "declared_source_version",
              ],
              [declared.capture_sha256, "capture", "DECLARED_CAPTURE", "declared_capture"],
              ...(declared.admissions ?? []).map((admission) => [
                admission,
                "admission",
                "DECLARED_ADMISSION",
                "declared_admission",
              ]),
            ]) {
              const target = entity("regimes", {
                id: sourceId,
                type,
                namespace: "regime-declared",
                label: type + " · historical " + declared.source,
                market,
                artifactId: id,
                cutoff: value.as_of,
                workspace: "regimes",
                view: { workspace: "regimes", panel: "evidence", cutoff: value.as_of },
              });
              edge("regimes", node, target, relation, id, selector);
            }
          }
          return node;
        }
        for (const chain of Object.values(value.payload.runs)) run(chain);
      }
    }
  for (const bundle of regimeBundles.values()) {
    assert(
      bundle.anchor &&
        ["snapshot", "timeline", "factors", "lineage", "history"].every(
          (kind) => bundle.artifacts[kind],
        ),
      "Incomplete retained Regime bundle",
    );
    payloads.regimes.bundles.push(bundle);
  }
  // Factor metadata remains a read-only index, including all original version choices.
  const factorSemantics = new Map();
  function semanticFactor(id, type, label, market, artifactId, cutoff, view) {
    const key = [type, market, id].join("|");
    const current = factorSemantics.get(key);
    if (!current)
      factorSemantics.set(key, {
        id,
        type,
        label,
        market,
        artifactId,
        cutoff,
        view,
        versionChoices: [{ artifactId, cutoff, view }],
      });
    else {
      current.versionChoices.push({ artifactId, cutoff, view });
      if (compare(cutoff, current.cutoff) > 0)
        Object.assign(current, { label, artifactId, cutoff, view });
    }
  }
  for (const [selection, ids] of Object.entries(KNOWN_IDS).sort(([a], [b]) => compare(a, b))) {
    const [country, cutoff] = selection.split("|"),
      artifacts = {};
    for (const [kind, id] of Object.entries(ids)) {
      const value = await source(id);
      artifacts[kind] = id;
      binding("factors", id);
      artifactEntity(
        "factors",
        id,
        "factors",
        { workspace: "factors", panel: kind, cutoff },
        country,
      );
      if (kind === "catalog")
        for (const item of value.payload.items)
          semanticFactor(
            item.factor_id,
            "factor",
            item.display_name + " · " + item.role + " · retained catalogue",
            country,
            id,
            cutoff,
            {
              workspace: "factors",
              panel: item.factor_id.endsWith(":mom") ? "exposure" : "catalog",
              cutoff,
              factorId: item.factor_id,
            },
          );
      if (kind === "audit") {
        for (const definition of value.payload.definitions)
          semanticFactor(
            definition.plugin_id,
            "factor-definition",
            definition.plugin_id + " · declaration metadata, not a fitted factor",
            country,
            id,
            cutoff,
            { workspace: "factors", panel: "audit", cutoff, query: definition.plugin_id },
          );
        for (const item of value.payload.items) {
          const channel = [item.plugin_id, item.output_channel, item.output].join(":");
          semanticFactor(
            channel,
            "factor-audit-channel",
            channel + " · " + item.eligibility_status + " · metadata only",
            country,
            id,
            cutoff,
            { workspace: "factors", panel: "audit", cutoff, query: item.plugin_id },
          );
        }
      }
      if (kind === "lineage") {
        const nodes = new Map();
        for (const node of value.payload.nodes) {
          assert(node.ref.type === "replay_artifact", "Unreviewed Factor numerical ref");
          const targetId = node.ref.artifact_id;
          await source(targetId);
          binding("factors", targetId);
          const target = entity("factors", {
            id: node.id,
            type:
              node.kind === "SEALED_FACTOR_RUN" || node.kind === "SEALED_PRODUCER"
                ? "model-run"
                : node.kind.toLowerCase().replaceAll("_", "-"),
            namespace: "factor-declared",
            label: node.kind + " · " + node.status + " · declared metadata",
            market: country,
            artifactId: targetId,
            cutoff,
            workspace: "regimes",
            view: {
              workspace: "regimes",
              panel: "evidence",
              cutoff,
              ...(node.kind === "SEALED_FACTOR_RUN" || node.kind === "SEALED_PRODUCER"
                ? { runId: node.id }
                : {}),
            },
          });
          nodes.set(node.id, target);
        }
        const relation = {
          DECLARED_PRODUCER: ["DECLARED_PRODUCER", "declared_producer"],
          SOURCE_VERSION: ["DECLARED_SOURCE_VERSION", "declared_source_version"],
          CAPTURE_SHA: ["DECLARED_CAPTURE", "declared_capture"],
          ADMISSION: ["DECLARED_ADMISSION", "declared_admission"],
        };
        for (const declared of value.payload.edges) {
          assert(
            relation[declared.relationship] && nodes.has(declared.from) && nodes.has(declared.to),
            "Unreviewed Factor edge",
          );
          const [kind, selector] = relation[declared.relationship];
          edge("factors", nodes.get(declared.from), nodes.get(declared.to), kind, id, selector);
        }
      }
    }
    payloads.factors.bundles.push({
      kind: "factors",
      anchor: ids.catalog,
      cutoff,
      market: country,
      artifacts,
    });
  }
  for (const value of factorSemantics.values()) {
    value.versionChoices = unique(value.versionChoices, stableTerminal).sort((a, b) =>
      compare(a.cutoff + a.artifactId, b.cutoff + b.artifactId),
    );
    entity("factors", { ...value, namespace: "factor-evidence", workspace: "factors" });
  }
  // Risk semantic records and exact references; unavailable checks remain unavailable calculations.
  const currentRiskState = manifest.routes["/risk-manager/state"],
    currentRiskSweep = manifest.routes["/risk-manager/sweep"],
    riskIssues = new Map();
  const riskReceipts = Object.entries(manifest.artifacts)
    .filter(([, e]) => e.status === "AVAILABLE" && e.kind === "risk-sweep")
    .sort(([, a], [, b]) => compare(a.as_of, b.as_of));
  for (const [id] of riskReceipts) {
    const value = await source(id),
      stateId = value.payload.state_ref;
    binding("risk", id);
    const view = { workspace: "risk", panel: "history", sweepId: value.payload.sweep_id };
    const receiptNode = entity("risk", {
      id: value.payload.sweep_id,
      type: "sweep",
      namespace: "risk",
      label: value.payload.status + " · retained Risk sweep",
      artifactId: id,
      cutoff: value.evidence_cutoff,
      workspace: "risk",
      view,
    });
    if (!stateId) continue;
    const state = await source(stateId);
    binding("risk", stateId);
    for (const ref of state.payload.evidence_index)
      if (ref.type === "REPLAY_ARTIFACT" && ref.artifact_id?.startsWith("risk:state:")) {
        await source(ref.artifact_id);
        binding("risk", ref.artifact_id);
      }
    payloads.risk.bundles.push({
      kind: "risk",
      anchor: stateId,
      cutoff: value.evidence_cutoff,
      artifacts: { state: stateId, sweep: id },
      identity: value.payload.sweep_id,
    });
    const stateNode = artifactEntity("risk", stateId, "risk", {
      workspace: "risk",
      panel: "feed",
      sweepId: value.payload.sweep_id,
    });
    edge("risk", receiptNode, stateNode, "REFERENCED_ARTIFACT", id, "referenced_artifact");
    if (value.payload.status === "FAILED") continue;
    for (const issue of state.payload.issues) {
      const prior = riskIssues.get(issue.issue_id),
        version = {
          issue,
          artifactId: stateId,
          sweepId: value.payload.sweep_id,
          receiptId: id,
          cutoff: value.evidence_cutoff,
        };
      riskIssues.set(issue.issue_id, {
        ...version,
        versionChoices: [
          ...(prior?.versionChoices ?? []),
          {
            artifactId: stateId,
            cutoff: value.evidence_cutoff,
            view: {
              workspace: "risk",
              panel: "feed",
              issueId: issue.issue_id,
              sweepId: value.payload.sweep_id,
              partition: partition(issue),
            },
          },
        ],
      });
    }
  }
  for (const [id, entry] of Object.entries(manifest.artifacts))
    if (
      entry.status === "AVAILABLE" &&
      (entry.kind === "risk-state" || entry.kind === "risk-sweep")
    ) {
      await source(id);
      binding("risk", id);
    }
  for (const [issueId, version] of riskIssues) {
    const { issue, artifactId, cutoff, sweepId, receiptId, versionChoices } = version,
      part = partition(issue),
      market = ["US", "INDIA"].includes(issue.country) ? issue.country : undefined;
    const node = entity("risk", {
      id: issueId,
      type: "issue",
      namespace: "risk",
      label: issue.title + " · " + part + " · " + issue.evidence_class,
      market,
      artifactId,
      cutoff,
      workspace: "risk",
      view: { workspace: "risk", panel: "feed", issueId, sweepId, partition: part },
      versionChoices,
    });
    // Only current declared records are indexed here; historical originals remain selectable versions.
    if (artifactId !== currentRiskState) continue;
    const receipt = values.get(receiptId),
      evidenceRefs = issue.evidence_refs.flatMap((ref) =>
        ref.type === "RISK_OBSERVATION"
          ? (receipt.payload.observations.find((row) => row.observation_id === ref.observation_id)
              ?.evidence_refs ?? [])
          : [ref],
      );
    for (const ref of evidenceRefs)
      if (
        ref.type === "REPLAY_ARTIFACT" &&
        manifest.artifacts[ref.artifact_id]?.status === "AVAILABLE"
      ) {
        const targetId = ref.artifact_id,
          targetKind = manifest.artifacts[targetId].kind;
        binding("risk", targetId);
        const workspace = targetKind.startsWith("data-organ-")
          ? "data"
          : targetKind.startsWith("regimes-")
            ? "regimes"
            : targetKind.startsWith("factors-")
              ? "factors"
              : "risk";
        const target = artifactEntity(
          "risk",
          targetId,
          workspace,
          {
            workspace,
            panel:
              workspace === "data"
                ? "issues"
                : workspace === "regimes"
                  ? "evidence"
                  : workspace === "factors"
                    ? "lineage"
                    : "coverage",
          },
          workspace === "data" ? undefined : market,
        );
        edge("risk", node, target, "REFERENCED_ARTIFACT", artifactId, "risk_issue_evidence");
      }
    for (const origin of issue.origin_records) {
      const originRef = evidenceRefs.find(
        (ref) =>
          ref.type === "REPLAY_ARTIFACT" &&
          manifest.artifacts[ref.artifact_id]?.kind === "data-organ-issues" &&
          values
            .get(ref.artifact_id)
            ?.payload.items.some(
              (item) => item.id === origin.id && stableTerminal(item) === stableTerminal(origin),
            ),
      );
      if (!originRef) continue; // Retained synthetic origins do not acquire a Data relationship.
      const owner = values.get(originRef.artifact_id),
        found = owner.payload.items.find((item) => item.id === origin.id);
      assert.equal(stableTerminal(found), stableTerminal(origin), "Risk/Data origin substituted");
      const target =
        originRef.artifact_id === currentDataIssues
          ? originNodes.get(origin.id)
          : entity("risk", {
              id: origin.id,
              type: "data-origin",
              namespace: "data-organ",
              label:
                origin.source +
                " · " +
                origin.kind +
                " · " +
                origin.severity +
                " · retained origin metadata",
              market: sourceCountries.get(origin.source),
              artifactId: originRef.artifact_id,
              cutoff: owner.as_of,
              workspace: "data",
              view: {
                workspace: "data",
                panel: "issues",
                sourceId: origin.source,
                originId: origin.id,
              },
            });
      edge(
        "risk",
        node,
        copyEntity("risk", target),
        "ISSUE_ORIGIN",
        artifactId,
        "risk_issue_origin",
      );
    }
  }
  // Only available recorded traces and explicitly recorded run/task references, never execution.
  for (const [id, entry] of Object.entries(manifest.artifacts))
    if (
      entry.status === "AVAILABLE" &&
      (id.startsWith("forge:") || id.startsWith("observatory:") || id.startsWith("world:"))
    ) {
      binding("recordings", id);
      if (id.startsWith("observatory:")) {
        const trace = await source(id);
        const [, asset, scene] = id.split(":");
        entity("recordings", {
          id,
          type: "recorded-trace",
          namespace: "observatory",
          label: asset + " · " + scene + " · recorded trace",
          market: marketFor(asset),
          artifactId: id,
          cutoff: entry.as_of,
          workspace: "observatory",
          view: { workspace: "observatory", scene, traceId: id, cutoff: entry.as_of },
        });
      } else if (id.startsWith("world:"))
        artifactEntity("recordings", id, "world", {
          workspace: "world",
          panel: id === "world:quakes" ? "events" : "satellites",
        });
    }
  const recorded = await source("forge:runs");
  for (const row of recorded.items) {
    const artifactId = manifest.routes["/forge/runs/" + row.run_id];
    assert(
      artifactId && manifest.artifacts[artifactId]?.status === "AVAILABLE",
      "Recorded run lacks its exact artifact route",
    );
    binding("recordings", artifactId);
    const run = entity("recordings", {
      id: row.run_id,
      type: "recorded-agent-run",
      namespace: "agent",
      label: row.model + " · " + row.task_class + " · " + row.decision.verdict + " · recorded",
      artifactId,
      cutoff: manifest.artifacts[artifactId].as_of,
      workspace: "agents",
      view: { workspace: "agents", panel: "action", runId: row.run_id, taskId: row.task_id },
    });
    const task = entity("recordings", {
      id: row.task_id,
      type: "recorded-task",
      namespace: "agent",
      label: row.task_id + " · recorded task metadata",
      artifactId: "forge:runs",
      cutoff: manifest.artifacts["forge:runs"].as_of,
      workspace: "agents",
      view: { workspace: "agents", panel: "runs", taskId: row.task_id },
    });
    edge("recordings", run, task, "PRESENT_IN", "forge:runs", "present_in");
    const artifact = artifactEntity("recordings", artifactId, "agents", {
      workspace: "agents",
      panel: "action",
      runId: row.run_id,
      taskId: row.task_id,
    });
    edge(
      "recordings",
      run,
      artifact,
      "REFERENCED_ARTIFACT",
      "forge:runs",
      "recorded_task_artifact",
    );
  }

  // Other retained originals remain metadata-addressable; no large legacy scientific payload is projected.
  const assigned = new Set(Object.values(payloads).flatMap((p) => Object.keys(p.bindings)));
  for (const [id, entry] of Object.entries(manifest.artifacts).sort(([a], [b]) => compare(a, b))) {
    if (entry.status !== "AVAILABLE" || assigned.has(id)) continue;
    artifactEntity("history", id, "regimes", { workspace: "regimes", panel: "legacy" });
  }
  for (const [route, id] of Object.entries(manifest.routes)) {
    if (manifest.artifacts[id]?.status !== "AVAILABLE") continue;
    const family = id.startsWith("data-organ:")
      ? "data"
      : id.startsWith("risk:")
        ? "risk"
        : id.startsWith("regimes:")
          ? "regimes"
          : id.startsWith("factors:")
            ? "factors"
            : id.startsWith("market:")
              ? "market"
              : id.startsWith("forge:") || id.startsWith("observatory:") || id.startsWith("world:")
                ? "recordings"
                : "history";
    binding(family, id);
    payloads[family].routes[route] = id;
  }
  // Separately approved lazy display module. Its source is validated in full above the browser cap.
  const traceId = "observatory:IN-MKT:hmm",
    trace = await source(traceId),
    traceEntry = manifest.artifacts[traceId];
  assert.equal(trace.frames.length, 100, "Approved HMM original frame count changed");
  assert.equal(trace.dates_tail.length, 250, "Approved HMM original date count changed");
  const observatoryWindow = {
    schema_version: "terminal-display/1",
    generator_contract: TERMINAL_CONTRACT,
    selector: "observatory-trace-window",
    source: { artifactId: traceId, entry: traceEntry },
    originalFullRowCount: 250,
    range: { start: 190, end: 250 },
    originalFrameCount: 100,
    iterationRange: { start: 92, end: 100 },
    dateRange: { start: 190, end: 250 },
    limitations: [
      "Authorized bounded India HMM display: 8 of 100 recorded iterations, final 60 of 250 recorded dates; exact global step offsets retained.",
      "Build verified the full original source; this browser validates only this projection and its pinned binding.",
      "The 2,315,028-byte complete original remains unchanged and exceeds the 2 MiB browser read cap. Out-of-window steps are unavailable; no step snapping.",
    ],
    selectedFields: {
      ...trace,
      dates_tail: trace.dates_tail.slice(190),
      frames: trace.frames
        .slice(92)
        .map((frame) => ({ ...frame, posterior_tail: frame.posterior_tail.slice(190) })),
    },
  };
  observatoryWindow.projectionDigest = seal(observatoryWindow);
  const allProjections = [
    ...Object.values(payloads).flatMap((payload) => payload.projections),
    observatoryWindow,
  ];
  payloads.seed.projectionPins = Object.fromEntries(
    allProjections
      .map((projection) => [
        projection.source.artifactId + "|" + projection.selector,
        projection.projectionDigest,
      ])
      .sort(([a], [b]) => compare(a, b)),
  );
  const availableIds = Object.entries(manifest.artifacts)
    .filter(([, entry]) => entry.status === "AVAILABLE")
    .map(([id]) => id)
    .sort(compare);
  const compiledBindings = [
    ...new Set(Object.values(payloads).flatMap((p) => Object.keys(p.bindings))),
  ].sort(compare);
  assert.equal(
    stableTerminal(compiledBindings),
    stableTerminal(availableIds),
    "A retained available original binding was omitted",
  );
  const retainedVersionChoices = new Set(
    Object.values(payloads).flatMap((p) =>
      p.entities.flatMap((e) =>
        (e.versionChoices ?? []).map((choice) => e.key + "|" + stableTerminal(choice)),
      ),
    ),
  ).size;
  const shards = {},
    modules = {},
    failures = [],
    report = {
      manifestBinding,
      sourceChecks: sourceChecks.sort((a, b) => compare(a.artifactId, b.artifactId)),
      shards: {},
      bindingCoverage: {
        availableOriginalCount: availableIds.length,
        compiledUniqueBindings: compiledBindings.length,
        unavailableOriginalCount: Object.keys(manifest.artifacts).length - availableIds.length,
      },
      retainedVersionChoices,
      windows: allProjections.map((projection) => ({
        artifactId: projection.source.artifactId,
        selector: projection.selector,
        originalFullRowCount: projection.originalFullRowCount,
        range: projection.range,
        displayRowCount: projection.range.end - projection.range.start,
        projectionDigest: projection.projectionDigest,
        ...(projection.iterationRange
          ? {
              originalFrameCount: projection.originalFrameCount,
              iterationRange: projection.iterationRange,
              dateRange: projection.dateRange,
            }
          : {}),
      })),
      displayModules: {},
      scopeAmendment:
        "Approved standalone ninth lazy observatory-window.generated.ts; exact India iterations[92,100)/100 and dates[190,250)/250, decimal values unchanged.",
      totalRecords: 0,
      totalEdges: 0,
      limitations: [
        "Only declared public metadata, exact Market/Regime display windows and the separately approved India HMM 8/60 display window are generated.",
        "A compiled binding is not browser verification of unfetched original bytes.",
        "Original reads above 2 MiB are unavailable in the browser; original bytes remain retained unchanged.",
      ],
    };
  for (const name of SHARD_NAMES) {
    const payload = payloads[name];
    payload.bindings = Object.fromEntries(
      Object.entries(payload.bindings).sort(([a], [b]) => compare(a, b)),
    );
    payload.routes = Object.fromEntries(
      Object.entries(payload.routes).sort(([a], [b]) => compare(a, b)),
    );
    payload.entities = unique(payload.entities, (e) => e.key).sort((a, b) => compare(a.key, b.key));
    payload.edges = unique(payload.edges, stableTerminal).sort((a, b) =>
      compare(stableTerminal(a), stableTerminal(b)),
    );
    payload.projections.sort((a, b) =>
      compare(a.source.artifactId + a.selector, b.source.artifactId + b.selector),
    );
    payload.bundles.sort((a, b) => compare(a.anchor, b.anchor));
    if (payload.entities.length > 512)
      failures.push("Entity budget: " + name + "=" + payload.entities.length);
    const packed = packTerminalPayload(payload);
    assert.equal(
      stableTerminal(
        unpackTerminalPayload(packed.strings, packed.payload, packed.structures, packed.texts),
      ),
      stableTerminal(payload),
      "Lossy terminal packing",
    );
    const sealed = {
      schema_version: "terminal-shard/1",
      generator_contract: TERMINAL_CONTRACT,
      name,
      manifestBinding,
      ...packed,
    };
    const shard = { ...sealed, payloadDigest: seal(sealed) };
    const output =
      "// Generated from checked retained public metadata; do not edit or commit.\n// prettier-ignore\nexport default " +
      JSON.stringify(shard) +
      " as const;\n";
    const bytes = Buffer.byteLength(output),
      gzipBytes = gzipSync(output, { level: 9 }).length;
    report.shards[name] = {
      records: payload.entities.length,
      edges: payload.edges.length,
      bindings: Object.keys(payload.bindings).length,
      projections: payload.projections.length,
      decodedBytes: bytes,
      unpackedJSONBytes: Buffer.byteLength(stableTerminal(payload)),
      gzipBytes,
    };
    report.totalRecords += payload.entities.length;
    report.totalEdges += payload.edges.length;
    if (bytes > (name === "seed" ? 48 : 128) * 1024)
      failures.push("Decoded module budget: " + name + "=" + bytes);
    if (gzipBytes > (name === "seed" ? 12 : 32) * 1024)
      failures.push("Gzip module budget: " + name + "=" + gzipBytes);
    if (bytes <= (name === "seed" ? 48 : 128) * 1024 && payload.entities.length <= 512)
      await validateTerminalShard(shard, name, manifestBinding);
    shards[name] = shard;
    modules[name] = output;
  }
  const displayOutput =
    "// Generated from checked retained public metadata; do not edit or commit.\n// prettier-ignore\nexport default " +
    JSON.stringify(observatoryWindow) +
    " as const;\n";
  const displayBytes = Buffer.byteLength(displayOutput),
    displayGzipBytes = gzipSync(displayOutput, { level: 9 }).length;
  report.displayModules["observatory-window"] = {
    records: 0,
    edges: 0,
    bindings: 1,
    projections: 1,
    decodedBytes: displayBytes,
    unpackedJSONBytes: Buffer.byteLength(stableTerminal(observatoryWindow)),
    gzipBytes: displayGzipBytes,
    projectionDigest: observatoryWindow.projectionDigest,
  };
  if (displayBytes > 128 * 1024)
    failures.push("Decoded display module budget: observatory-window=" + displayBytes);
  if (displayGzipBytes > 32 * 1024)
    failures.push("Gzip display module budget: observatory-window=" + displayGzipBytes);
  const { verifyDisplayProjection } = await import("../src/app/terminal/reader.ts");
  await verifyDisplayProjection(observatoryWindow, traceEntry, observatoryWindow.projectionDigest);
  modules["observatory-window"] = displayOutput;
  assert(
    !failures.length,
    "STOP: terminal capacity admission failed; no outputs written. " +
      JSON.stringify({ failures, shards: report.shards, displayModules: report.displayModules }),
  );
  assert(
    report.totalRecords <= 4096 && report.totalEdges <= 8192,
    "Terminal global navigation budget exceeded",
  );
  return { shards, modules, observatoryWindow, report };
}
export async function generateTerminalIndex({
  root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  check = false,
} = {}) {
  const publicRoot = realpathSync(resolve(root, "public")),
    manifestPath = resolve(publicRoot, "replay-manifest.json"),
    manifestBytes = readFileSync(manifestPath);
  const manifest = strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  const result = await deriveTerminalCatalog(manifest, {
    manifestBytes,
    readArtifactBytes(_id, entry) {
      const path = realpathSync(resolve(publicRoot, entry.url.slice(1))),
        local = relative(publicRoot, path);
      assert(
        local && !local.startsWith("..") && !isAbsolute(local),
        "Artifact path escaped immutable public root",
      );
      return readFileSync(path);
    },
  });
  assert(
    manifestBytes.equals(readFileSync(manifestPath)),
    "Original manifest changed during terminal generation",
  );
  const outputRoot = resolve(root, "src/app/terminal/generated");
  if (!check) mkdirSync(outputRoot, { recursive: true });
  for (const name of TERMINAL_GENERATED_MODULE_NAMES) {
    const path = resolve(outputRoot, name + ".generated.ts");
    if (check)
      assert.equal(
        readFileSync(path, "utf8"),
        result.modules[name],
        "Terminal generated output is stale: " + name,
      );
    else writeFileSync(path, result.modules[name]);
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await generateTerminalIndex({ check: process.argv.includes("--check") });
  const {
    sourceChecks,
    manifestBinding,
    shards,
    bindingCoverage,
    retainedVersionChoices,
    totalRecords,
    totalEdges,
    scopeAmendment,
    displayModules,
  } = result.report;
  console.log(
    JSON.stringify(
      {
        manifestBinding,
        shards,
        bindingCoverage,
        retainedVersionChoices,
        totalRecords,
        totalEdges,
        verifiedCompleteOriginals: sourceChecks.length,
        scopeAmendment,
        displayModules,
      },
      null,
      2,
    ),
  );
}
