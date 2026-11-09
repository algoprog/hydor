// Runs the app's tests: each `*-test.ts`, `tests.ts` and `selftest.ts` is a script of its own (docs/development.md),
// built here on its own and run with a scratch data folder, a few at a time. `npm test` runs every one that needs
// nothing beyond a checkout (no display, other system, network or real installs: those are listed in NEEDS, run with
// --all); name some to run just those: `npm test -- memory guide/`.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const all = args.includes('--all');
const names = args.filter((a) => !a.startsWith('--'));
const jobs = Number(args.find((a) => a.startsWith('--jobs='))?.slice(7)) || Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2)));
const LIMIT_MS = 15 * 60_000;

/** Tests that need what a plain checkout does not give them, and what that is. */
const NEEDS = {
  'server/browser/selftest.ts': 'a browser and the network',
  'server/connections/selftest.ts': 'the network',
  'server/computer/windows-test.ts': 'Windows',
  'server/computer/x11-test.ts': 'an X display',
  'server/desktop-test.ts': 'the desktop app built (desktop/)',
};

const found = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(rel);
    } else if (/(-test|^tests|^selftest)\.ts$/.test(e.name)) found.push(rel);
  }
};
for (const d of ['server', 'shared', 'web/src']) if (fs.existsSync(path.join(root, d))) walk(d);
found.sort();

const chosen = found.filter((f) => (names.length ? names.some((n) => f.includes(n)) : all || !NEEDS[f]));
const skipped = names.length || all ? [] : found.filter((f) => NEEDS[f]);
if (!chosen.length) {
  console.error(`No tests match ${names.join(', ')}`);
  process.exit(1);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-tests-'));
const run = (cmd, argv, env, ms) =>
  new Promise((resolve) => {
    const p = spawn(cmd, argv, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const keep = (b) => (out = (out + b).slice(-6000));
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    const t = setTimeout(() => p.kill('SIGKILL'), ms);
    p.on('close', (code, signal) => (clearTimeout(t), resolve({ ok: code === 0, out, timedOut: signal === 'SIGKILL' })));
  });

const results = [];
let next = 0;
const worker = async () => {
  while (next < chosen.length) {
    const file = chosen[next++];
    const id = file.replace(/[/.]/g, '_');
    // Built inside the checkout two folders down, as dist/dev is, so its packages are found (node_modules) and the
    // app's root is where the server looks for it (server/config.ts); its data in a scratch folder.
    const out = path.join(root, 'dist', `test-${id}`);
    const data = path.join(scratch, id);
    fs.mkdirSync(data, { recursive: true });
    const t0 = Date.now();
    const built = await run(process.execPath, ['scripts/build-server.mjs', file], { OUTDIR: out }, 5 * 60_000);
    const js = path.join(out, `${path.basename(file, '.ts')}.js`);
    const r = built.ok
      ? await run(
          process.execPath,
          [js],
          { DATA_DIR: data, CLAUDE_CONFIG_DIR: path.join(data, 'claude'), HYDOR_APPS_DIR: path.join(data, 'apps'), PRICES_URL: '', ONLINE: '0', CUDA_VISIBLE_DEVICES: '' },
          LIMIT_MS,
        )
      : built;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    results.push({ file, ok: r.ok, secs, out: r.out, timedOut: r.timedOut });
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${file} (${secs} s)${r.timedOut ? ' (stopped after 15 min)' : ''}`);
  }
};
await Promise.all(Array.from({ length: Math.min(jobs, chosen.length) }, worker));

const failed = results.filter((r) => !r.ok);
for (const f of failed) console.log(`\n---- ${f.file}\n${f.out.trim().split('\n').slice(-25).join('\n')}`);
console.log(
  `\n${results.length - failed.length} of ${results.length} passed${skipped.length ? `; not run here (--all runs them): ${skipped.map((f) => `${path.basename(f)} (${NEEDS[f]})`).join(', ')}` : ''}`,
);
fs.rmSync(scratch, { recursive: true, force: true });
for (const r of results) fs.rmSync(path.join(root, 'dist', `test-${r.file.replace(/[/.]/g, '_')}`), { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
