"""GET /truth/fundamentals: point-in-time, tenant-local, never zero for missing."""
from hashlib import sha256
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes import data_organ, truth
from src.data_organ import sec_edgar
from src.data_organ.registry import Registry
from src.data_organ.service import Service

FIXTURES = Path(__file__).parent / "data_organ" / "fixtures"
FACTS = (FIXTURES / "sec-companyfacts.synthetic.json").read_bytes()
TICKERS = (FIXTURES / "sec-company-tickers.synthetic.json").read_bytes()
CIK = "9999999999"


def client(monkeypatch, tmp_path, org=1, production=False):
    monkeypatch.setattr(data_organ.config, "APP_ENV", "production" if production else "test")
    monkeypatch.setattr(data_organ.config, "EXPORTS_DIR", tmp_path)
    app = FastAPI()

    @app.middleware("http")
    async def identity(request, call_next):
        if org is not None:
            request.state.organization_id = org
            request.state.user_id = 1
        return await call_next(request)

    app.include_router(truth.router)
    return TestClient(app)


def admit(tmp_path, org=1):
    root = tmp_path / "replay-source/data-organ" / str(org)
    svc = Service(Registry(root / "registry.duckdb"), root / "captures")
    captures = sec_edgar.companyfacts(
        FACTS, captured_at="2025-03-01T12:00:00Z", source_url=sec_edgar.COMPANYFACTS_URL.format(cik=CIK),
        ticker="fixt-syn", cik=CIK,
        ticker_evidence={"url": sec_edgar.TICKERS_URL, "sha256": sha256(TICKERS).hexdigest()},
    )
    for cap, raw, rows in captures:
        svc.ingest("org-" + str(org), cap, raw, rows, window=("2009-01-01", "2026-12-31"))


def get(c, **params):
    return c.get("/truth/fundamentals", params={"ticker": "FIXT-SYN", "field": "revenues_fy", **params})


def test_restatement_is_invisible_before_it_was_filed(monkeypatch, tmp_path):
    admit(tmp_path)
    c = client(monkeypatch, tmp_path)
    before = get(c, as_of="2024-06-01T00:00:00Z").json()
    after = get(c, as_of="2024-06-10T00:00:00Z").json()
    assert before["status"] == after["status"] == "AVAILABLE"
    assert (before["value"], after["value"]) == (1.1e9, 1.05e9)  # 10-K, then the 10-K/A filed 2024-06-03
    assert after["evidence"]["form"] == "10-K/A" and after["evidence"]["ticker_link"] == "PRESENT_DAY"


def test_missing_is_not_zero_and_bad_input_is_refused(monkeypatch, tmp_path):
    admit(tmp_path)
    c = client(monkeypatch, tmp_path)
    early = get(c, as_of="2009-01-01T00:00:00Z").json()
    assert early["status"] == "NOT_MEASURED" and early["value"] is None and early["reason"]
    unknown = get(c, ticker="NOPE", as_of="2025-01-01T00:00:00Z").json()
    assert unknown["status"] == "NOT_MEASURED" and unknown["value"] is None
    assert get(c, field="not_a_field", as_of="2025-01-01T00:00:00Z").status_code == 422
    assert get(c, as_of="2025-01-01").status_code == 422  # naive date: no timezone, no answer


def test_reads_are_tenant_local_and_local_only(monkeypatch, tmp_path):
    admit(tmp_path, org=1)
    other = get(client(monkeypatch, tmp_path, org=2), as_of="2025-01-01T00:00:00Z").json()
    assert other["status"] == "NOT_MEASURED"  # admissions of a different organization are not visible
    assert get(client(monkeypatch, tmp_path, org=None), as_of="2025-01-01T00:00:00Z").status_code == 401
    assert get(client(monkeypatch, tmp_path, production=True), as_of="2025-01-01T00:00:00Z").status_code == 503


def test_offsets_are_normalised_and_the_restatement_stays_hidden(monkeypatch, tmp_path):
    admit(tmp_path)
    c = client(monkeypatch, tmp_path)
    # 2024-06-04T09:00+05:30 is 03:30Z, half an hour before the 10-K/A became available (04:00Z).
    assert get(c, as_of="2024-06-04T09:00:00+05:30").json()["value"] == 1.1e9
    assert get(c, as_of="2024-06-04T09:31:00+05:30").json()["value"] == 1.05e9


def test_broken_stored_evidence_is_503_not_a_client_error(monkeypatch, tmp_path):
    admit(tmp_path)
    c = client(monkeypatch, tmp_path)
    for fault in (ValueError("Admitted SEC observation has no filing provenance"), KeyError("ticker")):
        def broken(registry, tenant_id, fault=fault):
            raise fault
        monkeypatch.setattr(truth.FundamentalsBook, "from_registry", staticmethod(broken))
        response = get(c, as_of="2025-01-01T00:00:00Z")
        assert response.status_code == 503 and "provenance" not in response.text
    monkeypatch.undo()
    corrupt = tmp_path / "replay-source/data-organ/3"
    corrupt.mkdir(parents=True)
    (corrupt / "registry.duckdb").write_bytes(b"not a database")
    assert get(client(monkeypatch, tmp_path, org=3), as_of="2025-01-01T00:00:00Z").status_code == 503
