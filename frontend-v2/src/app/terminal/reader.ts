import { assertDerivedPayload, type ReplayEntry } from "../../replay/contracts.ts";
import { strictJSON } from "../../risk-manager/strict-json.ts";
import {
  findArtifactBinding,
  loadTerminalSeed,
  selectProjection,
  stableTerminal,
  terminalDigest,
  type DisplayProjection,
} from "./catalog.ts";

// Closed public field/type grammar, shared structurally across the reviewed complete-source contracts.
// It is schema metadata only; no numerical source evidence is copied here.
function fullOriginalGrammar() {
  const roots: Record<string, Record<string, number>> = {
    "forge-runs": { $: 10 },
    "market-series": { $: 23, "$.method": 18, "$.weeks": 22 },
    "trace-hmm": { $: 31 },
    "trace-signal": { $: 41 },
    "regimes-history": { $: 47 },
    "regimes-lineage": { $: 72 },
    "regimes-matrix": { $: 97 },
    "regimes-snapshot": { $: 144, "$.payload.frozen_research": 118 },
    "regimes-timeline": { $: 154, "$.payload": 153 },
  };
  const nodes: [number, Record<string, number>, string[], number][] = [
    [8, {}, [], -1],
    [2, {}, [], -1],
    [32, { reason: 0, verdict: 0 }, ["reason", "verdict"], -1],
    [1, {}, [], -1],
    [4, {}, [], -1],
    [
      32,
      {
        cached_input_tokens: 4,
        engine_runs: 4,
        high_fidelity_runs: 4,
        inference_cost_usd: 4,
        model_calls: 4,
        reasoning_tokens: 4,
        tokens_in: 4,
        tokens_out: 4,
        tool_calls: 4,
        total_tokens: 4,
        wall_seconds: 4,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        artifact_binding: 1,
        budget: 1,
        completed: 1,
        decision_binding: 1,
        efficient_routing: 1,
        model_action_binding: 1,
        model_identity: 1,
        model_metering: 1,
        prompt_identity: 1,
        required_evidence: 1,
        sealed_data_hidden: 1,
        task_identity: 1,
        tool_schema_identity: 1,
        trajectory_actions: 1,
        usage_counters: 1,
        verdict: 1,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        abstention_accurate: 1,
        behavioral_score: 4,
        checks: 6,
        correct_acceptance: 1,
        correct_rejection: 1,
        critical_gate_failure: 1,
        expected_verdict: 0,
        false_alpha_acceptance: 1,
        submitted_verdict: 0,
        task_id: 0,
        trajectory_hash: 0,
        unnecessary_high_fidelity_promotion: 1,
        verified_research_success: 1,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        completed: 1,
        decision: 2,
        episode_key: 0,
        failure_reason: 3,
        model: 0,
        model_version: 0,
        record_hash: 0,
        run_id: 0,
        seed: 4,
        task_class: 0,
        task_id: 0,
        usage: 5,
        verification: 7,
        world_hash: 0,
      },
      [
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
      -1,
    ],
    [16, {}, [], 8],
    [
      32,
      {
        artifact_hash: 0,
        artifact_id: 0,
        items: 9,
        matched: 4,
        schema_version: 0,
        source_schema_version: 0,
      },
      [
        "artifact_hash",
        "artifact_id",
        "items",
        "matched",
        "schema_version",
        "source_schema_version",
      ],
      -1,
    ],
    [16, {}, [], 0],
    [32, { rows: 4, start: 0 }, ["rows", "start"], -1],
    [32, { HML: 12, MKT: 12, MOM: 12, SMB: 12 }, ["HML", "MKT", "MOM", "SMB"], -1],
    [32, { captured_at: 0, sha256: 0, source_url: 0 }, ["captured_at", "sha256", "source_url"], -1],
    [16, {}, [], 14],
    [
      32,
      {
        as_of: 0,
        country: 0,
        coverage: 0,
        disclosure: 0,
        evidence_mode: 0,
        evidence_quality: 11,
        factor_coverage: 13,
        input_hash: 0,
        latest_availability: 0,
        latest_observation: 0,
        library_start: 0,
        market_end: 0,
        market_start: 0,
        missing_market_rows: 4,
        observations: 4,
        price_basis: 0,
        raw_snapshot_ids: 11,
        return_definition: 0,
        series_label: 0,
        source: 11,
        source_captures: 15,
        source_urls: 11,
        split_clock: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        as_of: 0,
        converged: 1,
        feature_names: 11,
        fit_rows: 4,
        n_states: 4,
        seed: 4,
        source_coverage: 16,
        source_input_hash: 0,
        status: 0,
        trace_sha256: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        annualization_sessions: 4,
        base: 4,
        granularity: 0,
        hmm: 17,
        regime_semantics: 0,
        volatility_window_sessions: 4,
      },
      [
        "annualization_sessions",
        "base",
        "granularity",
        "hmm",
        "regime_semantics",
        "volatility_window_sessions",
      ],
      -1,
    ],
    [5, {}, [], -1],
    [9, {}, [], -1],
    [
      32,
      { drawdown: 4, realized_volatility: 19, regime: 20, relative_performance: 4, week: 0 },
      ["drawdown", "realized_volatility", "regime", "relative_performance", "week"],
      -1,
    ],
    [16, {}, [], 21],
    [
      32,
      { as_of: 0, method: 18, schema_version: 0, ticker: 0, weeks: 22 },
      ["as_of", "method", "schema_version", "ticker", "weeks"],
      -1,
    ],
    [
      32,
      { causal_claim_eligible: 1, market_claim_eligible: 1, validated_alpha: 1 },
      ["causal_claim_eligible", "market_claim_eligible", "validated_alpha"],
      -1,
    ],
    [16, {}, [], 4],
    [16, {}, [], 25],
    [
      32,
      {
        converged: 1,
        convergence_delta: 19,
        covariance_diagonal: 26,
        iteration: 4,
        loglik: 4,
        means: 26,
        posterior_tail: 26,
        transmat: 26,
      },
      [
        "converged",
        "convergence_delta",
        "covariance_diagonal",
        "iteration",
        "loglik",
        "means",
        "posterior_tail",
        "transmat",
      ],
      -1,
    ],
    [16, {}, [], 27],
    [32, { "0": 0, "1": 0, "2": 0, "3": 0 }, ["0", "1", "2", "3"], -1],
    [
      32,
      { features: 11, mean: 25, scale: 25, variance: 25 },
      ["features", "mean", "scale", "variance"],
      -1,
    ],
    [
      32,
      {
        as_of: 0,
        claims: 24,
        converged: 1,
        dates_tail: 11,
        feature_names: 11,
        feature_start: 0,
        fit_rows: 4,
        frames: 28,
        kind: 0,
        labels: 29,
        latest_feature: 0,
        max_iter: 4,
        n_states: 4,
        provenance: 16,
        scaler: 30,
        scaler_hash: 0,
        schema_version: 0,
        seed: 4,
        semantics: 0,
        source: 0,
        ticker: 0,
        tolerance: 4,
      },
      [
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
      -1,
    ],
    [
      32,
      { feature_importance: 25, fold: 4, stage: 4, val_auc: 4, val_logloss: 4 },
      ["feature_importance", "fold", "stage", "val_auc", "val_logloss"],
      -1,
    ],
    [16, {}, [], 32],
    [
      32,
      {
        fit_end: 0,
        fit_indices: 25,
        fit_rows: 4,
        fit_start: 0,
        fold: 4,
        frames: 33,
        model: 0,
        stage_trace: 0,
        training_target_information_end: 0,
        validation_end: 0,
        validation_feature_start: 0,
        validation_indices: 25,
        validation_rows: 4,
        validation_start: 0,
      },
      [
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
      -1,
    ],
    [16, {}, [], 34],
    [
      32,
      { high: 4, low: 4, resamples: 4, seed: 4, valid_resamples: 4 },
      ["high", "low", "resamples", "seed", "valid_resamples"],
      -1,
    ],
    [
      32,
      {
        auc: 4,
        auc_ci95: 36,
        baseline_accuracy: 4,
        end: 0,
        feature_start: 0,
        indices: 25,
        label: 0,
        model: 0,
        rows: 4,
        start: 0,
        training_target_information_end: 0,
        visible_after_selection: 1,
      },
      [
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
      -1,
    ],
    [32, { date: 0, included_in_labeled_rows: 1 }, ["date", "included_in_labeled_rows"], -1],
    [
      32,
      { model: 0, stage_trace: 0, stage_trace_note: 0, validation_auc: 4 },
      ["model", "stage_trace", "stage_trace_note", "validation_auc"],
      -1,
    ],
    [16, {}, [], 39],
    [
      32,
      {
        as_of: 0,
        claims: 24,
        embargo: 4,
        families: 11,
        family: 11,
        feature_names: 11,
        folds: 35,
        holdout: 37,
        horizon: 4,
        importance_semantics: 0,
        inference: 38,
        kind: 0,
        provenance: 16,
        rho: 25,
        schema_version: 0,
        seed: 4,
        selected_model: 0,
        selection: 40,
        source: 0,
        split_contract: 0,
        suppressed: 1,
        ticker: 0,
        verdict: 0,
        verdict_reason: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        causal_claim_eligible: 1,
        inference_certified: 1,
        market_claim_eligible: 1,
        precise_edge_confidence: 1,
        trusted_graph: 1,
        validated_alpha: 1,
      },
      [
        "causal_claim_eligible",
        "inference_certified",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ],
      -1,
    ],
    [
      32,
      { factors: 0, hmm2: 0, hmm4: 0, momentum: 0, volatility: 0 },
      ["factors", "hmm2", "hmm4", "momentum", "volatility"],
      -1,
    ],
    [
      32,
      {
        as_of: 0,
        evidence: 0,
        hmm2_posterior: 4,
        hmm2_state: 0,
        momentum_sign: 0,
        run_ids: 43,
        snapshot_artifact: 0,
        state_at: 0,
        volatility_state: 0,
      },
      [
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
      -1,
    ],
    [16, {}, [], 44],
    [32, { asset: 0, entries: 45, semantics: 0 }, ["asset", "entries", "semantics"], -1],
    [
      32,
      { as_of: 0, claims: 42, input_hash: 0, kind: 0, payload: 46, schema_version: 0, sources: 11 },
      ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      -1,
    ],
    [
      32,
      { commit: 0, dependency_manifest_hash: 0, dirty_computation: 1 },
      ["commit", "dependency_manifest_hash", "dirty_computation"],
      -1,
    ],
    [16, {}, [], -1],
    [
      32,
      { meaning: 0, mic: 0, reason: 0, source_url: 0, status: 0, version: 0 },
      ["mic", "status"],
      -1,
    ],
    [32, { first_date: 0, last_date: 0, rows: 4 }, ["first_date", "last_date", "rows"], -1],
    [32, { hml: 51, mkt: 51, mom: 51, rf: 51, smb: 51 }, ["hml", "mkt", "rf", "smb"], -1],
    [
      32,
      { dataset_key: 0, permitted_uses: 11, status: 0 },
      ["dataset_key", "permitted_uses", "status"],
      -1,
    ],
    [
      32,
      {
        admissions: 11,
        analysis_window: 11,
        availability_rule: 0,
        calendar: 50,
        capture_sha256: 0,
        captured_at: 0,
        clock_quality: 0,
        feed_scope: 0,
        field_definition: 0,
        library_coverage: 52,
        licence_decision: 53,
        price_basis: 0,
        signals: 4,
        source: 0,
        source_url: 0,
        source_version_id: 0,
        unit: 0,
      },
      [
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
      -1,
    ],
    [16, {}, [], 54],
    [
      32,
      { first_observed: 0, last_observed: 0, observations: 4 },
      ["first_observed", "last_observed", "observations"],
      -1,
    ],
    [32, { mkt: 56 }, ["mkt"], -1],
    [
      32,
      {
        as_of: 0,
        code_manifest_sha256: 0,
        data_hash: 0,
        execution: 48,
        lineage_digest: 0,
        plugin: 0,
        plugin_version: 0,
        producers: 49,
        profile_sha256: 0,
        run_id: 0,
        sources: 55,
        state_at: 0,
        status: 0,
        windows: 57,
      },
      [
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
      -1,
    ],
    [16, {}, [], 58],
    [32, { mkt: 56, realized_vol_20: 56 }, ["mkt", "realized_vol_20"], -1],
    [
      32,
      {
        as_of: 0,
        code_manifest_sha256: 0,
        data_hash: 0,
        execution: 48,
        lineage_digest: 0,
        plugin: 0,
        plugin_version: 0,
        producers: 59,
        profile_sha256: 0,
        run_id: 0,
        sources: 55,
        state_at: 0,
        status: 0,
        windows: 60,
      },
      [
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
      -1,
    ],
    [16, {}, [], 61],
    [32, { hml: 51, mkt: 51, mom: 51, rf: 51, smb: 51 }, [], -1],
    [
      32,
      {
        admissions: 11,
        analysis_window: 11,
        availability_rule: 0,
        calendar: 50,
        capture_sha256: 0,
        captured_at: 0,
        clock_quality: 0,
        feed_scope: 0,
        field_definition: 0,
        library_coverage: 63,
        licence_decision: 53,
        price_basis: 0,
        signals: 4,
        source: 0,
        source_url: 0,
        source_version_id: 0,
        unit: 0,
      },
      [
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
      -1,
    ],
    [16, {}, [], 64],
    [
      32,
      { hml: 56, hmm2_state: 56, mkt: 56, mom: 56, smb: 56 },
      ["hml", "hmm2_state", "mkt", "mom", "smb"],
      -1,
    ],
    [
      32,
      {
        as_of: 0,
        code_manifest_sha256: 0,
        data_hash: 0,
        execution: 48,
        lineage_digest: 0,
        plugin: 0,
        plugin_version: 0,
        producers: 62,
        profile_sha256: 0,
        run_id: 0,
        sources: 65,
        state_at: 0,
        status: 0,
        windows: 66,
      },
      [
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
      -1,
    ],
    [32, { hmm2_state: 56, mkt: 56, mom: 56 }, ["hmm2_state", "mkt", "mom"], -1],
    [
      32,
      {
        as_of: 0,
        code_manifest_sha256: 0,
        data_hash: 0,
        execution: 48,
        lineage_digest: 0,
        plugin: 0,
        plugin_version: 0,
        producers: 62,
        profile_sha256: 0,
        run_id: 0,
        sources: 65,
        state_at: 0,
        status: 0,
        windows: 68,
      },
      [
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
      -1,
    ],
    [
      32,
      { factors: 67, hmm2: 61, hmm4: 58, momentum: 69, volatility: 58 },
      ["factors", "hmm2", "hmm4", "momentum", "volatility"],
      -1,
    ],
    [
      32,
      { asset: 0, chain: 0, question: 0, runs: 70, source_values: 0 },
      ["asset", "chain", "question", "runs", "source_values"],
      -1,
    ],
    [
      32,
      { as_of: 0, claims: 42, input_hash: 0, kind: 0, payload: 71, schema_version: 0, sources: 11 },
      ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      -1,
    ],
    [
      32,
      { detail: 3, reason: 20, run_id: 0, status: 0, value: 0 },
      ["detail", "reason", "run_id", "status", "value"],
      -1,
    ],
    [32, { open_issue_kinds: 11 }, ["open_issue_kinds"], -1],
    [
      32,
      { detail: 74, reason: 3, run_id: 3, status: 0, value: 4 },
      ["detail", "reason", "run_id", "status", "value"],
      -1,
    ],
    [
      32,
      { detail: 3, reason: 0, run_id: 3, status: 0, value: 3 },
      ["detail", "reason", "run_id", "status", "value"],
      -1,
    ],
    [32, { present: 11, weakest: 0 }, ["present", "weakest"], -1],
    [
      32,
      { detail: 77, reason: 3, run_id: 3, status: 0, value: 0 },
      ["detail", "reason", "run_id", "status", "value"],
      -1,
    ],
    [32, { meaning: 0, neutrality: 0, target: 0 }, ["meaning", "neutrality", "target"], -1],
    [
      32,
      { detail: 79, reason: 0, run_id: 0, status: 0, value: 4 },
      ["detail", "reason", "run_id", "status", "value"],
      -1,
    ],
    [
      32,
      { detail: 3, reason: 20, run_id: 0, status: 0, value: 4 },
      ["detail", "reason", "run_id", "status", "value"],
      -1,
    ],
    [32, { definition: 0, signal: 4 }, ["definition", "signal"], -1],
    [
      32,
      { detail: 82, reason: 20, run_id: 0, status: 0, value: 0 },
      ["detail", "reason", "run_id", "status", "value"],
      -1,
    ],
    [32, { mapping: 0, volatility_state: 0 }, ["mapping", "volatility_state"], -1],
    [
      32,
      { detail: 84, reason: 20, run_id: 0, status: 0, value: 4 },
      ["detail", "reason", "run_id", "status", "value"],
      -1,
    ],
    [
      32,
      {
        current_state: 73,
        data_quality: 75,
        event_pressure: 76,
        evidence_quality: 78,
        factor_exposure: 80,
        hmm_confidence: 81,
        momentum_state: 83,
        volatility_stress: 85,
      },
      [
        "current_state",
        "data_quality",
        "event_pressure",
        "evidence_quality",
        "factor_exposure",
        "hmm_confidence",
        "momentum_state",
        "volatility_stress",
      ],
      -1,
    ],
    [
      32,
      {
        asset: 0,
        badges: 11,
        cells: 86,
        market: 0,
        observation_unit: 0,
        series_label: 0,
        state_at: 0,
        tier: 0,
      },
      [
        "asset",
        "badges",
        "cells",
        "market",
        "observation_unit",
        "series_label",
        "state_at",
        "tier",
      ],
      -1,
    ],
    [16, {}, [], 87],
    [
      32,
      {
        agreement_share: 4,
        first_overlap: 0,
        last_overlap: 0,
        method: 0,
        overlapping_dates: 4,
        pair: 11,
      },
      ["agreement_share", "first_overlap", "last_overlap", "method", "overlapping_dates", "pair"],
      -1,
    ],
    [16, {}, [], 89],
    [32, { asset: 0, last_state_change: 0, state: 0 }, ["asset", "last_state_change", "state"], -1],
    [16, {}, [], 91],
    [
      32,
      { pair: 11, same_state: 1, state_at: 11, state_at_gap_days: 4, volatility_stress_gap: 4 },
      ["pair", "same_state", "state_at", "state_at_gap_days", "volatility_stress_gap"],
      -1,
    ],
    [16, {}, [], 93],
    [
      32,
      {
        historical_agreement: 90,
        rotation_observations: 92,
        state_agreement: 94,
        volatility_dispersion: 4,
      },
      ["historical_agreement", "rotation_observations", "state_agreement", "volatility_dispersion"],
      -1,
    ],
    [32, { rows: 88, semantics: 0, summaries: 95 }, ["rows", "semantics", "summaries"], -1],
    [
      32,
      { as_of: 0, claims: 42, input_hash: 0, kind: 0, payload: 96, schema_version: 0, sources: 11 },
      ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      -1,
    ],
    [
      32,
      { end: 0, mic: 0, package: 0, package_version: 0, sessions_hash: 0, start: 0 },
      ["end", "mic", "package", "package_version", "sessions_hash", "start"],
      -1,
    ],
    [
      32,
      {
        evidence: 98,
        expected_sessions: 4,
        identity: 0,
        meaning: 0,
        mic: 0,
        missing_examples: 49,
        missing_sessions: 4,
        reason: 0,
        status: 0,
        unexpected_dates: 4,
        unexpected_examples: 49,
        unit: 0,
      },
      ["identity", "status", "unit"],
      -1,
    ],
    [
      32,
      { bound_producer_runs: 11, hmm2_run: 0, semantics: 0, volatility_run: 0 },
      ["bound_producer_runs", "hmm2_run", "semantics", "volatility_run"],
      -1,
    ],
    [
      32,
      { intercept: 4, market_beta: 4, neutrality: 0, r_squared: 4 },
      ["intercept", "market_beta", "neutrality", "r_squared"],
      -1,
    ],
    [
      32,
      { expected_duration: 4, hmm_converged: 1, hmm_posterior: 4, hmm_state: 0 },
      ["expected_duration", "hmm_converged", "hmm_posterior", "hmm_state"],
      -1,
    ],
    [32, { momentum_sign: 0, momentum_signal: 4 }, ["momentum_sign", "momentum_signal"], -1],
    [32, { duration: 0, volatility: 0 }, ["duration", "volatility"], -1],
    [
      32,
      {
        arch_lm_pvalue: 4,
        ewma_vol: 4,
        garch_half_life: 4,
        garch_persistence: 4,
        realized_vol_20: 4,
        realized_vol_20_annualised: 4,
        volatility_state: 0,
      },
      [
        "arch_lm_pvalue",
        "ewma_vol",
        "garch_half_life",
        "garch_persistence",
        "realized_vol_20",
        "volatility_state",
      ],
      -1,
    ],
    [
      32,
      { factors: 101, hmm4: 102, momentum: 103, regime: 102, units: 104, volatility: 105 },
      ["factors", "hmm4", "momentum", "regime", "units", "volatility"],
      -1,
    ],
    [
      32,
      { coefficient: 4, hac_se: 4, interval_95: 25, neutrality: 20, t: 4, term: 0 },
      ["coefficient", "hac_se", "interval_95", "neutrality", "t", "term"],
      -1,
    ],
    [16, {}, [], 107],
    [
      32,
      {
        condition: 4,
        inference: 0,
        n: 4,
        r_squared: 4,
        raw_mean: 4,
        residual_mean: 4,
        status: 0,
        terms: 108,
      },
      ["condition", "inference", "n", "r_squared", "raw_mean", "residual_mean", "status", "terms"],
      -1,
    ],
    [
      32,
      { VOL_RANK_1_OF_2: 109, VOL_RANK_2_OF_2: 109 },
      ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
      -1,
    ],
    [32, { explained: 4, raw: 4, residual: 4 }, ["explained", "raw", "residual"], -1],
    [
      32,
      { cumulative: 111, observations: 4, semantics: 0 },
      ["cumulative", "observations", "semantics"],
      -1,
    ],
    [
      32,
      {
        by_state: 110,
        controls: 11,
        decomposition: 112,
        full_window: 109,
        name: 0,
        regime_states: 0,
        rolling_semantics: 0,
        seven_factor: 0,
        stability: 4,
        status: 0,
        target: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      { correlation: 3, event: 3, factor: 3, liquidity: 3, macro: 3, volatility: 4 },
      ["correlation", "event", "factor", "liquidity", "macro", "volatility"],
      -1,
    ],
    [
      32,
      { correlation: 4, event: 4, factor: 4, liquidity: 4, macro: 4, volatility: 4 },
      ["correlation", "event", "factor", "liquidity", "macro", "volatility"],
      -1,
    ],
    [
      32,
      {
        available_contribution_sum: 4,
        contributions: 114,
        coverage: 4,
        score: 3,
        state: 0,
        status: 0,
        weights: 115,
      },
      [
        "available_contribution_sum",
        "contributions",
        "coverage",
        "score",
        "state",
        "status",
        "weights",
      ],
      -1,
    ],
    [
      32,
      { CROSS_MARKET: 0, ECONOMIC: 0, REGIME_DEPENDENCE: 0, STATISTICAL: 0 },
      ["CROSS_MARKET", "ECONOMIC", "REGIME_DEPENDENCE", "STATISTICAL"],
      -1,
    ],
    [
      32,
      {
        inference_replacement: 0,
        note: 0,
        research_os: 0,
        sha256: 0,
        source: 0,
        title: 0,
        verdicts: 117,
      },
      ["inference_replacement", "note", "research_os", "sha256", "source", "title", "verdicts"],
      -1,
    ],
    [16, {}, [], 26],
    [32, { dates: 11, rows: 26 }, ["dates", "rows"], -1],
    [
      32,
      {
        config: 0,
        converged: 1,
        convergence_rule: 0,
        covariances_standardized: 119,
        current_posterior: 25,
        current_state: 0,
        duration_unit: 0,
        expected_duration: 25,
        feature_units: 0,
        features: 11,
        iterations: 4,
        labelling_rule: 0,
        labels: 11,
        log_likelihood: 4,
        mahalanobis_current: 25,
        means_standardized: 26,
        n_states: 4,
        occupancy: 25,
        occupancy_counts: 25,
        ood: 1,
        ood_limit: 4,
        path_semantics: 0,
        posterior_semantics: 0,
        posterior_tail: 120,
        recent_switches: 4,
        return_mean: 25,
        return_variance: 25,
        rows: 4,
        seed: 4,
        semantic_hash: 0,
        status: 0,
        switch_window: 4,
        transition_entropy: 25,
        transition_matrix: 26,
      },
      [
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
      -1,
    ],
    [32, { hmm2: 121, hmm4: 121 }, ["hmm2", "hmm4"], -1],
    [
      32,
      { asset: 0, evidence: 0, id: 0, kind: 0, reason: 0, severity: 0, status: 0 },
      ["asset", "evidence", "id", "kind", "reason", "severity", "status"],
      -1,
    ],
    [16, {}, [], 123],
    [32, { current: 0, sealed: 0, within_run: 0 }, ["current", "sealed", "within_run"], -1],
    [
      32,
      { badges: 49, reason: 20, status: 0, unblock: 3 },
      ["badges", "reason", "status", "unblock"],
      -1,
    ],
    [
      32,
      { badges: 49, reason: 0, status: 0, unblock: 0 },
      ["badges", "reason", "status", "unblock"],
      -1,
    ],
    [
      32,
      { badges: 49, reason: 0, status: 0, unblock: 3 },
      ["badges", "reason", "status", "unblock"],
      -1,
    ],
    [
      32,
      {
        coupling: 126,
        events: 127,
        factors: 128,
        fracture: 128,
        hmm: 126,
        hmm4: 126,
        iohmm: 128,
        momentum: 126,
        seasonality: 127,
        volatility: 126,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        descriptive_sharpe: 4,
        mad: 4,
        mean: 4,
        median: 4,
        n: 4,
        positive_fraction: 4,
        sd: 4,
        sharpe_unit: 0,
      },
      [
        "descriptive_sharpe",
        "mad",
        "mean",
        "median",
        "n",
        "positive_fraction",
        "sd",
        "sharpe_unit",
      ],
      -1,
    ],
    [
      32,
      { VOL_RANK_1_OF_2: 130, VOL_RANK_2_OF_2: 130 },
      ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
      -1,
    ],
    [
      32,
      { mad: 4, mean: 4, median: 4, n: 4, positive_fraction: 4, sd: 4 },
      ["mad", "mean", "median", "n", "positive_fraction", "sd"],
      -1,
    ],
    [
      32,
      { VOL_RANK_1_OF_2: 132, VOL_RANK_2_OF_2: 132 },
      ["VOL_RANK_1_OF_2", "VOL_RANK_2_OF_2"],
      -1,
    ],
    [
      32,
      {
        definition: 0,
        index_label: 0,
        mom_factor_by_regime: 131,
        mom_factor_semantics: 0,
        signal_by_state: 133,
        signal_by_state_semantics: 0,
        status: 0,
        verdicts: 0,
      },
      [
        "definition",
        "index_label",
        "mom_factor_by_regime",
        "mom_factor_semantics",
        "signal_by_state",
        "signal_by_state_semantics",
        "status",
        "verdicts",
      ],
      -1,
    ],
    [
      32,
      {
        f_pvalue: 4,
        f_statistic: 4,
        inference: 0,
        lags: 4,
        lm_pvalue: 4,
        lm_statistic: 4,
        observations: 4,
        semantics: 0,
        status: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      { absolute_dependence: 4, persistence: 4, squared_dependence: 4, vol_level: 4 },
      ["absolute_dependence", "persistence", "squared_dependence", "vol_level"],
      -1,
    ],
    [
      32,
      {
        abs_return_ac: 4,
        break_ratio: 4,
        ewma_vol: 4,
        observations: 4,
        persistence: 4,
        realized_vol: 4,
        rolling_variance: 4,
        rv_20: 4,
        rv_5: 4,
        rv_60: 4,
        shock_score: 4,
        squared_return_ac: 4,
        vol_of_vol: 4,
        vol_z: 4,
      },
      [
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
      -1,
    ],
    [
      32,
      { alpha_lower_95: 4, identified: 1, rule: 0 },
      ["alpha_lower_95", "identified", "rule"],
      -1,
    ],
    [
      32,
      { "alpha[1]": 4, "beta[1]": 4, mu: 4, omega: 4 },
      ["alpha[1]", "beta[1]", "mu", "omega"],
      -1,
    ],
    [
      32,
      {
        alpha: 4,
        arch_identification: 138,
        beta: 4,
        converged: 1,
        estimator: 0,
        fit_status: 0,
        half_life_domain: 0,
        half_life_observations: 4,
        inference: 0,
        log_likelihood: 4,
        mu_percent: 4,
        observations: 4,
        omega_percent2: 4,
        optimizer_message: 0,
        persistence: 4,
        robust_pvalues: 139,
        robust_std_err: 139,
        status: 0,
        unconditional_vol: 4,
        units: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        HIGH_VOL: 4,
        LOW_VOL: 4,
        NORMAL: 4,
        UNRESOLVED: 4,
        VOL_BREAK: 4,
        VOL_CLUSTER: 4,
        VOL_SHOCK: 4,
      },
      ["HIGH_VOL", "LOW_VOL", "NORMAL", "UNRESOLVED", "VOL_BREAK", "VOL_CLUSTER", "VOL_SHOCK"],
      -1,
    ],
    [
      32,
      {
        arch_lm: 135,
        cluster_contributions: 136,
        cluster_score: 4,
        components: 137,
        confidence_meaning: 0,
        descriptive_engine: 0,
        garch: 140,
        state_counts: 141,
        status: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        asset: 0,
        badges: 11,
        calendar: 99,
        claims: 42,
        country: 0,
        coupling: 100,
        current: 106,
        evidence_quality: 77,
        evidence_scope: 0,
        factors: 113,
        fracture: 116,
        frozen_research: 118,
        hmm: 122,
        input_hash: 0,
        issues: 124,
        layers: 125,
        market: 0,
        module_statuses: 129,
        momentum: 134,
        not_a: 0,
        observation_unit: 0,
        profile_sha256: 0,
        requested_as_of: 0,
        run_ids: 43,
        series_label: 0,
        stale_calendar_days: 4,
        state_at: 0,
        tier: 0,
        volatility: 142,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        as_of: 0,
        claims: 42,
        input_hash: 0,
        kind: 0,
        payload: 143,
        schema_version: 0,
        sources: 11,
      },
      ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      -1,
    ],
    [
      32,
      { confidence: 25, labels: 11, offset: 4, state_codes: 25 },
      ["confidence", "labels", "offset", "state_codes"],
      -1,
    ],
    [12, {}, [], -1],
    [16, {}, [], 146],
    [16, {}, [], 147],
    [16, {}, [], 19],
    [
      32,
      {
        cluster_score: 4,
        ewma_vol: 4,
        garch_vol: 4,
        observed_at: 0,
        rv_20: 4,
        rv_5: 4,
        rv_60: 4,
        state: 0,
        vol_z: 4,
      },
      [
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
      -1,
    ],
    [16, {}, [], 150],
    [
      32,
      { rv_20: 149, rv_unit: 0, state_codes: 25, states: 11, tail: 151 },
      ["rv_20", "rv_unit", "state_codes", "states", "tail"],
      -1,
    ],
    [
      32,
      {
        asset: 0,
        dates: 11,
        hmm2: 145,
        hmm4: 145,
        momentum_signal_tail: 148,
        observation_unit: 0,
        path_semantics: 0,
        posterior_semantics: 0,
        run_ids: 43,
        volatility: 152,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        as_of: 0,
        claims: 42,
        input_hash: 0,
        kind: 0,
        payload: 153,
        schema_version: 0,
        sources: 11,
      },
      ["as_of", "claims", "input_hash", "kind", "payload", "schema_version", "sources"],
      -1,
    ],
  ];
  return { roots, nodes };
}
type ClosedNode = [number, Record<string, number>, string[], number];
function validateClosedStructure(value: unknown, root: number, nodes: ClosedNode[]): void {
  function visit(v: unknown, index: number): void {
    const rule = nodes[index];
    if (!rule) throw new Error("Unreviewed complete-source schema path.");
    const type =
      v === null
        ? 1
        : typeof v === "boolean"
          ? 2
          : typeof v === "number"
            ? 4
            : typeof v === "string"
              ? 8
              : Array.isArray(v)
                ? 16
                : typeof v === "object"
                  ? 32
                  : 0;
    if (!type || !(rule[0] & type)) throw new Error("Complete-source field type changed.");
    if (Array.isArray(v)) {
      if (v.length && rule[3] < 0) throw new Error("Unreviewed complete-source array item.");
      for (const child of v) visit(child, rule[3]);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (
        Object.keys(o).some((k) => !Object.hasOwn(rule[1], k)) ||
        rule[2].some((k) => !Object.hasOwn(o, k))
      )
        throw new Error("Undeclared or missing complete-source field.");
      for (const [key, child] of Object.entries(o)) visit(child, rule[1][key]);
    }
  }
  visit(value, root);
}
// Exactly the reachable nodes for the five display paths; complete-original contracts remain separate.
function displayOriginalGrammar() {
  const roots: Record<string, Record<string, number>> = {
    "market-series": { "$.method": 10, "$.weeks": 14 },
    "regimes-timeline": { "$.payload": 34 },
    "regimes-snapshot": { "$.payload.frozen_research": 25 },
    "trace-hmm": { $: 22 },
  };
  const nodes: ClosedNode[] = [
    [8, {}, [], -1],
    [2, {}, [], -1],
    [4, {}, [], -1],
    [16, {}, [], 0],
    [32, { rows: 2, start: 0 }, ["rows", "start"], -1],
    [32, { HML: 4, MKT: 4, MOM: 4, SMB: 4 }, ["HML", "MKT", "MOM", "SMB"], -1],
    [32, { captured_at: 0, sha256: 0, source_url: 0 }, ["captured_at", "sha256", "source_url"], -1],
    [16, {}, [], 6],
    [
      32,
      {
        as_of: 0,
        country: 0,
        coverage: 0,
        disclosure: 0,
        evidence_mode: 0,
        evidence_quality: 3,
        factor_coverage: 5,
        input_hash: 0,
        latest_availability: 0,
        latest_observation: 0,
        library_start: 0,
        market_end: 0,
        market_start: 0,
        missing_market_rows: 2,
        observations: 2,
        price_basis: 0,
        raw_snapshot_ids: 3,
        return_definition: 0,
        series_label: 0,
        source: 3,
        source_captures: 7,
        source_urls: 3,
        split_clock: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        as_of: 0,
        converged: 1,
        feature_names: 3,
        fit_rows: 2,
        n_states: 2,
        seed: 2,
        source_coverage: 8,
        source_input_hash: 0,
        status: 0,
        trace_sha256: 0,
      },
      [
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
      -1,
    ],
    [
      32,
      {
        annualization_sessions: 2,
        base: 2,
        granularity: 0,
        hmm: 9,
        regime_semantics: 0,
        volatility_window_sessions: 2,
      },
      [
        "annualization_sessions",
        "base",
        "granularity",
        "hmm",
        "regime_semantics",
        "volatility_window_sessions",
      ],
      -1,
    ],
    [5, {}, [], -1],
    [9, {}, [], -1],
    [
      32,
      { drawdown: 2, realized_volatility: 11, regime: 12, relative_performance: 2, week: 0 },
      ["drawdown", "realized_volatility", "regime", "relative_performance", "week"],
      -1,
    ],
    [16, {}, [], 13],
    [
      32,
      { causal_claim_eligible: 1, market_claim_eligible: 1, validated_alpha: 1 },
      ["causal_claim_eligible", "market_claim_eligible", "validated_alpha"],
      -1,
    ],
    [16, {}, [], 2],
    [16, {}, [], 16],
    [
      32,
      {
        converged: 1,
        convergence_delta: 11,
        covariance_diagonal: 17,
        iteration: 2,
        loglik: 2,
        means: 17,
        posterior_tail: 17,
        transmat: 17,
      },
      [
        "converged",
        "convergence_delta",
        "covariance_diagonal",
        "iteration",
        "loglik",
        "means",
        "posterior_tail",
        "transmat",
      ],
      -1,
    ],
    [16, {}, [], 18],
    [32, { "0": 0, "1": 0, "2": 0, "3": 0 }, ["0", "1", "2", "3"], -1],
    [
      32,
      { features: 3, mean: 16, scale: 16, variance: 16 },
      ["features", "mean", "scale", "variance"],
      -1,
    ],
    [
      32,
      {
        as_of: 0,
        claims: 15,
        converged: 1,
        dates_tail: 3,
        feature_names: 3,
        feature_start: 0,
        fit_rows: 2,
        frames: 19,
        kind: 0,
        labels: 20,
        latest_feature: 0,
        max_iter: 2,
        n_states: 2,
        provenance: 8,
        scaler: 21,
        scaler_hash: 0,
        schema_version: 0,
        seed: 2,
        semantics: 0,
        source: 0,
        ticker: 0,
        tolerance: 2,
      },
      [
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
      -1,
    ],
    [
      32,
      { factors: 0, hmm2: 0, hmm4: 0, momentum: 0, volatility: 0 },
      ["factors", "hmm2", "hmm4", "momentum", "volatility"],
      -1,
    ],
    [
      32,
      { CROSS_MARKET: 0, ECONOMIC: 0, REGIME_DEPENDENCE: 0, STATISTICAL: 0 },
      ["CROSS_MARKET", "ECONOMIC", "REGIME_DEPENDENCE", "STATISTICAL"],
      -1,
    ],
    [
      32,
      {
        inference_replacement: 0,
        note: 0,
        research_os: 0,
        sha256: 0,
        source: 0,
        title: 0,
        verdicts: 24,
      },
      ["inference_replacement", "note", "research_os", "sha256", "source", "title", "verdicts"],
      -1,
    ],
    [
      32,
      { confidence: 16, labels: 3, offset: 2, state_codes: 16 },
      ["confidence", "labels", "offset", "state_codes"],
      -1,
    ],
    [12, {}, [], -1],
    [16, {}, [], 27],
    [16, {}, [], 28],
    [16, {}, [], 11],
    [
      32,
      {
        cluster_score: 2,
        ewma_vol: 2,
        garch_vol: 2,
        observed_at: 0,
        rv_20: 2,
        rv_5: 2,
        rv_60: 2,
        state: 0,
        vol_z: 2,
      },
      [
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
      -1,
    ],
    [16, {}, [], 31],
    [
      32,
      { rv_20: 30, rv_unit: 0, state_codes: 16, states: 3, tail: 32 },
      ["rv_20", "rv_unit", "state_codes", "states", "tail"],
      -1,
    ],
    [
      32,
      {
        asset: 0,
        dates: 3,
        hmm2: 26,
        hmm4: 26,
        momentum_signal_tail: 29,
        observation_unit: 0,
        path_semantics: 0,
        posterior_semantics: 0,
        run_ids: 23,
        volatility: 33,
      },
      [
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
      -1,
    ],
  ];
  return { roots, nodes };
}
function closedOriginal(value: unknown, contract: string, path = "$"): void {
  const { roots, nodes } = fullOriginalGrammar();
  validateClosedStructure(value, roots[contract]?.[path], nodes);
}
function closedDisplayOriginal(value: unknown, contract: string, path = "$"): void {
  const { roots, nodes } = displayOriginalGrammar();
  validateClosedStructure(value, roots[contract]?.[path], nodes);
}

const MAX_ORIGINAL_BYTES = 2 * 1024 * 1024;
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error("Undeclared display projection field.");
  return value as Record<string, unknown>;
}
function date(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
const SUPPORTED_DATA_KINDS = [
  "health",
  "coverage",
  "issues",
  "lineage",
  "revisions",
  "costs",
  "disagreement",
];
const SUPPORTED_REGIME_KINDS = ["snapshot", "timeline", "factors", "lineage", "history", "matrix"];
const SUPPORTED_FACTOR_KINDS = ["catalog", "audit", "ledger", "lineage"];
function supportedOriginalKind(id: string, entry: ReplayEntry): boolean {
  if (entry.kind.startsWith("data-organ-"))
    return SUPPORTED_DATA_KINDS.includes(entry.kind.slice(11)) && id.startsWith("data-organ:");
  if (entry.kind.startsWith("regimes-"))
    return SUPPORTED_REGIME_KINDS.includes(entry.kind.slice(8)) && id.startsWith("regimes:");
  if (entry.kind.startsWith("factors-"))
    return SUPPORTED_FACTOR_KINDS.includes(entry.kind.slice(8)) && id.startsWith("factors:");
  if (entry.kind === "market-series") return id === "market:US-MKT" || id === "market:IN-MKT";
  if (entry.kind === "risk-state" || entry.kind === "risk-sweep")
    return id.startsWith(entry.kind === "risk-state" ? "risk:state:" : "risk:sweep:");
  if (entry.kind === "hmm" || entry.kind === "signal")
    return new RegExp("^observatory:(US-MKT|IN-MKT):" + entry.kind + "$").test(id);
  return (
    ["forge:runs", "forge:artifacts", "forge:worlds", "forge:baselines"].includes(id) ||
    /^forge:(run|baseline|reality):[a-f0-9]{64}$/.test(id)
  );
}
function requireSupportedOriginalKind(id: string, entry: ReplayEntry): void {
  if (!supportedOriginalKind(id, entry))
    throw new Error(
      "Generic original inspection is unsupported for this retained artifact kind; use its existing workspace reader.",
    );
}
/** Retained catalog metadata does not imply the generic inspector supports its complete payload. */
export function canInspectOriginal(id: string, entry: ReplayEntry): boolean {
  return (
    supportedOriginalKind(id, entry) &&
    entry.status === "AVAILABLE" &&
    entry.bytes > 0 &&
    entry.bytes <= MAX_ORIGINAL_BYTES &&
    typeof entry.url === "string" &&
    entry.licence.permitted_uses.includes("publish_derived")
  );
}
export async function validateFullOriginal(
  id: string,
  entry: ReplayEntry,
  value: unknown,
): Promise<void> {
  requireSupportedOriginalKind(id, entry);
  assertDerivedPayload(value);
  const v = value as Record<string, unknown>;
  if (entry.kind.startsWith("data-organ-")) {
    const { validateDataEnvelope, validateDataBinding, DATA_KINDS } =
      await import("../../data-organ/contracts.ts");
    const kind = entry.kind.slice("data-organ-".length) as (typeof DATA_KINDS)[number];
    if (!DATA_KINDS.includes(kind)) throw new Error("Unreviewed Data artifact kind.");
    validateDataBinding(validateDataEnvelope(value, kind), entry);
  } else if (entry.kind.startsWith("regimes-")) {
    const { validateEnvelope } = await import("../../regimes/contracts.ts");
    const kind = entry.kind.slice("regimes-".length) as
      "snapshot" | "timeline" | "factors" | "lineage" | "history" | "matrix";
    if (!["snapshot", "timeline", "factors", "lineage", "history", "matrix"].includes(kind))
      throw new Error("Unreviewed Regime kind.");
    if (kind !== "factors") closedOriginal(value, "regimes-" + kind);
    else
      object(value, [
        "schema_version",
        "kind",
        "mode",
        "as_of",
        "input_hash",
        "sources",
        "scope",
        "claims",
        "payload",
      ]);
    const result = validateEnvelope(value, kind);
    if (
      result.mode !== "replay" ||
      result.asOf !== entry.as_of ||
      result.inputHash !== entry.input_hash ||
      stableTerminal(result.sources) !== stableTerminal(entry.sources)
    )
      throw new Error("Regime original binding changed.");
  } else if (entry.kind === "market-series") {
    const { validateMarketReplay } = await import("../../replay/contracts.ts");
    closedOriginal(value, "market-series");
    validateMarketReplay(value, id.slice("market:".length), entry.as_of);
  } else if (entry.kind === "risk-state" || entry.kind === "risk-sweep") {
    const { validateRisk, verifyRiskIdentity } = await import("../../risk-manager/contracts.ts");
    const result = validateRisk(value, entry.kind);
    await verifyRiskIdentity(result);
    if (result.input_hash !== entry.input_hash || result.published_at !== entry.as_of)
      throw new Error("Risk original binding changed.");
  } else if (entry.kind.startsWith("factors-")) {
    const { validateMetadata, KNOWN_IDS, KNOWN_METADATA_ENTRIES } =
      await import("../../factors/contracts.ts");
    const kind = entry.kind.slice("factors-".length) as "catalog" | "audit" | "ledger" | "lineage";
    const selection = Object.entries(KNOWN_IDS).find(([, ids]) => ids[kind] === id)?.[0];
    if (!selection || stableTerminal(KNOWN_METADATA_ENTRIES[id]) !== stableTerminal(entry))
      throw new Error("Unreviewed Factor original binding.");
    const [country, cutoff] = selection.split("|");
    validateMetadata(value, kind, country as "US" | "INDIA", cutoff);
  } else if (entry.kind === "hmm" || entry.kind === "signal") {
    const { validateTrace } = await import("../../components/observatory/types.ts");
    const ticker = id.split(":")[1];
    closedOriginal(value, "trace-" + entry.kind);
    const trace = validateTrace(value, { kind: entry.kind, ticker, asOf: entry.as_of });
    if (trace.provenance.input_hash !== entry.input_hash)
      throw new Error("Recorded trace original binding changed.");
  } else if (id.startsWith("forge:")) {
    const adapters = await import("../../forge/data/forge-adapters.ts");
    if (id === "forge:runs") {
      closedOriginal(value, "forge-runs");
      adapters.adaptRunIndex(value);
    } else if (id.startsWith("forge:run:")) adapters.adaptRun(value);
    else if (id === "forge:artifacts") adapters.adaptArtifactIndex(value);
    else if (id === "forge:worlds") adapters.adaptWorldIndex(value);
    else if (id === "forge:baselines") adapters.adaptBaselineIndex(value);
    else if (id.startsWith("forge:baseline:")) adapters.adaptBaseline(value);
    else if (id.startsWith("forge:reality:")) adapters.adaptReality(value);
    else throw new Error("No declared full-original reader for this recorded artifact.");
  } else throw new Error("No declared full-original reader for this artifact kind.");
}
async function readBytes(id: string, entry: ReplayEntry, signal?: AbortSignal): Promise<unknown> {
  requireSupportedOriginalKind(id, entry);
  if (
    entry.status !== "AVAILABLE" ||
    !entry.url ||
    !/^\/artifacts\/replay\/[a-zA-Z0-9_.-]+\.json$/.test(entry.url) ||
    entry.bytes > MAX_ORIGINAL_BYTES ||
    !entry.licence.permitted_uses.includes("publish_derived")
  )
    throw new Error("Original evidence is unavailable or outside the explicit read bound.");
  const response = await fetch(entry.url, { credentials: "omit", signal });
  if (!response.ok) throw new Error("Original retained evidence is unavailable.");
  const bytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (
    bytes.byteLength !== entry.bytes ||
    bytes.byteLength > MAX_ORIGINAL_BYTES ||
    digest !== entry.sha256
  )
    throw new Error("Original evidence SHA-256 or byte length changed.");
  const value = strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  await validateFullOriginal(id, entry, value);
  return value;
}
/** Full payload read through an exact build-verified binding; no current-alias substitution. */
export async function readBoundArtifact<T = unknown>(
  id: string,
  options: { signal?: AbortSignal; binding?: ReplayEntry } = {},
): Promise<T> {
  const bound = await findArtifactBinding(id);
  if (options.binding && stableTerminal(options.binding) !== stableTerminal(bound))
    throw new Error("Caller cannot substitute an original binding.");
  return (await readBytes(id, bound, options.signal)) as T;
}
/** Explicit inspection returns to the unchanged complete original manifest/artifact reader. */
export async function readOriginal<T = unknown>(id: string, signal?: AbortSignal): Promise<T> {
  const binding = await findArtifactBinding(id);
  requireSupportedOriginalKind(id, binding);
  if (binding.bytes > MAX_ORIGINAL_BYTES)
    throw new Error(
      "Original retained evidence exceeds the 2 MiB explicit read bound; original bytes remain unchanged.",
    );
  const { loadReplayManifest } = await import("../../replay/client.ts");
  const manifest = await loadReplayManifest();
  if (stableTerminal(manifest.artifacts[id]) !== stableTerminal(binding))
    throw new Error("Original manifest binding changed; latest was not substituted.");
  if (signal?.aborted) throw new Error("Original inspection cancelled.");
  const value = await readBytes(id, binding, signal);
  if (signal?.aborted) throw new Error("Original inspection cancelled.");
  await validateFullOriginal(id, binding, value);
  return value as T;
}
export async function verifyDisplayProjection(
  value: unknown,
  expectedBinding: ReplayEntry,
  expectedDigest: string,
): Promise<DisplayProjection> {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 128 * 1024)
    throw new Error("Display projection decoded size bound exceeded.");
  const p = object(value, [
    "schema_version",
    "generator_contract",
    "selector",
    "source",
    "originalFullRowCount",
    "range",
    "originalFrameCount",
    "iterationRange",
    "dateRange",
    "limitations",
    "selectedFields",
    "projectionDigest",
  ]);
  if (
    p.selector !== "observatory-trace-window" &&
    ["originalFrameCount", "iterationRange", "dateRange"].some((field) => Object.hasOwn(p, field))
  )
    throw new Error("Trace-only axes are not part of this display projection contract.");
  const source = object(p.source, ["artifactId", "entry"]),
    range = object(p.range, ["start", "end"]);
  if (
    p.schema_version !== "terminal-display/1" ||
    p.generator_contract !== "terminal-generator/1" ||
    ![
      "market-week-window",
      "regime-timeline-window",
      "frozen-research-summary",
      "observatory-trace-window",
    ].includes(String(p.selector)) ||
    typeof source.artifactId !== "string" ||
    stableTerminal(source.entry) !== stableTerminal(expectedBinding) ||
    !count(p.originalFullRowCount) ||
    !count(range.start) ||
    !count(range.end) ||
    range.start > range.end ||
    range.end > p.originalFullRowCount ||
    !Array.isArray(p.limitations) ||
    !p.limitations.length ||
    !p.limitations.every((x) => typeof x === "string" && x.length <= 1200) ||
    typeof p.projectionDigest !== "string" ||
    p.projectionDigest !== expectedDigest
  )
    throw new Error("Display projection identity, range or pinned binding changed.");
  const { projectionDigest: _digest, ...sealed } = p;
  if ((await terminalDigest(sealed)) !== p.projectionDigest)
    throw new Error("Display projection digest changed.");
  assertDerivedPayload(p.selectedFields);
  if (p.selector === "market-week-window") {
    const v = object(p.selectedFields, ["schema_version", "ticker", "as_of", "method", "weeks"]);
    if (
      v.schema_version !== "market-window/1" ||
      !["US-MKT", "IN-MKT"].includes(String(v.ticker)) ||
      v.as_of !== expectedBinding.as_of ||
      !Array.isArray(v.weeks) ||
      v.weeks.length !== range.end - range.start ||
      v.weeks.length > 52
    )
      throw new Error("Market display window changed.");
    closedDisplayOriginal(v.method, "market-series", "$.method");
    closedDisplayOriginal(v.weeks, "market-series", "$.weeks");
    const method = v.method as Record<string, unknown>,
      hmm = method.hmm as Record<string, unknown>,
      coverage = hmm.source_coverage as Record<string, unknown>;
    const asset =
      source.artifactId === "market:IN-MKT"
        ? "IN-MKT"
        : source.artifactId === "market:US-MKT"
          ? "US-MKT"
          : null;
    if (
      expectedBinding.kind !== "market-series" ||
      v.ticker !== asset ||
      source.artifactId !== "market:" + asset ||
      coverage.country !== (asset === "IN-MKT" ? "INDIA" : "US") ||
      hmm.source_input_hash !== expectedBinding.input_hash ||
      coverage.input_hash !== expectedBinding.input_hash
    )
      throw new Error("Market display country/source binding changed.");
    let prior = "";
    for (const row of v.weeks) {
      const w = object(row, [
        "week",
        "relative_performance",
        "drawdown",
        "realized_volatility",
        "regime",
      ]);
      if (
        !date(w.week) ||
        w.week <= prior ||
        !Number.isFinite(w.relative_performance) ||
        !Number.isFinite(w.drawdown) ||
        (w.realized_volatility !== null && !Number.isFinite(w.realized_volatility))
      )
        throw new Error("Market display rows are invalid.");
      prior = w.week;
    }
  } else if (p.selector === "regime-timeline-window") {
    const v = object(p.selectedFields, [
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
    ]);
    closedDisplayOriginal(v, "regimes-timeline", "$.payload");
    const asset = expectedBinding.sources.includes("iima:daily-factors")
      ? "IN-MKT"
      : expectedBinding.sources.includes("ken-french:daily-factors")
        ? "US-MKT"
        : null;
    if (
      expectedBinding.kind !== "regimes-timeline" ||
      v.asset !== asset ||
      v.observation_unit !== (asset === "IN-MKT" ? "observation" : "session")
    )
      throw new Error("Regime display country/unit binding changed.");
    const dates = v.dates as string[];
    if (
      !Array.isArray(v.dates) ||
      v.dates.length !== range.end - range.start ||
      v.dates.length > 100 ||
      !v.dates.every(date) ||
      v.dates.some((d, i) => i > 0 && d <= dates[i - 1]) ||
      !String(v.path_semantics).startsWith("PARAMETER_RETROSPECTIVE") ||
      v.posterior_semantics !== "FILTERED_FORWARD_RECURSION"
    )
      throw new Error("Regime display date/semantics changed.");
    for (const key of ["hmm2", "hmm4"]) {
      const s = object(v[key], ["confidence", "labels", "offset", "state_codes"]);
      if (
        !count(s.offset) ||
        !Array.isArray(s.state_codes) ||
        !Array.isArray(s.confidence) ||
        s.offset + s.state_codes.length !== v.dates.length ||
        s.confidence.length !== s.state_codes.length ||
        !Array.isArray(s.labels) ||
        s.labels.length !== (key === "hmm2" ? 2 : 4) ||
        s.labels.some((label, i) => label !== `VOL_RANK_${i + 1}_OF_${key === "hmm2" ? 2 : 4}`) ||
        s.state_codes.some((n) => !count(n) || n >= (s.labels as string[]).length) ||
        s.confidence.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1)
      )
        throw new Error("Regime display offset/warmup changed.");
    }
    const runs = object(v.run_ids, ["hmm2", "hmm4", "momentum", "volatility", "factors"]);
    if (
      Object.keys(runs).length !== 5 ||
      Object.values(runs).some((id) => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
    )
      throw new Error("Regime producing run IDs changed.");
    if (
      !Array.isArray(v.momentum_signal_tail) ||
      v.momentum_signal_tail.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== 2 ||
          typeof row[0] !== "string" ||
          !dates.includes(row[0].slice(0, 10)) ||
          typeof row[1] !== "number" ||
          !Number.isFinite(row[1]),
      )
    )
      throw new Error("Regime momentum window changed.");
    const vol = object(v.volatility, ["rv_20", "rv_unit", "state_codes", "states", "tail"]);
    if (
      !Array.isArray(vol.rv_20) ||
      !Array.isArray(vol.state_codes) ||
      vol.rv_20.length !== v.dates.length ||
      vol.state_codes.length !== v.dates.length ||
      !Array.isArray(vol.states) ||
      vol.states.some((s) => typeof s !== "string") ||
      vol.state_codes.some((n) => !count(n) || n >= (vol.states as string[]).length) ||
      vol.rv_20.some(
        (n) => n !== null && (typeof n !== "number" || !Number.isFinite(n) || n < 0),
      ) ||
      !Array.isArray(vol.tail) ||
      vol.tail.some(
        (row) =>
          !row || typeof row !== "object" || !dates.includes(String(row.observed_at).slice(0, 10)),
      )
    )
      throw new Error("Regime volatility window changed.");
  } else if (p.selector === "observatory-trace-window") {
    const v = p.selectedFields as Record<string, unknown>,
      iterations = object(p.iterationRange, ["start", "end"]),
      dates = object(p.dateRange, ["start", "end"]);
    closedDisplayOriginal(v, "trace-hmm");
    if (
      source.artifactId !== "observatory:IN-MKT:hmm" ||
      expectedBinding.kind !== "hmm" ||
      expectedBinding.bytes !== 2315028 ||
      !expectedBinding.sources.includes("IIMA") ||
      v.kind !== "hmm" ||
      v.ticker !== "IN-MKT" ||
      v.as_of !== expectedBinding.as_of ||
      p.originalFrameCount !== 100 ||
      p.originalFullRowCount !== 250 ||
      iterations.start !== 92 ||
      iterations.end !== 100 ||
      dates.start !== 190 ||
      dates.end !== 250 ||
      range.start !== 190 ||
      range.end !== 250 ||
      !Array.isArray(v.frames) ||
      v.frames.length !== 8 ||
      !Array.isArray(v.dates_tail) ||
      v.dates_tail.length !== 60 ||
      !count(v.n_states) ||
      v.n_states < 2 ||
      v.n_states > 6 ||
      !Array.isArray(v.feature_names)
    )
      throw new Error("Recorded India HMM axes/source binding changed.");
    const provenance = v.provenance as Record<string, unknown>;
    if (
      provenance.input_hash !== expectedBinding.input_hash ||
      stableTerminal(provenance.source) !== stableTerminal(expectedBinding.sources) ||
      provenance.coverage !== "MARKET_FACTOR" ||
      provenance.price_basis !== "NOT_APPLICABLE_FACTOR_RETURNS"
    )
      throw new Error("Recorded HMM provenance changed.");
    const claims = v.claims as Record<string, unknown>;
    if (Object.values(claims).some((claim) => claim !== false))
      throw new Error("Recorded HMM claims changed.");
    if (
      v.dates_tail.some(
        (date, i) =>
          typeof date !== "string" ||
          !Number.isFinite(Date.parse(date)) ||
          Date.parse(date) > Date.parse(v.as_of as string) ||
          (i > 0 && date <= (v.dates_tail as string[])[i - 1]),
      )
    )
      throw new Error("Recorded HMM date window changed.");
    const finiteVector = (row: unknown, width: number, positive = false) =>
      Array.isArray(row) &&
      row.length === width &&
      row.every((n) => typeof n === "number" && Number.isFinite(n) && (!positive || n >= 0));
    const probability = (row: unknown) =>
      finiteVector(row, v.n_states as number, true) &&
      (row as number[]).every((n) => n <= 1) &&
      Math.abs((row as number[]).reduce((a, b) => a + b, 0) - 1) <= 1e-6;
    for (let i = 0; i < v.frames.length; i++) {
      const frame = v.frames[i] as Record<string, unknown>;
      if (
        frame.iteration !== 93 + i ||
        typeof frame.loglik !== "number" ||
        !Number.isFinite(frame.loglik) ||
        !Array.isArray(frame.means) ||
        frame.means.length !== v.n_states ||
        !frame.means.every((row) => finiteVector(row, (v.feature_names as string[]).length)) ||
        !Array.isArray(frame.covariance_diagonal) ||
        frame.covariance_diagonal.length !== v.n_states ||
        !frame.covariance_diagonal.every((row) =>
          finiteVector(row, (v.feature_names as string[]).length, true),
        ) ||
        !Array.isArray(frame.transmat) ||
        frame.transmat.length !== v.n_states ||
        !frame.transmat.every(probability) ||
        !Array.isArray(frame.posterior_tail) ||
        frame.posterior_tail.length !== 60 ||
        !frame.posterior_tail.every(probability)
      )
        throw new Error("Recorded HMM frame/window changed.");
    }
  } else {
    const v = object(p.selectedFields, [
      "inference_replacement",
      "note",
      "research_os",
      "sha256",
      "source",
      "title",
      "verdicts",
    ]);
    closedDisplayOriginal(v, "regimes-snapshot", "$.payload.frozen_research");
    const verdicts = object(v.verdicts, [
      "CROSS_MARKET",
      "ECONOMIC",
      "REGIME_DEPENDENCE",
      "STATISTICAL",
    ]);
    if (
      p.originalFullRowCount !== 1 ||
      range.start !== 0 ||
      range.end !== 1 ||
      !String(v.research_os).includes("CLOSED") ||
      !String(v.inference_replacement).includes("NOT_CONFIRMED") ||
      Object.keys(verdicts).length !== 4
    )
      throw new Error("Frozen Research summary changed.");
  }
  return value as DisplayProjection;
}
export async function loadDisplayProjection(
  selector: DisplayProjection["selector"],
  asset: string,
  artifactId?: string,
): Promise<DisplayProjection> {
  const projection = await selectProjection(selector, asset, artifactId),
    seed = await loadTerminalSeed();
  const expected = seed.projectionPins?.[projection.source.artifactId + "|" + selector];
  if (!expected) throw new Error("Display projection has no compiled digest pin.");
  return verifyDisplayProjection(
    projection,
    await findArtifactBinding(projection.source.artifactId),
    expected,
  );
}

/** URL traceStep is the original zero-based global frame index. No omitted step is snapped. */
export function projectedTraceFrame(projection: DisplayProjection, traceStep: number): unknown {
  const range = projection.iterationRange;
  if (
    projection.selector !== "observatory-trace-window" ||
    !range ||
    !Number.isSafeInteger(traceStep) ||
    traceStep < range.start ||
    traceStep >= range.end
  )
    throw new Error("Requested original trace step is outside the retained display window.");
  const trace = projection.selectedFields as { frames: unknown[] };
  return trace.frames[traceStep - range.start];
}
