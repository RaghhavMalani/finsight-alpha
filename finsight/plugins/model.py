"""One small model interface, independent of execution and claim policy."""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import ClassVar
import json
import pandas as pd
from .contracts import SignalType, InferenceCapability


class Model(ABC):
    inputs: ClassVar[list[str] | tuple[str, ...]] = ()
    outputs: ClassVar[list[str] | tuple[str, ...]] = ()
    input_types: ClassVar[dict[str, SignalType]] = {}
    output_types: ClassVar[dict[str, SignalType]] = {}
    version: ClassVar[str] = "1"
    capability: ClassVar[InferenceCapability] = InferenceCapability()
    task: ClassVar[str] = "regression"

    def __init__(self, *, seed: int = 42, **config):
        if type(seed) is not int or not 0 <= seed < 2**64:
            raise ValueError("Seed must be an unsigned 64-bit integer")
        json.dumps(config, sort_keys=True, allow_nan=False)
        self.seed, self.config = seed, dict(config)

    @classmethod
    def declarations(cls):
        if (
            not cls.inputs
            or not cls.outputs
            or len(set(cls.inputs)) != len(cls.inputs)
            or len(set(cls.outputs)) != len(cls.outputs)
        ):
            raise ValueError("A plugin declares unique, nonempty inputs and outputs")
        if any(
            n.startswith("target") or n in {"label", "future_return"}
            for n in cls.inputs
        ):
            raise ValueError("Targets cannot be declared as prediction features")
        inputs = tuple(cls.input_types.get(n, SignalType(n)) for n in cls.inputs)
        outputs = tuple(cls.output_types.get(n, SignalType(n)) for n in cls.outputs)
        if [s.name for s in inputs] != list(cls.inputs) or [
            s.name for s in outputs
        ] != list(cls.outputs):
            raise ValueError("Signal type/name mismatch")
        return inputs, outputs

    @abstractmethod
    def fit(self, train: pd.DataFrame):
        """Train on admitted fit rows; target and label clock may be supplied here."""

    @abstractmethod
    def predict(self, rows: pd.DataFrame) -> pd.DataFrame:
        """Return declared outputs, preserving the provided row index."""

    def trace(self) -> dict | None:
        return None
