"""Computational repeatability is separate from exact replication of a paper."""
from .contracts import Paper,Replication,StatisticalResult,Verdict


def compare(kind,original,replication,*,differences,original_paper:Paper|None=None):
    if kind=="EXACT":
        if original_paper is None or original_paper.original_data is None or original_paper.original_seed is None:
            return Replication(kind=kind,original_run=None,replication_run=replication["run_hash"],
                status=Verdict.UNAVAILABLE,effect=None,differences=tuple(differences),
                reason="Exact paper replication requires original data and methodology; computational rerun alone cannot earn EXACT")
    if kind=="CROSS_MARKET" and original["country"]==replication["country"]:
        raise ValueError("Same country cannot be cross-market replication")
    if kind=="TEMPORAL" and not (original["end"]<replication["start"] or replication["end"]<original["start"]):
        raise ValueError("Temporal replication samples overlap")
    if original["unit"]!=replication["unit"]: raise ValueError("Replication units differ")
    if not differences and kind in {"CLOSE","TEMPORAL","CROSS_MARKET"}: raise ValueError("Replication differences must be disclosed")
    effect=StatisticalResult.model_validate(replication["result"])
    return Replication(kind=kind,original_run=original["run_hash"],replication_run=replication["run_hash"],
        status=Verdict.INCONCLUSIVE if effect.status=="AVAILABLE" else Verdict.UNAVAILABLE,effect=effect,
        differences=tuple(differences),reason="Comparison reports estimate, interval and sample; not automatically a corroborated claim")
