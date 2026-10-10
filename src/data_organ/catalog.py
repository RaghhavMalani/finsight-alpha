"""Versioned profiles live in the checked bounded catalog."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def catalog():
    return json.loads((ROOT / "eval/data-organ/v0.1/source-catalog.json").read_bytes())


def costs_schedule():
    return json.loads(
        (ROOT / "eval/data-organ/v0.1/india-cost-schedules.json").read_bytes()
    )
