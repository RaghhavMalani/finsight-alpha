"""Offline tests for evidence-labelled news impact analysis."""

from src.news.impact import analyze_news_impact


def test_provider_tagged_earnings_can_be_likely_driver() -> None:
    payload = analyze_news_impact(
        "AAPL",
        [
            {
                "title": "Apple beats earnings and raises revenue guidance on strong demand",
                "summary": "Margins and EPS exceeded expectations.",
                "publisher": "Test Wire",
                "related_tickers": ["AAPL", "QCOM"],
                "score": 1.0,
            }
        ],
    )

    analysis = payload["analyses"][0]
    assert analysis["relevance_label"] == "PROVIDER-TAGGED"
    assert analysis["causality_label"] == "LIKELY DRIVER"
    assert analysis["event_type"] == "EARNINGS / GUIDANCE"
    assert len(analysis["flow"]) == 4
    assert payload["signal"]["label"] == "BULLISH SKEW"


def test_unverified_story_is_never_called_causal() -> None:
    payload = analyze_news_impact(
        "META",
        [
            {
                "title": "AMD wins a new AI customer after product launch",
                "summary": "",
                "related_tickers": ["AMD"],
                "score": 1.0,
            }
        ],
    )

    analysis = payload["analyses"][0]
    assert analysis["relevance_label"] == "CO-MENTIONED"
    assert analysis["causality_label"] == "CO-MENTIONED · NOT CAUSAL"
    assert analysis["affected_companies"][0]["ticker"] == "META"
