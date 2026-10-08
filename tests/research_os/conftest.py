import pytest
from src.research_os.contracts import (Hypothesis, DatasetSnapshot, FeatureDefinition,
    Split, TestDefinition, CostModel, TestingFamily, Preregistration)


@pytest.fixture
def spec():
    return Preregistration(
        hypothesis=Hypothesis(name="Test", null="mean <= 0", alternative="mean > 0",
            direction="greater", universe=("SYNTHETIC",), dependent="future_return",
            independent=("lagged_return",), controls=(), primary_endpoint="mean",
            falsification=("Nonpositive interval",), interpretation="RESEARCHER_EXTENSION"),
        datasets=(DatasetSnapshot(country="SYNTHETIC", label="Synthetic test",
            content_sha256="a"*64, source_sha256=("b"*64,), source_urls=("fixture://seed",),
            source_available_at="2020-01-02T00:00:00Z", latest_observation="2020-01-01T00:00:00Z",
            input_cutoff="2020-01-03T00:00:00Z", evidence_mode="SYNTHETIC", disclosure="Test only"),),
        features=(FeatureDefinition(name="lagged_return", sources=("return",), formula="lag",
            lag_months=1, lookback_months=12, clock="OBSERVATION_SEQUENCE_FIXED_VINTAGE"),),
        splits=(Split(train_start="2000-01", train_end="2001-12", validation_start="2002-02",
            validation_end="2002-12", holdout_start="2003-02", holdout_end="2004-12",
            purge_months=1, embargo_months=1, clock="OBSERVATION_SEQUENCE_FIXED_VINTAGE"),),
        tests=(TestDefinition(method="HAC", alternative="greater", alpha=.05,
            hac_lags=3, block_length=6, resamples=199, assumptions=("Stationary",)),),
        costs=(CostModel(name="Test cost", scope="HYPOTHETICAL_FACTOR_SENSITIVITY",
            commission_bps=1, spread_bps=2, statutory_bps=0, frontier_bps=(0,10,25),
            rationale="Synthetic cost sensitivity"),),
        family=TestingFamily(name="Test family", trial_ids=("primary","placebo"),
            dependence_disclosure="Dependent, independent count unavailable"),
        seeds=(123,), parameters={"window":12}, acceptance="Holm <= .05", minimum_effect=.002,
        prospective_sigma=.05)
