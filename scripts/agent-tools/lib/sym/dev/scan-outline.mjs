#!/usr/bin/env node
// Verify every outline entry (declaration extent) of every supported tracked file in a repo. Read-only.
// usage: scan-outline.mjs REPO_DIR [path-prefix...]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { langForFile, preload } from '../grammar.mjs';
import { FileCache, outlineOf } from '../core.mjs';
import { skipPath, MAX_FILE_BYTES } from '../search.mjs';
import { verifyExtent } from './verify-lib.mjs';

const [repo, ...prefixes] = process.argv.slice(2);
const files = execFileSync('git', ['ls-files', '-z'], { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 1 << 28 }).toString().split('\0')
  .filter((f) => f && langForFile(f) && !skipPath(f) && (!prefixes.length || prefixes.some((p) => f.startsWith(p))));
await preload(['typescript', 'tsx', 'javascript', 'python', 'rust']);
const cache = new FileCache(repo, 4);
let entries = 0; let fail = 0; let flagged = 0; let errFiles = 0; let nfiles = 0;
const t0 = performance.now();
const fails = [];
for (const f of files) {
  if (fs.statSync(path.resolve(repo, f)).size > MAX_FILE_BYTES) continue;
  const ctx = await cache.get(f);
  if (!ctx || !ctx.root) continue;
  nfiles++;
  if (ctx.root.hasError) errFiles++;
  const { entries: list } = outlineOf(ctx);
  for (const { decl: d } of list) {
    if (d.kind === 're-export' || d.kind === 'impl') { entries++; continue; }
    entries++;
    if (d.errors) { flagged++; continue; }
    const r = await verifyExtent(ctx.lang, ctx.lines, d.startRow + 1, d.endRow + 1, d.name);
    if (r.status !== 'ok') { fail++; if (fails.length < 60) fails.push(`${f}:${d.startRow + 1}-${d.endRow + 1} ${d.kind} ${d.name}: ${r.detail}`); }
  }
}
console.log(fails.join('\n'));
console.log(`files=${nfiles} (with parse errors: ${errFiles}) entries=${entries} flagged-unsure=${flagged} FAIL=${fail} time=${Math.round((performance.now() - t0) / 1000)}s`);
