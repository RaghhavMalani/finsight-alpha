# Browser and contract test inputs

These files are test inputs, outside Vite's `public/` directory and the deployed Replay manifest.

`historical-observatory.mjs` reads the original six Alpaca IEX model traces and byte hashes directly from the existing immutable PR #20 Git commit. Their payloads are removed from the current repository tree as well as deployed assets. The publication policy has no anonymous `publish_derived` grant for that source. Tests supply an explicit hypothetical permission envelope to exercise the existing visual and model contracts; production never receives that envelope or these trace files. Shallow clones must fetch commit `f5275b59ef7cbc44e5314492de4c329548b086bf` to run those tests. Existing Git history is preserved.

`market-weekly.TEST_ONLY.json` comes from the existing `markets/quote-bars-5y.simulated.json` fixture. The exporter calculated weekly rebased performance, drawdown, realized volatility, and a bounded fit using the existing HMM implementation. Its browser test displays `TEST_ONLY`; it supplies no public market evidence, and its numbers must never be used in product screenshots or findings.

The unmocked production checks in `verify-replay.mjs` run separately from those positive fixture checks. They verify actual publication permissions, checksums, unavailable coverage and the absence of API/vendor requests.
