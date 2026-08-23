from __future__ import annotations

import numpy as np
import pytest

from src.rag.ingest import NoEvidenceError, answer_question, ingest_documents
from src.rag.namespace import ResearchNamespace


def _embed(texts: list[str]) -> np.ndarray:
    return np.ones((len(texts), 4), dtype="float32")


def test_research_namespace_separates_tenants_users_and_tickers(tmp_path) -> None:
    first = ResearchNamespace(1, 7, "AAPL").index_dir(tmp_path)
    second = ResearchNamespace(2, 7, "AAPL").index_dir(tmp_path)
    third = ResearchNamespace(1, 8, "MSFT").index_dir(tmp_path)

    assert len({first, second, third}) == 3
    assert first.is_relative_to(tmp_path.resolve())


def test_ticker_and_acl_mismatch_fail_closed(tmp_path) -> None:
    document = tmp_path / "aapl.txt"
    document.write_text(
        "Apple filing evidence about services revenue.", encoding="utf-8"
    )
    store, chunks = ingest_documents(
        document,
        ticker="AAPL",
        index_dir=None,
        embed_fn=_embed,
        organization_id=10,
        user_id=20,
    )

    with pytest.raises(NoEvidenceError, match="MSFT"):
        answer_question("Revenue?", store, chunks, ticker="MSFT", provider="none")
    with pytest.raises(NoEvidenceError, match="AAPL"):
        answer_question(
            "Revenue?",
            store,
            chunks,
            ticker="AAPL",
            organization_id=11,
            user_id=20,
            provider="none",
        )
