# Forge UI v3 — Phase 2 verification

Verified on 2026-09-09 against `feat/forge-ui-v3`.

## Scope

- Run Observer and Command Center density/hierarchy only.
- The graph view model is projected from frozen run artifacts, verification checks, usage records, and the hash-verified v0.2.5 task suite.
- Reality Ladder 3D was not changed.

## Screenshots

| Capture | Viewport | Bytes | SHA-256 | Result |
| --- | ---: | ---: | --- | --- |
| `forge-phase2-1920.png` | 1920 × 1080 | 113,049 | `663a1bb06cd31e6137edd8f31b3dab85ed2fc7eb886e284ccb1b6845340a2bb8` | Pass |
| `forge-phase2-1440.png` | 1440 × 900 | 104,528 | `13cb0a1789032b0262678f83c88205c2fa926e3285b76e166b0b1a3ea6f047d4` | Pass |
| `forge-phase2-1366.png` | 1366 × 768 | 91,761 | `9c872bdfc82f48638828e8a659a22d46d96fa274e8aab3def96091dc08d7a48a` | Pass |
| `forge-phase2-3d-1440.png` | 1440 × 900 | 118,589 | `a4dc5f8755c0a0b32f5260c8f186239bee777262633e549fb1f774aa9c0c8436` | Pass |

The responsive captures show a clear selected run and selected node, the compact command strip, the model hierarchy, the 2D causal trace, the evidence inspector, and the dense baseline table. The 3D capture shows the same trajectory data with progress, experiment depth, and cumulative elapsed axes.

## Functional gate

- Populated observer state rendered from 54 manifest-bound runs across 3 models.
- Selecting action 3 changed the URL to `node=3`, changed the evidence inspector, and survived a page reload.
- The Replay link preserved the selected action in the full run inspector: `/runs/6a50063ac0880986f6d521e9bbcae020e5fd2e89282e8227d77279d9227d8b98?node=3&tab=action`.
- The full run inspector restored action 3 after reload.
- The default 2D graph rendered in Chrome with GPU acceleration disabled.
- The 3D graph was absent from the initial resource set, requested only after the 3D control was activated, and then rendered successfully.

## Accessibility and motion

- Nodes and 2D/3D controls are native buttons with `aria-pressed` selection state and visible keyboard focus treatment.
- Browser accessibility-tree inspection exposed named controls for every trajectory node, including action number, tokens, cost, elapsed time, and verifier state.
- A reduced-motion browser emulation was used for the captures; the 3D view disables damping in that mode.
- The default graph remains a semantic ordered list even when WebGL is unavailable.

This was a targeted semantic and interaction check, not a full third-party WCAG audit.

## Performance

Production client build output:

| Chunk | Minified | Gzip | Loading behavior |
| --- | ---: | ---: | --- |
| Forge route | 10.73 kB | 3.15 kB | Route load |
| Trajectory Explorer | 12.58 kB | 4.37 kB | Route load |
| Trajectory Graph 3D | 11.07 kB | 4.58 kB | Deferred |
| R3F / OrbitControls vendor | 914.98 kB | 243.63 kB | Deferred until 3D opt-in |

The 3D canvas uses demand-driven rendering and caps device pixel ratio at 1–1.5. The build retains Vite's large-chunk warning for the deferred R3F vendor chunk; it is not part of the default 2D path.

## CI evidence

| Check | Result |
| --- | --- |
| `python -m compileall -q backend src tests` | Pass |
| `pytest -q tests/test_agent_eval_metrics.py tests/sabotage` | 36 passed |
| `pytest -q` | 475 passed, 6 dependency/runtime warnings, 314.84 s |
| Forge observer projection tests | 4 passed |
| Exact CI frontend ESLint targets | Pass |
| ESLint for every changed Phase 2 frontend file | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass |

The full Python suite used a unique workspace-local `--basetemp` because the host's global Windows temp directory rejects pytest cleanup. No assertion failures were masked.
