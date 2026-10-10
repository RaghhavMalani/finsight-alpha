"""Plugin outputs admitted as signals, bound to their sealed producer run.

A derived signal's availability is the producer's cutoff: the value is a
deterministic function of evidence visible at that cutoff. The wall-clock of the
execution is provenance, recorded separately in the producer's attempt chain.
"""

from __future__ import annotations

from src.truth.contracts import canonical_hash

from .contracts import Signal, utc


def derived_licence(licences):
    statuses = sorted(set(licences))
    return "ACTIVE" if statuses == ["ACTIVE"] else "RESTRICTED:" + ",".join(statuses)


def output_signals(tenant_id, run):
    """Signals and admission bindings for a sealed run's declared derived outputs."""
    if run.get("status") == "UNAVAILABLE" or not run.get("derived"):
        return [], []
    contract = run["contract"]
    declared = {o["name"]: o for o in contract["declarations"]["derived_outputs"]}
    available_at = contract["as_of"]
    licence = derived_licence(contract["lineage"]["licences"])
    result_hash = canonical_hash(run)
    signals, bindings = [], []
    for name, series in sorted(run["derived"].items()):
        spec = declared[name]
        for observed_at, value in series:
            signal = Signal(
                tenant_id,
                name,
                contract["asset"],
                value,
                observed_at,
                available_at,
                "plugin:" + contract["plugin"],
                licence,
                run["run_id"],
                kind=spec["kind"],
                unit=spec["unit"],
            )
            signals.append(signal)
            bindings.append(
                {
                    "signal_id": signal.identity,
                    "signal_sha256": canonical_hash(signal.payload()),
                    "kind": "PLUGIN_OUTPUT",
                    "source_version_id": run["run_id"],
                    "producer_run_id": run["run_id"],
                    "producer_result_sha256": result_hash,
                    "producer_lineage_digest": contract["lineage"]["lineage_digest"],
                    "output_name": name,
                }
            )
    return signals, bindings


def admit_outputs(store, tenant_id, run):
    signals, bindings = output_signals(tenant_id, run)
    if not signals:
        return 0
    return store.append(tenant_id, signals, admissions=bindings)


def verify_bindings(registry, tenant_id, bindings, rows):
    """Every PLUGIN_OUTPUT input must match the value its sealed producer recorded."""
    producers = {}
    for row in rows:
        binding = bindings[row.identity]
        if binding.get("kind") != "PLUGIN_OUTPUT":
            if not binding.get("admission_id") or not binding.get("admission_seal"):
                raise ValueError("Input binding is neither a source nor a plugin output")
            continue
        run_id = binding["producer_run_id"]
        if run_id not in producers:
            run = registry.read(tenant_id, run_id)
            if run is None:
                raise ValueError("Derived input has no sealed producer run")
            producers[run_id] = (
                run,
                canonical_hash(run),
                {
                    name: {utc(t): v for t, v in series}
                    for name, series in (run.get("derived") or {}).items()
                },
            )
        run, digest, series = producers[run_id]
        if (
            binding["producer_result_sha256"] != digest
            or binding["producer_lineage_digest"]
            != run["contract"]["lineage"]["lineage_digest"]
            or binding["output_name"] != row.name
            or row.version != run_id
            or row.source != "plugin:" + run["contract"]["plugin"]
            or row.available_at != utc(run["contract"]["as_of"])
            or row.asset != run["contract"]["asset"]
            or series.get(row.name, {}).get(row.observed_at, object()) != row.value
        ):
            raise ValueError("Derived input differs from its sealed producer output")
    return True
