// Hidden checker for contest-minmax. Run: node check.mjs <workdir>
// Every case is one input ("H W M") with its expected output, in cases.json (made by make-cases.mjs: the small ones by
// trying every matrix, the large ones by the reference). solve(input) from <workdir>/src/solve.mjs runs in a child
// process of its own, timed by CPU time around the call; a case passes when the output matches the expected one
// (ignoring whitespace at the end) within the CPU limit. A case that throws, hangs or crashes fails alone.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const here = path.dirname(self);

// ---------- the child: runs solve on its input and reports the output and the CPU time ----------
if (process.argv[2] === '--run') {
  const dir = path.resolve(process.argv[3]);
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);
  const cpu = process.cpuUsage();
  const out = solve(text);
  const used = process.cpuUsage(cpu);
  console.log(JSON.stringify({ out: typeof out === 'string' ? out : null, type: typeof out, cpuMs: (used.user + used.system) / 1000 }));
  process.exit(0);
}

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);

// The most CPU time one case may use: 4 times the reference's worst case (about 1.3 s), rounded up.
const CPU_LIMIT_MS = 6000;
const WALL_MS = 4 * CPU_LIMIT_MS + 10000;

const cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));

const runChild = (input) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ['--max-old-space-size=2048', self, '--run', dir], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ error: `no answer within ${WALL_MS / 1000} s` });
    }, WALL_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.stdin.on('error', () => {});
    child.on('close', () => {
      try {
        finish(JSON.parse(out.trim().split('\n').pop()));
      } catch {
        finish({ error: `it crashed: ${(err.trim().split('\n').find((l) => /Error/.test(l)) ?? err.trim().split('\n').pop() ?? '').slice(0, 200)}` });
      }
    });
    child.stdin.end(input);
  });

async function judge(c) {
  const r = await runChild(c.input);
  if (r.error) return r.error;
  if (r.out === null) return `solve returned a ${r.type}, not a string`;
  if (r.out.replace(/\s+$/, '') !== c.expected) return `output ${JSON.stringify(r.out.slice(0, 40))}, expected ${c.expected}`;
  if (r.cpuMs > CPU_LIMIT_MS) return `right answer, but ${Math.round(r.cpuMs)} ms of CPU, over ${CPU_LIMIT_MS} ms`;
  return '';
}

const failed = [];
for (const c of cases) {
  let why;
  try {
    why = await judge(c);
  } catch (e) {
    why = `the checker met ${String(e?.message ?? e).split('\n')[0]}`;
  }
  if (why) {
    failed.push(c.name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name} (input ${c.input.trim()}): ${why}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
