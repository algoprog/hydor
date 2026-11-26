// Every simple page and card of web apps with realistic data, for the scripts that read their words (plain-words-test.ts
// and the walk). The engines' own sentences are as technical as the real ones, so that any that leaks onto a page is
// caught. Not a test of its own.
import type { createElement } from 'react';
import type { ReactElement } from 'react';
import type { AppKey, CheckLine, LaunchJob, LaunchStep, TryItem, WebApp, WebAppOnlineHelp, WebAppStep, WebKind } from '@shared/webapps';
import { keyItems } from '../../../../../server/webapps/app-keys.ts';
import { KINDS } from '../../../../../server/webapps/ideas.ts';
import { LAUNCH_STEPS } from '../../../../../server/webapps/remote/types.ts';
import { readCatalog, needView, serviceView } from '../../../../../server/webapps/services.ts';
import { KeysCard } from '../../connections/KeysCard';
import { WebAppCard } from '../Card';
import { ChooseBody, ChooseFrame } from '../ChooseCard';
import { initialDraft } from '../chooseLogic';
import { MakeView } from '../MakeView';
import { Preview } from '../Preview';
import { ServicesCard } from '../ServicesCard';
import { WebSketchCard } from '../WebSketch';
import { DockView } from './DockView';
import { HomeView, type CheckedProps, type HomeProps, type Need } from './HomeView';
import { OnlineView, type OnlineActions, type OnlineData } from './OnlineView';
import { checkedLine, launchFailed, launchGroups, needsOf, problemsOf, stateOf, stripOf, type State } from './plain';
import { StripView } from './StripView';
import { BackupsView, ChecksView, DataView, KeysView, SubFrame, VersionsView } from './SubViews';
import { serverProblems, type ScreenId } from './onlinePath';

const none = () => {};
const NOW = Date.UTC(2026, 10, 26, 12);

export const SHAPE = { ok: true, signIn: 'own' as const, build: true, dev: false, services: { ai: true, embed: false, mail: true }, database: { file: 'plants.db', sqlite: true }, keys: 2 };
export const APP = {
  id: 'a1b2c3d4e5f60718',
  slug: 'plant-list',
  name: 'Plant list',
  folder: '/srv/WebApps/plant-list',
  stage: 'build',
  decisions: [],
  shape: SHAPE,
  settings: { tiers: [], dailyCapUsd: 1, apps: [], connections: [], notify: false },
  run: { state: 'stopped', pid: null, since: null, lastUse: null, restarts: 0, sandboxed: true, sandboxNote: null, lastExit: null },
  build: { state: 'built', exists: true, startedAt: NOW, endedAt: NOW, exitCode: 0, log: ['> npm run build', 'vite v6 building for production...'], box: { access: 'registry', registries: ['registry.npmjs.org'] } },
  mode: { launched: false, runsAs: 'built' },
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as WebApp;

export const BROKEN = { ...APP, shape: { ...SHAPE, ok: false, problem: 'hydor.json: "start" is missing.', problems: ['hydor.json: "start" is missing.', 'env.port must be a name like PORT.'] } } as WebApp;
export const FAILED = { ...APP, build: { ...APP.build, state: 'failed', problem: '“npm run build” ended with code 1.' } } as WebApp;
export const CRASHED = { ...APP, run: { ...APP.run, state: 'crashed', lastExit: 'it was killed (SIGTERM) after port 37243 closed' } } as WebApp;
const VIEW = { envs: [], hydor: { launched: null, previous: null, openable: false, ahead: null, unsaved: false, run: null } };
export const ONLINE_VIEW = { envs: [{ app: APP.id, env: 'production', host: 'my-server', name: 'plant-list', address: 'https://plants.example.com', commit: 'abc12345', at: NOW, keys: [], last: null }], hydor: VIEW.hydor };

const line = (id: string, state: CheckLine['state'], text: string, group = 'contract'): CheckLine => ({ id, state, text, group, title: id, hint: 'Handle SIGTERM in server.js and listen on HOST.' });
export const CHECK_LINES: CheckLine[] = [
  line('stop', 'failed', 'Told to stop (SIGTERM), it was still running after 10 s and had to be killed.'),
  line('phone-sideways', 'failed', '2 pages scroll sideways on a phone: /plants and /plants/new.', 'phone'),
  line('loopback', 'passed', 'Port 37243 was open on 127.0.0.1 only.'),
  line('secrets', 'passed', 'Looked at 7 answers for STRIPE_SECRET_KEY: none holds it.'),
];
const CHECKS = { ran: true, lines: CHECK_LINES };

export const KEYS: AppKey[] = [
  { name: 'STRIPE_SECRET_KEY', from: 'Stripe', why: 'To take payments for plant care visits.', givenBy: 'provider', needed: true, set: false },
  { name: 'ADMIN_PASSWORD', from: 'you', why: 'The first account’s password.', givenBy: 'you', needed: true, set: true, savedAt: NOW },
  { name: 'APP_SECRET', givenBy: 'made', needed: true, set: true },
];
export const TRY: TryItem[] = [
  { id: 't1', text: 'Add a plant and find it in the list', result: 'works', at: NOW },
  { id: 't2', text: 'Mark a plant as watered', result: 'wrong', note: 'The date did not change', at: NOW },
  { id: 't3', text: 'Add a second person and check they see only their own plants' },
];
export const STEPS: WebAppStep[] = [
  { sha: 'f1e2d3c4b5a6', message: 'Added how often each plant is watered', at: NOW - 60_000, files: 3 },
  { sha: 'a6b5c4d3e2f1', message: 'The list of plants works', at: NOW - 3_600_000, files: 5 },
];

const checked = (c: { ran: boolean; lines: CheckLine[] } | null, running = false, fixing = false): CheckedProps => ({ line: checkedLine(c as never, running), fixing, onFix: none, onAgain: none });
const needsFrom = (state: State, extra: Partial<Parameters<typeof needsOf>[0]> = {}): Need[] =>
  needsOf({ waiting: false, keys: KEYS.filter((k) => k.needed && !k.set), models: { usdPerDay: 1 }, mail: true, state, ...extra }).map((n) => ({ ...n, go: none }));

export function homeProps(app: WebApp, over: Partial<HomeProps> = {}, view: Parameters<typeof stateOf>[1] = VIEW): HomeProps {
  const state = stateOf(app, view, false);
  return {
    state,
    strip: stripOf({ stage: 'check', decisions: [], working: false, waiting: false, last: STEPS[0].message, online: false }),
    needs: needsFrom(state),
    actions: { online: !!view?.envs.length, undo: { message: STEPS[0].message, isUndo: false }, onChange: none, onOnline: none, onUndo: none },
    tryIt: { items: TRY, onWorks: none, onWrong: none, point: { on: false, picked: '', toggle: none } },
    checked: checked(CHECKS),
    preview: null,
    onOpen: none,
    ...over,
  };
}

export const KINDS_VIEW: WebKind[] = KINDS.map((k) => ({ id: k.id, name: k.name, who: k.who, needs: k.needs, ...(k.agent ? { agent: true } : {}) }));

export function onlineHelp(): WebAppOnlineHelp {
  const catalog = readCatalog();
  const offered = (need: string) => catalog.needs.find((n) => n.id === need)!.services;
  const view = (s: ReturnType<typeof offered>[number]) => {
    const v = serviceView(s, NOW);
    return { id: s.id, name: s.name, why: s.why, page: s.page, ...(v.paid ? { price: v.paid, read: s.paid?.read } : {}), ...(s.catch ? { catch: s.catch } : {}) };
  };
  return { providers: offered('run').filter((s) => s.id !== 'render').map((s) => ({ ...view(s), server: s.server })), registrars: offered('domain').map((s) => ({ ...view(s), record: s.record })) };
}

export const JOB: LaunchJob = {
  id: 'j1',
  app: APP.id,
  place: 'server',
  action: 'launch',
  env: 'production',
  host: 'my-server',
  address: 'https://plants.example.com',
  state: 'running',
  steps: LAUNCH_STEPS.map((s, i): LaunchStep => ({ id: s.id, title: s.title, state: i < 5 ? 'passed' : i === 5 ? 'running' : 'waiting', say: 'docker compose build: port 443, commit abc12345', details: ['Error: ENOENT /root/hydor-apps/plant-list/.env'] })),
  startedAt: NOW,
  endedAt: null,
};
export const FAILED_JOB: LaunchJob = { ...JOB, state: 'failed', previousBack: true, steps: JOB.steps.map((s) => (s.id === 'ready' ? { ...s, state: 'failed' } : s)) };

const ACT = new Proxy({}, { get: () => none }) as OnlineActions;
export function onlineData(over: Partial<OnlineData> = {}): OnlineData {
  const help = onlineHelp();
  return {
    appName: APP.name,
    providers: help.providers,
    registrars: help.registrars,
    provider: help.providers[0],
    registrar: help.registrars[0],
    fromPrice: help.providers[0].price,
    servers: [{ name: 'my-server', address: '203.0.113.7' }],
    line: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILP3hm hydor-server',
    code: 'SHA256:RD7ok1xSxEk4bmTP6pYZGwWNi4YRMrAdQTLHIfBEcrY',
    serverAddress: '203.0.113.7',
    serverProblems: serverProblems([{ what: 'docker', ok: false }, { what: 'port 443', ok: false }, { what: 'memory', ok: true }]),
    domain: 'plants.example.com',
    testAddress: 'https://plant-list.203-0-113-7.sslip.io',
    points: false,
    keys: ['To take payments for plant care visits.'],
    address: 'https://plants.example.com',
    groups: launchGroups(JOB.steps),
    stops: problemsOf(CHECK_LINES),
    failed: launchFailed(FAILED_JOB),
    here: false,
    ahead: true,
    canGoBack: true,
    ...over,
  };
}

export const ONLINE_SCREENS: ScreenId[] = ['blocked', 'choose', 'here', 'provider', 'create', 'paste', 'address', 'starting', 'unsafe', 'compare', 'mismatch', 'setup', 'web', 'registrar', 'domain', 'record', 'keys', 'ready', 'going', 'ask', 'failed', 'done'];

/** An app with nothing needing the person: all tried, all fine, built. */
export const SETTLED: Partial<HomeProps> = { needs: [], tryIt: { items: TRY.map((t) => ({ id: t.id, text: t.text, result: 'works' as const, at: NOW })), onWorks: none, onWrong: none }, checked: checked({ ran: true, lines: [] }) };

export function screens(h: typeof createElement): { name: string; el: ReactElement }[] {
  const out: { name: string; el: ReactElement }[] = [];
  const add = (name: string, el: ReactElement) => out.push({ name, el });
  add('start', h(MakeView, { kinds: KINDS_VIEW, onStart: none }));
  for (const stage of ['brief', 'design', 'build', 'check', 'launch', 'run'])
    for (const [working, waiting] of [[false, false], [true, false], [true, true]])
      add(`strip ${stage} ${working} ${waiting}`, h(StripView, { strip: stripOf({ stage, decisions: [], working, waiting, last: 'x', online: stage === 'run' }), cost: 0.42 }));
  add('dock', h(DockView, { strip: stripOf({ stage: 'check', decisions: [], working: false, waiting: false, online: false }), line: checkedLine(CHECKS as never, false), fixing: false, onFix: none, tried: { done: 1, of: 3 }, onApp: none }));
  for (const [name, app] of [['ready', APP], ['broken', BROKEN], ['build failed', FAILED], ['crashed', CRASHED]] as const) add(`home ${name}`, h(HomeView, homeProps(app)));
  add('home online', h(HomeView, homeProps({ ...APP, mode: { ...APP.mode, servers: ['production'] } }, {}, ONLINE_VIEW)));
  add('home checking', h(HomeView, homeProps(APP, { checked: checked(null, true), needs: [] })));
  add('home fixing', h(HomeView, homeProps(APP, { checked: checked(CHECKS, false, true) })));
  add('home all fine', h(HomeView, homeProps(APP, { checked: checked({ ran: true, lines: [] }), needs: [] })));
  add('home settled', h(HomeView, homeProps(APP, SETTLED)));
  add('home wrong box', h(HomeView, homeProps(APP, { tryIt: { items: TRY, onWorks: none, onWrong: none, openId: 't3', point: { on: true, picked: 'The button “Add”', toggle: none } } })));

  const sub = (name: string, body: ReactElement) => add(`more: ${name}`, h(SubFrame, { title: 'What it keeps', line: 'To look at only.', onBack: none, children: body }));
  sub('data', h(DataView, { tables: [{ name: 'job_notes', rows: 12 }, { name: '_migrations', rows: 2 }], open: 'job_notes', page: { columns: [{ name: 'id' }, { name: 'created_at' }, { name: 'password_hash', hidden: true }], rows: [[1, '2026-11-26', 'x']], total: 12, offset: 0 }, onOpen: none, onPage: none }));
  sub('data empty', h(DataView, { tables: [], onOpen: none, onPage: none }));
  for (const where of ['none', 'here', 'server'] as const) sub(`backups ${where}`, h(BackupsView, { where, backups: [{ id: '20261126-030000-scheduled', label: 'scheduled', at: NOW, bytes: 4096, tables: { job_notes: 12 } }], onNow: none, onRestore: none }));
  sub('keys', h(KeysView, { keys: KEYS, onAdd: none, services: [{ need: 'payments', needName: 'Payments', name: 'Stripe' }], onService: none, models: { allowed: false, usdPerDay: 1, spentUsd: 0, allow: none }, mail: { on: false, choose: none }, work: { name: 'Trip planner', open: none } }));
  sub('keys none', h(KeysView, { keys: [], onAdd: none, services: [] }));
  sub('checks', h(ChecksView, { checked: checked(CHECKS), at: NOW, onAgain: none }));
  sub('versions', h(VersionsView, { steps: STEPS, onBack: none }));

  for (const screen of ONLINE_SCREENS) add(`online: ${screen}`, h(OnlineView, { screen, d: onlineData(), act: ACT }));
  add('online: done here', h(OnlineView, { screen: 'done', d: onlineData({ here: true }), act: ACT }));
  add('online: compare problem', h(OnlineView, { screen: 'compare', d: onlineData({ code: undefined, problem: 'Hydor could not reach it yet.' }), act: ACT }));
  add('online: own server', h(OnlineView, { screen: 'paste', d: onlineData({ provider: undefined }), act: ACT }));
  const pasted = onlineData({ textPath: true, block: '#cloud-config\nssh_keys:\n  ed25519_private: |\n    -----BEGIN OPENSSH PRIVATE KEY-----\n', waitingFor: '203.0.113.7' });
  for (const screen of ['create', 'address', 'starting', 'mismatch', 'setup', 'web'] as const) add(`online: with the text, ${screen}`, h(OnlineView, { screen, d: pasted, act: ACT }));
  for (const why of ['make', 'swap', 'again'] as const) add(`online: not made safe, ${why}`, h(OnlineView, { screen: 'unsafe', d: { ...pasted, unsafe: why }, act: ACT }));

  const choose = { id: 'c000000000000', app: APP.id, shape: 'one' as const, stage: 'brief' as const, title: 'Who can see the plants?', options: [{ id: 'a', title: 'Only you' }, { id: 'b', title: 'Everyone who signs in' }], other: true };
  add('question card', h(ChooseFrame, { c: choose, live: true, children: h(ChooseBody, { c: choose, d: initialDraft(choose), set: none, locked: false }) }));
  add('question left to the agent', h(ChooseFrame, { c: choose, live: false, children: h(ChooseBody, { c: choose, d: { pick: '', take: '', other: '', youDecide: true }, set: none, locked: true }) }));

  const items = keyItems(
    [
      { name: 'STRIPE_SECRET_KEY', from: 'Stripe', why: 'To take payments.', givenBy: 'provider', needed: true, set: false, label: 'Secret key', how: ['Open Developers, then API keys.', 'Copy the Secret key.'], url: 'https://dashboard.stripe.com/apikeys' },
      { name: 'ADMIN_PASSWORD', from: 'you', why: 'The first account’s password.', givenBy: 'you', needed: true, set: false },
    ],
    { inside: true },
  ).map((i) => ({ ...i, state: 'todo' as const, fields: i.fields.map((f) => ({ ...f })) }));
  add('keys card', h(KeysCard, { id: 'k1', initial: { id: 'k1', key: 'webapp:x', name: 'x', state: 'pending', items, inside: true, byName: true, app: { id: APP.id, name: APP.name, env: 'hydor' }, createdAt: NOW } }));
  const payments = readCatalog().needs.find((n) => n.id === 'payments')!;
  add('services card', h(ServicesCard, { id: 'sv_1', initial: { id: 'sv_1', app: { id: APP.id, name: APP.name }, need: needView(payments, NOW), createdAt: NOW } }));
  add('sketch card', h(WebSketchCard, { sessionKey: 's', answered: false, out: { sketch: { kind: 'web', name: 'Plant list', description: 'Keeps your plants and when to water them.', who: 'You', does: ['Add a plant'], keeps: [{ title: 'Plants', line: 'name, how often', who: 'Only you' }], runs: 'Here, for you' }, assumed: ['Only you use it'], questions: [{ ask: 'Reminders?', choices: ['No', 'By mail'] }], needs: [] } }));
  for (const [name, app] of [['card', APP], ['card broken', BROKEN], ['card online', { ...APP, mode: { ...APP.mode, servers: ['production'] } }]] as const) add(name, h(WebAppCard, { a: app as WebApp }));
  for (const [name, app] of [['preview broken', BROKEN], ['preview building', { ...APP, build: { ...APP.build, state: 'building' } }], ['preview not built', { ...APP, build: { ...APP.build, exists: false, state: 'none' } }]] as const) add(name, h(Preview, { app: app as WebApp, simple: true, onBuild: none }));
  return out;
}
