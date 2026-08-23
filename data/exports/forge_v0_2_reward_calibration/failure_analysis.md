# Forge v0.2.2 failure analysis

The 42 frozen failures are classified with a multi-label taxonomy. Percentages therefore need not sum to 100%.

## Overall

| Failure label | Episodes | Share of failed episodes |
| --- | ---: | ---: |
| NONDETERMINISM | 14 | 33.3% |
| REPLAY_MISMATCH | 14 | 33.3% |
| PREMATURE_SUBMISSION | 11 | 26.2% |
| ROBUSTNESS_FAILURE | 11 | 26.2% |
| NUMERICAL_ERROR | 10 | 23.8% |
| MISSING_EVIDENCE | 7 | 16.7% |
| INVALID_PROVENANCE | 7 | 16.7% |
| UNSUPPORTED_CLAIM | 7 | 16.7% |
| STATISTICAL_ERROR | 3 | 7.1% |

## deterministic-scripted

| Failure label | Episodes | Share of configuration failures |
| --- | ---: | ---: |

## offline-strong-model

| Failure label | Episodes | Share of configuration failures |
| --- | ---: | ---: |
| NONDETERMINISM | 3 | 37.5% |
| REPLAY_MISMATCH | 3 | 37.5% |
| NUMERICAL_ERROR | 2 | 25.0% |
| PREMATURE_SUBMISSION | 2 | 25.0% |
| ROBUSTNESS_FAILURE | 2 | 25.0% |
| MISSING_EVIDENCE | 1 | 12.5% |
| INVALID_PROVENANCE | 1 | 12.5% |
| UNSUPPORTED_CLAIM | 1 | 12.5% |
| STATISTICAL_ERROR | 1 | 12.5% |

## offline-weak-model

| Failure label | Episodes | Share of configuration failures |
| --- | ---: | ---: |
| NONDETERMINISM | 11 | 32.4% |
| REPLAY_MISMATCH | 11 | 32.4% |
| PREMATURE_SUBMISSION | 9 | 26.5% |
| ROBUSTNESS_FAILURE | 9 | 26.5% |
| NUMERICAL_ERROR | 8 | 23.5% |
| MISSING_EVIDENCE | 6 | 17.6% |
| INVALID_PROVENANCE | 6 | 17.6% |
| UNSUPPORTED_CLAIM | 6 | 17.6% |
| STATISTICAL_ERROR | 2 | 5.9% |

Labels are derived only from trusted verifier checks, episode completion, tool use, and sandbox results. No model interpretation is used.
