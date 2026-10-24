"""Reviewed policy; thresholds are inherited, never fitted to current outputs."""
from pathlib import Path
from typing import Literal
from pydantic import model_validator
from .contracts import BASE, Closed, RuleSpec, decode, digest, canonical

class Thresholds(Closed):
    age_medium_days: Literal[45]
    age_high_days: Literal[120]
    occupancy_share: Literal[0.05]
    occupancy_count: Literal[30]
    switches: Literal[5]
    switch_window: Literal[20]
    ood_quantile: Literal[0.999]

class Policy(Closed):
    schema_version: Literal["risk-policy/1"]
    version: Literal["0.1"]
    base: Literal[BASE]
    evaluation_cutoff: str
    rules: list[RuleSpec]
    thresholds: Thresholds
    scheduled_sweep: Literal["DISABLED"]
    manual_sweep: Literal["AVAILABLE"]

    @model_validator(mode="after")
    def unique(self):
        if len(set(r.rule_id for r in self.rules)) != len(self.rules):
            raise ValueError("Duplicate rule")
        return self

def load(root):
    raw = (Path(root)/"eval/risk_manager/v0.1/policy.json").read_bytes()
    policy = Policy.model_validate(decode(raw)).model_dump(mode="json")
    policy["sha256"] = __import__("hashlib").sha256(raw).hexdigest()
    return policy

def projection(policy):
    return {k: policy[k] for k in ("schema_version", "version", "sha256", "rules")}

def validate_rule(item, policy):
    name = item["rule_id"]
    rule = next((r for r in policy["rules"] if r["rule_id"] == name), None)
    if rule is None or item["rule_version"] != rule["rule_version"]:
        raise ValueError("Unknown risk rule")
    if name != "R-COVERAGE" and item["category"] != rule["category"]:
        raise ValueError("Rule/category substitution")
    if item["reason_code"] is not None and item["reason_code"] not in rule["reason_codes"]:
        raise ValueError("Unknown rule reason")

    if item.get("asset") in {"US-MKT","IN-MKT"}:
        expected="US" if item["asset"]=="US-MKT" else "INDIA"
        if item["country"]!=expected:
            raise ValueError("Issue country/asset substitution")
        for ref in item["evidence_refs"]:
            if ref["type"]=="REPLAY_ARTIFACT" and ref["selector_id"].startswith(("model_","lineage_")) and not ref["selector_id"].endswith(expected):
                raise ValueError("Issue country/evidence substitution")
