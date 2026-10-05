"""Evidence contract tests use simulated payloads, never certify real activation."""

from datetime import date, datetime, timedelta, timezone
import io
import json
import zipfile

import pytest

from src.dynamics.market_regime_inputs import digest, utc
from src.regime_intelligence.alpaca import (
    AlpacaPITProvider, historical_bar, sessions,
)
from src.regime_intelligence.collector import archive_frame, replay_captures
from src.regime_intelligence.contracts import FactorRelease, Observation, PITDataset, to_world, visible_payload
from src.regime_intelligence.french import parse_zip, release_month_end
from src.regime_intelligence.service import evidence_disclosure, replay_dataset


def raw_bar(timestamp, close=100):
    return {"t": timestamp, "o": close, "h": close + 1, "l": close - 1,
            "c": close, "v": 100, "n": 2}


def convert(row, stream="intraday", calendar=None):
    return historical_bar(row, stream=stream,
                          calendar=calendar or sessions(date(2024, 11, 25), date(2024, 12, 3)),
                          as_of="2026-10-05T12:00:00Z", snapshot_id="a" * 64, content_hash="b" * 64)


def data(rows, **extra):
    return PITDataset(asset="SPY", price_basis="UNADJUSTED", bucket_minutes=1,
                      calendar_note="Simulated test; source calendar XNYS",
                      definitions={}, observations=rows, **extra)


def test_bar_start_never_masquerades_as_receive_and_early_close_is_respected():
    calendar = sessions(date(2024, 11, 28), date(2024, 12, 3))
    assert date(2024, 11, 28) not in calendar
    assert calendar[date(2024, 11, 29)][1] == utc("2024-11-29T18:00:00Z")
    row = convert(raw_bar("2024-11-29T17:59:00Z"), calendar=calendar)
    assert row.observed_at == utc("2024-11-29T18:00:00Z")
    assert row.available_at == utc("2024-11-29T18:15:00Z")
    assert row.quality == "CONSERVATIVE_MARKET_TIME" and row.source == "ALPACA_IEX"
    assert json.loads(row.publication_evidence)["historical_receive_timestamp"] is None
    assert convert(raw_bar("2024-11-29T18:00:00Z"), calendar=calendar) is None
    assert "spread_bps" not in row.values and "liquidity" not in row.values


def test_daily_interval_end_and_dst_are_explicit():
    calendar = sessions(date(2024, 3, 8), date(2024, 3, 13))
    before = convert(raw_bar("2024-03-08T05:00:00Z"), "daily", calendar)
    after = convert(raw_bar("2024-03-11T04:00:00Z"), "daily", calendar)
    assert before.observed_at == utc("2024-03-09T05:00:00Z")
    assert after.observed_at == utc("2024-03-12T04:00:00Z")


def test_unfinished_or_not_yet_available_bars_are_excluded():
    row = raw_bar("2024-11-29T17:59:00Z")
    assert historical_bar(row, stream="intraday", calendar=sessions(date(2024, 11, 29), date(2024, 12, 2)),
                          as_of="2024-11-29T18:14:59Z", snapshot_id="a" * 64, content_hash="b" * 64) is None


def test_iex_disclosure_and_missing_factor_contract_stay_honest():
    daily = [convert(raw_bar(f"2024-11-{day}T05:00:00Z", 100 + i), "daily")
             for i, day in enumerate((25, 26, 27, 29))]
    result = replay_dataset(data(daily), "2024-11-30T06:00:00Z")
    assert result["market_evidence"]["mode"] == "CONSERVATIVE_MARKET_TIME"
    assert result["market_evidence"]["coverage"] == "IEX ONLY"
    assert "Not consolidated US market volume" in result["market_evidence"]["disclosure"]
    assert all(result["claims"][name] is False for name in ("market_claim_eligible", "validated_alpha", "causal_claim_eligible"))
    assert result["analysis"]["current"]["vector"]["F"] is None


def test_future_append_replay_and_cache_are_identical(monkeypatch):
    from src.regime_intelligence import service
    rows = [convert(raw_bar(f"2024-11-{day}T05:00:00Z", 100 + i), "daily")
            for i, day in enumerate((25, 26, 27, 29))]
    cutoff = rows[2].available_at.isoformat()
    prefix = data(rows[:3])
    before = replay_dataset(prefix, cutoff)
    monkeypatch.setattr(service, "compile_world", lambda *a, **kw: pytest.fail("Future append refit earlier replay"))
    after = replay_dataset(data(rows), cutoff)
    assert before == after


def zip_csv(text):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("factors.csv", text)
    return buffer.getvalue()


def test_french_archive_month_end_does_not_leak_and_monthly_is_not_daily():
    release = release_month_end(2025, 8)
    assert release == utc("2025-09-01T04:00:00Z")
    library = parse_zip(zip_csv(",Mkt-RF,SMB,HML,RF\n202507,1,2,3,0.1\n"),
                        family="FF3", source_url="https://mba.tuck.dartmouth.edu/archive.zip",
                        captured_at="2026-10-05T12:00:00Z", available_at=release,
                        release_identity="archive:2025-08", quality="CONSERVATIVE_RELEASE_MONTH",
                        start=date(2016, 1, 1))
    assert library[0].values["MKT"] == 0.01 and library[0].frequency == "monthly"
    dataset = data([], factor_library=library)
    assert visible_payload(dataset, "2025-08-31T23:59:59Z")["factor_library"] == []
    assert len(visible_payload(dataset, release)["factor_library"]) == 1
    assert to_world(dataset.model_dump(mode="json")).factors == []


def test_current_french_daily_file_enters_only_at_its_capture():
    captured = utc("2026-10-05T12:00:00Z")
    library = parse_zip(zip_csv(",Mkt-RF,SMB,HML,RMW,CMA,RF\n20240102,1,2,3,4,5,0.1\n"),
                        family="FF5", source_url="https://mba.tuck.dartmouth.edu/daily.zip",
                        captured_at=captured.isoformat(), available_at=captured,
                        release_identity="current", quality="CAPTURE_ONLY", start=date(2016, 1, 1))
    dataset = data([], factor_library=library)
    assert visible_payload(dataset, "2024-01-04T00:00:00Z")["factor_library"] == []
    assert set(library[0].values) == {"MKT", "SMB", "HML", "RMW", "CMA", "RF"}
    assert not {"QUAL", "VOL", "LIQ"} & library[0].values.keys()
    with pytest.raises(ValueError, match="cannot be backdated"):
        FactorRelease.model_validate({**library[0].model_dump(), "available_at": "2024-01-04T00:00:00Z"})
    with pytest.raises(ValueError, match="cannot be backdated"):
        Observation(stream="factors", observed_at="2024-01-03T05:00:00Z",
                    available_at="2024-01-04T00:00:00Z", as_of=captured,
                    source="KENNETH_FRENCH", revision="test", quality="CAPTURE_ONLY",
                    publication_evidence="Simulated test", values={"values": {"MKT": 0.01}})


def test_websocket_receipt_survives_disk_and_cutoff_with_nanosecond_ceiling(tmp_path):
    calendar = sessions(date(2024, 11, 29), date(2024, 12, 2))
    message = {"T": "b", "S": "SPY", **raw_bar("2024-11-29T17:59:00Z")}
    frame = json.dumps([message])
    received_ns = 1732903200000000001  # 18:00:00 UTC plus one nanosecond.
    records = archive_frame(tmp_path, frame, received_ns=received_ns)
    assert records[0]["received_ns"] == received_ns
    assert replay_captures(tmp_path, asset="SPY", cutoff="2024-11-29T18:00:00Z", calendar=calendar) == []
    rows = replay_captures(tmp_path, asset="SPY", cutoff="2024-11-29T18:00:00.000001Z", calendar=calendar)
    assert rows[0].available_at == utc("2024-11-29T18:00:00.000001Z")
    assert rows[0].quality == "RECEIVE_TIMESTAMP_CAPTURED"
    assert json.loads(rows[0].publication_evidence)["local_receive_ns"] == received_ns
    prefix = data(rows)
    payload = visible_payload(prefix, rows[0].available_at)
    assert utc(payload["observations"][0]["available_at"]) == rows[0].available_at
    mode = evidence_disclosure(payload)
    assert mode["mode"] == "RECEIVE_TIMESTAMP_CAPTURED"
    assert mode["historical_receive_timing"] == "EVIDENCED"
    later = {**message, "t": "2024-11-29T17:58:00Z"}
    archive_frame(tmp_path, json.dumps([later]), received_ns=received_ns + 1_000_000_000)
    assert replay_captures(tmp_path, asset="SPY", cutoff=rows[0].available_at.isoformat(), calendar=calendar) == rows


def test_no_authentication_or_unknown_symbols_enter_market_archive(tmp_path):
    assert archive_frame(tmp_path, '[{"T":"success","msg":"authenticated"}]', received_ns=1) == []
    assert not list(tmp_path.glob("*/*"))
    with pytest.raises(ValueError):
        archive_frame(tmp_path, '[{"T":"t","S":"OTHER","t":"2024-01-01T00:00:00Z"}]', received_ns=1)


def test_alpaca_pagination_resume_and_credential_redaction(monkeypatch, tmp_path):
    monkeypatch.setenv("APCA_API_KEY_ID", "TEST-KEY-DO-NOT-SERIALIZE")
    monkeypatch.setenv("APCA_API_SECRET_KEY", "TEST-SECRET-DO-NOT-SERIALIZE")
    class Session:
        calls = []
        def get(self, url, **kwargs):
            self.calls.append(kwargs)
            token = kwargs["params"].get("page_token")
            class Response:
                status_code = 200
                def json(self):
                    return {"bars": {"SPY": [raw_bar("2024-11-29T05:00:00Z" if not token else "2024-12-02T05:00:00Z")]},
                            "next_page_token": "page-2" if not token else None}
            return Response()
    session = Session()
    provider = AlpacaPITProvider("SPY", date(2024, 11, 29), date(2024, 12, 3), tmp_path, session=session)
    calendar = sessions(provider.start, provider.end)
    first = provider._bars("daily", provider.start, calendar)
    again = provider._bars("daily", provider.start, calendar)
    assert first == again and len(session.calls) == 2
    assert all(call["params"]["feed"] == "iex" and call["params"]["adjustment"] == "raw" for call in session.calls)
    for file in tmp_path.glob("**/*.json"):
        text = file.read_text(encoding="utf-8")
        assert "TEST-KEY" not in text and "TEST-SECRET" not in text
