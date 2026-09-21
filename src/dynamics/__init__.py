"""Framework-neutral, point-in-time market theory certification primitives."""

from src.dynamics.certification import run_ou_certification_suite
from src.dynamics.contracts import (
    CheckStatus,
    DiscoveryLedger,
    HypothesisLedger,
    MarketTheory,
    ScientificVerdict,
    TheoryArtifact,
)
from src.dynamics.ou import DynamicsInputError, fit_ou, generate_ou_control
from src.dynamics.ou_theory import OUTheory, certify_ou, generate_exact_ou
from src.dynamics.nonlinear import (
    NonlinearDynamicsError,
    fit_nonlinear_dynamics,
    generate_nonlinear_reference,
    load_frozen_stat_arb_survivor,
    run_nonlinear_certification_suite,
)
from src.dynamics.identifiability import (
    IdentifiabilityError,
    load_frozen_identifiability_artifact,
    run_nonlinear_identifiability_suite,
    verify_identifiability_artifact,
)
from src.dynamics.estimator_tournament import (
    EstimatorTournamentError,
    load_frozen_estimator_tournament,
    run_estimator_tournament,
    verify_estimator_tournament,
)
from src.dynamics.failure_decomposition import (
    FailureDecompositionError,
    load_frozen_failure_decomposition,
    run_failure_decomposition,
    verify_failure_decomposition,
)
from src.dynamics.targeted_recovery import (
    TargetedRecoveryError,
    load_frozen_targeted_recovery,
    run_targeted_recovery,
    verify_targeted_recovery,
)
from src.dynamics.power import run_ou_power_map
from src.dynamics.selection_freeze import canonical_sha256, verify_selection_freeze
from src.dynamics.stat_arb import (
    StatArbInputError,
    generate_stat_arb_reference,
    selection_aware_pair_search,
)
from src.dynamics.world import TheoryWorldError, make_theory_world

__all__ = [
    "CheckStatus",
    "DynamicsInputError",
    "DiscoveryLedger",
    "EstimatorTournamentError",
    "FailureDecompositionError",
    "HypothesisLedger",
    "IdentifiabilityError",
    "MarketTheory",
    "NonlinearDynamicsError",
    "OUTheory",
    "ScientificVerdict",
    "StatArbInputError",
    "TheoryArtifact",
    "TheoryWorldError",
    "TargetedRecoveryError",
    "canonical_sha256",
    "certify_ou",
    "fit_ou",
    "fit_nonlinear_dynamics",
    "generate_exact_ou",
    "generate_nonlinear_reference",
    "generate_ou_control",
    "generate_stat_arb_reference",
    "load_frozen_stat_arb_survivor",
    "load_frozen_identifiability_artifact",
    "load_frozen_estimator_tournament",
    "load_frozen_failure_decomposition",
    "load_frozen_targeted_recovery",
    "make_theory_world",
    "run_nonlinear_certification_suite",
    "run_nonlinear_identifiability_suite",
    "run_estimator_tournament",
    "run_failure_decomposition",
    "run_targeted_recovery",
    "run_ou_certification_suite",
    "run_ou_power_map",
    "selection_aware_pair_search",
    "verify_selection_freeze",
    "verify_identifiability_artifact",
    "verify_estimator_tournament",
    "verify_failure_decomposition",
    "verify_targeted_recovery",
]
