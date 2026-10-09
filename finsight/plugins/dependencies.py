"""Prospective computation identity: explicit roots and verified static closure.

Git execution provenance is deliberately outside this contract. Package facade
imports are not roots: only the selected model and the execution kernel compute.
Dynamic imports need a literal module or an explicit call-site resolution.
"""

from __future__ import annotations

import ast
import importlib.metadata
import inspect
import platform
import subprocess
import textwrap
from functools import lru_cache
from hashlib import sha256
from pathlib import Path

from src.truth.contracts import canonical_hash


@lru_cache(maxsize=1)
def distribution_map():
    return importlib.metadata.packages_distributions()


KERNEL = ("finsight.plugins.runner", "finsight.plugins.store", "finsight.plugins.model")


def manifest(model_type, root):
    root = Path(root).resolve()
    files, packages, visited = {}, set(), set()
    resolutions = dict(getattr(model_type, "dynamic_imports", {}))

    def visit(module):
        if module in visited or module == "__future__":
            return
        visited.add(module)
        path = root.joinpath(*module.split(".")).with_suffix(".py")
        if not path.exists():
            package = root.joinpath(*module.split("."), "__init__.py")
            if package.exists():
                path = package
            elif module.split(".")[0] in {"src", "finsight", "examples"}:
                raise ValueError("Unresolved declared computation module: " + module)
            else:
                packages.add(module.split(".")[0])
                return
        raw = path.read_bytes().replace(b"\r\n", b"\n")
        files[path.relative_to(root).as_posix()] = sha256(raw).hexdigest()
        scan(ast.parse(raw), module, path.name == "__init__.py")

    def scan(tree, module, is_package=False):
        dynamic_aliases = {"__import__", "import_module"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    visit(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module == "importlib":
                    dynamic_aliases.update(
                        a.asname or a.name
                        for a in node.names
                        if a.name == "import_module"
                    )
                if node.level:
                    prefix = module.split(".") if is_package else module.split(".")[:-1]
                    base = prefix[: len(prefix) - node.level + 1]
                    target = ".".join(base + ([node.module] if node.module else []))
                else:
                    target = node.module or ""
                if target:
                    if target == "finsight.plugins":
                        for alias in node.names:
                            mapping = {
                                "Model": "model",
                                "Runner": "runner",
                                "SignalStore": "store",
                                "Signal": "contracts",
                                "SignalType": "contracts",
                                "InferenceCapability": "contracts",
                                "RunRegistry": "src.truth.run_registry",
                            }
                            if alias.name in mapping:
                                value = mapping[alias.name]
                                visit(
                                    value
                                    if value.startswith("src.")
                                    else "finsight.plugins." + value
                                )
                            else:
                                raise ValueError(
                                    "Declare a concrete computation module instead of facade "
                                    + alias.name
                                )
                        continue
                    visit(target)
            elif isinstance(node, ast.Call):
                name = (
                    node.func.id
                    if isinstance(node.func, ast.Name)
                    else node.func.attr
                    if isinstance(node.func, ast.Attribute)
                    else ""
                )
                if name in dynamic_aliases or name == "import_module":
                    key = module + ":" + str(node.lineno)
                    argument = node.args[0] if node.args else None
                    target = (
                        argument.value
                        if isinstance(argument, ast.Constant)
                        and isinstance(argument.value, str)
                        else resolutions.get(key)
                    )
                    if (
                        not isinstance(target, str)
                        or not target
                        or target.startswith(".")
                    ):
                        raise ValueError("Unresolved dynamic import at " + key)
                    visit(target)

    for module in (*KERNEL, *getattr(model_type, "computation_dependencies", ())):
        visit(module)
    # Hash the selected class and globals it references, not sibling engines.
    module_path = Path(inspect.getfile(model_type)).resolve()
    if not module_path.is_relative_to(root):
        raise ValueError("Model source must be inside the declared computation root")
    tree = ast.parse(module_path.read_bytes())
    selected = ast.parse(textwrap.dedent(inspect.getsource(model_type)))
    references = {n.id for n in ast.walk(selected) if isinstance(n, ast.Name)}
    nodes = list(selected.body)
    selected_names = {model_type.__name__}
    while True:
        helpers = [
            n
            for n in tree.body
            if isinstance(n, (ast.FunctionDef, ast.ClassDef))
            and n.name in references - selected_names
        ]
        if not helpers:
            break
        nodes.extend(helpers)
        selected_names.update(n.name for n in helpers)
        references.update(
            n.id for h in helpers for n in ast.walk(h) if isinstance(n, ast.Name)
        )
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            aliases = [
                a
                for a in node.names
                if (a.asname or a.name.split(".")[0]) in references
            ]
            if aliases:
                clone = (
                    ast.Import(names=aliases)
                    if isinstance(node, ast.Import)
                    else ast.ImportFrom(
                        module=node.module, names=aliases, level=node.level
                    )
                )
                nodes.append(clone)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)) and any(
            isinstance(x, ast.Name) and x.id in references for x in ast.walk(node)
        ):
            nodes.append(node)
    selected_tree = ast.Module(body=nodes, type_ignores=[])
    scan(selected_tree, model_type.__module__)
    files[module_path.relative_to(root).as_posix() + "#" + model_type.__qualname__] = (
        sha256(ast.dump(selected_tree, include_attributes=False).encode()).hexdigest()
    )
    distributions = distribution_map()
    versions = {
        d: importlib.metadata.version(d)
        for p in packages
        for d in distributions.get(p, [])
    }
    return {
        "schema_version": "computation-dependencies/2",
        "plugin": model_type.__module__ + "." + model_type.__qualname__,
        "sources": dict(sorted(files.items())),
        "dependencies": dict(sorted(versions.items())),
        "runtime": {
            "python": platform.python_version(),
            "system": platform.system(),
            "machine": platform.machine(),
        },
    }


def execution_provenance(root, computation):
    paths = sorted({p.split("#")[0] for p in computation["sources"]})
    return {
        "commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root, text=True
        ).strip(),
        "dirty_computation": bool(
            subprocess.check_output(
                ["git", "status", "--porcelain", "--", *paths], cwd=root, text=True
            ).strip()
        ),
        "dependency_manifest_hash": canonical_hash(computation),
    }
