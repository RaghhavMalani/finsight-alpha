"""Explicit metadata export; never capture, compute, calibrate or open a holdout."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.factors.publication import export
if __name__=='__main__':
    if len(sys.argv)!=1:raise SystemExit('No compute, capture, refresh, network or runtime options exist')
    print(json.dumps(export(ROOT),sort_keys=True))
