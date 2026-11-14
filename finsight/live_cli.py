"""One command for the live spine: API (with scheduler) + frontend dev server.

    python -m finsight live                 # API on :8000 with live feeds, frontend on :5173
    python -m finsight live --no-frontend   # API + scheduler only
    python -m finsight live --offline       # replay recorded segments; no network
    python -m finsight live --scheduler-only --duration 240   # headless smoke run, prints health

Ctrl+C stops every child process. Keys come from the environment (and the
project ``.env`` if present, never overriding the shell).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WINDOWS = os.name == "nt"


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m finsight live", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--offline", action="store_true", help="replay recorded segments instead of fetching")
    p.add_argument("--no-frontend", action="store_true", help="do not start the frontend dev server")
    p.add_argument("--scheduler-only", action="store_true", help="run feeds in-process, no API or frontend")
    p.add_argument("--duration", type=float, default=None, help="with --scheduler-only: stop after N seconds")
    p.add_argument("--feeds", default="", help="comma-separated feed names (default: all)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--frontend-port", type=int, default=5173)
    p.add_argument("--env-file", default=str(PROJECT_ROOT / ".env"),
                   help="dotenv file for provider keys (never overrides the shell)")
    return p


def _load_env(path: str) -> None:
    if path and Path(path).is_file():
        from dotenv import load_dotenv

        load_dotenv(path, override=False)


def _kill_tree(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    if WINDOWS:
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def _spawn(cmd: list[str], *, cwd: Path, env: dict) -> subprocess.Popen:
    kwargs = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if WINDOWS else {"start_new_session": True}
    return subprocess.Popen(cmd, cwd=cwd, env=env, **kwargs)


async def _scheduler_only(feeds: set[str] | None, duration: float | None) -> int:
    from src.live.feeds import all_feeds
    from src.live.runtime import LiveService, set_service
    from src.live.store import LiveStore

    store = LiveStore()
    service = LiveService(store, feeds=all_feeds(feeds))
    set_service(service)
    service.bus.on_event(lambda e: print(f"{e['available_at']} {e['type']:<18} {e['source']:<20} "
                                         f"{e['source_id'][:48]}", flush=True))
    print(f"live store: {store.root}", flush=True)
    await service.start()
    try:
        if duration:
            await asyncio.sleep(duration)
        else:
            while True:
                await asyncio.sleep(3600)
    finally:
        await service.stop()
        print(json.dumps(service.health(), indent=2), flush=True)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    _load_env(args.env_file)
    feeds = {f.strip() for f in args.feeds.split(",") if f.strip()} or None
    if args.scheduler_only:
        if args.offline:
            print("--scheduler-only fetches; use --offline without it to replay", file=sys.stderr)
            return 2
        try:
            return asyncio.run(_scheduler_only(feeds, args.duration))
        except KeyboardInterrupt:
            return 0

    env = {**os.environ, "FINSIGHT_LIVE": "offline" if args.offline else "online"}
    if feeds:
        env["FINSIGHT_LIVE_FEEDS"] = ",".join(sorted(feeds))
    children: list[tuple[str, subprocess.Popen]] = []
    api = [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", args.host, "--port", str(args.port)]
    children.append(("api", _spawn(api, cwd=PROJECT_ROOT, env=env)))
    print(f"api      http://{args.host}:{args.port}  (live {env['FINSIGHT_LIVE']}; GET /live/health, /live/stream)")

    if not args.no_frontend:
        frontend = PROJECT_ROOT / "frontend-v2"
        npm = shutil.which("npm.cmd" if WINDOWS else "npm") or shutil.which("npm")
        if npm is None or not (frontend / "node_modules").is_dir():
            print("frontend skipped: run `npm ci` in frontend-v2 first (or pass --no-frontend)")
        else:
            fenv = {**env, "VITE_ENABLE_LOCAL_LIVE": "true",
                    "VITE_API_BASE_URL": env.get("VITE_API_BASE_URL", f"http://{args.host}:{args.port}")}
            cmd = [npm, "run", "dev", "--", "--port", str(args.frontend_port)]
            children.append(("frontend", _spawn(cmd, cwd=frontend, env=fenv)))
            print(f"frontend http://localhost:{args.frontend_port}")
    print("Ctrl+C stops everything.")
    code = 0
    try:
        while True:
            for name, proc in children:
                if proc.poll() is not None:
                    print(f"{name} exited with {proc.returncode}; stopping the rest")
                    code = proc.returncode or 1
                    raise KeyboardInterrupt
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for _, proc in reversed(children):
            _kill_tree(proc)
    return code
