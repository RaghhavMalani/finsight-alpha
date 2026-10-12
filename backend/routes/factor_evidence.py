"""Authenticated read-only evidence API. Local runtime is not installed."""
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from src import config
from src.factors.evidence import bundle
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
router=APIRouter(prefix='/factor-evidence',tags=['factor-evidence'])

@router.get('/{kind}')
def read_evidence(request:Request,kind:Literal['catalog','audit','ledger','lineage'],country:Literal['US','INDIA'],as_of:str|None=None):
    if config.APP_ENV=='production':raise HTTPException(503,'Local evidence API unavailable publicly; use checked Replay')
    org=getattr(request.state,'organization_id',None)
    if type(org) is not int or org<1 or not getattr(request.state,'user_id',None):raise HTTPException(401,'Authenticated organization required')
    try:bundle(ROOT,country,as_of)
    except LookupError as error:raise HTTPException(404,str(error)) from error
    except (ValueError,KeyError) as error:raise HTTPException(409,'Invalid retained metadata binding') from error
    # No local evidence is installed. No path discovery or database construction.
    raise HTTPException(404,'UNAVAILABLE: no reviewed tenant-local factor assessment is installed. Replay remains a separate explicit mode.')
