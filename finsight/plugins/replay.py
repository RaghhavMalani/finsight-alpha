"""Opt-in derived publication from a sealed run, with source and ledger binding."""

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
from src.data.license_policy import derived_publication_license
from src.replay.publication import ReplayPublisher, first_party_license, assert_derived

FIXTURE_SOURCE = "project:nervous-fixture"
FIXTURE_PATH = "eval/plugins/nervous-system-v0.1/pit-fixture.json"


def source_permissions(result, root, organization_id=None):
    fixture = Path(root) / FIXTURE_PATH
    expected = sha256(fixture.read_bytes()).hexdigest() if fixture.exists() else None
    licences = []
    for source, licence, version in sorted(
        {(r["source"], r["licence"], r["version"]) for r in result["source_lineage"]}
    ):
        if (
            source == FIXTURE_SOURCE
            and licence == "FIRST_PARTY"
            and version == expected
        ):
            grant = {
                **first_party_license(source),
                "attribution": "FinSight checked synthetic PIT fixture, derived from the preserved D0.4.2 demo world.",
                "source_urls": [
                    "https://github.com/RaghhavMalani/finsight-alpha/blob/main/"
                    + FIXTURE_PATH
                ],
            }
        else:
            # An arbitrary FIRST_PARTY label cannot grant vendor publication.
            grant = derived_publication_license(source, organization_id)
        if "publish_derived" not in grant.get("permitted_uses", []):
            raise PermissionError(
                f"{source}: public derived publication unavailable ({grant.get('status')})"
            )
        licences.append(grant)
    if not licences:
        raise PermissionError("Run has no source lineage")
    return licences


def projection(registry, tenant_id, run_id, *, allowed_outputs):
    result = registry.read(tenant_id, run_id)
    if (
        result is None
        or result["status"] != "COMPUTED"
        or not result["computation_ready"]
    ):
        raise ValueError("No completed computation to publish")
    if result.get("execution", result["contract"]["code"]).get(
        "dirty_computation", True
    ):
        raise ValueError("Commit computation sources before public execution")
    if any(value is not False for value in result["claims"].values()):
        raise ValueError("Scientific claim promotion is forbidden")
    if result["contract"]["scope"] != "SYNTHETIC_REFERENCE":
        raise ValueError(
            "v0.1 public plugin projection requires the checked synthetic reference"
        )
    if tenant_id != "public-fixture":
        raise PermissionError(
            "Only the explicitly public fixture tenant can enter this v0.1 Replay projection"
        )
    for row in result["predictions"]:
        if set(row["signals"]) != set(allowed_outputs):
            raise ValueError(
                "Only explicitly reviewed derived outputs can be published"
            )
    events = [e for e in registry.events(tenant_id) if e["run_id"] == run_id]
    counts = {
        event: sum(e["event"] == event for e in events)
        for event in ("CANDIDATE_STARTED", "CANDIDATE_COMPLETED", "HOLDOUT_OPENED")
    }
    # Arbitrary plugin extension and raw store values remain local.
    value = {
        key: deepcopy(result[key])
        for key in (
            "run_id",
            "tenant_id",
            "status",
            "computation_ready",
            "claims",
            "inference_capability",
            "contract",
            "arena",
            "metrics",
            "honesty",
            "predictions",
            "holdout_openings",
        )
    }
    value.update(
        schema_version="plugin-replay/2"
        if result["schema_version"] == "plugin-run/2"
        else "plugin-replay/1",
        scope="SYNTHETIC_REFERENCE",
        label="MomentumModel · synthetic PIT fixture",
    )
    if "execution" in result:
        value["execution"] = deepcopy(result["execution"])
    value["sources"] = sorted({r["source"] for r in result["source_lineage"]})
    value["observatory"] = {
        "frames": deepcopy(result["observatory"]["frames"]),
        "semantics": result["observatory"]["semantics"],
    }
    value["accounting"] = {
        "counts": counts,
        "event_chain_tip": events[-1]["hash"],
        "attempts": len({e["attempt"] for e in events if e["event"] == "RUN_BOUND"}),
    }
    value["issues"] = [
        {**issue, "first_seen_at": events[-1]["at"], "evidence": ["run:" + run_id]}
        for issue in result["issues"]
    ]
    assert_derived(value)
    return value


def publish(registry, tenant_id, run_id, *, root, output, allowed_outputs, route=None):
    value = projection(registry, tenant_id, run_id, allowed_outputs=allowed_outputs)
    result = registry.read(tenant_id, run_id)
    licences = source_permissions(result, root)
    if value["sources"] != [FIXTURE_SOURCE]:
        raise PermissionError(
            "This v0.1 entry publishes only the approved checked fixture source"
        )
    if result["schema_version"] == "plugin-run/2":
        if not route or route == "/plugins/momentum-fixture" or Path(output).resolve() == (Path(root) / "frontend-v2/public").resolve():
            raise ValueError("Future v2 publication requires an explicit separate output directory and route; v1 is immutable")
    route = route or "/plugins/momentum-fixture"
    cutoff = result["contract"]["as_of"]
    publisher = ReplayPublisher(Path(output), cutoff)
    pointer = Path(output) / "replay-manifest.json"
    if pointer.exists():
        previous = json.loads(pointer.read_text(encoding="utf-8"))
        if previous["schema_version"] != "terminal-replay/1":
            raise ValueError("Unsupported existing Replay manifest")
        publisher.manifest = previous
        publisher.manifest["as_of"] = max(previous["as_of"], cutoff)
    identity = "plugins:run:" + run_id
    old = publisher.manifest["artifacts"].get(identity)
    if old:
        if (
            old.get("status") != "AVAILABLE"
            or old.get("input_hash") != result["contract"]["data_hash"]
        ):
            raise ValueError("Immutable publication identity substitution")
        path = (
            Path(output) / "artifacts/replay" / (identity.replace(":", "-") + ".json")
        )
        raw = path.read_bytes()
        if sha256(raw).hexdigest() != old["sha256"] or len(raw) != old["bytes"]:
            raise ValueError("Published artifact bytes changed")
        cached = json.loads(raw)
        if cached["run_id"] != run_id or cached["contract"] != result["contract"]:
            raise ValueError("Published run binding changed")
        registry.artifact(
            tenant_id,
            run_id,
            {"url": old["url"], "sha256": old["sha256"], "bytes": old["bytes"]},
        )
        return identity, old, cached
    grant = {
        **first_party_license(FIXTURE_SOURCE),
        "attribution": "; ".join(g["attribution"] for g in licences),
        "source_urls": sorted(
            {url for g in licences for url in g.get("source_urls", [])}
        ),
    }
    publisher.publish(
        identity,
        value,
        kind="plugin-run",
        sources=value["sources"],
        licence=grant,
        observed_at=cutoff,
        available_at=cutoff,
        input_hash=result["contract"]["data_hash"],
        scope="SYNTHETIC_REFERENCE",
        as_of=cutoff,
        routes=(route,),
    )
    publisher.finish()
    entry = publisher.manifest["artifacts"][identity]
    registry.artifact(
        tenant_id,
        run_id,
        {"url": entry["url"], "sha256": entry["sha256"], "bytes": entry["bytes"]},
    )
    return identity, entry, value
