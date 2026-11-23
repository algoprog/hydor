// Script tests for Antigravity CLI's sign-in: what `agy acp --login` prints (the link, "Logged in as"), what `agy models` says
// of the sign-in, the plan's name from a session's tier, and the control itself against a made-up `agy` (a small program put
// first on the agents' PATH): the sign-in check and its minute of memory, signing in with a pasted code, usage that starts
// nothing, a limit that is remembered until it lifts, a wrong code, a cancelled and an unfinished sign-in, and signing out.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/antigravity-test.ts && CUDA_VISIBLE_DEVICES= DATA_DIR=/tmp/hydor-test-antigravity node dist/dev/antigravity-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LoginFlow } from '../../shared/types.ts';
import { config, ensureDirs } from '../config.ts';
import { openDb } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import { agyLoggedInAs, agyLoginPrompt, agySignedIn, antigravityControl, antigravityPlanName, dropAntigravityControl } from './antigravity.ts';

if (!config.dataDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';
// The agents' environment is read from a login shell and kept in the data folder: a fresh folder reads it once, here.
fs.rmSync(config.dataDir, { recursive: true, force: true });
ensureDirs();

const URL_TEXT =
  'https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=1234-abcd.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&scope=openid&state=Zm9vYmFy';
const PROMPT = `Open this link in a browser to log in with Google:\n\n  ${URL_TEXT}\n\nThen paste the authorization code, or the full URL of the page you land on, and press Enter:\n`;

// ---- the pure parts --------------------------------------------------------------------------------------------------
assert.deepEqual(agyLoginPrompt(PROMPT), { url: URL_TEXT, asks: true });
assert.deepEqual(agyLoginPrompt(PROMPT.replace(/\n/g, '\r\n')), { url: URL_TEXT, asks: true }, 'CRLF');
assert.deepEqual(agyLoginPrompt(`\x1b[1mOpen this link in a browser to log in with Google:\x1b[0m\n\n  \x1b[4m${URL_TEXT}\x1b[0m\n`), { url: URL_TEXT, asks: false }, 'colours, and no question yet');
assert.deepEqual(agyLoginPrompt('Open this link in a browser to log in with Google:\n\n  ' + URL_TEXT.slice(0, 60)), { url: undefined, asks: false }, 'half a link is no link');
assert.deepEqual(agyLoginPrompt(PROMPT.slice(0, PROMPT.indexOf('Then paste'))), { url: URL_TEXT, asks: false }, 'the link first, the question later');
assert.deepEqual(agyLoginPrompt('Open this link in a browser to log in with Google:\n'), { url: undefined, asks: false });
assert.deepEqual(agyLoginPrompt(''), { url: undefined, asks: false });
assert.equal(agyLoginPrompt('see https://example.com/page and then\n').url, undefined, 'only Google’s sign-in page');

assert.equal(agyLoggedInAs('Logged in as test@example.com\n'), 'test@example.com');
assert.equal(agyLoggedInAs('Then paste…\r\nLogged in as test@example.com\r\n'), 'test@example.com', 'CRLF, after the prompt');
assert.equal(agyLoggedInAs('\x1b[32mLogged in as alex+agy@example.co.uk\x1b[0m'), 'alex+agy@example.co.uk', 'colours, no line break');
assert.equal(agyLoggedInAs('Logged in as Alex Example <alex@example.com>.\n'), 'alex@example.com');
assert.equal(agyLoggedInAs('login cancelled: no authorization code was entered\n'), undefined);
assert.equal(agyLoggedInAs('Logged in as\n'), undefined);
assert.equal(agyLoggedInAs(''), undefined);

assert.equal(agySignedIn('Error: Please sign in to view available models. Launch the CLI without arguments to sign in.\n', 1), false);
assert.equal(agySignedIn('Authentication required\n', 1), false);
assert.equal(agySignedIn('You are not logged into Antigravity\n', 1), false);
assert.equal(agySignedIn('stored credentials are expired or revoked\n', 1), false);
assert.equal(agySignedIn('Authentication expired. Please log back in.\n', 1), false);
assert.equal(agySignedIn('\x1b[31mError: Please sign in\x1b[0m\r\n', 1), false, 'colours and CRLF');
assert.equal(agySignedIn('HTTP 401 from the server', 1), false);
assert.equal(agySignedIn('gemini-3-pro\ngemini-3-flash\n', 0), true);
assert.equal(agySignedIn('', 0), true, 'it exited cleanly, with nothing to say');
assert.equal(agySignedIn('segmentation fault', 139), null, 'cannot tell');
assert.equal(agySignedIn('', -1), null);

assert.equal(antigravityPlanName('g1-ultra-tier'), 'Google AI Ultra');
assert.equal(antigravityPlanName('GOOGLE_AI_PLUS'), 'Google AI Plus');
assert.equal(antigravityPlanName({ id: 'g1-pro-tier', name: 'Antigravity' }), 'Google AI Pro', 'any of its names');
assert.equal(antigravityPlanName({ displayName: 'Google AI Pro' }), 'Google AI Pro');
assert.equal(antigravityPlanName({ title: 'Free' }), 'Free');
assert.equal(antigravityPlanName('free-tier'), 'Free');
assert.equal(antigravityPlanName('standard-tier'), 'Standard Tier');
assert.equal(antigravityPlanName('LEGACY_BUSINESS'), 'Legacy Business');
assert.equal(antigravityPlanName('Workspace Business'), 'Workspace Business', 'a name people wrote stays');
assert.equal(antigravityPlanName('  '), undefined);
assert.equal(antigravityPlanName({}), undefined);
assert.equal(antigravityPlanName({ name: 7 }), undefined);
assert.equal(antigravityPlanName(null), undefined);
assert.equal(antigravityPlanName(undefined), undefined);
assert.equal(antigravityPlanName(['pro']), undefined);

// ---- the control, against a made-up agy ------------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-antigravity-test-'));
const bin = path.join(tmp, 'bin');
fs.mkdirSync(bin);
const marker = path.join(tmp, 'signed-in');
const mode = path.join(tmp, 'mode');
const log = path.join(tmp, 'calls.log');
fs.writeFileSync(log, '');
// What the program does is read from these files as it starts, so each case can change it.
fs.writeFileSync(
  path.join(bin, 'agy'),
  `#!${process.execPath}
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, a.join(' ') + '\\n');
const mode = fs.existsSync(${JSON.stringify(mode)}) ? fs.readFileSync(${JSON.stringify(mode)}, 'utf8').trim() : '';
const URL = ${JSON.stringify(URL_TEXT)};
if (a[0] === 'models') {
  if (mode === 'broken') { console.log('something odd happened'); process.exit(2); }
  if (fs.existsSync(${JSON.stringify(marker)})) { console.log('gemini-3-pro\\ngemini-3-flash'); process.exit(0); }
  console.error('Error: Please sign in to view available models. Launch the CLI without arguments to sign in.');
  process.exit(1);
}
if (a[0] === 'acp' && a[1] === '--login') {
  if (mode === 'early') { console.error('Error: could not reach Google'); process.exit(1); }
  // The link comes in two pieces, as output may.
  process.stdout.write('Open this link in a browser to log in with Google:\\r\\n\\r\\n  ' + URL.slice(0, 80));
  setTimeout(() => {
    process.stdout.write(URL.slice(80) + '\\r\\n\\r\\nThen paste the authorization code, or the full URL of the page you land on, and press Enter:\\r\\n');
    let got = '';
    process.stdin.on('data', (d) => {
      got += d;
      if (!got.includes('\\n')) return;
      const line = got.split('\\n')[0].trim();
      if (line === 'bad') { console.error('Error: authorization code rejected'); process.exit(1); }
      fs.writeFileSync(${JSON.stringify(marker)}, '');
      console.log('Logged in as test@example.com');
      process.exit(0);
    });
    process.stdin.on('end', () => { console.error('login cancelled: no authorization code was entered'); process.exit(1); });
  }, 150);
} else if (a[0] === 'acp') {
  let buf = '';
  process.stdin.on('data', (d) => {
    buf += d;
    for (let i = buf.indexOf('\\n'); i >= 0; i = buf.indexOf('\\n')) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      fs.appendFileSync(${JSON.stringify(log)}, 'rpc ' + m.method + ' ' + JSON.stringify(m.params) + '\\n');
      if (m.method === 'logout') fs.rmSync(${JSON.stringify(marker)}, { force: true });
      const bad = m.method === 'logout' && mode === 'logout-fails';
      process.stdout.write(JSON.stringify(bad ? { jsonrpc: '2.0', id: m.id, error: { code: -32603, message: 'could not remove the credentials' } } : { jsonrpc: '2.0', id: m.id, result: {} }) + '\\n');
    }
  });
}
`,
  { mode: 0o755 },
);
// The agents' environment (what the control starts programs with) gets the made-up agy first on its PATH, before any real one.
const env = agentBaseEnv();
const realPath = env.PATH;
env.PATH = `${bin}${path.delimiter}${realPath}`;

const calls = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
const ran = (what: string) => calls().filter((l) => l.startsWith(what)).length;
const setMode = (m: string) => fs.writeFileSync(mode, m);
const until = async (check: () => boolean, what: string, ms = 10_000) => {
  for (const t = Date.now(); !check(); await new Promise((r) => setTimeout(r, 20))) if (Date.now() - t > ms) throw new Error(`waited too long for ${what}`);
};

const db = openDb(path.join(tmp, 'test.db'));
const ctl = antigravityControl(db);
assert.equal(antigravityControl(db), ctl, 'one sign-in, one control');
assert.throws(() => antigravityControl(db, 'some-account'), /removed|own sign-in only/, 'no added accounts, ever');
dropAntigravityControl('some-account');
const seen: string[] = [];
ctl.on('flow', (f: LoginFlow) => seen.push(`flow:${f.state}`));
ctl.on('account', () => seen.push('account'));

// Signed out: said once a minute, however often it is asked, and asked once however many ask at once.
const [s1, s2] = await Promise.all([ctl.account(), ctl.account()]);
assert.deepEqual(s1, { agent: 'antigravity', loggedIn: false });
assert.equal(s2, s1, 'the two asked at once share one run');
assert.equal(ran('models'), 1);
await ctl.account();
assert.equal(ran('models'), 1, 'kept for a minute');
const out = await ctl.usage();
assert.deepEqual([out.ok, out.error, out.windows, out.agent], [false, 'Sign in to Antigravity CLI in Settings → Agents → Accounts.', [], 'antigravity']);
assert.equal(ctl.lastUsage, out);
assert.equal(ctl.email, undefined);

// Signing in: the link whole, a code asked for, a bad submission refused, the code accepted, the program done.
const f = await ctl.startLogin();
assert.equal(f.state, 'waiting');
assert.equal(f.url, URL_TEXT, 'the whole link, though it came in two pieces');
assert.equal(f.needsInput, 'code');
assert.equal(f.agent, 'antigravity');
assert.match(f.message ?? '', /paste the code/);
assert.deepEqual(seen, ['flow:waiting']);
assert.throws(() => ctl.submitCode(f.id, '   '), /Paste the code from the page/);
assert.throws(() => ctl.submitCode(f.id, 'x'.repeat(4001)), /Paste the code from the page/);
assert.throws(() => ctl.submitCode('nope', '4/abc'), /no longer running/);
assert.equal(f.state, 'waiting', 'refused pastes change nothing');
const v = ctl.submitCode(f.id, '  4/0AbCd-code  ');
assert.equal(v.state, 'verifying');
assert.equal(v.needsInput, undefined);
await until(() => f.state === 'done', 'the sign-in to finish');
assert.equal(f.message, 'Signed in to Antigravity CLI');
assert.equal(f.error, undefined);
assert.deepEqual(seen, ['flow:waiting', 'flow:verifying', 'flow:done', 'account']);
assert.match(calls().join('\n'), /acp --login/);
assert.equal(ctl.email, 'test@example.com');
assert.throws(() => ctl.submitCode(f.id, '4/0AbCd'), /no longer running/, 'a finished sign-in takes no more');
assert.deepEqual(JSON.parse((db.prepare("select v from kv where k = 'antigravity_signin'").get() as { v: string }).v), { email: 'test@example.com' }, 'kept for the next start');

// The old answer went with the sign-in: asked again, it runs the program and finds it signed in.
const into = await ctl.account();
assert.equal(ran('models'), 2, 'the sign-in cleared the kept answer');
assert.deepEqual(into, { agent: 'antigravity', loggedIn: true, email: 'test@example.com', method: 'Google' });

// Usage starts nothing: no windows, who and which plan, where to see the rest; a plan from a session is kept.
const before = calls().length;
const u = await ctl.usage();
assert.equal(calls().length, before, 'no program was run for the usage');
assert.deepEqual(u.windows, []);
assert.equal(u.ok, true);
assert.deepEqual(u.account, { email: 'test@example.com' });
assert.equal(u.note, 'Antigravity CLI shows how much of your plan is left with /usage in its own terminal.');
assert.equal(u.limited, null);
ctl.notePlan({ id: 'g1-pro-tier' });
ctl.notePlan({ id: 'g1-pro-tier' });
assert.deepEqual((await ctl.usage()).account, { email: 'test@example.com', plan: 'Google AI Pro' });
assert.equal((await ctl.account()).plan, 'Google AI Pro', 'the kept answer has it too');
assert.equal(seen.filter((x) => x === 'account').length, 2, 'a plan seen again is no news');
ctl.notePlan({});
assert.equal((await ctl.usage()).account?.plan, 'Google AI Pro', 'a tier with no name leaves it');
assert.deepEqual(await ctl.models(), []);

// A limit a session ran into: shown while it lasts, forgotten when it has lifted.
const lifts = Date.now() + 3600_000;
ctl.noteLimit({ label: 'Weekly limit', resetsAt: lifts });
assert.deepEqual((await ctl.usage()).limited, { label: 'Weekly limit', resetsAt: lifts });
ctl.noteLimit({ label: 'Weekly limit', resetsAt: Date.now() - 1000 });
assert.equal((await ctl.usage()).limited, null, 'lifted');
assert.equal((await ctl.usage()).limited, null, 'and forgotten');
ctl.noteLimit({ label: 'Rate limit' });
assert.deepEqual((await ctl.usage()).limited, { label: 'Rate limit', resetsAt: null }, 'no time given: it stands for a while');
(ctl as any).limit.at = Date.now() - 7 * 3600_000;
assert.equal((await ctl.usage()).limited, null, 'but not for ever');
assert.equal(calls().length, before, 'still no program run');

// A session found it signed out.
ctl.noteSignedOut();
assert.equal((await ctl.account()).loggedIn, false);
assert.equal((await ctl.usage()).error, 'Sign in to Antigravity CLI in Settings → Agents → Accounts.');
assert.equal(ctl.email, undefined, 'the saved sign-in went');
assert.equal(ran('models'), 2, 'said from what the session found, with no run');

// A wrong code fails the sign-in with what the program said; a program that stops at once fails it too.
setMode('');
const bad = await ctl.startLogin();
ctl.submitCode(bad.id, 'bad');
await until(() => bad.state === 'failed', 'the wrong code to fail');
assert.equal(bad.error, 'Error: authorization code rejected');
assert.equal(bad.needsInput, undefined);
assert.equal(ctl.email, undefined);
setMode('early');
const early = await ctl.startLogin();
assert.equal(early.state, 'failed');
assert.equal(early.url, undefined);
assert.equal(early.error, 'Error: could not reach Google');

// A cancelled sign-in stays cancelled; a new one cancels the one running.
setMode('');
const c1 = await ctl.startLogin();
const c2 = await ctl.startLogin();
assert.equal(c1.state, 'cancelled');
assert.equal(c2.state, 'waiting');
ctl.cancelLogin(c2.id);
assert.equal(c2.state, 'cancelled');
await new Promise((r) => setTimeout(r, 400));
assert.equal(c2.state, 'cancelled', 'the program ending does not change that');
assert.equal(c2.error, undefined);
ctl.cancelLogin('unknown');
const c3 = await ctl.startLogin();
ctl.cancelAll();
assert.equal(c3.state, 'cancelled');

// The minute's memory is forgotten here so each of these asks the program.
const forget = () => ((ctl as any).kept = undefined);

// An answer from `agy models` that is neither one: said as it is, and asked again next time.
setMode('broken');
forget();
const odd = await ctl.account();
assert.equal(odd.loggedIn, false);
assert.equal(odd.error, 'Could not ask Antigravity CLI about its sign-in: something odd happened');
const asked = ran('models');
await ctl.account();
assert.equal(ran('models'), asked + 1, 'not kept');
setMode('');

// Signing out: its agent's logout, then no sign-in anywhere.
const again = await ctl.startLogin();
ctl.submitCode(again.id, '4/ok');
await until(() => again.state === 'done', 'the second sign-in');
assert.equal((await ctl.account()).loggedIn, true);
assert.equal(ctl.email, 'test@example.com');
await ctl.logout();
assert.ok(calls().some((l) => l.startsWith('rpc logout')), 'the logout call was made');
assert.ok(calls().some((l) => l.startsWith('rpc initialize') && l.includes('"hydor"')), 'after initialize');
assert.equal(fs.existsSync(marker), false);
assert.equal(ctl.email, undefined);
assert.equal(ctl.lastUsage, null);
assert.equal((await ctl.account()).loggedIn, false);
assert.equal((await ctl.usage()).ok, false);
// Its agent says it could not: the sign-out did not happen, and the person hears it.
fs.writeFileSync(marker, '');
setMode('logout-fails');
await assert.rejects(ctl.logout(), /could not sign out: could not remove the credentials/);
setMode('');
fs.rmSync(marker, { force: true });

// Not installed: said in words, and no sign-in to start; signing out has nothing to do but forget.
env.PATH = path.join(tmp, 'nothing-here');
forget();
const none = await ctl.account();
assert.deepEqual(none, { agent: 'antigravity', loggedIn: false, error: 'Antigravity CLI is not installed: install it with Google’s installer (Settings → Agents → More agents shows the command).' });
await assert.rejects(ctl.startLogin(), /not installed/);
await ctl.logout();
env.PATH = realPath;

console.log('antigravity-test: all passed');
