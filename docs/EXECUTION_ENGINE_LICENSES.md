# Optional execution-engine license boundary

This file is an engineering inventory, not legal advice. Re-check the exact
upstream revision and terms before distributing a worker image or launching a
commercial product.

| Component | Upstream terms recorded for v0.2.3 | Forge handling |
| --- | --- | --- |
| VectorBT | Apache-2.0 with Commons Clause | Optional external worker only. Do not make it a core requirement. Commercial use requires specific review because upstream says products/services primarily comprising the software may not be sold. |
| NautilusTrader | LGPL-3.0 | Replaceable external worker/library boundary; preserve license/notices, relinking and source obligations as applicable. No live-order capability is exposed. |
| hftbacktest | MIT | Optional external worker; retain copyright and license notice in any distributed worker image. |
| evgerher/hft-backtesting | Apache-2.0 | Optional legacy differential-reference worker; preserve license/NOTICE obligations and do not describe it as modern production parity. |
| Prediction-market pack | FinSight project code | Clean-room formulas and contracts only. No code is copied from the unlicensed Kalshi repository described in the design brief. |

Authoritative upstream references:

- VectorBT README and license:
  <https://github.com/polakowo/vectorbt/blob/master/README.md?plain=1> and
  <https://github.com/polakowo/vectorbt/blob/master/LICENSE.md>
- NautilusTrader repository and license:
  <https://github.com/nautechsystems/nautilus_trader> and
  <https://github.com/nautechsystems/nautilus_trader/blob/develop/LICENSE>
- hftbacktest repository and license:
  <https://github.com/nkaz001/hftbacktest> and
  <https://github.com/nkaz001/hftbacktest/blob/master/LICENSE>
- legacy HFT repository and license:
  <https://github.com/evgerher/hft-backtesting> and
  <https://github.com/evgerher/hft-backtesting/blob/master/LICENSE>

No upstream package or source file is vendored in Forge core. Engine names in
descriptors and worker entrypoints identify interoperability targets and do not
claim upstream endorsement.
