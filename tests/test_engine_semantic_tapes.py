from __future__ import annotations

from copy import deepcopy
import math

import pytest

from src.execution.semantic_tapes import (
    ENGINE_SUPPORTED_TAPES,
    SEMANTIC_TAPES,
    accounting_from_fills,
    evaluate_semantic_result,
    independent_semantic_oracle,
    semantic_request,
)


def test_t01_through_t12_are_stable_and_worker_request_omits_oracle() -> None:
    assert [tape.tape_id for tape in SEMANTIC_TAPES] == [f"T{i:02d}" for i in range(1, 13)]
    request = semantic_request()
    assert request == semantic_request()
    assert all("expected_executions" not in tape for tape in request["tapes"])
    assert all("tape_hash" in tape for tape in request["tapes"])


def test_accounting_oracle_handles_fees_realized_pnl_and_reversal() -> None:
    by_id = {tape.tape_id: tape for tape in SEMANTIC_TAPES}
    fee = independent_semantic_oracle(by_id["T07"])["account"]
    realized = independent_semantic_oracle(by_id["T08"])["account"]
    reversal = independent_semantic_oracle(by_id["T09"])["account"]
    assert fee["ending_cash"] == pytest.approx(9599.0)
    assert fee["total_fees"] == pytest.approx(1.0)
    assert realized["realized_pnl"] == pytest.approx(10.0)
    assert realized["unrealized_pnl"] == pytest.approx(12.0)
    assert reversal["position"] == pytest.approx(-1.0)
    assert reversal["realized_pnl"] == pytest.approx(20.0)


def test_declared_supported_tape_cannot_be_relabelled_unsupported() -> None:
    tape = SEMANTIC_TAPES[0]
    result = {"tape_id": tape.tape_id, "tape_hash": tape.tape_hash,
              "state": "UNSUPPORTED", "reason": "avoiding a failed tape"}
    assert "CAPABILITY_FALSE_CLAIM" in evaluate_semantic_result(tape, result, engine="vectorbt")


def test_genuine_unsupported_has_reason_and_no_fabricated_values() -> None:
    tape = next(tape for tape in SEMANTIC_TAPES if tape.tape_id == "T03")
    good = {"tape_id": tape.tape_id, "tape_hash": tape.tape_hash,
            "state": "UNSUPPORTED", "reason": "no L2 liquidity model"}
    assert evaluate_semantic_result(tape, good, engine="vectorbt") == []
    bad = dict(good, fills=[], account={"ending_cash": 0.0})
    assert "SCHEMA_INVALID" in evaluate_semantic_result(tape, bad, engine="vectorbt")


@pytest.mark.parametrize("mutation", ["negative", "duplicate", "nonfinite", "bad_enum"])
def test_independent_grader_rejects_mutated_native_records(mutation: str) -> None:
    tape = next(tape for tape in SEMANTIC_TAPES if tape.tape_id == "T08")
    expected = independent_semantic_oracle(tape)
    result = {"tape_id": tape.tape_id, "tape_hash": tape.tape_hash,
              "state": "SUPPORTED", "fills": deepcopy(expected["fills"]),
              "account": deepcopy(expected["account"]), "native_evidence": {"api": "fixture"}}
    if mutation == "negative":
        result["fills"][0]["quantity"] = -1
    elif mutation == "duplicate":
        result["fills"][1]["fill_id"] = result["fills"][0]["fill_id"]
    elif mutation == "nonfinite":
        result["account"]["equity"] = math.inf
    else:
        result["fills"][0]["side"] = "ROTATE"
    assert evaluate_semantic_result(tape, result, engine="vectorbt")


def test_malformed_unhashable_order_id_is_a_schema_failure_not_a_host_crash() -> None:
    tape = SEMANTIC_TAPES[0]
    expected = independent_semantic_oracle(tape)
    result = {"tape_id": tape.tape_id, "tape_hash": tape.tape_hash,
              "state": "SUPPORTED", "fills": deepcopy(expected["fills"]),
              "account": deepcopy(expected["account"]), "native_evidence": {"api": "fixture"}}
    result["fills"][0]["order_id"] = []
    with pytest.raises(TypeError):
        evaluate_semantic_result(tape, result, engine="vectorbt")


def test_capability_manifest_is_explicit_for_each_engine() -> None:
    assert set(ENGINE_SUPPORTED_TAPES) == {"vectorbt", "nautilus", "hftbacktest", "legacy-hft"}
    assert ENGINE_SUPPORTED_TAPES["hftbacktest"] == tuple(f"T{i:02d}" for i in range(1, 13))
    assert all(ENGINE_SUPPORTED_TAPES.values())
