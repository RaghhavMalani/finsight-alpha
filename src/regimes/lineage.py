"""Batch evidence chains: output -> run -> signal -> admission -> capture -> licence.

Any broken link makes the dependent output UNAVAILABLE. A cached or published
value is never rendered against lineage that no longer verifies.
"""

from __future__ import annotations

from finsight.plugins import Signal
from finsight.plugins.derived import verify_bindings
from finsight.plugins.series import admission_bindings, lineage_summary, select_inputs
from src.data_organ.contracts import Capture, public_metadata
from src.truth.contracts import canonical_hash


class JournalIndex:
    """One verified Data Organ journal snapshot, indexed for O(N) joins."""

    def __init__(self, registry, tenant_id):
        self.tenant_id = tenant_id
        entries = registry.entries(tenant_id)
        self.by_kind = {}
        for entry in entries:
            self.by_kind.setdefault(entry["kind"], {})[entry["identity"]] = entry
        self._members = {}

    def get(self, kind, identity):
        return self.by_kind.get(kind, {}).get(identity)

    def members(self, admission_id):
        if admission_id not in self._members:
            admission = self.get("ADMISSION", admission_id)
            version = self.get("SOURCE_VERSION", admission["payload"]["source_version_id"])
            capture = Capture(**version["payload"])
            index = {}
            for row in admission["payload"]["observations"]:
                signal = Signal(
                    self.tenant_id,
                    row["field"],
                    row["asset"],
                    row["value"],
                    row["observed_at"],
                    row["available_at"],
                    capture.source,
                    capture.licence.get("status", "UNVERIFIED"),
                    capture.identity,
                    unit=capture.unit,
                )
                index[signal.identity] = canonical_hash(signal.payload())
            self._members[admission_id] = index
        return self._members[admission_id]


def verify_source_bindings(index, bindings):
    """Verify Data Organ bindings; return a per-source-version summary."""
    summary = {}
    for signal_id, binding in bindings.items():
        if binding.get("kind") == "PLUGIN_OUTPUT":
            continue
        mapping = index.get("SIGNAL_MAPPING", signal_id)
        if mapping is None or canonical_hash(mapping["payload"]) != canonical_hash(
            binding
        ):
            raise ValueError("Signal mapping missing or substituted in the journal")
        admission = index.get("ADMISSION", binding["admission_id"])
        version = index.get("SOURCE_VERSION", binding["source_version_id"])
        if (
            admission is None
            or version is None
            or admission["hash"] != binding["admission_seal"]
            or canonical_hash(admission["payload"]) != binding["admission_id"]
            or admission["payload"]["source_version_id"] != binding["source_version_id"]
        ):
            raise ValueError("Broken source-admission seal")
        capture = Capture(**version["payload"])
        if (
            capture.identity != binding["source_version_id"]
            or capture.content_sha256 != binding["capture_sha256"]
            or canonical_hash(capture.schema) != binding["schema_hash"]
            or canonical_hash(capture.licence) != binding["licence_resolution_hash"]
        ):
            raise ValueError("Source version, schema or licence substitution")
        members = index.members(binding["admission_id"])
        if members.get(signal_id) != binding["signal_sha256"]:
            raise ValueError("Signal is not a member of its sealed admission")
        item = summary.setdefault(
            capture.identity,
            {
                **public_metadata(capture),
                "availability_rule": capture.clock_quality,
                "licence_decision": {
                    "status": capture.licence.get("status"),
                    "dataset_key": capture.licence.get("dataset_key"),
                    "permitted_uses": capture.licence.get("permitted_uses", []),
                },
                "admissions": [],
                "signals": 0,
            },
        )
        if binding["admission_id"] not in item["admissions"]:
            item["admissions"].append(binding["admission_id"])
        item["signals"] += 1
    return summary


def verify_run(store, run_registry, journal_index, tenant_id, run, *, _seen=None):
    """Recompute a sealed run's inputs from its contract and verify the chain.

    Returns a JSON-serialisable chain; status INVALID carries the reason.
    """
    seen = _seen if _seen is not None else {}
    run_id = run["run_id"]
    if run_id in seen:
        return seen[run_id]
    try:
        sealed = run_registry.read(tenant_id, run_id)
        if sealed is None or canonical_hash(sealed) != canonical_hash(run):
            raise ValueError("Run is not the sealed registry record")
        contract = run["contract"]
        visible = store.history(tenant_id, as_of=contract["as_of"])
        windows, used = select_inputs(
            visible, contract["declarations"]["inputs"], contract["assets"]
        )
        bindings = admission_bindings(store, tenant_id, used)
        verify_bindings(run_registry, tenant_id, bindings, used)
        recomputed = lineage_summary(used, bindings, windows)
        for key in ("data_hash", "lineage_digest", "admissions", "source_versions"):
            if recomputed[key] != contract["lineage"][key]:
                raise ValueError(f"Recomputed {key} differs from the sealed contract")
        sources = verify_source_bindings(journal_index, bindings)
        producers = []
        for producer_id in contract["lineage"]["producer_runs"]:
            producer = run_registry.read(tenant_id, producer_id)
            chain = verify_run(
                store, run_registry, journal_index, tenant_id, producer, _seen=seen
            )
            if chain["status"] != "VERIFIED":
                raise ValueError("Producer lineage invalid: " + chain["reason"])
            producers.append(chain)
        result = {
            "status": "VERIFIED",
            "run_id": run_id,
            "plugin": contract["plugin"],
            "plugin_version": contract["plugin_version"],
            "as_of": contract["as_of"],
            "state_at": run.get("state_at"),
            "code_manifest_sha256": canonical_hash(contract["code"]),
            "data_hash": contract["lineage"]["data_hash"],
            "lineage_digest": contract["lineage"]["lineage_digest"],
            "profile_sha256": contract["context"].get("profile_sha256"),
            "sources": sorted(sources.values(), key=lambda s: s["source_version_id"]),
            "producers": producers,
            "windows": contract["lineage"]["windows"],
            "execution": run.get("execution"),
        }
    except (ValueError, KeyError, TypeError) as error:
        result = {"status": "INVALID", "run_id": run_id, "reason": str(error)}
    seen[run_id] = result
    return result
