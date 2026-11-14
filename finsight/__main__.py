"""``python -m finsight <command>``. Commands: ``live``."""

from __future__ import annotations

import sys


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        print("usage: python -m finsight live [--no-frontend] [--offline] [--scheduler-only] ...")
        return 0
    if argv[0] == "live":
        from finsight.live_cli import main as live_main

        return live_main(argv[1:])
    print(f"unknown command {argv[0]!r}; known: live", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
