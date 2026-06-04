#!/usr/bin/env node
/**
 * Audit dist/main.js for community plugin scanner patterns.
 * Run after: npm run build
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainJs = path.join(__dirname, '..', 'dist', 'main.js');

if (!fs.existsSync(mainJs)) {
  console.error('dist/main.js not found. Run npm run build first.');
  process.exit(1);
}

const source = fs.readFileSync(mainJs, 'utf8');

function countRegex(re) {
  const flags = re.global ? re.flags : re.flags + 'g';
  const globalRe = new RegExp(re.source, flags.includes('g') ? flags : flags + 'g');
  return [...source.matchAll(globalRe)].length;
}

const fetchCount = countRegex(/\bfetch\s*\(/g);
const atobCount = countRegex(/\batob\s*\(/g);
const btoaCount = countRegex(/\bbtoa\s*\(/g);

const requestCategories = [
  { name: 'requestAnimationFrame', re: /requestAnimationFrame/g },
  { name: 'requestUrl', re: /\brequestUrl\b/g },
  { name: 'GenerateRequests (quota strings)', re: /GenerateRequests/g },
  { name: 'XMLHttpRequest', re: /XMLHttpRequest/g },
  { name: 'other request substring', re: /request/g },
];

console.log('Release bundle audit:', mainJs);
console.log('Size:', (source.length / 1024 / 1024).toFixed(2), 'MB');
console.log('');
console.log('--- Hard checks (fail if unexpected) ---');
console.log('fetch(:', fetchCount);
console.log('atob(:', atobCount, atobCount === 0 ? 'OK' : 'FAIL');
console.log('btoa(:', btoaCount, btoaCount === 0 ? 'OK' : 'FAIL');
console.log('');

console.log('--- request substring breakdown (informational) ---');
let totalRequest = 0;
for (const { name, re } of requestCategories) {
  const n = countRegex(re);
  if (name === 'other request substring') {
    const accounted = requestCategories
      .slice(0, -1)
      .reduce((sum, c) => sum + countRegex(c.re), 0);
    console.log(`  ${name}: ~${Math.max(0, n - accounted)} (approx, overlaps possible)`);
  } else {
    console.log(`  ${name}: ${n}`);
    totalRequest += n;
  }
}
console.log(`  (raw "request" total): ${countRegex(/request/g)}`);
console.log('');

const hasWasmMemoryExport =
  source.includes('WebAssembly.Memory') ||
  source.includes('"memory"') ||
  source.includes("export: 'memory'");
console.log('WASM memory (informational):', hasWasmMemoryExport ? 'glue references memory (expected for wasm-bindgen)' : 'not detected in JS glue');
console.log('');

let failed = false;
if (atobCount > 0 || btoaCount > 0) {
  console.error('FAIL: atob/btoa must be 0 in release bundle. Use esbuild binary loader for WASM.');
  failed = true;
}

if (!failed) {
  console.log('PASS: no atob/btoa in bundle.');
  if (fetchCount > 0) {
    console.log('Note: fetch( count > 0 — inspect samples; Gemini uses requestUrl only (see docs/security-and-privacy.md).');
  } else {
    console.log('fetch(: 0 — Gemini REST uses requestUrl only.');
  }
}

process.exit(failed ? 1 : 0);
