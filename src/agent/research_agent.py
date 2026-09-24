"""The single autonomous Forge v0.2 research-and-coding agent."""

from __future__ import annotations

import textwrap
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable

from src.benchmark import PolicyOutput
from src.findings import (
    EvidenceReference,
    NumericalClaim,
    ResearchArtifact,
    ResearchExperiment,
    ResearchFinding,
    ResearchTask,
)
from src.rewards import ResourceUsage
from src.sandbox import ExecutionResult
from src.tool_plane import ForgeToolPlane, ToolAction
from src.world import MarketWorld


class ResearchState(str, Enum):
    UNDERSTAND = "UNDERSTAND"
    FORM_HYPOTHESIS = "FORM_HYPOTHESIS"
    PLAN = "PLAN"
    GATHER_EVIDENCE = "GATHER_EVIDENCE"
    WRITE_EXPERIMENT = "WRITE_EXPERIMENT"
    EXECUTE = "EXECUTE"
    INTERPRET = "INTERPRET"
    SUBMIT_FINDING = "SUBMIT_FINDING"


@dataclass(frozen=True)
class ResearchRecipe:
    tool: str
    arguments: dict[str, Any]
    code: str
    hypothesis: str
    confidence: float
    limitation: str


@dataclass(frozen=True)
class ResearchRun:
    finding: ResearchFinding
    usage: ResourceUsage
    executions: tuple[ExecutionResult, ...]
    actions: tuple[ToolAction, ...]
    state_trace: tuple[str, ...]
    model: str
    prompt_version: str

    def policy_output(self) -> PolicyOutput:
        return PolicyOutput(self.finding, self.usage, self.executions)


def _program(body: str) -> str:
    prefix = """import json

payload = json.loads((INPUT_DIR / "input.json").read_text(encoding="utf-8"))
rows = payload["records"]
"""
    suffix = """
(ARTIFACT_DIR / "result.json").write_text(
    json.dumps(result, sort_keys=True, separators=(",", ":")),
    encoding="utf-8",
)
"""
    return prefix + textwrap.dedent(body).strip() + "\n" + suffix


RECIPES: dict[str, ResearchRecipe] = {
    "pit_total_return": ResearchRecipe(
        "market.get_history", {"ticker": "TEST"},
        _program("""
        ordered = sorted(rows, key=lambda row: row["observed_at"])
        value = ordered[-1]["close"] / ordered[0]["close"] - 1.0
        result = {"claims": [{"claim_id": "cumulative_return", "metric": "cumulative_return", "value": value, "unit": "decimal"}], "summary": f"The point-in-time cumulative return is {value:.6f}."}
        """),
        "The first and latest available observations determine the point-in-time return.", 0.92,
        "The result is limited to the frozen price observations in the benchmark world.",
    ),
    "filing_gross_margin": ResearchRecipe(
        "fundamentals.get_asof", {"ticker": "TEST"},
        _program("""
        row = sorted(rows, key=lambda item: item["filed_at"])[-1]
        value = row["gross_profit"] / row["revenue"]
        result = {"claims": [{"claim_id": "gross_margin", "metric": "gross_margin", "value": value, "unit": "decimal"}], "summary": f"The available filing implies a gross margin of {value:.6f}."}
        """),
        "The filing available at the cutoff contains sufficient inputs for gross margin.", 0.93,
        "Later restatements are intentionally outside this frozen information set.",
    ),
    "task_001_future_filing_contamination": ResearchRecipe(
        "fundamentals.get_asof", {"ticker": "TEST"},
        _program("""
        value = len(rows)
        result = {"claims": [{"claim_id": "visible_filing_versions", "metric": "visible_filing_versions", "value": value, "unit": "count"}], "summary": f"Exactly {value} filing version was available; future contamination is excluded."}
        """),
        "Only filing versions available by the task cutoff may enter the analysis.", 0.96,
        "This detects availability-time contamination in the supplied filing series only.",
    ),
    "task_002_historical_valuation": ResearchRecipe(
        "fundamentals.get_asof", {"ticker": "TEST"},
        _program("""
        row = rows[-1]
        value = row["market_cap"] + row["debt"] - row["cash"]
        result = {"claims": [{"claim_id": "enterprise_value", "metric": "enterprise_value", "value": value, "unit": "usd_millions"}], "summary": f"The reproduced point-in-time enterprise value is {value:.2f} million USD."}
        """),
        "Enterprise value can be reproduced from contemporaneous market cap, debt, and cash.", 0.94,
        "The reconstruction uses the benchmark's simplified enterprise-value convention.",
    ),
    "task_003_black_scholes": ResearchRecipe(
        "world.get_snapshot", {"dataset": "option_inputs"},
        _program("""
        import math
        row = rows[0]
        s, k, r, sigma, t = row["spot"], row["strike"], row["rate"], row["volatility"], row["years"]
        d1 = (math.log(s / k) + (r + sigma * sigma / 2.0) * t) / (sigma * math.sqrt(t))
        d2 = d1 - sigma * math.sqrt(t)
        cdf = lambda x: 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))
        pdf = lambda x: math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)
        price = s * cdf(d1) - k * math.exp(-r * t) * cdf(d2)
        delta = cdf(d1)
        gamma = pdf(d1) / (s * sigma * math.sqrt(t))
        vega = s * pdf(d1) * math.sqrt(t)
        result = {"claims": [
            {"claim_id": "call_price", "metric": "black_scholes_call", "value": price, "unit": "usd"},
            {"claim_id": "delta", "metric": "call_delta", "value": delta, "unit": "decimal"},
            {"claim_id": "gamma", "metric": "call_gamma", "value": gamma, "unit": "per_usd"},
            {"claim_id": "vega", "metric": "call_vega", "value": vega, "unit": "usd_per_vol_unit"}
        ], "summary": f"Black-Scholes call={price:.6f}, delta={delta:.6f}, gamma={gamma:.6f}, vega={vega:.6f}."}
        """),
        "The frozen option inputs should reproduce the Black-Scholes price and analytic Greeks.", 0.97,
        "The calculation assumes a European call, constant volatility, and no dividends.",
    ),
    "task_004_valuation_sensitivity": ResearchRecipe(
        "world.get_snapshot", {"dataset": "valuation_sensitivities"},
        _program("""
        dominant = max(rows, key=lambda row: abs(row["valuation_change_pct"]))
        codes = {"revenue_growth": 1, "operating_margin": 2, "wacc": 3}
        value = codes[dominant["parameter"]]
        result = {"claims": [{"claim_id": "dominant_parameter_code", "metric": "dominant_parameter_code", "value": value, "unit": "category_code"}], "summary": f"{dominant['parameter']} is the dominant valuation sensitivity."}
        """),
        "The largest absolute valuation response identifies the dominant model sensitivity.", 0.90,
        "The categorical code is specific to the benchmark's three declared parameters.",
    ),
    "task_005_point_in_time_momentum": ResearchRecipe(
        "world.get_snapshot", {"dataset": "prices"},
        _program("""
        by_ticker = {}
        for row in sorted(rows, key=lambda item: item["observed_at"]):
            by_ticker.setdefault(row["ticker"], []).append(row["close"])
        scores = {ticker: values[-1] / values[0] - 1.0 for ticker, values in by_ticker.items()}
        winner, value = max(scores.items(), key=lambda item: item[1])
        result = {"claims": [{"claim_id": "winning_momentum", "metric": "winning_momentum", "value": value, "unit": "decimal"}], "summary": f"{winner} has the strongest point-in-time momentum at {value:.6f}."}
        """),
        "The strongest trailing return in the available panel defines the momentum winner.", 0.91,
        "The toy factor omits transaction costs, corporate actions, and a skip-month convention.",
    ),
    "task_006_leaked_alpha": ResearchRecipe(
        "world.get_snapshot", {"dataset": "strategy_rows"},
        _program("""
        leaked = any(row["label_available_from"] > row["decision_time"] for row in rows)
        value = 1 if leaked else 0
        result = {"claims": [{"claim_id": "label_leak_detected", "metric": "label_leak_detected", "value": value, "unit": "boolean_code"}], "summary": "The strategy uses labels unavailable at decision time." if leaked else "No label leakage was detected."}
        """),
        "A strategy is invalid when training labels become available after its decision timestamp.", 0.98,
        "The guard evaluates explicit timestamps and cannot detect undocumented preprocessing leakage.",
    ),
    "task_007_covariance_instability": ResearchRecipe(
        "world.get_snapshot", {"dataset": "covariance_estimates"},
        _program("""
        values = {row["regime"]: abs(row["off_diagonal_covariance"]) for row in rows}
        value = max(values.values()) / min(values.values())
        result = {"claims": [{"claim_id": "covariance_instability_ratio", "metric": "covariance_instability_ratio", "value": value, "unit": "ratio"}], "summary": f"Cross-asset covariance changes by a factor of {value:.6f} across regimes."}
        """),
        "A large cross-regime covariance ratio indicates an unstable dependence estimate.", 0.89,
        "A two-regime off-diagonal ratio is a diagnostic, not a full covariance-break test.",
    ),
    "task_008_var_coverage": ResearchRecipe(
        "world.get_snapshot", {"dataset": "var_observations"},
        _program("""
        breaches = sum((-row["return"]) > row["var_95"] for row in rows)
        value = breaches / len(rows)
        result = {"claims": [{"claim_id": "realized_breach_rate", "metric": "realized_breach_rate", "value": value, "unit": "decimal"}], "summary": f"Realized VaR breach coverage is {value:.6f}."}
        """),
        "Realized loss exceedances measure whether the frozen VaR forecast achieved its coverage.", 0.93,
        "The fixture is intentionally small and does not support an asymptotic coverage test.",
    ),
    "task_009_regime_leakage": ResearchRecipe(
        "world.get_snapshot", {"dataset": "regime_features"},
        _program("""
        leaked = any(row["feature_available_from"] > row["decision_time"] for row in rows)
        value = 1 if leaked else 0
        result = {"claims": [{"claim_id": "future_volatility_leak", "metric": "future_volatility_leak", "value": value, "unit": "boolean_code"}], "summary": "The regime classifier leaks future volatility." if leaked else "No future-volatility leakage was detected."}
        """),
        "A regime feature that arrives after classification time is future-volatility leakage.", 0.98,
        "The timestamp audit does not test leakage hidden inside opaque feature-generation code.",
    ),
    "task_010_filing_evidence": ResearchRecipe(
        "filings.search", {"ticker": "TEST", "query": "risk factor"},
        _program("""
        value = sum("risk" in (row.get("text") or "").lower() for row in rows)
        result = {"claims": [{"claim_id": "risk_passage_count", "metric": "risk_passage_count", "value": value, "unit": "count"}], "summary": f"The frozen filing contains {value} evidence-backed risk passages."}
        """),
        "Point-in-time filing passages should support a directly cited risk-factor answer.", 0.90,
        "Keyword-matched passages do not measure the materiality of each disclosed risk.",
    ),
}


class ResearchAgent:
    """A single deterministic baseline policy that produces verified artifacts."""

    prompt_version = "research-agent-v0.2.0"

    def __init__(
        self,
        *,
        model: str = "deterministic-baseline",
        finding_transform: Callable[[ResearchTask, ResearchFinding], ResearchFinding] | None = None,
    ) -> None:
        self.model = model
        self.finding_transform = finding_transform

    def run(self, task: ResearchTask, world: MarketWorld, *, sandbox_root: str) -> ResearchRun:
        plane = ForgeToolPlane(task=task, world=world, sandbox_root=sandbox_root)
        states = [ResearchState.UNDERSTAND.value]
        described = plane.call("world.describe", state=ResearchState.UNDERSTAND.value)
        if not described.success:
            raise RuntimeError(described.value["error"])
        states.extend((ResearchState.FORM_HYPOTHESIS.value, ResearchState.PLAN.value))
        recipe = RECIPES.get(task.task_id)
        if recipe is None:
            raise ValueError(f"deterministic baseline has no recipe for {task.task_id!r}")
        states.append(ResearchState.GATHER_EVIDENCE.value)
        gathered = plane.call(recipe.tool, recipe.arguments, state=ResearchState.GATHER_EVIDENCE.value)
        if not gathered.success:
            raise RuntimeError(gathered.value["error"])
        states.extend((ResearchState.WRITE_EXPERIMENT.value, ResearchState.EXECUTE.value))
        experiment = plane.call(
            "experiment.execute_python", {"code": recipe.code, "input": gathered.value},
            state=ResearchState.EXECUTE.value,
        )
        if not experiment.success:
            statuses = [item["status"] for item in experiment.value["replays"]]
            raise RuntimeError(f"sandbox experiment failed: {statuses}")
        states.append(ResearchState.INTERPRET.value)
        document = experiment.value["artifacts"].get("result.json")
        if not isinstance(document, dict):
            raise RuntimeError("sandbox did not produce result.json")
        evidence = tuple(EvidenceReference.from_dict(item) for item in gathered.value.get("evidence", []))
        evidence_ids = tuple(item.evidence_id for item in evidence)
        claims = tuple(
            NumericalClaim(item["claim_id"], item["metric"], item["value"], item["unit"], evidence_ids)
            for item in document["claims"]
        )
        executions = tuple(plane.executions)
        artifact_id = f"{task.task_id}-result"
        artifact = ResearchArtifact(
            artifact_id,
            executions[0].artifact_hashes["result.json"],
            tuple(item.artifact_hashes["result.json"] for item in executions),
        )
        finding = ResearchFinding(
            finding_id=f"{task.task_id}-finding", hypothesis=recipe.hypothesis,
            conclusion=str(document["summary"]), confidence=recipe.confidence,
            evidence=evidence, claims=claims, artifacts=(artifact,),
            experiments=(ResearchExperiment(
                f"{task.task_id}-experiment", executions[0].manifest_hash,
                tuple(item.reproducibility_hash for item in executions), (artifact_id,),
            ),),
            limitations=(recipe.limitation,),
        )
        if self.finding_transform is not None:
            finding = self.finding_transform(task, finding)
        states.append(ResearchState.SUBMIT_FINDING.value)
        submitted = plane.call("finding.submit", {"finding": finding}, state=ResearchState.SUBMIT_FINDING.value)
        if not submitted.success or plane.submitted_finding != finding:
            raise RuntimeError("typed finding submission failed")
        usage = ResourceUsage(
            latency_seconds=sum(item.runtime_ms for item in executions) / 1000.0,
            tool_calls=len(plane.actions),
            sandbox_executions=len(executions),
        )
        return ResearchRun(
            finding, usage, executions, tuple(plane.actions), tuple(states),
            self.model, self.prompt_version,
        )
