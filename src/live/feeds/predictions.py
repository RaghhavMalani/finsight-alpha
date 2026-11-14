"""Prediction-market public read APIs: Polymarket (Gamma) and Kalshi (trade API v2).

Prices are traded or indicative contract prices, labelled as such; they are not
calibrated probabilities and nothing here places or simulates an order.
"""

from __future__ import annotations

import json

from .. import model
from .base import Feed, Fetched, content_revision, http_get


def _float(value):
    try:
        return None if value in (None, "") else float(value)
    except (TypeError, ValueError):
        return None


class Polymarket(Feed):
    name = "polymarket"
    event_type = "prediction.update"
    cadence_s = 300
    min_interval_s = 120
    delay = "POLLED_5_MIN: Gamma API snapshot; outcome prices are indicative, not a live order book"
    confidence = "UNOFFICIAL"
    parser = "live-polymarket/1"
    url = "https://gamma-api.polymarket.com/markets"
    keep = 25
    revision_basis = "CONTENT_HASH"
    licence = model.licence(
        "UNVERIFIED", "Polymarket (Gamma public API)", "https://polymarket.com/tos", "LOCAL_ONLY",
        "Public read API; redistribution terms not reviewed. Local display only")

    def fetch(self):
        return self.parse(http_get(self.url, params={"active": "true", "closed": "false", "order": "volume24hr",
                                                     "ascending": "false", "limit": 100}))

    def parse(self, fetched: Fetched):
        markets = json.loads(fetched.raw.decode("utf-8"))
        out = []
        for m in markets if isinstance(markets, list) else []:
            if not m.get("id") or not m.get("updatedAt") or m.get("sportsMarketType") or m.get("gameStartTime"):
                continue
            outcomes = json.loads(m.get("outcomes") or "[]")
            prices = [_float(p) for p in json.loads(m.get("outcomePrices") or "[]")]
            quote = {"outcomes": outcomes, "prices": prices, "last_trade_price": _float(m.get("lastTradePrice")),
                     "best_bid": _float(m.get("bestBid")), "best_ask": _float(m.get("bestAsk"))}
            yes = prices[outcomes.index("Yes")] if "Yes" in outcomes and len(prices) == len(outcomes) else None
            event_slug = ((m.get("events") or [{}])[0] or {}).get("slug")
            out.append(self.observation(
                source_id=str(m["id"]), revision=content_revision(quote),
                observed_at=m["updatedAt"], effective_at=None, fetched=fetched,
                payload={"kind": "prediction_market", "venue": "polymarket", "question": m.get("question"),
                         "slug": m.get("slug"), **quote, "yes_price": yes,
                         "price_basis": "outcomePrices (indicative mid); not a calibrated probability",
                         "volume_24h": _float(m.get("volume24hr")), "end_date": m.get("endDate"),
                         "url": f"https://polymarket.com/event/{event_slug}" if event_slug else None},
            ))
            if len(out) >= self.keep:
                break
        return out


class Kalshi(Feed):
    name = "kalshi"
    event_type = "prediction.update"
    cadence_s = 600
    min_interval_s = 300
    delay = "POLLED_10_MIN: public market snapshot; last traded price and top-of-book at poll time"
    confidence = "UNOFFICIAL"
    parser = "live-kalshi/1"
    url = "https://api.elections.kalshi.com/trade-api/v2/events"
    categories = {"Economics", "Financials", "Companies"}
    keep = 30
    revision_basis = "CONTENT_HASH"
    licence = model.licence(
        "UNVERIFIED", "Kalshi (public trade API v2)", "https://kalshi.com/regulatory/terms", "LOCAL_ONLY",
        "Public market data; redistribution terms not reviewed. Local display only")

    def fetch(self):
        return self.parse(http_get(self.url, params={"status": "open", "limit": 200,
                                                     "with_nested_markets": "true"}))

    def parse(self, fetched: Fetched):
        payload = json.loads(fetched.raw.decode("utf-8"))
        candidates = []
        for event in payload.get("events") or []:
            if event.get("category") not in self.categories:
                continue
            for m in event.get("markets") or []:
                if m.get("ticker") and m.get("updated_time") and m.get("status") in ("active", "open"):
                    candidates.append((event, m))
        candidates.sort(key=lambda em: (-(_float(em[1].get("volume_24h_fp")) or 0.0), em[1]["ticker"]))
        out = []
        for event, m in candidates[: self.keep]:
            traded = (_float(m.get("volume_fp")) or _float(m.get("volume_24h_fp")) or 0.0) > 0
            last = _float(m.get("last_price_dollars"))
            bid = _float(m.get("yes_bid_dollars"))
            quote = {"last_price": last if traded or last else None,  # "0.0000" with no trades is no price
                     "yes_bid": bid if bid else None,  # a zero bid means no bid
                     "yes_ask": _float(m.get("yes_ask_dollars"))}
            out.append(self.observation(
                source_id=m["ticker"], revision=content_revision(quote),
                observed_at=m["updated_time"], effective_at=None, fetched=fetched,
                payload={"kind": "prediction_market", "venue": "kalshi", "event_ticker": m.get("event_ticker"),
                         "event_title": event.get("title"), "category": event.get("category"),
                         "question": m.get("title"), "outcome": m.get("yes_sub_title"), **quote,
                         "yes_price": quote["last_price"],
                         "price_status": "MEASURED" if quote["last_price"] is not None else "NOT_MEASURED: no trades",
                         "price_basis": "last traded YES price in dollars per $1 contract; not a calibrated probability",
                         "volume_24h": _float(m.get("volume_24h_fp")), "close_time": m.get("close_time")},
            ))
        return out
