"""Private child-process bootstrap. It intentionally imports only the stdlib."""

from __future__ import annotations

import builtins
import json
import os
import random
import sys
from pathlib import Path


class PolicyViolation(RuntimeError):
    pass


class NetworkViolation(PolicyViolation):
    pass


class DependencyViolation(PolicyViolation):
    pass


class FrozenInputViolation(PolicyViolation):
    pass


class SeedMutationViolation(PolicyViolation):
    pass


def _inside(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def main() -> int:
    config_path = Path(sys.argv[1]).resolve()
    config = json.loads(config_path.read_text(encoding="utf-8"))
    workspace = Path(config["workspace"]).resolve()
    artifacts = Path(config["artifacts"]).resolve()
    control = Path(config["control"]).resolve()
    result_path = Path(config["result"]).resolve()
    program_path = Path(config["program"]).resolve()
    manifest = config["manifest"]
    source = program_path.read_text(encoding="utf-8")
    compiled = compile(source, "<forge-sandbox-program>", "exec")
    sys.dont_write_bytecode = True
    seed = int(manifest["seed"])
    random.seed(seed)
    original_seed = random.seed
    original_import = builtins.__import__
    import_depth = 0
    trusted_io = False
    network_roots = {
        "socket",
        "ssl",
        "http",
        "urllib",
        "ftplib",
        "requests",
        "aiohttp",
        "websockets",
    }
    escape_roots = {
        "subprocess",
        "multiprocessing",
        "ctypes",
        "mmap",
        "resource",
        "winreg",
        "msvcrt",
        "threading",
        "_thread",
        "concurrent",
        "importlib",
        "secrets",
        "time",
        "datetime",
    }
    allowed = set(manifest["allowed_dependencies"])

    def guarded_seed(value=None, *args, **kwargs):
        if value is None or int(value) != seed:
            raise SeedMutationViolation("sandbox seed is immutable")
        return original_seed(seed, *args, **kwargs)

    random.seed = guarded_seed

    def blocked_entropy(*args, **kwargs):
        raise SeedMutationViolation("system entropy is blocked; use SANDBOX_SEED")

    os.urandom = blocked_entropy
    if hasattr(random, "_urandom"):
        random._urandom = blocked_entropy

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        nonlocal import_depth
        root = name.split(".", 1)[0]
        if root in network_roots and not manifest["network"]:
            raise NetworkViolation(f"network module {root!r} is blocked")
        if root in escape_roots:
            raise PolicyViolation(f"escape-capable module {root!r} is blocked")
        stdlib = getattr(sys, "stdlib_module_names", frozenset())
        if import_depth == 0 and root not in allowed and root not in stdlib:
            raise DependencyViolation(f"undeclared dependency {root!r} is blocked")
        import_depth += 1
        try:
            module = original_import(name, globals, locals, fromlist, level)
        finally:
            import_depth -= 1
        if root == "random":
            random.seed = guarded_seed
        if root == "numpy":
            try:
                module.random.seed(seed)

                def guarded_numpy_seed(value=None):
                    if value is None or int(value) != seed:
                        raise SeedMutationViolation("sandbox NumPy seed is immutable")
                    return None

                module.random.seed = guarded_numpy_seed
            except AttributeError:
                pass
        return module

    builtins.__import__ = guarded_import

    def audit(event, args):
        if event in {"socket.__new__", "socket.connect", "socket.bind", "socket.getaddrinfo"}:
            raise NetworkViolation("network access is blocked")
        if event in {
            "subprocess.Popen",
            "os.system",
            "os.spawn",
            "os.exec",
            "os.startfile",
            "os.kill",
            "os.fork",
            "os.forkpty",
            "os.posix_spawn",
            "os.posix_spawnp",
        }:
            raise PolicyViolation("child processes are blocked")
        if event == "open":
            raw_path = args[0]
            if isinstance(raw_path, int):
                return
            try:
                path = Path(os.fsdecode(raw_path)).resolve()
            except (TypeError, ValueError, OSError):
                raise PolicyViolation("unresolvable file path is blocked")
            mode = args[1] if len(args) > 1 else "r"
            flags = args[2] if len(args) > 2 and isinstance(args[2], int) else 0
            writing = (
                isinstance(mode, str) and any(marker in mode for marker in "wax+")
            ) or bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            if trusted_io and _inside(path, control):
                return
            if writing:
                if _inside(path, workspace):
                    raise FrozenInputViolation("frozen inputs are immutable")
                if not _inside(path, artifacts):
                    raise PolicyViolation("writes are restricted to the artifact directory")
            elif not _inside(path, workspace) and not _inside(path, artifacts):
                if import_depth <= 0:
                    raise PolicyViolation("reads are restricted to frozen inputs and artifacts")
        if event in {"os.listdir", "os.scandir"}:
            raw_path = args[0] if args else "."
            path = Path(os.fsdecode(raw_path)).resolve()
            if (
                not _inside(path, workspace)
                and not _inside(path, artifacts)
                and import_depth <= 0
            ):
                raise PolicyViolation("directory reads are restricted to the sandbox")
        if event in {
            "os.remove",
            "os.rename",
            "os.rmdir",
            "os.mkdir",
            "os.chdir",
            "os.chmod",
            "os.link",
            "os.symlink",
        }:
            paths = [Path(os.fsdecode(value)).resolve() for value in args if isinstance(value, (str, bytes))]
            if any(_inside(path, workspace) for path in paths):
                raise FrozenInputViolation("frozen inputs are immutable")
            if any(not _inside(path, artifacts) for path in paths):
                raise PolicyViolation("filesystem mutations are restricted to artifacts")

    sys.addaudithook(audit)
    status = "succeeded"
    reason = None
    exit_code = 0
    globals_dict = {
        "__name__": "__main__",
        "INPUT_DIR": workspace,
        "ARTIFACT_DIR": artifacts,
        "SANDBOX_SEED": seed,
        "AS_OF": manifest["as_of"],
    }
    try:
        exec(compiled, globals_dict, globals_dict)
    except FrozenInputViolation as exc:
        status, reason, exit_code = "integrity_failure", str(exc), 74
    except SeedMutationViolation as exc:
        status, reason, exit_code = "seed_mismatch", str(exc), 75
    except PolicyViolation as exc:
        status, reason, exit_code = "policy_violation", str(exc), 77
    except MemoryError:
        status, reason, exit_code = "memory_limit", "worker raised MemoryError", 78
    except BaseException as exc:
        status, reason, exit_code = "failed", f"{type(exc).__name__}: {exc}", 1
    trusted_io = True
    result_path.write_text(
        json.dumps({"status": status, "reason": reason}, sort_keys=True),
        encoding="utf-8",
    )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
