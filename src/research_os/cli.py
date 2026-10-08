"""Executable local Paper -> register -> freeze -> run -> inspect workflow."""
import argparse
import json
from pathlib import Path
from src.config import EXPORTS_DIR
from .registry import Registry
from .service import ResearchService
from .papers import import_paper
from .runner import read_artifact


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization",type=int,required=True)
    parser.add_argument("--registry",type=Path,default=EXPORTS_DIR/"research_os/runtime.db")
    sub=parser.add_subparsers(dest="command",required=True)
    author=sub.add_parser("register");author.add_argument("kind");author.add_argument("json",type=Path)
    paper=sub.add_parser("import-paper");paper.add_argument("path",type=Path);paper.add_argument("--title",required=True)
    paper.add_argument("--author",action="append",required=True);paper.add_argument("--source-url",required=True)
    frozen=sub.add_parser("freeze");frozen.add_argument("identity")
    run=sub.add_parser("run");run.add_argument("receipt");run.add_argument("trial");run.add_argument("--seed",type=int,required=True)
    inspect=sub.add_parser("inspect");inspect.add_argument("identity")
    artifact=sub.add_parser("artifact");artifact.add_argument("identity");artifact.add_argument("--run",required=True)
    sub.add_parser("attempts")
    args=parser.parse_args();registry=Registry(args.registry,args.organization)
    service=ResearchService(Path(__file__).resolve().parents[2],registry,EXPORTS_DIR/"replay-source")
    if args.command=="register": result={"identity":service.register(args.kind,json.loads(args.json.read_text(encoding="utf-8")))}
    elif args.command=="import-paper":
        obj=import_paper(args.path,title=args.title,authors=tuple(args.author),source_url=args.source_url)
        result={"identity":registry.put(obj),"extraction_status":obj.extraction_status}
    elif args.command=="freeze": result=service.freeze(args.identity).model_dump(mode="json")
    elif args.command=="run": result=service.run(args.receipt,args.trial,args.seed)
    elif args.command=="inspect": result=registry.get(args.identity).model_dump(mode="json")
    elif args.command=="artifact": result=read_artifact(registry,args.identity,args.run)
    else: result=registry.events()
    print(json.dumps(result,indent=2,allow_nan=False))


if __name__=="__main__": main()
