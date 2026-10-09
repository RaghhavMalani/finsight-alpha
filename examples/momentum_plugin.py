"""A 30-line SDK example on a checked synthetic fixture, not a market study."""
import numpy as np
import pandas as pd
from finsight.plugins import Model, InferenceCapability


class MomentumModel(Model):
    inputs = ["market_return", "volatility"]
    outputs = ["momentum_signal"]
    capability = InferenceCapability(
        method="NULL_MBB_T", confirmation_status="NOT_CONFIRMED",
        descriptive_only_settings=("2/30 historical settings; no certification",),
    )

    def fit(self, train):
        x = train[self.inputs].to_numpy(dtype=float)
        y = train.target.to_numpy(dtype=float)
        self.center = x.mean(axis=0)
        design = np.column_stack([np.ones(len(x)), x - self.center])
        self.weights = np.linalg.lstsq(design, y, rcond=None)[0]

    def predict(self, rows):
        x = rows[self.inputs].to_numpy(dtype=float) - self.center
        design = np.column_stack([np.ones(len(x)), x])
        return pd.DataFrame({"momentum_signal": design @ self.weights}, index=rows.index)

    def trace(self):
        return {"weights": self.weights.tolist(), "inputs": self.inputs,
                "semantics": "Actual development-fit coefficients; synthetic plumbing evidence",
                "inference_certified": False}
