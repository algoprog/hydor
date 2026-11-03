// The command line's template commands (node dist/server/cli.js app …), through the running app's API with an
// access token of its own, kept in the data folder (Settings → Machines lists it as “This computer's command
// line”, to revoke there). Write a template as files in any editor and keep it in step (app new, app folder),
// watch it try its examples as you save (app dev), try it (app try), and carry it to another computer as one
// file (app export, app import, which says what installing it will do first).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { InstallPreview } from '../../shared/app-manifest.ts';
import type { AppDef, AppRun } from '../../shared/apps.ts';
import { isActive } from '../../shared/apps.ts';
import { config, ensureDirs } from '../config.ts';
import { openDb } from '../db.ts';
import { accessOk, createAccessToken } from '../machines.ts';

const USAGE = `usage: node dist/server/cli.js app <command>

  list                          your apps: address, name, folder
  new <name> [folder]           make an app and its folder of files, to write in any editor
  folder <app> [folder]         make an app's folder (it then keeps in step with the app)
  dev <app> [folder]            its folder, and each change you save there tried on its examples
  try <app> [answers]           try its examples, or one set of answers ('{"topic": "GPUs"}'); waits
  export <app> [file]           save it as one file (.hydor-app), with what it calls and its screens
  import <file>                 say what installing an app file will do, then install it

An app is its address or id. Hydor must be running (PORT, or HYDOR_URL, says where).`;

type Call = <T = any>(method: string, p: string, body?: unknown) => Promise<T>;

/** The running app's API, with this computer's command-line token (made the first time). */
function client(): { call: Call; base: string; raw: (p: string) => Promise<Buffer> } {
  ensureDirs();
  const db = openDb();
  const file = path.join(config.dataDir, 'cli-token');
  let token = '';
  try {
    token = fs.readFileSync(file, 'utf8').trim();
  } catch {}
  if (!token || !accessOk(db, token)) {
    token = createAccessToken(db, 'This computer’s command line').token;
    fs.writeFileSync(file, token, { mode: 0o600 });
  }
  db.close();
  const base = (process.env.HYDOR_URL ?? `http://127.0.0.1:${process.env.PORT ?? '8790'}`).replace(/\/$/, '');
  const send = async (method: string, p: string, body?: unknown) => {
    try {
      return await fetch(base + p, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error(`Hydor does not answer at ${base}: is it running? (node dist/server/cli.js service status)`);
    }
  };
  const call: Call = async (method, p, body) => {
    const r = await send(method, p, body);
    const text = await r.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {}
    if (!r.ok) throw new Error(typeof data === 'object' && data?.error ? data.error : `${r.status} ${text.slice(0, 200)}`);
    return data;
  };
  const raw = async (p: string) => {
    const r = await send('GET', p);
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return Buffer.from(await r.arrayBuffer());
  };
  return { call, base, raw };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (n?: number) => (n ? `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}` : '');

/** How a try went, in a line: passed, its checks that failed and what they saw, or why it did not finish. */
function lineOf(r: AppRun, name: string): { ok: boolean; text: string } {
  const failed = (r.checks ?? []).filter((c) => !c.ok);
  const took = r.startedAt && r.endedAt ? `${Math.max(1, Math.round((r.endedAt - r.startedAt) / 1000))} s` : '';
  const cost = [took, money(r.costUsd)].filter(Boolean).join(' · ');
  if (r.status !== 'done') return { ok: false, text: `✗ ${name}: did not finish${r.error ? `: ${r.error}` : ''}${cost ? `  (${cost})` : ''}` };
  if (failed.length) return { ok: false, text: `✗ ${name}: ${failed.length} of ${r.checks!.length} checks failed${cost ? `  (${cost})` : ''}\n${failed.map((c) => `    ${c.rule}${c.why ? `  (${c.why})` : ''}`).join('\n')}` };
  return { ok: true, text: `✓ ${name}${r.checks?.length ? '' : ' (no checks)'}${cost ? `  (${cost})` : ''}` };
}

/** Waits for runs to end (at most `ms`), then says how each went; true when all passed. */
async function report(call: Call, runs: { run: AppRun; name: string }[], ms = 15 * 60_000): Promise<boolean> {
  const until = Date.now() + ms;
  const ended = new Map<string, AppRun>();
  while (ended.size < runs.length && Date.now() < until) {
    for (const { run } of runs) {
      if (ended.has(run.id)) continue;
      const r = (await call<{ run: AppRun }>('GET', `/api/apps/runs/${encodeURIComponent(run.id)}`)).run;
      if (!isActive(r.status)) ended.set(r.id, r);
    }
    if (ended.size < runs.length) await sleep(1000);
  }
  let all = true;
  for (const { run, name } of runs) {
    const r = ended.get(run.id);
    if (!r) {
      all = false;
      console.log(`… ${name}: still running (its page: /apps/runs/${run.id})`);
      continue;
    }
    const l = lineOf(r, name);
    all &&= l.ok;
    console.log(l.text);
  }
  return all;
}

/** Tries a template: its examples, or one set of answers. */
async function tryIt(call: Call, a: AppDef, answers?: Record<string, unknown>): Promise<boolean> {
  if (answers) {
    const { run } = await call<{ run: AppRun }>('POST', `/api/apps/${a.id}/runs`, { inputs: answers, source: 'test' });
    return report(call, [{ run, name: 'A try' }]);
  }
  if (!a.examples?.length) {
    console.log(`“${a.name}” has no examples yet: give it some in its Edit (or in its app.json), or try it with answers.`);
    return true;
  }
  const r = await call<{ runs: { example: string; run?: AppRun; error?: string }[] }>('POST', `/api/apps/${a.id}/examples/run`, {});
  for (const x of r.runs) if (x.error) console.log(`✗ ${x.example}: ${x.error}`);
  return (await report(call, r.runs.filter((x) => x.run).map((x) => ({ run: x.run!, name: a.examples!.find((e) => e.id === x.example)?.name || x.example })))) && !r.runs.some((x) => x.error);
}

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (a) => (rl.close(), resolve(a))));
}

export async function appCommand(args: string[]): Promise<number> {
  const [sub, first, second] = args;
  if (!sub || sub === 'help' || sub === '--help') return (console.log(USAGE), 0);
  const { call, raw } = client();
  const find = async (which: string | undefined) => {
    if (!which) throw new Error('Say which app: its address or id (app list shows them)');
    const r = await call<{ app?: AppDef }>('GET', `/api/apps/${encodeURIComponent(which)}`);
    if (!r.app) throw new Error(`“${which}” is a ready-made app: make it yours in Hydor first`);
    return r.app;
  };
  switch (sub) {
    case 'list': {
      const { apps } = await call<{ apps: AppDef[] }>('GET', '/api/apps');
      for (const a of apps) console.log(`${a.slug.padEnd(28)} ${a.name}${a.folder ? `   ${a.folder}` : ''}`);
      if (!apps.length) console.log('No apps yet: app new <name> makes one.');
      return 0;
    }
    case 'new': {
      if (!first) throw new Error('Give it a name: app new "Reading list"');
      const { app } = await call<{ app: AppDef }>('POST', '/api/apps', {
        recipe: { name: first, prompt: 'Say what it does here, with {{topic}} where the answer to its question goes.', fields: [{ id: 'topic', label: 'Topic', type: 'text', required: true }], answer: [] },
      });
      const r = await call<{ folder: { path: string } }>('POST', `/api/apps/${app.id}/folder`, second ? { path: path.resolve(second) } : {});
      console.log(`Made “${app.name}” (its address: ${app.slug}), in ${r.folder.path}\nOpen that folder in your editor: app.json is the app, and each change you save comes to Hydor as a version.`);
      return 0;
    }
    case 'folder': {
      const a = await find(first);
      const r = await call<{ folder: { path: string } }>('POST', `/api/apps/${a.id}/folder`, second ? { path: path.resolve(second) } : {});
      console.log(`“${a.name}” is in ${r.folder.path}: each change you save there comes to the app as a version.`);
      return 0;
    }
    case 'try': {
      const a = await find(first);
      let answers: Record<string, unknown> | undefined;
      if (second) {
        try {
          answers = JSON.parse(second);
        } catch {
          throw new Error('The answers are JSON: \'{"topic": "GPUs"}\'');
        }
      }
      return (await tryIt(call, a, answers)) ? 0 : 1;
    }
    case 'dev': {
      let a = await find(first);
      if (!a.folder || second) a = (await call<{ app: AppDef }>('POST', `/api/apps/${a.id}/folder`, second ? { path: path.resolve(second) } : {})).app;
      console.log(`“${a.name}” is in ${a.folder}. Each change you save there is tried on its examples here; Ctrl+C stops (the folder keeps in step).`);
      let seen = a.updatedAt;
      let mistake = '';
      for (;;) {
        await sleep(1000);
        const now = (await call<{ app: AppDef }>('GET', `/api/apps/${a.id}`)).app;
        const f = (await call<{ folder: { error?: string } | null }>('GET', `/api/apps/${a.id}/folder`)).folder;
        if ((f?.error ?? '') !== mistake) {
          mistake = f?.error ?? '';
          console.log(mistake ? `\n✗ The folder has a mistake, so nothing changed: ${mistake}` : '\nThe mistake is put right.');
        }
        if (now.updatedAt === seen) continue;
        seen = now.updatedAt;
        const [v] = (await call<{ versions: { n: number; by: string; line: string }[] }>('GET', `/api/apps/${a.id}/versions`)).versions;
        console.log(`\nVersion ${v?.n ?? '?'} (${v?.by === 'folder' ? 'its folder' : v?.by ?? ''}): ${v?.line ?? 'saved'}`);
        await tryIt(call, now);
      }
    }
    case 'export': {
      const a = await find(first);
      const file = path.resolve(second ?? `${a.slug}.hydor-app`);
      fs.writeFileSync(file, await raw(`/api/apps/${a.id}/export`));
      console.log(`Saved “${a.name}” as ${file}: import it on another computer (app import, or Install from a file on the Apps page).`);
      return 0;
    }
    case 'import': {
      if (!first) throw new Error('Say which file: app import reading-list.hydor-app');
      const sent = { name: path.basename(first), data: fs.readFileSync(path.resolve(first)).toString('base64') };
      const { preview: p } = await call<{ preview: InstallPreview }>('POST', '/api/apps/install/check', { file: sent });
      console.log(`“${p.name}”${p.description ? `: ${p.description}` : ''}`);
      const lines = [
        p.steps ? `${p.steps} steps` : 'One agent does its task',
        p.agents.length ? `Who works: ${p.agents.join(', ')}` : '',
        `Tools: ${p.tools === null ? 'all of the app’s own' : p.tools.join(', ') || 'none'}`,
        p.apps.length ? `Apps it calls: ${p.apps.join(', ')}` : '',
        p.data.length ? `What it keeps: ${p.data.map((d) => `${d.name}${d.records ? ` (${d.records} records)` : ''}`).join(', ')}` : '',
        p.needs.node.length || p.needs.python.length ? `It installs: ${[...p.needs.node, ...p.needs.python].join(', ')}` : '',
        p.needs.missing.length ? `Commands missing here: ${p.needs.missing.join(', ')}` : '',
        ...p.models.map((m) => `Model ${m.label}: ${m.status === 'here' ? 'here' : m.status === 'matched' ? 'here under another name' : `not here${m.use !== undefined ? `, so ${m.options.find((o) => o.value === m.use)?.label ?? 'the agent’s own'}` : ''}`}`),
        p.limits.capUsd ? `Most a run may spend: $${p.limits.capUsd}` : '',
        ...p.notes,
        ...p.warnings.map((w) => `Note: ${w}`),
      ].filter(Boolean);
      for (const l of lines) console.log(`  ${l}`);
      if (p.problems.length) {
        for (const x of p.problems) console.log(`✗ ${x}`);
        return 1;
      }
      if (!/^y(es)?$/i.test((await ask('Install it? [y/N] ')).trim())) return (console.log('Not installed.'), 1);
      const models = Object.fromEntries(p.models.filter((m) => m.use !== undefined).map((m) => [m.as, m.use]));
      const { app } = await call<{ app: AppDef }>('POST', '/api/apps/install', { file: sent, models });
      console.log(`Installed “${app.name}” (its address: ${app.slug}).`);
      return 0;
    }
    default:
      console.log(USAGE);
      return 1;
  }
}
