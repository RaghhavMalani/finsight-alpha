"""Prospective computation identity: explicit roots and verified static closure.

Git execution provenance is deliberately outside this contract. Package facade
imports are not roots: only the selected model and the execution kernel compute.
Dynamic imports need a literal module or an explicit call-site resolution.
"""

from __future__ import annotations

import ast
import importlib.metadata
import importlib.util
import inspect
import platform
import subprocess
import sys
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

    def selected_tree(tree, names):
        wanted = set(names)
        found, nodes = set(), []
        while True:
            additions = []
            for n in tree.body:
                declared = (
                    {n.name}
                    if isinstance(
                        n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
                    )
                    else {
                        x.id
                        for x in ast.walk(n)
                        if isinstance(x, ast.Name) and isinstance(x.ctx, ast.Store)
                    }
                    if isinstance(n, (ast.Assign, ast.AnnAssign))
                    else {(a.asname or a.name.split(".")[0]) for a in n.names}
                    if isinstance(n, (ast.Import, ast.ImportFrom))
                    else set()
                )
                chosen = declared & wanted - found
                if chosen:
                    if isinstance(n, (ast.Import, ast.ImportFrom)):
                        aliases = [
                            a
                            for a in n.names
                            if (a.asname or a.name.split(".")[0]) in chosen
                        ]
                        clone = (
                            ast.Import(names=aliases)
                            if isinstance(n, ast.Import)
                            else ast.ImportFrom(
                                module=n.module, names=aliases, level=n.level
                            )
                        )
                        additions.append(clone)
                    else:
                        additions.append(n)
                    found.update(chosen)
            if not additions:
                break
            nodes.extend(additions)
            wanted.update(
                n.id
                for item in additions
                for n in ast.walk(item)
                if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)
            )
        if not set(names) <= found:
            raise ValueError(
                "Unresolved computation symbol: " + str(set(names) - found)
            )
        return ast.Module(body=nodes, type_ignores=[])

    def visit(module, symbol=None):
        key = (module, symbol)
        if key in visited or (module, None) in visited or module == "__future__":
            return
        visited.add(key)
        path = root.joinpath(*module.split(".")).with_suffix(".py")
        if not path.exists():
            package = root.joinpath(*module.split("."), "__init__.py")
            if package.exists():
                path = package
            elif module.split(".")[0] in {"src", "finsight", "examples"}:
                raise ValueError("Unresolved declared computation module: " + module)
            else:
                top = module.split(".")[0]
                if (
                    top not in sys.stdlib_module_names
                    and importlib.util.find_spec(top) is None
                ):
                    raise ValueError(
                        "Unresolved declared computation module: " + module
                    )
                packages.add(module.split(".")[0])
                return
        raw = path.read_bytes().replace(b"\r\n", b"\n")
        tree = ast.parse(raw)
        if symbol:
            tree = selected_tree(tree, [symbol])
        source_key = path.relative_to(root).as_posix() + (
            "#" + symbol if symbol else ""
        )
        files[source_key] = sha256(
            ast.dump(tree, include_attributes=False).encode() if symbol else raw
        ).hexdigest()
        scan(tree, module, path.name == "__init__.py")

    def scan(tree, module, is_package=False):
        dynamic_aliases = {"__import__", "import_module"}
        import_namespaces = {"importlib", "builtins", "__builtins__"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                import_namespaces.update(
                    a.asname or a.name
                    for a in node.names
                    if a.name in {"importlib", "builtins"}
                )
            if isinstance(node, ast.ImportFrom) and node.module in {
                "importlib",
                "builtins",
            }:
                dynamic_aliases.update(
                    a.asname or a.name
                    for a in node.names
                    if a.name in {"import_module", "__import__"}
                )

        def is_importer(node):
            return (
                (isinstance(node, ast.Name) and node.id in dynamic_aliases)
                or (
                    isinstance(node, ast.Attribute)
                    and node.attr in {"import_module", "__import__"}
                )
                or (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name)
                    and node.func.id == "getattr"
                    and len(node.args) > 1
                    and isinstance(node.args[1], ast.Constant)
                    and node.args[1].value in {"import_module", "__import__"}
                )
            )

        while True:
            old = (set(dynamic_aliases), set(import_namespaces))
            for node in ast.walk(tree):
                if isinstance(node, (ast.Assign, ast.AnnAssign)):
                    targets = (
                        node.targets if isinstance(node, ast.Assign) else [node.target]
                    )
                    names = {
                        n.id
                        for t in targets
                        for n in ast.walk(t)
                        if isinstance(n, ast.Name)
                    }
                    if is_importer(node.value):
                        dynamic_aliases.update(names)
                    if (
                        isinstance(node.value, ast.Name)
                        and node.value.id in import_namespaces
                    ):
                        import_namespaces.update(names)
                    elif (
                        isinstance(node.value, ast.Call)
                        and is_importer(node.value.func)
                        and node.value.args
                        and isinstance(node.value.args[0], ast.Constant)
                        and isinstance(node.value.args[0].value, str)
                        and node.value.args[0].value.split(".")[0]
                        in {"importlib", "builtins"}
                    ):
                        import_namespaces.update(names)
            if old == (dynamic_aliases, import_namespaces):
                break
        parents = {
            child: parent
            for parent in ast.walk(tree)
            for child in ast.iter_child_nodes(parent)
        }
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Load):
                continue
            importer = is_importer(node)
            namespace = isinstance(node, ast.Name) and node.id in import_namespaces
            if not importer and not namespace:
                continue
            parent = parents.get(node)
            alias = isinstance(parent, (ast.Assign, ast.AnnAssign)) and (
                parent.value is node
                and all(
                    isinstance(t, ast.Name)
                    for t in (
                        parent.targets
                        if isinstance(parent, ast.Assign)
                        else [parent.target]
                    )
                )
            )
            direct = isinstance(parent, ast.Call) and parent.func is node
            attribute = (
                namespace
                and isinstance(parent, ast.Attribute)
                and parent.value is node
                and parent.attr != "__dict__"
            )
            lookup = (
                namespace
                and isinstance(parent, ast.Call)
                and isinstance(parent.func, ast.Name)
                and parent.func.id == "getattr"
                and len(parent.args) > 1
                and parent.args[0] is node
                and isinstance(parent.args[1], ast.Constant)
                and isinstance(parent.args[1].value, str)
                and parent.args[1].value != "__dict__"
            )
            # Opaque containers/callbacks can hide the actual import call. They
            # are unsupported declarations, not a reason to broaden the hash.
            if not (alias or (importer and direct) or attribute or lookup):
                raise ValueError("Unresolved dynamic import reference at " + module)
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
                    for alias in node.names:
                        child = target + "." + alias.name
                        child_path = root.joinpath(*child.split("."))
                        if (
                            child_path.with_suffix(".py").exists()
                            or (child_path / "__init__.py").exists()
                        ):
                            visit(child)
                        else:
                            visit(target, alias.name)
            elif isinstance(node, ast.Call):
                name = (
                    node.func.id
                    if isinstance(node.func, ast.Name)
                    else node.func.attr
                    if isinstance(node.func, ast.Attribute)
                    else ""
                )
                if name in {"eval", "exec", "globals", "locals"} or (
                    name == "getattr"
                    and node.args
                    and isinstance(node.args[0], ast.Name)
                    and node.args[0].id in import_namespaces
                    and (
                        len(node.args) < 2 or not isinstance(node.args[1], ast.Constant)
                    )
                ):
                    raise ValueError(
                        "Unresolved dynamic import or computation at "
                        + module
                        + ":"
                        + str(node.lineno)
                    )
                if is_importer(node.func):
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
    # Resolve globals, assignments and helpers to a fixed point, just as for an
    # imported symbol. A class -> alias -> constant chain must bind all three.
    # Keep the selected class source (including nested classes) as the root.
    selected_model_tree = selected_tree(
        ast.Module(
            body=[
                n
                for n in tree.body
                if not isinstance(n, ast.ClassDef) or n.name != model_type.__name__
            ]
            + selected.body,
            type_ignores=[],
        ),
        [model_type.__name__],
    )
    scan(selected_model_tree, model_type.__module__)
    files[module_path.relative_to(root).as_posix() + "#" + model_type.__qualname__] = (
        sha256(
            ast.dump(selected_model_tree, include_attributes=False).encode()
        ).hexdigest()
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
