// End to end: two real Hydor servers (ports 18811 and 18812, each with its own HOME, data folder and sign-in) linked as machines,
// and a project sent from one to the other through the first one's hub routes: plan, copy, copy back, move, keep in sync (changes,
// additions, deletions and a conflict on both sides, details and notes, the marks, stop syncing) and cancelling a big copy midway.
// Then the other way round: b is used by a, so b lists a as a machine that uses it, and a project sent to it from b's own pages is
// handed to a, which runs the sending (copy, sync, move, refused folders, cancel) while b keeps a mirror of it.
// Builds the server from this checkout, starts and stops both servers itself and removes its scratch folder.
//   node server/spaces/transfer/hub-e2e.mjs            (from the checkout's root; node_modules must be there)
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKOUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOT = '/tmp/hydor-hub-e2e';
const OUT = 'dist/server'; // inside the checkout: the bundle finds node_modules and its worker files from there
const OUT_EXISTED = fs.existsSync(path.join(CHECKOUT, OUT));
const PORTS = { a: 18811, b: 18812 };
const dirs = (n) => ({ home: `${ROOT}/${n}/home`, data: `${ROOT}/${n}/data`, claude: `${ROOT}/${n}/claude`, codex: `${ROOT}/${n}/codex` });
const D = { a: dirs('a'), b: dirs('b') };

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (what, fn, ms = 30_000, every = 150) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await sleep(every);
  }
};

// ---- servers ----------------------------------------------------------------------------------------------------

const children = {};
const tokens = {};
// The checkout's version may be below the one that first has these routes (it is set when the lead makes the release): the servers
// run from a copy of the checkout's top folder (links to everything, a package.json with a version that has them).
const APP = `${ROOT}/app`;
function makeApp() {
  fs.mkdirSync(APP, { recursive: true });
  for (const e of fs.readdirSync(CHECKOUT)) if (!['.git', 'package.json', 'package-lock.json'].includes(e)) fs.symlinkSync(path.join(CHECKOUT, e), path.join(APP, e));
  const pkg = JSON.parse(fs.readFileSync(path.join(CHECKOUT, 'package.json'), 'utf8'));
  const since = (fs.readFileSync(path.join(CHECKOUT, 'shared/transfer.ts'), 'utf8').match(/TRANSFER_SINCE = '([\d.]+)'/) ?? [])[1] ?? '0.120.0';
  const older = (a, b) => a.split('.').map(Number).some((x, i) => x !== Number(b.split('.')[i]) && (x < Number(b.split('.')[i]) ? true : false) && a.split('.').slice(0, i).join('.') === b.split('.').slice(0, i).join('.'));
  if (older(pkg.version, since)) pkg.version = since;
  fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify(pkg));
}
const env = (n) => ({
  ...process.env,
  HYDOR_ROOT: APP,
  HOME: D[n].home,
  DATA_DIR: D[n].data,
  CLAUDE_CONFIG_DIR: D[n].claude,
  CODEX_HOME: D[n].codex,
  PORT: String(PORTS[n]),
  // Ports of their own, so neither touches the preview or web apps' ports of the app that is really running.
  PREVIEW_PORT: String(PORTS[n] + 10),
  APPS_PORT: String(PORTS[n] + 20),
  HOST: '127.0.0.1',
  HYDOR_EMBED: 'off',
  NODE_ENV: 'development',
  CLAUDE_BIN: '/bin/false',
  CODEX_BIN: '/bin/false',
  CUDA_VISIBLE_DEVICES: '',
});

async function raw(n, method, p, body, headers = {}) {
  const r = await fetch(`http://127.0.0.1:${PORTS[n]}${p}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(tokens[n] ? { authorization: `Bearer ${tokens[n]}` } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text };
}
/** A call that must work. */
async function api(n, method, p, body) {
  const r = await raw(n, method, p, body);
  if (r.status >= 400) throw new Error(`${n} ${method} ${p} → ${r.status} ${r.text.slice(0, 300)}`);
  return r.json;
}

async function spawnServer(n, append = false) {
  for (const k of Object.values(D[n])) fs.mkdirSync(k, { recursive: true });
  const log = fs.openSync(`${ROOT}/${n}.log`, append ? 'a' : 'w');
  const child = spawn('node', [`${OUT}/index.js`], { cwd: CHECKOUT, env: env(n), stdio: ['ignore', log, log] });
  children[n] = child;
  await until(`${n} up`, async () => {
    if (child.exitCode !== null) throw new Error(`server ${n} exited: ${fs.readFileSync(`${ROOT}/${n}.log`, 'utf8').slice(-800)}`);
    return (await fetch(`http://127.0.0.1:${PORTS[n]}/api/health`).then((r) => r.ok, () => false)) || false;
  }, 60_000);
}

async function startServer(n) {
  await spawnServer(n);
  // A password, as the app asks on its first start (the setup token is in its data folder).
  const token = await until(`${n} setup token`, () => (fs.existsSync(`${D[n].data}/setup-token`) ? fs.readFileSync(`${D[n].data}/setup-token`, 'utf8').trim() : ''), 10_000);
  const r = await raw(n, 'POST', '/api/auth/setup', { token, password: 'correct horse battery staple' }, { origin: `http://127.0.0.1:${PORTS[n]}` });
  if (r.status !== 200) throw new Error(`setup ${n}: ${r.status} ${r.text}`);
  // An access token for this script (and, on b, for a to use it).
  tokens[n] = execFileSync('node', [`${OUT}/cli.js`, 'access-token', n === 'b' ? 'hub' : 'script'], { cwd: CHECKOUT, env: env(n), encoding: 'utf8' }).trim();
}

function stopAll() {
  for (const [n, c] of Object.entries(children)) {
    if (c.exitCode === null) {
      try {
        process.kill(c.pid, 'SIGTERM');
      } catch {}
    }
    void n;
  }
}

// ---- files ------------------------------------------------------------------------------------------------------

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const put = (root, rel, text, mtimeMs) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  if (mtimeMs) fs.utimesSync(f, mtimeMs / 1000, mtimeMs / 1000);
  return f;
};
/** path → {hash, mtime} of the files a sync keeps (no .git, no node_modules, no temporary names). */
const tree = (root, o = {}) => {
  const out = {};
  const go = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (!o.git && e.name === '.git') continue;
      // What Git ignores (the logs here) is not kept in step.
      if (e.name === 'node_modules' || e.name.startsWith('.hydor-') || e.name.endsWith('.log')) continue;
      if (e.isDirectory()) go(path.join(dir, e.name), r);
      else if (e.isFile()) {
        const st = fs.statSync(path.join(dir, e.name));
        out[r] = { hash: sha(fs.readFileSync(path.join(dir, e.name))), mtime: Math.round(st.mtimeMs) };
      }
    }
  };
  go(root, '');
  return out;
};
const hashes = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.hash]));
const same = (x, y) => JSON.stringify(Object.entries(x).sort()) === JSON.stringify(Object.entries(y).sort());
const diff = (x, y) => {
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).slice(0, 8).join(', ');
};

// ---- helpers over the hub ---------------------------------------------------------------------------------------

const projects = async (n) => (await api(n, 'GET', '/api/projects')).spaces;
const projectNamed = async (n, name) => (await projects(n)).find((s) => s.name === name);
const waitTransfer = async (id, states = ['done', 'failed', 'cancelled'], ms = 60_000) =>
  until(`transfer ${id}`, async () => (await api('a', 'GET', '/api/machines/projects/transfers')).transfers.find((t) => t.id === id && states.includes(t.state)), ms, 200);
const send = async (body) => (await api('a', 'POST', '/api/machines/projects/send', body)).transfer;
const noteTexts = async (n, space) => {
  const key = (await api(n, 'GET', `/api/projects/${space}`)).memoryKey;
  return (await api(n, 'GET', `/api/memory/entries?scope=repo&key=${encodeURIComponent(key)}&kind=note`)).entries.map((e) => e.text).sort();
};
const link = async () => (await api('a', 'GET', '/api/machines/projects/links')).links[0];
/** Waits for a round that started after now to end with the state ok. */
async function roundDone(after, ms = 40_000) {
  return until('a round', async () => {
    const l = await link();
    return l && l.state === 'ok' && (l.at ?? 0) > after ? l : null;
  }, ms, 200);
}

async function main() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  makeApp();
  console.log('building the server…');
  execFileSync('node', ['scripts/build-server.mjs'], { cwd: CHECKOUT, env: { ...process.env, OUTDIR: OUT }, stdio: 'inherit' });
  await startServer('a');
  await startServer('b');
  const added = await api('a', 'POST', '/api/machines', { name: 'GPU box', via: 'url', url: `http://127.0.0.1:${PORTS.b}`, token: tokens.b });
  await until('GPU box online', async () => (await api('a', 'GET', '/api/machines')).machines.find((m) => m.id === added.machine.id)?.status.state === 'online');
  const gpu = added.machine.id;
  const self = (await api('a', 'GET', '/api/machines')).self;
  const selfB = await api('b', 'GET', '/api/machine');
  check('machine ids: stable, different, in /api/machine and self', !!self.id && !!selfB.id && self.id !== selfB.id && (await api('a', 'GET', '/api/machine')).id === self.id, `${self.id} ${selfB.id}`);
  const reserved = (await api('a', 'POST', '/api/machines', { name: 'Projects', via: 'url', url: `http://127.0.0.1:${PORTS.b}`, token: tokens.b })).machine.id;
  check('the id "projects" is never given to a machine', reserved !== 'projects', reserved);
  await api('a', 'DELETE', `/api/machines/${reserved}`);

  // ---- the project on a --------------------------------------------------------------------------------------------
  const folderA = `${D.a.home}/work/thesis`;
  fs.mkdirSync(folderA, { recursive: true });
  const T0 = Date.parse('2026-11-20T10:00:00Z');
  put(folderA, 'chapters/intro.md', '# Intro\n'.repeat(50), T0);
  put(folderA, 'chapters/method.md', '# Method\n'.repeat(80), T0 + 1000);
  put(folderA, 'data/results.csv', 'a,b\n1,2\n'.repeat(1000), T0 + 2000);
  put(folderA, 'bin/run.sh', '#!/bin/sh\necho run\n', T0 + 3000);
  fs.chmodSync(`${folderA}/bin/run.sh`, 0o755);
  fs.writeFileSync(`${folderA}/photo.bin`, crypto.randomBytes(2_000_000));
  fs.utimesSync(`${folderA}/photo.bin`, (T0 + 4000) / 1000, (T0 + 4000) / 1000);
  for (const f of ['del_a.txt', 'del_b.txt', 'edit_a.txt', 'edit_b.txt', 'both.md']) put(folderA, f, `original ${f}\n`, T0 + 5000);
  put(folderA, '.gitignore', 'node_modules/\n*.log\n', T0);
  put(folderA, 'node_modules/dep/index.js', 'rebuilt later', T0);
  put(folderA, 'debug.log', 'ignored', T0);
  const git = (...a) => execFileSync('git', ['-C', folderA, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const made = await api('a', 'POST', '/api/projects', { name: 'Thesis', folder: folderA, description: 'My thesis', wikiMemory: false });
  const idA = made.id;
  await api('a', 'POST', `/api/projects/${idA}/skills`, { name: 'tidy-data', description: 'Use when tidying the data folder, to keep it in order', body: '# Tidy the data\n\n1. List the CSV files in data/.\n2. Sort them by name and check each has a header row.\n3. Report any file that has none, with its path.\n' });
  const keyA = (await api('a', 'GET', `/api/projects/${idA}`)).memoryKey;
  for (const text of ['The data lives in data/', 'Use the Greek spelling in chapter 2']) await api('a', 'POST', '/api/memory/entries', { scope: 'repo', key: keyA, text });

  // ---- plan --------------------------------------------------------------------------------------------------------
  const planR = await api('a', 'GET', `/api/machines/projects/plan?from=&project=${idA}&to=${gpu}&leaveOut=1&also=0`);
  check('plan: the files it carries, with .git, node_modules left out as rebuilt', planR.plan.git === true && planR.plan.leftOut.some((l) => l.path === 'node_modules' && l.why === 'rebuilt') && planR.plan.files.count >= 10, JSON.stringify(planR.plan.files));
  check('plan: skills and notes counted', planR.plan.skills === 1 && planR.plan.notes === 2, `${planR.plan.skills} skills ${planR.plan.notes} notes`);
  check('plan: the place on the other machine is the same place under its home', planR.place.folder === `${D.b.home}/work/thesis` && planR.place.home === D.b.home && planR.place.free > 0, JSON.stringify(planR.place));
  const bad = await raw('a', 'GET', `/api/machines/projects/plan?from=&project=${idA}&to=`);
  check('plan: the same machine is refused in words', bad.status === 400 && /already/.test(bad.json?.error ?? ''), bad.text);
  const noMachine = await raw('a', 'GET', `/api/machines/projects/plan?from=&project=${idA}&to=nothere`);
  check('plan: an unknown machine is a 404 in words', noMachine.status === 404 && /Settings/.test(noMachine.json?.error ?? ''), noMachine.text);

  // ---- copy ----------------------------------------------------------------------------------------------------------
  let t = await send({ from: '', project: idA, to: gpu, how: 'copy', folder: planR.place.folder });
  check('copy: starts as sending', t.state === 'sending' && t.how === 'copy' && t.to.name === 'GPU box');
  t = await waitTransfer(t.id);
  check('copy: done, with the project there', t.state === 'done' && !!t.result?.project, JSON.stringify(t));
  check('copy: progress counted', t.done.files > 0 && t.done.bytes > 2_000_000, JSON.stringify(t.done));
  const onB = await projectNamed('b', 'Thesis');
  check('copy: the project is on b, came from this machine as a copy', !!onB && onB.came?.how === 'copy' && !!onB.came.from && onB.folder === `${D.b.home}/work/thesis`, JSON.stringify(onB));
  const folderB = onB.folder;
  check('copy: its files are the same (hashes, times)', same(tree(folderA), tree(folderB)), diff(tree(folderA), tree(folderB)));
  check('copy: its Git history came, node_modules did not', fs.existsSync(`${folderB}/.git`) && !fs.existsSync(`${folderB}/node_modules`));
  check('copy: the executable stayed one', (fs.statSync(`${folderB}/bin/run.sh`).mode & 0o111) !== 0);
  check('copy: its skill is there', ((await api('b', 'GET', `/api/projects/${onB.id}/skills`)).skills ?? []).some((s) => s.name === 'tidy-data'));
  check('copy: its notes are there', JSON.stringify(await noteTexts('b', onB.id)) === JSON.stringify(['The data lives in data/', 'Use the Greek spelling in chapter 2'].sort()));
  check('copy: the original is untouched', !!(await projectNamed('a', 'Thesis')) && fs.existsSync(`${folderA}/chapters/intro.md`));
  check('copy: the done notice was made (transfers list keeps it)', (await api('a', 'GET', '/api/machines/projects/transfers')).transfers.some((x) => x.id === t.id));

  // ---- copy back -----------------------------------------------------------------------------------------------------
  const back = await waitTransfer((await send({ from: gpu, project: onB.id, to: '', how: 'copy', folder: `${D.a.home}/work/thesis-back` })).id);
  check('copy back: done', back.state === 'done' && back.from.name === 'GPU box', JSON.stringify(back));
  const backP = (await projects('a')).find((s) => s.id === back.result?.project);
  check('copy back: a new project on a with the same files', !!backP && backP.folder === `${D.a.home}/work/thesis-back` && same(tree(folderA), tree(backP.folder)), backP && diff(tree(folderA), tree(backP.folder)));
  check('copy back: came from GPU box', backP?.came?.from === 'GPU box');
  const dupe = await waitTransfer((await send({ from: '', project: idA, to: gpu, how: 'copy', folder: folderB })).id);
  check('copy: a folder with files in it is refused, in words, and nothing is added', dupe.state === 'failed' && /files at/.test(dupe.error ?? '') && (await projects('b')).filter((x) => x.name === 'Thesis').length === 1, JSON.stringify(dupe));

  // ---- move ----------------------------------------------------------------------------------------------------------
  const folderM = `${D.a.home}/work/mover`;
  put(folderM, 'one.txt', 'one', T0);
  put(folderM, 'two/three.txt', 'three', T0);
  const mover = await api('a', 'POST', '/api/projects', { name: 'Mover', folder: folderM, wikiMemory: false });
  const mv = await waitTransfer((await send({ from: '', project: mover.id, to: gpu, how: 'move', folder: `${D.b.home}/work/mover` })).id);
  check('move: done, its folder went to the Trash here', mv.state === 'done' && typeof mv.result?.trashed === 'string' && fs.existsSync(mv.result.trashed), JSON.stringify(mv.result));
  check('move: gone from a (project and folder), on b with its files', !(await projectNamed('a', 'Mover')) && !fs.existsSync(folderM) && fs.existsSync(`${D.b.home}/work/mover/two/three.txt`) && (await projectNamed('b', 'Mover'))?.came?.how === 'move');

  // ---- sync ----------------------------------------------------------------------------------------------------------
  const sy = await waitTransfer((await send({ from: '', project: idA, to: gpu, how: 'sync', folder: `${D.b.home}/work/thesis-sync` })).id);
  check('sync: the copy arrived and a link was made', sy.state === 'done' && !!sy.result?.link, JSON.stringify(sy));
  const idB = sy.result.project;
  const folderS = `${D.b.home}/work/thesis-sync`;
  let l = await until('first round', async () => {
    const x = await link();
    return x && x.state === 'ok' && x.at ? x : null;
  });
  check('sync: the link lists both projects', l.here.project === idA && l.there.project === idB && l.there.machine === gpu && l.there.machineName === 'GPU box', JSON.stringify(l));
  let sA = (await api('a', 'GET', `/api/projects/${idA}`)).space;
  let sB = (await api('b', 'GET', `/api/projects/${idB}`)).space;
  check('sync: both projects are marked ok, each naming the other', sA.sync?.state === 'ok' && sB.sync?.state === 'ok' && sA.sync.peer.name === 'GPU box' && sA.sync.link === sB.sync.link && sA.sync.by.id === self.id && sB.sync.by.id === self.id, JSON.stringify([sA.sync, sB.sync]));
  check('sync: the first round changed nothing', same(tree(folderA), tree(folderS)));
  const logB = hashes(tree(folderS));
  void logB;

  // Changes on both sides while both are on.
  const T1 = Date.now() - 60_000;
  put(folderA, 'edit_a.txt', 'edited on a\n', T1);
  put(folderS, 'edit_b.txt', 'edited on b\n', T1);
  put(folderA, 'new_a.txt', 'new on a\n', T1);
  put(folderS, 'sub/dir/new_b.txt', 'new on b\n', T1);
  fs.rmSync(`${folderA}/del_a.txt`);
  fs.rmSync(`${folderS}/del_b.txt`);
  put(folderA, 'both.md', 'a says this\n', T1 + 5000);
  put(folderS, 'both.md', 'b says that\n', T1 + 9000);
  put(folderA, 'debug2.log', 'ignored by git', T1);
  await api('b', 'PATCH', `/api/projects/${idB}`, { name: 'Thesis (b)' });
  await api('b', 'POST', '/api/memory/entries', { scope: 'repo', key: (await api('b', 'GET', `/api/projects/${idB}`)).memoryKey, text: 'A note written on b' });
  await api('a', 'POST', '/api/memory/entries', { scope: 'repo', key: keyA, text: 'A note written on a' });
  const before = Date.now();
  await api('a', 'POST', `/api/machines/projects/links/${l.id}/sync`, {});
  l = await roundDone(before);
  // A round may have started before the last change landed: another look settles it.
  await until('both sides match', async () => {
    const x = tree(folderA);
    const y = tree(folderS);
    if (same(x, y)) return true;
    await api('a', 'POST', `/api/machines/projects/links/${l.id}/sync`, {});
    await sleep(1500);
    return false;
  }, 40_000, 500).catch(() => null);
  const ta = tree(folderA);
  const tb = tree(folderS);
  check('sync: both sides match after the round', same(ta, tb), `${diff(ta, tb)} | ${JSON.stringify(await link())}`);
  check('sync: a change on a reached b, and one on b reached a', fs.readFileSync(`${folderS}/edit_a.txt`, 'utf8') === 'edited on a\n' && fs.readFileSync(`${folderA}/edit_b.txt`, 'utf8') === 'edited on b\n');
  check('sync: additions reached the other side (a folder made on the way)', fs.readFileSync(`${folderS}/new_a.txt`, 'utf8') === 'new on a\n' && fs.readFileSync(`${folderA}/sub/dir/new_b.txt`, 'utf8') === 'new on b\n');
  check('sync: deletions reached the other side', !fs.existsSync(`${folderS}/del_a.txt`) && !fs.existsSync(`${folderA}/del_b.txt`));
  check('sync: what was deleted is in the Trash of the machine it was deleted from by the sync', fs.readdirSync(`${D.a.data}/trash`).some((n) => n.endsWith('del_b.txt')) && fs.readdirSync(`${D.b.data}/trash`).some((n) => n.endsWith('del_a.txt')));
  check('sync: the times are the writer\'s (same on both sides)', ta['edit_a.txt'].mtime === tb['edit_a.txt'].mtime && Math.abs(ta['edit_a.txt'].mtime - T1) <= 1, `${ta['edit_a.txt'].mtime} ${tb['edit_a.txt'].mtime} ${T1}`);
  const conflictsA = Object.keys(ta).filter((k) => /^both \(conflict, .+, \d{4}-\d\d-\d\d \d\d\.\d\d\)\.md$/.test(k));
  const conflictsB = Object.keys(tb).filter((k) => /^both \(conflict, .+\)\.md$/.test(k));
  check('sync: a conflict kept both: the later (b) wins at its name, the other is a conflict copy, on both sides', conflictsA.length === 1 && conflictsB.length === 1 && fs.readFileSync(`${folderA}/both.md`, 'utf8') === 'b says that\n' && fs.readFileSync(`${folderA}/${conflictsA[0]}`, 'utf8') === 'a says this\n', JSON.stringify(conflictsA));
  check('sync: what Git ignores stayed where it was', fs.existsSync(`${folderA}/debug2.log`) && !fs.existsSync(`${folderS}/debug2.log`) && !fs.existsSync(`${folderS}/node_modules`));
  check('sync: no temporary file was left behind', [folderA, folderS].every((r) => !Object.keys(tree(r, { git: true })).some((k) => k.includes('.hydor-'))) && !fs.readdirSync(`${folderS}`).some((n) => n.startsWith('.hydor-')));
  check('sync: the name changed on b reached a', (await projectNamed('a', 'Thesis (b)'))?.id === idA);
  const nA = await noteTexts('a', idA);
  const nB = await noteTexts('b', idB);
  check('sync: notes written on each side reached the other', JSON.stringify(nA) === JSON.stringify(nB) && nA.includes('A note written on a') && nA.includes('A note written on b'), JSON.stringify([nA, nB]));
  l = await link();
  sA = (await api('a', 'GET', `/api/projects/${idA}`)).space;
  sB = (await api('b', 'GET', `/api/projects/${idB}`)).space;
  check('sync: the marks show ok on both sides, the conflict on the keeper\'s', sA.sync?.state === 'ok' && sB.sync?.state === 'ok' && (sA.sync.conflicts ?? []).some((c) => c.path === 'both.md' && c.copy === conflictsA[0]), JSON.stringify([sA.sync, sB.sync]));
  check('sync: the link says ok with when', l.state === 'ok' && l.at > before);
  // A change on a alone is picked up by itself (the folder is watched) within a few seconds.
  put(folderA, 'watched.txt', 'seen by the watcher\n', Date.now());
  const seen = await until('the watcher', async () => fs.existsSync(`${folderS}/watched.txt`), 25_000, 300).then(() => true, () => false);
  check('sync: a change in the folder is carried by itself, without Sync now', seen);

  // A file that leaves a side's listing while it is still on disk is not deleted: a folder Git now ignores stays on both machines.
  const sync = async () => {
    const at = Date.now();
    await api('a', 'POST', `/api/machines/projects/links/${(await link()).id}/sync`, {});
    return roundDone(at);
  };
  for (const n of ['one', 'two', 'three']) put(folderA, `kept/${n}.txt`, `kept ${n}\n`, T1);
  await sync();
  await until('kept/ on b', async () => fs.existsSync(`${folderS}/kept/three.txt`), 30_000, 300).catch(() => null);
  check('ignored folder: first it is synced as any folder', fs.existsSync(`${folderS}/kept/one.txt`) && fs.existsSync(`${folderS}/kept/three.txt`));
  const trashB = () => fs.readdirSync(`${D.b.data}/trash`);
  const trashBefore = trashB().length;
  const gi = fs.readFileSync(`${folderA}/.gitignore`, 'utf8');
  put(folderA, '.gitignore', gi + 'kept/\n', Date.now());
  await sync();
  await sync();
  await sleep(1500);
  await sync();
  check('ignored folder: after it is added to .gitignore (which syncs too) its files are on both machines, none trashed on b, the link ok', ['one', 'two', 'three'].every((n) => fs.existsSync(`${folderA}/kept/${n}.txt`) && fs.existsSync(`${folderS}/kept/${n}.txt`)) && fs.readFileSync(`${folderS}/.gitignore`, 'utf8').includes('kept/') && !trashB().slice(trashBefore).some((n) => /(one|two|three)\.txt$/.test(n)) && (await link()).state === 'ok', JSON.stringify({ trash: trashB().slice(trashBefore), link: await link() }));
  // A change to an ignored file reaches nothing, and is not an error.
  put(folderA, 'kept/one.txt', 'changed after it was ignored\n', Date.now());
  await sync();
  check('ignored folder: later changes to it are left alone (no error, no copy)', fs.readFileSync(`${folderS}/kept/one.txt`, 'utf8') === 'kept one\n' && (await link()).state === 'ok' && !(await link()).error);
  // A Python environment in a Git repository with no ignore line for it is rebuilt, not sent.
  put(folderA, '.venv/pyvenv.cfg', 'home = /usr/bin\n', Date.now());
  put(folderA, '.venv/lib/site.py', 'print(1)\n', Date.now());
  put(folderA, 'after-venv.txt', 'a real file next to it\n', Date.now());
  await sync();
  await until('after-venv on b', async () => fs.existsSync(`${folderS}/after-venv.txt`), 30_000, 300).catch(() => null);
  await sync();
  check('python environment: a .venv with pyvenv.cfg never reaches the other machine, the files beside it do', fs.existsSync(`${folderS}/after-venv.txt`) && !fs.existsSync(`${folderS}/.venv`) && (await link()).state === 'ok');

  // Stop syncing.
  await api('a', 'DELETE', `/api/machines/projects/links/${l.id}`);
  sA = (await api('a', 'GET', `/api/projects/${idA}`)).space;
  sB = (await api('b', 'GET', `/api/projects/${idB}`)).space;
  check('stop syncing: both marks are gone, both copies stay, the link is gone', !sA.sync && !sB.sync && (await api('a', 'GET', '/api/machines/projects/links')).links.length === 0 && fs.existsSync(`${folderA}/new_a.txt`) && fs.existsSync(`${folderS}/new_a.txt`));
  put(folderA, 'after-stop.txt', 'x', Date.now());
  await sleep(4500);
  check('stop syncing: a change afterwards stays where it is', !fs.existsSync(`${folderS}/after-stop.txt`));

  // ---- stopped from the other side --------------------------------------------------------------------------------
  const folderO = `${D.a.home}/work/other`;
  put(folderO, 'x.txt', 'x', T0);
  const other = await api('a', 'POST', '/api/projects', { name: 'Other', folder: folderO, wikiMemory: false });
  const so = await waitTransfer((await send({ from: '', project: other.id, to: gpu, how: 'sync', folder: `${D.b.home}/work/other` })).id);
  await until('other link ok', async () => (await link())?.state === 'ok' && (await link())?.at);
  await api('b', 'PUT', `/api/projects/${so.result.project}/sync/mark`, { mark: null });
  const lo = await link();
  await api('a', 'POST', `/api/machines/projects/links/${lo.id}/sync`, {});
  const ended = await until('the link ends when the other side stopped it', async () => (await api('a', 'GET', '/api/machines/projects/links')).links.length === 0, 30_000);
  check('stopped on the other side: the link ends here, this side\'s mark is cleared', ended && !(await api('a', 'GET', `/api/projects/${other.id}`)).space.sync);

  // ---- the mass-delete guard ---------------------------------------------------------------------------------------
  const folderG = `${D.a.home}/work/guard`;
  for (let i = 0; i < 30; i++) put(folderG, `g${i}.txt`, `file ${i}`, T0);
  const guard = await api('a', 'POST', '/api/projects', { name: 'Guard', folder: folderG, wikiMemory: false });
  const sg = await waitTransfer((await send({ from: '', project: guard.id, to: gpu, how: 'sync', folder: `${D.b.home}/work/guard` })).id);
  const folderGB = `${D.b.home}/work/guard`;
  await until('guard link ok', async () => (await link())?.state === 'ok' && (await link())?.at);
  for (let i = 0; i < 25; i++) fs.rmSync(`${folderG}/g${i}.txt`);
  await api('a', 'POST', `/api/machines/projects/links/${(await link()).id}/sync`, {});
  const held = await until('held', async () => ((await link())?.state === 'held' ? await link() : null), 30_000, 200);
  check('guard: removing 25 of 30 files is held, in words, and nothing is removed on the other side', /Sync would remove 25 files on .*Sync anyway, or Stop syncing/.test(held.error ?? '') && fs.readdirSync(folderGB).filter((n) => n.endsWith('.txt')).length === 30, held.error);
  check('guard: the mark on the project says held', (await api('a', 'GET', `/api/projects/${guard.id}`)).space.sync?.state === 'held' && (await api('b', 'GET', `/api/projects/${sg.result.project}`)).space.sync?.state === 'held');
  await api('a', 'POST', `/api/machines/projects/links/${held.id}/sync`, { force: true });
  await until('forced', async () => fs.readdirSync(folderGB).filter((n) => n.endsWith('.txt')).length === 5 && (await link())?.state === 'ok', 30_000, 200).catch(() => null);
  check('guard: Sync anyway lets them through (to the Trash)', fs.readdirSync(folderGB).filter((n) => n.endsWith('.txt')).length === 5 && (await link())?.state === 'ok');
  await api('a', 'DELETE', `/api/machines/projects/links/${(await link()).id}`);

  // ---- the other machine goes away and comes back ------------------------------------------------------------------
  const folderW = `${D.a.home}/work/waiting`;
  put(folderW, 'w.txt', 'w', T0);
  const wp = await api('a', 'POST', '/api/projects', { name: 'Waiting', folder: folderW, wikiMemory: false });
  await waitTransfer((await send({ from: '', project: wp.id, to: gpu, how: 'sync', folder: `${D.b.home}/work/waiting` })).id);
  await until('waiting link ok', async () => (await link())?.state === 'ok' && (await link())?.at);
  const okAt = (await link()).at;
  children.b.kill('SIGTERM');
  await until('b is down', async () => children.b.exitCode !== null, 15_000);
  put(folderW, 'while-away.txt', 'written while b was off', Date.now());
  await api('a', 'POST', `/api/machines/projects/links/${(await link()).id}/sync`, {});
  const wl = await until('waiting', async () => ((await link())?.state === 'waiting' ? await link() : null), 40_000, 300);
  check('waiting: the link waits for the machine that is off, in words, keeping its last time', /GPU box/.test(wl.error ?? '') && wl.at === okAt, JSON.stringify(wl));
  check('waiting: the project here says so', (await api('a', 'GET', `/api/projects/${wp.id}`)).space.sync?.state === 'waiting');
  await spawnServer('b', true);
  const back2 = await until('b is back', async () => fs.existsSync(`${D.b.home}/work/waiting/while-away.txt`), 120_000, 500).then(() => true, () => false);
  check('waiting: when it is back, what was written meanwhile is carried and the state is ok again', back2 && (await until('ok again', async () => (await link())?.state === 'ok', 30_000, 300).then(() => true, () => false)));
  await api('a', 'DELETE', `/api/machines/projects/links/${(await link()).id}`);

  // ---- cancel --------------------------------------------------------------------------------------------------------
  const folderBig = `${D.a.home}/work/big`;
  fs.mkdirSync(folderBig, { recursive: true });
  for (let i = 0; i < 12; i++) fs.writeFileSync(`${folderBig}/blob${i}.bin`, crypto.randomBytes(40_000_000));
  put(folderBig, 'small.txt', 'x', T0);
  const big = await api('a', 'POST', '/api/projects', { name: 'Big', folder: folderBig, wikiMemory: false });
  const bt = await send({ from: '', project: big.id, to: gpu, how: 'copy', folder: `${D.b.home}/work/big` });
  const mid = await until('some bytes sent', async () => {
    const x = (await api('a', 'GET', '/api/machines/projects/transfers')).transfers.find((y) => y.id === bt.id);
    if (x.state !== 'sending') throw new Error(`it ended before it could be cancelled: ${x.state} ${x.error ?? ''}`);
    return x.done.bytes > 30_000_000 ? x : null;
  }, 60_000, 100);
  check('cancel: progress is told while it runs', mid.done.bytes > 30_000_000 && mid.total.bytes > 480_000_000, JSON.stringify([mid.done, mid.total]));
  await api('a', 'DELETE', `/api/machines/projects/transfers/${bt.id}`);
  const cancelled = await waitTransfer(bt.id, ['done', 'failed', 'cancelled'], 30_000);
  check('cancel: ends as cancelled', cancelled.state === 'cancelled', cancelled.state + ' ' + (cancelled.error ?? ''));
  await sleep(3000);
  const left = fs.readdirSync(`${D.b.home}/work`).filter((n) => n === 'big' || n.startsWith('.hydor-'));
  check('cancel: nothing is left on the receiver (no project, no folder, no staging beside it)', !(await projectNamed('b', 'Big')) && left.length === 0, `${left}`);
  const stagingData = (() => {
    try {
      return execFileSync('find', [D.b.data, '-name', '.hydor-arriving-*', '-o', '-name', '*arriving*'], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  })();
  check('cancel: nor staging in its data folder', stagingData === '', stagingData);
  check('cancel: the original is untouched', fs.readdirSync(folderBig).length === 13 && !!(await projectNamed('a', 'Big')));

  // ---- handed over: b is used by a (a has b in its list), so b lists a as a machine that uses it and hands the sending to it ----
  // Everything here is driven through b's own API, as a browser on b's pages would, to a machine b cannot reach by itself.
  const ref = `c:${self.id}`;
  const clientOf = async () => ((await api('b', 'GET', '/api/machines')).clients ?? []).find((c) => c.ref === ref);
  // a had to connect to b again when b came back: it may take a minute.
  const client = await until('a is listed on b as a client', clientOf, 120_000, 500);
  check('handoff: b lists a as a client that takes projects, with its name and host', client.takes === true && client.name === 'hub' && client.version === (await api('a', 'GET', '/api/machine')).version && !!client.host, JSON.stringify(client));
  const sendB = async (body) => (await api('b', 'POST', '/api/machines/projects/send', body)).transfer;
  const transfersB = async () => (await api('b', 'GET', '/api/machines/projects/transfers')).transfers;
  const waitB = (id, ms = 90_000) => until(`b transfer ${id}`, async () => (await transfersB()).find((x) => x.id === id && ['done', 'failed', 'cancelled'].includes(x.state)), ms, 200);
  const transfersA = async () => (await api('a', 'GET', '/api/machines/projects/transfers')).transfers;
  const makeOnB = async (name, files) => {
    const dir = `${D.b.home}/work/${name.toLowerCase()}`;
    for (const [rel, text] of Object.entries(files)) put(dir, rel, text, T0);
    const sp = await api('b', 'POST', '/api/projects', { name, folder: dir, wikiMemory: false });
    return { id: sp.id, dir };
  };

  const hc = await makeOnB('Handoff', { 'one.txt': 'one\n', 'deep/two.txt': 'two\n'.repeat(100), 'bin/run.sh': '#!/bin/sh\n' });
  const hplan = await api('b', 'GET', `/api/machines/projects/plan?from=&project=${hc.id}&to=${encodeURIComponent(ref)}&leaveOut=1&also=0`);
  check('handoff: the plan is made here and the place comes from a', hplan.plan.files.count >= 3 && hplan.place.folder === `${D.a.home}/work/handoff` && hplan.place.home === D.a.home, JSON.stringify(hplan.place));

  // copy
  let ht = await sendB({ from: '', project: hc.id, to: ref, how: 'copy', folder: hplan.place.folder });
  check('handoff copy: starts as a mirror that is sending, from here to a', ht.state === 'sending' && ht.from.machine === '' && ht.to.machine === ref && ht.to.name === 'hub' && ht.project.id === hc.id, JSON.stringify(ht));
  ht = await waitB(ht.id);
  check('handoff copy: the mirror ends done, with the project on a and bytes counted', ht.state === 'done' && !!ht.result?.project && ht.done.files >= 3 && ht.done.bytes > 0 && ht.endedAt, JSON.stringify(ht));
  const hOnA = (await projects('a')).find((x) => x.id === ht.result?.project);
  check('handoff copy: it is in a\'s projects, as a copy that came from b, with the same files', !!hOnA && hOnA.name === 'Handoff' && hOnA.came?.how === 'copy' && hOnA.folder === `${D.a.home}/work/handoff` && same(tree(hc.dir), tree(hOnA.folder)), hOnA && diff(tree(hc.dir), tree(hOnA.folder)));
  check('handoff copy: the original stays on b', !!(await projectNamed('b', 'Handoff')) && fs.existsSync(`${hc.dir}/one.txt`));
  check('handoff copy: a ran it as its own sending (from b, to itself)', (await transfersA()).some((x) => x.project.id === hc.id && x.from.machine === gpu && x.to.machine === '' && x.state === 'done'));

  // no folder given (an agent's call): it goes to the place the plan gives there
  const hn = await makeOnB('HandoffNoFolder', { 'n.txt': 'n\n' });
  const htn = await waitB((await sendB({ from: '', project: hn.id, to: ref, how: 'copy' })).id);
  check('handoff copy: with no folder given, it goes to the place the plan gives there', htn.state === 'done' && htn.result?.folder === `${D.a.home}/work/handoffnofolder`, JSON.stringify(htn));

  // a folder that is not empty: a's own words reach b\'s mirror
  const dupeH = await waitB((await sendB({ from: '', project: hc.id, to: ref, how: 'copy', folder: hplan.place.folder })).id);
  check('handoff copy: a folder with files in it is refused by a, and its words are in the mirror', dupeH.state === 'failed' && /files at/.test(dupeH.error ?? ''), JSON.stringify(dupeH));

  // refused folders: outside a\'s home, hidden, with .. in it
  for (const [what, folder] of [['outside its home folder', `/tmp/hydor-hub-e2e-outside/handoff`], ['in a hidden folder', `${D.a.home}/.hidden/handoff`], ['with ..', `${D.a.home}/work/../../outside`]]) {
    const r = await raw('b', 'POST', '/api/machines/projects/send', { from: '', project: hc.id, to: ref, how: 'copy', folder });
    check(`handoff: a folder ${what} is refused in words`, r.status === 400 && /^From here, a project can go only to a folder in that machine's home folder: to put it elsewhere, send it from Hydor on that machine$/.test(r.json?.error ?? ''), r.text);
  }
  check('handoff: a refused sending leaves nothing behind (no mirror, nothing on a)', !(await transfersB()).some((x) => x.state === 'sending') && !fs.existsSync('/tmp/hydor-hub-e2e-outside') && !fs.existsSync(`${D.a.home}/.hidden`));
  const notThere = await raw('b', 'POST', '/api/machines/projects/send', { from: '', project: hc.id, to: 'c:00000000', how: 'copy', folder: hplan.place.folder });
  check('handoff: a machine that is not connected is a 404 in words', notThere.status === 404 && /not connected now/.test(notThere.json?.error ?? ''), notThere.text);
  const fromOther = await raw('b', 'POST', '/api/machines/projects/send', { from: 'somewhere', project: hc.id, to: ref, how: 'copy', folder: hplan.place.folder });
  check('handoff: a sending from another machine is refused', fromOther.status === 400 && /own pages/.test(fromOther.json?.error ?? ''), fromOther.text);

  // sync: a keeps the link, b\'s copy is marked as the other side of it
  const hs = await makeOnB('HandoffSync', { 'a.txt': 'a\n', 'sub/b.txt': 'b\n' });
  const syncFolder = `${D.a.home}/work/handoff-sync`;
  ht = await waitB((await sendB({ from: '', project: hs.id, to: ref, how: 'sync', folder: syncFolder })).id);
  check('handoff sync: the mirror ends done with the link', ht.state === 'done' && !!ht.result?.link && !!ht.result?.project, JSON.stringify(ht));
  const aLink = await until('the link on a', async () => (await api('a', 'GET', '/api/machines/projects/links')).links.find((x) => x.id === ht.result.link && x.state === 'ok' && x.at), 40_000, 300);
  check('handoff sync: a keeps the link, between its new project and b\'s', aLink.here.project === ht.result.project && aLink.there.project === hs.id && aLink.there.machine === gpu, JSON.stringify(aLink));
  const markB = await until('the mark on b', async () => (await api('b', 'GET', `/api/projects/${hs.id}`)).space.sync, 30_000, 300);
  check('handoff sync: b\'s project is marked, by a (its id), with the same link', markB.by.id === self.id && markB.link === ht.result.link, JSON.stringify(markB));
  check('handoff sync: b is not the keeper: it has no link of its own', (await api('b', 'GET', '/api/machines/projects/links')).links.length === 0);
  put(syncFolder, 'later.txt', 'written on a\n', Date.now());
  check('handoff sync: a change on a reaches b', await until('later.txt on b', async () => fs.existsSync(`${hs.dir}/later.txt`), 40_000, 300).then(() => true, () => false));
  await api('a', 'DELETE', `/api/machines/projects/links/${aLink.id}`);
  check('handoff sync: a stops syncing: the marks go from both', await until('marks gone', async () => !(await api('b', 'GET', `/api/projects/${hs.id}`)).space.sync && !(await api('a', 'GET', `/api/projects/${ht.result.project}`)).space.sync, 30_000, 300).then(() => true, () => false));

  // move: it leaves b (its folder to b\'s Trash), a has it
  const hm = await makeOnB('HandoffMove', { 'm.txt': 'moved\n', 'x/y.txt': 'y\n' });
  ht = await waitB((await sendB({ from: '', project: hm.id, to: ref, how: 'move', folder: `${D.a.home}/work/handoffmove` })).id);
  check('handoff move: the mirror ends done, with b\'s Trash path', ht.state === 'done' && typeof ht.result?.trashed === 'string' && fs.existsSync(ht.result.trashed), JSON.stringify(ht.result));
  check('handoff move: it left b (project and folder) and is on a with its files', !(await projectNamed('b', 'HandoffMove')) && !fs.existsSync(hm.dir) && (await projectNamed('a', 'HandoffMove'))?.came?.how === 'move' && fs.existsSync(`${D.a.home}/work/handoffmove/x/y.txt`));

  // cancel a big one midway: both sides say cancelled
  const hb = await makeOnB('HandoffBig', { 'small.txt': 'x' });
  for (let i = 0; i < 12; i++) fs.writeFileSync(`${hb.dir}/blob${i}.bin`, crypto.randomBytes(40_000_000));
  const bigT = await sendB({ from: '', project: hb.id, to: ref, how: 'copy', folder: `${D.a.home}/work/handoffbig` });
  const midH = await until('some bytes sent by a', async () => {
    const x = (await transfersB()).find((y) => y.id === bigT.id);
    if (x.state !== 'sending') throw new Error(`it ended before it could be cancelled: ${x.state} ${x.error ?? ''}`);
    return x.done.bytes > 30_000_000 ? x : null;
  }, 90_000, 100);
  check('handoff cancel: the mirror shows the progress and the plan\'s total', midH.done.bytes > 30_000_000 && midH.total.bytes > 480_000_000, JSON.stringify([midH.done, midH.total]));
  await api('b', 'DELETE', `/api/machines/projects/transfers/${bigT.id}`);
  const endedH = await waitB(bigT.id, 40_000);
  check('handoff cancel: the mirror ends as cancelled', endedH.state === 'cancelled', `${endedH.state} ${endedH.error ?? ''}`);
  const onA = await until('a ended it too', async () => (await transfersA()).find((x) => x.project.id === hb.id && ['done', 'failed', 'cancelled'].includes(x.state)), 30_000, 200);
  check('handoff cancel: a\'s own transfer ended as cancelled', onA.state === 'cancelled', `${onA.state} ${onA.error ?? ''}`);
  await sleep(2000);
  const leftA = fs.readdirSync(`${D.a.home}/work`).filter((n) => n === 'handoffbig' || n.startsWith('.hydor-'));
  check('handoff cancel: nothing is left on a (no project, no folder, no staging)', !(await projectNamed('a', 'HandoffBig')) && leftA.length === 0, `${leftA}`);
  check('handoff cancel: the original is untouched on b', !!(await projectNamed('b', 'HandoffBig')) && fs.readdirSync(hb.dir).length === 13);
}

let code = 0;
try {
  await main();
} catch (e) {
  console.log(`FAIL (script) ${e.stack ?? e}`);
  for (const n of ['a', 'b']) {
    try {
      console.log(`--- ${n}.log (tail)\n${fs.readFileSync(`${ROOT}/${n}.log`, 'utf8').slice(-1500)}`);
    } catch {}
  }
  failed++;
} finally {
  stopAll();
  await sleep(1500);
  for (const c of Object.values(children)) {
    if (c.exitCode === null) {
      try {
        process.kill(c.pid, 'SIGKILL');
      } catch {}
    }
  }
  fs.rmSync(ROOT, { recursive: true, force: true });
  if (!OUT_EXISTED) fs.rmSync(path.join(CHECKOUT, OUT), { recursive: true, force: true });
  console.log(`${passed} passed, ${failed} failed`);
  code = failed ? 1 : 0;
}
process.exit(code);
