"""Read-only risk, archive, schema, count and lifecycle verification."""
from pathlib import Path
import json
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.risk_archive import verify
if __name__=="__main__":
    print(json.dumps(verify(ROOT),sort_keys=True,indent=2))
