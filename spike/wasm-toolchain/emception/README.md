# emception Evaluation Harness

The driver at `driver.js` exercises emception's compile + run pipeline against
`../sample.cpp` and reports cold/warm timings + OUTPUT MATCH.

## Prerequisites

Emception ships only as a source repo. You must build it locally once.

### One-time setup (~1 hour, mostly Docker download + build)

1. Ensure Docker Desktop is installed and running on Windows.
2. From any directory:
   ```powershell
   git clone https://github.com/jprendes/emception C:\emception-src
   cd C:\emception-src
   .\build-with-docker.sh
   ```
   (If `build-with-docker.sh` is a bash script, run it under WSL or Git Bash:
   `bash ./build-with-docker.sh`.)
3. After the build finishes, copy the output into this spike:
   ```powershell
   Copy-Item C:\emception-src\build\emception\* -Destination d:\GitHub\GPE-Practice\spike\wasm-toolchain\emception\emception-lib\ -Recurse
   ```
   The result should be `spike\wasm-toolchain\emception\emception-lib\emception.js` plus its sibling assets.

   The `emception-lib/` directory is `.gitignored` — do not commit it.

### Each-run setup

Emception requires SharedArrayBuffer, which requires COOP/COEP headers.
A plain `npx serve` will NOT work — use the included Node script:

```powershell
node spike\wasm-toolchain\serve-coop-coep.mjs
```

Then open `http://localhost:5173/emception/` in Chrome/Edge with DevTools ->
Network -> "Disable cache" ticked.

## What to measure

1. Wait for "Ready. init took N ms." — this includes the toolchain download
   into emception's virtual FS (~100-200 MB per the README — the first run
   will be the slowest).
2. Note **transferred bytes** from DevTools Network summary at the bottom.
3. Click "Cold compile" — log entry `coldCompileMs: X ms` and `runMs: Y ms`,
   and `OUTPUT MATCH: true|false`.
4. Click "Warm compile" — log entry `warmCompileMs: X ms`.

Paste back: `initMs`, `transferredBytes`, `coldCompileMs`, `runMs`,
`warmCompileMs`, `OUTPUT MATCH`.

## Pass criteria (from spec §11.1)

- Cold compile (excluding init): <= 6,000 ms
- Warm compile: <= 1,000 ms
- Cached payload: <= ~60 MB on first load (init's virtual-FS download may exceed
  this; ignore the 60 MB number for emception's init payload since emception
  caches in IndexedDB, not in the HTTP cache — measure browser memory growth
  after init instead)
- `<bits/stdc++.h>` works (directly or via trivial polyfill)
- License permissive (MIT)

## Troubleshooting

- If `./emception-lib/emception.js` 404s: re-run Step 3 of one-time setup; verify
  the file exists at that path.
- If browser console says "SharedArrayBuffer is not defined": the COOP/COEP
  headers aren't being served. Confirm you started the server with
  `serve-coop-coep.mjs`, not `npx serve`.
- If emception runs but the WASI shim mis-reads stdin: the driver's WASI shim
  is hand-rolled (see driver.js top comment). File a note in this README and
  we'll patch the shim.
