"""Exact retained file readers. No runtime discovery or writable registries."""
from __future__ import annotations
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
import sys
from .contracts import BASE, canonical, clock, decode, digest
from .policy import load as load_policy

FILE_PATHS = {
    "plugin_registry":"data/exports/nervous_system_v0_1/registry.json",
    "research_flagship":"data/exports/research_os_v0_1/flagship.json",
    "research_prereg":"data/exports/research_os_v0_1/preregistration.json",
    "research_freeze":"data/exports/research_os_v0_1/freeze-receipt.json",
    "research_identities":"data/exports/research_os_v0_1/identities.json",
    "research_repeat":"data/exports/research_os_v0_1/repeatability.json",
    "research_gate":"data/exports/research_os_v0_1_1/summary.json",
    "simulator_history":"eval/certification/forge_v0_2_4/engine_probe_artifact.json",
    "model_profile":"eval/regimes/v0.1/profile.json",
    "factor_policy":"eval/factors/v0.1/policy.json",
}
FORBIDDEN_PREFIXES = ("src.regimes.", "src.research_os.", "src.execution.", "src.simulation.",
    "src.ml.", "src.dynamics.", "src.regime_intelligence.", "src.factors.",
    "finsight.plugins.", "src.risk.var_cvar", "src.data.providers",
    "src.data.market_data", "src.data_organ.service", "src.data_organ.adapters",
    "yfinance", "hmmlearn", "arch", "requests", "httpx", "urllib.request",
    "socket", "subprocess", "sklearn", "statsmodels", "scipy", "torch",
    "numpy", "pandas")


@contextmanager
def forbidden_calls():
    previous = sys.getprofile()
    def guard(frame, event, arg):
        if event == "call" and frame.f_globals.get("__name__", "").startswith(FORBIDDEN_PREFIXES):
            raise RuntimeError("Forbidden scientific/provider/runtime call")
        if event == "c_call" and (
            (getattr(arg, "__module__", "") or "").startswith(FORBIDDEN_PREFIXES)
            or getattr(arg, "__module__", "") in {"_sqlite3", "_socket"}
        ):
            raise RuntimeError("Forbidden database/network call")
        if previous:
            previous(frame, event, arg)
    sys.setprofile(guard)
    try:
        yield
    finally:
        sys.setprofile(previous)

def freeze_inventory(root):
    root = Path(root)
    frozen = decode((root/"eval/risk_manager/v0.1/phase0-6-freeze.json").read_bytes())
    if frozen["base"] != BASE or len(frozen["artifacts"]) != 221 or len(frozen["routes"]) != 126:
        raise ValueError("Canonical freeze identity changed")
    inventory = {}
    for name, expected in frozen["files"].items():
        raw = (root/name).read_bytes()
        if expected["mode"] == "canonical_text":
            raw = raw.replace(b"\r\n", b"\n")
        current = sha256(raw).hexdigest()
        if current != expected["sha256"]:
            raise ValueError("Frozen evidence changed: " + name)
        inventory[name] = current
    manifest = decode((root/"frontend-v2/public/replay-manifest.json").read_bytes())
    for part in ("artifacts", "routes"):
        for name, expected in frozen[part].items():
            if canonical(manifest[part].get(name)) != canonical(expected):
                raise ValueError("Pre-Phase7 manifest binding changed: " + name)
    for key, value in frozen["manifest_contract"].items():
        if canonical(manifest.get(key)) != canonical(value):
            raise ValueError("Manifest contract changed")
    if clock(manifest["as_of"]) < clock(frozen["manifest_as_of"]):
        raise ValueError("Manifest clock regressed")
    for item in frozen["withdrawals"]:
        old = item["withdrawn_artifact"]
        if old in manifest["artifacts"] or (root/"frontend-v2/public/artifacts/replay"/(old.replace(":","-")+".json")).exists():
            raise ValueError("Withdrawn unsafe artifact resurrected")
        if item["replacement_artifact"] not in manifest["artifacts"]:
            raise ValueError("Withdrawal replacement removed")
    return digest(inventory)

class EvidenceReaders:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.policy = load_policy(root)
        self.map = decode((self.root/"eval/risk_manager/v0.1/evidence-map.json").read_bytes())
        if set(self.map) != {"schema_version","base","evaluation_cutoff","artifacts","files","health_history"} or self.map["base"] != BASE:
            raise ValueError("Unknown evidence map")
        if self.map["evaluation_cutoff"] != self.policy["evaluation_cutoff"]:
            raise ValueError("Evaluation cutoff substitution")
        self.cutoff = self.policy["evaluation_cutoff"]
        self.manifest_raw = (self.root/"frontend-v2/public/replay-manifest.json").read_bytes()
        self.manifest = decode(self.manifest_raw)
        self.frozen = decode((self.root/"eval/risk_manager/v0.1/phase0-6-freeze.json").read_bytes())
        self.inputs = {}
        self.refs = {}
        self.values = {}

    def _bytes(self, relative, expected):
        target = (self.root/relative).resolve()
        if not target.is_relative_to(self.root) or target.is_symlink():
            raise ValueError("Evidence path escape")
        raw = target.read_bytes()
        if expected.get("mode")=="canonical_text":
            raw=raw.replace(b"\r\n",b"\n")
        if len(raw) != expected["bytes"] or sha256(raw).hexdigest() != expected["sha256"]:
            raise ValueError("Retained evidence hash/bytes mismatch")
        return raw

    def artifact(self, alias, spec=None):
        spec = spec or self.map["artifacts"][alias]
        identity, entry = spec["artifact_id"], spec["entry"]
        if canonical(entry) != canonical(self.frozen["artifacts"].get(identity)) or canonical(entry) != canonical(self.manifest["artifacts"].get(identity)):
            raise ValueError("Original artifact binding substituted")
        expected_url = "/artifacts/replay/" + identity.replace(":","-") + ".json"
        # Earlier kinds in this reader all use strict content-addressed names.
        if entry["url"] != expected_url or entry["status"] != "AVAILABLE":
            raise ValueError("Unsafe evidence URL/status")
        if clock(entry["available_at"]) > clock(self.cutoff):
            raise ValueError("Evidence available after pinned cutoff")
        if entry["licence"]["status"] not in {"ACTIVE","FIRST_PARTY","PUBLIC_DOMAIN"} or "publish_derived" not in entry["licence"]["permitted_uses"]:
            raise ValueError("Evidence permission unavailable")
        if entry["licence"]["valid_through"] and clock(entry["licence"]["valid_through"]) <= clock(self.cutoff):
            raise ValueError("Evidence permission expired")
        raw = self._bytes("frontend-v2/public"+entry["url"], entry)
        value = decode(raw)
        if value.get("sources") != entry["sources"] or value.get("input_hash") != entry["input_hash"]:
            raise ValueError("Envelope provenance substitution")
        self.inputs[identity] = {"input_id":identity,"sha256":entry["sha256"],"bytes":len(raw)}
        ref = dict(type="REPLAY_ARTIFACT",artifact_id=identity,kind=entry["kind"],sha256=entry["sha256"],
                   bytes=len(raw),as_of=entry["as_of"],available_at=entry["available_at"],selector_id=alias,
                   source_ids=entry["sources"],run_id=None)
        self.refs[alias], self.values[alias] = ref, value
        return value

    def file(self, alias):
        spec = self.map["files"][alias]
        if spec["path"] != FILE_PATHS[alias] or spec["sha256"] != self.frozen["files"][spec["path"]]["sha256"]:
            raise ValueError("Frozen file path/hash substitution")
        raw = self._bytes(spec["path"], spec)
        value = decode(raw)
        self.inputs[alias] = {"input_id":alias,"sha256":spec["sha256"],"bytes":len(raw)}
        self.refs[alias] = dict(type="FROZEN_FILE",commit=BASE,path_id=alias,sha256=spec["sha256"],
                               bytes=len(raw),selector_id=alias,assertion_id=alias)
        self.values[alias] = value
        return value

    def read(self):
        for alias in sorted(self.map["artifacts"]):
            self.artifact(alias)
        for alias in sorted(FILE_PATHS):
            self.file(alias)
        health = {}
        for i, entry in sorted(self.map["health_history"].items()):
            v = self.artifact("health_history_"+i.rsplit(":",1)[-1], {"artifact_id":i,"entry":entry})
            for row in v["payload"]["items"]:
                health[row["diagnostic_id"]] = row
        self.health_history = health
        self._model_joins()
        self._registry_chain()
        if (self.root/"frontend-v2/public/replay-manifest.json").read_bytes() != self.manifest_raw:
            raise ValueError("Manifest changed during evidence read")
        return self

    def _model_joins(self):
        profile = self.values["model_profile"]
        for country in ("US","INDIA"):
            p = self.values["model_"+country]["payload"]
            line = self.values["lineage_"+country]["payload"]["runs"]
            if p["country"] != country or p["profile_sha256"] != self.map["files"]["model_profile"]["sha256"]:
                raise ValueError("Country/profile substitution")
            def verify(node):
                if node["status"] != "VERIFIED":
                    raise ValueError("Unverified model lineage")
                for source in node["sources"]:
                    if clock(source["captured_at"]) > clock(utc_clock(node["as_of"])):
                        raise ValueError("Source crosses model cutoff")
                    grant = source["licence_decision"]
                    if grant["status"] != "ACTIVE" or grant["permitted_uses"] != ["publish_derived"]:
                        raise ValueError("Model source grant unavailable")
                for producer in node["producers"]:
                    verify(producer)
            for module, run in p["run_ids"].items():
                if module not in line or line[module]["run_id"] != run:
                    raise ValueError("Model run/lineage substitution")
                verify(line[module])
            if p["hmm"]["hmm2"]["features"] != profile["hmm"]["configs"]["hmm2-diagnostic"]["features"]:
                raise ValueError("Feature meaning changed")

    def _registry_chain(self):
        registry = self.values["plugin_registry"]
        previous = None
        for n, entry in enumerate(registry["events"]):
            value = {k:v for k,v in entry.items() if k != "hash"}
            if entry["sequence"] != n or entry["previous"] != previous or digest(value) != entry["hash"]:
                raise ValueError("RunRegistry event chain invalid")
            previous = entry["hash"]
        for run in registry["runs"]:
            if run["run_id"] != digest(run["contract"]):
                raise ValueError("RunRegistry identity invalid")

    def ref(self, *aliases):
        return [self.refs[a] for a in aliases]

def utc_clock(value):
    from .contracts import utc
    return utc(value)
