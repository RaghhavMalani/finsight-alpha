"""Write a Model; the platform owns data, splits, attempts and publication."""

from .contracts import Signal, SignalType, InferenceCapability
from .model import Model
from .store import SignalStore
from .runner import Runner
from .catalog import PluginCatalog
from src.truth.run_registry import RunRegistry

__all__ = [
    "Model",
    "Signal",
    "SignalType",
    "SignalStore",
    "InferenceCapability",
    "Runner",
    "RunRegistry",
]
