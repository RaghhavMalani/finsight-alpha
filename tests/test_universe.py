from src.data.universe import _dedupe, _parse_pipe, _row


def test_nasdaq_directory_parser_filters_tests_and_maps_etfs():
    text = "Symbol|Security Name|Test Issue|ETF\nAAPL|Apple Inc.|N|N\nQQQ|Invesco QQQ|N|Y\nZTEST|Test Security|Y|N\nFile Creation Time: 07292026||||\n"

    rows = _parse_pipe(text, "NASDAQ_LISTED")

    assert [row["quote_symbol"] for row in rows] == ["AAPL", "QQQ"]
    assert rows[0]["asset_type"] == "EQUITY"
    assert rows[1]["asset_type"] == "ETF"


def test_indian_directory_symbol_retains_provider_suffix():
    row = _row(
        "RELIANCE.NS",
        "Reliance Industries Ltd.",
        "IN",
        "NSE",
        "EQUITY",
        "NSE_SECURITY_MASTER",
    )

    assert row["symbol"] == "RELIANCE"
    assert row["quote_symbol"] == "RELIANCE.NS"
    assert row["currency"] == "INR"


def test_authoritative_directory_replaces_resilient_seed():
    seed = _row("AAPL", "Apple", "US", "NASDAQ", "EQUITY", "RESILIENT_SEED")
    official = _row(
        "AAPL", "Apple Inc. Common Stock", "US", "NASDAQ", "EQUITY", "NASDAQ_LISTED"
    )

    result = _dedupe([seed, official])

    assert len(result) == 1
    assert result[0]["source"] == "NASDAQ_LISTED"
