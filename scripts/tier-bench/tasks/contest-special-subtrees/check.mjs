// Hidden checker for contest-special-subtrees. Run: node check.mjs <workdir>
// The cases are in cases.json (made by make-cases.mjs): the small ones keep their input and the output the brute force
// gave (the definition, tried on every set of edges); the large ones are described by a seed and tree shapes, which
// gen.mjs turns into the same input every time, and keep the SHA-256 of the reference's output. solve(input) from
// <workdir>/src/solve.mjs runs in a child process of its own, timed by CPU time around the call; a case passes when the
// output matches (ignoring whitespace at the end) within the CPU limit. A case that throws, hangs or crashes fails alone.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildInput } from './gen.mjs';

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
  // Leave only once the (possibly long) answer has been written to the pipe, or it would be cut short.
  process.stdout.write(JSON.stringify({ out: typeof out === 'string' ? out : null, type: typeof out, cpuMs: (used.user + used.system) / 1000 }) + '\n', () => process.exit(0));
}

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);

// The most CPU time one case may use: the larger of 5 s and 4 times the reference's worst case (about 0.8 s).
const CPU_LIMIT_MS = 5000;
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
  const input = c.spec ? buildInput(c.spec) : c.input;
  const r = await runChild(input);
  if (r.error) return r.error;
  if (r.out === null) return `solve returned a ${r.type}, not a string`;
  const got = r.out.replace(/\s+$/, '');
  if (c.spec ? crypto.createHash('sha256').update(got).digest('hex') !== c.sha : got !== c.expected) {
    return `wrong output (starts ${JSON.stringify(got.slice(0, 40))}${c.spec ? '' : `, expected ${JSON.stringify(c.expected.slice(0, 40))}`})`;
  }
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
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${why}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
