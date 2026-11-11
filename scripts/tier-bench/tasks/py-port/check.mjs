// Hidden checker for py-port. Run: node check.mjs <workdir>
// Compares src/report_utils.mjs with fixtures.json, which gen_fixtures.py made by running the Python module itself
// (every expected value is what Python 3.13 gives). Each function's cases run in a child process of its own
// (node check.mjs <workdir> --fn <name>) with a time limit, so code that hangs or crashes fails only that function's
// remaining cases. One counted case per fixture.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const self = fileURLToPath(import.meta.url);
const fixtures = JSON.parse(fs.readFileSync(path.join(path.dirname(self), 'fixtures.json'), 'utf8'));
const MARK = '\u0001RESULT ';
const TIME_LIMIT_MS = 20000;

const show = (v) => {
  const s = JSON.stringify(v);
  return s.length > 70 ? `${s.slice(0, 60)}…(${s.length} chars)` : s;
};
const caseName = (c, i) => `${c.fn} #${i + 1}: ${show(c.args)}`;

// Same type, same value: numbers with ===, strings exactly, arrays element by element, objects by key set and values.
function same(got, want) {
  if (want === null) return got === null;
  if (typeof want === 'number') return typeof got === 'number' && got === want;
  if (typeof want === 'string' || typeof want === 'boolean') return got === want;
  if (Array.isArray(want)) return Array.isArray(got) && got.length === want.length && want.every((w, i) => same(got[i], w));
  if (typeof want === 'object') {
    if (typeof got !== 'object' || got === null || Array.isArray(got)) return false;
    const a = Object.keys(got);
    const b = Object.keys(want);
    return a.length === b.length && b.every((k) => Object.hasOwn(got, k) && same(got[k], want[k]));
  }
  return false;
}

// In a child: runs one function's cases, printing one result line per case as soon as it is known.
async function runChild(fn) {
  const out = (obj) => fs.writeSync(1, `${MARK}${JSON.stringify(obj)}\n`);
  const mine = fixtures.map((c, i) => ({ c, i })).filter(({ c }) => c.fn === fn);
  let impl;
  try {
    const mod = await import(pathToFileURL(path.join(dir, 'src/report_utils.mjs')).href);
    impl = mod[fn];
    if (typeof impl !== 'function') throw new Error(`no exported function ${fn}`);
  } catch (e) {
    for (const { i } of mine) out({ i, ok: false, why: `cannot load: ${String(e?.message ?? e).slice(0, 200)}` });
    return;
  }
  for (const { c, i } of mine) {
    const args = JSON.parse(JSON.stringify(c.args));
    let result;
    let threw = false;
    let error;
    try {
      result = impl(...args);
    } catch (e) {
      threw = true;
      error = e;
    }
    if ('raises' in c) {
      out({ i, ok: threw, why: threw ? '' : `returned ${show(result)}, Python raises ${c.raises}` });
    } else if (threw) {
      out({ i, ok: false, why: `threw ${String(error?.message ?? error).slice(0, 120)}, expected ${show(c.expect)}` });
    } else {
      let ok = false;
      try {
        ok = same(result, c.expect);
      } catch {
        ok = false;
      }
      out({ i, ok, why: ok ? '' : `got ${show(result)}, expected ${show(c.expect)}` });
    }
  }
}

if (process.argv[3] === '--fn') {
  try {
    await runChild(process.argv[4]);
  } catch {
    // whatever the module did, the parent counts the cases without a result as failed
  }
  process.exit(0);
}

// The parent: one child per function, four at a time.
const fns = [...new Set(fixtures.map((c) => c.fn))];
const verdict = new Map();
function runFn(fn) {
  return new Promise((resolve) => {
    execFile(process.execPath, [self, dir, '--fn', fn], { timeout: TIME_LIMIT_MS, maxBuffer: 64 * 1024 * 1024, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      for (const line of String(stdout ?? '').split('\n')) {
        if (!line.startsWith(MARK)) continue;
        try {
          const r = JSON.parse(line.slice(MARK.length));
          verdict.set(r.i, r);
        } catch {
          // a half-written line from a killed child
        }
      }
      const missing = fixtures.some((c, i) => c.fn === fn && !verdict.has(i));
      if (err && missing) for (const [i, c] of fixtures.entries()) if (c.fn === fn && !verdict.has(i)) verdict.set(i, { i, ok: false, why: err.killed ? `${fn} did not finish within ${TIME_LIMIT_MS / 1000} s` : `${fn} crashed: ${String(stderr ?? '').slice(0, 200)}` });
      resolve();
    });
  });
}
const queue = [...fns];
await Promise.all(Array.from({ length: 4 }, async () => { for (let fn; (fn = queue.shift()); ) await runFn(fn); }));

const failed = [];
let passed = 0;
for (const [i, c] of fixtures.entries()) {
  const r = verdict.get(i);
  if (r?.ok) passed++;
  else {
    const name = caseName(c, i);
    failed.push(name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}\n     ${r?.why ?? 'no result'}`);
  }
}
console.log(JSON.stringify({ passed, total: fixtures.length, failed }));
process.exit(0);
