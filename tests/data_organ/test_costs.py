from copy import deepcopy

import pytest

from src.data_organ.catalog import costs_schedule
from src.data_organ.costs import calculate


def test_actual_schedule_separates_subtotal_and_missing_all_in():
    schedule = costs_schedule()
    day = max(r["evidenced_through"] for r in schedule["components"])
    result = calculate(
        schedule, trade_date=day, notional="100000", side="BUY", settlement="DELIVERY"
    )
    assert result["statutory_subtotal"] == "118.17"
    assert result["all_in_estimated_trading_cost"] is None
    assert set(result["all_in_missing"]) == {
        "GST_BASE",
        "brokerage",
        "spread",
        "slippage",
        "dp",
    }
    assert result["statutory_status"] == "PARTIAL"


def test_before_supported_dates_and_derivatives_never_get_current_rates():
    schedule = costs_schedule()
    result = calculate(
        schedule,
        trade_date="2019-12-31",
        notional="100000",
        side="SELL",
        settlement="NON_DELIVERY",
    )
    assert set(result["statutory_missing"]) == {
        "STT",
        "STAMP",
        "SEBI",
        "EXCHANGE",
        "IPFT",
        "GST",
    }
    assert result["all_in_estimated_trading_cost"] is None
    with pytest.raises(ValueError):
        calculate(
            schedule,
            trade_date="2026-10-09",
            notional="100000",
            side="BUY",
            settlement="FUTURES",
        )


@pytest.mark.parametrize("value", [1.0, True, "NaN", "Infinity", "-1"])
def test_cost_inputs_are_exact_finite_decimals(value):
    with pytest.raises((ValueError, TypeError)):
        calculate(
            costs_schedule(),
            trade_date="2026-10-09",
            notional=value,
            side="BUY",
            settlement="DELIVERY",
        )


def test_explicit_broker_inputs_and_evidenced_gst_base_are_required():
    schedule = costs_schedule()
    day = max(r["evidenced_through"] for r in schedule["components"])
    inputs = {
        k: {
            "amount": "0",
            "evidence": "Explicit operator contract-note assumption; test only",
        }
        for k in ("brokerage", "spread", "slippage", "dp")
    }
    inputs["gst_base"] = {
        "amount": "3.17",
        "evidence_url": "https://example.invalid/test-invoice",
        "source_sha256": "a" * 64,
    }
    result = calculate(
        schedule,
        trade_date=day,
        notional="100000",
        side="BUY",
        settlement="DELIVERY",
        inputs=inputs,
    )
    assert result["all_in_status"] == "AVAILABLE"
    assert result["all_in_estimated_trading_cost"] == "118.74"
    bad = deepcopy(schedule)
    bad["components"].append(bad["components"][0])
    with pytest.raises(ValueError, match="overlapping"):
        calculate(
            bad, trade_date=day, notional="100000", side="BUY", settlement="DELIVERY"
        )
