"""Ticker-specific evidence profiles for the stock intelligence product."""

from __future__ import annotations

from typing import Any


def _series(
    item_id: str,
    series_id: str,
    label: str,
    *,
    frequency: str,
    units: str = "pc1",
    unit: str = "% YoY",
) -> dict[str, str]:
    return {
        "id": item_id,
        "series_id": series_id,
        "label": label,
        "units": units,
        "unit": unit,
        "frequency": frequency,
    }


SEMICONDUCTOR_OUTPUT = _series(
    "semiconductor_output",
    "IPG3344S",
    "Semiconductor industrial production",
    frequency="monthly",
)
ELECTRONICS_ORDERS = _series(
    "electronics_orders",
    "A34SNO",
    "Computer and electronics new orders",
    frequency="monthly",
)
ECOMMERCE_SALES = _series(
    "ecommerce_sales",
    "ECOMSA",
    "E-commerce retail sales",
    frequency="quarterly",
)
SOFTWARE_REVENUE = _series(
    "software_revenue",
    "REV5112TAXABL144QSA",
    "Software publisher revenue",
    frequency="quarterly",
)
ADVERTISING_REVENUE = _series(
    "advertising_revenue",
    "REV5418TMSA",
    "Advertising-services revenue",
    frequency="quarterly",
)


STOCK_PROFILES: dict[str, dict[str, Any]] = {
    "NVDA": {
        "company": "NVIDIA",
        "country_code": "USA",
        "industry": "Semiconductors",
        "focus": "Chip output, semiconductor pricing, electronics orders, and integrated-circuit trade.",
        "hs_code": "8542",
        "hs_label": "Electronic integrated circuits",
        "fred": [
            SEMICONDUCTOR_OUTPUT,
            _series(
                "semiconductor_pricing",
                "PCU33443344",
                "Semiconductor producer prices",
                frequency="monthly",
            ),
            ELECTRONICS_ORDERS,
        ],
    },
    "AAPL": {
        "company": "Apple",
        "country_code": "USA",
        "industry": "Consumer Electronics",
        "focus": "Electronics orders, chip supply, online retail mix, and communications-equipment trade.",
        "hs_code": "8517",
        "hs_label": "Telephone and communications apparatus",
        "fred": [
            ELECTRONICS_ORDERS,
            SEMICONDUCTOR_OUTPUT,
            _series(
                "ecommerce_mix",
                "ECOMPCTSA",
                "E-commerce share of retail sales",
                frequency="quarterly",
                units="lin",
                unit="%",
            ),
        ],
    },
    "MSFT": {
        "company": "Microsoft",
        "country_code": "USA",
        "industry": "Cloud & Software",
        "focus": "Software-publisher revenue, enterprise electronics orders, and data-center hardware demand.",
        "fred": [SOFTWARE_REVENUE, ELECTRONICS_ORDERS, SEMICONDUCTOR_OUTPUT],
    },
    "AMZN": {
        "company": "Amazon",
        "country_code": "USA",
        "industry": "E-commerce & Cloud",
        "focus": "E-commerce sales, online retail penetration, and broad retail demand.",
        "fred": [
            ECOMMERCE_SALES,
            _series(
                "ecommerce_mix",
                "ECOMPCTSA",
                "E-commerce share of retail sales",
                frequency="quarterly",
                units="lin",
                unit="%",
            ),
            _series(
                "retail_sales",
                "RSXFS",
                "Advance retail sales",
                frequency="monthly",
            ),
        ],
    },
    "META": {
        "company": "Meta Platforms",
        "country_code": "USA",
        "industry": "Digital Advertising",
        "focus": "Advertising-services revenue, e-commerce demand, and retail activity.",
        "fred": [
            ADVERTISING_REVENUE,
            ECOMMERCE_SALES,
            _series(
                "retail_sales", "RSXFS", "Advance retail sales", frequency="monthly"
            ),
        ],
    },
    "GOOGL": {
        "company": "Alphabet",
        "country_code": "USA",
        "industry": "Search, Advertising & Cloud",
        "focus": "Advertising-services revenue, software demand, and e-commerce activity.",
        "fred": [ADVERTISING_REVENUE, SOFTWARE_REVENUE, ECOMMERCE_SALES],
    },
    "TSLA": {
        "company": "Tesla",
        "country_code": "USA",
        "industry": "Electric Vehicles",
        "focus": "Vehicle production, auto sales, motor-vehicle output, and passenger-car trade.",
        "hs_code": "8703",
        "hs_label": "Passenger motor vehicles",
        "fred": [
            _series(
                "auto_production",
                "DAUPSA",
                "Domestic auto production",
                frequency="monthly",
            ),
            _series(
                "vehicle_sales",
                "TOTALSA",
                "Total vehicle sales",
                frequency="monthly",
            ),
            _series(
                "vehicle_industrial_output",
                "IPG3361T3S",
                "Motor vehicles and parts production",
                frequency="monthly",
            ),
        ],
    },
    "BTC-USD": {
        "company": "Bitcoin",
        "country_code": "USA",
        "industry": "Digital Assets",
        "focus": "Dollar liquidity, policy rates, and money supply rather than national goods trade.",
        "fred": [
            _series(
                "fed_balance_sheet",
                "WALCL",
                "Federal Reserve total assets",
                frequency="weekly",
            ),
            _series(
                "policy_rate",
                "DFF",
                "Effective federal funds rate",
                frequency="daily",
                units="lin",
                unit="%",
            ),
            _series(
                "money_supply",
                "M2SL",
                "M2 money stock",
                frequency="monthly",
            ),
        ],
    },
}


for _etf in ("SPY", "QQQ", "IWM"):
    STOCK_PROFILES[_etf] = {
        "company": _etf,
        "country_code": "USA",
        "industry": "Broad Market ETF",
        "focus": "Broad growth, industrial activity, and inflation for a diversified index exposure.",
        "fred": [
            _series(
                "real_gdp_growth", "GDPC1", "Real GDP growth", frequency="quarterly"
            ),
            _series(
                "industrial_production_growth",
                "INDPRO",
                "Industrial production growth",
                frequency="monthly",
            ),
            _series(
                "consumer_inflation",
                "CPIAUCSL",
                "Consumer inflation",
                frequency="monthly",
            ),
        ],
    }
