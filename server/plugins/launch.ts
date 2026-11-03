// Starts one of a plugin's MCP servers for an agent (built as dist/server/pluginlaunch.js). Agents start
// MCP servers in their own working folder with their own environment; Agent Plugins 1.0 wants a plugin's
// server started in the plugin's folder (or the cwd it names), with PLUGIN_ROOT and PLUGIN_DATA set and its
// own packages first on PATH. The app writes that into a spec file per server; this reads it, starts the
// command as one token with its arguments (never through a shell), and passes stdio, signals and the exit
// code through.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

interface Spec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

const file = process.argv[2];
let spec: Spec;
try {
  spec = JSON.parse(fs.readFileSync(file, 'utf8')) as Spec;
} catch (e) {
  process.stderr.write(`naget plugin launcher: cannot read ${file}: ${(e as Error).message}\n`);
  process.exit(2);
}
try {
  fs.mkdirSync(spec.env.PLUGIN_DATA, { recursive: true });
} catch {}
const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: { ...process.env, ...spec.env }, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => child.kill(sig));
child.on('error', (e) => {
  process.stderr.write(`naget plugin launcher: could not start ${spec.command}: ${e.message}\n`);
  process.exit(127);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
