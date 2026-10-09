"""Kill actual guard/arithmetic mutations in isolated copies, without editing source."""
from __future__ import annotations
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.eval.canonical import canonical_sha256
from src.research_os.contracts import now

MUTATIONS=[
    ("dataset_substitution","runner.py","if run.dataset_hashes!=tuple(d.content_sha256 for d in spec.datasets):","if False:","test_runner.py"),
    ("seed_trial_parameter_omission","runner.py","if run.seed not in spec.seeds or run.parameters!=spec.parameters or run.trial_id not in spec.family.trial_ids:","if False:","test_runner.py"),
    ("split_test_substitution","runner.py","if run.split_hashes!=tuple(s.identity for s in spec.splits) or run.test_hashes!=tuple(t.identity for t in spec.tests):","if False:","test_runner.py"),
    ("artifact_hash_substitution","runner.py","if sha256_bytes(raw)!=artifact.payload_sha256:","if False:","test_runner.py"),
    ("family_trial_omission","multiple_testing.py","if set(outcomes)!=set(family.trial_ids):","if False:","test_statistics_reference.py"),
    ("cost_omission","costs.py","costs=turnover*bps/10000","costs=np.zeros_like(turnover)","test_workflow_guards.py"),
    ("future_signal_leakage","momentum.py",".shift(2).rolling(lookback-1",".shift(0).rolling(lookback-1","test_workflow_guards.py"),
    ("hmm_future_path_leakage","momentum.py","return np.asarray(probabilities)","return np.repeat(np.asarray(probabilities)[[-1]],len(probabilities),axis=0)","test_workflow_guards.py"),
    ("uncorrected_multiple_testing","multiple_testing.py","method={\"HOLM\":\"holm\",\"BH\":\"fdr_bh\"}[m]","method=\"bonferroni\"","test_statistics_reference.py"),
    ("sharpe_annualization_error","sharpe.py","(sr-benchmark)*np.sqrt(n-1)","(sr*np.sqrt(12)-benchmark)*np.sqrt(n-1)","test_statistics_reference.py"),
    ("revised_vintage_masquerade","contracts.py","if dataset.evidence_mode == \"CAPTURE_ONLY\" and split.clock != \"OBSERVATION_SEQUENCE_FIXED_VINTAGE\":","if False:","test_contracts.py"),
    ("target_as_feature","contracts.py","if self.dependent in (*self.independent, *self.controls):","if False:","test_contracts.py"),
]


def run():
    output=ROOT/"data/exports/research_os_v0_1/mutations.json"
    if output.exists(): raise ValueError("Mutation evidence exists; don't overwrite a measured run")
    scratch=ROOT/"data/exports/replay-source/research-mutations"
    scratch.mkdir(parents=True,exist_ok=True)
    rows=[]
    for name,file,old,new,test in [("baseline",None,None,None,None),*MUTATIONS]:
        folder=scratch/name;folder.mkdir(exist_ok=True)
        source=folder/"src";source.mkdir(exist_ok=True)
        (source/"__init__.py").write_text("__path__.append("+repr(str(ROOT/"src"))+")\n",encoding="utf-8")
        shutil.copytree(ROOT/"src/research_os",source/"research_os",dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("__pycache__"))
        if file:
            path=source/"research_os"/file;raw=path.read_text(encoding="utf-8")
            if raw.count(old)!=1: raise ValueError("Mutation target absent or ambiguous: "+name)
            path.write_text(raw.replace(old,new),encoding="utf-8")
        test_paths=[str(ROOT/"tests/research_os"/test)] if test else [str(ROOT/"tests/research_os")]
        junit=folder/"results.xml"
        env={**os.environ,"PYTHONPATH":str(folder)+os.pathsep+str(ROOT),"OPENBLAS_NUM_THREADS":"1","OMP_NUM_THREADS":"1"}
        arguments=["-q",*test_paths,"--tb=short","--basetemp="+str(folder/"pytest-temp"),"--junitxml="+str(junit)]
        # Import the shadow package before pytest adds the real tests' package root.
        bootstrap="import sys;sys.path.insert(0,"+repr(str(folder))+");import src.research_os.runner as r;assert "+repr(str(folder))+" in r.__file__;import pytest;raise SystemExit(pytest.main("+repr(arguments)+"))"
        result=subprocess.run([sys.executable,"-c",bootstrap],cwd=folder,
            env=env,capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=120)
        (folder/"pytest.log").write_text(result.stdout+result.stderr,encoding="utf-8")
        suites=ET.parse(junit).getroot().findall("testsuite")
        failures=sum(int(s.get("failures",0)) for s in suites);errors=sum(int(s.get("errors",0)) for s in suites)
        tests=sum(int(s.get("tests",0)) for s in suites)
        if errors or (name=="baseline" and result.returncode) or (name!="baseline" and (not failures or result.returncode!=1)):
            raise ValueError(f"Invalid/surviving mutation {name}; inspect {folder/'pytest.log'}")
        rows.append({"mutation":name,"file":file,"source_edit_hash":canonical_sha256({"old":old,"new":new}),
            "test_count":tests,"failures":failures,"errors":errors,"status":"BASELINE_PASS" if name=="baseline" else "KILLED"})
        print(name,rows[-1]["status"],failures,flush=True)
    payload={"started_protocol":"12 predeclared source mutations; isolated copies; baseline must pass, collection errors cannot count as kills",
        "code_commit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip(),
        "generated_at":now(),"mutants":rows,"killed":len(rows)-1,"total":len(MUTATIONS)}
    output.write_text(json.dumps(payload,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__": run()
