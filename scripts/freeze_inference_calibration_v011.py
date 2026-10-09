"""Declaration only: no simulated data or inference outcomes are generated."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data/exports/research_os_v0_1_1"


def declaration():
    templates = [
        ("mean_iid", "gaussian", 0, False),
        ("mean_ar03", "gaussian", .3, False),
        ("mean_ar06", "gaussian", .6, False),
        ("mean_ar08", "gaussian", .8, False),
        ("mean_t5", "t5", 0, False),
        ("mean_ar_t5", "t5", .6, False),
        ("mean_garch", "garch", 0, False),
        ("reg_ar06", "gaussian", .6, True),
        ("reg_garch", "garch", 0, True),
        ("reg_xhetero", "xhetero", 0, True),
    ]
    return {
        "schema": "research-os/inference-calibration/0.1.1",
        "evidence_mode": "SYNTHETIC_CALIBRATION",
        "purpose": "New inference tournament; never repair or reopen v0.1 or rerun momentum",
        "candidates": ["HAC_NORMAL", "HAC_T", "NULL_MBB_T", "STATIONARY_PAIRS_T"],
        "sample_sizes": [120, 240, 480],
        "settings": [{"id": f"{name}_n{n}", "error": error, "rho": rho,
                      "controls": controls, "n": n}
                     for name, error, rho, controls in templates for n in (120, 240, 480)],
        "discovery_worlds": 1000,
        "confirmation_worlds": 5000,
        "effect_grid": [0, .1, .2, .4],
        "alpha": .05,
        "reject_rule": "p <= alpha; greater and two-sided both assessed",
        "target": "OLS intercept (coefficient 0); innovations/unconditional error SD is one",
        "controls": {"count": 2, "rho": .5, "means": [.2, -.1], "coefficients": [.2, -.1]},
        "burn": 1024,
        "garch": {"omega": .05, "alpha": .10, "beta": .85, "initial_variance": 1},
        "xhetero": "IID Gaussian innovation * sqrt(0.5 + 0.5 * centered_latent_control_1^2)",
        "seed": {"namespace": "finsight/research-os/0.1.1/frozen-2026-10-09",
                 "algorithm": "(1<<256) OR SHA256(namespace/phase/setting/world/stream) as integer",
                 "phases": ["discovery", "confirmation", "canary"],
                 "streams": ["data", "NULL_MBB_T", "STATIONARY_PAIRS_T"],
                 "disjointness": "All new seeds >= 2^256; v0.1 seeds < 2^32. Phase domains distinct; enumerate and reject any collision.",
                 "common_random_numbers": "Same error/control world and bootstrap indices across planted shifts within a world; never across phases"},
        "inference": {
            "hac_lags": 6, "kernel": "Bartlett", "covariance_correction": "n/(n-k)",
            "hac_normal": "Incumbent asymptotic normal; same arithmetic as untouched v0.1 HAC",
            "hac_t": "Same HAC covariance; t reference with residual df n-k, heuristic not exact finite-sample theorem",
            "resamples": 999, "block_length": "ceil(sqrt(n))",
            "null_mbb": "Restricted OLS without target column; center restricted residuals; resample overlapping NONCIRCULAR fixed-length blocks, trim to n; fit full OLS and studentize with HAC6. +1 null p-values. CI separately uses unrestricted centered residual bootstrap-t with same block indices.",
            "stationary_pairs": "Joint (X,y) stationary bootstrap; uniform circular start, restart probability 1/ceil(sqrt(n)); center bootstrap coefficient at observed estimate and studentize with resampled HAC6. +1 p-values; equal-tailed bootstrap-t CI.",
            "interval": "Two-sided nominal 95%; bootstrap-t q(.025,.975), NumPy linear quantiles",
            "reported_se": "HAC SE for HAC methods; SD of unrestricted bootstrap coefficients for bootstrap methods; HAC studentization SE recorded separately",
            "p_interval_duality": "Null-restricted p and unrestricted CI are separately calibrated; not claimed exact inversions",
            "location_equivariance": "Planted shifts add effect * target column; unrestricted coefficient/CI shift exactly, residuals unchanged. MBB restricted-null p recomputed for every effect, not recycled.",
        },
        "discovery_selection": {
            "rule": "Exclude candidates with ANY failed/nonfinite world. Rank remaining by fewest setting-wise point violations (greater size >.07, two-sided size >.07, coverage <.92, abs standardized bias >.10), then highest average greater-tail power over .1/.2/.4, then smallest worst null size, then declared candidate order. Select exactly one, even if its point gate fails; disclose violations. No eligible candidate means no confirmation and CLOSED.",
            "confirmation_access": "No confirmation world may be generated until selection receipt is exclusively written, hashed, and committed; no fallback selection after confirmation",
        },
        "confirmation_acceptance": {
            "size_upper_max": .07, "coverage_lower_min": .92, "standardized_bias_upper_max": .10,
            "binomial_family_alpha": .04, "binomial_bounds": 90,
            "binomial_rule": "One-sided exact Clopper-Pearson with tail .04/90 for greater-size UCB, two-sided-size UCB and coverage LCB in EACH of 30 settings. Bonferroni union bound requires no independence.",
            "bias_family_alpha": .01,
            "bias_rule": "For each setting: (abs(mean estimate error) + t_(1-.01/(2*30),W-1) * empirical_SD/sqrt(W))/empirical_SD <= .10. Monte Carlo t approximation, not an exact confidence theorem under non-Gaussian worlds.",
            "all_required": True, "missing_or_failed_world": "CLOSED; no removal, reroll, substitute or changed denominator",
            "power": "Report greater/two-sided power at ALL fixed effects with pointwise exact 95% intervals; descriptive, no post-hoc threshold",
            "se_ratio": "Report mean reported SE / empirical SD AND its reciprocal; diagnostic, not an extra selectable gate",
            "scope": "Only selected method, specified DGPs/n/blocks/bootstrap budget; no certification for markets, other coefficients or engines",
        },
        "execution": {"workers_max": 4, "checkpoint": "Append completed fixed world chunks; resume only identical frozen protocol/code/environment/seed and existing-byte checks; retain attempts. No overwrite or statistical reroll.",
                      "canary_worlds": 4, "canary_status": "CANARY_ONLY, cannot select or certify"},
        "old_baseline": {"merge_commit": "3b3fa50c8e53dc929395d56c6609c8f2f82f23fe",
                         "status": "PERMANENTLY_NOT_CALIBRATED", "gate": "PERMANENTLY_CLOSED"},
        "prohibitions": ["VectorBT", "market replication without separate authorization/preregistration",
                         "confirmation-driven selection/tuning", "adding candidates or changing seeds after outcomes"],
    }


def seal():
    DEST.mkdir(parents=True, exist_ok=True)
    for name in ("preregistration.json", "freeze-receipt.json"):
        if (DEST / name).exists():
            raise ValueError("Existing preregistration/receipt is immutable")
    raw = (json.dumps(declaration(), sort_keys=True, indent=2, allow_nan=False) + "\n").encode()
    receipt = {"protocol_sha256": hashlib.sha256(raw).hexdigest(),
               "frozen_at": datetime.now(timezone.utc).isoformat(),
               "parent_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
               "declaration_source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               "outcomes_generated": False}
    with (DEST / "preregistration.json").open("xb") as f: f.write(raw)
    with (DEST / "freeze-receipt.json").open("xb") as f:
        f.write((json.dumps(receipt, sort_keys=True, indent=2) + "\n").encode())
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    seal()
