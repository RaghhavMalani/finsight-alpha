"""Metadata predicates over retained assertions. No feature/statistical/model work."""
from __future__ import annotations
from collections import defaultdict
from .contracts import Observation, Coverage, identity, digest, utc, clock

def evaluate(evidence, witnessed_at):
    p = evidence.policy
    rules = {r["rule_id"]:r for r in p["rules"]}
    observations, coverage = [], []
    def add(rule_id, subject, *, triggered=False, availability="AVAILABLE", coverage_availability=None,
            code=None, reason=None, aliases=(), severity=None, category=None, country="NONE", asset=None,
            model=None, family=None, key="v0.1", kind=None, origins=(), currency="CURRENT",
            evidence_class="REAL_RETAINED", evidence_at=None, value=None, threshold=None, unit=None,
            title=None, comparison="EXACT"):
        rule = rules[rule_id]
        category = category or rule["category"]
        family = family or rule_id
        scope = dict(kind=kind or ("SOURCE" if category=="DATA" else "MODEL" if category=="MODEL" else
            "RESEARCH_FAMILY" if category=="RESEARCH_HYGIENE" else "PORTFOLIO" if category=="PORTFOLIO" else
            "SIMULATOR_COMPARISON" if category=="SIMULATOR" else "PUBLIC_PLATFORM"),
            subject_id=subject,evidence_family=family,stable_scope_key=key)
        check_id = rule["check_id"]+":"+subject+":"+key
        refs = evidence.ref(*aliases) if aliases else [{"type":"POLICY_ASSERTION","policy_sha256":p["sha256"],"check_id":check_id}]
        unavailable = availability=="UNAVAILABLE"
        outcome = "NOT_EVALUATED" if unavailable else "FINDING" if triggered else "CLEAR"
        message = reason or (rule["predicate"] if triggered else "No finding within this retained evidence contract.")
        if triggered and code is None:
            code = rule["reason_codes"][0]
        if unavailable and code is None:
            raise ValueError("Missing check has no precise reason")
        remediation = dict(state="DEFERRED" if code=="DEFERRED_PHASE9" else "BLOCKED_EXTERNAL" if unavailable else
            "REQUIRED" if triggered else "INFORMATIONAL",requirement_code=code or rule["check_id"],
            text=rule["remediation"],evidence_required=rule["input_selectors"])
        c = dict(schema_version="risk-coverage/1",check_id=check_id,category=category,scope=scope,
            availability=coverage_availability or availability,outcome=outcome,reason_code=code,
            reason=message,evidence_class=evidence_class,evaluated_at=witnessed_at,evidence_at=evidence_at,
            evidence_refs=refs,remediation=remediation)
        Coverage.model_validate(c)
        coverage.append(c)
        # Missing numerical checks create a coverage Issue, never a pretended risk measure.
        use_rule = "R-COVERAGE" if unavailable else rule_id
        o = dict(schema_version="risk-observation/1",observation_id="0"*64,issue_id="pending",rule_id=use_rule,
            rule_version=1,category=category,severity=severity or ("INFO" if unavailable else rule["severity"]),
            scope=scope,country=country,asset=asset,model=model,title=title or rule["check_id"].replace("_"," ").title(),
            reason_code=code,reason=message,outcome=outcome,currency=currency,availability=availability,
            evidence_class="UNAVAILABLE" if unavailable else evidence_class,evidence_at=evidence_at,
            evidence_cutoff=evidence.cutoff,witnessed_at=witnessed_at,policy_sha256=p["sha256"],
            fingerprint="0"*64,previous_observation_id=None,evidence_refs=refs,
            source_quality=dict(clock_quality="CAPTURE_ONLY" if category=="MODEL" else "NOT_APPLICABLE",
                lineage_status="UNAVAILABLE" if unavailable else "VERIFIED",permission_status="METADATA_ONLY",
                limitation_codes=[code] if code else []),remediation=remediation,origin_records=list(origins),
            assertions=[dict(assertion_id=check_id,outcome=outcome,unit=unit or rule["unit"],value=None if unavailable else value,
                comparison="NONE" if unavailable else comparison,threshold=None if unavailable else threshold)])
        o["issue_id"] = identity(o)
        relevant = {k:v for k,v in o.items() if k not in {"observation_id","fingerprint","witnessed_at","previous_observation_id"}}
        o["fingerprint"] = digest(relevant)
        o["observation_id"] = digest(["risk-observation/1",o["issue_id"],o["fingerprint"]])
        Observation.model_validate(o)
        observations.append(o)

    data = evidence.values["data_issues"]["payload"]["items"]
    health = evidence.values["data_health"]["payload"]["items"]
    latest = {h["source"]:[] for h in health}
    for h in health:
        latest[h["source"]].append(h["diagnostic_id"])
    groups = defaultdict(list)
    for source_issue in data:
        origin = dict(source_issue)
        if source_issue["kind"]=="SOURCE_ATTEMPT_FAILED":
            # Current required-source condition is stable independently of reason wording.
            key = "required-source" if source_issue["severity"]=="HIGH" else "historical:"+source_issue["id"]
            groups[(source_issue["source"],"attempt",key)].append(origin)
        else:
            diagnostic = evidence.health_history.get(source_issue["evidence"][0])
            key = "health:"+diagnostic["window_start"]+":"+diagnostic["window_end"] if diagnostic else "historical:"+source_issue["id"]
            groups[(source_issue["source"],"health",key)].append(origin)
    for (source,kind,key), origins in sorted(groups.items()):
        current = any(o["severity"]=="HIGH" for o in origins) if kind=="attempt" else any(
            set(o["evidence"]) & set(latest.get(source,())) for o in origins)
        rule_id = "R-DATA-ATTEMPT" if kind=="attempt" else "R-DATA-HEALTH"
        last = max(origins,key=lambda o:o["last_seen_at"])
        country = next((x["country"] for x in evidence.values["data_coverage"]["payload"]["items"] if x["source"]==source),"NONE")
        add(rule_id,source,triggered=True,code=last["kind"],reason=last["reason"],origins=origins,
            aliases=("data_issues","data_health","data_coverage"),severity=last["severity"],
            availability="AVAILABLE",key=key,currency="CURRENT" if current else "HISTORICAL_ONLY",
            country=country if country in {"US","INDIA"} else "NONE",evidence_at=utc(last["last_seen_at"]),
            value=len(origins),unit="events",title=source+" Â· "+("source unavailable" if kind=="attempt" else "partial source health"))
    for h in health:
        subject = h["source"]
        key = h["window_start"]+":"+h["window_end"]+":"+h["library_start"]
        add("R-DATA-FRESHNESS",subject,triggered=h["freshness_status"]=="STALE",
            availability="PARTIAL" if h["freshness_status"]=="HISTORICAL_WINDOW" else "AVAILABLE",
            reason="Retained source classification: "+h["freshness_status"]+". Age is pinned to its original age_reference.",
            aliases=("data_health",),evidence_at=utc(h["age_reference"]),value=h["freshness_status"],
            key=key,unit="status")
        if h["freshness_status"]=="HISTORICAL_WINDOW":
            coverage[-1]["outcome"]="NOT_EVALUATED"
            coverage[-1]["reason_code"]="HISTORICAL_WINDOW_ONLY"
        if h["calendar_status"]=="AVAILABLE":
            add("R-DATA-GAPS",subject,triggered=h["missing_sessions"]>0,code="EVIDENCED_SESSION_GAPS" if h["missing_sessions"] else None,
                aliases=("data_health",),evidence_at=utc(h["age_reference"]),value=h["missing_sessions"],threshold=0,
                unit="observations",comparison="GT",key=h["window_start"]+":"+h["window_end"]+":"+h["library_start"])
        else:
            # Existing IIMA source-health Incident already explains this; no duplicate gap Issue.
            rule = rules["R-DATA-GAPS"]
            scope = dict(kind="SOURCE",subject_id=subject,evidence_family="R-DATA-GAPS",stable_scope_key="calendar")
            coverage.append(dict(schema_version="risk-coverage/1",check_id="DATA_GAPS:"+subject,category="DATA",scope=scope,
                availability="UNAVAILABLE" if h["calendar_status"]=="UNAVAILABLE" else "PARTIAL",outcome="NOT_EVALUATED",
                reason_code="CALENDAR_UNAVAILABLE" if h["calendar_status"]=="UNAVAILABLE" else "SOURCE_SCHEMA_UNSUPPORTED",
                reason=h["calendar_reason"] or "Exchange sessions are not applicable to this retained macro window.",
                evidence_class="REAL_RETAINED",evaluated_at=witnessed_at,evidence_at=utc(h["age_reference"]),
                evidence_refs=evidence.ref("data_health"),remediation=dict(state="BLOCKED_EXTERNAL",requirement_code="CALENDAR_UNAVAILABLE",
                    text=rule["remediation"],evidence_required=["data_health"])))
    mirror = evidence.values["data_disagreement"]["payload"]["summary"]
    add("R-DATA-MIRROR","alfred-bls",triggered=mirror["different"]>0,coverage_availability="PARTIAL",
        aliases=("data_disagreement",),evidence_at=utc(mirror["comparison_cutoff"]),value=mirror["different"],threshold=0,
        comparison="GT",reason="Retained 71-pair same-upstream mirror. Current refresh unavailable; not independent confirmation.")
    add("R-DATA-MIRROR","independent-market-providers",availability="UNAVAILABLE",code="INDEPENDENT_PROVIDER_COMPARISON_ABSENT",
        reason="No public compatible independent market-price comparison contract is retained.",category="DATA")

    th = p["thresholds"]
    for country in ("US","INDIA"):
        alias, line_alias = "model_"+country, "lineage_"+country
        snap = evidence.values[alias]["payload"]
        observed = evidence.refs[alias]["available_at"]
        asset = snap["asset"]
        for model in ("hmm2","hmm4"):
            h = snap["hmm"][model]
            kwargs = dict(country=country,asset=asset,model=model,aliases=(alias,line_alias),evidence_at=observed,
                          family="phase5:"+model,key=h["config"])
            add("R-MODEL-HMM-CONVERGENCE",asset+":"+model,triggered=not h["converged"],value=h["converged"],**kwargs)
            add("R-MODEL-OCCUPANCY",asset+":"+model,triggered=any(s<th["occupancy_share"] or n<th["occupancy_count"]
                for s,n in zip(h["occupancy"],h["occupancy_counts"])),value=min(h["occupancy_counts"]),threshold=30,**kwargs)
            add("R-MODEL-INSTABILITY",asset+":"+model,triggered=h["recent_switches"]>th["switches"],
                value=h["recent_switches"],threshold=5,comparison="GT",**kwargs)
            add("R-MODEL-OOD",asset+":"+model,triggered=h["ood"],value=h["ood"],coverage_availability="PARTIAL",
                reason="Retained HMM-only OOD flag; posterior uncalibrated and path PARAMETER_RETROSPECTIVE.",**kwargs)
        g = snap["volatility"]["garch"]
        kwargs=dict(country=country,asset=asset,model="garch",aliases=(alias,line_alias),evidence_at=observed,
                    family="phase5:garch",key="garch1-1")
        add("R-MODEL-GARCH-CONVERGENCE",asset+":garch",triggered=not g["converged"],value=g["converged"],**kwargs)
        invalid = g["fit_status"] in {"BOUNDARY","UNIDENTIFIED"} or not g["half_life_domain"].startswith("VALID")
        code = "GARCH_"+g["fit_status"] if g["fit_status"] in {"BOUNDARY","UNIDENTIFIED"} else "GARCH_INVALID_DOMAIN"
        add("R-MODEL-GARCH-DOMAIN",asset+":garch",triggered=invalid,code=code if invalid else None,value=g["fit_status"],**kwargs)
        age=(clock(evidence.cutoff)-clock(utc(snap["state_at"]))).total_seconds()/86400
        add("R-MODEL-AGE",asset,triggered=age>45,severity="HIGH" if age>120 else "MEDIUM",
            aliases=(alias,),country=country,asset=asset,evidence_at=observed,value=age,threshold=45,comparison="GT",
            reason=("Latest retained observation is "+format(age,".2f")+" calendar days before the explicit pinned evaluation cutoff."),
            title=asset+" Â· retained input age")
        add("R-MODEL-LINEAGE",asset,aliases=(alias,line_alias),country=country,asset=asset,evidence_at=observed,value="VERIFIED")
    for rule,code,reason in [
        ("R-MODEL-PSI","DRIFT_REFERENCE_CONTRACT_ABSENT","No retained reference/current distribution, reviewed bins, sample or PIT task contract."),
        ("R-MODEL-KS","DRIFT_COMPARISON_CONTRACT_ABSENT","No retained compatible comparison samples and dependence/feature chronology contract."),
        ("R-MODEL-CALIBRATION","CALIBRATION_REFERENCE_ABSENT","No independently supported baseline/current prediction-outcome calibration contract."),
        ("R-MODEL-ABSTENTION","ABSTENTION_RECEIPTS_ABSENT","Retained HMM OOD boundary exists; consumer decision/compliance receipts are unavailable.")]:
        add(rule,"retained-models",availability="UNAVAILABLE",coverage_availability="PARTIAL" if rule=="R-MODEL-ABSTENTION" else None,
            code=code,reason=reason,aliases=("audit_US","audit_INDIA"),category="MODEL")

    f=evidence.values["research_flagship"]
    prereg=evidence.values["research_prereg"]
    freeze=evidence.values["research_freeze"]
    registry=evidence.values["plugin_registry"]
    opens=[x for x in f["attempts"] if x["kind"]=="HOLDOUT_OPEN"]
    starts={x["attempt"]:x for x in f["attempts"] if x["kind"]=="START"}
    seen=set(); breach=False
    for o in opens:
        if o["attempt"] in seen or o["attempt"] not in starts or clock(o["at"])<clock(freeze["frozen_at"]):
            breach=True
        if o["payload"]["preregistration_hash"]!=freeze["preregistration_hash"]:
            breach=True
        seen.add(o["attempt"])
    # Hash-chain audit is independent of totals and never opens a registry.
    prev="0"*64
    for row in f["attempts"]:
        content=dict(id=row["event_id"],kind=row["kind"],attempt=row["attempt"],at=row["at"],
                     payload=row["payload"],previous=prev,organization=row["organization"])
        if row["previous"]!=prev or digest(content)!=row["hash"]:
            raise ValueError("Research attempt chain invalid")
        prev=row["hash"]
    add("R-RESEARCH-OPENING","research-os-flagship",triggered=breach,
        code="HOLDOUT_CONTRACT_BREACH" if breach else None,aliases=("research_flagship","research_freeze","research_repeat"),
        value=len(opens),reason="46 original flagship openings; later repeatability separately records 48 total. Counts alone are not violations.",
        country="CROSS_MARKET",evidence_at=utc(f["finished_at"]))
    trialids=set(prereg["family"]["trial_ids"])
    accounted={x["run"]["trial_id"] for x in f["records"].values()}
    add("R-RESEARCH-FAMILY","research-os-flagship",triggered=trialids!=accounted,
        aliases=("research_prereg","research_flagship"),value=len(accounted),threshold=len(trialids),
        reason="46 declared correlated trial slots are accounted, including unavailable slots. Independent trial count is unavailable.",
        country="CROSS_MARKET",evidence_at=utc(f["finished_at"]))
    required=evidence.values["research_identities"]
    bad = freeze["preregistration_hash"]!=required["preregistration_hash"] or f["preregistration_hash"]!=required["preregistration_hash"]
    bad |= any(x["run"]["preregistration_hash"]!=required["preregistration_hash"] or
        x["run"]["freeze_receipt_hash"]!=required["freeze_receipt_hash"] for x in f["records"].values())
    add("R-RESEARCH-PREREG","research-os-flagship",triggered=bad,code="PREREGISTRATION_BINDING_INVALID" if bad else None,
        aliases=("research_prereg","research_freeze","research_flagship","research_identities"),value=not bad,
        country="CROSS_MARKET",evidence_at=utc(f["finished_at"]))
    gate=evidence.values["research_gate"]
    badgate=gate["engine_authorized"] or gate["market_replication_authorized"] or f["calibration_status"]!="NOT_CALIBRATED"
    add("R-RESEARCH-GATE","closed-research",triggered=badgate,aliases=("research_flagship","research_gate","ledger_US","ledger_INDIA"),
        value="NOT_CALIBRATED / CLOSED",reason="Original Research OS gate CLOSED; replacement NOT_CONFIRMED. Faithful boundary disclosure is not a violation.",
        country="CROSS_MARKET",evidence_at=utc(f["finished_at"]))
    badclaims=False
    def inspect_claims(value):
        nonlocal badclaims
        if isinstance(value,dict):
            for k,v in value.items():
                if k in {"claims","claim_flags"} and isinstance(v,dict):
                    if any(v.get(flag,False) is not False for flag in pflags):
                        badclaims=True
                inspect_claims(v)
        elif isinstance(value,list):
            for item in value:
                inspect_claims(item)
    pflags=("inference_certified","market_claim_eligible","causal_claim_eligible","validated_alpha","trusted_graph","precise_edge_confidence")
    for alias in ("research_flagship","ledger_US","ledger_INDIA","model_US","model_INDIA"):
        inspect_claims(evidence.values[alias])
    add("R-RESEARCH-CLAIMS","publication-boundary",triggered=badclaims,aliases=("research_flagship","ledger_US","ledger_INDIA"),
        value=False,reason="All retained claim boundaries remain false; absent older fields provide no capability.",country="CROSS_MARKET")
    pluginopens=[x for x in registry["events"] if x["event"]=="HOLDOUT_OPENED"]
    add("R-RESEARCH-OPENING","phase2-registry",aliases=("plugin_registry",),value=len(pluginopens),
        evidence_class="RETAINED_SYNTHETIC",currency="HISTORICAL_ONLY",
        reason="Three historical v1 runs, one witnessed opening per run; no same-run reopen is inferred.")
    warnings=defaultdict(list)
    for run in registry["runs"]:
        for issue in run["issues"]:
            warnings[issue["id"]].append(dict(id=issue["id"],source="phase2-fixture",kind=issue["kind"],severity=issue["severity"],
                status=issue["status"],reason=issue["reason"],first_seen_at=None,last_seen_at=None,occurrences=1,evidence=[run["run_id"]]))
    for wid,origins in warnings.items():
        add("R-RESEARCH-FIXTURE-WARNING","phase2-family",triggered=True,aliases=("plugin_registry",),key=wid,
            evidence_class="RETAINED_SYNTHETIC",currency="HISTORICAL_ONLY",origins=origins,value=len(origins),
            reason="Two original retained repeated-family warnings; original HIGH severity preserved outside real incidents.")
    for rule,code,reason in [
        ("R-PORTFOLIO-MARKS","PUBLIC_BOOK_ABSENT","Public Replay has no real portfolio or immutable quoted-mark coverage contract."),
        ("R-PORTFOLIO-VAR","NO_PORTFOLIO_CONTRACT","No authenticated real public holdings, quoted marks and aligned returns/method contract."),
        ("R-PORTFOLIO-CVAR","NO_PORTFOLIO_CONTRACT","No retained public portfolio or tail convention contract."),
        ("R-PORTFOLIO-CONCENTRATION","HOLDINGS_CONTRACT_ABSENT","No explicit public holdings or concentration denominator contract."),
        ("R-PORTFOLIO-FACTORS","SECURITY_FACTOR_MAPPING_ABSENT","Retained MOM factor assessment has no security holdings mapping or weighting contract."),
        ("R-PORTFOLIO-LIQUIDITY","LIQUIDITY_EVIDENCE_ABSENT","No licensed portfolio liquidity and trading-size contract.")]:
        add(rule,"public-portfolio",availability="UNAVAILABLE",code=code,reason=reason,category="PORTFOLIO")
    add("R-SIMULATOR-DISAGREEMENT","real-strategies",availability="UNAVAILABLE",code="DEFERRED_PHASE9",
        reason="No compatible retained real strategy comparison. Dedicated Phase 9 evidence required; no engines are run.")
    comparisons=evidence.values["simulator_history"]["comparisons"]
    add("R-SIMULATOR-HISTORY","forge-certification",triggered=any(x["status"]!=x["expected_status"] for x in comparisons),
        aliases=("simulator_history",),evidence_class="RETAINED_SYNTHETIC",currency="HISTORICAL_ONLY",value="22 PASS / 1 NOT_COMPARABLE",
        reason="23 retained synthetic semantic comparisons. Intentional queue NOT_COMPARABLE is not disagreement.")
    add("R-SYSTEM-INTEGRITY","retained-bundle",value="VERIFIED",reason="All retained bytes, run joins and history chains verified.")
    add("R-SYSTEM-SWEEP","risk-workspace",value="VERIFIED",reason="Bounded retained-only evaluation; no provider or scientific calls.")
    if len(set(x["check_id"] for x in coverage))!=len(coverage):
        raise ValueError("Coverage slot collision")
    for c in coverage:
        Coverage.model_validate(c)
    return observations, coverage
