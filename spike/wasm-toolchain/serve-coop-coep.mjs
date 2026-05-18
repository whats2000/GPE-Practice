#!/usr/bin/env node
/**
 * serve-coop-coep.mjs
 *
 * Tiny static file server for spike/wasm-toolchain/ that injects the two
 * HTTP headers required for SharedArrayBuffer (used by emception):
 *
 *   Cross-Origin-Opener-Policy:   same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *
 * Usage (from repo root):
 *   node spike/wasm-toolchain/serve-coop-coep.mjs
 *
 * Then open http://localhost:5173/emception/ in Chrome or Edge.
 *
 * No npm dependencies — uses only Node built-ins (http, fs, path, url).
 * Works on Windows; uses path.join() throughout, never forward-slash literals.
 */

import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = 5173;

// Resolve the directory that contains this script, which is spike/wasm-toolchain/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ---------------------------------------------------------------------------
// MIME type map
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.tar':  'application/x-tar',
  '.cpp':  'text/plain; charset=utf-8',
  '.in':   'text/plain; charset=utf-8',
  '.out':  'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const DEFAULT_MIME = 'application/octet-stream';

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------
function handler(req, res) {
  // Strip query string and decode percent-encoding
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Map URL path to filesystem path
  let filePath = path.join(ROOT, urlPath.replace(/\//g, path.sep));

  // If the path resolves to a directory, try index.html inside it
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    stat = null;
  }

  if (stat && stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    try {
      stat = fs.statSync(filePath);
    } catch (_) {
      stat = null;
    }
  }

  // Security: ensure the resolved path is still inside ROOT
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    console.log(`403 ${req.url}`);
    return;
  }

  if (!stat || !stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    console.log(`404 ${req.url}`);
    return;
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || DEFAULT_MIME;

  res.writeHead(200, {
    'Content-Type':                  mime,
    'Content-Length':                stat.size,
    'Cross-Origin-Opener-Policy':    'same-origin',
    'Cross-Origin-Embedder-Policy':  'require-corp',
    'Cache-Control':                 'no-cache',
  });

  console.log(`200 ${req.url}`);
  fs.createReadStream(filePath).pipe(res);
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const server = http.createServer(handler);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serving ${ROOT}`);
  console.log(`http://localhost:${PORT}/`);
  console.log('COOP/COEP headers: ON  (SharedArrayBuffer enabled)');
  console.log('Press Ctrl+C to stop.');
});
