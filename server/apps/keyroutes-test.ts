// Script tests for what a program outside Hydor does with an app and its key (keyroutes.ts, keyrun.ts): start a run (a flow
// by name, for a person), read it in the one documented shape, list an app's runs, answer the question a run waits on, stop
// a run and follow one as it goes (server-sent events), with the limits and the refusals. Stand-ins for the session manager
// (agent steps) as in flow-test.ts; no agent and no model is started. Ports 4338 to 4339.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/keyroutes-test.ts
//   DATA_DIR=/tmp/hydor-test-keyroutes HYDOR_APPS_DIR=/tmp/hydor-test-keyroutes-apps node dist/dev/keyroutes-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { cleanRecipe, isActive } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import { signPerson, verifyPerson } from '../webapps/sign.ts';
import { PERSON_GRACE_SECONDS } from '../webapps/flows.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { registerFeatures } from '../features/registry.ts';
import type { Deps } from '../features/types.ts';
import { initPages } from '../pages/store.ts';
import { askOf } from './flow.ts';
import { apps } from './index.ts';
import { STREAM, useWebappLinks } from './keyroutes.ts';
import { saveResult, startRuns, waitFor } from './runs.ts';
import * as store from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const PORT = 4338;
const SECRET = 'the-web-apps-own-secret';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-keyroutes-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- stand-ins -------------------------------------------------------------------------------------------

/** The session manager: sessions start at once and work until a test ends their turn. */
class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  status = new Map<string, string>();
  replies = new Map<string, string[]>();
  interrupted: string[] = [];
  async create(o: any) {
    const key = `acp:fake-${this.made.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    this.made.push({ key, o });
    this.status.set(key, 'working');
    if (o.extra && Object.keys(o.extra).length) setSessionExtra(db, key, o.extra);
    return key;
  }
  setFlags() {}
  summary(key: string) {
    const st = this.status.get(key);
    return st ? ({ key, agent: 'acp', stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0 }, live: { status: st } } as any) : null;
  }
  async timeline(key: string) {
    const said = this.replies.get(key) ?? [];
    return { parser: { items: said.map((text, i) => ({ kind: 'assistant', id: `a${i}`, seq: i, text })) }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt(key: string) {
    this.interrupted.push(key);
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
  async deliverOrQueue() {}
  end(key: string, reply = 'All done.') {
    this.replies.set(key, [...(this.replies.get(key) ?? []), reply]);
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
}

initPages(db);
const sessions = new FakeSessions();
const server = Fastify();
await server.register(cookie);
server.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const deps = { app: server, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
registerFeatures([], deps);
startRuns(deps);
await server.listen({ port: PORT, host: '127.0.0.1' });

const app = (p: Record<string, unknown>) =>
  store.saveApp(db, {
    recipe: cleanRecipe({ name: 'Outside', agent: 'claude', fields: [{ id: 'topic', label: 'Topic', type: 'text', required: true }], answer: [], tools: null, limits: {}, ...p }),
  });

/** The app the most tests use: asks for a name, then an agent writes; another flow only asks yes or no. */
const outside = () =>
  app({
    name: 'Outside',
    answer: [{ id: 'brief', label: 'Brief', type: 'markdown', required: true }],
    flow: {
      steps: [
        { id: 'pick', title: 'Pick a name', do: 'ask', question: 'Which name for {{topic}}?', fields: [{ id: 'name', label: 'Name', type: 'text', required: true }] },
        { id: 'write', title: 'Write it', do: 'agent', instructions: 'Write about {{topic}} as {{pick.name}}', outputs: [{ id: 'brief', label: 'Brief', type: 'markdown', required: true }] },
      ],
    },
    flows: {
      confirm: { title: 'Confirm', inputs: [{ id: 'topic', label: 'Topic', type: 'text' }], steps: [{ id: 'ok', title: 'Keep it?', do: 'ask', question: 'Keep {{topic}}?' }], outputs: { kept: '{{ok.yes}}' } },
    },
  });

const call = async (method: string, url: string, key: string | null, body?: unknown) => {
  const r = await server.inject({ method: method as any, url, headers: key ? { authorization: `Bearer ${key}` } : {}, ...(body !== undefined ? { payload: body as any } : {}) });
  return { status: r.statusCode, json: r.body ? (JSON.parse(r.body) as any) : null };
};

/** Waits for a run to be stopped on its question (a flow's Ask a person step), then reads it. */
async function asks(slug: string, key: string, id: string, step: string) {
  for (let i = 0; i < 400 && askOf(store.getRun(db, id)!)?.step !== step; i++) await sleep(25);
  assert.equal(askOf(store.getRun(db, id)!)?.step, step, `it never asked at ${step}`);
  return (await call('GET', `/api/apps/${slug}/run/${id}`, key)).json;
}

/** An agent step's run, once its session is there; it hands in `result` and ends its turn. */
async function agentAnswers(parent: string, step: string, result: Record<string, unknown> | null, reply = 'Done.') {
  let child: store.RunRecord | undefined;
  for (let i = 0; i < 200 && !(child = store.listRuns(db, { parent }).find((r) => r.step === step && r.key)); i++) await sleep(25);
  assert.ok(child, `the step ${step} started its run`);
  if (result) saveResult(child.id, result);
  sessions.end(child.key!, reply);
  return child;
}

/** The server-sent events of a run, read as they come: each { event, data }. */
function follow(slug: string, key: string, id: string) {
  const events: { event: string; data: any }[] = [];
  let closed = false;
  let headers: http.IncomingHttpHeaders = {};
  let status = 0;
  const req = http.get({ host: '127.0.0.1', port: PORT, path: `/api/apps/${slug}/run/${id}/events`, headers: { authorization: `Bearer ${key}` } }, (res) => {
    status = res.statusCode ?? 0;
    headers = res.headers;
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (c: string) => {
      buf += c;
      let at: number;
      while ((at = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, at);
        buf = buf.slice(at + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (event && data) events.push({ event, data: JSON.parse(data) });
      }
    });
    res.on('end', () => (closed = true));
    res.on('close', () => (closed = true));
  });
  return {
    events,
    get closed() {
      return closed;
    },
    get status() {
      return status;
    },
    get headers() {
      return headers;
    },
    async until(what: string, ok: () => boolean, ms = 8000) {
      const t = Date.now();
      while (!ok()) {
        if (Date.now() - t > ms) throw new Error(`Waited ${ms} ms for ${what}; the events so far: ${events.map((e) => e.event).join(', ')}`);
        await sleep(20);
      }
    },
    stop: () => req.destroy(),
  };
}

// ---- the tests -------------------------------------------------------------------------------------------

test('a run is read in one shape: its status in a program’s words, its steps with titles and states, the question it waits on, then its result, cost and times', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const started = await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'tides' } });
  assert.equal(started.status, 200);
  const run = started.json;
  assert.equal(run.id, run.run);
  assert.equal(run.flow, 'run');
  assert.ok(['waiting', 'working', 'needs-you'].includes(run.state), run.state);
  assert.ok(['queued', 'starting', 'running', 'waiting'].includes(run.status), `${run.status}: Hydor's own word`);
  assert.equal(run.person, undefined);
  assert.deepEqual(run.inputs, { topic: 'tides' });
  assert.equal(typeof run.createdAt, 'number');
  assert.equal(run.result, null);
  assert.equal(run.reply, null);
  const q = await asks(a.slug, key, run.id, 'pick');
  assert.equal(q.state, 'needs-you');
  assert.equal(q.status, 'waiting', 'status is Hydor’s own word, as it always was');
  assert.deepEqual(q.question, { step: 'pick', title: 'Which name for tides?', kind: 'form', fields: [{ id: 'name', label: 'Name', type: 'text', required: true }], since: q.question.since });
  assert.deepEqual(q.steps.map((s: any) => [s.step, s.title, s.status]), [['pick', 'Pick a name', 'working']]);
  // The question is answered as on the run's own page: its form is checked.
  const bad = await call('POST', `/api/apps/${a.slug}/run/${run.id}/answer`, key, { values: {} });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /Check the answer: .*Name/);
  assert.equal((await call('POST', `/api/apps/${a.slug}/run/${run.id}/answer`, key, { step: 'elsewhere', values: { name: 'x' } })).status, 409);
  const answered = await call('POST', `/api/apps/${a.slug}/run/${run.id}/answer`, key, { values: { name: 'Tide tables' } });
  assert.equal(answered.status, 200);
  assert.notEqual(answered.json.question?.step, 'pick', 'what comes back is no longer stopped on the same question');
  const child = await agentAnswers(run.id, 'write', { brief: 'Tides are caused by the Moon.' }, 'Wrote it.');
  assert.match(sessions.made.find((m) => m.key === child.key)!.o.prompt, /as Tide tables/);
  const done = (await call('GET', `/api/apps/${a.slug}/run/${run.id}?wait=20`, key)).json;
  assert.equal(done.status, 'done');
  assert.equal(done.state, 'done');
  assert.deepEqual(done.result, { brief: 'Tides are caused by the Moon.' });
  assert.equal(done.reply, 'Wrote it.');
  assert.deepEqual(done.steps.map((s: any) => [s.step, s.title, s.status]), [['pick', 'Pick a name', 'done'], ['write', 'Write it', 'done']]);
  assert.equal(done.question, undefined);
  assert.equal(typeof done.startedAt, 'number');
  assert.equal(typeof done.endedAt, 'number');
  assert.equal(done.error, undefined);
});

test('Hydor’s own status words are told in the kit’s as state, and a failed run says why in a sentence', () => {
  return import('./keyrun.ts').then(({ KEY_STATUS, keyRun }) => {
    assert.deepEqual(keyRun(store.insertRun(db, { app: app({ name: 'S', prompt: 'x', answer: [{ id: 'a', label: 'A', type: 'text' }] }).id, appName: 'S', recipe: cleanRecipe({ name: 'S', prompt: 'x', answer: [{ id: 'a', label: 'A', type: 'text' }] }), source: 'api', inputs: {}, status: 'running' }), (k) => k).status, 'running');
    assert.deepEqual(KEY_STATUS, { queued: 'waiting', starting: 'waiting', running: 'working', waiting: 'needs-you', done: 'done', failed: 'failed', stopped: 'stopped' });
    const a = app({ name: 'Plain', prompt: 'Do {{topic}}', answer: [{ id: 'a', label: 'A', type: 'text' }] });
    const r = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'api', inputs: { topic: 'x' }, status: 'failed' });
    assert.equal(keyRun(r, (k) => k).error, 'The run failed, and Hydor did not say why.');
    store.updateRun(db, r.id, { error: 'The weather service did not answer.', costUsd: 0.12 });
    const now = keyRun(store.getRun(db, r.id)!, (k) => k);
    assert.equal(now.error, 'The weather service did not answer.');
    assert.equal(now.costUsd, 0.12);
    assert.equal(now.steps, undefined, 'an app without steps has none');
  });
});

test('another of its flows starts by name, with its own inputs; a flow it does not have is refused saying which it has', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const none = await call('POST', `/api/apps/${a.slug}/run`, key, { flow: 'nope', inputs: { topic: 'x' } });
  assert.equal(none.status, 400);
  assert.match(none.json.error, /no flow “nope” \(it has confirm\)/);
  assert.equal((await call('POST', `/api/apps/${a.slug}/run`, key, { flow: 7, inputs: {} })).status, 400);
  const r = await call('POST', `/api/apps/${a.slug}/run`, key, { flow: 'confirm', inputs: { topic: 'tides' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.flow, 'confirm');
  const q = await asks(a.slug, key, r.json.id, 'ok');
  assert.deepEqual([q.question.kind, q.question.title, q.question.fields], ['yesno', 'Keep tides?', undefined]);
  assert.equal((await call('POST', `/api/apps/${a.slug}/run/${r.json.id}/answer`, key, { values: {} })).status, 400, 'a yes or no is answered with yes');
  assert.equal((await call('POST', `/api/apps/${a.slug}/run/${r.json.id}/answer`, key, { yes: true })).status, 200);
  const done = (await call('GET', `/api/apps/${a.slug}/run/${r.json.id}?wait=20`, key)).json;
  assert.equal(done.status, 'done');
  assert.equal(done.flow, 'confirm');
  assert.equal(String(done.result?.kept), 'true');
  // The run's own page shows which flow it ran.
  assert.equal(store.getRun(db, r.json.id)!.flow, 'confirm');
});

test('who a run acts for is proven, not claimed: the signed x-hydor-person header as the web app got it, checked with that web app’s secret; a bare person is refused; no token, nobody', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Plain key');
  const ada = { id: 'u-1', name: 'Ada', role: 'admin' as const, email: 'ada@example.com' };
  const token = signPerson(ada, SECRET);
  // Not a flows half: a token has nobody to prove it.
  const refused = await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' }, personToken: token });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /flows half of a web app/);
  assert.equal(store.listRuns(db, { app: a.id }).length, 0, 'nothing started');
  // Linked: its web app's own key, with a token that is good.
  const web = store.createKey(db, a.id, 'Web app');
  const links = {
    of: (x: any, k: string | undefined) =>
      x.id === a.id
        ? {
            viaKey: k === web.id,
            dailyCapUsd: 1000,
            person: (t: string) => {
              const c = verifyPerson(t, SECRET, PERSON_GRACE_SECONDS);
              return c.ok ? { person: c.person } : { problem: `not good: ${c.why}` };
            },
          }
        : null,
    signedIn: () => null,
  };
  useWebappLinks(links);
  try {
    // A person that is only said is refused with a sentence that says what to send, whatever the key.
    for (const claimed of [{ id: 'u-1', name: 'Ada', role: 'owner' }, 'Ada', { id: 'boss' }]) {
      const r = await call('POST', `/api/apps/${a.slug}/run`, web.key, { inputs: { topic: 'x' }, person: claimed });
      assert.equal(r.status, 400, JSON.stringify(claimed));
      assert.match(r.json.error, /cannot be claimed: send personToken/);
    }
    assert.equal(store.listRuns(db, { app: a.id }).length, 0, 'nothing started');
    // Another key of the same app is not the web app's.
    const other = await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' }, personToken: token });
    assert.equal(other.status, 403);
    assert.match(other.json.error, /web app’s own key/);
    assert.equal((await call('POST', `/api/apps/${a.slug}/run`, web.key, { inputs: { topic: 'x' }, personToken: 7 })).status, 400);
    // A good token: the person is the one the token names.
    const ok = await call('POST', `/api/apps/${a.slug}/run`, web.key, { inputs: { topic: 'tides' }, personToken: token });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.deepEqual(ok.json.person, ada);
    // A tampered one (the person changed, the signature kept), one signed with another app's secret, a mangled one.
    const [payload, sig] = token.split('.');
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const forged = `${Buffer.from(JSON.stringify({ ...body, role: 'owner' })).toString('base64url')}.${sig}`;
    for (const [what, bad, why] of [
      ['tampered', forged, 'signature'],
      ['another app’s secret', signPerson(ada, 'another-apps-secret'), 'signature'],
      ['mangled', 'not-a-token', 'malformed'],
      ['no signature', payload, 'malformed'],
      ['signature cut', `${payload}.${sig.slice(0, 10)}`, 'signature'],
      ['expired', signPerson(ada, SECRET, -(PERSON_GRACE_SECONDS + 60)), 'expired'],
    ] as const) {
      const r = await call('POST', `/api/apps/${a.slug}/run`, web.key, { inputs: { topic: 'x' }, personToken: bad });
      assert.equal(r.status, 403, `${what}: ${JSON.stringify(r.json)}`);
      assert.equal(r.json.error, `not good: ${why}`, what);
    }
    // One that ran out a moment ago is still good: the web app forwards the header a moment after it got it.
    const late = await call('POST', `/api/apps/${a.slug}/run`, web.key, { inputs: { topic: 'late' }, personToken: signPerson({ id: 'u-9', name: 'Late', role: 'member' }, SECRET, -60) });
    assert.equal(late.status, 200);
    assert.equal(late.json.person.id, 'u-9');
    // No token (empty counts as none): a job of the web app, nobody at the screen. It acts for nobody and is recorded so.
    const job = (await call('POST', `/api/apps/${a.slug}/run`, web.key, { inputs: { topic: 'job' } })).json;
    assert.equal(job.person, null);
    assert.equal(store.getRun(db, job.id)!.person, null);
    assert.ok('person' in JSON.parse(JSON.stringify(job)), 'it says so: person is null, not left out');
    // A run not started by the web app's key says nothing of a person.
    const hand = await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' } });
    assert.equal('person' in hand.json, false);
    // Kept on the run, shown on its page, and a person's runs found by their id.
    assert.deepEqual(store.getRun(db, ok.json.id)!.person, ada);
    const page = (await server.inject({ method: 'GET', url: `/api/apps/runs/${ok.json.id}` })).json();
    assert.equal(page.run.person.name, 'Ada');
    const mine = await call('GET', `/api/apps/${a.slug}/run?person=u-1`, web.key);
    assert.deepEqual(mine.json.runs.map((r: any) => r.id), [ok.json.id]);
    assert.equal((await call('GET', `/api/apps/${a.slug}/run?person=nobody`, web.key)).json.runs.length, 0);
    const all = (await call('GET', `/api/apps/${a.slug}/run`, web.key)).json.runs;
    assert.equal(all.length, 4);
    assert.ok(all.some((r: any) => r.person === null), 'the job is listed as acting for nobody');
    // A signed-in person (no key) may send a token too, for the same app.
    const signedIn = await call('POST', `/api/apps/${a.slug}/run`, null, { inputs: { topic: 'x' }, personToken: signPerson({ id: 'u-3', name: 'Cy', role: 'member' }, SECRET) });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.json.person.id, 'u-3');
  } finally {
    useWebappLinks(null);
  }
});

test('listing: the runs started by a key, newest first, a limit and before, in brief; nothing of other apps or of runs started on Hydor’s own pages', async () => {
  const a = outside();
  const b = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const ids: string[] = [];
  for (const topic of ['one', 'two', 'three']) {
    ids.push((await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic } })).json.id);
    await sleep(5);
  }
  store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'web', inputs: { topic: 'from the page' }, status: 'done' });
  store.insertRun(db, { app: b.id, appName: b.name, recipe: b, source: 'api', inputs: { topic: 'other app' }, status: 'done' });
  const all = (await call('GET', `/api/apps/${a.slug}/run`, key)).json.runs;
  assert.deepEqual(all.map((r: any) => r.id), [...ids].reverse());
  assert.equal(all[0].inputs, undefined, 'brief: no inputs');
  assert.equal(all[0].steps, undefined);
  assert.equal(all[0].result, null);
  assert.equal(['needs-you', 'working', 'waiting'].includes(all[0].state), true);
  assert.equal(['queued', 'starting', 'running', 'waiting'].includes(all[0].status), true);
  assert.deepEqual((await call('GET', `/api/apps/${a.slug}/run?limit=2`, key)).json.runs.map((r: any) => r.id), [ids[2], ids[1]]);
  const older = (await call('GET', `/api/apps/${a.slug}/run?before=${all[1].createdAt}`, key)).json.runs;
  assert.deepEqual(older.map((r: any) => r.id), [ids[0]]);
  for (const bad of ['limit=0', 'limit=101', 'limit=x', 'before=x']) assert.equal((await call('GET', `/api/apps/${a.slug}/run?${bad}`, key)).status, 400, bad);
  for (const id of ids) await call('POST', `/api/apps/${a.slug}/run/${id}/stop`, key);
});

test('the app’s flows described by key: each one’s name, its form (questions, kinds, choices, which are required) and its answer’s fields, so a web app’s pages need not repeat them', async () => {
  const a = app({
    name: 'Trip desk',
    description: 'Plans trips.',
    fields: [
      { id: 'place', label: 'Where to?', type: 'text', required: true, help: 'A city.', placeholder: 'Lisbon' },
      { id: 'style', label: 'Style', type: 'choice', options: ['relaxed', 'packed'], default: 'relaxed' },
      { id: 'days', label: 'Days', type: 'number' },
      { id: 'note', label: 'Anything else?', type: 'long' },
      { id: 'doc', label: 'A file', type: 'file' },
    ],
    prompt: 'Plan {{place}}',
    answer: [
      { id: 'plan', label: 'Plan', type: 'markdown', required: true, description: 'The plan.' },
      { id: 'stops', label: 'Stops', type: 'table', columns: [{ id: 'name', label: 'Name', type: 'text' }, { id: 'cost', label: 'Cost', type: 'number' }] },
      { id: 'budget', label: 'Budget', type: 'number' },
    ],
    flows: {
      cost: { title: 'Cost it', inputs: [{ id: 'plan', label: 'The plan', type: 'long', required: true }], steps: [{ id: 'c', do: 'agent', instructions: 'Cost {{plan}}', outputs: [{ id: 'budget', label: 'Budget', type: 'number' }] }], outputs: { budget: '{{c.budget}}' } },
      all: { inputs: [], steps: [{ id: 'd', do: 'agent', instructions: 'Do', outputs: [{ id: 'plan', label: 'Plan', type: 'markdown' }] }] },
    },
  });
  const { key } = store.createKey(db, a.id, 'Test');
  const r = await call('GET', `/api/apps/${a.slug}/flows`, key);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.app, { slug: a.slug, name: 'Trip desk', description: 'Plans trips.' });
  assert.deepEqual(r.json.flows.map((f: any) => [f.id, f.name]), [['run', 'Trip desk'], ['cost', 'Cost it'], ['all', 'all']]);
  const run = r.json.flows[0];
  assert.deepEqual(run.form[0], { id: 'place', label: 'Where to?', type: 'text', required: true, help: 'A city.', placeholder: 'Lisbon' });
  assert.deepEqual(run.form[1], { id: 'style', label: 'Style', type: 'choice', options: ['relaxed', 'packed'], default: 'relaxed' });
  assert.deepEqual(run.form.map((f: any) => [f.id, f.type, !!f.required]), [['place', 'text', true], ['style', 'choice', false], ['days', 'number', false], ['note', 'long', false], ['doc', 'file', false]]);
  assert.deepEqual(run.answer[0], { id: 'plan', label: 'Plan', type: 'markdown', required: true, description: 'The plan.' });
  assert.deepEqual(run.answer[1].columns, [{ id: 'name', label: 'Name', type: 'text' }, { id: 'cost', label: 'Cost', type: 'number' }]);
  // Another flow: its own form, and the answer fields its outputs name; with no outputs named, all of the app's.
  assert.deepEqual(r.json.flows[1].form.map((f: any) => [f.id, f.required]), [['plan', true]]);
  assert.deepEqual(r.json.flows[1].answer.map((f: any) => f.id), ['budget']);
  assert.deepEqual(r.json.flows[2].answer.map((f: any) => f.id), ['plan', 'stops', 'budget']);
  // The form it describes is the one a run is checked against.
  assert.equal((await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { style: 'packed' } })).status, 400);
  assert.equal((await call('GET', `/api/apps/${a.slug}/flows`, null)).status, 200, 'the sign-in reads it too');
  // A key opens its own app only; an app that is not there is a 404.
  const other = outside();
  assert.equal((await call('GET', `/api/apps/${other.slug}/flows`, key)).status, 401);
  assert.equal((await call('GET', '/api/apps/nothing-here/flows', key)).status, 404);
  assert.equal((await call('GET', '/api/apps/nothing-here/flows', null)).status, 404);
  // It counts toward the key's thirty a minute, like every call.
  const { key: k2 } = store.createKey(db, a.id, 'Counting');
  for (let i = 0; i < 30; i++) assert.equal((await call('GET', `/api/apps/${a.slug}/flows`, k2)).status, 200);
  assert.equal((await call('GET', `/api/apps/${a.slug}/flows`, k2)).status, 429);
});

test('a run may carry a small reference of the caller’s own: returned with the run and in lists, and a list can be filtered by it', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const one = (await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' }, ref: 'trip-17' })).json;
  const two = (await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'y' }, ref: 'trip-18' })).json;
  const three = (await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'z' }, ref: 'trip-17' })).json;
  const none = (await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'w' } })).json;
  assert.equal(one.ref, 'trip-17');
  assert.equal(none.ref, undefined);
  assert.equal(store.getRun(db, one.id)!.ref, 'trip-17');
  assert.equal((await call('GET', `/api/apps/${a.slug}/run/${one.id}`, key)).json.ref, 'trip-17');
  const listed = (await call('GET', `/api/apps/${a.slug}/run`, key)).json.runs;
  assert.deepEqual(listed.map((r: any) => r.ref), [undefined, 'trip-17', 'trip-18', 'trip-17']);
  const filtered = (await call('GET', `/api/apps/${a.slug}/run?ref=trip-17`, key)).json.runs;
  assert.deepEqual(filtered.map((r: any) => r.id), [three.id, one.id]);
  assert.deepEqual((await call('GET', `/api/apps/${a.slug}/run?ref=trip-18`, key)).json.runs.map((r: any) => r.id), [two.id]);
  assert.deepEqual((await call('GET', `/api/apps/${a.slug}/run?ref=nope`, key)).json.runs, []);
  assert.deepEqual((await call('GET', `/api/apps/${a.slug}/run?ref=trip-17&limit=1`, key)).json.runs.map((r: any) => r.id), [three.id]);
  // Also at the top level beside the form's values, as `inputs` is; never confused with a form value.
  const top = (await call('POST', `/api/apps/${a.slug}/run`, key, { topic: 'v', ref: 'row-1' })).json;
  assert.equal(top.ref, 'row-1');
  assert.equal(top.inputs.topic, 'v');
  // A reference is a short line of text.
  for (const bad of [7, { a: 1 }, 'x'.repeat(121), 'two\nlines']) {
    const r = await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' }, ref: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.match(r.json.error, /ref is a short text of your own \(at most 120 characters, on one line\)/);
  }
  assert.equal((await call('GET', `/api/apps/${a.slug}/run?ref=${'x'.repeat(121)}`, key)).status, 400);
  assert.equal((await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' }, ref: '' })).json.ref, undefined, 'empty is none');
  for (const id of [one.id, two.id, three.id, none.id, top.id]) await call('POST', `/api/apps/${a.slug}/run/${id}/stop`, key);
});

test('stopping: a run that has not ended stops and says so; one that has ended, or was not started with a key, is not stopped', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const r = (await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' } })).json;
  await asks(a.slug, key, r.id, 'pick');
  const stopped = await call('POST', `/api/apps/${a.slug}/run/${r.id}/stop`, key);
  assert.equal(stopped.status, 200);
  assert.equal(stopped.json.status, 'stopped');
  assert.equal(stopped.json.question, undefined);
  const again = await call('POST', `/api/apps/${a.slug}/run/${r.id}/stop`, key);
  assert.equal(again.status, 409);
  assert.match(again.json.error, /ended already/);
  assert.equal((await call('POST', `/api/apps/${a.slug}/run/${r.id}/answer`, key, { values: { name: 'x' } })).status, 409, 'nothing waits for an answer once it has stopped');
  const page = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'web', inputs: { topic: 'x' }, status: 'running' });
  const refused = await call('POST', `/api/apps/${a.slug}/run/${page.id}/stop`, key);
  assert.equal(refused.status, 403);
  assert.match(refused.json.error, /not started with a key/);
  assert.equal((await call('POST', `/api/apps/${a.slug}/run/${page.id}/answer`, key, { yes: true })).status, 403);
  assert.equal(store.getRun(db, page.id)!.status, 'running');
  // It may be read all the same.
  assert.equal((await call('GET', `/api/apps/${a.slug}/run/${page.id}`, key)).json.state, 'working');
  assert.equal((await call('GET', `/api/apps/${a.slug}/run/${page.id}`, key)).json.status, 'running');
});

test('an app that is not there and a run that is not there are told apart, and a key opens its own app only', async () => {
  const a = outside();
  const b = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const noApp = await call('GET', '/api/apps/no-such-app/run/abc', key);
  assert.equal(noApp.status, 404);
  assert.match(noApp.json.error, /no app with that address/);
  const noRun = await call('GET', `/api/apps/${a.slug}/run/abc`, key);
  assert.equal(noRun.status, 404);
  assert.match(noRun.json.error, new RegExp(`“${a.slug}” has no run abc`));
  const mine = (await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' } })).json;
  assert.equal((await call('GET', `/api/apps/${b.slug}/run/${mine.id}`, key)).status, 401, 'the key of another app');
  assert.equal((await call('GET', `/api/apps/${b.slug}/run`, key)).status, 401);
  const wrong = await call('GET', `/api/apps/${a.slug}/run/${mine.id}`, 'napp_not-a-key');
  assert.equal(wrong.status, 401);
  assert.match(wrong.json.error, /not valid/);
  // A run of the app is one of its own only: another app's run is not found there.
  const b2 = store.createKey(db, b.id, 'Other');
  assert.equal((await call('GET', `/api/apps/${b.slug}/run/${mine.id}`, b2.key)).status, 404);
  assert.equal((await call('POST', `/api/apps/${b.slug}/run/${mine.id}/stop`, b2.key)).status, 404);
  assert.equal((await call('GET', `/api/apps/${a.slug}/run/${mine.id}/events`, 'napp_not-a-key')).status, 401);
  await call('POST', `/api/apps/${a.slug}/run/${mine.id}/stop`, key);
});

test('what `wait` does: 0 (the default) answers at once with the run as it is; more waits for it to end, at most 900 seconds, and a run still going after the wait comes back as it is', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const t0 = Date.now();
  const at_once = await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' } });
  assert.ok(Date.now() - t0 < 3000);
  assert.ok(isActive(at_once.json.status));
  const t1 = Date.now();
  const waited = await call('GET', `/api/apps/${a.slug}/run/${at_once.json.id}?wait=1`, key);
  assert.ok(Date.now() - t1 >= 900, 'it waited about the second asked for');
  assert.equal(waited.json.state, 'needs-you', 'still going: as it is');
  assert.equal(waited.json.status, 'waiting');
  // The start can wait, too: the run is stopped while it waits, and comes back ended.
  const waitingStart = call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'y' }, wait: 30 });
  await sleep(300);
  const second = store.listRuns(db, { app: a.id, limit: 1 })[0];
  await call('POST', `/api/apps/${a.slug}/run/${second.id}/stop`, key);
  assert.equal((await waitingStart).json.status, 'stopped');
  await call('POST', `/api/apps/${a.slug}/run/${at_once.json.id}/stop`, key);
});

test('following a run: its whole shape first, each step as it changes, the question when it needs a person, then the end, and the stream closes', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const r = (await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'tides' } })).json;
  const f = follow(a.slug, key, r.id);
  await f.until('the first event', () => f.events.length > 0);
  assert.equal(f.status, 200);
  assert.match(String(f.headers['content-type']), /^text\/event-stream/);
  assert.equal(f.events[0].event, 'run');
  assert.equal(f.events[0].data.id, r.id);
  await f.until('the question', () => f.events.some((e) => e.event === 'status' && e.data.state === 'needs-you' && e.data.status === 'waiting' && e.data.question?.step === 'pick') || f.events.some((e) => e.event === 'run' && e.data.question));
  // Answer it; the next step starts, then ends with the agent's.
  await call('POST', `/api/apps/${a.slug}/run/${r.id}/answer`, key, { values: { name: 'Tide tables' } });
  await agentAnswers(r.id, 'write', { brief: 'Done.' }, 'Wrote it.');
  await f.until('the end', () => f.events.some((e) => e.event === 'end') && f.closed);
  const names = f.events.map((e) => e.event);
  assert.equal(names.at(-1), 'end');
  assert.equal(names.filter((n) => n === 'end').length, 1);
  const steps = f.events.filter((e) => e.event === 'step').map((e) => `${e.data.step.step}:${e.data.step.status}`);
  assert.ok(steps.includes('pick:done') && steps.includes('write:working') && steps.at(-1) === 'write:done', steps.join(' '));
  const stepEvents = f.events.filter((e) => e.event === 'step').map((e) => JSON.stringify(e.data.step));
  assert.deepEqual(stepEvents, stepEvents.filter((t, i) => t !== stepEvents[i - 1]), 'a step is told only when it changes');
  const firstSteps = (f.events[0].data.steps ?? []).map((x: any) => JSON.stringify(x));
  assert.ok(!stepEvents.some((t) => firstSteps.includes(t)), 'a step as the first event showed it is not told again as it was');
  const end = f.events.at(-1)!.data;
  assert.equal(end.status, 'done');
  assert.equal(end.state, 'done');
  assert.deepEqual(end.result, { brief: 'Done.' });
  assert.deepEqual(end.steps.map((s: any) => s.status), ['done', 'done']);
  // The statuses it went through, once each.
  const statuses = f.events.filter((e) => e.event === 'status').map((e) => e.data.state);
  assert.deepEqual(statuses.filter((s, i) => s !== statuses[i - 1]), statuses, 'no status twice in a row');
  assert.ok(statuses.includes('working') || statuses.includes('needs-you'));
});

test('following a run that has ended gives it and the end at once and closes; a stream is closed after its longest time, kept alive meanwhile, and a key may follow only so many', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  const ended = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'api', inputs: { topic: 'x' }, status: 'done' });
  const f = follow(a.slug, key, ended.id);
  await f.until('closed', () => f.closed);
  assert.deepEqual(f.events.map((e) => e.event), ['run', 'end']);
  // A run that never ends in the test: long streams are cut, with a word to come back.
  const going = (await call('POST', `/api/apps/${a.slug}/run`, key, { inputs: { topic: 'x' } })).json;
  const was = { ...STREAM };
  STREAM.maxMs = 400;
  STREAM.pingMs = 100;
  try {
    const raw: string[] = [];
    const long = http.get({ host: '127.0.0.1', port: PORT, path: `/api/apps/${a.slug}/run/${going.id}/events`, headers: { authorization: `Bearer ${key}` } }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (c: string) => raw.push(c));
    });
    await sleep(900);
    long.destroy();
    const text = raw.join('');
    assert.match(text, /: keep-alive/);
    assert.match(text, /event: timeout\ndata: \{"reconnect":true\}/);
    // Streams one key keeps open at once.
    STREAM.maxMs = 30_000;
    STREAM.perKey = 2;
    const open = [follow(a.slug, key, going.id), follow(a.slug, key, going.id)];
    await open[1].until('two streams', () => open.every((o) => o.events.length > 0));
    const third = await call('GET', `/api/apps/${a.slug}/run/${going.id}/events`, key);
    assert.equal(third.status, 429);
    open.forEach((o) => o.stop());
    await sleep(100);
  } finally {
    Object.assign(STREAM, was);
  }
  await call('POST', `/api/apps/${a.slug}/run/${going.id}/stop`, key);
});

test('the limits of a key hold for all of them: thirty calls a minute whatever they are, the app’s runs a day for starting, and what a web app may spend a day', async () => {
  const a = outside();
  const { key } = store.createKey(db, a.id, 'Test');
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await call('GET', `/api/apps/${a.slug}/run`, key)).status;
  assert.equal(last, 429, 'the thirty-first call in a minute');
  // Another key has its own thirty.
  const b = app({ name: 'Limited', prompt: 'Do {{topic}}', answer: [{ id: 'a', label: 'A', type: 'text' }], limits: { runsPerDay: 2 } });
  const kb = store.createKey(db, b.id, 'Test');
  for (let i = 0; i < 2; i++) assert.equal((await call('POST', `/api/apps/${b.slug}/run`, kb.key, { inputs: { topic: 'x' } })).status, 200);
  const over = await call('POST', `/api/apps/${b.slug}/run`, kb.key, { inputs: { topic: 'x' } });
  assert.equal(over.status, 429);
  assert.match(over.json.error, /limit/);
  // Reading, listing, following and stopping a run still work past it: they start nothing.
  assert.equal((await call('GET', `/api/apps/${b.slug}/run`, kb.key)).status, 200);
  // A web app's own key: held to what the web app may spend in a day, counting what runs still going may spend at most.
  const c = app({ name: 'Spender', prompt: 'Do {{topic}}', answer: [{ id: 'a', label: 'A', type: 'text' }], limits: { capUsd: 0.5 } });
  const web = store.createKey(db, c.id, 'Web app');
  useWebappLinks({ of: (x, k) => (x.id === c.id ? { viaKey: k === web.id, dailyCapUsd: 0.8, person: () => ({ problem: 'no' }) } : null), signedIn: () => null });
  try {
    assert.equal((await call('POST', `/api/apps/${c.slug}/run`, web.key, { inputs: { topic: 'x' } })).status, 200, 'nothing spent or going yet');
    const second = await call('POST', `/api/apps/${c.slug}/run`, web.key, { inputs: { topic: 'x' } });
    assert.equal(second.status, 200, 'one going may spend 0.5 of 0.8');
    const third = await call('POST', `/api/apps/${c.slug}/run`, web.key, { inputs: { topic: 'x' } });
    assert.equal(third.status, 429, 'two going may spend 1.0');
    assert.match(third.json.error, /web app has spent what it may in a day/);
    // A key made by hand for the same app is not the web app's: the web app's cap is not its own.
    const hand = store.createKey(db, c.id, 'By hand');
    assert.equal((await call('POST', `/api/apps/${c.slug}/run`, hand.key, { inputs: { topic: 'x' } })).status, 200);
  } finally {
    useWebappLinks(null);
  }
});

test('the old routes of the page are as they were: its answer route takes the same answers, checks them and goes on', async () => {
  const a = outside();
  const page = (await server.inject({ method: 'POST', url: `/api/apps/${a.id}/runs`, payload: { inputs: { topic: 'x' } } })).json().run;
  let q: any;
  for (let i = 0; i < 200 && !q; i++) {
    q = (await server.inject({ method: 'GET', url: `/api/apps/runs/${page.id}` })).json().question;
    if (!q) await sleep(25);
  }
  assert.equal(q.step, 'pick');
  assert.equal((await server.inject({ method: 'POST', url: `/api/apps/runs/${page.id}/answer`, payload: { values: {} } })).statusCode, 400);
  assert.equal((await server.inject({ method: 'POST', url: `/api/apps/runs/${page.id}/answer`, payload: { values: { name: 'N' } } })).statusCode, 200);
  await agentAnswers(page.id, 'write', { brief: 'ok' });
  assert.equal((await waitFor(page.id, 20_000))!.status, 'done');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
await server.close();
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(process.env.HYDOR_APPS_DIR!, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
