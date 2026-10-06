"""A deterministic numpy multilayer perceptron that records its own training.

The network is small on purpose: daily signal research has hundreds of labeled rows, not
millions. Everything here is plain numpy so a fixed seed reproduces every weight, loss and
attribution byte-for-byte, and the Observatory can replay training epoch by epoch.

Scaling is fitted on the training rows only. Nothing in this module sees validation or
holdout labels except through the explicit ``validation`` argument, which is used for
monitoring, never for choosing an epoch.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
import math
from typing import Any

import numpy as np
from sklearn.metrics import log_loss, roc_auc_score

ACTIVATIONS = ("relu", "tanh", "gelu", "silu")
LIMITS = {
    "layers": (1, 4),
    "width": (2, 64),
    "epochs": (5, 200),
    "batch_size": (16, 256),
    "learning_rate": (1e-4, 1e-1),
    "dropout": (0.0, 0.6),
    "l2": (0.0, 1e-1),
}
# Weight snapshots kept per trace (epoch 0 is the initialization).
SNAPSHOTS = 25


@dataclass(frozen=True)
class Architecture:
    """A validated network specification. Unknown or out-of-range fields fail loudly."""

    hidden: tuple[int, ...] = (32, 16)
    activation: str = "relu"
    dropout: float = 0.1
    l2: float = 1e-4
    learning_rate: float = 3e-3
    epochs: int = 60
    batch_size: int = 64
    seed: int = 42

    @classmethod
    def parse(cls, spec: dict[str, Any] | None) -> "Architecture":
        spec = dict(spec or {})
        unknown = set(spec) - set(cls.__dataclass_fields__)
        if unknown:
            raise ValueError(f"Unknown architecture fields: {', '.join(sorted(unknown))}")
        default = cls()
        hidden = tuple(spec.get("hidden", default.hidden))
        low, high = LIMITS["layers"]
        if not low <= len(hidden) <= high:
            raise ValueError(f"A network needs {low}-{high} hidden layers")
        for width in hidden:
            if isinstance(width, bool) or not isinstance(width, int):
                raise ValueError("Hidden layer widths must be integers")
            if not LIMITS["width"][0] <= width <= LIMITS["width"][1]:
                raise ValueError("Hidden layer width must be between 2 and 64")
        activation = spec.get("activation", default.activation)
        if activation not in ACTIVATIONS:
            raise ValueError(f"Activation must be one of {', '.join(ACTIVATIONS)}")

        def bounded(name, kind):
            value = spec.get(name, getattr(default, name))
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{name} must be a number")
            value = kind(value)
            if not math.isfinite(value):
                raise ValueError(f"{name} must be finite")
            low, high = LIMITS[name]
            if not low <= value <= high:
                raise ValueError(f"{name} must be between {low} and {high}")
            if kind is int and value != spec.get(name, value):
                raise ValueError(f"{name} must be an integer")
            return value

        seed = spec.get("seed", default.seed)
        if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**31:
            raise ValueError("seed must be a non-negative 31-bit integer")
        return cls(hidden=hidden, activation=activation, dropout=bounded("dropout", float),
                   l2=bounded("l2", float), learning_rate=bounded("learning_rate", float),
                   epochs=bounded("epochs", int), batch_size=bounded("batch_size", int), seed=seed)

    def as_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["hidden"] = list(self.hidden)
        return value


def _activate(name: str, z: np.ndarray) -> np.ndarray:
    if name == "relu":
        return np.maximum(z, 0.0)
    if name == "tanh":
        return np.tanh(z)
    if name == "gelu":
        return 0.5 * z * (1.0 + np.tanh(0.7978845608028654 * (z + 0.044715 * z**3)))
    return z / (1.0 + np.exp(-z))  # silu


def _derivative(name: str, z: np.ndarray) -> np.ndarray:
    if name == "relu":
        return (z > 0).astype(z.dtype)
    if name == "tanh":
        return 1.0 - np.tanh(z) ** 2
    if name == "gelu":
        k = 0.7978845608028654
        inner = k * (z + 0.044715 * z**3)
        t = np.tanh(inner)
        return 0.5 * (1.0 + t) + 0.5 * z * (1.0 - t**2) * k * (1.0 + 3 * 0.044715 * z**2)
    s = 1.0 / (1.0 + np.exp(-z))
    return s + z * s * (1.0 - s)


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 0.5 * (1.0 + np.tanh(0.5 * z))


@dataclass
class Scaler:
    """Standardization fitted on training rows only; constant columns keep unit scale."""

    mean: np.ndarray
    scale: np.ndarray

    @classmethod
    def fit(cls, x: np.ndarray) -> "Scaler":
        mean = x.mean(axis=0)
        scale = x.std(axis=0)
        scale[~np.isfinite(scale) | (scale < 1e-12)] = 1.0
        return cls(mean, scale)

    def transform(self, x: np.ndarray) -> np.ndarray:
        return (x - self.mean) / self.scale


@dataclass
class MLP:
    architecture: Architecture
    n_inputs: int
    weights: list[np.ndarray] = field(default_factory=list)
    biases: list[np.ndarray] = field(default_factory=list)

    def __post_init__(self):
        if self.weights:
            return
        rng = np.random.default_rng(self.architecture.seed)
        sizes = [self.n_inputs, *self.architecture.hidden, 1]
        gain = 1.0 if self.architecture.activation == "tanh" else 2.0
        for i, (fan_in, fan_out) in enumerate(zip(sizes, sizes[1:])):
            last = i == len(sizes) - 2
            std = math.sqrt((1.0 if last else gain) / fan_in)
            self.weights.append(rng.normal(0.0, std, size=(fan_in, fan_out)))
            self.biases.append(np.zeros(fan_out))

    @property
    def parameter_count(self) -> int:
        return int(sum(w.size + b.size for w, b in zip(self.weights, self.biases)))

    def forward(self, x, *, rng=None):
        """Return (probabilities, cache). Dropout applies only when rng is given (training)."""
        act = self.architecture.activation
        keep = 1.0 - self.architecture.dropout
        a = x
        cache = []
        for w, b in zip(self.weights[:-1], self.biases[:-1]):
            z = a @ w + b
            h = _activate(act, z)
            mask = None
            if rng is not None and self.architecture.dropout > 0:
                mask = (rng.random(h.shape) < keep) / keep
                h = h * mask
            cache.append((a, z, mask))
            a = h
        logit = a @ self.weights[-1] + self.biases[-1]
        cache.append((a, logit, None))
        return _sigmoid(logit[:, 0]), cache

    def hidden_activations(self, x):
        """Post-activation outputs of every hidden layer, without dropout."""
        act = self.architecture.activation
        outputs, a = [], x
        for w, b in zip(self.weights[:-1], self.biases[:-1]):
            a = _activate(act, a @ w + b)
            outputs.append(a)
        return outputs

    def backward(self, cache, upstream):
        """Gradients of mean(upstream·logit) w.r.t. weights, biases and the inputs.

        For binary cross-entropy, upstream is (p - y) / n.
        """
        act = self.architecture.activation
        grads_w = [None] * len(self.weights)
        grads_b = [None] * len(self.biases)
        delta = upstream[:, None]
        for layer in range(len(self.weights) - 1, -1, -1):
            a_in, _, _ = cache[layer]
            grads_w[layer] = a_in.T @ delta
            grads_b[layer] = delta.sum(axis=0)
            delta = delta @ self.weights[layer].T
            if layer > 0:
                _, z, mask = cache[layer - 1]
                if mask is not None:
                    delta = delta * mask
                delta = delta * _derivative(act, z)
        return grads_w, grads_b, delta

    def input_attribution(self, x):
        """Mean |∂p/∂x · x| per input over the rows given (gradient × input saliency)."""
        p, cache = self.forward(x)
        _, _, d_input = self.backward(cache, p * (1.0 - p))
        values = np.abs(d_input * x).mean(axis=0)
        total = values.sum()
        return values / total if total > 0 else values


class Adam:
    def __init__(self, params, learning_rate):
        self.lr = learning_rate
        self.m = [np.zeros_like(p) for p in params]
        self.v = [np.zeros_like(p) for p in params]
        self.t = 0

    def step(self, params, grads):
        self.t += 1
        b1, b2, eps = 0.9, 0.999, 1e-8
        for i, (p, g) in enumerate(zip(params, grads)):
            self.m[i] = b1 * self.m[i] + (1 - b1) * g
            self.v[i] = b2 * self.v[i] + (1 - b2) * g * g
            m_hat = self.m[i] / (1 - b1**self.t)
            v_hat = self.v[i] / (1 - b2**self.t)
            p -= self.lr * m_hat / (np.sqrt(v_hat) + eps)


def _bce(y, p):
    return float(log_loss(y, np.clip(p, 1e-7, 1 - 1e-7), labels=[0, 1]))


def _auc(y, p):
    return float(roc_auc_score(y, p)) if len(np.unique(y)) == 2 else None


def snapshot_epochs(epochs: int) -> list[int]:
    return sorted({int(round(e)) for e in np.linspace(0, epochs, min(epochs + 1, SNAPSHOTS))})


def train(architecture: Architecture, x_fit, y_fit, x_validation=None, y_validation=None,
          *, record=True):
    """Train with Adam on standardized inputs; return (model, scaler, per-epoch record).

    The model returned is the final-epoch model. No epoch is chosen by validation loss, so
    validation scores stay a monitoring signal rather than a selection result.
    """
    x_fit = np.asarray(x_fit, dtype=np.float64)
    y_fit = np.asarray(y_fit, dtype=np.float64).ravel()
    scaler = Scaler.fit(x_fit)
    xs = scaler.transform(x_fit)
    xv = scaler.transform(np.asarray(x_validation, dtype=np.float64)) if x_validation is not None else None
    yv = np.asarray(y_validation, dtype=np.float64).ravel() if y_validation is not None else None
    model = MLP(architecture, xs.shape[1])
    params = [*model.weights, *model.biases]
    optimizer = Adam(params, architecture.learning_rate)
    rng = np.random.default_rng(architecture.seed + 1)
    keep = set(snapshot_epochs(architecture.epochs))
    epochs, snapshots = [], []

    def snapshot(epoch):
        layers = model.hidden_activations(xv) if xv is not None else model.hidden_activations(xs)
        snapshots.append({
            "epoch": epoch,
            "weights": [np.round(w, 5).tolist() for w in model.weights],
            "biases": [np.round(b, 5).tolist() for b in model.biases],
            "mean_activation": [np.round(h.mean(axis=0), 5).tolist() for h in layers],
            "active_fraction": [np.round((np.abs(h) > 1e-6).mean(axis=0), 4).tolist() for h in layers],
        })

    if record:
        snapshot(0)
    n = len(xs)
    for epoch in range(1, architecture.epochs + 1):
        order = rng.permutation(n)
        for start in range(0, n, architecture.batch_size):
            batch = order[start:start + architecture.batch_size]
            p, cache = model.forward(xs[batch], rng=rng)
            grads_w, grads_b, _ = model.backward(cache, (p - y_fit[batch]) / len(batch))
            grads_w = [g + architecture.l2 * w for g, w in zip(grads_w, model.weights)]
            optimizer.step(params, [*grads_w, *grads_b])
        if not record:
            continue
        p_fit, _ = model.forward(xs)
        row = {"epoch": epoch, "train_loss": round(_bce(y_fit, p_fit), 6),
               "train_auc": _round(_auc(y_fit, p_fit)),
               "weight_norm": [round(float(np.linalg.norm(w)), 5) for w in model.weights]}
        if xv is not None:
            p_val, _ = model.forward(xv)
            row["val_loss"] = round(_bce(yv, p_val), 6)
            row["val_auc"] = _round(_auc(yv, p_val))
        epochs.append(row)
        if epoch in keep:
            snapshot(epoch)
    return model, scaler, {"epochs": epochs, "snapshots": snapshots}


def predict(model: MLP, scaler: Scaler, x) -> np.ndarray:
    p, _ = model.forward(scaler.transform(np.asarray(x, dtype=np.float64)))
    return p


def _round(value, digits=6):
    return None if value is None else round(float(value), digits)
