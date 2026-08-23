# FinSight Alpha v2 truth foundation

This change establishes the minimum trustworthy substrate for the broader v2
research-lab plan. The Forge v0.1 contracts, point-in-time environment, four
deterministic verifier stages, reward shaping, and two frozen cases now build on
that substrate. It does **not** claim that the full MCP, sandbox,
agent-orchestration, adaptive-routing, or RLVR roadmap is complete.

## What is authoritative now

### Point-in-time computations

- Strategy backtests require an explicit `as_of` date, fetch a bounded window,
  and enforce the cutoff locally before calculation.
- ML signals require an explicit `as_of` date. The requested cutoff is part of
  both the server cache key and the returned truth metadata.
- Computation responses carry a content-addressed `run_id`, input hash, data
  version, calculation/model version, epistemic state, and timing metadata.
- Analysis runs and forecast issues are recorded in tenant-owned ledgers.

### Evidence and snapshots

- External JSON responses are stored as immutable, content-addressed snapshots.
- Snapshot metadata is registered as a dataset version with retrieval time,
  vintage, schema fingerprint, content hash, storage URI, and row count.
- Production requires durable GCS object storage and fails closed if object or
  metadata persistence fails.
- Raw snapshot retrieval authorizes the tenant inside the repository boundary.
  A grant must be active and explicitly include the `display` permitted use.
- Intelligence responses validate every lineage dataset before returning data.
  Missing, legacy, unregistered, or unlicensed evidence is denied.

### Research isolation

- RAG indexes are namespaced by organization, user, and ticker.
- Chunk metadata carries the same ACL scope.
- Retrieval requires an explicit ticker and exact ACL match; an empty scoped
  result raises `NoEvidenceError` instead of searching a broader corpus.

### ML timing and evaluation

- Volatility regimes use expanding, lagged historical thresholds; later data
  cannot relabel earlier rows.
- Chronological splits support horizon purging and an optional embargo.
- Model family selection happens on a purged validation window. The selected
  family is evaluated once on an untouched outer holdout.
- Current inference is made from a separately supplied unlabeled latest row,
  never from the final holdout observation.
- Returned timing metadata identifies the signal date, feature cutoff,
  executable date, training span, data version, model version, and validation
  protocol.

### Backtest presentation

- The terminal renders the server backtest response directly. It no longer
  combines an API-success badge with independently generated client-side price
  paths or statistics.
- The UI displays the server epistemic state, `as_of` date, and run identifier.

## Operational requirements

Apply `sql/005_analysis_and_forecast_ledgers.sql` after the existing truth and
tenant migrations. In production, configure `GCS_BUCKET_NAME`; startup now
rejects a production configuration without it.

New provider dataset keys are registered automatically, but access remains
denied until a license and organization grant are explicitly configured. This
is intentional fail-closed behavior.

## Remaining v2 gates

The following work remains before calling the complete integration plan done:

1. Wrap data, document, model, and export capabilities behind typed MCP tools.
2. Add deterministic sandbox manifests and isolated execution for generated
   research code.
3. Implement the multi-agent research workflow and explicit evidence handoffs.
4. Connect the implemented Machine-Actionable Findings schema to agent runtimes
   and the eventual MCP tool plane.
5. Extend the implemented temporal, numerical, evidence, and reproducibility
   stages with statistical and robustness verifiers.
6. Expand the two shipped frozen Forge v0.1 cases and sabotage invariants into
   30 golden tasks.
7. Resolve issued forecasts after their horizons and compute calibrated model
   performance from the forecast ledger.
