"""Execute only the unchanged frozen tournament; no market or engine entry point."""
import argparse
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.research_os.calibration_v011.study import run


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("phase",choices=("discovery","confirmation","canary"))
    parser.add_argument("--resume",action="store_true")
    parser.add_argument("--workers",type=int,default=4)
    args=parser.parse_args()
    result=run(ROOT,args.phase,resume=args.resume,workers=args.workers)
    print(json.dumps({"status":result["status"],"phase":args.phase,"settings":len(next(iter(result["methods"].values()))),"candidates":list(result["methods"])},indent=2))
