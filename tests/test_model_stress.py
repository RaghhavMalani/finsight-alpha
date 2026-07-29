import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

from src.ml.model_stress import stress_model_suite


def test_every_model_is_scored_under_every_adversarial_scenario():
    rng = np.random.default_rng(23)
    rows = 180
    frame = pd.DataFrame(
        {
            "return_5": rng.normal(0, 0.03, rows),
            "momentum_20": rng.normal(0, 1, rows),
            "realized_vol_20": rng.lognormal(-3.5, 0.35, rows),
            "drawdown": -rng.random(rows) * 0.25,
            "volume_z": rng.normal(0, 1, rows),
            "sma50_gap": rng.normal(0, 0.08, rows),
        }
    )
    target = (
        frame["return_5"] + 0.018 * frame["momentum_20"] - frame["realized_vol_20"]
        > frame["return_5"].median()
    ).astype(int)
    models = {
        "logistic": {"model": LogisticRegression(max_iter=500).fit(frame, target)},
        "forest": {
            "model": RandomForestClassifier(n_estimators=30, random_state=3).fit(
                frame, target
            )
        },
    }

    result = stress_model_suite(models, frame, target)

    assert result["models_tested"] == 2
    assert result["scenarios_tested"] == 6
    assert len(result["matrix"]) == 12
    assert len(result["scenario_summary"]) == 6
    assert {row["model"] for row in result["robustness_ranking"]} == {
        "logistic",
        "forest",
    }
    for row in result["matrix"]:
        assert 0 <= row["prediction_flip_rate"] <= 1
        assert 0 <= row["accuracy"] <= 1


def test_noisy_feed_stress_is_reproducible():
    rng = np.random.default_rng(9)
    frame = pd.DataFrame(
        rng.normal(size=(80, 4)), columns=["return_1", "vol_20", "volume_z", "trend"]
    )
    target = (frame["return_1"] > 0).astype(int)
    bundle = {"logistic": {"model": LogisticRegression().fit(frame, target)}}
    assert (
        stress_model_suite(bundle, frame, target)["matrix"]
        == stress_model_suite(bundle, frame, target)["matrix"]
    )
