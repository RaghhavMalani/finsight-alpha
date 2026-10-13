"""Explicit retained-only operator sweep; no network, refresh, scientific flags."""
from pathlib import Path
import argparse
import json
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.risk_manager.sweep import run

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope",choices=["risk"],default="risk")
    args=parser.parse_args()
    result=run(ROOT)
    print(json.dumps(result,sort_keys=True,indent=2))
    return 1 if result["status"]=="FAILED" else 0

if __name__=="__main__":
    raise SystemExit(main())
