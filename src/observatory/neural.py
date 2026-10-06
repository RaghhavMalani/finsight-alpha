"""Neural-network training traces on the production signal splits.

The network trains on the same nested chronological split as the signal suite: fit rows,
a purged validation slice and an untouched final holdout. Edited architectures are scored on
validation only. The holdout stays sealed unless the caller is the exporter evaluating the
one preregistered architecture, so trying many networks in the Observatory can never turn
into selection on the holdout.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits

from src.dynamics.market_regime_inputs import digest
from src.geo import usgs
from src.ml.neural import Architecture, predict, snapshot_epochs, train
from src.ml.point_in_time_modeling import build_signal_splits
from src.observatory.evidence import CHANCE, FAMILIES, bootstrap_auc_ci, feature_family, selection_verdict
from src.observatory.inputs import pit_prices
from src.observatory.traces import CLAIMS, VERSION, signal_inputs, split_evidence

GEO_FAMILY = "Geo events"
NEURAL_FAMILIES = (*FAMILIES, GEO_FAMILY)
DEFAULT_FAMILIES = FAMILIES
SEALED_NOTE = ("Edited architectures are scored on validation only. The untouched holdout is "
               "evaluated once, for the preregistered architecture, by the exporter.")


def neural_family(name: str) -> str:
    return GEO_FAMILY if name in usgs.FEATURES else feature_family(name)


def parse_families(families) -> list[str]:
    chosen = list(DEFAULT_FAMILIES if families is None else families)
    if not chosen or len(set(chosen)) != len(chosen) or any(f not in NEURAL_FAMILIES for f in chosen):
        raise ValueError("Input families must be distinct names from: " + ", ".join(NEURAL_FAMILIES))
    return [f for f in NEURAL_FAMILIES if f in chosen]


def validation_status(ci) -> str:
    """Where the validation AUC interval sits relative to chance."""
    if ci is None:
        return "unavailable"
    if ci["low"] > CHANCE:
        return "above_chance"
    if ci["high"] < CHANCE:
        return "below_chance"
    return "spans_chance"


def _auc(y, p):
    from sklearn.metrics import roc_auc_score
    return float(roc_auc_score(y, p)) if len(np.unique(y)) == 2 else None


def neural_trace(ticker, as_of, source, spec=None, *, families=None, horizon=1, embargo=0,
                 dataset=None, benchmark_dataset=None, catalog=None, evaluate_holdout=False):
    architecture = Architecture.parse(spec)
    chosen = parse_families(families)
    prices, provenance = pit_prices(ticker, as_of, source, dataset=dataset)
    benchmark, benchmark_provenance = pit_prices(
        "SPY", as_of, source, dataset=dataset if ticker == "SPY" else benchmark_dataset)
    provenance = {**provenance, "asset_input_hash": provenance["input_hash"],
                  "benchmark_input_hash": benchmark_provenance["input_hash"],
                  "input_hash": digest([provenance["input_hash"], benchmark_provenance["input_hash"]])}
    frame, columns, inference = signal_inputs(prices, benchmark, ticker, horizon)
    geo_provenance = None
    if GEO_FAMILY in chosen:
        if catalog is None:
            raise ValueError("Geo events inputs need an installed USGS catalog "
                             "(python scripts/fetch_usgs_catalog.py)")
        frame = frame.join(usgs.geo_features(frame["available_at"], catalog, as_of=provenance["as_of"]))
        inference = inference.join(usgs.geo_features(inference["available_at"], catalog,
                                                     as_of=provenance["as_of"]))
        frame = frame.dropna(subset=list(usgs.FEATURES))
        if inference[list(usgs.FEATURES)].isna().any(axis=None):
            raise ValueError("The USGS catalog does not cover the current inference row")
        if len(frame) < 200:
            raise ValueError("Need 200 labeled rows inside the USGS catalog's coverage")
        columns = [*columns, *usgs.FEATURES]
        geo_provenance = catalog.provenance()
        provenance = {**provenance, "geo_catalog_hash": catalog.sha256}
    columns = [c for c in columns if neural_family(c) in chosen]
    if not columns:
        raise ValueError("The chosen input families have no features")

    split = build_signal_splits(frame, columns, "target_direction", horizon=horizon, embargo=embargo)
    x_fit, x_val = split["X_fit"], split["X_validation"]
    y_fit, y_val = split["y_fit"], split["y_validation"]
    holdout_index = set(split["X_test"].index)
    if holdout_index & (set(x_fit.index) | set(x_val.index)):
        raise ValueError("Untouched holdout entered neural training or validation")
    fit_evidence = split_evidence(frame, x_fit, x_val)
    holdout_evidence = split_evidence(frame, split["X_train"], split["X_test"])

    with threadpool_limits(limits=1):
        model, scaler, record = train(architecture, x_fit.to_numpy(), y_fit.to_numpy(),
                                      x_val.to_numpy(), y_val.to_numpy())
        p_val = predict(model, scaler, x_val.to_numpy())
        attribution = model.input_attribution(scaler.transform(x_val.to_numpy()))
        probe_x = scaler.transform(inference[columns].to_numpy(dtype=float))
        probe_layers = model.hidden_activations(probe_x)
        probe_p = predict(model, scaler, inference[columns].to_numpy(dtype=float))
        val_auc = _auc(y_val.to_numpy(), p_val)
        val_ci = bootstrap_auc_ci(y_val.to_numpy(), p_val) if val_auc is not None else None
        holdout = {"sealed": not evaluate_holdout, "note": None if evaluate_holdout else SEALED_NOTE,
                   "rows": len(split["X_test"]), "start": holdout_evidence["validation_start"],
                   "end": holdout_evidence["validation_end"],
                   "feature_start": holdout_evidence["validation_feature_start"],
                   "training_target_information_end": holdout_evidence["training_target_information_end"],
                   "indices": [int(i) for i in split["X_test"].index],
                   "auc": None, "auc_ci95": None, "verdict": None, "verdict_reason": None}
        if evaluate_holdout:
            # Refit on the whole development set, then touch the holdout exactly once.
            final, final_scaler, _ = train(architecture, split["X_train"].to_numpy(),
                                           split["y_train"].to_numpy(), record=False)
            p_test = predict(final, final_scaler, split["X_test"].to_numpy())
            auc = _auc(split["y_test"].to_numpy(), p_test)
            ci = bootstrap_auc_ci(split["y_test"].to_numpy(), p_test) if auc is not None else None
            verdict, reason = selection_verdict(ci, [val_auc])
            holdout.update(auc=auc, auc_ci95=ci, verdict=verdict, verdict_reason=reason)

    epochs = record["epochs"]
    best = min(epochs, key=lambda e: (e["val_loss"], e["epoch"]))
    family = [neural_family(c) for c in columns]
    present = [f for f in NEURAL_FAMILIES if f in family]
    family_attribution = {f: round(float(sum(a for a, g in zip(attribution, family) if g == f)), 6)
                          for f in present}
    scaler_payload = {"mean": np.round(scaler.mean, 8).tolist(), "scale": np.round(scaler.scale, 8).tolist()}
    return {
        "schema_version": VERSION, "kind": "neural", "ticker": ticker, "source": source,
        "as_of": provenance["as_of"], "provenance": provenance, "claims": CLAIMS,
        "seed": architecture.seed, "horizon": horizon, "embargo": embargo,
        "architecture": architecture.as_dict(),
        "layer_sizes": [len(columns), *architecture.hidden, 1],
        "parameter_count": model.parameter_count,
        "feature_names": columns, "families": present, "family": family,
        "scaler": scaler_payload, "scaler_hash": digest(scaler_payload),
        "epochs": epochs, "snapshot_epochs": snapshot_epochs(architecture.epochs),
        "snapshots": record["snapshots"], "best_val_loss_epoch": best["epoch"],
        "fit": {key: fit_evidence[key] for key in ("fit_start", "fit_end", "fit_rows",
                                                   "training_target_information_end", "fit_indices")},
        "validation": {"start": fit_evidence["validation_start"], "end": fit_evidence["validation_end"],
                       "feature_start": fit_evidence["validation_feature_start"],
                       "rows": fit_evidence["validation_rows"], "indices": fit_evidence["validation_indices"],
                       "auc": val_auc, "auc_ci95": val_ci, "loss": epochs[-1]["val_loss"],
                       "status": validation_status(val_ci)},
        "holdout": holdout,
        "attribution": [round(float(a), 6) for a in attribution],
        "family_attribution": family_attribution,
        "probe": {"date": inference.iloc[0]["Date"].isoformat(),
                  "input": np.round(probe_x[0], 5).tolist(),
                  "activations": [np.round(h[0], 5).tolist() for h in probe_layers],
                  "output": round(float(probe_p[0]), 6),
                  "included_in_labeled_rows": bool(inference.index[0] in frame.index)},
        "geo_provenance": geo_provenance,
        "semantics": ("Final-epoch network; no epoch is chosen on validation. Attribution is mean "
                      "|gradient × input| of the output probability over validation rows, normalized. "
                      "The probe is a forward pass on the latest admitted feature row, not a forecast."),
        "split_contract": ("Production nested chronological split: horizon purge, configured embargo, "
                           "inputs standardized on fit rows only, final untouched holdout."),
    }
