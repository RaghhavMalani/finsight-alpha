from pathlib import Path

import pytest

from src.execution.benchmark import load_execution_task
from src.execution.trust import BoundEngineTrust, CertificationIndex, EngineTrustError


ROOT = Path(__file__).resolve().parents[1]
CERTIFICATION = ROOT / "eval" / "certification" / "forge_v0_2_4" / "engine_probe_artifact.json"
TASK = ROOT / "eval" / "tasks" / "forge_v0_2_4_1" / "task_001.json"


def test_reality_ladder_task_has_exact_c4_allowlist() -> None:
    task = load_execution_task(TASK)
    assert task.schema_version == "0.2.4.1"
    assert task.engine_trust_policy is not None
    assert task.engine_trust_policy.to_dict() == {
        "allowed_engines": {
            "nautilus": {"minimum_certification": "C4"},
            "vectorbt": {"minimum_certification": "C4"},
        }
    }


def test_failed_hftbacktest_is_rejected_before_execution() -> None:
    task = load_execution_task(TASK)
    assert task.engine_trust_policy is not None
    trust = BoundEngineTrust(task.engine_trust_policy, CertificationIndex.load(CERTIFICATION))

    assert trust.require("vectorbt").certification_level == "C4"
    assert trust.require("nautilus").certification_level == "C4"
    with pytest.raises(EngineTrustError, match="not allowed"):
        trust.require("hftbacktest")


def test_certification_rule_rejects_an_under_certified_engine_even_if_allowed() -> None:
    index = CertificationIndex.load(CERTIFICATION)
    with pytest.raises(EngineTrustError, match="below required C1"):
        index.require("hftbacktest", "C1")
