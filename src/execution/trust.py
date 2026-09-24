"""Fail-closed task policy for consuming certified execution engines."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from src.eval.canonical import canonical_sha256


_LEVEL = re.compile(r"C([0-4])")


class EngineTrustError(RuntimeError):
    """Raised before an engine can run when task trust requirements are unmet."""


def certification_rank(value: str) -> int:
    match = _LEVEL.fullmatch(value)
    if match is None:
        raise ValueError(f"invalid certification level {value!r}")
    return int(match.group(1))


@dataclass(frozen=True)
class EngineTrustRequirement:
    minimum_certification: str

    def __post_init__(self) -> None:
        certification_rank(self.minimum_certification)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "EngineTrustRequirement":
        data = dict(value)
        if set(data) != {"minimum_certification"}:
            raise ValueError("engine trust requirement must contain only minimum_certification")
        return cls(str(data["minimum_certification"]))

    def to_dict(self) -> dict[str, str]:
        return {"minimum_certification": self.minimum_certification}


@dataclass(frozen=True)
class EngineTrustPolicy:
    allowed_engines: Mapping[str, EngineTrustRequirement]

    def __post_init__(self) -> None:
        if not self.allowed_engines:
            raise ValueError("allowed_engines must not be empty")
        if any(not isinstance(name, str) or not name for name in self.allowed_engines):
            raise ValueError("allowed engine names must be non-empty strings")

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "EngineTrustPolicy":
        data = dict(value)
        if set(data) != {"allowed_engines"}:
            raise ValueError("engine trust policy must contain only allowed_engines")
        allowed = data["allowed_engines"]
        if not isinstance(allowed, Mapping):
            raise ValueError("allowed_engines must be an object")
        return cls({
            str(engine): EngineTrustRequirement.from_dict(requirement)
            for engine, requirement in allowed.items()
        })

    def to_dict(self) -> dict[str, dict[str, dict[str, str]]]:
        return {
            "allowed_engines": {
                engine: requirement.to_dict()
                for engine, requirement in sorted(self.allowed_engines.items())
            }
        }


@dataclass(frozen=True)
class CertifiedEngine:
    engine: str
    certification_level: str
    certification_hash: str
    fingerprint: Mapping[str, Any]
    fingerprint_hash: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine": self.engine,
            "certification_level": self.certification_level,
            "certification_hash": self.certification_hash,
            "fingerprint": dict(self.fingerprint),
            "fingerprint_hash": self.fingerprint_hash,
        }


@dataclass(frozen=True)
class CertificationIndex:
    artifact_hash: str
    engines: Mapping[str, CertifiedEngine]

    @classmethod
    def load(cls, path: str | Path) -> "CertificationIndex":
        document = json.loads(Path(path).read_text(encoding="utf-8"))
        supplied_hash = document.get("artifact_hash")
        content = {key: value for key, value in document.items() if key != "artifact_hash"}
        if not isinstance(supplied_hash, str) or canonical_sha256(content) != supplied_hash:
            raise ValueError("certification artifact hash does not verify")
        if document.get("schema_version") != "forge-engine-certification/0.2.4-system-release":
            raise ValueError("unsupported certification release artifact")
        if document.get("system_release_eligible") is not True:
            raise ValueError("certification system release is not eligible")

        engines: dict[str, CertifiedEngine] = {}
        for record in document.get("engines", ()):
            certification = record["certification"]
            fingerprint = certification["engine_fingerprint"]
            engine = str(record["engine"])
            if engine != fingerprint.get("engine"):
                raise ValueError(f"certification engine identity mismatch for {engine}")
            fingerprint_hash = str(certification["engine_fingerprint_hash"])
            if canonical_sha256(fingerprint) != fingerprint_hash:
                raise ValueError(f"engine fingerprint hash mismatch for {engine}")
            certification_hash = str(record["certification_hash"])
            if canonical_sha256(certification) != certification_hash:
                raise ValueError(f"engine certification hash mismatch for {engine}")
            engines[engine] = CertifiedEngine(
                engine=engine,
                certification_level=str(certification["certification_level"]),
                certification_hash=certification_hash,
                fingerprint=dict(fingerprint),
                fingerprint_hash=fingerprint_hash,
            )
        if len(engines) != len(document.get("engines", ())):
            raise ValueError("certification artifact contains duplicate engines")
        return cls(artifact_hash=supplied_hash, engines=engines)

    def require(self, engine: str, minimum_certification: str) -> CertifiedEngine:
        certified = self.engines.get(engine)
        if certified is None:
            raise EngineTrustError(f"engine {engine!r} has no certification record")
        if certification_rank(certified.certification_level) < certification_rank(minimum_certification):
            raise EngineTrustError(
                f"engine {engine!r} certification {certified.certification_level} "
                f"is below required {minimum_certification}"
            )
        return certified


@dataclass(frozen=True)
class BoundEngineTrust:
    policy: EngineTrustPolicy
    certifications: CertificationIndex

    def require(self, engine: str) -> CertifiedEngine:
        requirement = self.policy.allowed_engines.get(engine)
        if requirement is None:
            raise EngineTrustError(f"engine {engine!r} is not allowed by this benchmark task")
        return self.certifications.require(engine, requirement.minimum_certification)

    def decision(self, engine: str) -> dict[str, Any]:
        try:
            certified = self.require(engine)
        except EngineTrustError as exc:
            actual = self.certifications.engines.get(engine)
            return {
                "engine": engine,
                "usable": False,
                "certification_level": None if actual is None else actual.certification_level,
                "reason": str(exc),
            }
        requirement = self.policy.allowed_engines[engine]
        return {
            "engine": engine,
            "usable": True,
            "certification_level": certified.certification_level,
            "minimum_certification": requirement.minimum_certification,
            "fingerprint_hash": certified.fingerprint_hash,
            "reason": "Certification(engine) >= Required(capability)",
        }
