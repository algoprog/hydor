#!/usr/bin/env node
// Mechanical extent verification of `sym` output on real repositories (read-only: only reads files).
// usage: verify-real.mjs REPO_DIR NAME [NAME...]   (prints one line per definition + a summary)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { langForFile } from '../grammar.mjs';
import { verifyExtent } from './verify-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYM = path.join(HERE, '..', '..', '..', 'bin', 'sym');
const [repo, ...names] = process.argv.slice(2);
const results = [];
const timings = [];
for (const name of names) {
  const t0 = performance.now();
  const r = spawnSync('node', [SYM, name, '--max-lines', '1', '--max-chars', '1000000'], { cwd: repo, encoding: 'utf8', env: { ...process.env, SYM_DEBUG: '1' }, maxBuffer: 1 << 28 });
  const ms = Math.round(performance.now() - t0);
  const dbg = /\[sym\] .*files with word, (\d+) parsed/.exec(r.stderr);
  timings.push({ name, ms, parsed: dbg ? Number(dbg[1]) : null });
  const headers = [];
  for (const line of r.stdout.split('\n')) {
    const m = /^(?:also: )?(\S+?):(\d+)(?:-(\d+))? {1,2}(\S+) (\S+)/.exec(line);
    if (m && !line.startsWith(' ')) headers.push({ file: m[1], a: Number(m[2]), b: Number(m[3] || m[2]), kind: m[4], dname: m[5], line });
  }
  if (!headers.length) results.push({ name, status: 'notfound', detail: r.stdout.split('\n')[0] });
  for (const h of headers) {
    if (h.kind === 're-export') { results.push({ name, ...h, status: 'ok', detail: 're-export' }); continue; }
    results.push({ name, ...h, ...(await verify(name, h)) });
  }
}

async function verify(name, h) {
  const file = path.resolve(repo, h.file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return verifyExtent(langForFile(file), lines, h.a, h.b, name.split(/::|\./).pop());
}

let ok = 0; let fail = 0; let nf = 0;
for (const r of results) {
  if (r.status === 'ok') ok++; else if (r.status === 'FAIL') fail++; else nf++;
  console.log(`${r.status.padEnd(8)} ${r.name.padEnd(22)} ${r.file ? `${r.file}:${r.a}-${r.b} ${r.kind}` : ''} ${r.detail || ''}`);
}
console.log(`\nDEFINITIONS: ${ok + fail}  ok=${ok} fail=${fail}   names not found=${nf}`);
const ms = timings.map((t) => t.ms).sort((a, b) => a - b);
console.log(`TIMINGS ms: median=${ms[Math.floor(ms.length / 2)]} max=${ms[ms.length - 1]} per-name: ${timings.map((t) => `${t.name}=${t.ms}(${t.parsed})`).join(' ')}`);
