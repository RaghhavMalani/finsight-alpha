"""Measured four-way verdicts. Failed calibration cannot support inference."""
from .contracts import Scorecard,Verdict


def scorecard(records,calibration):
    primary=[records[c+":PRIMARY"]["payload"] for c in ("US","INDIA")]
    calibrated=calibration["status"]=="CALIBRATED"
    def supports(key):
        r=records[key]["payload"];s=r["result"];p=r["correction"]["HOLM"]
        return s["status"]=="AVAILABLE" and p is not None and p<=.05 and s["ci_lower"]>0
    complete=all(p["result"]["status"]=="AVAILABLE" for p in primary)
    adequate=complete and all(p["power"]["power"]>=.8 for p in primary)
    statistical=(Verdict.UNAVAILABLE if not complete else Verdict.INCONCLUSIVE if not calibrated
        else Verdict.SUPPORTED if all(supports(c+":PRIMARY") for c in ("US","INDIA"))
        else Verdict.NOT_SUPPORTED if adequate else Verdict.INCONCLUSIVE)
    regime_keys=[c+":"+model for c in ("US","INDIA") for model in ("HMM","VOL_CLUSTER")]
    regime_complete=all(records[k]["payload"]["result"]["status"]=="AVAILABLE" for k in regime_keys)
    contrasts=all(records[k]["payload"]["correction"]["HOLM"] is not None and records[k]["payload"]["correction"]["HOLM"]<=.05 for k in regime_keys)
    specificity=not any(records[c+":"+v]["payload"]["correction"]["HOLM"] is not None and records[c+":"+v]["payload"]["correction"]["HOLM"]<=.05
        for c in ("US","INDIA") for v in ("WRONG_DIRECTION","SHUFFLED_REGIME_HMM","SHUFFLED_REGIME_VOL"))
    regime=(Verdict.UNAVAILABLE if not regime_complete else Verdict.SUPPORTED if calibrated and contrasts and specificity
        else Verdict.NOT_SUPPORTED if calibrated and all(records[k]["payload"]["power"]["power"]>=.8 for k in regime_keys)
        else Verdict.INCONCLUSIVE)
    return Scorecard(STATISTICAL=statistical,ECONOMIC=Verdict.UNAVAILABLE,
        REGIME_DEPENDENCE=regime,CROSS_MARKET=statistical,
        reasons=("Support requires both frozen country primaries after 46-trial Holm; underpowered negatives are inconclusive.",
            "Economic verdict unavailable: factors are not investable instruments; statutory Indian costs, borrow and spreads absent.",
            "Regime support requires four corrected contrasts and specificity controls; unavailable fits are retained.",
            "CAPTURE_ONLY — market factor, not a ticker. No historical-vintage PIT, causal or validated-alpha claim.",
            "Calibration status: "+calibration["status"]))
