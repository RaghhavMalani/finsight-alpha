"""Actual confirmation heatmaps, with every declared DGP and sample size visible."""
import json
from pathlib import Path
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.research_os.calibration_v011.protocol import load


def plot():
    p=load(ROOT);folder=ROOT/"data/exports/research_os_v0_1_1"
    result=json.loads((folder/"confirmation.json").read_bytes())
    method=next(iter(result["methods"]));rows=result["methods"][method]
    names=list(dict.fromkeys(s["id"].rsplit("_n",1)[0] for s in p["settings"]))
    matrices=[]
    for key in ("size","coverage","power"):
        data=np.zeros((len(names),3))
        for i,name in enumerate(names):
            for j,n in enumerate(p["sample_sizes"]):
                row=rows[f"{name}_n{n}"]
                if row.get("failed_worlds"): data[i,j]=np.nan;continue
                data[i,j]=(max(row["greater_size_upper"],row["two_sided_size_upper"]) if key=="size"
                    else row["coverage_lower"] if key=="coverage" else row["power"][2]["greater"])
        matrices.append(data)
    fig,axes=plt.subplots(1,3,figsize=(12.7,7.4),sharey=True)
    titles=["Simultaneous size upper bound\nrequired <= 7%","Simultaneous coverage lower bound\nrequired >= 92%","Greater-tail power at effect 0.2\ndiagnostic; pointwise intervals in records"]
    for ax,data,title,lo,hi in zip(axes,matrices,titles,[0,.85,0],[.15,1,1]):
        ax.imshow(data,cmap="Blues",vmin=lo,vmax=hi,aspect="auto")
        ax.set_xticks(range(3),[str(n) for n in p["sample_sizes"]]);ax.set_xlabel("Sample size")
        ax.set_yticks(range(len(names)),[name.replace("_"," ") for name in names])
        ax.set_title(title,fontsize=9,pad=12)
        for i in range(len(names)):
            for j in range(3):
                value=data[i,j];text="unavailable" if not np.isfinite(value) else f"{100*value:.1f}%"
                failure=(ax is axes[0] and value>.07) or (ax is axes[1] and value<.92)
                ax.text(j,i,text,ha="center",va="center",fontsize=9,color="#b42318" if failure else "#111827",fontweight="bold" if failure else "normal")
    fig.suptitle(f"{result['status']} · {method}\nUntouched confirmation: 5,000 worlds per setting · SYNTHETIC CALIBRATION",fontsize=12,fontweight="bold")
    fig.text(.03,.025,"Exact Bonferroni binomial bounds; bias gate and full curves retained separately. Scope: frozen DGPs only.\nResearch OS v0.1 remains NOT_CALIBRATED and permanently CLOSED. No market replication or engine authorization.",fontsize=9)
    fig.tight_layout(rect=(0,.085,1,.91))
    path=ROOT/"docs/findings/inference-calibration-v0.1.1.png"
    fig.savefig(path,dpi=180);plt.close(fig)
    return path


if __name__=="__main__": print(plot())
