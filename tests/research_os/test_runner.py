import pytest
from src.research_os.contracts import Run,Preregistration,FreezeReceipt
from src.research_os.registry import Registry
from src.research_os.preregistration import freeze
from src.research_os.runner import validate_run,execute,read_artifact


def registered_run(spec,receipt):
    return Run(hypothesis_hash=spec.hypothesis.identity,preregistration_hash=spec.identity,
        freeze_receipt_hash=receipt.identity,code_commit="c"*40,code_sha256="d"*64,
        dataset_hashes=tuple(d.content_sha256 for d in spec.datasets),
        split_hashes=tuple(s.identity for s in spec.splits),test_hashes=tuple(t.identity for t in spec.tests),
        seed=123,trial_id="primary",parameters=spec.parameters,environment={"test":True})


@pytest.mark.parametrize("field,value",[("hypothesis_hash","e"*64),
    ("preregistration_hash","e"*64),("freeze_receipt_hash","e"*64),
    ("dataset_hashes",("e"*64,)),("split_hashes",("e"*64,)),
    ("test_hashes",("e"*64,)),("seed",999),("trial_id","omitted"),
    ("parameters",{"window":6})])
def test_run_binding_sabotage(spec,field,value):
    receipt=FreezeReceipt(preregistration_hash=spec.identity,frozen_at="2020-01-04T00:00:00Z",code_commit="a"*40)
    run=registered_run(spec,receipt)
    validate_run(spec,receipt,run)
    with pytest.raises(ValueError): validate_run(spec,receipt,run.model_copy(update={field:value}))


def test_execution_precedes_computation_and_retains_failed_attempts(tmp_path,spec,monkeypatch):
    registry=Registry(tmp_path/"records.db",1);receipt=freeze(registry,spec,"a"*40)
    monkeypatch.setattr("src.research_os.runner.code_identity",lambda root:("b"*40,"c"*64))
    monkeypatch.setattr("src.research_os.runner.environment",lambda:{"fixture":True})
    def compute(run):
        assert registry.events()[-1]["kind"]=="HOLDOUT_OPEN"
        return {"estimate":.123,"preregistration":run.preregistration_hash}
    one=execute(registry,spec,receipt,tmp_path,trial_id="primary",seed=123,compute=compute)
    two=execute(registry,spec,receipt,tmp_path,trial_id="primary",seed=123,compute=compute)
    assert one["payload"]==two["payload"] and one["attempt"]!=two["attempt"]
    assert registry.holdout_openings(spec.identity)==2
    assert read_artifact(registry,one["artifact_hash"],one["run_hash"])==one["payload"]
    with pytest.raises(ValueError): read_artifact(registry,one["artifact_hash"],"f"*64)
    with pytest.raises(ValueError): execute(registry,spec,receipt,tmp_path,trial_id="primary",seed=999,compute=compute)
    assert registry.events()[-1]["kind"]=="ERROR"
    assert registry.holdout_openings(spec.identity)==2
    def fail(run): raise RuntimeError("Frozen computation failed")
    with pytest.raises(RuntimeError): execute(registry,spec,receipt,tmp_path,trial_id="placebo",seed=123,compute=fail)
    assert registry.events()[-1]["kind"]=="ERROR"
    assert registry.holdout_openings(spec.identity)==3
    path=registry.path.parent/"research-artifacts"/one["artifact"]["payload_sha256"]
    path.write_bytes(b"{}")
    with pytest.raises(ValueError,match="bytes changed"): read_artifact(registry,one["artifact_hash"],one["run_hash"])


def test_freeze_receipt_cannot_be_invented(tmp_path,spec,monkeypatch):
    registry=Registry(tmp_path/"records.db",1)
    receipt=FreezeReceipt(preregistration_hash=spec.identity,frozen_at="2020-01-04T00:00:00Z",code_commit="a"*40)
    registry.put(receipt)
    with pytest.raises(ValueError,match="server receipt"):
        execute(registry,spec,receipt,tmp_path,trial_id="primary",seed=123,compute=lambda run:{})


def test_model_copy_cannot_bypass_registry_validation(tmp_path,spec):
    registry=Registry(tmp_path/"records.db",1)
    invalid=spec.model_copy(update={"costs":()})
    with pytest.raises(ValueError): registry.put(invalid)
