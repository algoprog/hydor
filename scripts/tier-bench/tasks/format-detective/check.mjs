// Hidden checker for format-detective. Run: node check.mjs <workdir>
// hidden.json.gz holds files from the generator (gen.mjs) with other seeds than the samples, each with what the
// collector's own reader printed, or "refused". Every file is one case, decoded by src/mlog.mjs in a child process
// of its own (node check.mjs <workdir> --one <index>) with a time limit, so a crash or a hang fails only that case.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const self = fileURLToPath(import.meta.url);
const cases = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(self), 'hidden.json.gz'))).toString('utf8'));
const MARK = '\u0001RESULT ';
const WALL_LIMIT_MS = 60000; // the machine is busy, so this only catches a hang
const CPU_LIMIT_MS = 5000; // what a file of 2,000 records should never need

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

// Where two outputs first differ, for CHECK_VERBOSE.
function firstDifference(got, want) {
  for (const key of ['version', 'samples', 'events', 'gaps']) {
    if (!(key in (got ?? {}))) return `no ${key}`;
    if (key === 'version') {
      if (got.version !== want.version) return `version ${JSON.stringify(got.version)}, expected ${want.version}`;
      continue;
    }
    if (!Array.isArray(got[key])) return `${key} is not an array`;
    if (got[key].length !== want[key].length) return `${key}: ${got[key].length} entries, expected ${want[key].length}`;
    for (let i = 0; i < want[key].length; i++) {
      if (!same(got[key][i], want[key][i])) return `${key}[${i}]: got ${JSON.stringify(got[key][i])?.slice(0, 80)}, expected ${JSON.stringify(want[key][i]).slice(0, 80)}`;
    }
  }
  return 'extra keys';
}

// In a child: decodes one file and prints how it went.
async function runChild(index) {
  const c = cases[index];
  const out = (obj) => fs.writeSync(1, `${MARK}${JSON.stringify(obj)}\n`);
  let decode;
  try {
    ({ decode } = await import(pathToFileURL(path.join(dir, 'src/mlog.mjs')).href));
    if (typeof decode !== 'function') throw new Error('no exported function decode');
  } catch (e) {
    out({ ok: false, why: `cannot load: ${String(e?.message ?? e).slice(0, 200)}` });
    return;
  }
  const bytes = Buffer.from(c.mlog, 'base64');
  const before = process.cpuUsage();
  let result;
  let error;
  let threw = false;
  try {
    result = decode(bytes);
  } catch (e) {
    threw = true;
    error = e;
  }
  const cpu = process.cpuUsage(before);
  const ms = (cpu.user + cpu.system) / 1000;
  if (ms > CPU_LIMIT_MS) return out({ ok: false, why: `took ${Math.round(ms)} ms of CPU` });
  if (c.refused) {
    if (!threw) return out({ ok: false, why: `returned an object, mlog-dump refuses this file` });
    return out({ ok: error instanceof Error, why: error instanceof Error ? '' : 'threw something that is not an Error' });
  }
  if (threw) return out({ ok: false, why: `threw ${String(error?.message ?? error).slice(0, 120)}` });
  let ok = false;
  let why = '';
  try {
    ok = same(JSON.parse(JSON.stringify(result)), c.expect) && Object.keys(result).length === 4;
    if (!ok) why = firstDifference(JSON.parse(JSON.stringify(result)), c.expect);
  } catch (e) {
    why = `cannot compare: ${String(e?.message ?? e).slice(0, 100)}`;
  }
  out({ ok, why });
}

if (process.argv[3] === '--one') {
  try {
    await runChild(Number(process.argv[4]));
  } catch {
    // whatever the module did, the parent counts the case as failed
  }
  process.exit(0);
}

const verdict = new Map();
function runOne(index) {
  return new Promise((resolve) => {
    execFile(process.execPath, ['--max-old-space-size=2048', self, dir, '--one', String(index)], { timeout: WALL_LIMIT_MS, maxBuffer: 64 * 1024 * 1024, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      for (const line of String(stdout ?? '').split('\n')) {
        if (!line.startsWith(MARK)) continue;
        try {
          verdict.set(index, JSON.parse(line.slice(MARK.length)));
        } catch {
          // a half-written line from a killed child
        }
      }
      if (!verdict.has(index)) verdict.set(index, { ok: false, why: err?.killed ? `did not finish within ${WALL_LIMIT_MS / 1000} s` : `crashed: ${String(stderr ?? '').slice(0, 200)}` });
      resolve();
    });
  });
}
const queue = cases.map((_, i) => i);
await Promise.all(Array.from({ length: 4 }, async () => { for (let i; (i = queue.shift()) !== undefined; ) await runOne(i); }));

const failed = [];
let passed = 0;
for (const [i, c] of cases.entries()) {
  const r = verdict.get(i);
  if (r?.ok) passed++;
  else {
    failed.push(c.name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}\n     ${r?.why ?? 'no result'}`);
  }
}
console.log(JSON.stringify({ passed, total: cases.length, failed }));
process.exit(0);
