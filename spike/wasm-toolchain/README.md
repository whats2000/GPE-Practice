# WASM Toolchain Spike

**Goal:** Pick a WASM C++ toolchain that can compile and run `sample.cpp`
within the budget defined in `docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md` §11.1.

**Candidates evaluated:** wasm-clang (emception), clangd-wasm, JSCPP (fallback).

**Hard criteria:**
- Cold compile ≤ 6 s
- Warm compile ≤ 1 s
- Cached payload ≤ 40 MB
- Supports `<bits/stdc++.h>` + C++17 STL
- Permissive license (MIT / Apache 2.0 / BSD)

**Test corpus:** `sample.cpp` + `cases/sample-01.in/.out`.

**Outcome:** Findings written to `docs/spikes/2026-05-18-wasm-toolchain-findings.md`.
