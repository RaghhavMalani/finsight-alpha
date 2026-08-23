# FinSight validation report

Overall status: **PASS**
Generated: `2026-08-17T08:28:17.905815+00:00`

## Summary

| Layer | Status | Error |
| --- | --- | --- |
| black_scholes | pass |  |
| monte_carlo | pass |  |
| greeks | pass |  |
| var_cvar | pass |  |
| markowitz | pass |  |
| ml_signal | pass |  |
| rag | pass |  |

## Black-Scholes

| Metric | Value | Tolerance |
| --- | --- | --- |
| Published-reference max absolute error | 3.9287e-07 | 1.0000e-06 |
| Put-call parity max absolute error | 1.4211e-14 | 1.0000e-10 |

## Monte Carlo

| Option | Paths | MC price | BS price | Abs. error | Std. error | Abs. z-score |
| --- | --- | --- | --- | --- | --- | --- |
| call | 10000 | 10.354928 | 10.450584 | 0.095655 | 0.146167 | 0.654426 |
| put | 10000 | 5.443839 | 5.573526 | 0.129687 | 0.085684 | 1.513551 |
| call | 100000 | 10.412034 | 10.450584 | 0.038550 | 0.046241 | 0.833666 |
| put | 100000 | 5.539015 | 5.573526 | 0.034511 | 0.027260 | 1.265989 |
| call | 1000000 | 10.457574 | 10.450584 | 0.006991 | 0.014713 | 0.475114 |
| put | 1000000 | 5.566813 | 5.573526 | 0.006713 | 0.008649 | 0.776109 |
| call | 10000000 | 10.456826 | 10.450584 | 0.006242 | 0.004657 | 1.340387 |
| put | 10000000 | 5.571628 | 5.573526 | 0.001898 | 0.002738 | 0.693193 |

Convergence diagnostic:

| Option | log(SE) / log(N) slope | Expected | Status |
| --- | --- | --- | --- |
| call | -0.498759 | -0.500000 | pass |
| put | -0.498505 | -0.500000 | pass |

## Greeks

| Greek | Max relative error | Tolerance | Status |
| --- | --- | --- | --- |
| delta | 4.9254e-07 | 2.0000e-06 | pass |
| gamma | 4.4606e-06 | 2.0000e-05 | pass |
| vega | 5.8051e-10 | 2.0000e-06 | pass |
| theta | 1.2896e-09 | 2.0000e-06 | pass |
| rho | 9.1824e-10 | 2.0000e-06 | pass |

## VaR / CVaR backtest

| Confidence | Observed breaches | Expected breaches | Observed rate | Expected rate | Kupiec p | Christoffersen p | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.950000 | 37 | 26.450000 | 0.069943 | 0.050000 | 0.046538 | 0.046113 | pass |
| 0.990000 | 9 | 5.290000 | 0.017013 | 0.010000 | 0.140575 | 0.135794 | pass |

## Markowitz

| Metric | Value | Tolerance |
| --- | --- | --- |
| Max \|sum(weights) - 1\| | 2.2204e-16 | 1.0000e-08 |
| Max weight difference vs SciPy reference | 4.1823e-04 | 5.0000e-04 |
| Frontier convexity violation | 0 | 2.0000e-06 |

## ML signal walk-forward

| Fold | Samples | ROC-AUC | Shuffled AUC | Shuffle deviation | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | 1008 | 0.510079 | 0.499684 | 3.1620e-04 | pass |
| 2 | 1008 | 0.507745 | 0.500893 | 8.9328e-04 | pass |
| 3 | 1008 | 0.518472 | 0.500143 | 1.4283e-04 | pass |
| 4 | 96 | 0.580357 | 0.493888 | 0.006112 | pass |

## RAG retrieval

| k | Hit rate | Threshold | Status |
| --- | --- | --- | --- |
| 1 | 1.000000 | 0.750000 | pass |
| 3 | 1.000000 | 0.900000 | pass |
| 5 | 1.000000 | 1.000000 | pass |
