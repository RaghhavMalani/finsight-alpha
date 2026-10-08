"""Authenticated local Research OS. Public inspection uses static checked artifacts."""
import base64
from pathlib import Path
from fastapi import APIRouter,HTTPException,Request
from pydantic import BaseModel,ConfigDict,Field
from src.config import APP_ENV,EXPORTS_DIR
from src.research_os.registry import Registry
from src.research_os.service import ResearchService
from src.research_os.papers import import_paper
from src.research_os.runner import bind_truth_ledger,read_artifact

router=APIRouter(prefix="/research-os",tags=["research-os"])


def service(request:Request):
    if APP_ENV=="production": raise HTTPException(503,"Research authoring/compute is local only; use checked Replay artifacts")
    org=getattr(request.state,"organization_id",None)
    if not org or not getattr(request.state,"user_id",None): raise HTTPException(401,"Authenticated organization required")
    registry=Registry(EXPORTS_DIR/"research_os"/str(org)/"runtime.db",org)
    return ResearchService(Path(__file__).resolve().parents[2],registry,EXPORTS_DIR/"replay-source")


class RegisterRequest(BaseModel):
    model_config=ConfigDict(extra="forbid")
    kind:str
    payload:dict


class RunRequest(BaseModel):
    model_config=ConfigDict(extra="forbid")
    receipt_hash:str=Field(pattern=r"^[a-f0-9]{64}$")
    trial_id:str
    seed:int


class PaperImport(BaseModel):
    model_config=ConfigDict(extra="forbid")
    filename:str=Field(max_length=200)
    data_base64:str=Field(max_length=13_333_336)
    title:str
    authors:tuple[str,...]
    source_url:str


def checked(action):
    try: return action()
    except (ValueError,StopIteration,FileNotFoundError) as exc: raise HTTPException(422,str(exc)) from exc


@router.post("/objects")
def register(request:Request,body:RegisterRequest):
    svc=service(request)
    return checked(lambda:{"identity":svc.register(body.kind,body.payload)})


@router.get("/objects/{identity}")
def inspect(request:Request,identity:str):
    svc=service(request)
    return checked(lambda:svc.registry.get(identity).model_dump(mode="json"))


@router.post("/papers")
def paper(request:Request,body:PaperImport):
    svc=service(request)
    def action():
        from src.eval.canonical import sha256_bytes
        raw=base64.b64decode(body.data_base64,validate=True)
        if len(raw)>10_000_000: raise ValueError("Paper exceeds 10MB import limit")
        suffix=Path(body.filename).suffix.lower()
        if suffix not in {".pdf",".txt",".docx"}: raise ValueError("Unsupported paper format")
        destination=svc.registry.path.parent/"papers"/(sha256_bytes(raw)+suffix)
        destination.parent.mkdir(exist_ok=True)
        try:
            with destination.open("xb") as stream: stream.write(raw)
        except FileExistsError:
            if destination.read_bytes()!=raw: raise ValueError("Paper source substitution")
        obj=import_paper(destination,title=body.title,authors=body.authors,source_url=body.source_url)
        return {"identity":svc.registry.put(obj),"extraction_status":obj.extraction_status}
    return checked(action)


@router.post("/freeze/{identity}")
def freeze(request:Request,identity:str):
    svc=service(request)
    return checked(lambda:svc.freeze(identity).model_dump(mode="json"))


@router.post("/run")
def run(request:Request,body:RunRequest):
    svc=service(request)
    return checked(lambda:svc.run(body.receipt_hash,body.trial_id,body.seed))


@router.get("/attempts")
def attempts(request:Request):
    return service(request).registry.events()


@router.get("/artifacts/{identity}")
def artifact(request:Request,identity:str,run_hash:str):
    return checked(lambda:read_artifact(service(request).registry,identity,run_hash))


@router.post("/truth/{attempt}/{artifact_hash}")
def bind(request:Request,attempt:str,artifact_hash:str):
    svc=service(request)
    return checked(lambda:bind_truth_ledger(svc.registry,attempt=attempt,artifact_hash=artifact_hash,user_id=request.state.user_id))
