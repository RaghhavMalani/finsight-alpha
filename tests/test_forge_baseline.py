import pytest

from src.baseline import PROFILES
from src.rewards import ResourceUsage


def test_offline_baseline_profiles_are_explicit_and_discriminative():
    assert [profile.name for profile in PROFILES] == [
        "deterministic-scripted",
        "offline-weak-model",
        "offline-strong-model",
    ]
    assert PROFILES[0].fault_rate_percent == 0
    assert PROFILES[1].fault_rate_percent > PROFILES[2].fault_rate_percent
    assert all("offline" in profile.model_kind or profile.fault_rate_percent == 0 for profile in PROFILES)


def test_cost_accounting_distinguishes_every_component():
    usage = ResourceUsage(
        inference_cost_usd=0.1,
        embedding_cost_usd=0.01,
        retrieval_cost_usd=0.02,
        compute_cost_usd=0.03,
        external_data_cost_usd=0.04,
        tokens_in=100,
        tokens_out=25,
        sandbox_executions=2,
    )
    serialized = usage.to_dict()
    assert serialized["total_cost_usd"] == pytest.approx(0.2)
    assert ResourceUsage.from_dict(serialized).total_cost_usd == pytest.approx(0.2)
