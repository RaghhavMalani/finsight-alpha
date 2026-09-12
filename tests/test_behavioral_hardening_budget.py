from pathlib import Path

import pytest

from scripts.run_behavioral_hardening import _models
from src.behavioral_hardening import BudgetExceeded
from src.behavioral_hardening.openai_api import (
    GLOBAL_CAP,
    HardeningSpendLedger,
    frozen_models,
)


ROOT = Path(__file__).resolve().parents[1]


def test_model_configuration_matches_frozen_openai_tiers():
    assert _models(ROOT / "eval/models/forge_v0_2_5_1_openai.json") == frozen_models()


def test_two_dollar_ledger_fails_before_dispatch(tmp_path):
    ledger = HardeningSpendLedger(tmp_path / "requests.jsonl")
    with pytest.raises(BudgetExceeded, match="cannot fit"):
        ledger.reserve(
            "gpt-5.6-luna",
            GLOBAL_CAP + .01,
            {"request": 1},
            GLOBAL_CAP + .01,
        )
    assert not ledger.path.exists()


def test_unresolved_reservation_blocks_resume(tmp_path):
    ledger = HardeningSpendLedger(tmp_path / "requests.jsonl")
    ledger.reserve("gpt-5.6-luna", .10, {"request": 1}, .10)
    with pytest.raises(RuntimeError, match="unresolved API reservation"):
        ledger.reserve("gpt-5.6-luna", .10, {"request": 2}, .10)
