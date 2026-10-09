"""No family correction can silently omit an unavailable or failed trial."""
import math
from statsmodels.stats.multitest import multipletests
from .contracts import TestingFamily


def correct(family: TestingFamily, outcomes: dict[str,float|None],alpha=.05):
    if set(outcomes)!=set(family.trial_ids):
        raise ValueError("Incomplete/substituted testing family")
    if not 0<alpha<1 or any(p is not None and (not math.isfinite(p) or not 0<=p<=1) for p in outcomes.values()):
        raise ValueError("Invalid probability")
    # Unavailable slots retained at p=1 for conservative family adjustment only.
    p=[1.0 if outcomes[k] is None else outcomes[k] for k in family.trial_ids]
    corrections={m:multipletests(p,alpha=alpha,method={"HOLM":"holm","BH":"fdr_bh"}[m])[1]
                 for m in family.corrections}
    return {k:{"raw_p":outcomes[k],"available":outcomes[k] is not None,
               **{m:float(values[i]) if outcomes[k] is not None else None for m,values in corrections.items()}}
            for i,k in enumerate(family.trial_ids)}
