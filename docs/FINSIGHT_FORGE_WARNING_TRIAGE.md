# Forge v0.2.1 verification warning triage

The pre-checkpoint full suite passed 330 tests and emitted eight warnings. This
record classifies them instead of suppressing them.

| Source | Count | Category | Disposition |
| --- | ---: | --- | --- |
| FastAPI `app.on_event` in `backend/main.py` | 2 | our API deprecation | Migrated to the supported lifespan context before the source checkpoint. |
| Starlette `TestClient` / `httpx` compatibility shim | 1 | dependency deprecation, test-only | Outside the Forge execution path. Retain visibly until the installed FastAPI/Starlette stack adopts its replacement; do not suppress it. |
| FAISS import of private NumPy namespace | 1 | dependency deprecation | Outside Forge and owned by the installed FAISS package. No Forge code depends on that private namespace. |
| scikit-learn L-BFGS-B `disp` / `iprint` usage | 3 | dependency deprecation | Internal to the installed scikit-learn/SciPy combination and outside Forge. Recheck when dependency locking is introduced. |
| simultaneous Intel and LLVM OpenMP runtimes | 1 | runtime behavior risk | Isolated to the legacy regime-model test path, not the pure-Python Forge sandbox. Treat Linux ML workloads as unsupported until the native runtime conflict is removed. |

The Forge sandbox manifest records the Python major/minor version and hashes
the installed versions of every declared dependency. The v0.2.1 benchmark
programs declare only the allowed pure-Python/standard-library experiment
surface, so none of the unresolved warnings changes the frozen trajectory
semantics. This is not a claim that the repository as a whole has a complete
cross-platform dependency lock.

