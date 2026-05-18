/**
 * JSCPP evaluation driver
 *
 * API source: https://github.com/felixhao28/JSCPP#readme
 *   JSCPP.run(code, input, config) -> exitCode | throws on unsupported syntax
 *     - code   {string}  C++ source
 *     - input  {string}  text piped to stdin
 *     - config {object}  optional; relevant fields:
 *         stdio.write(s) {function}  called for each stdout chunk (required in browsers)
 *
 * NOTE: <bits/stdc++.h> is NOT supported by JSCPP. Supported headers are limited
 * to <iostream>, <cmath>, <cctype>, <cstring>, <cstdio> (partial), <cstdlib> (partial).
 * If sample.cpp uses <bits/stdc++.h> the run() call will throw — this is expected and
 * the catch block will log it clearly.
 *
 * ESM via esm.sh: JSCPP ships only a CJS build (lib/commonjs.js); esm.sh converts it
 * on-the-fly to ESM. The default export is the JSCPP namespace object containing .run().
 */

// npm package name is "JSCPP" (uppercase). Version 2.0.9 is current as of May 2026.
import JSCPP from 'https://esm.sh/JSCPP@2.0.9';

const $status = document.getElementById('status');
const $log    = document.getElementById('log');
const $run    = document.getElementById('run');

const log = (msg) => { $log.textContent += msg + '\n'; };

async function loadSample() {
  const [src, stdin, expected] = await Promise.all([
    fetch('../sample.cpp').then(r => r.text()),
    fetch('../cases/sample-01.in').then(r => r.text()),
    fetch('../cases/sample-01.out').then(r => r.text()),
  ]);
  return { src, stdin, expected };
}

$run.onclick = async () => {
  $run.disabled = true;
  $log.textContent = '';
  log('Loading sample.cpp and fixtures…');

  let src, stdin, expected;
  try {
    ({ src, stdin, expected } = await loadSample());
  } catch (e) {
    log('ERROR loading files: ' + (e?.message ?? String(e)));
    $run.disabled = false;
    return;
  }

  log('Running via JSCPP.run()…');
  let stdout = '';
  const t0 = performance.now();
  try {
    JSCPP.run(src, stdin, {
      stdio: {
        write: (s) => { stdout += s; },
      },
    });
    const ms = performance.now() - t0;
    log(`run: ${ms.toFixed(0)} ms`);
    log(`stdout:\n${stdout}`);
    log(`OUTPUT MATCH: ${stdout.trim() === expected.trim()}`);
    $status.textContent = `Done in ${ms.toFixed(0)} ms`;
  } catch (e) {
    const ms = performance.now() - t0;
    // JSCPP throws on unsupported features (e.g. <bits/stdc++.h>, missing headers,
    // unsupported syntax). Log clearly so the browser run result is unambiguous.
    log(`FAILED after ${ms.toFixed(0)} ms: ${e?.message ?? String(e)}`);
    log('(JSCPP does not support <bits/stdc++.h> — this failure is expected if sample.cpp uses it)');
    $status.textContent = 'Failed — see log';
  } finally {
    $run.disabled = false;
  }
};

$status.textContent = 'Ready (JSCPP loads lazily on first run)';
