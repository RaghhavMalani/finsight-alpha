import shutil
import pytest
from scripts import verify_research_os as verifier


def test_complete_frozen_evidence_preserves_closed_gate():
    result=verifier.verify()
    assert result["status"]=="VERIFIED"
    assert result["scientific_engine_gate"]=="CLOSED"
    assert result["trials"]==46 and result["holdout_openings"]==48


@pytest.mark.parametrize("name",["preregistration.json","calibration.json","flagship.json","repeatability.json"])
def test_stale_or_substituted_frozen_bytes_rejected(tmp_path,monkeypatch,name):
    destination=tmp_path/"frozen"
    shutil.copytree(verifier.FROZEN,destination)
    (destination/name).write_bytes(b"{}")
    monkeypatch.setattr(verifier,"FROZEN",destination)
    with pytest.raises(ValueError,match="Frozen byte substitution"):
        verifier.verify()


def test_full_replay_refuses_a_drifted_environment_before_recomputing(monkeypatch):
    """Sabotage: without the guard, version drift surfaces as a misleading input-hash mismatch."""
    import importlib.metadata as metadata
    real=metadata.version
    monkeypatch.setattr(metadata,"version",lambda name:"0.0.0" if name=="numpy" else real(name))
    def must_not_run(settings):
        raise AssertionError("calibration replayed in an unrecorded environment")
    monkeypatch.setattr(verifier,"calibrate",must_not_run)
    with pytest.raises(ValueError,match="Replay environment differs"):
        verifier.verify(full_calibration=True)
