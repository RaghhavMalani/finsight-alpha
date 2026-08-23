# FORGE_BASELINE_V0_2

Immutable FinSight Forge v0.2.1 systems baseline: 10 frozen tasks × 5 seeds ×
3 offline policy configurations = 150 episodes.

The weak and strong configurations are deterministic error emulators used to
test reward discrimination. They are not measurements of external LLM quality.
All token and inference costs are exactly zero because no model API was called.
Local compute is unpriced in USD and is reported separately in seconds.

| Configuration | Verified | Mean reward | Reward variance | Cost / verified finding |
| --- | ---: | ---: | ---: | ---: |
| deterministic-scripted | 100.0% | 0.9919 | 0.000000 | $0.000000 |
| offline-strong-model | 84.0% | 0.9611 | 0.006481 | $0.000000 |
| offline-weak-model | 32.0% | 0.8620 | 0.014086 | $0.000000 |

Overall reward variance: `0.009929`.

## Reward-discrimination finding

**Saturation detected:** `True`.

- Mean verified reward: `0.991920`
- Mean failed reward: `0.800556`
- Minimum failed reward: `0.639171`
- Fraction above 0.95: `72.0%`

Do not use the current scalar reward for learning unchanged; add graded statistical, citation-quality, and robustness checks plus harder partial-credit tasks.

Holdout numerical expectations and verifier implementations never enter the
agent tool plane or sandbox. The sandbox can read only its frozen `input.json`
and can write only content-addressed artifacts.
