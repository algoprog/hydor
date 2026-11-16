// Verify the real detached runner forwards the hook bearer without persisting it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Runner } from './client.ts';

if (!process.env.HYDOR_RUNNER_TEST_CHILD) {
  // Build the detached entry point in a scratch root so this test works in a clean checkout.
  const root = fs.mkdtempSync(path.join(process.platform === 'win32' ? os.tmpdir() : '/tmp', 'hydor-hook-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    fs.mkdirSync(path.join(root, 'data'));
    await build({ entryPoints: ['server/runner/runner.ts'], outdir: path.join(root, 'dist/server'), bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', logLevel: 'silent' });
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, DATA_DIR: path.join(root, 'data'), HYDOR_ROOT: root, HYDOR_RUNNER_TEST_CHILD: '1' }, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    process.stdout.write('Detached runner wiki bearer test passed\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
} else {
  const token = 'test-only-run-token';
  const meta = { runId: 'test-runner-token', agent: 'claude' as const, createdAt: Date.now(), cwd: process.cwd(), opts: {} };
  const runner = await Runner.start(meta, {
    cmd: process.execPath,
    args: ['-e', "process.stdout.write(process.env.HYDOR_WIKI_HOOK_TOKEN ? 'received' : 'missing')"],
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? '', HYDOR_WIKI_HOOK_TOKEN: token },
  });
  assert.ok(!fs.readFileSync(path.join(runner.dir, 'spec.json'), 'utf8').includes(token));
  for (let i = 0; i < 100 && !fs.existsSync(path.join(runner.dir, 'exit.json')); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(fs.readFileSync(path.join(runner.dir, 'out.log'), 'utf8'), 'received', fs.readFileSync(path.join(runner.dir, 'err.log'), 'utf8'));
  assert.ok(!fs.readFileSync(path.join(runner.dir, 'err.log'), 'utf8').includes(token));
}
