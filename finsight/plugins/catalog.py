"""Explicit plugin registration; Runner supplies the common platform services."""

from .model import Model
from .engines import ENGINES


class PluginCatalog:
    def __init__(self):
        self._models = dict(ENGINES)

    def register(self, name, model_type):
        if (
            not isinstance(name, str)
            or not name
            or not isinstance(model_type, type)
            or not issubclass(model_type, Model)
        ):
            raise TypeError("Register a named Model subclass")
        model_type.declarations()
        if name in self._models and self._models[name] is not model_type:
            raise ValueError("Plugin name is already registered")
        self._models[name] = model_type
        return model_type

    def resolve(self, name):
        if name not in self._models:
            raise ValueError("Plugin is unavailable; no fallback")
        return self._models[name]

    def run(self, name, runner, **request):
        return runner.run(self.resolve(name), **request)
