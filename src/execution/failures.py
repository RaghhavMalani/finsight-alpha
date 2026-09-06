"""Stable host-owned failure taxonomy at the untrusted execution boundary."""

from enum import Enum


class FailureCode(str, Enum):
    ENGINE_DRIFT = "ENGINE_DRIFT"
    REPLAY_MISMATCH = "REPLAY_MISMATCH"
    TIMESTAMP_CAUSALITY_FAILURE = "TIMESTAMP_CAUSALITY_FAILURE"
    FILL_IMPOSSIBLE = "FILL_IMPOSSIBLE"
    ACCOUNTING_MISMATCH = "ACCOUNTING_MISMATCH"
    SCHEMA_INVALID = "SCHEMA_INVALID"
    PROVENANCE_MISSING = "PROVENANCE_MISSING"
    CAPABILITY_FALSE_CLAIM = "CAPABILITY_FALSE_CLAIM"
    WORKER_RESOURCE_FAILURE = "WORKER_RESOURCE_FAILURE"


class BoundaryError(ValueError):
    def __init__(self, message: str, code: FailureCode) -> None:
        super().__init__(message)
        self.code = code
