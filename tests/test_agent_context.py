from backend.routes.agent import AgentRequest, _grounded_question


def test_grounded_question_is_unchanged_without_display_context():
    request = AgentRequest(question="Explain NVDA risk", ticker="NVDA")

    assert _grounded_question(request) == "Explain NVDA risk"


def test_grounded_question_labels_display_context_as_untrusted():
    request = AgentRequest(
        question="Explain this chart",
        ticker="NVDA",
        context={
            "active_panel": "MC",
            "displayed_price": 182.25,
            "market_source": "SIM",
            "replay_active": False,
        },
    )

    grounded = _grounded_question(request)

    assert grounded.startswith("Explain this chart\n\n")
    assert "may be simulated, stale, or user-controlled" in grounded
    assert "verify every market or portfolio claim with a tool" in grounded
    assert '"active_panel":"MC"' in grounded
    assert '"market_source":"SIM"' in grounded


def test_grounded_question_caps_display_context_size():
    request = AgentRequest(question="Analyze", context={"payload": "x" * 5000})

    grounded = _grounded_question(request)
    encoded_context = grounded.split("DISPLAY_CONTEXT=", maxsplit=1)[1]

    assert len(encoded_context) == 4000
