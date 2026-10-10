"""Module 2: the existing HMM engine with filtered (never smoothed) posteriors.

Three layers stay distinct:
- current state at the cutoff: PIT-valid for the admitted evidence;
- within-run historical path: PARAMETER_RETROSPECTIVE (parameters estimated
  through the cutoff, filtering observation-causal);
- the sealed multi-cutoff timeline: the as-known-at-each-run sequence.
"""

import math

import numpy as np
from scipy.special import logsumexp
from scipy.stats import chi2, multivariate_normal

from src.truth.contracts import canonical_hash

PATH_SEMANTICS = "PARAMETER_RETROSPECTIVE: filtered with parameters estimated through the cutoff; not as-known-then"


def forward_filter(startprob, transmat, means, covars, x):
    """Filtered P(state_t | x_1..x_t) by log-space forward recursion."""
    k = len(startprob)
    log_b = np.column_stack(
        [multivariate_normal.logpdf(x, mean=means[j], cov=covars[j]) for j in range(k)]
    )
    if log_b.ndim == 1:
        log_b = log_b[None, :]
    log_a = np.log(np.clip(transmat, 1e-300, None))
    out = np.empty((len(x), k))
    alpha = np.log(np.clip(startprob, 1e-300, None)) + log_b[0]
    alpha -= logsumexp(alpha)
    out[0] = np.exp(alpha)
    for t in range(1, len(x)):
        alpha = logsumexp(alpha[:, None] + log_a, axis=0) + log_b[t]
        alpha -= logsumexp(alpha)
        out[t] = np.exp(alpha)
    return out


def canonical_order(variances):
    """Ascending return-feature variance: VOL_RANK_1_OF_K is the calmest state."""
    return [int(i) for i in np.argsort(np.asarray(variances), kind="stable")]


def fit(features, columns, *, n_states, seed, return_feature, settings, unit):
    from src.regime.hmm_regime import train_hmm_regime_model

    frame = features[columns].astype(float)
    fitted = train_hmm_regime_model(
        frame, list(columns), n_states=n_states, covariance_type="full", random_state=seed
    )
    if not fitted["success"]:
        return {"status": "UNAVAILABLE", "reason": fitted["message"]}
    model, scaler = fitted["model"], fitted["scaler"]
    x = scaler.transform(frame.values)
    j = list(columns).index(return_feature)
    covars = np.asarray(model.covars_)
    variances = covars[:, j, j] * scaler.scale_[j] ** 2
    order = canonical_order(variances)
    labels = [f"VOL_RANK_{r + 1}_OF_{n_states}" for r in range(n_states)]
    filtered = forward_filter(model.startprob_, model.transmat_, model.means_, covars, x)
    filtered = filtered[:, order]
    transmat = np.asarray(model.transmat_)[np.ix_(order, order)]
    means_std = np.asarray(model.means_)[order]
    covars_std = covars[order]
    return_mean = means_std[:, j] * scaler.scale_[j] + scaler.mean_[j]
    return_variance = variances[order]
    states = filtered.argmax(axis=1)
    confidence = filtered.max(axis=1)
    occupancy = np.bincount(states, minlength=n_states) / len(states)
    duration = [
        None if transmat[i, i] >= 1 else float(1 / (1 - transmat[i, i]))
        for i in range(n_states)
    ]
    entropy = [
        float(-sum(p * math.log(p) for p in row if p > 0)) for row in transmat
    ]
    window = settings["issues"]["regime_instability"]["window"]
    switches = int(np.count_nonzero(np.diff(states[-window:])))
    inverse = [np.linalg.inv(c) for c in covars_std]
    last = x[-1]
    distance = [float((last - m) @ inv @ (last - m)) for m, inv in zip(means_std, inverse)]
    ood_limit = float(chi2.ppf(settings["issues"]["ood_quantile"], df=len(columns)))
    monitor = model.monitor_
    history = [float(v) for v in monitor.history]
    # hmmlearn's monitor reports "converged" when the iteration cap is reached.
    # Here convergence means the final likelihood change met the tolerance.
    converged = len(history) >= 2 and abs(history[-1] - history[-2]) < monitor.tol
    canonical = {
        "columns": list(columns),
        "return_mean": np.round(return_mean, 12).tolist(),
        "return_variance": np.round(return_variance, 14).tolist(),
        "transmat": np.round(transmat, 10).tolist(),
        "means_standardized": np.round(means_std, 10).tolist(),
        "covariances_standardized": np.round(covars_std, 10).tolist(),
        "labels": labels,
    }
    tail = settings["hmm"]["posterior_tail"]
    return {
        "status": "AVAILABLE",
        "n_states": n_states,
        "labels": labels,
        "labelling_rule": "Ascending fitted variance of the return feature in per-observation units",
        "semantic_hash": canonical_hash(canonical),
        "converged": bool(converged),
        "convergence_rule": f"|last log-likelihood change| < {monitor.tol}; reaching the {monitor.n_iter}-iteration cap is not convergence",
        "iterations": int(monitor.iter),
        "log_likelihood": history[-1] if history else None,
        "log_likelihood_last_two": history,
        "transition_matrix": transmat.tolist(),
        "expected_duration": duration,
        "duration_unit": unit + "s",
        "transition_entropy": entropy,
        "occupancy": occupancy.tolist(),
        "occupancy_counts": np.bincount(states, minlength=n_states).tolist(),
        "means_standardized": means_std.tolist(),
        "covariances_standardized": covars_std.tolist(),
        "return_mean": return_mean.tolist(),
        "return_variance": return_variance.tolist(),
        "feature_units": "standardized on the visible window",
        "current_state": labels[int(states[-1])],
        "current_index": int(states[-1]),
        "current_posterior": filtered[-1].tolist(),
        "posterior_tail": filtered[-tail:].tolist(),
        "states": states.tolist(),
        "confidence": confidence.tolist(),
        "recent_switches": switches,
        "switch_window": window,
        "mahalanobis_current": distance,
        "ood_limit": ood_limit,
        "ood": bool(min(distance) > ood_limit),
        "posterior_semantics": "FILTERED_FORWARD_RECURSION",
        "path_semantics": PATH_SEMANTICS,
        "seed": seed,
    }


def issues(result, *, settings, asset, run_hint):
    from .contracts import issue

    out = []
    if result["status"] != "AVAILABLE":
        return out
    if not result["converged"]:
        out.append(
            issue(
                "HMM_UNCONVERGED",
                "MEDIUM",
                f"EM stopped after {result['iterations']} iterations without meeting tolerance; result retained, no reruns",
                asset=asset,
                evidence=run_hint,
            )
        )
    limits = settings["issues"]["low_state_occupancy"]
    low = [
        result["labels"][i]
        for i, (share, count) in enumerate(
            zip(result["occupancy"], result["occupancy_counts"])
        )
        if share < limits["share"] or count < limits["count"]
    ]
    if low:
        out.append(
            issue(
                "LOW_STATE_OCCUPANCY",
                "LOW",
                "States below occupancy limits: " + ", ".join(low),
                asset=asset,
                evidence=run_hint,
            )
        )
    if result["recent_switches"] > settings["issues"]["regime_instability"]["switches"]:
        out.append(
            issue(
                "REGIME_INSTABILITY",
                "MEDIUM",
                f"{result['recent_switches']} filtered-state switches in the last {result['switch_window']} observations",
                asset=asset,
                evidence=run_hint,
            )
        )
    if result["ood"]:
        out.append(
            issue(
                "MODEL_OOD_DIAGNOSTIC",
                "LOW",
                "Current features lie outside every fitted state at the profile quantile (diagnostic only)",
                asset=asset,
                evidence=run_hint,
            )
        )
    return out
