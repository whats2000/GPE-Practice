# Emception Artifact Manifest

Source: `https://jprendes.github.io/emception/` (webpack-bundled GitHub Pages deployment, 2023-02-16 build).

All files are downloaded into `.cache/` which is git-ignored. Re-run the download
commands below if the directory is missing.

## Why These Files (Not the Full 354 MB)

The live demo serves 249 webpack asset files for the sysroot (`/wasm32-emscripten/*.a`),
totalling ~354 MB. We download only the 44 core libraries (30.8 MB) needed for a
`-sSTANDALONE_WASM=1 -O2 -std=c++17` compile, excluding:

- `libGL*`, `libwasmfs*`, `libwebgpu*`, `libstb_image*` — GL/GPU, not needed
- `libasan*`, `liblsan*`, `libubsan*`, `libsanitizer*` — sanitizers, not needed
- `libfetch*`, `libjsmath*`, `libhtml5*`, `libembind*`, `libwasm_workers*` — browser APIs, not needed
- All `-mt-*` and `-ww-*` variants — pthreads / wasm-workers, not needed
- All `-emu-*`, `-ofb-*`, `-webgl2-*`, `-debug-*`, `-full_es3-*` variants — GL variants

If the compile fails with a missing library, check `_needed_assets.json` and add
the corresponding hashed file.

## Download Commands

Run from repo root (requires `curl` with `--parallel`):

```powershell
$BASE = "https://jprendes.github.io/emception"
$CACHE = "spike/wasm-toolchain/emception/.cache"
New-Item -ItemType Directory -Force $CACHE | Out-Null

# Main bundle files
curl --parallel --parallel-immediate `
  -o "$CACHE/main.bundle.js"                        "$BASE/main.bundle.js" `
  -o "$CACHE/emception.worker.bundle.worker.js"     "$BASE/emception.worker.bundle.worker.js" `
  -o "$CACHE/cecdfcda360457a8f204.br"               "$BASE/cecdfcda360457a8f204.br" `
  -o "$CACHE/f0283badd42fe745cbe4.wasm"             "$BASE/f0283badd42fe745cbe4.wasm" `
  -o "$CACHE/9d1e542b80004e27297f.wasm"             "$BASE/9d1e542b80004e27297f.wasm"

# Comlink (must be same-origin; unpkg blocked by COEP)
curl -L -o "$CACHE/comlink.mjs" "https://unpkg.com/comlink@4.4.1/dist/esm/comlink.mjs"

# Sysroot .a files (core libraries only, 44 files, ~30.8 MB)
curl --parallel --parallel-immediate `
  -o "$CACHE/65502b6412f21c86f425.a" "$BASE/65502b6412f21c86f425.a" `
  -o "$CACHE/1bef303e2e82c1268454.a" "$BASE/1bef303e2e82c1268454.a" `
  -o "$CACHE/9c6f88f14b1ca01cd2a3.a" "$BASE/9c6f88f14b1ca01cd2a3.a" `
  -o "$CACHE/5cca7d24838f53227177.a" "$BASE/5cca7d24838f53227177.a" `
  -o "$CACHE/4c5e79483ebda7b07e4e.a" "$BASE/4c5e79483ebda7b07e4e.a" `
  -o "$CACHE/936acf34f9406ab0a6f8.a" "$BASE/936acf34f9406ab0a6f8.a" `
  -o "$CACHE/526fdf5d41f613e9918f.a" "$BASE/526fdf5d41f613e9918f.a" `
  -o "$CACHE/171f06adf4ca45b43274.a" "$BASE/171f06adf4ca45b43274.a" `
  -o "$CACHE/4c353481d4a4d217faf3.a" "$BASE/4c353481d4a4d217faf3.a" `
  -o "$CACHE/cabb6f5ef2e39e9ba39d.a" "$BASE/cabb6f5ef2e39e9ba39d.a" `
  -o "$CACHE/a3897fd7df5d1fe53b18.a" "$BASE/a3897fd7df5d1fe53b18.a" `
  -o "$CACHE/9a8de5ae196c7a3fa9e8.a" "$BASE/9a8de5ae196c7a3fa9e8.a" `
  -o "$CACHE/68a84a9f1afc575af7fa.a" "$BASE/68a84a9f1afc575af7fa.a" `
  -o "$CACHE/26427f6f132a9f2e781c.a" "$BASE/26427f6f132a9f2e781c.a" `
  -o "$CACHE/c5cf3f08c9f3eb35301a.a" "$BASE/c5cf3f08c9f3eb35301a.a" `
  -o "$CACHE/ee4be49f22de1cea178a.a" "$BASE/ee4be49f22de1cea178a.a" `
  -o "$CACHE/65483916311c903881d2.a" "$BASE/65483916311c903881d2.a" `
  -o "$CACHE/4ab268f1951794185d45.a" "$BASE/4ab268f1951794185d45.a" `
  -o "$CACHE/7fdc5c4e0d0c20909779.a" "$BASE/7fdc5c4e0d0c20909779.a" `
  -o "$CACHE/75abf635041a549569b8.a" "$BASE/75abf635041a549569b8.a" `
  -o "$CACHE/b11ab0c1e4dbd3bc46b9.a" "$BASE/b11ab0c1e4dbd3bc46b9.a" `
  -o "$CACHE/545e06e36d3971f5faa4.a" "$BASE/545e06e36d3971f5faa4.a" `
  -o "$CACHE/4d870f1c504d70e9657f.a" "$BASE/4d870f1c504d70e9657f.a" `
  -o "$CACHE/5e4d1d0feb99e0f7649d.a" "$BASE/5e4d1d0feb99e0f7649d.a" `
  -o "$CACHE/788412dcc1e37edc5ac3.a" "$BASE/788412dcc1e37edc5ac3.a" `
  -o "$CACHE/aa6cd7a259e084446796.a" "$BASE/aa6cd7a259e084446796.a" `
  -o "$CACHE/8a1f2ccb58c5bb56f414.a" "$BASE/8a1f2ccb58c5bb56f414.a" `
  -o "$CACHE/ad473e6f07763dd5e6f0.a" "$BASE/ad473e6f07763dd5e6f0.a" `
  -o "$CACHE/0030c207ed64a7bf27e6.a" "$BASE/0030c207ed64a7bf27e6.a" `
  -o "$CACHE/bb85f3944f23b3173b13.a" "$BASE/bb85f3944f23b3173b13.a" `
  -o "$CACHE/35a8f83fa8bc298ddc74.a" "$BASE/35a8f83fa8bc298ddc74.a" `
  -o "$CACHE/a3e7a5ca29f190121182.a" "$BASE/a3e7a5ca29f190121182.a" `
  -o "$CACHE/27da7a84edbf7d0c6414.a" "$BASE/27da7a84edbf7d0c6414.a" `
  -o "$CACHE/09d11aef1b4454a8e60d.a" "$BASE/09d11aef1b4454a8e60d.a" `
  -o "$CACHE/560b686e438e69459e43.a" "$BASE/560b686e438e69459e43.a" `
  -o "$CACHE/44d6e1159bbeb361b0e4.a" "$BASE/44d6e1159bbeb361b0e4.a" `
  -o "$CACHE/e6bcedba8c951c670fa8.a" "$BASE/e6bcedba8c951c670fa8.a" `
  -o "$CACHE/b4a90fa56770b7c0ed93.a" "$BASE/b4a90fa56770b7c0ed93.a" `
  -o "$CACHE/f4170ad872a06601aa01.a" "$BASE/f4170ad872a06601aa01.a" `
  -o "$CACHE/4ae248a4532699a7fabd.a" "$BASE/4ae248a4532699a7fabd.a" `
  -o "$CACHE/8cb0ec04369d2ee7bc3b.a" "$BASE/8cb0ec04369d2ee7bc3b.a" `
  -o "$CACHE/842128646422958a8aa0.a" "$BASE/842128646422958a8aa0.a" `
  -o "$CACHE/783b057899f333b0261a.a" "$BASE/783b057899f333b0261a.a"
```

## File Inventory

### Core Runtime (57.6 MB total)

| Filename | Role | Size (bytes) |
|---|---|---|
| `main.bundle.js` | Demo UI webpack bundle (Monaco editor, xterm, demo UI) | 3,050,173 |
| `emception.worker.bundle.worker.js` | Emception worker bundle: Comlink.expose + full runtime + lazy sysroot loader | 530,681 |
| `cecdfcda360457a8f204.br` | `root.pack.br` — brotli archive containing: `llvm-box.wasm` (LLVM/Clang/LLD), `binaryen-box.wasm`, `python.wasm`, `quicknode.wasm`, `wasm-package.wasm` | 23,510,428 |
| `f0283badd42fe745cbe4.wasm` | `wasm-package` — archive unpacker tool | 804,447 |
| `9d1e542b80004e27297f.wasm` | `brotli` — brotli decompressor (used to unpack `root.pack.br`) | 146,837 |
| `comlink.mjs` | Comlink 4.4.1 ESM — required to wrap the Worker in main thread JS | 12,158 |

### Sysroot Libraries (44 files, 30.8 MB)

These are lazily XHR-fetched by the worker when the linker first accesses each lib.
Files excluded from full 249-file set: GL, WasmFS, sanitizers, pthreads variants, GL variants.

| Hash filename | Library name | Size (bytes) |
|---|---|---|
| `65502b6412f21c86f425.a` | `libal.a` | 18,656 |
| `1bef303e2e82c1268454.a` | `libc++-except.a` | 6,437,758 |
| `9c6f88f14b1ca01cd2a3.a` | `libc++-noexcept.a` | 6,209,488 |
| `5cca7d24838f53227177.a` | `libc++.a` | 6,641,068 |
| `4c5e79483ebda7b07e4e.a` | `libc++abi-except.a` | 1,000,732 |
| `936acf34f9406ab0a6f8.a` | `libc++abi-noexcept.a` | 918,294 |
| `526fdf5d41f613e9918f.a` | `libc++abi.a` | 923,732 |
| `171f06adf4ca45b43274.a` | `libc-asan.a` | 4,151,650 |
| `4c353481d4a4d217faf3.a` | `libc.a` | 3,123,758 |
| `cabb6f5ef2e39e9ba39d.a` | `libc_optz-asan.a` | 26,570 |
| `a3897fd7df5d1fe53b18.a` | `libc_optz.a` | 24,338 |
| `9a8de5ae196c7a3fa9e8.a` | `libcompiler_rt-wasm-sjlj.a` | 538,266 |
| `68a84a9f1afc575af7fa.a` | `libcompiler_rt.a` | 530,834 |
| `26427f6f132a9f2e781c.a` | `libdlmalloc-noerrno-tracing.a` | 81,438 |
| `c5cf3f08c9f3eb35301a.a` | `libdlmalloc-noerrno.a` | 80,682 |
| `ee4be49f22de1cea178a.a` | `libdlmalloc-tracing.a` | 82,070 |
| `65483916311c903881d2.a` | `libdlmalloc.a` | 81,204 |
| `4ab268f1951794185d45.a` | `libemmalloc-memvalidate-noerrno-tracing.a` | 70,070 |
| `7fdc5c4e0d0c20909779.a` | `libemmalloc-memvalidate-noerrno.a` | 68,820 |
| `75abf635041a549569b8.a` | `libemmalloc-memvalidate-tracing.a` | 70,276 |
| `b11ab0c1e4dbd3bc46b9.a` | `libemmalloc-memvalidate-verbose-noerrno-tracing.a` | 75,694 |
| `545e06e36d3971f5faa4.a` | `libemmalloc-memvalidate-verbose-noerrno.a` | 74,712 |
| `4d870f1c504d70e9657f.a` | `libemmalloc-memvalidate-verbose-tracing.a` | 75,900 |
| `5e4d1d0feb99e0f7649d.a` | `libemmalloc-memvalidate-verbose.a` | 74,848 |
| `788412dcc1e37edc5ac3.a` | `libemmalloc-memvalidate.a` | 68,956 |
| `aa6cd7a259e084446796.a` | `libemmalloc-noerrno-tracing.a` | 51,420 |
| `8a1f2ccb58c5bb56f414.a` | `libemmalloc-noerrno.a` | 51,404 |
| `ad473e6f07763dd5e6f0.a` | `libemmalloc-tracing.a` | 51,626 |
| `0030c207ed64a7bf27e6.a` | `libemmalloc-verbose-noerrno-tracing.a` | 75,460 |
| `bb85f3944f23b3173b13.a` | `libemmalloc-verbose-noerrno.a` | 74,494 |
| `35a8f83fa8bc298ddc74.a` | `libemmalloc-verbose-tracing.a` | 75,666 |
| `a3e7a5ca29f190121182.a` | `libemmalloc-verbose.a` | 74,630 |
| `27da7a84edbf7d0c6414.a` | `libemmalloc.a` | 51,540 |
| `09d11aef1b4454a8e60d.a` | `libnoexit.a` | 1,608 |
| `560b686e438e69459e43.a` | `libprintf_long_double-asan.a` | 49,764 |
| `44d6e1159bbeb361b0e4.a` | `libprintf_long_double.a` | 32,894 |
| `e6bcedba8c951c670fa8.a` | `libsockets.a` | 38,742 |
| `b4a90fa56770b7c0ed93.a` | `libsockets_proxy.a` | 33,960 |
| `f4170ad872a06601aa01.a` | `libstandalonewasm-memgrow.a` | 83,924 |
| `4ae248a4532699a7fabd.a` | `libstandalonewasm.a` | 83,412 |
| `8cb0ec04369d2ee7bc3b.a` | `libstubs.a` | 24,778 |
| `842128646422958a8aa0.a` | `libunwind-except.a` | 5,074 |
| `783b057899f333b0261a.a` | `libunwind-noexcept.a` | 328 |
| `783b057899f333b0261a.a` | `libunwind.a` | 328 |

## How the Worker Bundle Resolves Asset Paths

The worker bundle derives its webpack public path (`__webpack_require__.p`) from
`self.location.href` at startup. Since the worker is loaded from
`.cache/emception.worker.bundle.worker.js`, it automatically fetches all static
assets (hashed `.a` files, `.wasm`, `.br`) from `.cache/hash.ext`. No patching
required.

## CORS / COEP Notes

The page is served with `Cross-Origin-Embedder-Policy: require-corp`. Under this
policy, cross-origin sub-resources need either a CORS response AND
`Cross-Origin-Resource-Policy: cross-origin`, or the latter header alone.
`jprendes.github.io` sends `Access-Control-Allow-Origin: *` but NOT `CORP`, so
all assets must be downloaded locally. This is why `.cache/` is required.
