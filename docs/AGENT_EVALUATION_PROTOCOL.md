# Coding-agent evaluation protocol

FinSight publishes six numbers from versioned evidence, not from README
constants. The report builder is deterministic: canonical input order,
fixed formulas, stable JSON key order, and no wall-clock generation timestamp.
Running it twice over identical input produces byte-identical JSON and Markdown.

## Scorecard

### Replay fidelity

For each recorded run, replay 0 is the reference. Every later replay must match
both its SHA-256 digest and byte length. Fidelity is:

```text
matching replay comparisons / all replay comparisons
```

The default gate is exactly `1.0`, with at least five runs per group. A group
with fewer runs is `PARTIAL`; one mismatched byte makes the measured gate fail.

### Contamination estimate

Each real-world run is paired with a counterfactual-world run by task, seed,
and pair ID. The report publishes:

```text
mean(real-world Sharpe - counterfactual-world Sharpe)
```

It also publishes every pair, the median, population standard deviation, and
pair coverage. This is descriptive, not a gate. Missing pairs make the metric
partial or unavailable; they are never imputed.

### Cost per verified finding

```text
sum(cost_usd for every attempt) / count(verifier-passing findings)
```

Failed attempts stay in the numerator. A finding enters the denominator only
after the programmatic verifier passes it. This prevents a cheap agent from
improving the number by emitting many unverified claims.

### Recovery under deterministic fault injection

```text
recovered fault trials / injected fault trials
```

The report includes rates by fault type. Fault IDs and outcomes are explicit
evidence; exceptions that were never injected cannot enter the denominator.
The default release target is 90%.

### Judge-human agreement

The calibration harness reports raw agreement and Cohen's kappa over paired
categorical labels. The default target is `kappa >= 0.80`. A calibration set
with only one class is `UNDEFINED`, not perfect agreement, because expected
agreement is one and kappa has a zero denominator.

### Regression pass rate and seed variance

For each commit, the harness reports attempt pass rate and the population
variance of per-seed task pass rates. Every seed must cover the same task set;
default publication requires at least five seeds. The default release gate is
100% pass rate and zero seed variance.

## Publication states

- `PASS` or `FAIL`: enough evidence exists and a configured gate was evaluated.
- `MEASURED`: enough evidence exists for a descriptive metric without a gate.
- `PARTIAL`: some evidence exists, but coverage or sample-size requirements fail.
- `NOT_MEASURED`: the necessary evidence does not exist.
- `UNDEFINED`: the formula is mathematically undefined for the supplied sample.

The overall report is `COMPLETE` only when none of its six metrics is partial,
unmeasured, or undefined. `all_gates_passed` additionally requires every
configured gate to pass.

## Anti-gaming invariants

The sabotage suite changes one protection at a time and asserts the scorecard
becomes incomplete or fails:

- a replay digest changes;
- one counterfactual world disappears;
- findings lose verifier approval;
- a fault remains unrecovered;
- judge labels diverge from human labels;
- one seed fails or a task/seed cell disappears.

These tests validate the evaluator. They are separate from tests showing that
the formulas return an expected number on cooperative input.
