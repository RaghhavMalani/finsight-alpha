"""Authenticated GET-only risk evidence; static Replay is the public surface."""
from pathlib import Path
from typing import Literal
from fastapi import APIRouter,HTTPException,Request
from src import config
from src.risk_manager.service import read
ROOT=Path(__file__).resolve().parents[2]
router=APIRouter(prefix="/risk-manager",tags=["risk-manager"])
@router.get("/{kind}")
def evidence(request:Request,kind:Literal["state","sweep"],sweep_id:str|None=None):
    if config.APP_ENV=="production":
        raise HTTPException(503,"Local risk API unavailable publicly; use checked Replay")
    org=getattr(request.state,"organization_id",None)
    if type(org) is not int or org<1 or not getattr(request.state,"user_id",None):
        raise HTTPException(401,"Authenticated organization required")
    if set(request.query_params)-{"sweep_id"} or len(request.query_params.getlist("sweep_id"))>1:
        raise HTTPException(422,"Only one listed retained sweep selector is allowed")
    try:
        return read(ROOT,kind,sweep_id)
    except LookupError as exc:
        raise HTTPException(404,str(exc)) from exc
    except (ValueError,KeyError,FileNotFoundError) as exc:
        raise HTTPException(409,"Risk evidence verification failed; no empty success or computation fallback") from exc
