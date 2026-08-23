"""Typed failures raised by the Forge execution sandbox."""

from __future__ import annotations


class SandboxError(RuntimeError):
    """Base class for sandbox construction and execution failures."""


class SandboxManifestError(SandboxError, ValueError):
    """The immutable execution manifest is invalid."""


class SandboxPolicyError(SandboxError):
    """Generated code attempted an operation forbidden by policy."""


class SandboxTimeout(SandboxError):
    """The worker exceeded its wall-clock allowance."""


class SandboxMemoryLimit(SandboxError):
    """The worker exceeded its resident-memory allowance."""


class SandboxIntegrityError(SandboxError):
    """A frozen input or execution attestation failed an integrity check."""
