"""Approved publication cannot rewrite historical evidence, routing or claims."""

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import subprocess

import pytest

from scripts import research_archive as archive


def test_current_publication_keeps_all_prior_evidence():
    archive.verify_shared_history(Path(__file__).resolve().parents[2])


@pytest.fixture
def publication(tmp_path, monkeypatch):
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=tmp_path, text=True).strip()

    git("init", "-q")
    public = tmp_path / archive.PUBLIC
    public.mkdir(parents=True)
    (public / "prior.json").write_bytes(b'{"frozen":"evidence"}\n')
    policy = tmp_path / "src/data/license_policy.py"
    policy.parent.mkdir(parents=True)
    policy.write_text("# closed source policy\n", encoding="utf-8")
    original = {
        "schema_version": "terminal-replay/1",
        "as_of": "2026-10-08T04:10:00Z",
        "claims": {"market_claim_eligible": False},
        "artifacts": {"prior": {"url": "/prior.json", "source": "frozen"}},
        "routes": {"/prior": "prior"},
    }
    manifest = public / "replay-manifest.json"
    manifest.write_text(json.dumps(original), encoding="utf-8")
    git("add", ".")
    git(
        "-c",
        "user.name=Archive test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-qm",
        "Frozen boundary",
    )
    baseline = git("rev-parse", "HEAD")
    monkeypatch.setattr(archive, "BASELINE", baseline)
    monkeypatch.setattr(archive, "SHARED_BASELINE", baseline)
    current = deepcopy(original)
    run_id = "a" * 64
    identity = "plugins:run:" + run_id
    payload = {
        "run_id": run_id,
        "scope": "SYNTHETIC_REFERENCE",
        "tenant_id": "public-fixture",
        "claims": {
            "causal_claim_eligible": False,
            "inference_certified": False,
            "market_claim_eligible": False,
            "validated_alpha": False,
        },
    }
    path = public / ("artifacts/replay/plugins-run-" + run_id + ".json")
    path.parent.mkdir(parents=True)
    entry = {
        "url": "/artifacts/replay/" + path.name,
        "kind": "plugin-run",
        "status": "AVAILABLE",
        "scope": "SYNTHETIC_REFERENCE",
        "sources": ["project:nervous-fixture"],
        "licence": {
            "dataset_key": "project:nervous-fixture",
            "status": "FIRST_PARTY",
            "permitted_uses": ["publish_derived"],
        },
    }
    current["artifacts"][identity] = entry
    current["routes"]["/plugins/momentum-fixture"] = identity

    def save():
        raw = json.dumps(payload).encode()
        path.write_bytes(raw)
        entry.update(sha256=sha256(raw).hexdigest(), bytes=len(raw))
        manifest.write_text(json.dumps(current), encoding="utf-8")

    save()
    return tmp_path, public, current, entry, payload, save, git


def test_reviewed_append_is_allowed_without_opening_research(publication):
    root, _, _, _, _, _, _ = publication
    archive.verify_shared_history(root)


@pytest.mark.parametrize(
    "attack",
    [
        "old_bytes",
        "committed_old_bytes",
        "old_route",
        "old_source",
        "missing_old_entry",
        "manifest_claim",
        "manifest_zero_claim",
        "manifest_clock",
        "extra_route",
        "extra_artifact",
        "extra_file",
        "policy",
        "vendor_source",
        "scope",
        "rehash_claim",
        "rehash_zero_claim",
        "rehash_tenant",
        "payload_bytes",
    ],
)
def test_append_exception_cannot_hide_substitution(publication, attack):
    root, public, current, entry, payload, save, git = publication
    if attack in {"old_bytes", "committed_old_bytes"}:
        (public / "prior.json").write_bytes(b'{"frozen":"substituted"}\n')
    elif attack == "old_route":
        current["routes"]["/prior"] = "plugins:run:" + "a" * 64
    elif attack == "old_source":
        current["artifacts"]["prior"]["source"] = "substituted"
    elif attack == "missing_old_entry":
        del current["artifacts"]["prior"]
    elif attack == "manifest_claim":
        current["claims"]["market_claim_eligible"] = True
    elif attack == "manifest_zero_claim":
        current["claims"]["market_claim_eligible"] = 0
    elif attack == "manifest_clock":
        current["as_of"] = "2027-01-01T00:00:00Z"
    elif attack == "extra_route":
        current["routes"]["/markets/spy"] = "plugins:run:" + "a" * 64
    elif attack == "extra_artifact":
        current["artifacts"]["vendor:run"] = deepcopy(entry)
    elif attack == "extra_file":
        (public / "vendor.json").write_bytes(b"{}")
    elif attack == "policy":
        (root / "src/data/license_policy.py").write_text(
            "# permit all\n", encoding="utf-8"
        )
    elif attack == "vendor_source":
        entry["sources"] = ["yfinance"]
    elif attack == "scope":
        entry["scope"] = "MARKET_EVIDENCE"
    elif attack == "rehash_claim":
        payload["claims"]["validated_alpha"] = True
    elif attack == "rehash_zero_claim":
        payload["claims"]["validated_alpha"] = 0
    elif attack == "rehash_tenant":
        payload["tenant_id"] = "private-tenant"
    save()
    if attack == "payload_bytes":
        (public / entry["url"].lstrip("/")).write_bytes(b"{}")
    if attack == "committed_old_bytes":
        git("add", ".")
        git(
            "-c",
            "user.name=Archive test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-qm",
            "Substitution",
        )
    with pytest.raises(ValueError):
        archive.verify_shared_history(root)
