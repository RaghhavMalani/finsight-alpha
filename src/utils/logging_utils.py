"""Standardised logging for FinSight Alpha.

A single :func:`get_logger` factory gives every module a consistently formatted
logger without each file having to configure handlers itself. Configuration is
applied exactly once (idempotent) so importing this from many modules is safe.
"""

from __future__ import annotations

import logging
import os
import sys

# A clear, human-readable format: time, level, logger name, message.
_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Read the desired level from the environment (default INFO). e.g. LOG_LEVEL=DEBUG
_DEFAULT_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


def _configure_root_once() -> None:
    """Attach a single stream handler to the root logger if none exists.

    Using ``logging.basicConfig`` is not always idempotent across reimports
    (e.g. Streamlit's hot-reload), so we guard on existing handlers explicitly.
    """
    root = logging.getLogger()
    if root.handlers:
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter(fmt=_LOG_FORMAT, datefmt=_DATE_FORMAT))
    root.addHandler(handler)

    # Resolve the configured level safely, defaulting to INFO on a bad value.
    level = getattr(logging, _DEFAULT_LEVEL, logging.INFO)
    root.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    """Return a configured logger for ``name`` (typically ``__name__``).

    Parameters
    ----------
    name:
        Logger name; pass ``__name__`` from the calling module.

    Returns
    -------
    logging.Logger
        A logger that writes formatted messages to stdout.
    """
    _configure_root_once()
    return logging.getLogger(name)
