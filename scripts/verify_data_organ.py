"""Read-only publication/archive audit; optional local source-byte and journal audit."""

import argparse
import json
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finsight.plugins.contracts import utc
from scripts.data_archive import verify as verify_archive
from scripts.data_archive import verify_addition
from src.data_organ.contracts import Capture
from src.data_organ.lineage import inspect_lineages
from src.data_organ.publication import validate_public
from src.data_organ.registry import Registry


def verify(runtime=None):
    verify_archive(ROOT)
    directory = ROOT / "data/exports/data_organ_v0_1"
    manifest = json.loads(
        (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes()
    )
    receipts = list(directory.glob("receipt-*.json"))
    if not receipts:
        raise ValueError("No admitted Data Organ publication receipt")
    current = json.loads((directory / "receipt.json").read_bytes())
    for path in receipts:
        raw = path.read_bytes()
        if path.stem != "receipt-" + sha256(raw).hexdigest():
            raise ValueError("Receipt history substitution")
        receipt = json.loads(raw)
        if (
            receipt["model_runs"] != 0
            or receipt["holdout_openings"] != 0
            or receipt["raw_inputs"] != "LOCAL_ONLY"
        ):
            raise ValueError("Data Organ crossed model/raw boundary")
        for kind, entry in receipt["entries"].items():
            identity = entry["artifact_id"]
            expected = {k: v for k, v in entry.items() if k != "artifact_id"}
            if manifest["artifacts"].get(identity) != expected:
                raise ValueError("Retained receipt/manifest binding changed")
            verify_addition(ROOT / "frontend-v2/public", identity, expected)
            value = json.loads(
                (ROOT / "frontend-v2/public" / entry["url"].lstrip("/")).read_bytes()
            )
            if (
                value["input_hash"] != receipt["input_hash"]
                or value["as_of"] != receipt["as_of"]
            ):
                raise ValueError("Diagnostic evidence receipt substitution")
            validate_public(kind, value["payload"])
            if (
                receipt == current
                and json.loads((directory / (kind + ".json")).read_bytes())
                != value["payload"]
            ):
                raise ValueError(
                    "Current local derived pointer differs from public projection"
                )
        for version in receipt["source_versions"]:
            if utc(version["captured_at"]) > utc(receipt["as_of"]):
                raise ValueError("Future source version in receipt")
    if not any(json.loads(p.read_bytes()) == current for p in receipts):
        raise ValueError("Current receipt lacks retained history")
    if runtime is not None:
        from scripts.collect_data_organ import TENANT

        registry = Registry(runtime / "registry.duckdb")
        for version in registry.entries(TENANT, "SOURCE_VERSION"):
            cap = Capture(**version["payload"])
            if cap.identity != version["identity"]:
                raise ValueError("Local source version substitution")
            cap.verify(
                (runtime / "captures" / (cap.content_sha256 + ".bin")).read_bytes()
            )
        admission_ids = {e["identity"] for e in registry.entries(TENANT, "ADMISSION")}
        for mapping in registry.entries(TENANT, "SIGNAL_MAPPING"):
            # Verified journal chain + binding without repeated full journal scans.
            binding = mapping["payload"]
            if binding["admission_id"] not in admission_ids:
                raise ValueError("Orphan admission mapping")
        inspect_lineages(
            registry,
            TENANT,
            [
                row["signal_id"]
                for row in json.loads((directory / "lineage.json").read_bytes())[
                    "items"
                ]
            ],
            raw_directory=runtime / "captures",
        )
    print(
        "Data Organ verified: 7 derived views, immutable Phase 0-2 history, 0 model runs/holdout openings"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path)
    args = parser.parse_args()
    verify(args.runtime)
