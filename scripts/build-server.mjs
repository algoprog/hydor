// Bundles the server entry points into dist/server (node_modules stay external).
import { build } from 'esbuild';

const entries = {
  index: 'server/index.ts',
  runner: 'server/runner/runner.ts',
  'index-worker': 'server/indexer/worker.ts',
  cli: 'server/cli.ts',
  agent: 'server/agent/main.ts',
  connbridge: 'server/connections/bridge.ts',
};
const only = process.argv.slice(2);

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
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
