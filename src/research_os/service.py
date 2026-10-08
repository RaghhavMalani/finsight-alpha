"""Local application boundary around contracts, existing captures and truth ledger."""
from pathlib import Path
from .contracts import Preregistration,FreezeReceipt,OBJECT_TYPES
from .registry import Registry
from .preregistration import freeze
from .provenance import factor_snapshot,code_identity
from .momentum import prepare,evaluate
from .runner import execute


class ResearchService:
    def __init__(self,root:Path,registry:Registry,capture_root:Path):
        self.root,self.registry,self.capture_root=root,registry,capture_root

    def register(self,kind:str,payload:dict):
        if kind not in {"Paper","Hypothesis","DatasetSnapshot","FeatureDefinition","Split","TestDefinition","CostModel","TestingFamily","Preregistration"}:
            raise ValueError("Contract cannot be authored directly")
        return self.registry.put(OBJECT_TYPES[kind].model_validate(payload))

    def freeze(self,identity:str):
        spec=self.registry.get(identity)
        if not isinstance(spec,Preregistration): raise ValueError("Freeze requires preregistration")
        commit,_=code_identity(self.root)
        return freeze(self.registry,spec,commit)

    def run(self,receipt_hash:str,trial_id:str,seed:int,*,cache=None):
        receipt=self.registry.get(receipt_hash)
        if not isinstance(receipt,FreezeReceipt): raise ValueError("Invalid freeze receipt")
        spec=self.registry.get(receipt.preregistration_hash)
        def compute(run):
            from src.replay.factors import checked_capture,SOURCE_URLS
            country,variant=trial_id.split(":")
            index=next(i for i,d in enumerate(spec.datasets) if d.country==country)
            source_key=("source",spec.datasets[index].identity)
            if cache is not None and source_key in cache:
                series,snapshot=cache[source_key]
                for meta in series.provenance["source_captures"]:
                    name=next(name for name,url in SOURCE_URLS.items() if url==meta["source_url"])
                    _,current=checked_capture(self.capture_root,name,meta["source_url"],snapshot.input_cutoff)
                    if current!=meta: raise ValueError("Source metadata changed after freeze")
            else:
                series,snapshot=factor_snapshot(self.capture_root,country,spec.datasets[index].input_cutoff)
                if cache is not None: cache[source_key]=(series,snapshot)
            if snapshot!=spec.datasets[index]: raise ValueError("Capture bytes/provenance changed after freeze")
            cache_key=(snapshot.identity,spec.identity)
            if cache is not None and cache_key in cache: monthly,metadata=cache[cache_key]
            else:
                monthly,metadata=prepare(series.frame,spec.splits[index],spec.parameters)
                if cache is not None: cache[cache_key]=(monthly,metadata)
            return evaluate(monthly,metadata,spec,index,variant,seed)
        return execute(self.registry,spec,receipt,self.root,trial_id=trial_id,seed=seed,compute=compute)
