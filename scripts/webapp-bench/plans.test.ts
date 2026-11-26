// The briefs, the instructions, the statistics, the report and the Hydor group, without any app (`node --test scripts/webapp-bench/*.test.ts`). The judge itself is proved by
// logic.test.ts (the briefs of their own logic) and selftest.ts (apps written by hand, and copies of them spoiled).
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from './unit.ts';
import { type Collected } from './collect.ts';
import { readJudgeJson } from './acceptance.ts';
import { dough, parts, race, board, saturdayOnOrBefore, seedCalendar, takings } from './rules.ts';
import { planChecks } from './plans.ts';
import { instructionFor, prepare } from './prepare.ts';
import { says, dayMatches } from './judge.ts';
import { opOf } from './acceptance.ts';
import { bind, cslug, markerField } from './things.ts';
import { loadExpect } from './expect.ts';
import { accepts } from './acceptance.ts';
import { fold } from './lib.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpus50, inCategory, localTime, may, paidThisMonth, search, slotsFor, slugify } from './rules-larger.ts';
import { buildReport, chooseLabels, GROUP_NAMES, groupsOf, labelsOf, pairsOf, readRuns } from './report.ts';
import { CHECKER, agreeLine, disagreements, hydorGroup } from './hydor.ts';
import { bootstrap, median } from './stats.ts';
import { costOf } from './cost.ts';
import { appFiles } from './measure.ts';

describe('the fourteen briefs', () => {
  it('every plan holds, four are rules of their own, four are larger, and the instructions are complete', () => {
    const bad = planChecks().filter((c) => !c.ok).map((c) => c.say);
    expect(bad).toEqual([]);
  });
});

describe('the instruction', () => {
  it('has the numbers filled in and names no framework', () => {
    const said = instructionFor('build', '15', '60');
    expect(said).toContain('15 US dollars');
    expect(said).toContain('60 minutes');
    expect(said).not.toContain('{{');
    expect(said).not.toMatch(/\bkit\b/i);
    expect(instructionFor('change', '5', '20')).toContain('5 US dollars');
  });
  it('prepare gives the builder the brief and its answers, the acceptance notes and never an expectation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'versus-prep-'));
    try {
      prepare('07-food-bank', '2026-12-01', join(dir, 'run'), { budgetUsd: '10', minutes: '45' });
      const have = (f: string) => existsSync(join(dir, 'run/brief', f));
      expect(['INSTRUCTION.md', 'brief.md', 'answers.md', 'ACCEPTANCE.md'].every(have)).toBe(true);
      expect(['expect.json', 'expect-change.json', 'change.md'].some(have)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('judge.json', () => {
  it('says what is wrong with one that is not right', () => {
    expect(readJudgeJson(null)).toHaveProperty('problems');
    expect(readJudgeJson('{')).toHaveProperty('problems');
    expect((readJudgeJson('{"version":1,"start":{}}') as any).problems.length).toBe(3);
    expect(readJudgeJson('{"version":1,"start":{"command":"x","port":"P","data":"D"}}')).toHaveProperty('json');
  });
});

describe('the rules the four briefs of their own logic ask for', () => {
  it('dough: the starter is part of the flour and the water', () => {
    const r = dough({ loaves: 4, loafWeight: 800 });
    expect(r.totalDough).toBe(3200);
    expect(r.flour + r.starter / 2 + r.water + r.starter / 2 + r.salt).toBeCloseTo(3200, -1);
  });
  it('takings: a comma in quotes, refunds, lines that cannot be read', () => {
    expect(parts('2027-08-01,"Lavender, large",2,18.00')).toEqual(['2027-08-01', 'Lavender, large', '2', '18.00']);
    const t = takings('date,item,quantity,price\n2027-05-08,A,3,10\n2027-05-08,A,-1,10\n2027-05-08,B,x,10\n')!;
    expect([t.total, t.itemsSold, t.refunds, t.skipped, t.bestSeller]).toEqual([20, 2, 1, 1, 'A']);
    expect(takings('')).toBeNull();
  });
  it('race and board: bonuses add up and a name is one player', () => {
    expect(race(Array(10).fill(0).map((_, i) => [42, 72, 49, 48, 54, 88, 36, 45, 56, 144][i]!), 50).points).toBe(15);
    expect(board([{ name: 'Amy', points: 5, seconds: 9 }, { name: 'amy ', points: 7, seconds: 9 }, { name: 'Bo', points: 6, seconds: 1 }]).map((p) => p.points)).toEqual([7, 6]);
  });
  it('calendar: every job is on a Saturday', () => {
    expect(saturdayOnOrBefore('2027-04-24')).toBe('2027-04-24');
    expect(saturdayOnOrBefore('2027-04-25')).toBe('2027-04-24');
    for (const t of seedCalendar('2027-04-23', ['Tomatoes', 'Lettuce'])!) expect(new Date(`${t.date}T00:00:00Z`).getUTCDay()).toBe(6);
  });
});

describe('the statistics', () => {
  it('median and a seeded bootstrap', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    const a = bootstrap([1, 2, 3, 4, 5, 6]);
    expect(a).toEqual(bootstrap([1, 2, 3, 4, 5, 6]));
    expect(a.low!).toBeLessThanOrEqual(a.median!);
    expect(a.high!).toBeGreaterThanOrEqual(a.median!);
    expect(bootstrap([5]).low).toBeNull();
  });
});

describe('the cost of a run on a subscription', () => {
  it('is its tokens at the model\'s prices per million', () => {
    expect(costOf({ input: 1_000_000, output: 1_000_000, cached: 1_000_000 })).toBeCloseTo(12.2, 6);
    expect(costOf({ input: 100_000, output: 40_000, cached: 500_000 })).toBeCloseTo(0.7, 6);
    expect(costOf({ input: 1_000_000, output: 1_000_000, cached: 0 }, { input: 3, output: 15, cacheRead: 0.3 })).toBe(18);
  });
});

describe('the report', () => {
  const made = (brief: string, label: string, passed: number, total: number, cost: number, seconds: number, lines: number, hydor?: Collected['hydor']): Collected => ({
    run: { brief, label, kind: 'build', model: 'm', seconds, costUsd: cost, tokens: { input: 1000, output: 500, cached: null }, budgetUsd: '15', minutes: '60', notes: '' },
    judged: { brief, lines: Array.from({ length: total }, (_, i) => ({ id: `l${i}`, status: i < passed ? 'pass' : 'fail', say: '' })), score: { passed, total, notChecked: 0, all: passed === total }, timing: { build: 1, start: 1 }, notes: [] },
    size: { files: 3, lines },
    started: true,
    ...(hydor ? { hydor } : {}),
  });
  const write = (dir: string, specs: [string, string, Collected][]) => {
    for (const [brief, label, c] of specs) {
      mkdirSync(join(dir, `${brief}-${label}`));
      writeFileSync(join(dir, `${brief}-${label}`, 'result.json'), JSON.stringify(c));
    }
  };
  const BRIEFS = ['01-kiln-share', '07-food-bank', '13-dough-sums', '14-market-takings', '17-rowing-club', '19-help-centre'];
  it('pairs the runs of two labels for each brief and keeps the three groups apart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-report-'));
    try {
      const specs: [string, string, Collected][] = [];
      for (const [i, brief] of BRIEFS.entries()) specs.push([brief, '2026-11-26', made(brief, '2026-11-26', 14, 14, 1 + i, 600, 80)], [brief, '2026-12-10', made(brief, '2026-12-10', 12 + (i % 2), 14, 2 + i, 1200, 300)]);
      write(dir, specs);
      const runs = readRuns(dir);
      expect(runs).toHaveLength(12);
      expect(labelsOf(runs)).toEqual(['2026-11-26', '2026-12-10']);
      expect(chooseLabels(runs)).toEqual(['2026-11-26', '2026-12-10']);
      expect(pairsOf(runs, ['2026-11-26', '2026-12-10'])).toHaveLength(6);
      const text = buildReport(runs, groupsOf());
      expect(text).toContain('2026-12-10 against 2026-11-26');
      expect(text).toContain(GROUP_NAMES.accounts);
      expect(text).toContain(GROUP_NAMES.logic);
      expect(text).toContain(GROUP_NAMES.larger);
      expect(text).toContain('One row for each group');
      expect(text).toContain('is a small sample');
      expect(text).toContain('chosen, not drawn');
      expect(text).toContain('bootstrap interval');
      expect(text).toMatch(/Every line passed: 2026-11-26 6 of 6, 2026-12-10 0 of 6/);
      expect(text).not.toMatch(/\bkit\b/i);
      expect(text).not.toContain("Hydor's contract");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('compares the two labels asked for when there are more, says what is missing when there is nothing to compare, and refuses two runs of one brief under one label', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-report-'));
    try {
      write(dir, [['01-kiln-share', 'a', made('01-kiln-share', 'a', 14, 14, 1, 600, 80)], ['01-kiln-share', 'b', made('01-kiln-share', 'b', 14, 14, 2, 600, 80)], ['01-kiln-share', 'c', made('01-kiln-share', 'c', 13, 14, 3, 600, 80)]]);
      const runs = readRuns(dir);
      expect(chooseLabels(runs)).toHaveProperty('why');
      expect(chooseLabels(runs, 'a,c')).toEqual(['a', 'c']);
      expect(chooseLabels(runs, 'a,z')).toHaveProperty('why');
      expect(chooseLabels(runs, 'a,a')).toHaveProperty('why');
      expect(buildReport(runs, groupsOf())).toContain('Nothing to compare yet');
      expect(buildReport(runs, groupsOf(), [], { labels: ['a', 'c'] })).toContain('c against a');
      expect(chooseLabels(runs.filter((r) => r.label === 'a'))).toHaveProperty('why');
      expect(() => pairsOf([...runs, ...runs.filter((r) => r.label === 'a')], ['a', 'b'])).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('shows what Hydor\'s checker said apart from the score, only for the runs that had a hydor.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-report-'));
    try {
      const group = { ran: true, ok: false, passed: 4, failed: 1, summary: '', lines: [{ id: 'agree', title: 't', state: 'failed' as const, text: 'x' }, { id: 'ready', title: 't', state: 'passed' as const, text: 'y' }] };
      write(dir, [['13-dough-sums', 'a', made('13-dough-sums', 'a', 10, 10, 1, 60, 50)], ['13-dough-sums', 'b', made('13-dough-sums', 'b', 10, 10, 1, 60, 50, group)]]);
      const text = buildReport(readRuns(dir), groupsOf());
      expect(text).toContain("Hydor's contract, apart from the score");
      expect(text).toContain('4 passed, 1 failed');
      expect(text).toContain('| 13-dough-sums (logic) | b | 4 passed, 1 failed | agree |');
      expect(text).toContain('10/10 · 10/10');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Hydor's contract beside the judge", () => {
  const judgeJson = { version: 1, build: 'npm ci', start: { command: 'node server.js', port: 'PORT', data: 'DATA_DIR', ready: '/api/health' } } as any;
  const hydor = (o: object) => ({ start: 'node server.js', env: { port: 'PORT', data: 'DATA_DIR' }, ready: '/api/health', build: 'npm ci', signIn: 'own', ...o });
  it('finds only what both files say differently', () => {
    expect(disagreements(judgeJson, hydor({}))).toEqual([]);
    expect(disagreements(judgeJson, hydor({ start: 'node index.js', env: { port: 'HTTP_PORT', data: 'DATA_DIR' } }))).toHaveLength(2);
    expect(disagreements(judgeJson, hydor({ ready: '/health', build: 'npm install' }))).toHaveLength(2);
    // one file silent: nothing to disagree about (the judge's ready address is optional, and so is a build)
    const quiet = { version: 1, start: { command: 'node server.js', port: 'PORT', data: 'DATA_DIR' } } as any;
    expect(disagreements(quiet, hydor({ ready: '/anything', build: 'make' }))).toEqual([]);
    expect(disagreements(judgeJson, { start: 'node server.js' })).toEqual([]);
  });
  it('makes the first line of the group: a failure when they disagree, not a failure of the judge', () => {
    expect(agreeLine(judgeJson, JSON.stringify(hydor({}))).state).toBe('passed');
    const bad = agreeLine(judgeJson, JSON.stringify(hydor({ start: 'node other.js' })));
    expect(bad.state).toBe('failed');
    expect(bad.text).toContain('node other.js');
    expect(agreeLine(null, '{}').state).toBe('notRun');
    expect(agreeLine(judgeJson, '{').state).toBe('notRun');
  });
  it('is told to builders in one short optional section of the acceptance page, which says which file the judge reads and which line fails', () => {
    const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ACCEPTANCE.md'), 'utf8');
    const section = /## Optional: `hydor\.json`\n([\s\S]*?)\n## /.exec(page)?.[1] ?? '';
    expect(section.length).toBeGreaterThan(200);
    expect(section.split(/\s+/).length).toBeLessThanOrEqual(300);
    expect(section).toContain('apart from the score');
    expect(section).toContain('`agree`');
    expect(section).toContain('judge.json` is the file the checker believes');
  });
  it('is not made for an app with no hydor.json, and the checker is the one in this repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-hydor-'));
    try {
      expect(await hydorGroup(dir, judgeJson, [4760, 4764])).toBeNull();
      expect(existsSync(CHECKER)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the size of an app', () => {
  it('counts what the builder wrote and nothing that was installed, locked, built or generated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'versus-size-'));
    try {
      for (const f of ['server.js', 'public/a.css', 'node_modules/x/i.js', 'package-lock.json', '.output/s.mjs', 'src/routeTree.gen.ts', 'drizzle/0.sql', 'README.md']) {
        mkdirSync(join(dir, f, '..'), { recursive: true });
        writeFileSync(join(dir, f), 'x\n');
      }
      expect(appFiles(dir).map((f) => f.slice(dir.length + 1)).sort()).toEqual(['public/a.css', 'server.js']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const kiln = () => loadExpect(join(HERE, 'briefs/01-kiln-share/expect.json'));

describe('what the maker never asked for is not required', () => {
  const base = { version: 1, start: { command: 'x', port: 'P', data: 'D' } } as any;
  it('an app with no email for a kiln list is bound without a problem, and rows are found by the name', () => {
    const j = { ...base, things: { names: { list: { path: '/l' }, add: { path: '/a' }, fields: { name: 'name', 'what they would want to fire': 'f' } } } };
    const { bound, problems } = bind(kiln(), j);
    expect(problems).toEqual([]);
    const b = bound.get('signups')!;
    expect([...b.fields.keys()]).toEqual(['name', 'whatFor']);
    expect(markerField(b)).toBe('name');
  });
  it('an app with an email maps it, and the email is the marker only when nothing else is', () => {
    const j = { ...base, things: { signups: { list: { path: '/l' }, add: { path: '/a' }, fields: { email: 'e', name: 'n' } } } };
    const b = bind(kiln(), j).bound.get('signups')!;
    expect(markerField(b)).toBe('name');
    const only = { ...base, things: { signups: { list: { path: '/l' }, add: { path: '/a' }, fields: { email: 'e' } } } };
    const c = bind(kiln(), only);
    expect(c.problems.join()).toMatch(/no field for name/);
    expect(markerField(c.bound.get('signups')!)).toBe('email');
  });
  it('a field the app has that is none of the brief\'s is sent as it is', () => {
    const j = { ...base, things: { signups: { list: { path: '/l' }, add: { path: '/a' }, fields: { name: 'n', 'a note': 'note', 'contact mail': 'contact' } } } };
    const b = bind(kiln(), j).bound.get('signups')!;
    expect(b.extras).toEqual([{ name: 'a note', key: 'note', value: 'Judge' }, { name: 'contact mail', key: 'contact', value: 'extra.judge@judge.test' }]);
  });
  it('a veg box needs some answer to what the box is for, in any form', () => {
    const e = loadExpect(join(HERE, 'briefs/02-veg-box/expect.json'));
    const none = bind(e, { ...base, things: { signups: { list: { path: '/l' }, add: { path: '/a' }, fields: { business: 'b' } } } });
    expect(none.problems.join()).toMatch(/at least one/);
    const one = bind(e, { ...base, things: { signups: { list: { path: '/l' }, add: { path: '/a' }, fields: { business: 'b', 'what they would use it for': 'u' } } } });
    expect(one.problems).toEqual([]);
  });
  it('reading and removing a row are never required; changing is where the maker says so', () => {
    const e = loadExpect(join(HERE, 'briefs/07-food-bank/expect.json'));
    expect(e.kinds.every((k) => (k.ops ?? []).join() === 'change')).toBe(true);
    expect(opOf({ path: '/x/{id}', change: { method: 'POST', path: '/x/{id}/update' } }, 'change')).toEqual({ method: 'POST', path: '/x/{id}/update' });
    expect(opOf({ path: '/x/{id}', read: 'GET' }, 'remove')).toBeUndefined();
  });
});

describe('every reading the words allow', () => {
  it('phrases may be patterns', () => {
    expect(says('We fire every other Thursday.', 're:(every|each) (second|other)[a-z ,]{0,14}thursday')).toBe(true);
    expect(says('Fortnightly on Thursdays', 're:fortnight[a-z ,]{0,24}thursday')).toBe(true);
    expect(says('Mondays', 're:thursday')).toBe(false);
    expect(says('Room for 12 spaces', '12 spaces')).toBe(true);
  });
  it('a day is the day however a person writes it', () => {
    for (const t of ['2027-05-08', 'Sat 8 May 2027', 'May 8, 2027', '8th May 2027', '08/05/2027', '5/8/2027']) expect(dayMatches(t, '2027-05-08'), t).toBe(true);
    expect(dayMatches('9 May 2027', '2027-05-08')).toBe(false);
  });
  it('a choice\'s words are one with an ampersand or and', () => {
    expect(cslug('baby & household')).toBe(cslug('baby_household'));
    expect(cslug('baby and household')).toBe(cslug('Baby & Household'));
  });
});

describe('the rules of the larger briefs', () => {
  it('an address is the title in lower case with hyphens', () => {
    expect(slugify('How we check the flue')).toBe('how-we-check-the-flue');
    expect(slugify('  Pressure, gauges & valves!  ')).toBe('pressure-gauges-valves');
  });
  it('a search finds published articles with every word, title matches first, alphabetical, never a draft', () => {
    const c = [
      { title: 'Zeta valve', text: 'about pressure', category: 'A', status: 'published' as const },
      { title: 'Alpha pressure', text: 'a valve', category: 'A', status: 'published' as const },
      { title: 'Beta pressure valve', text: 'x', category: 'A', status: 'published' as const },
      { title: 'Draft pressure valve', text: 'x', category: 'A', status: 'draft' as const },
    ];
    expect(search(c, 'PRESSURE valve').map((a) => a.title)).toEqual(['Beta pressure valve', 'Alpha pressure', 'Zeta valve']);
    expect(search(c, 'press')).toEqual([]);
    expect(search(c, '')).toEqual([]);
    expect(inCategory(c, 'A').map((a) => a.title)).toEqual(['Alpha pressure', 'Beta pressure valve', 'Zeta valve']);
  });
  it('the fifty articles are fifty, with drafts and distinct addresses', () => {
    const c = corpus50();
    expect(c).toHaveLength(50);
    expect(c.filter((a) => a.status === 'draft').length).toBe(8);
    expect(new Set(c.map((a) => slugify(a.title))).size).toBe(50);
  });
  it('the slots of a day: every slot of the hours, none on a day off, booked ones gone', () => {
    const hours = [{ weekday: 'monday', start: '09:00', end: '12:00' }];
    expect(slotsFor('2031-07-14', hours, [], 30)).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
    expect(slotsFor('2031-07-14', hours, [], 45)).toEqual(['09:00', '09:45', '10:30', '11:15']);
    expect(slotsFor('2031-07-14', hours, ['2031-07-14'], 30)).toEqual([]);
    expect(slotsFor('2031-07-15', hours, [], 30)).toEqual([]);
    expect(slotsFor('2031-07-14', hours, [], 30, ['09:30'])).not.toContain('09:30');
  });
  it('a time is read in the maker\'s zone, in summer and in winter', () => {
    expect(localTime('2031-07-14T09:00:00+01:00', 'Europe/London')).toBe('09:00');
    expect(localTime('2031-07-14T08:00:00Z', 'Europe/London')).toBe('09:00');
    expect(localTime('2031-01-13T09:00:00Z', 'Europe/London')).toBe('09:00');
    expect(localTime('nonsense', 'Europe/London')).toBeNull();
  });
  it('who may do what in the club, and when a month counts', () => {
    expect(may('treasurer', 'see-all-details') && !may('treasurer', 'change-others-details')).toBe(true);
    expect(may('coach', 'post-notice') && !may('coach', 'see-all-details')).toBe(true);
    expect(may('member', 'give-roles') || may('member', 'post-notice')).toBe(false);
    expect(paidThisMonth(['2027-04'], '2027-05')).toBe(false);
    expect(paidThisMonth(['2027-05'], '2027-05')).toBe(true);
  });
});

describe("the maker's own words are always accepted", () => {
  const BRIEFS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'briefs');
  const folders = readdirSync(BRIEFS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const words = (folder: string, change: boolean) => ['brief.md', 'answers.md', ...(change ? ['change.md'] : [])].map((f) => readFileSync(join(BRIEFS_DIR, folder, f), 'utf8')).join('\n');
  /** What a field of a plan says: every quoted phrase is in the maker's words, and among the names the judge accepts, word for word. */
  const holds = (what: string, o: { id: string; names: string[]; said?: string[] }, text: string, problems: string[], mayBeEmpty = false) => {
    if (!o.said || (o.said.length === 0 && !mayBeEmpty)) return problems.push(`${what}: no "said" (the maker's own phrase for it)`);
    for (const q of o.said) {
      if (!fold(text).includes(fold(q))) problems.push(`${what}: "${q}" is not in the maker's words`);
      if (!accepts(q, o.id, o.names)) problems.push(`${what}: "${q}", the maker's own phrase, is not among the names accepted for it`);
    }
  };
  for (const folder of folders) {
    for (const [file, change] of [['expect.json', false], ['expect-change.json', true]] as const) {
      it(`${folder}: ${file}`, () => {
        const e = JSON.parse(readFileSync(join(BRIEFS_DIR, folder, file), 'utf8'));
        const text = words(folder, change);
        const problems: string[] = [];
        for (const k of e.kinds) {
          holds(`kind ${k.id}`, k, text, problems);
          for (const f of k.fields) {
            // the one field that is in none of the maker's words (an email for a waiting list of names) has no phrase
            holds(`field ${k.id}.${f.id}`, f, text, problems, f.mayHave === true && f.id === 'email');
            for (const w of f.choices ?? []) if (!cslug(text).includes(cslug(w))) problems.push(`field ${k.id}.${f.id}: the word "${w}" is not in the maker's words`);
          }
        }
        for (const a of e.actions ?? []) {
          holds(`action ${a.id}`, a, text, problems);
          for (const p of a.inputs) holds(`action ${a.id} input ${p.id}`, p, text, problems);
          for (const p of a.outputs) {
            holds(`action ${a.id} answer ${p.id}`, p, text, problems);
            for (const it of p.items ?? []) holds(`action ${a.id} answer ${p.id}.${it.id}`, it, text, problems);
          }
        }
        for (const role of [...Object.values(e.club?.roles ?? {}), ...Object.values(e.teams?.roles ?? {})]) if (!fold(text).includes(fold(String(role)))) problems.push(`the role "${role}" is not in the maker's words`);
        expect(problems).toEqual([]);
      });
    }
  }
  it('the phrase the maker uses for a number on the home page is not looked for: numbers are found by what they come to', () => {
    for (const folder of folders) {
      const e = JSON.parse(readFileSync(join(BRIEFS_DIR, folder, 'expect.json'), 'utf8'));
      for (const n of e.numbers ?? []) expect(n.names).toBeUndefined();
    }
  });
});

describe('names the judge reads', () => {
  const base = { version: 1, start: { command: 'x', port: 'P', data: 'D' } } as any;
  const food = () => loadExpect(join(HERE, 'briefs/07-food-bank/expect.json'));
  const stock = (fields: Record<string, string>) => ({ ...base, things: { stock: { list: { path: '/l' }, add: { path: '/a' }, one: { path: '/o/{id}', change: 'PATCH' }, fields }, deliveries: { list: { path: '/l2' }, add: { path: '/a2' }, one: { path: '/o2/{id}', change: 'PATCH' }, fields: { 'which stock item came': 'i', 'who it came from': 'f', 'the day it arrived': 'd', kilos: 'k', 'put away': 'pa' } } } });
  const maker = { 'what it is': 'name', 'what sort of thing it is': 'group', 'how many we have': 'quantity', 'best-before date': 'bb', photo: 'p', notes: 'n' };
  it("the maker's own words for every field of a kind bind them all", () => {
    expect(bind(food(), stock(maker)).problems).toEqual([]);
  });
  it('one name that matches nothing and one field without a name: still a failure, said plainly, not guessed', () => {
    const { 'what it is': _gone, ...rest } = maker;
    const r = bind(food(), stock({ ...rest, blurb: 'name' }));
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/your name "blurb" matches none of the maker's words/);
    expect(r.problems[0]).toMatch(/field "name" has no name/);
    expect(r.bound.get('stock')!.missing).toEqual(['name']);
    expect([...r.bound.get('stock')!.fields.keys()]).not.toContain('name');
  });
  it('a long name goes to the field it fits best, never to the first that holds a spelling of it', () => {
    const e = loadExpect(join(HERE, 'briefs/08-choir-rota/expect.json'));
    const one = { path: '/o/{id}', change: 'PATCH' };
    const r = bind(e, { ...base, things: { singers: { list: { path: '/l' }, add: { path: '/a' }, one, fields: { name: 'n', voice: 'v', 'phone number': 'p' } }, rehearsals: { list: { path: '/l' }, add: { path: '/a' }, one, fields: { 'the date': 'd', where: 'w', 'how many people came along': 'att' } }, jobs: { list: { path: '/l' }, add: { path: '/a' }, one, fields: { 'which rehearsal': 'r', 'which singer': 's', 'what job': 'j', done: 'dn' } } } });
    expect(r.problems).toEqual([]);
    const rehearsals = r.bound.get('rehearsals')!;
    expect(rehearsals.fields.get('attended')!.key).toBe('att');
    expect(r.bound.get('duties')!.fields.get('rehearsal')!.key).toBe('r');
    expect(r.bound.get('duties')!.fields.get('singer')!.key).toBe('s');
  });
});

describe('judge.json: nothing is needed that builders are not told to declare', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)));
  const acceptance = readFileSync(join(dir, 'ACCEPTANCE.md'), 'utf8');
  const folders = readdirSync(join(dir, 'briefs'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  /** What a plan needs from judge.json for its lines, and where the builder is told to give it: a field is something the maker says a row holds (its quotes are in the words, checked above), anything else is a part of judge.json that ACCEPTANCE.md describes. */
  function needs(e: any): { what: string; told: string | null }[] {
    const out: { what: string; told: string | null }[] = [];
    const described = (what: string, token: string) => out.push({ what, told: acceptance.includes(token) ? token : null });
    described('how to start the app', 'start.command');
    if (e.accounts !== 'none') described('how to make an account and sign in', '`accounts`');
    if (e.numbers?.length) described('the home page', '### `home`');
    for (const k of e.kinds) {
      described(`things.${k.id} (list, add)`, '### `things`');
      for (const op of k.ops ?? []) described(`things.${k.id}.one.${op}`, `\`${op}\``);
      if (k.teamed || e.teams?.kinds.includes(k.id)) described(`things.${k.id}.teamKey`, 'teamKey');
      for (const f of k.fields) {
        if (f.mayHave) continue;
        // a field the app makes itself and only reads back is told in one place: an article's address
        if (f.readOnly) described(`things.${k.id}.fields.${f.id} (made by the app, read back)`, 'A field the app makes itself');
        else out.push({ what: `things.${k.id}.fields.${f.id}`, told: f.said && f.said.length > 0 ? 'quoted from the maker' : null });
      }
    }
    for (const a of e.actions ?? []) described(`actions.${a.id}`, '### `actions`');
    if (e.club) for (const t of ['`accounts.grant`', '`payments`', 'secretEnv']) described(`club: ${t}`, t);
    if (e.teams) for (const t of ['`teams`', '`create`', '`invite`', '`remove`', 'teamKey']) described(`teams: ${t}`, t);
    if (e.kb) for (const t of ['"article":', '"search":', '"category":']) described(`site ${t}`, t);
    if (e.booking) for (const t of ['`slots`', 'one.remove']) described(`booking: ${t}`, t);
    return out;
  }
  for (const folder of folders) {
    for (const file of ['expect.json', 'expect-change.json']) {
      it(`${folder}: ${file}`, () => {
        const e = JSON.parse(readFileSync(join(dir, 'briefs', folder, file), 'utf8'));
        const untold = needs(e).filter((n) => n.told === null).map((n) => n.what);
        expect(untold, 'needed from judge.json, and neither described in ACCEPTANCE.md nor quoted from the maker').toEqual([]);
      });
    }
  }
  it('the sentence about a field the app makes itself is in ACCEPTANCE.md, and no other field of a plan is only read back and needed', () => {
    expect(acceptance).toContain('A field the app makes itself');
    const readBack: string[] = [];
    for (const folder of folders) {
      const e = JSON.parse(readFileSync(join(dir, 'briefs', folder, 'expect.json'), 'utf8'));
      for (const k of e.kinds) for (const f of k.fields) if (f.readOnly && !f.mayHave) readBack.push(`${folder}.${k.id}.${f.id}`);
    }
    expect(readBack).toEqual(['19-help-centre.articles.slug']);
  });
  it('who has paid is a field the app may have, never a needed one', () => {
    for (const file of ['expect.json', 'expect-change.json']) {
      const e = JSON.parse(readFileSync(join(dir, 'briefs/17-rowing-club', file), 'utf8'));
      const paid = e.kinds.find((k: any) => k.id === e.club.details).fields.find((f: any) => f.id === e.club.paid);
      expect(paid.mayHave).toBe(true);
    }
  });
});
