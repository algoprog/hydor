// The simple view of web apps (Technical details off) says nothing technical: every simple page and card is drawn with
// realistic data, whose engine sentences name files, commands, signals, variables and addresses as the real ones do, and
// the words a person would read or hear are searched for the banned list (shared/plain-words.ts). Also: every line of
// the checks has a plain sentence of its own, and the list catches what it should.
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/webapps/plain-words-test.ts && DATA_DIR=<scratch> node dist/dev/plain-words-test.js
import { wordsOf } from './test-dom.test';
import assert from 'node:assert/strict';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bannedIn, GLOSSARY, speakingNote } from '@shared/plain-words';
import { WEBAPP_STAGES } from '@shared/webapps';
import { LINE_IDS } from '../../../../server/webapps/pagechecks/lines.ts';
import { PLAIN_CARDS } from '../../../../server/webapps/plain-cards.ts';
import { weeklyNotice } from '@shared/weekly-words';
import { Preview } from './Preview';
import { QuietWork } from './simple/QuietWork';
import { plainAsk, showsRawWork } from './simple/plainAsk';
import { PlainAskView } from './simple/PlainAskView';
import { isWebConversation } from './simple/quiet';
import { APP, BROKEN, CHECK_LINES, CRASHED, FAILED, FAILED_JOB, homeProps, ONLINE_VIEW, screens, SETTLED } from './simple/screens.test';
import { HomeView } from './simple/HomeView';
import { checkProblem, fixAllMessage, launchFailedMessage, needsOf, plainPoint, stateOf, stillNeeded, stripOf } from './simple/plain';

let passed = 0;
const step = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

step('the list catches what the simple view must never say, and lets plain sentences through', () => {
  const never = [
    'Hydor does what its hydor.json says.',
    'Told to stop (SIGTERM), it ended.',
    'Port 37243 was open on 127.0.0.1 only.',
    'You open it at plants.localhost',
    'The port is taken.',
    'The committed version',
    'It is given nothing in the env.',
    'Run npm install',
    'Docker is installed.',
    'Give STRIPE_SECRET_KEY',
    'In /srv/ann/apps/plants',
    'Its file server.js',
    'phone-sideways',
    '~/.ssh/authorized_keys',
    'TypeError: x at main (index)',
    'Compare the fingerprint',
    'Add the SSH key',
  ];
  for (const s of never) assert.ok(bannedIn(s).length, `not caught: ${s}`);
  const plain = ['Checked: all fine', 'A key from Stripe, to take payments.', 'Online at plants.example.com', 'Under “Authentication”, open the “SSH Keys” tab.', 'Sign-in is read-only for now.', 'See https://docs.example.com/a/b for more.', 'Undo the last change', 'A server: $12 a month.'];
  for (const s of plain) assert.deepEqual(bannedIn(s), [], s);
  assert.ok(wordsOf('<div><span data-verbatim="true">ssh-ed25519 AAAA</span><button aria-label="Copy">x</button></div>') === 'Copy\nx');
});

step('what the agent is told of how to speak says the same words', () => {
  const simple = speakingNote(false);
  for (const [, plain] of GLOSSARY) assert.ok(simple.includes(plain), plain);
  assert.match(speakingNote(true), /Technical details on/);
});

const CONTRACT = ['file', 'build', 'ready', 'loopback', 'signin', 'ai', 'embed', 'mail', 'secrets', 'smoke', 'stop', 'data', 'writes'];
step('every line of the checks that can fail has a plain sentence of its own', () => {
  for (const id of [...CONTRACT, ...LINE_IDS.filter((x) => x !== 'slowest')]) {
    assert.notEqual(checkProblem(id), checkProblem('no-such-line'), `no sentence for ${id}`);
    assert.deepEqual(bannedIn(checkProblem(id)), [], id);
  }
});

const draw = (el: ReactElement) => wordsOf(renderToStaticMarkup(el));

step('every simple page and card, drawn with realistic data, says nothing of the list', () => {
  const all = screens(h);
  const bad: string[] = [];
  for (const s of all) {
    const words = draw(s.el);
    assert.ok(words.trim().length, `${s.name} drew nothing`);
    for (const hit of bannedIn(words)) bad.push(`${s.name}: ${hit.name}: “${hit.found}” in: ${words.split('\n').find((l) => l.includes(hit.found)) ?? ''}`);
  }
  assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
  console.log(`    ${all.length} pages and cards drawn`);
});

step('with nothing needing the person, the app’s page is under 70 words', () => {
  for (const view of [undefined, ONLINE_VIEW]) {
    const app = view ? { ...APP, mode: { ...APP.mode, servers: ['production'] }, stage: 'run' as const } : { ...APP, stage: 'check' as const };
    const words = draw(h(HomeView, homeProps(app, { ...SETTLED, strip: stripOf({ stage: app.stage, decisions: [], working: false, waiting: false, online: !!view }) }, view)));
    const n = words.split(/\s+/).filter(Boolean).length;
    console.log(`    ${view ? 'online' : 'ready to try'}: ${n} words`);
    assert.ok(n < 70, `${n}: ${words}`);
  }
});

step('the same app drawn with Technical details on is caught, so the drawing does reach what the list is about', () => {
  const words = draw(h(Preview, { app: BROKEN, onBuild: () => {} }));
  assert.ok(bannedIn(words).some((x) => x.name === 'hydor.json'), words);
});

step('what is said to the agent for the person, in their own conversation, is plain too', () => {
  const said = [fixAllMessage(CHECK_LINES), launchFailedMessage(FAILED_JOB), plainPoint({ kind: 'button', text: 'Add', path: '/customers/12?x=1' }), plainPoint({ kind: 'heading', text: '', path: '/' }), ...[BROKEN, FAILED, CRASHED].map((a) => stateOf(a, null, false).fix!)];
  for (const s of said) assert.deepEqual(bannedIn(s), [], s);
  assert.match(plainPoint({ kind: 'button', text: 'Add', path: '/customers/12?x=1' }), /on the customers page:$/);
});

step('a web app’s conversation keeps the work folded: one line, no tool, command or file', () => {
  const drawn = [{}, { live: true }, { live: true, empty: true }, { status: 'failed' }, { status: 'interrupted' }].map((p) => draw(h(QuietWork, { ...p, onShow: () => {} })));
  for (const words of drawn) assert.deepEqual(bannedIn(words), [], words);
  assert.equal(drawn[0].trim(), 'Show the work');
  assert.ok(isWebConversation({ extra: { webKind: {} } } as never) && !isWebConversation({ extra: {} } as never) && !isWebConversation({ extra: { webKind: {} }, subagentOf: 'x' } as never));
});

step('the cards for a server and for backups say what happens and what is lost in plain words', () => {
  const app = 'Food bank stock';
  const cards = [PLAIN_CARDS.addServer(), PLAIN_CARDS.acceptServer(''), PLAIN_CARDS.setUpServer(), PLAIN_CARDS.forgetServer(), PLAIN_CARDS.takeOff(app), PLAIN_CARDS.copyNow(app), PLAIN_CARDS.restoreCopy(app, '20261124-193012-manual'), PLAIN_CARDS.restoreCopy(app, 'x'), PLAIN_CARDS.copyTimes('03:30', 14), PLAIN_CARDS.copyTimes(undefined, undefined), PLAIN_CARDS.goBack(), PLAIN_CARDS.goBackData(), PLAIN_CARDS.alsoData(), PLAIN_CARDS.failedChecks(app, [...CONTRACT, 'no-such-line'])];
  for (const c of cards) assert.deepEqual(bannedIn(`${c.title}\n${c.detail}\n${c.label}`), [], c.title);
  assert.match(PLAIN_CARDS.restoreCopy(app, '20261124-193012-manual').detail, /made on 24 November at 19:30 \(UTC\).*lost/);
});

step('the weekly notice is one plain sentence, and the app’s page lists only what is still so', () => {
  const needs = [{ id: 'backup-production', say: 'There is no backup on the server (production) …', tab: 'run' as const, days: 3 }, { id: 'errors-production', say: 'The app wrote 20 errors …', tab: 'run' as const }];
  assert.equal(weeklyNotice('Food bank stock', needs.slice(0, 1)), 'Your app Food bank stock needs you: no backup for 3 days.');
  for (const n of [needs, [{ id: 'down-hydor', say: '', tab: 'run' as const }], [{ id: 'unknown-production', say: '', tab: 'run' as const }], [{ id: 'backup-hydor', say: '', tab: 'run' as const }]]) assert.deepEqual(bannedIn(weeklyNotice('Food bank stock', n)), []);
  const run = (ageHours: number) => ({ places: [{ place: 'production', kind: 'server' as const, up: true, say: '', lastBackup: { id: 'b', ageHours } }], weekly: { at: 1, needs, looked: [], next: null } });
  assert.deepEqual(stillNeeded(run(80) as never).map((n) => n.id), ['backup-production', 'errors-production']);
  assert.deepEqual(stillNeeded(run(1) as never).map((n) => n.id), ['errors-production'], 'a copy made since is enough');
  const listed = needsOf({ waiting: false, keys: [], state: { tone: 'ok', text: '', next: '' } as never, weekly: needs });
  assert.deepEqual(listed.map((n) => [n.title, n.button]), [['No backup for 3 days', 'Make a copy'], ['Things go wrong in it more often lately', 'Ask the agent']]);
  for (const n of listed) assert.deepEqual(bannedIn(`${n.title}\n${n.button}`), []);
});

step('a permission card asks in one plain sentence: the agent’s own when a person can read it, the command behind a button', () => {
  const card = (kind: 'command' | 'file' | 'tool' | 'permissions', more: object = {}) => ({ id: 'a', createdAt: 1, kind, title: 'Bash: npm install — needs network', detail: 'npm install --omit=dev', options: [{ id: 'allow', label: 'Allow', style: 'primary' as const }, { id: 'allow_always', label: 'Always allow Bash(npm install:*)' }, { id: 'acceptForSession', label: 'Allow for this session' }, { id: 'cancel', label: 'Deny and stop' }, { id: 'deny', label: 'Deny', style: 'danger' as const }], ...more });
  assert.equal(plainAsk(card('command', { say: 'install what the app needs' })).sentence, 'Install what the app needs');
  // Words of its own that are technical are not shown: what the agent meant stays behind the button.
  assert.match(plainAsk(card('command', { say: 'Run npm install in /srv/ann/app' })).sentence, /did not say what it is for/);
  assert.equal(plainAsk(card('tool', { title: 'mcp__hydor__webapp_launch' })).sentence, 'Put the app online');
  for (const kind of ['command', 'file', 'tool', 'permissions'] as const) {
    const ask = plainAsk(card(kind));
    // Until the thing itself is shown, only yes and no are offered: an answer that goes on counting says how far in technical words.
    const offered = card(kind).options.filter((o) => !ask.standing(o));
    assert.deepEqual(offered.map((o) => o.id), ['allow', 'cancel', 'deny']);
    const words = `${ask.sentence}\n${ask.show}\n${offered.map(ask.label).join('\n')}`;
    assert.deepEqual(bannedIn(words), [], words);
    const drawn = draw(h(PlainAskView, { ask, open: false, onToggle: () => {}, children: h('pre', null, card(kind).detail) }));
    assert.deepEqual(bannedIn(drawn), [], drawn);
    assert.ok(!drawn.includes('npm install'), 'the command is not drawn until asked for');
  }
  assert.equal(plainAsk(card('command')).show, 'Show the command');
  assert.ok(showsRawWork(card('command')) && !showsRawWork({ ...card('command'), kind: 'other', prose: true }), 'the app’s own cards stay as they are');
});

step('the stages of an app are all on the strip', () => assert.equal(WEBAPP_STAGES.length, 6));

console.log(`\n${passed} checks passed`);
