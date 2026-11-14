"""SEC EDGAR companyfacts provider: offline, on a clearly labelled synthetic fixture."""

import copy
import json
from hashlib import sha256
from pathlib import Path

import pytest

from src.data_organ import sec_edgar
from src.data_organ.contracts import validate_observation
from src.data_organ.registry import Registry
from src.data_organ.service import Service

FIXTURES = Path(__file__).parent / "fixtures"
FACTS = (FIXTURES / "sec-companyfacts.synthetic.json").read_bytes()
TICKERS = (FIXTURES / "sec-company-tickers.synthetic.json").read_bytes()
CIK = "9999999999"
CAPTURED = "2025-03-01T12:00:00Z"
FACTS_URL = sec_edgar.COMPANYFACTS_URL.format(cik=CIK)


def parse(raw=FACTS, captured_at=CAPTURED):
    return sec_edgar.companyfacts(
        raw,
        captured_at=captured_at,
        source_url=FACTS_URL,
        ticker="fixt-syn",
        cik=CIK,
        ticker_evidence={"url": sec_edgar.TICKERS_URL, "sha256": sha256(TICKERS).hexdigest()},
    )


def ingest(tmp_path, captures):
    service = Service(Registry(tmp_path / "admissions.duckdb"), tmp_path / "captures")
    results = [
        service.ingest("t1", cap, raw, rows, window=("2009-01-01", "2026-12-31"))
        for cap, raw, rows in captures
    ]
    return service.registry, results


def rows_of(captures):
    return [r for _, _, rows in captures for r in rows]


def mutated(edit):
    payload = json.loads(FACTS)
    edit(payload["facts"]["us-gaap"])
    return json.dumps(payload).encode()


def test_availability_is_next_new_york_midnight_after_filing_date():
    assert sec_edgar.edgar_available_at("2024-02-14") == "2024-02-15T05:00:00Z"  # EST
    assert sec_edgar.edgar_available_at("2024-06-03") == "2024-06-04T04:00:00Z"  # EDT
    assert sec_edgar.edgar_available_at("2024-03-09") == "2024-03-10T05:00:00Z"  # DST eve


def test_rows_carry_filing_provenance_and_restatements_append():
    captures = parse()
    assert [c.unit for c, _, _ in captures] == ["USD", "USD/shares", "shares"]
    for cap, _, _ in captures:
        assert cap.source == sec_edgar.SOURCE
        assert cap.clock_quality == "CONSERVATIVE_VINTAGE_DAY"
        assert cap.licence["status"] == "PUBLIC_INFORMATION"
        assert "publish_derived" not in cap.licence["permitted_uses"]
        assert cap.metadata["user_agent"] == sec_edgar.USER_AGENT
        assert "@" not in sec_edgar.USER_AGENT
        assert cap.metadata["excluded_rows"] == {"undeclared_concept": 1, "unsupported_duration": 1}
    fy2023 = [
        r for r in rows_of(captures)
        if r["field"] == "revenues_fy" and r["observed_at"] == "2023-12-31T00:00:00Z"
    ]
    assert [(r["revision"], r["form"], r["value"]) for r in fy2023] == [
        ("9999999999-24-000001", "10-K", 1.1e9),
        ("9999999999-24-000050", "10-K/A", 1.05e9),
        ("9999999999-25-000001", "10-K", 1.05e9),
    ]
    assert fy2023[1]["available_at"] == "2024-06-04T04:00:00Z"
    assert fy2023[1]["fiscal_period"] == "FY" and fy2023[1]["effective_start"] == "2023-01-01"
    quarters = [r for r in rows_of(captures) if r["field"] == "revenues_q"]
    assert [r["value"] for r in quarters] == [2.6e8, 2.7e8]  # 6-month YTD is not a quarter


def test_admission_keeps_every_filing_and_its_provenance(tmp_path):
    registry, results = ingest(tmp_path, parse())
    assert [r["quarantined"] for r in results] == [0, 0, 0]
    assert sum(r["admitted"] for r in results) == 14
    observations = [
        o for e in registry.entries("t1", "ADMISSION") for o in e["payload"]["observations"]
    ]
    restated = [o for o in observations if o["revision"] == "9999999999-24-000050"]
    assert {o["field"] for o in restated} == {"revenues_fy", "assets", "eps_diluted_fy"}
    assert all(o["form"] == "10-K/A" and o["filed"] == "2024-06-03" for o in restated)


def test_filing_after_capture_is_not_admissible_yet(tmp_path):
    _, results = ingest(tmp_path, parse(captured_at="2025-02-12T20:00:00Z"))
    assert results[0]["quarantined"] == 2  # FY2024 10-K rows filed on the capture day


def test_backdated_or_impossible_filings_are_quarantined(tmp_path):
    def sabotage(facts):
        rows = facts["Revenues"]["units"]["USD"]
        rows.append({**rows[0], "filed": "2022-12-01", "accn": "9999999999-22-000099"})
        rows.append({**rows[0], "accn": "9999999999-23-000098", "val": 1.0})
        facts["Assets"]["units"]["EUR"] = [copy.deepcopy(facts["Assets"]["units"]["USD"][0])]

    captures = parse(mutated(sabotage))
    reasons = [r["quarantine_reason"] for r in rows_of(captures) if r.get("quarantine_reason")]
    assert reasons.count("Filing date precedes period end") == 1
    assert reasons.count("Conflicting values for one period at one filing instant") == 2
    assert reasons.count("Undeclared unit EUR for Assets") == 1
    registry, results = ingest(tmp_path, captures)
    assert results[0]["quarantined"] == 4
    quarantine = registry.entries("t1", "ADMISSION")[0]["payload"]["quarantine"]
    assert {q["reason"] for q in quarantine} == set(reasons)


def test_identical_same_instant_duplicates_collapse_without_overwriting():
    def duplicate(facts):
        rows = facts["Revenues"]["units"]["USD"]
        rows.append({**rows[0], "accn": "9999999999-23-000002"})

    captures = parse(mutated(duplicate))
    assert captures[0][0].metadata["collapsed_same_instant_duplicates"] == 1
    fy2022 = [
        r for r in rows_of(captures)
        if r["field"] == "revenues_fy" and r["observed_at"] == "2022-12-31T00:00:00Z"
    ]
    assert [r["revision"] for r in fy2022] == ["9999999999-23-000001", "9999999999-24-000001"]


def test_availability_before_period_end_is_rejected_by_the_contract():
    cap, _, rows = parse()[0]
    row = {**rows[0], "available_at": "2022-12-30T05:00:00Z"}
    with pytest.raises(ValueError, match="clocks"):
        validate_observation(row, cap)


def test_rows_without_provenance_normalize_exactly_as_before():
    cap, _, rows = parse()[0]
    plain = {k: rows[0][k] for k in ("asset", "field", "value", "observed_at", "available_at")}
    assert set(validate_observation(plain, cap)) == {
        "asset", "field", "value", "observed_at", "available_at", "revision"
    }


class FakeResponse:
    def __init__(self, status, content):
        self.status_code, self.content = status, content


def test_fetch_uses_declared_agent_bounded_urls_and_cik_mapping():
    seen = []

    def transport(url, headers, timeout):
        seen.append((url, headers["User-Agent"]))
        return FakeResponse(200, TICKERS if url == sec_edgar.TICKERS_URL else FACTS)

    captures = sec_edgar.fetch_companyfacts(
        "fixt-syn", transport=transport, limiter=sec_edgar.RateLimiter()
    )
    assert seen == [(sec_edgar.TICKERS_URL, sec_edgar.USER_AGENT), (FACTS_URL, sec_edgar.USER_AGENT)]
    meta = captures[0][0].metadata
    assert (meta["ticker"], meta["cik"]) == ("FIXT-SYN", CIK)
    assert meta["ticker_map"]["sha256"] == sha256(TICKERS).hexdigest()
    with pytest.raises(ValueError, match="bounded SEC"):
        sec_edgar.get("https://example.com/x.json", transport=transport)
    with pytest.raises(ValueError, match="HTTP 403"):
        sec_edgar.get(FACTS_URL, transport=lambda *a, **k: FakeResponse(403, b""))
    with pytest.raises(ValueError, match="absent"):
        sec_edgar.cik_for("NOPE", TICKERS)


def test_rate_limiter_never_exceeds_ten_requests_per_second():
    now = [0.0]
    limiter = sec_edgar.RateLimiter(
        clock=lambda: now[0], sleep=lambda s: now.__setitem__(0, now[0] + s)
    )
    starts = [limiter.wait() for _ in range(35)]
    assert all(b - a >= 1.0 - 1e-9 for a, b in zip(starts, starts[10:]))
    assert starts[-1] >= 3.0
    with pytest.raises(ValueError, match="10 requests"):
        sec_edgar.RateLimiter(per_second=11)
