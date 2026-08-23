"""Tenant, user, and document-scope boundaries for research indexes."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from src import config


def _slug(value: object, *, label: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value).strip()).strip("-.")
    if not slug or slug in {".", ".."}:
        raise ValueError(f"Invalid {label} for research namespace.")
    return slug.lower()


@dataclass(frozen=True)
class ResearchNamespace:
    organization_id: int
    user_id: int
    ticker: str

    def __post_init__(self) -> None:
        if self.organization_id <= 0 or self.user_id <= 0:
            raise ValueError(
                "Research namespaces require positive tenant and user ids."
            )
        object.__setattr__(self, "ticker", _slug(self.ticker, label="ticker").upper())

    def index_dir(self, root: Path | None = None) -> Path:
        base = (root or config.DATA_DIR / "rag_index").resolve()
        path = (
            base
            / f"org-{self.organization_id}"
            / f"user-{self.user_id}"
            / _slug(self.ticker, label="ticker")
        ).resolve()
        if base != path and base not in path.parents:
            raise ValueError("Research namespace escaped the configured index root.")
        return path

    def acl(self) -> dict[str, object]:
        return {
            "organization_id": self.organization_id,
            "user_id": self.user_id,
            "ticker": self.ticker,
        }
