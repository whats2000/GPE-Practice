# WASM Toolchain Spike — Findings

**Date:** 2026-05-18
**Spike target:** spec §11.1
**Conclusion:** PASS-WITH-MITIGATIONS — emception picked

## Candidates evaluated

| Candidate | Cold | Warm | Payload | <bits/stdc++.h> | OUTPUT MATCH | License | Verdict |
|---|---:|---:|---:|---|---|---|---|
| clangd-wasm  | — | — | — | — | — | — | **N/A** — LSP-only, no codegen pipeline |
| JSCPP        | — | — | — | ❌ | ❌ | MIT | **FAIL** — pure-JS interpreter, doesn't support <bits/stdc++.h> or full STL |
| binji/wasm-clang | 5,663 ms | 3,832 ms | 60 MB | ❌ | ❌ | Apache-2.0 | **FAIL** — bundled libc++ has __lttf2 link gap; clang 8.0.1 too old; warm latency ~4× budget |
| **emception** | **6,021 ms** | **3,954 ms** | **~60 MB** | **✓ polyfill** | **✓** | MIT | **PASS-WITH-MITIGATIONS** |

## Picked: emception (gh-pages pre-built artifacts)

### Architecture decision

- Use the pre-built webpack bundle from https://jprendes.github.io/emception/
- Self-host the bundle's static assets in our deploy artifact (~60 MB total: worker bundle, root.pack.br, wasm-package.wasm, brotli.wasm, comlink.mjs, 44 essential sysroot .a files + libGL.a + libhtml5.a)
- COOP/COEP via `coi-serviceworker` (zero-backend, ~5 KB SW shim) — GitHub Pages compatible
- Run the worker through Comlink for clean async RPC
- Polyfill `<bits/stdc++.h>` into emception's virtual FS at init; pass `-I/working`

The local Docker build was attempted but abandoned after two consecutive OOMs during the LLVM link phase (Docker Desktop's 15.5 GB ceiling). The gh-pages pre-built bundle is what the upstream maintainer publishes; consuming it directly is faster, more reliable, and reproducible.

### Spike measurements

(see results.json for raw numbers and reproduction)

- init: 2,426 ms — toolchain + sysroot pack loaded into worker virtual FS
- cold compile: 6,021 ms — clang -O2 -std=c++17 from cold cache; right at the 6,000 ms budget
- warm compile: 3,954 ms — even with clang/lld processes resident, each em++ call re-runs the frontend/optimizer/linker
- run: 6 ms — bare WASI binary execution against fixture stdin
- transferred (cold): ~60 MB; subsequent loads near-zero (HTTP cache + IndexedDB)
- OUTPUT MATCH: ✓

### Mitigations folded into Phase 3 design

The 3,954 ms warm compile is ~4× the original 1 s budget. Two design choices in the IDE engine collapse the *perceived* latency:

1. **Source-hash memoization** — `compile()` keys an in-memory + IndexedDB cache by `SHA-256(source + opts.optimization)`. Repeat Run on unchanged code is <10 ms.
2. **Two-tier optimization** — Run uses `-O0` for instant feedback (~1.5 s warm expected); Submit uses `-O2` for the canonical verdict (~4 s — the user explicitly chose to wait).

These are documented as part of the `engine/compiler.ts` interface contract in §8.1 of the design spec, not buried in implementation.

### Reproducibility

- Spike harness at `spike/wasm-toolchain/emception/`
- Download manifest at `spike/wasm-toolchain/emception/MANIFEST.md`
- Run with `node spike/wasm-toolchain/serve-coop-coep.mjs` then open `http://localhost:5173/emception/`
- Cache directory `spike/wasm-toolchain/emception/.cache/` is gitignored — engineers re-populate from gh-pages

## Static-only invariant: preserved

emception is browser code. The COOP/COEP requirement is satisfied client-side by `coi-serviceworker`. No backend at request time. GitHub Pages deployment unchanged.

## Cross-references

- Spec: `docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md` §11.1 (WASM toolchain risk + spike outcome), §8.1 (compiler.ts interface)
- Phase 0 plan: `docs/superpowers/plans/2026-05-18-phase-0-spikes.md`
- Raw measurements: `spike/wasm-toolchain/results.json`
- Spike download manifest: `spike/wasm-toolchain/emception/MANIFEST.md`
