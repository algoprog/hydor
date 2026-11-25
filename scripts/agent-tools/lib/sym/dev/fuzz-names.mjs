#!/usr/bin/env node
// Picks random declaration-looking names from a repo (any nesting level), runs sym for each in-process and verifies every reported extent.
// usage: fuzz-names.mjs REPO_DIR COUNT [seed] [glob...]   (read-only)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { main } from '../cli.mjs';
import { langForFile } from '../grammar.mjs';
import { verifyExtent } from './verify-lib.mjs';

const [repo, countArg, seedArg = '1', ...globs] = process.argv.slice(2);
let seed = Number(seedArg) || 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pats = ['^[[:space:]]*(export )?(async )?(function\\*?|class|interface|type|enum|const|let|var|def|fn|struct|trait|mod) [A-Za-z_][A-Za-z0-9_]*',
  '^[[:space:]]+(public |private |protected |static |async )*[a-z][A-Za-z0-9_]*\\(.*\\) ?(:[^=;]*)?\\{$'];
const out = execFileSync('git', ['grep', '-h', '-I', '-o', '-E', ...pats.flatMap((p) => ['-e', p]), '--', ...(globs.length ? globs : ['*.ts', '*.tsx', '*.js', '*.mjs', '*.py', '*.rs'])], { cwd: repo, maxBuffer: 1 << 29, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).toString().split('\n');
const names = new Set();
for (const l of out) {
  const m = /(?:function\*?|class|interface|type|enum|const|let|var|def|fn|struct|trait|mod) ([A-Za-z_]\w*)|^\s*(?:(?:public|private|protected|static|async) )*([a-z]\w*)\(/.exec(l);
  const n = m && (m[1] || m[2]);
  if (n && n.length > 2 && !['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'constructor'].includes(n)) names.add(n);
}
const all = [...names].sort();
const picked = [];
for (let i = 0; i < Number(countArg) && all.length; i++) picked.push(all.splice(Math.floor(rnd() * all.length), 1)[0]);
let defs = 0; let fail = 0; let flagged = 0; let nf = 0;
const failures = [];
const notFound = [];
const cache = new Map();
for (const name of picked) {
  let text = '';
  const code = await main([name, '--all', '--max-lines', '1', '--max-chars', '100000000'], repo, { out: (s) => { text += s; }, err: () => {} });
  if (code === 1) { nf++; notFound.push(name); continue; }
  for (const line of text.split('\n')) {
    const m = /^(?:also: )?(\S+?):(\d+)-(\d+)  (\S+) (\S+)(.*)$/.exec(line);
    if (!m || line.startsWith(' ') || m[4] === 're-export' || m[4].startsWith('impl')) continue;
    defs++;
    if (/extent unsure|heuristic/.test(m[6])) { flagged++; continue; }
    const file = path.resolve(repo, m[1]);
    if (!cache.has(file)) cache.set(file, fs.readFileSync(file, 'utf8').split('\n'));
    const r = await verifyExtent(langForFile(file), cache.get(file), Number(m[2]), Number(m[3]), m[5].split(/::|\./).pop());
    if (r.status !== 'ok') { fail++; if (failures.length < 40) failures.push(`${name}: ${m[1]}:${m[2]}-${m[3]} ${m[4]} ${m[5]}: ${r.detail}`); }
  }
}
console.log(failures.join('\n'));
if (notFound.length) console.log('not found: ' + notFound.slice(0, 20).join(' '));
console.log(`names=${picked.length} notfound=${nf} definitions=${defs} flagged-unsure=${flagged} FAIL=${fail}`);
