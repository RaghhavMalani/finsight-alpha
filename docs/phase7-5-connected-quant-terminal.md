# Phase 7.5 — Connected Quant Terminal implementation report

## October 31 packaging amendment — Candidate A rejected; Stage 10 stopped

**NO-GO.** Framework isolation makes Candidate A's initial ownership exact, but actual project code fails all three unchanged caps. Total user download and request-count guards also fail. Candidate B is **not run**: A resolves ownership, and the amendment requires STOP on a genuine size failure. No packaging strategy is accepted. The original Vite configuration and production output are restored; the active mixed build's project attribution remains **INDETERMINATE**. No whole-framework size is relabelled a project-owned failure.

Main remains `00aa3ea6e7490f4ac47cdd9992b848317031270f`. Verification implementation: `5506a3666197a55890fa5dc38a042c437832d49e`. Application source, package-lock, plugins, Nitro Vercel preset, SSR entry, routing, React behavior, environment and scientific artifacts are unchanged. PR #30 stays draft/open/unmerged, auto-merge off. Excluded commit `6f99daa` remains excluded.

| Candidate A exact gate | Actual gzip bytes | Unchanged cap | Excess |
|---|---:|---:|---:|
| Terminal core |43,252|24,576|18,676|
| Risk complete project initial, including core |84,311|65,536|18,775|
| Factors complete project initial, including core |71,403|65,536|5,867|

| Candidate A route | Project gzip | Vendor gzip | Total gzip | JS requests | Before gzip /requests | Increase bytes /requests |
|---|---:|---:|---:|---:|---:|---:|
| risk | 84,311 | 122,971 | 207,282 | 44 | 194,851 /28 | +12,431 /+16 |
| factors | 71,403 | 126,316 | 197,719 | 49 | 184,863 /33 | +12,856 /+16 |

Both totals exceed the stricter 5%/8KiB regression bound of8,192bytes. Both add16requests, exceeding+4. Factors' increase is6.95%; Risk's6.38%. These are retained rejected measurements, not accepted performance.

Candidate A uses the supported client-only `vite.environments.client.build.rolldownOptions.output.codeSplitting` groups. The exact previous hidden-map analysis proves the selected React/react-dom, scheduler, @tanstack, seroval/seroval-plugins, Sonner and use-sync-external-store families participate in initial Replay. Entry-aware grouping and disabled recursive capture leave other dependencies on automatic lazy boundaries. No universal vendor chunk, added plugin or dependency is used. The complete candidate config, predeclaration and one complete fresh-browser measurement are retained in `initial_packaging_amendment_oct31` in the existing proof; the candidate is reverted rather than activated. Supported API references: [Vite build options](https://vite.dev/config/build-options.html), [Rolldown manual splitting](https://rolldown.rs/in-depth/manual-code-splitting).

Risk readiness requires verified current Replay summary, Immune status, Issue console and populated usable Issue feed. Factors readiness requires the ready catalogue and selected factor evidence. Each fresh context starts empty; no palette/search/history, hover or cache is used. Full rendered text, typed URL, mode, controls, context, availability labels, Issue rows, factor selection, evidence links and every requested original ID/SHA/byte count are equal before/after. The static asset guard permits real emitted tilde names; optional dependency checks use module provenance, not entry-set suffixes. No provider/private/scientific calls occur. All six claim flags remain false; D6 and both schedules stay disabled.

Every initial body has exact ownership: zero MIXED/UNKNOWN for Candidate A. Installed package identities match the unchanged lock; mapped vendor source contents match disk exactly. Unmodified ViteBuilder return values provide complete rendered-module provenance without a plugin/hook. Only bodies whose complete executable module set and mapped sources are vendor may be excluded; compiler glue is covered by that independent emitter provenance. Virtual/unresolved compiler helper bodies are charged fully as project code, including1,097gzip bytes for the two helpers without maps. No source percentages, fragment gzip or filename exemption is used.

Terminal core is the SHA union of shared initial project bodies plus bodies containing the static initial shell/context closure. In A, all terminal-specific bodies are already in the22-body shared set; total43,252gzip. Both route caps include this complete core. Duplicate terminal bodies would each count; the self-test verifies this.

Two complete clean production builds (hidden diagnostic maps, then normal output) produce the same144final JS body digests, module ownership sets, logical chunk families, imports and dynamic-import graph. Two internal pre-emission world-atlas URL placeholder strings differ; every final emitted body remains byte-identical. Heavy Three/React Three/Drei/globe/Observatory dependencies, history/search/palette/legacy and execution engine modules remain absent from initial Risk/Factors. No maps are tracked, deployed or left in normal public output.

The rejected candidate is preserved below at whole-body granularity. Full source lists, per-package versions, map/content digests, all request/preload/execution observations and exact evidence snapshots are in the proof. R/F indicate the fresh route requiring the body.

| Emitted body | Ownership | R | F | Decoded bytes | Gzip bytes | Complete SHA256 |
|---|---|---|---|---:|---:|---|
| `api-uCskoLiE.js` | PROJECT_OWNED |  | Y | 1,433 | 781 | `5a7adf87bea4b29119cf26ca4d8fa47f7443a4483c944d5296a7e70b4578f4a4` |
| `bench._benchmarkId-DlHk-iFQ.js` | PROJECT_OWNED | Y | Y | 3,062 | 1,146 | `7cdb1ce2f62a11f51dec383498358f50bf5b5fc573990013162fc872994f6bbc` |
| `client-DnuZJJC4.js` | PROJECT_OWNED | Y | Y | 2,256 | 1,136 | `dabdd1357c8e8d0b8f05b69a67d462a6753f2860114dd183bf08a0465d5532bb` |
| `context-Ds-Fy7p1.js` | PROJECT_OWNED | Y | Y | 16,316 | 6,305 | `3dfefbecaeb9d500bc49724ac182b6189ceaf8fe33a8c73667e7417e498b09c0` |
| `contracts-0Y_et4cj.js` | PROJECT_OWNED |  | Y | 7,715 | 3,316 | `8c74d4982120fd16fe994d80730b55ce2e89edc5f5d21f8fd37b8715c5804686` |
| `contracts-CGi5jbv7.js` | PROJECT_OWNED | Y | Y | 15,677 | 5,828 | `74a4d90d0086a71c2b38849149d6feb427e859a4777a8d4bb9800672a151eeee` |
| `contracts-CVS_WHkW.js` | PROJECT_OWNED | Y | Y | 4,918 | 2,056 | `59498803b8f9714f6e41973203c0bb4876cd9738a14cacfdda8af97f7fa333b7` |
| `factors-JMP_ct66.js` | PROJECT_OWNED |  | Y | 17,958 | 5,779 | `2614a64b6d2fd35340aceb7690ffb46e995ffadfb1ddf548b2dc8a793a248ea6` |
| `forge-rKOOW6IL.js` | PROJECT_OWNED | Y | Y | 3,170 | 1,203 | `70fa527de3fe1ed1cbe7f3d2cb9eea0bddcedceeffa0ec44268efabfb85d0987` |
| `index-b-IBQ-tQ.js` | PROJECT_OWNED | Y | Y | 16,528 | 4,962 | `3352b459894901e7a05a52c76296594dbc91a005202aa85c7436560e3634b7af` |
| `instruments-BNqRWfgg.js` | PROJECT_OWNED | Y | Y | 2,982 | 1,380 | `278ef97ce45f61e13cd760dfae1a090241f2193bb761c5a20689681286370560` |
| `links-Du0uG42u.js` | PROJECT_OWNED | Y | Y | 1,099 | 561 | `2aeeb6c88ffa37981431a45d246693f34246572637d2e6a94f6adaf514347d49` |
| `markets-zqWHq4aw.js` | PROJECT_OWNED | Y | Y | 4,554 | 1,617 | `ca6aec38c2767fd832a8b3a3280b2da200cc3124d36794f6bde456b6014df2c7` |
| `markets._ticker-Dkcylhrg.js` | PROJECT_OWNED | Y | Y | 1,589 | 725 | `8764cc6a40a1b1a962f7a654c8d5d1ce0df7dff7c7981601c4aa1e971bfb31de` |
| `markets.index-b15lt1us.js` | PROJECT_OWNED | Y | Y | 1,375 | 630 | `9fd912e1be4d0e8035108d4f457af40998beb55b4bbeafd54a80841e520e2e09` |
| `mode-BrpsJuN7.js` | PROJECT_OWNED | Y | Y | 789 | 499 | `5933c67c5f4bc7f848c619cf5029b888eaa071bbb1c3f567fffe7bf0b3ae8c85` |
| `observatory-CFG71zGh.js` | PROJECT_OWNED | Y | Y | 977 | 590 | `a2163a007de45238ef04c34dbc9610ea600f58c6d0f624ed9eb42f133f17b62b` |
| `preload-helper-Czpn1I53.js` | PROJECT_OWNED | Y | Y | 1,196 | 675 | `aba87f2a53e45ecdc9113fc30387d16e449d1676428cf5f82dd624c1df97d152` |
| `query-DkmPzxGu.js` | PROJECT_OWNED |  | Y | 111,285 | 16,592 | `2dfc352ec8cd08882dd03a3dc9b60594606b63d0900d2cef968ecab7128b7b92` |
| `reality._artifactId-DOXIp75G.js` | PROJECT_OWNED | Y | Y | 3,202 | 1,200 | `ba29ab0fac3ec7d9a2e5a3cd69179493a2075df98e99eddc29b9b50035c7642e` |
| `RetainedDiagnostics-JiL3zrUi.js` | PROJECT_OWNED |  | Y | 4,394 | 1,683 | `b0535587515c7306aa487938526ab2a54120170730f9675d03daed95fe63fc3d` |
| `ripple-0B0clhCR.js` | PROJECT_OWNED | Y | Y | 530 | 379 | `d680999be877a8dadebb36aaf5e1bf2f4806be0eb2b52db24b50e8e562d922d2` |
| `risk-C0N0W-Pv.js` | PROJECT_OWNED | Y |  | 236,488 | 41,059 | `caf72e78320c3871a6fd54e3a79a6750d3ad34834b142f0147ec8329835ea120` |
| `rolldown-runtime-QTnfLwEv.js` | PROJECT_OWNED | Y | Y | 694 | 422 | `5db5ba82eef00d1dee7e86e663098c9427d01183a88d357437daff295aec3e75` |
| `runs._runId-fLSdKhWl.js` | PROJECT_OWNED | Y | Y | 3,189 | 1,220 | `fd112fab2ec25b7558a2cedcd6324d9544acd7c8ce1e9ebc4f9adb96b6373acf` |
| `runs.index-DveobGY7.js` | PROJECT_OWNED | Y | Y | 3,453 | 1,291 | `3023783f381600b8e2694aaad4f46c459bf9e41b6a775031d0a12de64aa60176` |
| `TerminalShell-RtnTE8xb.js` | PROJECT_OWNED | Y | Y | 23,782 | 8,731 | `ad71fb8335003eb1370b29d87ce899ef58f40c3e0b15832336d15fb162ced581` |
| `vendor-framework~index-CMSyeXkN.js` | VENDOR_ONLY | Y | Y | 106,924 | 35,250 | `06d774c049e4e6c6bfa1fd52a8a22e7eccbd0e290a182069839bbad7f73c7355` |
| `vendor-framework~index~bench~login~runs~worlds~runs.index~runs._runId~risk~LocalRiskLab~res~g7nnsqrw-CIxEorsV.js` | VENDOR_ONLY | Y | Y | 7,899 | 2,990 | `746b3bf847361bcee24b6a188dce1a6cae9bac7fa8972753abc7718e70fbed8b` |
| `vendor-framework~index~bench~login~runs~worlds~runs.index~runs._runId~risk~LocalRiskLab~res~m4zozcb9-p8Cqmyo1.js` | VENDOR_ONLY | Y | Y | 900 | 495 | `a20fe0fed244aa670dfbb93b1c925a2c45f6c0319caac6136efa5fe94b91fd70` |
| `vendor-framework~index~bench~login~runs~worlds~runs.index~runs._runId~risk~LocalRiskLab~res~o2h20sj3-HGN73gMW.js` | VENDOR_ONLY | Y | Y | 1,759 | 810 | `617d891bd36e8553c78c7eb07999513a20fba19dc7bf2b64fe740d92be0715be` |
| `vendor-framework~index~bench~runs~markets-DUuLK7xy.js` | VENDOR_ONLY | Y | Y | 4,979 | 1,941 | `fff81b04064572245ea5c6ff1ada249626b2576df94b2eb720605768627977dc` |
| `vendor-framework~index~bench~runs~runs.index~runs._runId~reality._artifactId~observatory~ma~fqze8n7g-DLTE-HSj.js` | VENDOR_ONLY | Y | Y | 32 | 52 | `2eb1d17f334d79f5c2b7c68aa45a2b50b46a7b2416a9a0f5e7de6ff7f2430322` |
| `vendor-framework~index~bench~runs~worlds~runs.index~runs._runId~risk~research~reality._arti~de70rc7p-CCrNN9XU.js` | VENDOR_ONLY | Y | Y | 275 | 212 | `b8dcd8d709b9f5f756c1990da2f785d0d2fa43fffa18baecd8db61e318dd24ed` |
| `vendor-framework~index~LocalRiskLab-dunb-ndK.js` | VENDOR_ONLY | Y | Y | 32,775 | 9,254 | `a6f9f7263bfdb54665cfe6f21a634e7ce0c3a12cd3ca0fc19f9f9bf311dbf1dd` |
| `vendor-framework~index~LocalRiskLab~TrajectoryGraph3D~PotentialLandscape3D-hgVlrdL4.js` | VENDOR_ONLY | Y | Y | 3,679 | 1,428 | `952c1e2911cdb18380f98883654c37a58bad8335b61a9598b41237c77e080125` |
| `vendor-framework~index~login~worlds~runs.index~runs._runId~risk~LocalRiskLab~research~reali~7tu7gaeg-D4dnA11O.js` | VENDOR_ONLY | Y | Y | 9,472 | 4,338 | `8640663bc66ab86a35e16ff5e4ac2f8f66fd1020db38092eb1804554ab0c6000` |
| `vendor-framework~index~login~worlds~runs.index~runs._runId~risk~research~reality._artifactI~g1s1leec-bk0WWn8A.js` | VENDOR_ONLY | Y | Y | 447 | 278 | `8fc79eb201cdbf5c4dc825dccfb355d358e1fb4eec808de9af9c202c384e0fec` |
| `vendor-framework~index~markets~RiskScreen~ResearchScreen~OptionsScreen~FundamentalsScreen~B~bw044foi-FBbVcLD3.js` | VENDOR_ONLY | Y | Y | 3,470 | 1,186 | `46e4efeb15dd322f8b4fa936c288c3834b74bd7d76c7c5bef464e52ca448191a` |
| `vendor-framework~index~runs.index~runs._runId~reality._artifactId~observatory~markets~marke~cesbdy4u-Ca7cig_d.js` | VENDOR_ONLY | Y | Y | 4,475 | 1,638 | `c0e4586a2a34411a5a6b05a9b8df91862111bd5a81e23a10cd498d77a7852feb` |
| `vendor-framework~index~runs.index~runs._runId~reality._artifactId~observatory~markets~RiskS~dcjn7khe-D6OkoXuV.js` | VENDOR_ONLY | Y | Y | 310 | 231 | `59e11708ffba35427e257d57f4e4c0a43e310de3d4678a49ef607e45229854b2` |
| `vendor-framework~index~TrajectoryGraph3D~PotentialLandscape3D-B1-vS4XD.js` | VENDOR_ONLY | Y | Y | 179,089 | 55,964 | `d77cb5e93f3cb0e1a14a676d95d2c7768e0ae2e06029bae7e06e58f6b6bce802` |
| `vendor-framework~index~worlds~runs.index~runs._runId~LocalRiskLab~reality._artifactId~marke~kexmzehl-ChMwgRNV.js` | VENDOR_ONLY | Y | Y | 14,717 | 4,994 | `6a413c0168378e07e38a452746242150a75b0ed62328bdeb83e5b3cc8cfb51ad` |
| `vendor-framework~index~worlds~runs.index~runs._runId~risk~LocalRiskLab~research~reality._ar~cj54yhtk-DdtgQ-Hx.js` | VENDOR_ONLY | Y | Y | 513 | 359 | `1d4e8da2f8dcfac60c6194cdd61a8da731f7b655b41d98cf110c5185a73e012c` |
| `vendor-framework~index~worlds~runs.index~runs._runId~risk~research~reality._artifactId~mark~ccie10vi-DDs38RHf.js` | VENDOR_ONLY | Y | Y | 390 | 265 | `300b3b896176599d82aa15eeef876e3adb503be51eab0c080341169f51dee6aa` |
| `vendor-framework~index~worlds~runs.index~runs._runId~risk~research~reality._artifactId~mark~f887qbzp-h71yyqxh.js` | VENDOR_ONLY | Y | Y | 930 | 514 | `cacebb02a1804f22b2ff49a7514a6cee0ce5ac63abad6b508a70b1744fe99f35` |
| `vendor-framework~index~worlds~runs.index~runs._runId~risk~research~reality._artifactId~obse~fwm1mbii-8MQ97vxR.js` | VENDOR_ONLY | Y | Y | 350 | 257 | `6665a81921a67e2d422d66c55b174684a8dfeb56da382aadaa5e9c30d585a7bb` |
| `vendor-framework~index~worlds~runs.index~runs._runId~risk~research~reality._artifactId~obse~gqo1b70r-LNzuAcxG.js` | VENDOR_ONLY | Y | Y | 1,027 | 515 | `e136955446bf6569b23032306cdad37229d7e3fd6afbeb9bee6e42b7bcee5d39` |
| `vendor-framework~worlds~runs.index~runs._runId~LocalRiskLab~reality._artifactId~markets~Rep~lijjf5qh-B0dtcDN3.js` | VENDOR_ONLY |  | Y | 9,146 | 3,345 | `76d507bac5a5a456986ca9a2c111608fa5ab004b6af5fbba573f241a8d7c8a7b` |
| `workspaces-SOzXBCru.js` | PROJECT_OWNED | Y | Y | 1,348 | 696 | `c5c4f67332beecd724c4ffb6ffa6cceddd79bff19687e6ba01722e2e0c21338f` |

Project-owned module breakdown (complete bodies; no fragment accounting):

- `api-uCskoLiE.js` (781 gzip): `frontend-v2/src/lib/api.ts`.
- `bench._benchmarkId-DlHk-iFQ.js` (1,146 gzip): `frontend-v2/src/routes/bench.$benchmarkId.tsx`.
- `client-DnuZJJC4.js` (1,136 gzip): `frontend-v2/src/replay/client.ts`.
- `context-Ds-Fy7p1.js` (6,305 gzip): `frontend-v2/src/app/terminal/context.ts`.
- `contracts-0Y_et4cj.js` (3,316 gzip): `frontend-v2/src/regimes/contracts.ts`.
- `contracts-CGi5jbv7.js` (5,828 gzip): `frontend-v2/src/markets/contracts.ts`.
- `contracts-CVS_WHkW.js` (2,056 gzip): `frontend-v2/src/replay/contracts.ts`.
- `factors-JMP_ct66.js` (5,779 gzip): `frontend-v2/src/factors/FactorsShell.tsx`, `frontend-v2/src/factors/EvidenceCatalogue.tsx`, `frontend-v2/src/factors/OutputAudit.tsx`, `frontend-v2/src/factors/EvidenceLedger.tsx`, `frontend-v2/src/factors/FactorsWorkspace.tsx`, `frontend-v2/src/routes/factors.tsx?tsr-split=component`.
- `forge-rKOOW6IL.js` (1,203 gzip): `frontend-v2/src/routes/forge.tsx`.
- `index-b-IBQ-tQ.js` (4,962 gzip): `frontend-v2/src/start.ts`, `frontend-v2/src/styles.css?url`, `frontend-v2/src/lib/lovable-error-reporting.ts`, `frontend-v2/src/routes/__root.tsx`, `frontend-v2/src/routes/index.tsx`, `frontend-v2/src/routes/artifacts.tsx`, `frontend-v2/src/routes/bench.tsx`, `frontend-v2/src/routes/data.tsx`, `frontend-v2/src/routes/dynamics.tsx`, `frontend-v2/src/routes/execution.tsx`, `frontend-v2/src/routes/factors.tsx`, `frontend-v2/src/routes/globe.tsx`, `frontend-v2/src/routes/login.tsx`, `frontend-v2/src/routes/research.tsx`, `frontend-v2/src/routes/risk.tsx`, `frontend-v2/src/routes/runs.tsx`, `frontend-v2/src/routes/worlds.tsx`, `frontend-v2/src/routes/bench.index.tsx`, `frontend-v2/src/routes/markets.backtest.tsx`, `frontend-v2/src/routes/markets.fundamentals.tsx`, `frontend-v2/src/routes/markets.options.tsx`, `frontend-v2/src/routes/markets.research.tsx`, `frontend-v2/src/routes/markets.risk.tsx`, `frontend-v2/src/routeTree.gen.ts`, `frontend-v2/src/router.tsx`.
- `instruments-BNqRWfgg.js` (1,380 gzip): `frontend-v2/src/markets/instruments.ts`.
- `links-Du0uG42u.js` (561 gzip): `frontend-v2/src/app/terminal/links.ts`.
- `markets-zqWHq4aw.js` (1,617 gzip): `frontend-v2/src/routes/markets.tsx?tsr-shared=1`, `frontend-v2/src/routes/markets.tsx`.
- `markets._ticker-Dkcylhrg.js` (725 gzip): `frontend-v2/src/routes/markets.$ticker.tsx`.
- `markets.index-b15lt1us.js` (630 gzip): `frontend-v2/src/routes/markets.index.tsx`.
- `mode-BrpsJuN7.js` (499 gzip): `frontend-v2/src/replay/mode.tsx`.
- `observatory-CFG71zGh.js` (590 gzip): `frontend-v2/src/routes/observatory.tsx`.
- `preload-helper-Czpn1I53.js` (675 gzip): `virtual:vite/preload-helper.js`.
- `query-DkmPzxGu.js` (16,592 gzip): `frontend-v2/src/factors/read-plan.generated.ts`, `frontend-v2/src/factors/manifest.ts`, `frontend-v2/src/factors/contracts.ts`, `frontend-v2/src/factors/query.ts`.
- `reality._artifactId-DOXIp75G.js` (1,200 gzip): `frontend-v2/src/routes/reality.$artifactId.tsx`.
- `RetainedDiagnostics-JiL3zrUi.js` (1,683 gzip): `frontend-v2/src/factors/RetainedDiagnostics.tsx`.
- `ripple-0B0clhCR.js` (379 gzip): `frontend-v2/src/lib/ripple.ts`.
- `risk-C0N0W-Pv.js` (41,059 gzip): `frontend-v2/src/risk-manager/strict-json.ts`, `frontend-v2/src/risk-manager/bindings.ts`, `frontend-v2/src/risk-manager/monitoring-catalog.generated.ts`, `frontend-v2/src/risk-manager/contracts.ts`, `frontend-v2/src/risk-manager/read-plan.generated.ts`, `frontend-v2/src/risk-manager/manifest.ts`, `frontend-v2/src/risk-manager/RiskShell.tsx`, `frontend-v2/src/risk-manager/evidence.ts`, `frontend-v2/src/risk-manager/client.ts`, `frontend-v2/src/risk-manager/filters.ts`, `frontend-v2/src/risk-manager/IssueFeed.tsx`, `frontend-v2/src/risk-manager/IssueInspector.tsx`, `frontend-v2/src/risk-manager/CoverageMatrix.tsx`, `frontend-v2/src/risk-manager/SweepHistory.tsx`, `frontend-v2/src/risk-manager/RiskWorkspace.tsx`, `frontend-v2/src/routes/risk.tsx?tsr-split=component`.
- `rolldown-runtime-QTnfLwEv.js` (422 gzip): `virtual:rolldown/runtime.js`.
- `runs._runId-fLSdKhWl.js` (1,220 gzip): `frontend-v2/src/routes/runs.$runId.tsx`.
- `runs.index-DveobGY7.js` (1,291 gzip): `frontend-v2/src/routes/runs.index.tsx`.
- `TerminalShell-RtnTE8xb.js` (8,731 gzip): `frontend-v2/src/app/command/CommandLine.tsx`, `frontend-v2/src/app/terminal/compatibility.ts`, `frontend-v2/src/app/terminal/ContextBar.tsx`, `frontend-v2/src/app/terminal/TerminalShell.tsx`.
- `workspaces-SOzXBCru.js` (696 gzip): `frontend-v2/src/app/workspaces.ts`.

The existing terminal browser verifier now has a CI entry `npm run verify:terminal:initial`. It captures unmodified build metadata and private hidden maps, restores a second normal build, proves body/module/graph determinism, runs fresh initial journeys, compares the retained baseline, and exits nonzero for unresolved ownership,24/64KiB failure, total/request regression or eager optional dependencies. Eleven synthetic sabotage/boundary tests pass, including mixed/unknown, one-byte excess, misleading chunk names, duplicate shell code and both regression guards. A local full execution against the restored active build exits1 on mixed ownership as expected, with zero load/request regression and equal evidence/UI. The restored build does **not** pass attribution; CI blocks it honestly.

All560static and237targeted checks pass. Typecheck/build/format pass; lint0errors/5existing Fast Refresh warnings. All9protected frontend byte hashes and11generated modules remain unchanged; all126restored JS bodies equal the accepted cold-search output. Search31,507/32,768,523identities,p952.0ms, command8,146 and Market11,946 remain accepted and are not reoptimized or rebenchmarked. All previous negative results, including41,213/24,576,Risk80,907/65,536,Factors66,068/65,536 and mixed-index analysis, remain below and in the proof.

Phase5, Phase6 and Phase7 read-only archive verification all pass. The930-file freeze retains221originals /126routes /6withdrawals /27Risk artifacts, with exact scientific inventory `9fc53ec0d8eba8aa16a89838b512ccee7e845e425835ec1e188a786a0bfb3d7d`. All9protected source hashes and the approved plan remain exact. Scientific-operation increments remain zero. Stage10 remains stopped; integration, B1–B6, comparisons/preferences/exports, layouts/tables/charts, complete capability honesty, full browser matrix, clean clone, exact-head CI and Vercel acceptance remain pending.


Status: COLD GLOBAL SEARCH REPAIR PASSES; INITIAL 24/64 KiB ATTRIBUTION REMAINS INDETERMINATE. Stage 10 remains STOPPED. PR #30 remains DRAFT, OPEN, UNMERGED, with auto-merge disabled.


## 2026-10-31 — Reconciled cold discovery repair (PASS; initial attribution pending)

Runtime source commit: `227377d10c29a59fc8cda60fd9a33d7d128fa104`. Merge commit `d9307007158dd8fef4708e25542781aac70245a8` reconciles main `00aa3ea6e7490f4ac47cdd9992b848317031270f` before optimization. The read-only admission audit passes **1,892 checks**:360prior manifest entries,340prior available originals,146route keys and every old sealed file are retained. Seven Data envelopes and four sealed raw reports are added; only six mutable aliases/manifests change. New manifest:367entries /347AVAILABLE /20UNAVAILABLE /146routes,476,521bytes,SHA `41ed0f1b3aa66b44603723b254ad27efcc064f1b8c0e7460bbaf4eda50511f54`,as-of2026-10-30T07:19:03.724605Z. No scientific workflow was rerun.

Reconciliation, two deterministic complete generations and the930-file freeze passed before cold capacity was remeasured. The fresh reconciled baseline still failed at **38,598 gzip bytes**; this is retained separately from the older38,508 failure.

The repair uses the generated availability label directly for navigation presentation. Full runtime/business capability evaluation remains authoritative in commands, explicit history derivation and destination actions. The full capabilities source is unchanged. A build/history authority callback preserves the existing complete-source capability evaluation while avoiding its runtime import for ordinary global search. The empty palette uses static WORKSPACES and typed shell context. Search validates its own closed manifest envelope, canonical records and both digests, without a seed request. The generator still cross-checks against its exact input manifest, complete original contracts, source choices and full capability authority.

**Every one of the11 generated metadata modules remains byte-identical to the reconciled pre-optimization generation.** No entity, choice, country, namespace, status, selector or provenance binding was removed. No history redesign, new tracked runtime file, generated module, public artifact, backend/environment/protection change or scientific publication was introduced.

| Measured fresh path | Decoded JS | Gzip JS | Limit | Result |
|---|---:|---:|---:|---|
| Empty Risk /Factors palette |10,085|4,046|32,768|PASS|
| Cold global palette + first query, Risk /Factors |86,051|**31,507**|32,768|**PASS**|
| Risk RISK HIGH command |19,953|8,146|32,768|PASS|
| Market identity search |34,893|11,946|32,768|PASS|

The cold global union is four actual emitted bodies: `ForgeCommandPalette-D3vPtqAR.js`, `search-CKaQcyC3.js`, `catalog-CB-JFseV.js`, `search.generated-CpDThoKE.js`. First-query incremental code/metadata is27,461gzip; it is charged together with the4,046palette bytes. Hard-cap headroom is **1,261 bytes**; the preferred2KiB headroom is not claimed. Risk command uses `commands-BBqNjatr.js` and `capabilities-CzHS0cbL.js`; its23-byte emitted-size increase versus8,123 is reported, with command/capability source behavior unchanged. Market search uses only search/catalog machinery plus its independently required seed identities.

Fresh Risk and Factors discovery each request search.generated exactly once, with **seed before/during search0/0, full capability runtime before/during0/0, history0, recordings0, original readers0, workspace evidence/display shards0, original scientific fetches0, private/provider/API/mutation requests0 and legacy mnemonic/factor-series0**. Both filename and emitted-body markers check the full capability boundary. Explicit history remains separately requested. All actual body SHA/byte checks match the exact client graph; the source maps analysis independently matches126unchanged emitted JS bodies.

Search projection: **523 current identities** (two legitimate new Data origins), **43,449 decoded /15,808 gzip**, against131,072 /16,384. Logical digest `39aecae6d64e474e03d7e4b2a4abf0d1ee49c7fb66df57602569f8d17aaf2ac3`; payload digest `e7e3e696740307c892004a7ee112ca99f2e21079bcb7dcb0461d33333008567f`. All89current artifact selections have full source authority;322complete originals are validated overall. The browser label remains BUILD-VERIFIED NAVIGATION METADATA and does not attest that original evidence/provider data was fetched.

The first60-query Chrome run over523entities records **median1.2 /p952.0 /max2.4ms**, below30ms, with at most20materialized targets. Environment: HeadlessChrome156,Windows,24logical processors,1440x1000,DPR1. All30usable warm palette opens pass with p9598.6ms <=150; cold readiness also meets400ms after transfer. No benchmark was repeated to seek green. US-MKT/IN-MKT, Market product scoping, stale-result clearing, exact links and Escape focus restoration pass.

History is verified through the same approved mechanism. The legitimate epoch yields a lossless309-entity /498-edge /44-binding /663-choice logical union, digest `80749441687c0e26e428feb07671abaeae1991c42bb2167b6fe8bbc87ff31afb`. Default history retains16entities /0edges /16bindings; its prefix is11,797decoded /4,021gzip, SHA `6f730278eaec8a506c8d3d99f01a9b419981016893d5a165b76616988deab7a1`. The existing named retainedNavigation export now holds551records /965choices. Whole history module:73,796decoded /25,307gzip. Archive:293entities /498edges /28bindings,128,075decoded /29,911gzip, SHA `c9c40f9182c568904fea9d6ba8e8225336f377bfef84026e317661a29e6533b9`. Archive decoded headroom is2,997bytes /2.29%; the unchanged hard caps pass. Full retained search matches **1,101 identities /2,151 choices**. Changes are attributable to the new main publication; all11outputs are identical before/after the runtime repair.

**Verification:** all560static checks remain; all237targeted/freeze checks pass (the previous214 plus new cases). New checks cover self-contained validation, absence of seed/full-capability dependencies, exact build manifest authority, tampered binding/availability/IDs/type/workspace/array fields/canonical order/digests, unknown capability labels and mixed enabled/disabled choices. Typecheck/build pass; lint0errors /5Fast Refresh warnings. The930-file freeze again preserves221originals /126routes /6withdrawals /27Risk artifacts, inventory `9fc53ec0d8eba8aa16a89838b512ccee7e845e425835ec1e188a786a0bfb3d7d`.

### Separate initial-JS gate remains indeterminate

After the cold gate passed, a read-only hidden-source-map build produced **byte-identical JS for all126measured bodies**. Complete byte ownership is recorded, with vendor exclusions requiring unchanged main package-lock content and exact installed-source/source-map content equality. The main `index-WpfGPQ0B.js` body is340,277decoded /105,862gzip:320,170verified vendor-source bytes,16,256project-source bytes and3,851unmapped bytes. Source ownership covers every emitted byte. Other mixed assets are retained in the proof.

This does not create an accepted per-owner split of the actual mixed gzip stream. No filename exemption, proportional estimate or fragment gzip is promoted to an initial-cap PASS, and the whole framework total is not labelled an owned-code FAIL. The24KiB terminal-core /64KiB Risk/Factors gates therefore remain **INDETERMINATE**. Source maps are archived only in ignored local QA files; normal public build output is restored, all126JSbody hashes remain exact, and no source maps/public artifacts are published. No build configuration or runtime code was changed for this analysis. A separately reviewed packaging separation or accepted complete attribution method remains the next gate; Stage10 stays stopped.

The proof's `cold_search_runtime_repair_oct31` entry preserves the admission audit, both before/after generation maps, all request/body lists, latency samples, tamper results, source hashes and complete ownership summaries/reproducer. Every earlier failed measurement remains intact. All scientific-operation increments remain zero, all six claims false, D6disabled/deferred, Risk/regime scheduling disabled. The excluded local closure commit is still absent. PR#30 remains draft/open/unmerged, auto-merge disabled; full integration, browser matrix, clean-clone, exact-head CI and Vercel acceptance are not claimed.

## 2026-10-30 — Navigation projection amendment checkpoint (BLOCKED)

Runtime source commit: `89f6229c4438a3fd6bbdc46c9726099be83bc425`. Current main remains `32c3f827985dd5fbee0354780765e49e679cad57`; no main reconciliation was needed. The excluded local commit and original approved-plan hash remain unchanged. This is a local production-build checkpoint, with no final CI/deployment/readiness claim.

The new ignored `search.generated.ts` holds **521 current navigation identities**, 43,303 decoded bytes /15,724 gzip bytes, under 131,072 /16,384. Logical digest: `54bc4f21b090e89374a5352a9aaa7503610a88cd9a0f5305ed25845033288499`. The decoded set contains every and only the prior current surface, with no scientific arrays, full ReplayEntry, licences, sources, edges, bundles or provenance bodies. All 89 exact current artifact selections pass complete-source authority checks; generation validates 315 existing full originals overall. Labels state **BUILD-VERIFIED NAVIGATION METADATA** and do not claim browser verification of original evidence.

Search no longer loads workspace shards to rank current destinations. Empty palette uses navigation identities; free text loads the compact projection; grammar/context commands resolve independently; the unchanged mnemonic parser loads only for explicit legacy submission. Market search uses the seed's reference listings and US-MKT/IN-MKT identities, with global Risk/Data/audit/recording metadata excluded from that product flow. Stable ranking precedes target/capability materialization.

A complete retained search audit found **958 choices** outside the accepted history payloads. The user explicitly approved a named `retainedNavigation` export in the existing history module. It holds 544 navigation records and restores all **1,079 retained identities /2,118 exact choices**, without omission. The default history payload still has16 entities /0edges /16bindings, and the archive280entities /480edges /27bindings; their exact union remains296entities /480edges /43bindings /639version choices, digest `be13c8367301999aa16f50d93166e92fb6374d334efc17b30b116ec60c6189cb`. No repartition occurred. Default history output SHA `2e54d53a53ad830e575ed80832225006ad0deec90bd81787a177f68c2453820c` and archive SHA `959d93bc0a57bacf5422e730c9117b72e09301a8d653ac81c791df4e74fe8742` remain exact. Whole history file, including the approved export: **72,695 decoded /24,938 gzip**; archive remains122,982 /28,642. Both whole-file byte caps hold. Counts for the accepted default TerminalEntity collections remain16/280; the separate approved navigation projection's544 records are reported explicitly.

**Cold global search still fails the unchanged combined interaction cap.** Each asset is charged once by actual emitted JS body, default gzip, including generated metadata:

| Fresh path | Decoded JS | Gzip JS | Limit | Result |
|---|---:|---:|---:|---|
| Empty Risk palette |64,952|23,074|32,768|PASS|
| Empty Factors palette |64,952|23,074|32,768|PASS|
| Risk RISK HIGH command |19,919|8,123|32,768|PASS|
| Market identity metadata search |41,086|14,769|32,768|PASS|
| Cold global palette plus first query, Risk/Factors |105,887|**38,508**|32,768|**FAIL +5,740**|

The cold global union is `ForgeCommandPalette-PuIguHos.js`, `search-gtIZnyX9.js`, `catalog-B9zPZx1J.js`, `capabilities-C6-kVpR8.js`, `seed.generated-CBv0g-xJ.js`, `search.generated-DLJkOHrz.js`. The first query's15,434 additional gzip bytes are not free merely because the empty palette is usable. Full request/import lists, bodies' SHA/decoded/gzip counts, preloads, execution coverage and both rebuild hash maps for all11 modules are in the proof's `search_capacity_amendment` object. Final exact emitted-asset fingerprint: `271af304605111091d09823224345fec661e4d029349c4099883a79fb42c1cba`.

The first full browser report exposed38,507 combined bytes but mistakenly compared its PASS flag with the incremental15,434 bytes. That report and raw measurements remain untouched as negative harness evidence. The verifier now compares PASS against its reported combined total, asserts the invariant, and a fresh network-only capture fails both current-search journeys at38,508. No further capacity optimization was attempted after identifying this failure.

Scientific display payload requests in palette/current-search/Market-search/command: **zero**. Current search/archive boundary, US-MKT and IN-MKT targets, stale-result invalidation, Escape focus restoration and nine whole-original SHA checks pass. API/blocked requests, page errors and console errors are zero.

The single sixty-query Chrome measurement over521 entities records **median4.05 /p955.8 /max6.3 ms**, at most20 materialized targets. Environment: HeadlessChrome156 /Windows /24 logical processors /1440x1000 /DPR1. Node's independent sixty-query stage has median4.5918 /p957.0598 /max7.9727 ms. The30 usable warm palette opens have p95122.1ms <=150; cold palettes also meet400ms after transfer. The final network capture did not repeat either latency benchmark to seek green. Its search JS body SHA is identical to the measured performance module. These are stage observations, not final-head/full-browser-matrix acceptance.

**Validation:** 560 static navigation/contracts/projection checks pass;214 final targeted contracts/freeze checks pass, including all13 legacy function codes and exact historical command anchors with lowercase/whitespace. The initial pinned-whitespace failure is retained. Typecheck and production build pass; lint has0errors /5Fast Refresh warnings. Two complete rebuilds are byte-identical across all11 modules. The930-file archive verification again preserves221 originals /126 routes /6withdrawals /27Risk artifacts and inventory `9fc53ec0d8eba8aa16a89838b512ccee7e845e425835ec1e188a786a0bfb3d7d`.

**STOP:** initial24KiB core /64KiB Risk/Factors attribution remains INDETERMINATE and was not reopened, because the interaction architecture has not passed. Stage10 stays stopped for another explicit review. Caps, history, entities, source validation and protected frontend hashes are preserved. No new tracked runtime file, additional search shard, backend/publication/environment/protection change, or scientific operation occurred. All six claims remain false; D6 deferred/disabled; Risk and regime schedules disabled. Every previous capacity/search/timing failure remains in this report/proof with its original revision qualification.

## Product integration and scientific boundary

Implement the approved connected-terminal plan within its exact 24-file ADD /54-file CHANGE /no-DELETE manifest, plus the explicitly authorized approved-plan copy. Scientific changes: NONE. No capture, model/plugin/SeriesModel/factor/research/calibration/holdout/simulator execution, Risk sweep or regime refresh is part of this work. D6 remains DISABLED /DEFERRED; Risk and regime scheduling remain disabled; all six claims remain false.

## Clean start

The isolated worktree was created at current main `e65e6651ccbe758e490b2b48c240aac514cab7c6`, tree `40d82855f27388fd290e7ff34a7e8f9ec51cc22b`, with a clean working tree. Branch `feat/phase7-5-connected-quant-terminal` starts there. Local commit `6f99daa7cdb636aae79f3e2d8fa5b99994afdd2d` is not an ancestor and was not copied, cherry-picked, merged or published. No unrelated WIP was imported. Only `docs/phase7-5-connected-quant-terminal-plan.md` was copied as the approved planning artifact, exact SHA `e116ec8bbebf6790395577110b53c44a8443a2b8bc3d0b564a856916e79218a5`.

The approved plan was committed separately as `265ab48be2b80ddf0b7e96d9845e3c1d8181dac5`, directly parented by the approved main. Requested author/committer identity is used, with no attribution trailer.

## Already merged Phase 7 facts

Phase7 closure facts are supported by public Git/default-branch workflows, not unpublished local documentation: [first manual dispatch40376046937](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/40376046937), [identical repeat40376316769](https://github.com/RaghhavMalani/finsight-alpha/actions/runs/40376316769), and [retained publicatione65e665](https://github.com/RaghhavMalani/finsight-alpha/commit/e65e6651ccbe758e490b2b48c240aac514cab7c6). They retain35Issues /53Dataorigins /77checks and a true zero-write identical repeat. Their evidence is not regenerated here. Approved-plan references to unpushed closure notes are historical context only; this implementation/report does not depend on that local commit.

## Baseline freeze

Read-only Risk archive verification passed930frozenfiles,221originalartifacts,126originalrouteidentities,sixwithdrawals and27Risk artifacts. Scientific inventory is `9fc53ec0d8eba8aa16a89838b512ccee7e845e425835ec1e188a786a0bfb3d7d`. Global manifest has339artifacts /146routes,427665bytes,SHA `856dad3dd43eca28db7c4a157916b609c9687e7b5849bcc6979a526977fc2834`. Exact Git object and initial working-byte inventories are retained under `.tmp/phase75/baseline-proof.json`; a scope guard checks every original file against the approved manifest throughout implementation.

## Baseline defects

Fresh production browser reproduction is retained at `.tmp/phase75/repro/baseline-browser-proof.json`:33probes acrossChrome/Edge/Firefox, zero page errors, zero API/mutation/private/provider attempts. B1–B6 are reproduced before correction, along with Risk filter/Issue/panel/sweep refresh loss, Factor drawer refresh loss and Observatory recorded-step refresh loss. No Dynamics history desynchronization is claimed without evidence.

## Implementation checkpoint

The typed context, compatibility and evidence-link foundation is committed at `142537f6e3a90ce5966e482a7cded680875ebb08`. Its independent verifier now passes 173 checks covering URL identity, contradictory inputs, exact ownership, unavailable relations and freeze/scope guards. This contracts-stage result does not establish UI integration or final acceptance. The default full verifier intentionally fails while required areas are missing.

Main advanced independently to `49d7e7467181e73a8c5c1d771f226ec87c181961` with one Data publication. Merge `a8fd2dfb59085efb0793564904c7dd59412224a0` reconciles it after proving every prior manifest entry unchanged, seven complete new Data views and only the seven Data alias updates. Phase 7.5 did not run a publication. The read-only Risk archive verifier still passes with the original scientific inventory hash. Current manifest: 346 artifacts, 146 routes, 439879 bytes, SHA `c07a8034417a60d656a6f954bf10fc5d194ce39bdafc96bab294bba789010b34`.

The existing eight-module navigation/Market/Regime projection stage passes 305 independent checks, including two identical derivations matching all emitted files. It retains 1,110 metadata records, 859 declared edges and all historical version choices. The initial capacity failures are retained; lossless semantic/version interning and explicitly labelled current 100-row Regime windows fit the unchanged limits. This result excludes the pending ninth Observatory module and does not establish final UI or release acceptance. Install/build/dev/typecheck lifecycle hooks regenerate the ignored modules from exact current inputs. Root independently ran the install lifecycle, strict TypeScript, whole-frontend lint and the 305-check staged verifier successfully. Clean-clone, full browser integration, exact-head CI and Vercel remain pending. The source checkpoint is `9073b331c9eaa75cf2835849a2df7eaaf36e13cd`.

## Approved bounded Observatory scope clarification

The immutable `observatory:IN-MKT:hmm` original is 2,315,028 bytes (SHA `2718915e24cdb893665b0ed76930932043e2a25c2166eb9ac1b6b6ce2e061a36`), 217,876 bytes above the approved 2 MiB explicit full-read cap. Its original contains 100 recorded iterations and 250 posterior dates. A measured candidate containing the final 8 iterations (zero-based range [92,100)) and final 60 dates ([190,250)) is 56,376 JSON bytes /24,051 gzip bytes before the versioned wrapper. It has not been implemented or represented as a complete original.

Plan section 20 expressly limits new display windows to Market/Regimes. The user explicitly approved the bounded India HMM projection before implementation. The proposal preserves every original byte, labels both display ranges and full counts, rejects unsupported exact steps, and disables the oversized browser full read. No budget or frozen test is relaxed. The original plan remains byte-identical; this approval is recorded here as a bounded implementation amendment. The new selector must still pass the existing shard capacity, strict runtime schema, exact offset and deterministic rebuild gates before migration.

## Approved generated-module layout amendment

The approved India HMM window does not fit alongside all retained recordings metadata in the original module: decimal encoding measured 117,571 decoded /41,261 gzip bytes, and one lossless IEEE754 experiment still measured 90,634 /35,985. The cap remains 131,072 decoded /32,768 gzip. The binary experiment is not retained. No source, metadata version or window was removed to pass.

A standalone exact candidate measures 58,352 decoded /25,250 gzip bytes, SHA `a694ab96a837ca5e149352d5cda3a53420a18090cdc6ef52266429fd2004b01a`, projection digest `44c80c72cf2a2ec05adfd2f99b0902074e5c8e195e241ea55db755a7147597da`. The user explicitly approved adding only `frontend-v2/src/app/terminal/generated/observatory-window.generated.ts` as a ninth lazy generated output. The approved ninth lazy display module passes 318 independent staged checks, strict TypeScript, whole-frontend lint and two identical rebuilds. The emitted output measures 58,387 decoded /25,294 gzip bytes; the eight navigation shard names remain unchanged, and this separate display module loads only for an exact India HMM window request. The original eight-module list, per-module caps, full original bytes and approved 8/60 selection are otherwise retained. The original approved plan stays byte-identical; the amendment is recorded in this report and proof. Migration follows successful verification of the ninth output.

## Remaining final gates

Shell, search/commands, workspace integration, capability actions, tables/layout/charts/preferences/exports and full validation remain incomplete. No final browser, CI, Vercel or review-readiness result is claimed. The PR has not been created or pushed; when created it must remain DRAFT, OPEN, UNMERGED, with auto-merge disabled.

## Approved router transport amendment

Real browser testing found that the default TanStack JSON serializer emitted `ctx=%221%22`, rejected by the strict version codec, and normalized numeric-looking search text. The user explicitly approved adding only `frontend-v2/src/router.tsx` to the CHANGE manifest. Three configuration lines bind transport helpers in the already-approved context module. Typed values remain exact strings, legacy queries without `ctx` retain their original parser/serializer, and the shell reads raw query bytes from TanStack-owned history so malformed escapes and duplicates still reject. No scientific, backend, environment or deployment-protection scope changes are included. The original approved plan remains byte-identical.

## Router and bounded shell checkpoint — 28 October 2026

The approved router amendment preserves textual typed query values (`ctx=1`, numeric-looking and JSON-looking search text) while leaving legacy transport unchanged. TanStack Start normalizes malformed escapes before constructing server history; the shared shell therefore reads the original request query through a server-only, request-scoped isomorphic branch and uses TanStack history in the browser. Malformed and duplicate URLs reject consistently before workspace payloads, with no hydration mismatch. Server request code is absent from the 111 built browser JavaScript assets inspected.

The static navigation stage passes 459 checks, including full Issue-origin retention across five legacy listing commands and unchanged scope/freeze guards. Loaded full-origin search p95 is 9.42 ms against 30 ms; codec p95 is 0.29 ms against 2 ms. These are controlled static-service measurements, not the final browser navigation performance gate.

Focused production-build Chrome checks pass 15 Risk cases and 24 Factor cases. Risk initial JSON remains 297,579 bytes with no global manifest read. Factors validates the original before pinning its explicit country/cutoff/metadata anchor, rejects contradictory or foreign anchors without fallback, preserves exact copy/new-tab/refresh/history, and passes 34 original SHA/byte checks. Both flows record zero API attempts, page errors or hydration errors. Native F5/F7 remain available to the browser. The focused tests do not establish the full browser, density or action matrix.

The shared command/palette/Market search UI is now in integration. Remaining workspace adapters, comparisons, tables, layout, chart cursors, preferences, exports, full QA, clean-clone and exact-head CI/deployment verification remain pending. The implementation is local; no Phase 7.5 PR has been published or marked ready. `6f99daa` remains excluded, and the eventual PR remains draft and unmerged.

## Reconciled Data epoch and lossless history encoding — 29 October 2026

Main advanced independently to `830ea0f02af0cb57fcbfffaddb25693414831713`. A 19-check read-only audit proved all prior 346 manifest entries, 146 route keys, 326 public artifact files and 94 sealed raw histories unchanged. Seven new complete Data envelopes pass their original closed-schema, claim, licence, source, SHA and byte checks; only seven current Data aliases advance. Merge `f4f1eac47043241e766cbcc8d1d85e8c92d5ba01` reconciles that publication. Phase 7.5 ran no capture or scientific publication. The original archive verifier still passes 930 frozen files and the exact original scientific inventory.

The epoch increased the packed history module to 134,615 bytes, over its unchanged 131,072-byte limit. Versioned canonical hash fragments with one-time literal escaping reduce it losslessly to 128,022 bytes /30,387 gzip. Independent verification passes 52 checks, exact old/new payload and IEEE/signed-zero equality, corruption and collision rejection, and two identical nine-module generations. Every historical version remains present. The original artifacts and approved plan remain unchanged.

The current staged static gate passes 519 checks on the reconciled epoch; full verification remains incomplete. The Market search correction binds every displayed result to its exact normalized query, context and history scope, clears obsolete links synchronously, and refreshes when edits return to a prior query. The fresh production-build Stage 9 Chrome rerun passes all 16 cases and 13 original SHA/byte checks. It observes 57 transient history-search samples, including 25 visible result states, with no stale-query or US target leakage into India factor history. Expected malformed Market input preserves its exact original URL and returns its owned 404 diagnostic; unexpected console/page/hydration errors and business API attempts are zero. This is focused integration proof, not the full browser/action/density matrix.

All nine generated source modules pass the unchanged decoded, gzip and record caps. The final history module is 128,022 decoded bytes /30,387 gzip bytes, retaining 282 records, 462 edges, 42 bindings and every exact prior metadata value. TypeScript passes; whole-frontend lint exits successfully with three Fast Refresh warnings and zero errors. Main was fetched again and remains reconciled at 830ea0f; the scientific archive, original plan and excluded closure commit constraints are unchanged.

The fresh asset audit records these executable-JavaScript failures. Counts include each attributable shared asset once per workspace, using a separate default gzip stream for each emitted client asset. Existing React/TanStack/common dependencies and other metadata shards are excluded only to establish strict failing lower bounds.

| Gate | Actual gzip bytes | Approved cap | Over cap |
|---|---:|---:|---:|
| Shared terminal | 41,213 | 24,576 | 16,637 |
| Risk plus shared | 80,907 | 65,536 | 15,371 |
| Factors plus shared | 66,068 | 65,536 | 532 |

The guard-equivalent display-reader split already saved 4,814 gzip bytes. A whole-graph isolated grouping prototype saves 5,383 bytes but still measures 36,512, which is 11,936 above the shared cap; it was not activated. Three further structural candidates all increase gzip: context field contracts +17 bytes, palette state consolidation +77, and shared command glue +54 under identical natural-chunk options. Their exact-source and adversarial evidence is retained. The context candidate passes 15,805 differential assertions, but its injected verifier also preserves a search p95 failure of 36.0632 ms against 30 ms; no repeated run or activation is used to obscure that failure. There is no demonstrated feasible equivalent architecture within approved scope. This finding is not a proof of mathematical impossibility.

The approved implementation brief states: “If a legitimate implementation cannot satisfy one: STOP and report it.” Integration stops at this gate. No cap is raised, no validation or scientific history is removed, and no shared/lazy dependency is omitted to manufacture a pass. Exact production source/asset hashes, metadata sizes, passing focused browser cases and rejected candidates are embedded in the companion proof. Upcoming Risk/Data/Regime/Factor/Research/Observatory adapters, comparison/table/chart/preferences/export work and final CI/deployment checks remain incomplete. The prepared EvidenceLink component is not wired or included in a future budget acceptance claim. Any published checkpoint must remain DRAFT, OPEN, UNMERGED, auto-merge disabled, and not ready for review.

An independent checkpoint audit matches all 20 production-budget source hashes, all nine generated outputs, 333 available originals, 930 frozen scientific files and all nine protected frontend sources. The current diff contains 32 approved paths and no deletions. The single authorized Phase 7.5 draft PR is a checkpoint for this incomplete implementation; the failed JS gates remain explicit and no review-ready status is requested.

## Latest main reconciliation and additional capacity blocker

The final pre-push fetch advanced main to `32c3f827985dd5fbee0354780765e49e679cad57`. Before merging, an independent 1,867-check audit passed: all 353 prior manifest entries, 146 route keys, 333 prior public originals, 98 sealed raw histories and protected scientific sources remain exact. Seven new complete Data envelopes pass the unchanged whole-source guards. Merge `6e923aea77ee7445564f28d7598729b37a57588e` reconciles that independently published epoch. The current manifest has 360 entries, including 340 AVAILABLE and 20 UNAVAILABLE, with 146 routes. Phase 7.5 performed no capture or scientific publication.

This new epoch introduces an additional capacity failure under the unchanged codec and limits:

| Current history module gate | Actual bytes | Approved cap | Result |
|---|---:|---:|---|
| Decoded source | 133,320 | 131,072 | FAIL by 2,248 |
| Gzip source | 31,693 | 32,768 | PASS |

The other eight modules pass their caps. Two premerge derivations each read the same 259 exact originals and produce identical capacity metrics and failure messages. The generator remains fail-closed: no module outputs are returned or written, so module-byte equality is not claimed for this failed epoch. The real postmerge generator check also exits 1 for exactly this decoded history overflow. Current build/install/typecheck lifecycle prerequisites are therefore blocked; old generated files are not accepted as current outputs.

The current contracts/context/compatibility/freeze stage passes 202 checks, the updated verifier file passes lint, and the original archive verifier freshly passes all 930 frozen files with the original scientific inventory. Earlier 519-check navigation, 16-case Stage 9 browser, TypeScript and whole-frontend lint results remain explicitly tied to main830 and its exact production source/assets. The 41,213 /80,907 /66,068 gzip JS figures above are the last measured production failures at that earlier epoch; a fresh final-head build and browser rerun are unavailable while generation fails.

Both executable-JS and latest history capacity failures are retained as blockers. No cap, history, licence, original guard, archive baseline or protected source is relaxed. The approved source baseline advances only through all three independently checked Data epochs; original e65 archive and reader7d references remain pinned. `6f99daa` stays excluded. The draft PR presents an incomplete, blocked checkpoint and makes no final CI, Vercel or review-readiness claim.

## Approved capacity repair — 30 October 2026

Status: PARTIAL REPAIR, STILL BLOCKED. The capacity amendment permits one additional ignored generated output, history-archive.generated.ts, and separates the always-on 24,576-byte terminal core from the 32,768-byte explicit command/search class. The user confirmed that the unchanged 65,536-byte Risk/Factors initial cap retains route-attributable accounting, while the interaction cap counts executable code and generated metadata JS together. All actual browser JS, including common assets, is also reported. The original approved plan remains byte-identical.

The history repair passes its current limits without dropping retained selections:

| Module | Records | Edges | Bindings | Version choices | Decoded bytes | Gzip bytes |
|---|---:|---:|---:|---:|---:|---:|
| history | 16 | 0 | 16 | 16 | 11,797 | 4,021 |
| history-archive | 280 | 480 | 27 | 623 | 122,982 | 28,642 |
| Exact logical union | 296 | 480 | 43 | 639 | — | — |

Partitioning uses current manifest route requirements and exact declared endpoint/binding closure versus retained archive selections. It uses no byte target, hash bucket, random bucket or row truncation. The union digest equals the original logical history digest, `be13c8367301999aa16f50d93166e92fb6374d334efc17b30b116ec60c6189cb`, with recursive Object.is equality preserving signed zero and IEEE values. Two consecutive complete rebuilds produce identical bytes for all ten generated modules; each validates 259 complete source originals. Both history modules retain the unchanged 131,072-byte decoded /32,768-byte gzip /512-record caps. The archive has 6.17% decoded headroom, below the preferred 10%; no further split is performed.

TerminalShell now imports the palette only after its action or Ctrl/Cmd+K. The accessible loading state preserves Escape/focus, and the keyboard path uses the same focus-capture callback as the button. The visible command line loads its resolver and legacy parser on submission. The shell's default navigation path reads the named compact envelope in the existing seed module, validates its closed contract, digest, manifest/source bindings and admitted availability/licence metadata, and imports no general catalogue or full reader for that purpose. Full original inspection still uses the unchanged complete reader and whole-source checks. Browser requests, HTML preloads and execution coverage confirm optional command/search code and archive are absent from the tested initial Risk/Factors contexts. Current-only search does not request the archive; an explicit history checkbox does.

The amended architecture still fails the interaction gate:

| Actual fresh entry | Decoded JS bytes | Default gzip JS bytes | Cap | Over cap |
|---|---:|---:|---:|---:|
| Risk palette, ten checked options | 117,717 | 39,140 | 32,768 | 6,372 |
| Factors palette, ten checked options | 117,717 | 39,140 | 32,768 | 6,372 |
| Risk command submission | 134,808 | 38,376 | 32,768 | 5,608 |
| Market metadata search | 493,643 | 131,742 | 32,768 | 98,974 |

These are actual first-entry code-plus-metadata transfers, with each emitted client asset compressed using the unchanged default-gzip method. The palette request list includes the palette, mnemonic parser, factor-series helper, search, catalogue, commands, seed and recordings modules. Current search also transfers the Market/Regime modules containing scientific display arrays and reader machinery, contrary to the new interaction boundary. The measured alternative putting all science-free Market/Regime metadata in the seed fails its unchanged caps at 53,306 decoded /14,298 gzip bytes and was not activated.

Initial 24/64 KiB acceptance remains INDETERMINATE. Known owned whole-asset lower bounds are 16,274 gzip bytes for the core, 56,688 for initial Risk and 40,056 for initial Factors. Actual all-initial JS totals are 194,058 and 184,743 respectively. The 105,878-byte gzip entry chunk mixes framework/bootstrap code with Phase 7.5 route/router helpers; the whole chunk is not silently exempted or misreported as terminal code. Fragment compression is diagnostic only. The complete import graph, body hashes, request/preload/execution lists and this ownership limitation are preserved in the proof.

Current core/context/freeze verification passes 205 checks. Production build, TypeScript and lint pass; lint reports four Fast Refresh warnings and no errors. The archive verifier again passes the original 930-file scientific inventory. The static navigation attempt retains its loaded-search p95 failure of 34.3631 ms against 30 ms across sixty queries; no search performance retry was made. Its stale expected original-inspection count was corrected from 308 to 315 for the independently admitted seven Data originals; all 340 per-binding agreements had passed.

Strict cold palette checks now require actual checked options, idle results and focused input. Risk/Factors show ten options, restore focus and respond 42.8/41.2 ms after the last chunk transfer, within the 400 ms target. API attempts, page errors and console errors are zero. The earlier 30-sample aria/focus-only warm observation of 152.9 ms against 150 ms is retained with its readiness limitation and is not promoted to usable-response acceptance. The earlier transient Factors 4,780-byte phase is explicitly not accepted as a usable palette; the strict cold result is 39,140 bytes for both workspaces.

The repair stops here under the amendment's failure rule. Stage 10 has not resumed. No cap, feature, epoch, history, source/hash/schema/licence validation or freeze is relaxed. No further generated shard or tracked capacity source file is added. Scientific-operation increments remain zero, all six claims remain false, D6 stays deferred/disabled and the Risk/regime schedules stay disabled. Main remains reconciled at 32c3f82 and 6f99daa remains excluded. PR #30 remains DRAFT, OPEN, UNMERGED and auto-merge disabled; no final CI, Vercel or review-readiness claim is made.
