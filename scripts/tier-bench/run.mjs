// Runs the benchmark: the same tasks done several ways on one server, and how each came out.
//   solo:     one agent on the Best tier's model, with the team off (how sessions worked before tiers led by default)
//   team:     Automatic, the team on: the main agent leads on Best (or Max for a hard problem) and hands parts to helpers
//   lead:     Automatic with Max for hard problems off: the main agent always leads on Best and hands parts to helpers
//   max:      one agent on the Max tier's model alone, the team off (the strongest model for everything)
//   standard: one agent on the Standard tier's model alone, the team off (what that tier can do with no lead)
//   quick:    one agent on the Quick tier's model alone, the team off
// For each run: a fresh folder with the task's starting files, a session that gets the task's request, and when the
// session and its helpers have finished, the task's hidden checker and what the work cost at API prices.
//
//   node scripts/tier-bench/run.mjs [--bench /tmp/hydor-bench/data/bench.json] [--tasks utils4,expr] [--ways solo,team]
//                                   [--repeat 1] [--parallel 3] [--out results.json] [--work /tmp/hydor-bench/work]
//                                   [--limit 30] (minutes a run may take)   [--recost] (read the costs again)
//                                   [--min-free 16] (GB of memory the machine must have available for a run to start)
//                                   [--tasks-dir dir] (tasks from another folder, such as LiveCodeBench's from lcb/make-tasks.py)
//
// serve.mjs starts the server it runs against. Results go to --out as they come (a run already there is not run
// again), and a table is printed at the end: report.mjs prints it again from the file.
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capped } from './capped.mjs';
import { table } from './report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const benchFile = path.resolve(arg('bench', '/tmp/hydor-bench/data/bench.json'));
const bench = JSON.parse(fs.readFileSync(benchFile, 'utf8'));
/** Where the tasks are: this folder's own, or another one (LiveCodeBench's are made outside the repository). */
const TASKS = path.resolve(arg('tasks-dir', path.join(here, 'tasks')));
const all = fs.readdirSync(TASKS, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(TASKS, d.name, 'task.md'))).map((d) => d.name);
const tasks = (arg('tasks') ?? all.join(',')).split(',').filter(Boolean);
const ways = arg('ways', 'solo,team').split(',');
/** The ways that start on Automatic with the team on; only `team` may start on Max. */
const LED = new Set(['team', 'lead']);
const repeat = Number(arg('repeat', 1));
const parallel = Number(arg('parallel', 3));
const out = path.resolve(arg('out', 'tier-bench-results.json'));
const work = path.resolve(arg('work', '/tmp/hydor-bench/work'));
/** The longest one run may take; past it the session is stopped and the run counts as timed out. */
const LIMIT_MS = Number(arg('limit', 30)) * 60_000;
/** The memory the machine must have available before a run starts, in GB: its agents and checkers need some, other work on the machine more. */
const MIN_FREE_GB = Number(arg('min-free', 16));

const api = async (method, p, body) => {
  const r = await fetch(bench.server + p, { method, headers: { authorization: `Bearer ${bench.token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${p}: ${j.error ?? r.status}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The memory the machine has available now, in GB: MemAvailable on Linux, what the system calls free elsewhere. */
function availableGb() {
  try {
    const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
    if (m) return Number(m[1]) / 1048576;
  } catch {}
  return os.freemem() / 1073741824;
}

/** Minutes the benchmark account's copy of the access token still works (serve.mjs --from renews it); Infinity when unknown. */
function tokenMinutes() {
  try {
    const file = path.join(path.dirname(benchFile), 'accounts', `claude-${bench.account}`, '.credentials.json');
    return (JSON.parse(fs.readFileSync(file, 'utf8')).claudeAiOauth.expiresAt - Date.now()) / 60_000;
  } catch {
    return Infinity;
  }
}

/**
 * Waits until the machine has MIN_FREE_GB available, so that the benchmark never pushes it out of memory, and until
 * the account's token works for 20 minutes more, so that no run starts on a sign-in about to lapse (it would end at
 * once, having done nothing, and count as a failure).
 */
async function roomToRun() {
  for (let said = false; availableGb() < MIN_FREE_GB; said = true) {
    if (!said) console.log(`waiting for memory: ${availableGb().toFixed(1)} GB available, a run starts at ${MIN_FREE_GB} GB`);
    await sleep(30_000);
  }
  for (let said = false; tokenMinutes() < 20; said = true) {
    if (!said) console.log(`waiting for the sign-in: its token works for ${Math.max(0, Math.round(tokenMinutes()))} more minutes; renew it with serve.mjs --from`);
    await sleep(30_000);
  }
}
const enc = encodeURIComponent;
const BUSY = new Set(['starting', 'working', 'waiting', 'stopping']);

// --recost: what each run in the file cost, read again from the server (a figure can land after its run was written down).
if (process.argv.includes('--recost')) {
  const done = JSON.parse(fs.readFileSync(out, 'utf8'));
  for (const r of done) if (r.key) Object.assign(r, await collect(r.key));
  fs.writeFileSync(out, JSON.stringify(done, null, 1));
  console.log(table(done));
  process.exit(0);
}

const tiers = await api('GET', '/api/models/tiers');
/** The model one agent alone runs on, by way. */
const MODEL_OF = { solo: tiers.tiers.claude.best.model, max: tiers.tiers.claude.max.model, standard: tiers.tiers.claude.standard.model, quick: tiers.tiers.claude.quick.model };
for (const w of ways) if (!LED.has(w) && !MODEL_OF[w]) throw new Error(`No way called ${w}: solo, team, lead, max, standard or quick`);

const results = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
const save = () => fs.writeFileSync(out, JSON.stringify(results, null, 1));

/** A session's child sessions: the cards in its conversation. */
const childrenOf = async (key) => (await api('GET', `/api/sessions/${enc(key)}/notes`)).notes.filter((n) => n.kind === 'child').map((n) => n.data);

/** How many times each run's agents asked for an answer (each was declined). */
const asked = new Map();

/** Declines whatever a session waits on, with a word on why; how many cards that was. */
async function decline(key) {
  const snap = await api('GET', `/api/sessions/${enc(key)}`).catch(() => ({}));
  let n = 0;
  for (const a of snap.overlay?.approvals ?? []) {
    await api('POST', `/api/sessions/${enc(key)}/approvals/${enc(a.id)}`, { decision: 'deny', message: 'Nobody is here to answer in this run: go on without it.' }).catch(() => {});
    n++;
  }
  return n;
}

/** Waits until a session and its children have finished: nothing working, nothing in the background, nothing queued, for a little while. */
async function finished(key, since) {
  let quiet = 0;
  for (;;) {
    await sleep(4000);
    if (Date.now() - since > LIMIT_MS) return 'timeout';
    const s = (await api('GET', `/api/sessions/${enc(key)}`)).summary;
    const kids = await Promise.all((await childrenOf(key)).map((k) => api('GET', `/api/sessions/${enc(k.child)}`).then((r) => r.summary, () => null)));
    // Nobody is here to answer: what an agent asks (its program's own guard on a command, a question) is declined, and it goes on.
    for (const x of [s, ...kids]) if (x?.live?.status === 'waiting') asked.set(key, (asked.get(key) ?? 0) + (await decline(x.key)));
    // A turn may end with helpers still at work in the background (Claude Code's own): their agent is woken as each ends.
    const atWork = (x) => BUSY.has(x?.live?.status) || (x?.live?.backgroundTasks ?? []).some((t) => (t.kind ?? '').includes('agent') && t.status === 'running') || (x?.queue?.length ?? 0) > 0;
    const busy = atWork(s) || kids.some(atWork);
    // A turn has to have ended: a session that has not begun yet is not finished.
    quiet = busy || !(s?.stats?.turns > 0 || s?.live?.status === 'error' || !s?.live) ? 0 : quiet + 1;
    if (s?.live?.status === 'error' && !busy) return 'error';
    // A child's reply wakes its lead a moment after the child ends: five quiet looks in a row.
    if (quiet >= 5) return 'done';
  }
}

/** The helpers a Claude Code session ran inside its own turns (its Agent tool), by the model each was given. */
async function ownHelpers(key) {
  const t = await api('GET', `/api/sessions/${enc(key)}/timeline?limit=2000&whole=1`).catch(() => ({ items: [] }));
  return (t.items ?? []).filter((it) => it.kind === 'tool' && (it.tool.name === 'Agent' || it.tool.name === 'Task')).map((it) => ({ model: it.tool.input?.model ?? 'its own', type: it.tool.input?.subagent_type ?? null, title: String(it.tool.input?.description ?? it.tool.title ?? '').slice(0, 80) }));
}

/**
 * What a finished run came to: its helpers, what it and they cost, whether it moved to Max. Its agents' processes are
 * stopped first (the conversations stay to be read): an agent writes its last figures as it ends, and the cost is read
 * once it has stopped changing.
 */
async function collect(key) {
  const notes = (await api('GET', `/api/sessions/${enc(key)}/notes`)).notes;
  const cards = notes.filter((n) => n.kind === 'child').map((n) => n.data);
  for (const k of [key, ...cards.map((c) => c.child)]) await api('POST', `/api/sessions/${enc(k)}/stop`).catch(() => {});
  let money = {};
  for (let same = 0, last = -1, i = 0; same < 4 && i < 40; i++) {
    await sleep(3000);
    money = await api('GET', `/api/budget/${enc(key)}`).catch(() => money);
    same = money.spentUsd === last ? same + 1 : 0;
    last = money.spentUsd;
  }
  const s = (await api('GET', `/api/sessions/${enc(key)}`)).summary;
  const kids = [];
  for (const k of cards) {
    const c = (await api('GET', `/api/sessions/${enc(k.child)}`).catch(() => ({}))).summary;
    const m = await api('GET', `/api/budget/${enc(k.child)}`).catch(() => ({}));
    kids.push({ key: k.child, title: k.title, label: k.label, tier: k.tier ?? null, as: k.as ?? null, steppedFrom: k.steppedFrom?.tier ?? null, model: c?.model ?? k.model ?? null, usd: m.ownUsd ?? null, turns: c?.stats?.turns ?? null });
  }
  return {
    usd: money.spentUsd ?? null,
    leadUsd: money.ownUsd ?? null,
    helpersUsd: money.childrenUsd ?? null,
    unpriced: !!money.unpriced,
    turns: s?.stats?.turns ?? null,
    tokens: s ? { in: s.stats.tokensIn, out: s.stats.tokensOut, cached: s.stats.tokensCached } : null,
    moved: notes.filter((n) => n.kind === 'tier').map((n) => ({ event: n.data.event, tier: n.data.tier, label: n.data.label, why: n.data.why ?? null })),
    helpers: kids,
    inTurn: await ownHelpers(key),
    error: s?.live?.error ?? null,
  };
}

/**
 * Whether a run's agents read the task's hidden files (its checker, reference or expected answers): any mention of
 * the task's own folder in the transcripts of the benchmark account's sessions for this run (its lead's and those of
 * the helpers it ran in its turns). The agents run as you do, so nothing stops them looking; this says when one did.
 */
function peeked(task, key) {
  if (!key) return false;
  const projects = path.join(path.dirname(benchFile), 'accounts', `claude-${bench.account}`, 'projects');
  const id = key.replace(/^claude:/, '');
  const hidden = path.join(TASKS, task);
  try {
    for (const d of fs.readdirSync(projects)) {
      const dir = path.join(projects, d);
      const files = fs.readdirSync(dir).filter((f) => f.startsWith(id));
      const sub = path.join(dir, id, 'subagents');
      if (fs.existsSync(sub)) files.push(...fs.readdirSync(sub).map((f) => path.join(id, 'subagents', f)));
      for (const f of files) if (fs.readFileSync(path.join(dir, f), 'utf8').includes(hidden)) return true;
    }
  } catch {}
  return false;
}

/** The task's hidden checker on a folder (with at most 8 GB of memory for it and what it starts): how many of its cases pass. */
function check(task, dir) {
  return new Promise((resolve) => {
    const [command, argv] = capped(process.execPath, [path.join(TASKS, task, 'check.mjs'), dir], 8);
    execFile(command, argv, { timeout: 180_000, maxBuffer: 8 << 20, env: { ...process.env, CUDA_VISIBLE_DEVICES: '' } }, (err, stdout) => {
      try {
        const line = stdout.trim().split('\n').pop();
        const j = JSON.parse(line);
        resolve({ passed: j.passed, total: j.total, failed: j.failed ?? [] });
      } catch {
        resolve({ passed: 0, total: 1, failed: [`the checker did not finish${err ? `: ${String(err.message).slice(0, 200)}` : ''}`] });
      }
    });
  });
}

async function run(task, way, rep) {
  const id = `${task}/${way}/${rep}`;
  const dir = path.join(work, `${task}-${way}-${rep}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(TASKS, task, 'seed'), dir, { recursive: true });
  // A repository, as most work folders are.
  for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=bench', '-c', 'user.email=bench@localhost', 'commit', '-qm', 'start']]) execFileSync('git', a, { cwd: dir });
  const prompt = fs.readFileSync(path.join(TASKS, task, 'task.md'), 'utf8').trim();
  const t0 = Date.now();
  const rec = { id, task, way, rep, startedAt: t0 };
  try {
    const { key } = await api('POST', '/api/sessions', {
      agent: 'claude',
      cwd: dir,
      prompt,
      // The team starts on Automatic; the others name one tier's model.
      model: LED.has(way) ? 'auto' : MODEL_OF[way],
      mode: 'bypassPermissions',
      account: bench.account,
      title: `bench ${id}`,
      extra: { memory: false },
    });
    rec.key = key;
    console.log(`started ${id} (${key})`);
    rec.end = await finished(key, t0);
    rec.ms = Date.now() - t0;
    if (rec.end === 'timeout') await api('POST', `/api/sessions/${enc(key)}/interrupt`).catch(() => {});
    rec.model = (await api('GET', `/api/sessions/${enc(key)}`)).summary?.live?.model ?? null;
    rec.asked = asked.get(key) ?? 0;
    Object.assign(rec, await collect(key));
  } catch (e) {
    rec.end = 'failed';
    rec.error = String(e.message ?? e);
    rec.ms = Date.now() - t0;
  }
  rec.check = await check(task, dir);
  rec.peeked = peeked(task, rec.key);
  results.push(rec);
  save();
  console.log(`${rec.end.padEnd(7)} ${id}: ${rec.check.passed}/${rec.check.total}, $${(rec.usd ?? 0).toFixed(2)}, ${Math.round(rec.ms / 1000)} s, ${rec.helpers?.length ?? 0} helpers${rec.inTurn?.length ? ` + ${rec.inTurn.length} in its turns` : ''}${rec.moved?.length ? `, ${rec.moved.map((m) => `${m.event} → ${m.tier}`).join(', ')}` : ''}`);
}

console.log(`Claude Code's tiers: ${['quick', 'standard', 'best', 'max'].map((t) => `${t} ${tiers.tiers.claude[t].model ?? 'default'}`).join(', ')}`);
// One way at a time: the team is a setting of the whole server.
for (const way of ways) {
  await api('PUT', '/api/models/tiers', { team: { on: LED.has(way), hard: way === 'team' } });
  const todo = [];
  for (let rep = 1; rep <= repeat; rep++) for (const task of tasks) if (!results.some((r) => r.id === `${task}/${way}/${rep}`)) todo.push([task, way, rep]);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(parallel, todo.length) }, async () => {
      while (next < todo.length) {
        await roomToRun();
        if (next < todo.length) await run(...todo[next++]);
      }
    }),
  );
}
await api('PUT', '/api/models/tiers', { team: { on: true, hard: true } });
console.log(`\n${table(results)}`);
