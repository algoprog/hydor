// Bundles the server entry points into dist/server (node_modules stay external).
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const entries = {
  index: 'server/index.ts',
  runner: 'server/runner/runner.ts',
  'index-worker': 'server/indexer/worker.ts',
  cli: 'server/cli.ts',
  agent: 'server/agent/main.ts',
  connbridge: 'server/connections/bridge.ts',
  pluginlaunch: 'server/plugins/launch.ts',
  mcpbridge: 'server/mcpbridge.ts',
};
const only = process.argv.slice(2);

// The slides' runtime (shared/slides-runtime.ts) as every deck's page carries it: minified, for browsers, given to the
// server's bundle as a constant (server/pages/slides.ts), an expression that is the runtime's function.
const runtime = await build({
  stdin: { contents: "export { slidesRuntime } from './shared/slides-runtime.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  globalName: '__nrt',
  target: ['es2020', 'chrome100', 'safari15', 'firefox100'],
  legalComments: 'none',
  logLevel: 'warning',
});
const runtimeSrc = `(()=>{${runtime.outputFiles[0].text.trim()};return __nrt.slidesRuntime})()`;

await build({
  entryPoints: only.length ? Object.fromEntries(only.map((k) => [k.replace(/^.*\//, '').replace(/\.ts$/, ''), k])) : entries,
  outdir: process.env.OUTDIR ?? 'dist/server',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  logLevel: 'warning',
  define: { __SLIDES_RUNTIME__: JSON.stringify(runtimeSrc) },
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});

// Word suggestions' Python engine (the worker and personalising) runs from its own scripts, which sit beside the bundle:
// dist/server/suggest/py (not the bytecode caches or the engine's tests).
const py = 'server/suggest/py';
if (existsSync(py)) {
  const to = path.join(process.env.OUTDIR ?? 'dist/server', 'suggest', 'py');
  rmSync(to, { recursive: true, force: true });
  cpSync(py, to, { recursive: true, filter: (src) => !/(^|[\\/])(__pycache__|tests)([\\/]|$)/.test(src) && !src.endsWith('.pyc') });
}
