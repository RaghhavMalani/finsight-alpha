"""Compatibility entry points for the Dynamics Lab OU theory.

New integrations should call :func:`certify_ou` directly. ``fit_ou`` remains
as a narrow adapter for existing callers while returning the D0.1 contract.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence

from src.dynamics.contracts import HypothesisLedger
from src.dynamics.ou_theory import OUTheoryError, certify_ou, generate_exact_ou


DynamicsInputError = OUTheoryError


def fit_ou(
    values: Sequence[float],
    *,
    dt: float = 1.0,
    train_fraction: float = 0.72,
    hypothesis_count: int = 1,
) -> dict[str, object]:
    """Certify an OU theory on a regular grid and return its public artifact."""

    ledger = HypothesisLedger(
        hypotheses_considered=hypothesis_count,
        selection_procedure="compatibility single-theory request",
        selection_timestamp=datetime(2000, 1, 1, tzinfo=timezone.utc),
        selection_metric="sealed holdout negative log likelihood",
        holdout_untouched=True,
    )
    return certify_ou(
        values,
        regular_dt=dt,
        train_fraction=train_fraction,
        hypothesis_ledger=ledger,
    ).to_dict()


def generate_ou_control(
    *,
    observations: int = 180,
    theta: float = 0.18,
    mu: float = 0.0,
    sigma: float = 0.24,
    dt: float = 1.0,
    seed: int = 212,
) -> list[float]:
    """Generate the regular-grid version of the exact OU calibration control."""

    return generate_exact_ou(
        [dt] * (observations - 1),
        theta=theta,
        mu=mu,
        sigma=sigma,
        seed=seed,
    )
