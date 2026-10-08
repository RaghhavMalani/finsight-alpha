"""Freeze Phase 4 definitions only. This script does not compute study outcomes."""
from __future__ import annotations
import json
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.eval.canonical import canonical_json_bytes, canonical_sha256
from src.research_os.contracts import (Hypothesis, FeatureDefinition, Split, TestDefinition,
    CostModel, TestingFamily, Preregistration)
from src.research_os.provenance import factor_snapshot
from src.research_os.preregistration import freeze
from src.research_os.registry import Registry

VARIANTS = ("BASELINE", "PRIMARY", "HMM", "VOL_CLUSTER", "WRONG_DIRECTION",
    "SHUFFLED_REGIME_HMM", "SHUFFLED_REGIME_VOL", "RANDOM_SIGNAL", "SHUFFLED_DATES",
    "PERMUTED_OUTCOME", "NO_CONTROLS", "WINDOW_6_1", "WINDOW_9_1", "WITHOUT_2008",
    "WITHOUT_2020", "FIRST_HALF", "SECOND_HALF", "COST_0", "COST_10", "COST_25",
    "COST_50", "COST_100", "SECTOR_OUT")


def build_spec():
    cutoff = "2026-10-08T04:10:00Z"
    datasets = tuple(factor_snapshot(ROOT/"data/exports/replay-source", c, cutoff)[1]
                     for c in ("US", "INDIA"))
    clock = "OBSERVATION_SEQUENCE_FIXED_VINTAGE"
    split = lambda a,b,c,d,e,f: Split(train_start=a,train_end=b,validation_start=c,
        validation_end=d,holdout_start=e,holdout_end=f,purge_months=12,embargo_months=12,clock=clock)
    return Preregistration(
        hypothesis=Hypothesis(name="Regime-dependent 12–1 market-factor momentum: US versus India",
            null="Net factor-neutral monthly mean <= 0; regime contrast = 0; no two-country replication",
            alternative="Positive net monthly intercept in both countries with nonzero regime contrasts",
            direction="greater", universe=("US-MKT", "IN-MKT"), dependent="future_month_strategy_return",
            independent=("momentum_12_1", "hmm_low_vol", "vol_cluster"),
            controls=("MKT", "SMB", "HML", "MOM"), primary_endpoint="Holdout net factor-neutral monthly intercept",
            falsification=("Primary corrected p > .05 or nonpositive interval prevents support",
                "No regime contrast after Holm prevents regime-dependence support",
                "Wrong-direction or shuffled-regime result passing Holm invalidates claimed specificity",
                "Insufficient power makes a negative result inconclusive, not demonstrated absence",
                "No sector panel or investable factor portfolio makes sector/economic claims unavailable"),
            interpretation="RESEARCHER_EXTENSION"), datasets=datasets,
        features=(FeatureDefinition(name="momentum_12_1",sources=("MKT",),
            formula="At start of month t: product(1+MKT_month[t-12:t-1])-1; excludes t-1; 11 complete months. sign gives -1/0/+1. Monthly rebalance.",
            lag_months=2,lookback_months=12,clock=clock),
            FeatureDefinition(name="hmm_low_vol",sources=("MKT",),
                formula="Existing HMM trainer on train-only monthly log market return and trailing 3-month RMS; 2 full-covariance states, seed 1729,100 iterations. Label by TRAIN variance; forward filtering only through t-1. No refit, no Viterbi/smoothing future paths.",
                lag_months=1,lookback_months=3,clock=clock),
            FeatureDefinition(name="vol_cluster",sources=("MKT",),
                formula="Existing D0.4.2 volatility_path at daily frequency (annual=252); prior-month last state == VOL_CLUSTER. Frozen heuristic, no inferred probability; other resolved states form complement.",
                lag_months=1,lookback_months=6,clock=clock)),
        splits=(split("1927-07","1969-12","1971-01","1999-12","2001-01","2026-08"),
                split("1994-10","2003-12","2005-01","2006-12","2008-01","2025-12")),
        tests=(TestDefinition(method="HAC",alternative="greater",alpha=.05,hac_lags=6,
                    block_length=6,resamples=1999,assumptions=("Weakly stationary monthly errors; finite moments; no causal interpretation",)),
            TestDefinition(method="BLOCK_BOOTSTRAP",alternative="two-sided",alpha=.05,hac_lags=6,
                    block_length=6,resamples=1999,assumptions=("Circular moving blocks length 6, centered-null regression coefficient bootstrap",)),
            TestDefinition(method="PERMUTATION",alternative="two-sided",alpha=.05,hac_lags=6,
                    block_length=6,resamples=1999,assumptions=("Circular outcome shifts, conditional stationarity/exchangeability only; descriptive diagnostic",))),
        costs=tuple(CostModel(name=c+" assumed factor costs",scope="HYPOTHETICAL_FACTOR_SENSITIVITY",
            commission_bps=0,spread_bps=bps,statutory_bps=0,frontier_bps=(0,10,25,50,100),
            rationale="Assumed per-unit change in signed exposure; initial entry and final liquidation counted. Not statutory/investable costs; factor captures provide no instrument, spread, borrow or Indian fee evidence.")
            for c,bps in (("US",10),("INDIA",25))),
        family=TestingFamily(name="All frozen country/variant endpoint tests",
            trial_ids=tuple(c+":"+v for c in ("US","INDIA") for v in VARIANTS),
            dependence_disclosure="46 correlated variants and shared-factor markets. No defensible independent trial count; PSR/DSR diagnostic formulas only, inferential DSR unavailable."),
        seeds=(1729,2718,31415,20261008), minimum_effect=.002, prospective_sigma=.05,
        acceptance="Support statistical/cross-market only when BOTH primary Holm p<=.05 and 95% CI lower>0; regime support requires BOTH models in BOTH markets after Holm and failed shuffled-regime/wrong-direction specificity controls. Economic unavailable for market-factor-only inputs. Negatives below 80% prospective power are inconclusive.",
        parameters={"variants":list(VARIANTS), "monthly_aggregation":"product(1+daily factor)-1 independently per column; RF excluded from excess-market strategy",
            "missingness":"No imputation; exclude incomplete calendar-boundary month and any month missing a required factor; join by month, never positions",
            "hmm_states":2,"hmm_iterations":100,"hmm_seed":1729,"hmm_convergence":"Require absolute final likelihood increment < .01; failure stays unavailable, no alternate fit/seed",
            "regime_endpoint":"HAC coefficient of prior-month binary regime controlling contemporaneous French/IIMA factors; two-sided; no conditioning-model/threshold selection",
            "primary_endpoint":"HAC constant of signal*MKT - bps/10000*abs(position change), controlling contemporaneous MKT/SMB/HML/MOM; alpha is descriptive regression intercept, not validated alpha",
            "timing":"Features stop at t-1 or earlier; trade exposure fixed before first session of t. CAPTURE_ONLY: this is observation-sequence causality within revised data, not historical availability",
            "validation":"Diagnostics only; no parameter selection or threshold tuning",
            "placebos":"Wrong direction flips signal BEFORE recomputing turnover/costs; shuffled regimes use one frozen random permutation (IID-exchangeability diagnostic); random signs equiprobable +/-1; shuffled dates/permuted outcomes use circular shifts preserving order",
            "robustness":"6-1 and 9-1 momentum, no controls, cost grid, exclude 2008 or 2020 without refitting features, chronological holdout halves; sector exclusion unavailable without a security panel",
            "replication":"EXACT means only computational rerun, not original paper replication. Temporal halves within-country; cross-market units monthly proportional excess-factor returns, differing calendars/costs/sources explicitly recorded",
            "power":"Prospective .002 monthly effect, .05 sigma, AR1=.3 assumed; effective n = n*(1-rho)/(1+rho); not observed-power evidence",
            "calibration":{"worlds":1000,"seed":20261008,"n":240,"burn":100,"alpha":.05,
                "resamples":199,"hac_lags":6,"block_length":6,"planted_effect":.35,
                "cases":["welch_iid","paired_iid","bootstrap_iid","permutation_iid","hac_iid","hac_ar1","block_ar1","regression_ar1"],
                "ar1":.3,"null_acceptance":"Nominal .05 MUST lie inside the 95% Wilson CI for every supported case; no post-hoc widening or rerun",
                "power_acceptance":"Every planted-power 95% Wilson lower bound >= .80",
                "family_acceptance":"Holm global-null FWER 95% upper <= .075; BH global-null FDR 95% upper <= .075",
                "canary_worlds":32,"canary_status":"Infrastructure check only; cannot earn CALIBRATED or replace 1000-world evidence"}})


if __name__ == "__main__":
    destination=ROOT/"data/exports/research_os_v0_1"
    if (destination/"preregistration.json").exists():
        raise SystemExit("Already frozen; refusal to overwrite or amend after outcomes")
    spec=build_spec()
    commit=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
    registry=Registry(ROOT/"data/exports/replay-source/research-os.db",1)
    receipt=freeze(registry,spec,commit)
    destination.mkdir(parents=True,exist_ok=True)
    (destination/"preregistration.json").write_bytes(canonical_json_bytes(spec.model_dump(mode="json"))+b"\n")
    (destination/"freeze-receipt.json").write_bytes(canonical_json_bytes(receipt.model_dump(mode="json"))+b"\n")
    (destination/"identities.json").write_text(json.dumps({"preregistration_hash":spec.identity,
        "freeze_receipt_hash":receipt.identity,"calibration_settings_hash":canonical_sha256(spec.parameters["calibration"])},indent=2)+"\n",encoding="utf-8")
    print(spec.identity,receipt.frozen_at)
