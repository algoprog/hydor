// Code steps: a program in JavaScript or TypeScript (Node, which strips the types) or Python that a template's
// flow runs as one of its steps, in a sandbox of its own (bubblewrap): no network, the system read-only, nothing
// of the home folder or the app's data in sight, and a fresh folder of its own to write in, gone afterwards. The
// packages its template installs (What it needs) are there to import. It gets the values given as `input`; what
// it returns becomes the step's values (an object's fields, else {{id.result}}), and what it prints {{id.printed}}.
//
// It reaches the world outside only through `ctx`: each call (ctx.model, ctx.agent, ctx.tool, ctx.ask, ctx.data,
// ctx.app) goes to the flow as a line on file descriptor 3, and its answer comes back on standard input. The
// flow runs each as a step of its own (flow.ts), so the time a call takes is not the program's own.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Requires } from '../../shared/app-manifest.ts';
import { sandboxAvailable } from '../agent/sandbox.ts';
import { envDir } from './env.ts';

export interface CodeOut {
  values: Record<string, unknown>;
  printed: string;
}

const PRINTED = 20_000;
const RESULT = 1 << 20;

/** ctx in JavaScript: each call a line out on fd 3, its answer a line back on standard input. */
const JS_CTX = `import fs from 'node:fs';
import readline from 'node:readline';
const waiting = new Map();
let calls = 0;
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (l) => {
  const m = JSON.parse(l);
  const w = waiting.get(m.id);
  if (!w) return;
  waiting.delete(m.id);
  if (m.ok) w.resolve(m.value);
  else w.reject(new Error(m.error));
});
const call = (kind, args) =>
  new Promise((resolve, reject) => {
    const id = ++calls;
    waiting.set(id, { resolve, reject });
    fs.writeSync(3, JSON.stringify({ id, call: kind, args }) + '\\n');
  });
const ctx = Object.freeze({
  model: (instructions, o = {}) => call('model', { ...o, instructions }),
  agent: (instructions, o = {}) => call('agent', { ...o, instructions }),
  tool: (tool, inputs = {}, o = {}) => call('tool', { ...o, tool, with: inputs }),
  ask: (question, o = {}) => call('ask', { ...o, question }),
  app: (app, inputs = {}, o = {}) => call('app', { ...o, app, with: inputs }),
  data: Object.freeze({
    add: (collection, record, o = {}) => call('data', { ...o, op: 'add', collection, with: record }),
    get: (collection, id, o = {}) => call('data', { ...o, op: 'get', collection, record: id }),
    find: (collection, o = {}) => call('data', { ...o, op: 'find', collection }),
    search: (collection, query, o = {}) => call('data', { ...o, op: 'search', collection, query }),
    update: (collection, o = {}) => call('data', { ...o, op: 'update', collection, record: o.id, with: o.set }),
    remove: (collection, o = {}) => call('data', { ...o, op: 'remove', collection, record: o.id }),
  }),
});
`;

/** The program inside an async function of `input` and `ctx`, so it can await and return; its result goes to a file of its own. */
const jsMain = (code: string) =>
  `${JS_CTX}
const input = JSON.parse(fs.readFileSync('input.json', 'utf8'));
const main = async (input, ctx) => {
${code}
};
const out = await main(input, ctx);
fs.writeFileSync('result.json', JSON.stringify(out === undefined ? null : out));
process.exit(0);
`;

/** ctx in Python: each call waits for its answer. */
const PY_CTX = `import json, os, sys
class _Data:
    def __init__(self, call): self._call = call
    def add(self, collection, record, **o): return self._call('data', {**o, 'op': 'add', 'collection': collection, 'with': record})
    def get(self, collection, id, **o): return self._call('data', {**o, 'op': 'get', 'collection': collection, 'record': id})
    def find(self, collection, **o): return self._call('data', {**o, 'op': 'find', 'collection': collection})
    def search(self, collection, query, **o): return self._call('data', {**o, 'op': 'search', 'collection': collection, 'query': query})
    def update(self, collection, id=None, set=None, **o): return self._call('data', {**o, 'op': 'update', 'collection': collection, 'record': id, 'with': set})
    def remove(self, collection, id=None, **o): return self._call('data', {**o, 'op': 'remove', 'collection': collection, 'record': id})
class _Ctx:
    def __init__(self):
        self._n = 0
        self.data = _Data(self._call)
    def _call(self, kind, args):
        # with is Python's own word: with_ stands for it.
        if 'with_' in args: args['with'] = args.pop('with_')
        self._n += 1
        os.write(3, (json.dumps({'id': self._n, 'call': kind, 'args': {k: v for k, v in args.items() if v is not None}}, default=str) + '\\n').encode())
        m = json.loads(sys.stdin.readline())
        if not m.get('ok'): raise RuntimeError(m.get('error'))
        return m.get('value')
    def model(self, instructions, **o): return self._call('model', {**o, 'instructions': instructions})
    def agent(self, instructions, **o): return self._call('agent', {**o, 'instructions': instructions})
    def tool(self, tool, inputs=None, **o): return self._call('tool', {**o, 'tool': tool, 'with': inputs or {}})
    def ask(self, question, **o): return self._call('ask', {**o, 'question': question})
    def app(self, app, inputs=None, **o): return self._call('app', {**o, 'app': app, 'with': inputs or {}})
ctx = _Ctx()
`;

const pyMain = (code: string) =>
  `${PY_CTX}
with open('input.json') as f:
    input = json.load(f)
def main(input, ctx):
${code
  .split('\n')
  .map((l) => `    ${l}`)
  .join('\n')}
    return None
out = main(input, ctx)
with open('result.json', 'w') as f:
    json.dump(out, f, default=str)
`;

/** The read-only places a program needs besides /usr and /etc: the top folders that are links into /usr (or folders). */
function tops(): string[] {
  const out: string[] = [];
  for (const top of ['/bin', '/sbin', '/lib', '/lib32', '/lib64', '/libx32']) {
    try {
      const st = fs.lstatSync(top);
      if (st.isSymbolicLink()) out.push('--symlink', fs.readlinkSync(top), top);
      else if (st.isDirectory()) out.push('--ro-bind', top, top);
    } catch {}
  }
  return out;
}

/** Runs a code step's program and reads what it returned; throws with its last lines when it fails. */
/** A call the program made through ctx: what kind, and with what; its answer goes back to it (a throw: an error it gets). */
export type CtxCall = (kind: string, args: Record<string, unknown>) => Promise<unknown>;

/** Most calls one program makes through ctx, and the most one line of them may hold. */
const MOST_CALLS = 500;
const CALL_LINE = 1 << 20;

export async function runCode(o: { language: 'javascript' | 'typescript' | 'python'; code: string; input: Record<string, unknown>; slug: string; requires?: Requires; seconds: number; signal?: AbortSignal; onCall?: CtxCall }): Promise<CodeOut> {
  const bwrap = sandboxAvailable();
  if (!bwrap) throw new Error('Code steps run in a sandbox (bubblewrap, bwrap), which this computer lacks');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-code-'));
  try {
    const mounts: string[] = [];
    const ro = (p: string) => fs.existsSync(p) && mounts.push('--ro-bind', p, p);
    const env: Record<string, string> = { HOME: work, PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', TMPDIR: '/tmp' };
    const dir = envDir(o.slug);
    let cmd: string[];
    if (o.language !== 'python') {
      // Node as this app runs it, wherever it is installed.
      const node = fs.realpathSync(process.execPath);
      ro(path.dirname(path.dirname(node)));
      const modules = path.join(dir, 'node_modules');
      if (o.requires?.node && Object.keys(o.requires.node).length && fs.existsSync(modules)) {
        ro(modules);
        env.NODE_PATH = modules;
      }
      // TypeScript as it is: Node strips its types.
      const main = o.language === 'typescript' ? 'main.mts' : 'main.mjs';
      fs.writeFileSync(path.join(work, main), jsMain(o.code));
      cmd = [node, '--max-old-space-size=512', main];
    } else {
      // The template's own Python when it installs packages, else this computer's.
      const venv = path.join(dir, '.venv');
      let py = '/usr/bin/python3';
      if (o.requires?.python?.length && fs.existsSync(path.join(venv, 'bin', 'python'))) {
        ro(venv);
        ro(path.dirname(path.dirname(fs.realpathSync(path.join(venv, 'bin', 'python')))));
        py = path.join(venv, 'bin', 'python');
      }
      if (!fs.existsSync(py)) throw new Error('There is no Python here for code steps (python3)');
      fs.writeFileSync(path.join(work, 'main.py'), pyMain(o.code));
      // At most 2 GB of memory (Node keeps to its own heap limit above).
      cmd = ['/usr/bin/prlimit', `--as=${2 << 30}`, '--', py, '-I', 'main.py'];
    }
    fs.writeFileSync(path.join(work, 'input.json'), JSON.stringify(o.input));
    const args = [
      '--unshare-all',
      '--die-with-parent',
      '--new-session',
      '--ro-bind',
      '/usr',
      '/usr',
      '--ro-bind',
      '/etc',
      '/etc',
      ...tops(),
      ...mounts,
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--tmpfs',
      '/tmp',
      '--bind',
      work,
      work,
      '--remount-ro',
      '/',
      '--chdir',
      work,
      '--clearenv',
      ...Object.entries(env).flatMap(([k, v]) => ['--setenv', k, v]),
      '--',
      ...cmd,
    ];
    const { code, printed } = await new Promise<{ code: number | null; printed: string }>((resolve, reject) => {
      const p = spawn(bwrap, args, { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
      let out = '';
      const take = (b: Buffer) => {
        if (out.length < PRINTED * 2) out += b.toString('utf8');
      };
      p.stdout!.on('data', take);
      p.stderr!.on('data', take);
      p.stdin!.on('error', () => {});
      let why = '';
      const kill = (reason: string) => {
        why ||= reason;
        p.kill('SIGKILL');
      };
      // Its time is its own: the clock stops while a ctx call it waits for is out.
      let left = o.seconds * 1000;
      let since = Date.now();
      let timer: NodeJS.Timeout | undefined = setTimeout(() => kill(`It ran past its ${o.seconds} seconds`), left);
      let out_ = 0;
      const pause = () => {
        if (out_++ || !timer) return;
        clearTimeout(timer);
        timer = undefined;
        left -= Date.now() - since;
      };
      const resume = () => {
        if (--out_ || timer || why) return;
        since = Date.now();
        timer = setTimeout(() => kill(`It ran past its ${o.seconds} seconds`), Math.max(0, left));
      };
      // Its calls through ctx: a line each, answered on its standard input.
      let calls = 0;
      let partial = '';
      const fd3 = p.stdio[3] as NodeJS.ReadableStream;
      fd3.on('data', (b: Buffer) => {
        partial += b.toString('utf8');
        if (partial.length > CALL_LINE) return kill('A ctx call it made was too big (1 MB at most)');
        let nl: number;
        while ((nl = partial.indexOf('\n')) >= 0) {
          const line = partial.slice(0, nl);
          partial = partial.slice(nl + 1);
          let m: { id?: unknown; call?: unknown; args?: unknown };
          try {
            m = JSON.parse(line);
          } catch {
            continue;
          }
          const answer = (a: Record<string, unknown>) => p.stdin!.write(`${JSON.stringify({ id: m.id, ...a })}\n`);
          if (++calls > MOST_CALLS) {
            answer({ ok: false, error: `A program makes at most ${MOST_CALLS} calls through ctx` });
            continue;
          }
          if (!o.onCall) {
            answer({ ok: false, error: 'ctx is not here' });
            continue;
          }
          pause();
          o.onCall(String(m.call ?? ''), m.args && typeof m.args === 'object' ? (m.args as Record<string, unknown>) : {}).then(
            (value) => (resume(), answer({ ok: true, value: value === undefined ? null : value })),
            (e) => (resume(), answer({ ok: false, error: (e as Error).message || 'It failed' })),
          );
        }
      });
      const onStop = () => kill('Stopped');
      o.signal?.addEventListener('abort', onStop, { once: true });
      p.on('error', (e) => {
        clearTimeout(timer);
        o.signal?.removeEventListener('abort', onStop);
        reject(e);
      });
      p.on('close', (c) => {
        clearTimeout(timer);
        o.signal?.removeEventListener('abort', onStop);
        if (why) reject(new Error(why));
        else resolve({ code: c, printed: out });
      });
    });
    const last = printed.trim().split('\n').slice(-12).join('\n').slice(-2000);
    if (code !== 0) throw new Error(last ? `It stopped with an error:\n${last}` : `It stopped with an error (exit ${code})`);
    const file = path.join(work, 'result.json');
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (size > RESULT) throw new Error('What it returned is too big (at most 1 MB)');
    const result: unknown = size ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const values = result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : { result };
    return { values: { ...values, printed: printed.slice(0, PRINTED) }, printed };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
