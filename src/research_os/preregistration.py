"""Server-timestamped freeze; later edits require a new experiment identity."""
from .contracts import FreezeReceipt, Preregistration, now, utc
from .registry import Registry


def freeze(registry: Registry, spec: Preregistration, code_commit: str) -> FreezeReceipt:
    identity = registry.put(spec)
    existing = [e for e in registry.events() if e["kind"] == "FREEZE" and e["payload"]["preregistration_hash"] == identity]
    if existing:
        return registry.get(existing[0]["payload"]["receipt_hash"])
    at = now()
    if any(utc(d.input_cutoff) > utc(at) for d in spec.datasets):
        raise ValueError("Cannot freeze future inputs")
    receipt = FreezeReceipt(preregistration_hash=identity, frozen_at=at, code_commit=code_commit)
    receipt_hash = registry.put(receipt)
    registry.append("FREEZE", {"preregistration_hash": identity, "receipt_hash": receipt_hash})
    return receipt
