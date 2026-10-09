"""Render all frozen outcomes; performs no inference or candidate selection."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def report():
    folder=ROOT/"data/exports/research_os_v0_1_1"
    p=json.loads((folder/"preregistration.json").read_bytes())
    selected=json.loads((folder/"selection.json").read_bytes())
    confirmation=json.loads((folder/"confirmation.json").read_bytes())
    method=selected["selection"]["selected"];rows=confirmation["methods"][method]
    passed=sum(r["accepted"] for r in rows.values())
    failed=[key for key,r in rows.items() if not r["accepted"]]
    failures={key:[name for name,test in (("greater size",r.get("greater_size_upper",1)>.07),
        ("two-sided size",r.get("two_sided_size_upper",1)>.07),("coverage",r.get("coverage_lower",0)<.92),
        ("bias",r.get("standardized_bias_upper",1)>.10),("invalid worlds",bool(r.get("failed_worlds",0)))) if test]
        for key,r in rows.items() if not r["accepted"]}
    summary={"status":confirmation["status"],"selected":method,"settings_passed":passed,"settings_total":len(rows),
        "failed_settings":failures,"discovery_worlds":30000,"discovery_method_worlds":120000,
        "confirmation_null_worlds":150000,"confirmation_planted_evaluations":450000,
        "old_gate":"PERMANENTLY_CLOSED","market_replication_authorized":False,"engine_authorized":False}
    with (folder/"summary.json").open("xb") as f:f.write((json.dumps(summary,sort_keys=True,indent=2)+"\n").encode())
    lines=["# The separate inference calibration study: "+confirmation["status"],"",
        f"The predeclared discovery rule selected **{method}**. Untouched confirmation passed **{passed}/30 settings** under the simultaneous practical gate. "+
        ("The selected replacement is not certified; no fallback candidate was tested on confirmation." if failed else "The method is confirmed only for the frozen synthetic DGPs and settings, pending review."),"",
        "Research OS v0.1 remains permanently **NOT_CALIBRATED / CLOSED**. No original outcome, momentum study or gate was replaced. VectorBT and a market replication remain unauthorized.","",
        "## Discovery is selection, not certification","",
        "Four methods were predeclared before outcomes; 1,000 worlds per setting cover 30 settings. The fixed rule ranks point-size/coverage/bias violations, then power, worst null size and declared order. All four had discovery violations. No candidates, bandwidths or seeds were added after seeing results.","",
        "| Candidate | Point violations | Worst null size | Average greater-tail power over .1/.2/.4 |","|---|---:|---:|---:|"]
    for r in selected["selection"]["ranking"]:
        lines.append(f"| {r['method']} | {r['point_violations']} | {100*r['worst_null_size']:.1f}% | {100*r['average_greater_power']:.1f}% |")
    lines += ["","The power average above is solely the frozen selection statistic across these settings/effects, not an applicable market probability. The selection receipt was committed before any confirmation world; it was not replaced after confirmation.","",
        "## Untouched confirmation","",
        "The selected method alone was evaluated on 5,000 seed-disjoint worlds per setting: 150,000 null worlds and 450,000 planted-effect evaluations. The effect grid shares each world's errors/controls through declared location equivariance; those three planted shifts are not three independent input corpora.","",
        "Greater and two-sided Type-I error upper bounds must each be <=7%; nominal 95% interval coverage lower bounds must be >=92%. Ninety one-sided exact Clopper-Pearson bounds use Bonferroni family alpha .04. Standardized absolute coefficient bias plus the separately allocated Monte Carlo t margin must be <=.10 in every setting. That bias margin is approximate under non-Gaussian worlds. All worlds, including failures, remain recorded.","",
        "![Every confirmation setting](inference-calibration-v0.1.1.png)","",
        "| Setting | Greater size | Two-sided size | Worse size UCB | CI coverage | Coverage LCB | Bias upper / SD | Reported SE / empirical SD | Power .1 / .2 / .4 | Gate |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---|---|"]
    for setting in p["settings"]:
        key=setting["id"];r=rows[key]
        if r.get("failed_worlds"):
            lines.append(f"| {key} | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | CLOSED |");continue
        power=" / ".join(f"{100*v['greater']:.1f}%" for v in r["power"][1:])
        lines.append(f"| {key} | {100*r['greater_size']:.2f}% | {100*r['two_sided_size']:.2f}% | {100*max(r['greater_size_upper'],r['two_sided_size_upper']):.2f}% | {100*r['coverage']:.2f}% | {100*r['coverage_lower']:.2f}% | {r['standardized_bias_upper']:.3f} | {r['reported_se_over_empirical_sd']:.3f} | {power} | {'PASS' if r['accepted'] else 'FAIL'} |")
    lines += ["","Both full power curves, pointwise exact intervals, raw coefficient bias/MCSE, both SE/SD ratios, every per-world result and all individual gates are retained in the frozen exports. Pointwise power intervals are descriptive and are not simultaneous certification. Bootstrap null-restricted p-values and unrestricted bootstrap-t intervals were independently assessed, without claiming exact inversion.","",
        "## Provenance and limits","",
        "Preregistration commit `3c16fe0` and its receipt precede outcomes. Discovery calculation commit `bc12939`; selection commit `9af78e6`; confirmation execution commit `39a30ac`. Each outcome carries its actual code/environment identity, input-data hashes and declared seed domains. Integer seeds exceed 2^256 and are disjoint from v0.1 and from the other phase. Method/DGP/metric/selector/seed and world-computation code remains unchanged between phases.","",
        "A pre-confirmation command was rejected before opening worlds because sorted JSON row ordering changed a discovery audit average by one floating-point bit. A sealed guard-only correction restores the declared setting order and reproduces the original selection receipt exactly; all original evidence and the rejected command remain. A separate cross-library read-only check measured at most 6.4116e-15 arithmetic differences, with zero count/decision changes. Its 1e-12 comparison cap never relaxes artifact hashes, counts, selections, acceptance thresholds or gate decisions.","",
        "These are **SYNTHETIC_CALIBRATION** worlds, not market returns, historical-vintage evidence or alpha. Error processes are stationary Gaussian/t5 AR and declared GARCH/control-dependent heteroskedastic cases at n=120/240/480, targeting an intercept with zero or two controls. Calibration outside those definitions is unestablished. No post-confirmation fallback, method repair, new source or market experiment was run.","",
        "See [the full frozen design](../research-os-v0.1.1-inference-calibration.md) and `data/exports/research_os_v0_1_1/manifest.json` for identities and byte seals. The next action is review of this separate inference gate; the old closed gate is never reopened."]
    path=ROOT/"docs/findings/inference-calibration-v0.1.1.md"
    with path.open("x",encoding="utf-8",newline="\n") as f:f.write("\n".join(lines)+"\n")
    print(json.dumps(summary,indent=2))


if __name__=="__main__": report()
