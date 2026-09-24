from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.routes import forge


BASELINE_HASH = "c5b27e19e981b4e554a4ca1c7800d4e186f4511645f642e0536c79ff57d03bbb"
REALITY_HASH = "db37154941316875261869460ee67c7382213c1a12fcdbb5fab84c48284e2e9c"


def test_baseline_projection_matches_frozen_release() -> None:
    projection = forge.get_baseline("forge-v0.2.5")

    assert projection["schema_version"] == "forge-observer-projection/1"
    assert projection["baseline_id"] == BASELINE_HASH
    assert projection["integrity"]["status"] == "MANIFEST_MATCH"
    assert projection["episodes"] == 54
    assert projection["attempts_total"] == 55
    assert projection["excluded_attempts"] == 1
    assert projection["costs"]["all_attempts_usd"] == pytest.approx(0.52861666)

    models = {item["model"]: item for item in projection["model_summaries"]}
    assert models["gpt-5.6-luna"]["verified_research_success_rate"] == pytest.approx(
        0.7777777777777778
    )
    assert models["gpt-5.6-luna"]["critical_gate_failure_rate"] == pytest.approx(
        0.05555555555555555
    )
    assert models["gpt-5.6-terra"]["verified_research_success_rate"] == pytest.approx(
        0.8333333333333334
    )
    assert models["gpt-5.6-sol"]["verified_research_success_rate"] == pytest.approx(
        0.8333333333333334
    )
    assert all(item["false_alpha_acceptance_rate"] == 0.0 for item in models.values())


def test_representative_run_projection_is_redacted_and_exact() -> None:
    index = forge.list_runs(model="gpt-5.6-sol", verdict=None, limit=100)
    summary = next(item for item in index["items"] if item["run_id"].startswith("7bc015925b"))
    projection = forge.get_run(summary["run_id"])

    assert summary["task_class"] == "obviously_fragile_alpha"
    assert projection["task_class"] == "obviously_fragile_alpha"
    assert projection["run"]["trajectory_hash"].startswith("7bc015925b")
    assert projection["run"]["world_hash"].startswith("07bc4122")
    assert len(projection["run"]["actions"]) == 3
    assert projection["run"]["usage"]["total_tokens"] == 2724
    assert projection["run"]["usage"]["inference_cost_usd"] == pytest.approx(0.0136)
    assert projection["run"]["usage"]["wall_seconds"] == pytest.approx(9.433654)
    assert projection["redactions"] == [
        "model_turns.api_evidence.raw_response",
        "model_turns.api_evidence.request",
    ]
    for turn in projection["model_turns"]:
        assert "raw_response" not in turn["api_evidence"]
        assert "request" not in turn["api_evidence"]


def test_reality_ladder_projection_matches_bound_artifact() -> None:
    projection = forge.get_reality_ladder("forge-v0.2.4.1")

    assert projection["schema_version"] == "forge-observer-projection/1"
    assert projection["artifact_hash"] == REALITY_HASH
    assert projection["primary_metric"] == "sharpe"
    assert projection["integrity"]["status"] == "FROZEN_ARTIFACT"
    assert projection["aggregate"]["alpha_survival_ratio"] == pytest.approx(
        0.071873325789
    )
    checkpoints = projection["aggregate"]["checkpoints"]
    assert len(checkpoints) == 6
    assert checkpoints[0]["metrics"]["sharpe"] == pytest.approx(4.799068370892)
    assert checkpoints[-1]["metrics"]["sharpe"] == pytest.approx(0.344925004504)


def test_unknown_or_missing_schema_fails_closed() -> None:
    with pytest.raises(HTTPException) as unknown_baseline:
        forge.get_baseline("not-a-release")
    assert unknown_baseline.value.status_code == 404

    with pytest.raises(HTTPException) as unsupported_schema:
        forge._require_schema({}, "known/schema", "fixture")
    assert unsupported_schema.value.status_code == 409
    assert "MISSING" in str(unsupported_schema.value.detail)
