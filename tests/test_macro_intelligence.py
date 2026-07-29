from src.data import macro_intelligence


def test_country_profile_fetches_all_indicators_and_preserves_dates(monkeypatch):
    calls = []

    def fake_fetch(country: str, code: str, years: int):
        calls.append((country, code, years))
        return [
            {"date": "2022", "value": 1.0, "country": country},
            {"date": "2023", "value": 2.0, "country": country},
            {"date": "2024", "value": 3.0, "country": country},
        ]

    monkeypatch.setattr(macro_intelligence, "_fetch_indicator", fake_fetch)

    result = macro_intelligence.country_profile("ind", years=12)

    assert result["country"] == "IND"
    assert result["latest_observation"] == "2024"
    assert len(result["indicators"]) == len(macro_intelligence.INDICATORS)
    assert len(calls) == len(macro_intelligence.INDICATORS)
    assert result["failures"] == []


def test_signal_is_standardized_against_prior_history():
    series = [
        {"date": str(2010 + index), "value": float(index), "country": "Test"}
        for index in range(12)
    ]

    signal = macro_intelligence._signal(series)

    assert signal["date"] == "2021"
    assert signal["trend"] == "RISING"
    assert signal["change"] == 1.0
    assert signal["z_score"] > 1
    assert signal["percentile"] == 1.0
