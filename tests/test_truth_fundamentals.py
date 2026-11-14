"""fundamentals(ticker, field, as_of): PIT reads over admitted SEC filings.

Uses the clearly labelled synthetic companyfacts fixture (fictitious company).
"""

from hashlib import sha256
from pathlib import Path

import pytest

from src.data.as_of import AsOfViolation
from src.data_organ import sec_edgar
from src.data_organ.registry import Registry
from src.data_organ.service import Service
from src.truth.fundamentals import (
    AMBIGUOUS,
    AVAILABLE,
    NOT_MEASURED,
    FundamentalObservation,
    FundamentalsBook,
    fundamentals,
    point_in_time,
)

FIXTURES = Path(__file__).parent / "data_organ" / "fixtures"
CAPTURED = "2025-03-01T12:00:00Z"
RESTATED_ACCN = "9999999999-24-000050"


@pytest.fixture
def book(tmp_path):
    raw = (FIXTURES / "sec-companyfacts.synthetic.json").read_bytes()
    captures = sec_edgar.companyfacts(
        raw,
        captured_at=CAPTURED,
        source_url=sec_edgar.COMPANYFACTS_URL.format(cik="9999999999"),
        ticker="FIXT-SYN",
        cik="9999999999",
        ticker_evidence={"sha256": sha256(b"fixture").hexdigest(), "captured_at": "2025-03-01T11:59:00Z"},
    )
    service = Service(Registry(tmp_path / "admissions.duckdb"), tmp_path / "captures")
    for cap, body, rows in captures:
        service.ingest("t1", cap, body, rows, window=("2009-01-01", "2026-12-31"))
    return FundamentalsBook.from_registry(service.registry, "t1")


def test_value_carries_full_provenance(book):
    result = fundamentals("fixt-syn", "revenues_fy", "2024-03-01T00:00:00Z", book=book)
    assert (result.status, result.value) == (AVAILABLE, 1.1e9)
    evidence = result.evidence
    assert evidence["source"] == sec_edgar.SOURCE
    assert evidence["licence"] == "PUBLIC_INFORMATION"
    assert evidence["observed_at"] == CAPTURED  # fetch clock
    assert evidence["effective_at"] == "2023-12-31T00:00:00Z"  # period end
    assert evidence["available_at"] == "2024-02-15T05:00:00Z"
    assert (evidence["revision"], evidence["form"], evidence["fiscal_period"]) == (
        "9999999999-24-000001",
        "10-K",
        "FY",
    )


def test_restatement_filed_after_as_of_is_invisible(book):
    # 10-K/A filed 2024-06-03 restates FY2023 revenue 1.10bn -> 1.05bn.
    before = book.fundamentals("FIXT-SYN", "revenues_fy", "2024-06-03T23:00:00-04:00")
    after = book.fundamentals("FIXT-SYN", "revenues_fy", "2024-06-04T00:00:00-04:00")
    assert (before.value, before.evidence["revision"]) == (1.1e9, "9999999999-24-000001")
    assert (after.value, after.evidence["revision"]) == (1.05e9, RESTATED_ACCN)
    assert book.fundamentals("FIXT-SYN", "assets", "2024-05-01T00:00:00Z").value == 5.4e9
    assert book.fundamentals("FIXT-SYN", "eps_diluted_fy", "2024-05-01T00:00:00Z").value == 2.5
    assert book.fundamentals("FIXT-SYN", "eps_diluted_fy", "2024-07-01T00:00:00Z").value == 2.38


def test_latest_period_wins_and_quarters_are_not_year_to_date(book):
    assert book.fundamentals("FIXT-SYN", "revenues_fy", "2025-03-01T00:00:00Z").value == 1.2e9
    q = book.fundamentals("FIXT-SYN", "revenues_q", "2023-08-10T00:00:00Z")
    assert (q.value, q.evidence["effective_start"]) == (2.7e8, "2023-04-01")
    shares = book.fundamentals("FIXT-SYN", "shares_outstanding", "2024-03-01T00:00:00Z")
    assert shares.value == 4e8


def test_missing_is_not_measured_never_zero(book):
    for result in (
        book.fundamentals("FIXT-SYN", "liabilities", "2025-03-01T00:00:00Z"),
        book.fundamentals("FIXT-SYN", "revenues_fy", "2023-02-15T23:59:59-05:00"),
        book.fundamentals("NOT-CAPTURED", "revenues_fy", "2025-03-01T00:00:00Z"),
    ):
        assert result.status == NOT_MEASURED
        assert result.value is None and result.value != 0
        assert result.reason
    assert "available by as_of" in book.fundamentals(
        "FIXT-SYN", "revenues_fy", "2023-01-01T00:00:00Z"
    ).reason


def observation(**changes):
    base = dict(
        asset="CIK9999999999",
        field="assets",
        value=10.0,
        effective_at="2023-12-31T00:00:00Z",
        available_at=sec_edgar.edgar_available_at("2024-02-14"),
        observed_at=CAPTURED,
        revision="9999999999-24-000001",
        source=sec_edgar.SOURCE,
        licence="PUBLIC_INFORMATION",
        filed="2024-02-14",
    )
    return FundamentalObservation(**(base | changes))


def test_zero_is_a_measured_value_distinct_from_missing():
    result = point_in_time(
        [observation(value=0.0)],
        ticker="FIXT-SYN",
        asset="CIK9999999999",
        field="assets",
        as_of="2025-01-01T00:00:00Z",
    )
    assert (result.status, result.value) == (AVAILABLE, 0.0)


def test_availability_before_period_end_or_backdated_is_rejected():
    with pytest.raises(AsOfViolation, match="precedes the period end"):
        observation(effective_at="2024-02-20T00:00:00Z")
    with pytest.raises(AsOfViolation, match="Filing date precedes"):
        observation(filed="2023-12-30", available_at=sec_edgar.edgar_available_at("2023-12-30"))
    with pytest.raises(AsOfViolation, match="Backdated"):
        observation(available_at="2024-02-14T05:00:00Z")  # one day earlier than the rule
    with pytest.raises(AsOfViolation, match="capture clock"):
        observation(observed_at="2024-02-14T22:00:00Z")
    with pytest.raises(ValueError, match="Unsupported"):
        observation(source="yfinance")


def test_disagreeing_same_instant_filings_are_ambiguous_not_guessed():
    result = point_in_time(
        [observation(), observation(value=11.0, revision="9999999999-24-000002")],
        ticker="FIXT-SYN",
        asset="CIK9999999999",
        field="assets",
        as_of="2025-01-01T00:00:00Z",
    )
    assert (result.status, result.value) == (AMBIGUOUS, None)


def test_as_of_needs_an_explicit_timezone_and_fields_are_declared(book):
    with pytest.raises(ValueError, match="timezone"):
        book.fundamentals("FIXT-SYN", "assets", "2024-05-01T00:00:00")
    with pytest.raises(ValueError, match="Undeclared"):
        book.fundamentals("FIXT-SYN", "eps_diluted", "2024-05-01T00:00:00Z")


def test_period_age_and_optional_staleness_cutoff(book):
    fresh = book.fundamentals("FIXT-SYN", "assets", "2025-03-01T00:00:00Z")
    assert (fresh.status, fresh.period_age_days) == (AVAILABLE, 426)  # 2023-12-31 -> 2025-03-01
    stale = book.fundamentals("FIXT-SYN", "assets", "2025-03-01T00:00:00Z", max_age_days=400)
    assert (stale.status, stale.value, stale.period_age_days) == (NOT_MEASURED, None, 426)
    assert stale.reason.startswith("stale")
    ok = fundamentals("FIXT-SYN", "assets", "2025-03-01T00:00:00Z", book=book, max_age_days=430)
    assert ok.value == 5.35e9


def test_ticker_link_is_disclosed_as_present_day(book):
    evidence = book.fundamentals("FIXT-SYN", "assets", "2024-05-01T00:00:00Z").evidence
    assert evidence["ticker_link"] == "PRESENT_DAY"
    assert evidence["ticker_map_captured_at"] == "2025-03-01T11:59:00Z"
