"""Country economic profiles and explainable cross-market relays."""

from __future__ import annotations

from fastapi import APIRouter, Query

from src.data.macro_intelligence import COUNTRY_MARKETS, country_profile, macro_relay

router = APIRouter(prefix="/macro", tags=["macro"])


@router.get("/countries")
def countries() -> dict:
    return {
        "items": [
            {
                "iso3": iso,
                "name": row["name"],
                "market_proxies": {
                    key: value for key, value in row.items() if key != "name"
                },
            }
            for iso, row in COUNTRY_MARKETS.items()
        ],
        "source": "WORLD_BANK_INDICATORS_V2",
    }


@router.get("/country/{country}")
def profile(country: str, years: int = Query(15, ge=5, le=50)) -> dict:
    return country_profile(country, years)


@router.get("/relay")
def relay(
    countries: str = Query("USA,IND,CHN,DEU,JPN"),
    years: int = Query(15, ge=5, le=50),
) -> dict:
    parsed = list(
        dict.fromkeys(
            part.strip().upper() for part in countries.split(",") if part.strip()
        )
    )[:12]
    return macro_relay(parsed, years)
