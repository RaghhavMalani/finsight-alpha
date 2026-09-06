"""FinSight Forge v0.2.4 simulation-engine certification federation."""

from .contracts import (
    CANONICAL_METRICS,
    AccountState,
    CanonicalFill,
    CanonicalOrder,
    ContractError,
    EngineDescriptor,
    EngineProvenance,
    EpistemicValue,
    ExecutionAssumptions,
    MeasurementState,
    SimulationEngine,
    SimulationMode,
    SimulationOutcome,
    SimulationRequest,
    SimulationResult,
)
from .certification import (
    CERTIFIED,
    DECLARED_ENGINES,
    ENGINE_CERTIFICATION_TARGET,
    FAILED_CERTIFICATION,
    CertificationBenchmarkArtifact,
    CertificationLevel,
    EngineCertificationArtifact,
)
from .comparison import ComparisonContract, ComparisonResult, ComparisonStatus
from .events import CanonicalEventType, CanonicalExecutionEvent, NativeEngineEvent
from .fingerprints import EngineFingerprint
from .failures import FailureCode
from .semantic_tapes import SEMANTIC_TAPES, SemanticTape, accounting_from_fills, evaluate_semantic_result
from .invariants import InvariantCheck, verify_execution_invariants
from .replay_manifest import ExecutionReplayManifest
from .tapes import SYNTHETIC_TAPES, SyntheticTape, independent_oracle
from .causal_gap import CausalRealityGap
from .engines import ENGINE_DESCRIPTORS, EngineRegistry, WorkerEngine, default_registry
from .tool_plane import SimulationToolPlane

__all__ = [
    "FailureCode", "SEMANTIC_TAPES", "SemanticTape", "accounting_from_fills", "evaluate_semantic_result",
    "CANONICAL_METRICS", "AccountState", "CanonicalFill", "CanonicalOrder",
    "ContractError", "ENGINE_DESCRIPTORS", "EngineDescriptor", "EngineProvenance",
    "CERTIFIED", "DECLARED_ENGINES", "ENGINE_CERTIFICATION_TARGET", "FAILED_CERTIFICATION",
    "CertificationBenchmarkArtifact", "CertificationLevel", "EngineCertificationArtifact",
    "ComparisonContract", "ComparisonResult", "ComparisonStatus", "CausalRealityGap",
    "CanonicalEventType", "CanonicalExecutionEvent", "NativeEngineEvent", "EngineFingerprint",
    "ExecutionReplayManifest", "InvariantCheck", "SYNTHETIC_TAPES", "SyntheticTape",
    "independent_oracle", "verify_execution_invariants",
    "EngineRegistry", "EpistemicValue", "ExecutionAssumptions", "MeasurementState",
    "SimulationEngine", "SimulationMode", "SimulationOutcome", "SimulationRequest",
    "SimulationResult", "SimulationToolPlane", "WorkerEngine", "default_registry",
]
