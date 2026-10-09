"""Export an actual-result forest plot, retaining the unavailable original row."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
study=json.loads((ROOT/"data/exports/research_os_v0_1/flagship.json").read_text())
rows=[("Original empirical paper — UNAVAILABLE",None)]
for country in ("US","INDIA"):
    for variant,label in (("PRIMARY","Net factor-neutral intercept"),("HMM","HMM low-vol contrast"),("VOL_CLUSTER","Volatility-cluster contrast")):
        rows.append((country+" · "+label,study["records"][country+":"+variant]["payload"]["result"]))
plt.rcParams.update({"font.family":"DejaVu Sans","font.size":10})
fig,ax=plt.subplots(figsize=(11,5.8),layout="constrained")
fig.patch.set_facecolor("#f8f7f3");ax.set_facecolor("#f8f7f3")
for y,(label,result) in enumerate(rows):
    if result is None:
        ax.text(0,y,"No original empirical result or dataset supplied",va="center",color="#777777",fontsize=9)
        continue
    effect=result["estimate"]*100;lo=result["ci_lower"]*100;hi=result["ci_upper"]*100
    ax.errorbar(effect,y,xerr=[[effect-lo],[hi-effect]],fmt="o",capsize=4,
        color="#b47715" if label.startswith("US") else "#244d73")
ax.axvline(0,color="#666666",linewidth=.8,linestyle="--")
ax.set_yticks(range(len(rows)),[r[0] for r in rows]);ax.invert_yaxis()
ax.set_xlabel("Monthly proportional factor-return effect (%) · asymptotic HAC 95% interval")
ax.set_title("Regime-dependent 12–1 market-factor momentum\nNOT_CALIBRATED · diagnostic estimates only",loc="left",fontweight="bold",pad=18)
ax.spines[["top","right","left"]].set_visible(False);ax.tick_params(axis="y",length=0)
fig.supxlabel("CAPTURE_ONLY · market factor, not a ticker · revised snapshot, no historical-vintage PIT or alpha claim",fontsize=9)
destination=ROOT/"docs/findings/momentum-regimes-forest.png"
destination.parent.mkdir(parents=True,exist_ok=True)
fig.savefig(destination,dpi=170)
print(destination)
