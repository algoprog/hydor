// What the simple view of web apps works out, without drawing: which screen of putting it online a person is at and what
// going back forgets, the five steps of making an app, the four of a launch, and the addresses and names made on the way.
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/webapps/simple/plain-test.ts && DATA_DIR=<scratch> node dist/dev/plain-test.js
import '../test-dom.test';
import assert from 'node:assert/strict';
import type { LaunchStep, WebAppLaunchView } from '@shared/webapps';
import { back, cleanDomain, cleanServer, hostName, recordName, screenOf, stepAt, testAddress, type OnlineSaved } from './onlinePath';
import { homeOf, launchGroups, shortState, stripOf } from './plain';

let passed = 0;
const step = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

const view = (over: Partial<WebAppLaunchView> = {}): WebAppLaunchView => ({ places: [], hydor: { launched: null, previous: null, openable: false, ahead: null, unsaved: false, run: null }, envs: [], hosts: [], job: null, history: [], blocked: null, ...over });
const app = { shape: { ok: true } } as never;
const at = (saved: OnlineSaved, v = view(), missingKeys: number | null = 0) => screenOf({ app, view: v, missingKeys }, saved);
const host = (state: 'made' | 'recorded', ok?: boolean) => ({ name: 'my-server', ssh: 'root@203.0.113.7', address: '203.0.113.7', state, ...(ok === undefined ? {} : { checked: { at: 1, ok, looked: [] } }) });

step('one screen at a time, each only once the one before it is done', () => {
  assert.equal(at({}), 'choose');
  assert.equal(at({ where: 'here' }), 'here');
  assert.equal(at({ where: 'here' }, view(), 1), 'keys');
  const net: OnlineSaved = { where: 'internet' };
  assert.equal(at(net), 'provider');
  assert.equal(at({ ...net, provider: 'digitalocean' }), 'create');
  assert.equal(at({ ...net, provider: 'digitalocean', created: true }), 'paste');
  assert.equal(at({ ...net, provider: 'own' }), 'paste', 'a server of their own needs no creating');
  const typed: OnlineSaved = { ...net, provider: 'digitalocean', created: true, pasted: true };
  assert.equal(at(typed), 'address');
  const added: OnlineSaved = { ...typed, host: 'my-server' };
  assert.equal(at(added, view({ hosts: [host('made')] })), 'compare', 'the code is never skipped');
  assert.equal(at({ ...added, mismatch: true }, view({ hosts: [] })), 'mismatch');
  assert.equal(at(added, view({ hosts: [host('recorded')] })), 'setup');
  assert.equal(at(added, view({ hosts: [host('recorded', false)] })), 'setup');
  const ready = view({ hosts: [host('recorded', true)] });
  assert.equal(at(added, ready), 'web');
  assert.equal(at({ ...added, web: 'get' }, ready), 'registrar');
  assert.equal(at({ ...added, web: 'own' }, ready), 'domain');
  assert.equal(at({ ...added, web: 'own', domain: 'example.com' }, ready), 'record');
  const addressed: OnlineSaved = { ...added, web: 'own', domain: 'example.com', address: 'https://example.com' };
  assert.equal(at(addressed, ready, 1), 'keys');
  assert.equal(at(addressed, ready), 'ready');
});

step('a server created with Hydor’s text is pasted, then its address, then its web address: nothing is compared', () => {
  const net: OnlineSaved = { where: 'internet', provider: 'digitalocean', text: true };
  assert.equal(at(net), 'create');
  assert.equal(at({ ...net, created: true }), 'address', 'no key to paste after it');
  assert.equal(at({ ...net, created: true, starting: 'hydor@203.0.113.7' }), 'starting');
  assert.equal(at({ ...net, created: true, mismatch: true }), 'mismatch');
  assert.equal(at({ ...net, created: true, host: 'my-server' }, view({ hosts: [host('recorded', false)] })), 'setup', 'what is missing can still be put on it');
  assert.equal(at({ ...net, created: true, host: 'my-server' }, view({ hosts: [host('recorded', true)] })), 'web');
  assert.equal(back('starting', { ...net, created: true, starting: 'x' }).starting, undefined);
  assert.equal(back('address', { ...net, created: true }).created, undefined);
  assert.deepEqual(back('mismatch', { ...net, created: true, mismatch: true }), { ...net, created: true });
  assert.equal(at({ ...net, created: true, unsafe: { why: 'swap', address: 'x' } }), 'unsafe');
  assert.equal(back('unsafe', { ...net, created: true, unsafe: { why: 'swap', address: 'x' } }).unsafe, undefined);
  // The count shows once the choice it depends on is made.
  assert.deepEqual([stepAt('provider', 'text'), stepAt('provider', 'own'), stepAt('choose', 'text')], [null, null, null]);
  assert.deepEqual([stepAt('create', 'text'), stepAt('unsafe', 'text'), stepAt('web', 'text')], [{ n: 2, of: 6 }, { n: 3, of: 6 }, { n: 4, of: 6 }]);
  assert.deepEqual([stepAt('paste', 'own'), stepAt('web', 'own'), stepAt('web', 'rent')], [{ n: 2, of: 8 }, { n: 6, of: 8 }, { n: 7, of: 9 }]);
});

step('a launch is followed whatever was kept, and a finished one is shown once it is the one started here', () => {
  const job = (state: 'running' | 'asking' | 'done' | 'failed') => view({ job: { id: 'j1', state } as never });
  assert.equal(at({}, job('running')), 'going');
  assert.equal(at({}, job('asking')), 'ask');
  assert.equal(at({ job: 'j1' }, job('done')), 'done');
  assert.equal(at({ job: 'j1' }, job('failed')), 'failed');
  assert.equal(at({}, job('failed')), 'choose', 'an old failure is not shown again');
  assert.equal(at({}, view({ envs: [{ env: 'production' } as never] })), 'done');
  assert.equal(at({}, view({ blocked: 'x' })), 'blocked');
});

step('going back forgets only what the screen before asks', () => {
  const all: OnlineSaved = { where: 'internet', provider: 'digitalocean', created: true, pasted: true, host: 'my-server', web: 'own', domain: 'example.com', address: 'https://example.com' };
  const { domain: _gone, ...kept } = all;
  assert.deepEqual(back('record', all), kept);
  assert.equal(back('paste', { where: 'internet', provider: 'own', pasted: false }).provider, undefined);
  assert.equal(back('address', all).pasted, undefined);
  assert.equal(back('mismatch', { ...all, mismatch: true }).host, undefined);
  assert.equal(back('provider', all).where, undefined);
});

step('the addresses and names made on the way', () => {
  assert.equal(testAddress('plant-list', '203.0.113.7'), 'https://plant-list.203-0-113-7.sslip.io');
  assert.equal(testAddress('plant-list', 'vps.example.net'), 'https://vps.example.net');
  assert.deepEqual([recordName('example.com', '@'), recordName('shop.example.com', '@'), recordName('example.co.uk', ''), recordName('a.b.example.com', '@')], ['@', 'shop', '', 'a.b']);
  assert.deepEqual([cleanDomain(' https://Shop.Example.com/x '), cleanDomain('203.0.113.7'), cleanDomain('nodots')], ['shop.example.com', '', '']);
  assert.deepEqual([cleanServer('203.0.113.7', 'root'), cleanServer('deploy@203.0.113.7:2222', 'root'), cleanServer('not an address', 'root')], ['root@203.0.113.7', 'deploy@203.0.113.7:2222', '']);
  assert.equal(hostName(['my-server', 'my-server-2']), 'my-server-3');
});

step('the five steps of making it, and the four of putting it online', () => {
  const strip = (stage: string, o: Partial<Parameters<typeof stripOf>[0]> = {}) => stripOf({ stage, decisions: [], working: false, waiting: false, online: false, ...o });
  assert.deepEqual(['brief', 'design', 'build', 'check', 'launch'].map((s) => strip(s).at), [0, 1, 2, 3, 4]);
  assert.equal(strip('design', { decisions: [{ at: '', stage: 'design', what: 'x', shape: 'designs' }] }).at, 2);
  assert.equal(strip('build', { last: 'The list works' }).at, 3, 'built and the agent stopped: the person’s turn');
  assert.equal(strip('build', { working: true, doing: 'Making the list of customers' }).sentence, 'Making the list of customers');
  assert.equal(strip('build', { working: true, waiting: true }).sentence, 'Waiting for your answer');
  assert.equal(strip('run', { online: true }).done, true);
  const s = (id: string, state: LaunchStep['state']): LaunchStep => ({ id, title: id, state });
  assert.deepEqual(launchGroups([s('check', 'passed'), s('host', 'passed'), s('send', 'running'), s('build', 'waiting'), s('switch', 'waiting'), s('record', 'waiting')]).map((g) => `${g.title}:${g.state}`), ['Checking:passed', 'Sending:running', 'Building:waiting', 'Switching on:waiting']);
  assert.deepEqual(launchGroups([s('install', 'passed'), s('build', 'passed'), s('check', 'failed'), s('start', 'waiting')]).map((g) => `${g.title}:${g.state}`), ['Building:passed', 'Checking:failed', 'Switching on:waiting']);
});

step('an app on a server that does not answer is not said to be online', () => {
  const online = view({ envs: [{ env: 'production', address: 'https://shelves.example.org', at: 1 } as never] });
  const of = (down: boolean) => homeOf({ app: { shape: { ok: true } as never, build: { state: 'built', exists: true } as never, run: { state: 'stopped' } as never, mode: { launched: false, runsAs: 'built', servers: ['production'] }, stage: 'run', decisions: [] }, view: online, checks: null, checking: false, guide: null, steps: [], keys: [], session: { working: false, waiting: false }, fixAt: 0, now: 2, down }).state;
  assert.equal(of(false).text, 'Online at shelves.example.org');
  assert.deepEqual([of(true).tone, of(true).text], ['err', 'shelves.example.org is not answering right now.']);
});

step('an app that does not start while its agent still makes it is being made, not in need of fixing', () => {
  const of = (run: string, making: boolean, shape: object = { ok: true }) => shortState({ shape, build: { state: 'none', exists: true }, run: { state: run }, mode: { launched: false, runsAs: 'built' } } as never, making);
  assert.deepEqual(of('crashed', false), { tone: 'err', label: 'Needs fixing' });
  assert.deepEqual(of('crashed', true), { tone: 'busy', label: 'Being made' });
  assert.deepEqual(of('stopped', true, { ok: false, problem: 'hydor.json: "start" is missing' }), { tone: 'busy', label: 'Being made' });
  assert.deepEqual(of('running', true), { tone: 'idle', label: 'Ready to try' }, 'one that runs says so, whoever is at work');
});

console.log(`\n${passed} checks passed`);
