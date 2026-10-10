"""Audit published SDK evidence without recomputing a model or reopening holdout."""

from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from finsight.plugins import RunRegistry
from src.replay.publication import assert_derived
from scripts.research_archive import verify_closed_history


def verify_run(directory, receipt, manifest, *, latest=False):
    raw = (
        directory / ("registry-" + receipt["registry_sha256"] + ".json")
    ).read_bytes()
    if sha256(raw).hexdigest() != receipt["registry_sha256"]:
        raise ValueError("Published attempt history bytes changed")
    snapshot = json.loads(raw)
    assert_derived(snapshot)
    with tempfile.TemporaryDirectory() as temporary:
        registry = RunRegistry(Path(temporary) / "audit.sqlite")
        registry.restore("public-fixture", snapshot)
        result = registry.read("public-fixture", receipt["run_id"])
        if (
            not result
            or result["status"] != "COMPUTED"
            or registry.identity(result["contract"]) != result["run_id"]
        ):
            raise ValueError("Sealed run contract mismatch")
        if (
            result["holdout_openings"] != 1
            or result["contract"]["code"]["dirty_computation"]
        ):
            raise ValueError("Unaccounted holdout or dirty execution")
        events = [
            e
            for e in registry.events("public-fixture")
            if e["run_id"] == result["run_id"]
        ]
        if sum(e["event"] == "HOLDOUT_OPENED" for e in events) != 1:
            raise ValueError("Recorded holdout access mismatch")
        if events.index(
            next(e for e in events if e["event"] == "SELECTION_FROZEN")
        ) >= events.index(next(e for e in events if e["event"] == "HOLDOUT_OPENED")):
            raise ValueError("Holdout preceded selection freeze")
        if (
            any(v is not False for v in result["claims"].values())
            or result["inference_capability"]["supported_domains"]
        ):
            raise ValueError("Inference/market claim promotion")
        for name in ("null_world", "planted_effect"):
            hook = result["honesty"][name]
            if (
                hook["status"] != "MEASURED"
                or hook["worlds"] != 1
                or hook["certificate"] is not False
                or hook["type_i_error_estimated"] is not False
            ):
                raise ValueError("Engineering control misrepresented")
        if result["honesty"]["leakage_sabotage"]["status"] != "REJECTED_AS_REQUIRED":
            raise ValueError("Leakage boundary not exercised")
    fixture = ROOT / "eval/plugins/nervous-system-v0.1/pit-fixture.json"
    if sha256(fixture.read_bytes()).hexdigest() != receipt["fixture_sha256"]:
        raise ValueError("Checked fixture changed")
    public = ROOT / "frontend-v2/public"
    identity = receipt["artifact_id"]
    entry = manifest["artifacts"][identity]
    if (
        entry != receipt["entry"]
        or (latest and manifest["routes"]["/plugins/momentum-fixture"] != identity)
    ):
        raise ValueError("Publication receipt/manifest mismatch")
    payload = (public / entry["url"].lstrip("/")).read_bytes()
    if sha256(payload).hexdigest() != entry["sha256"] or len(payload) != entry["bytes"]:
        raise ValueError("Public Replay bytes changed")
    value = json.loads(payload)
    assert_derived(value)
    if (
        value["contract"] != result["contract"]
        or value["run_id"] != receipt["run_id"]
        or value["predictions"] != result["predictions"]
    ):
        raise ValueError("Replay differs from the sealed actual run")
    publications = [
        e["payload"]
        for e in snapshot["events"]
        if e["run_id"] == receipt["run_id"] and e["event"] == "ARTIFACT_PUBLISHED"
    ]
    if publications != [
        {"url": entry["url"], "sha256": entry["sha256"], "bytes": entry["bytes"]}
    ]:
        raise ValueError("Artifact registry binding changed")
    subprocess.check_call(
        ["git", "merge-base", "--is-ancestor", receipt["code_commit"], "HEAD"], cwd=ROOT
    )
    return result


def verify():
    directory = ROOT / "data/exports/nervous_system_v0_1"
    latest = json.loads((directory / "receipt.json").read_bytes())
    raw = (directory / "registry.json").read_bytes()
    if sha256(raw).hexdigest() != latest["registry_sha256"]:
        raise ValueError("Current registry/receipt binding changed")
    snapshot = json.loads(raw)
    assert_derived(snapshot)
    manifest = json.loads(
        (ROOT / "frontend-v2/public/replay-manifest.json").read_bytes()
    )
    receipts = [
        json.loads(p.read_bytes()) for p in sorted(directory.glob("receipt-*.json"))
    ]
    if {r["run_id"] for r in receipts} != {
        r["run_id"] for r in snapshot["runs"]
    }:
        raise ValueError("Historical run or receipt omitted")
    if latest not in receipts:
        raise ValueError("Current receipt differs from retained history")
    runs = {r["run_id"]: r for r in snapshot["runs"]}
    for receipt in receipts:
        result = verify_run(directory, receipt, manifest, latest=receipt == latest)
        retained = runs[receipt["run_id"]]
        if (
            result["contract"] != retained["contract"]
            or result["predictions"] != retained["predictions"]
        ):
            raise ValueError("Historical computation replaced in current registry")
        events = [
            e for e in snapshot["events"] if e["run_id"] == receipt["run_id"]
        ]
        if sum(e["event"] == "HOLDOUT_OPENED" for e in events) != 1:
            raise ValueError("Historical opening lost or repeated")
    verify_closed_history(ROOT)
    print(
        f"Plugin Replay verified: {len(receipts)} retained runs, "
        "one recorded opening each; no computation executed"
    )


if __name__ == "__main__":
    verify()
