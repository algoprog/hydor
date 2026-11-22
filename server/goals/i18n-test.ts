// Checks that the goal loop's own sentences are in the pages' languages: real sentences from the server's own functions and
// constants (so that one reworded there is found here), with values, put through the pages' translator (shared/translate.ts)
// with the German and Japanese dictionaries (and the rest), each must come out translated and not half in English; and that
// the extraction (scripts/i18n-extract.mjs) knows every sentence a refusal or a constant of the loop holds. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/i18n-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-i18n node dist/dev/i18n-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { translator, type Dictionary } from '../../shared/translate.ts';
import type { GoalState } from '../../shared/goals.ts';
import { APP_ROOT } from '../config.ts';
import { UNPRICED, NO_SANDBOX, STOPPED_SWARM, STOPPED_TEAM, goalNotSetText, reviewerDown, teamRefusal } from './driver.ts';
import { cleanChecks, cleanLimits, parseGoalAction } from './validate.ts';
import { limitReason } from './verdict.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const i18n = path.join(APP_ROOT, 'web', 'src', 'i18n');
const dict = (lang: string): Dictionary => JSON.parse(fs.readFileSync(path.join(i18n, `${lang}.json`), 'utf8'));
const LANGS = ['de', 'es', 'fr', 'pt', 'el', 'ja', 'zh'];
const tr = Object.fromEntries(LANGS.map((l) => [l, translator(dict(l))]));
const strings = JSON.parse(fs.readFileSync(path.join(i18n, 'strings.json'), 'utf8')) as Record<string, string>;
const source = (f: string) => fs.readFileSync(path.join(APP_ROOT, 'server', 'goals', f), 'utf8');

/** A constant of driver.ts that holds a sentence: `const SAY_PAUSING = '…'`. */
const constant = (name: string): string => {
  const m = new RegExp(`const ${name} = '((?:[^'\\\\]|\\\\.)*)'`).exec(source('driver.ts'));
  assert.ok(m, `${name} is not a sentence constant of driver.ts any more: update this test`);
  return m[1].replace(/\\'/g, "'");
};

/** TEAM_LATE of driver.ts (not exported), as the server defines it: read from its source and run. */
const teamLate: (n: number, titles: string[], swarm: boolean) => string = (() => {
  const m = /^const TEAM_LATE = (\(n: number, titles: string\[\], swarm: boolean\) => \{[\s\S]*?^\});?$/m.exec(source('driver.ts'));
  assert.ok(m, 'TEAM_LATE is not written as an arrow function of driver.ts any more: update this test');
  const js = m[1].replace(/: (number|string\[\]|boolean)/g, '');
  return new Function('clip', `return ${js}`)((x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x));
})();

/** A sentence in a statement of driver.ts, by the words it starts with (for the ones not kept in a constant). */
const literal = (file: string, start: string): string => {
  const m = new RegExp(`'(${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^']*)'`).exec(source(file)) ?? new RegExp(`\`(${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\`]*)\``).exec(source(file));
  assert.ok(m, `"${start}" is not written in ${file} any more: update this test`);
  return m[1];
};

const goal = (rounds: number, limits: GoalState['contract']['limits'], spent = 0): Pick<GoalState, 'rounds' | 'contract' | 'spentUsd'> =>
  ({ rounds: Array.from({ length: rounds + 1 }, (_, n) => ({ n, outcome: n ? 'kept' : 'start' })), contract: { objective: 'x', checks: [], protect: [], limits }, spentUsd: spent }) as never;

/** Real sentences of the loop, with values in them, as a person sees them. */
function sentences(): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (name: string, s: string | null) => void (assert.ok(s, name), (out[name] = s!));
  // What the server's functions say.
  put('limit: rounds', limitReason(goal(6, { rounds: 6 }), 0));
  put('limit: money', limitReason(goal(2, { rounds: 30, usd: 10 }, 10.2), 0));
  put('limit: time', limitReason(goal(2, { rounds: 30, minutes: 90 }), 95 * 60_000));
  put('stopped swarm', STOPPED_SWARM);
  put('stopped team', STOPPED_TEAM);
  // The limit report's sentence for the subagents or members still at work: one name, two, and more.
  for (const swarm of [true, false]) for (const titles of [['Try the cache'], ['Try the cache', 'Rewrite the query'], ['Try the cache', 'Rewrite the query', 'Read the logs'], ['A', 'B', 'C', 'D']]) put(`late ${swarm ? 'member' : 'subagent'} x${titles.length}`, teamLate(4, titles, swarm));
  put('give it more', 'It has run 6 rounds: give it more than that.');
  put('unpriced', UNPRICED);
  put('no sandbox', NO_SANDBOX);
  put('campaign', teamRefusal({ swarm: 'campaign' }));
  put('research', teamRefusal({ research: {} } as never));
  put('arena', teamRefusal({ arena: {} } as never));
  put('not set', goalNotSetText('The session is in Plan mode, where it changes nothing: switch to another mode first.'));
  put('reviewer down', reviewerDown('The reviewer gave no answer that could be read'));
  put('no check', cleanChecks([]).errors[0]);
  put('too many checks', cleanChecks(Array.from({ length: 13 }, () => ({ kind: 'command', label: 'Tests pass', run: 'npm test' }))).errors[0]);
  const limits: string[] = [];
  cleanLimits({ rounds: 0 }, limits, { rounds: 5 });
  put('bad rounds', limits[0]);
  for (const [name, body] of [['say which round', { action: 'round', do: 'keep' }], ['say what the rule is', { action: 'rule', text: ' ' }], ['unknown action', { action: 'dance' }]] as const) {
    try {
      parseGoalAction(body);
      assert.fail(name);
    } catch (e) {
      put(name, (e as Error).message);
    }
  }
  // What it keeps in constants, and in its notices, filled in as the code fills them.
  for (const c of ['SAY_PAUSING', 'SAY_AGENT_BUSY', 'SAY_TEAM_BUSY', 'SAY_COMMITTED', 'HALF', 'QUEUE_HELD', 'IN_PLAN', 'IN_SUBAGENT']) put(c, constant(c));
  put('goal is not paused', literal('driver.ts', 'The goal is not paused'));
  put('goal has a goal', literal('driver.ts', 'This session has a goal: stop the goal first'));
  put('wait for the round', literal('driver.ts', 'Wait for the round to end'));
  put('paused by you', 'Paused by you.');
  put('paused by you, restart', 'Paused by you. A restart of the app cut round 3’s turn short: Resume to check what it did.');
  put('goal paused notice', 'Goal paused: Paused by you.');
  put('goal reached notice', 'Goal reached: Search on the shop puts the right product first, and stays fast.');
  put('needs you notice', 'The goal needs you: does “The results feel right” hold?');
  put('round not checked', 'Round 4 could not be checked: the session kept working in the folder while its checks ran. Resume to check it again.');
  put('check could not run', '“Tests pass” could not run: The command was not found. Resume to check the round again');
  // Texts of several sentences, as the loop joins them.
  put('reached summary', 'All 5 checks hold: in the last round, and again on a second run. A review of the whole change found the goal met. You confirmed The results feel right.');
  put('reached at the start', 'The check held when the app first measured where things stand, before any round: this already holds.');
  put('limit report', `${limitReason(goal(6, { rounds: 6 }), 0)}. Round 4 was stopped midway and its work is still in the folder. Keep anyway… on round 3 puts the files back to the best round.`);
  put('round why', 'Tests pass stopped holding. Your rules could not be checked this round');
  put('round why, not undone', 'It broke a rule of yours: “No new dependencies”. It was not undone: another session (“Fix the login”) was working in the folder');
  return out;
}

/** What a translation must not leave in English: whole words of the loop's own sentences (a value, a label or a name may be). */
const ENGLISH = /\b(the|its|could|resume|session|files|folder|checks?|round|goal|which|and then)\b/i;

test('the goal loop’s sentences, with their values, come out translated in German and Japanese', () => {
  for (const lang of ['de', 'ja']) {
    for (const [name, s] of Object.entries(sentences())) {
      const t = tr[lang](s);
      assert.ok(t != null && t !== s, `${lang}: "${name}" has no translation: ${s}`);
      // The values in these sentences are numbers and the labels "Tests pass", "The results feel right", "No new dependencies",
      // "Fix the login" and a command's error: a sentence left half in English shows as one of the words below outside them.
      const rest = t.replace(/Try the cache|Rewrite the query|Read the logs|Tests pass|The results feel right|The command was not found|The reviewer gave no answer that could be read|No new dependencies|Fix the login|Search on the shop puts the right product first, and stays fast/g, '');
      assert.ok(!ENGLISH.test(rest), `${lang}: "${name}" is half in English: ${t}`);
    }
  }
});

test('every language has them', () => {
  for (const lang of LANGS) for (const [name, s] of Object.entries(sentences())) assert.ok(tr[lang](s) != null, `${lang}: "${name}" has no translation`);
});

test('a refusal or a sentence of the loop that the extraction does not know would show in English: every one is in strings.json', () => {
  const known = new Set(Object.keys(strings));
  const want: string[] = [];
  for (const f of ['driver.ts', 'validate.ts']) for (const m of source(f).matchAll(/new HttpError\(\s*\d+\s*,\s*'((?:[^'\\]|\\.)*)'/g)) want.push(m[1]);
  for (const m of source('validate.ts').matchAll(/\bfail\('((?:[^'\\]|\\.)*)'\)/g)) want.push(m[1]);
  for (const m of source('driver.ts').matchAll(/^(?:export )?const ([A-Z_]+) = '((?:[^'\\]|\\.)*)';/gm)) if (/^(SAY_|HALF|QUEUE_HELD|IN_|STOPPED_SWARM|UNPRICED|NO_SANDBOX)/.test(m[1])) want.push(m[2]);
  assert.ok(want.length > 40, 'it found the loop’s sentences');
  const missing = want.map((s) => s.replace(/\\'/g, "'").replace(/\s+/g, ' ').trim()).filter((s) => !known.has(s));
  assert.deepEqual(missing, [], 'not in strings.json: run npm run i18n:extract, then i18n:translate');
  // And each has its translation in every language.
  for (const lang of LANGS) {
    const d = dict(lang);
    const lacking = want.map((s) => s.replace(/\\'/g, "'").replace(/\s+/g, ' ').trim()).filter((s) => !(s in d));
    assert.deepEqual(lacking, [], `${lang}: no translation for these`);
  }
});

test('a text that is not all known stays in English whole, and a sentence the loop did not write is left alone', () => {
  const t = tr.de;
  // One sentence of two unknown: nothing is translated (not half).
  assert.equal(t('Tests pass stopped holding. The agent wrote a poem about the weather.'), null);
  // A model's words go in as they are, in the sentence the loop put them in: only the loop's words are translated.
  assert.equal(t('The final check: it added a special case for the test queries'), `${t('The final check: {0}'.replace('{0}', 'x'))?.replace(/x$/, '')}it added a special case for the test queries`);
  // A sentence's full stop does not hide it, and two of them in a row are both found.
  assert.ok(t('Only a kept round can be undone.') != null);
  assert.ok(t('Paused by you. Stopped by you.') != null);
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
console.log(`${passed}/${tests.length} passed`);
