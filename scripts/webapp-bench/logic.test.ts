// The judge on the four briefs of their own logic, without any builder: a small app written from rules.ts (fixtures/rules-app) passes every line of its brief, in both
// the first build and the change request, and one deliberate mistake at a time makes the judge fail exactly the line about it. Uses port 4768 (`node --test scripts/webapp-bench/`).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from './unit.ts';
import { judge } from './judge.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'fixtures/rules-app/server.ts');
const PORT = 4768;
const root = mkdtempSync(join(tmpdir(), 'hydor-versus-logic-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Extra = Record<string, string>;

const judgeJson = (brief: string, send: 'multipart' | 'text', expectFile: string, extra: Extra) => {
  const start = { command: `node ${SERVER}`, port: 'PORT', data: 'DATA_DIR', env: { BRIEF: brief, EXPECT_FILE: expectFile, ...extra } };
  switch (brief) {
    case '13':
      return { version: 1, start, actions: { 'work out': { path: '/api/dough', input: { loaves: 'loaves', 'loaf weight': 'loafWeight', water: 'water', salt: 'salt', starter: 'starter' }, output: { flour: 'flour', water: 'water', salt: 'salt', starter: 'starter', 'total dough': 'total' } } } };
    case '14':
      return { version: 1, start, actions: { 'sum up': { path: '/api/takings', send, input: { file: 'file' }, output: { 'total takings': 'takings', 'candles sold': 'sold', 'best seller': 'best', refunds: 'refunds', 'skipped lines': 'skipped', 'takings for each day': { path: 'days', item: { date: 'day', takings: 'takings' } }, 'average a day': 'averageDay' } } } };
    case '15':
      return { version: 1, start, actions: { play: { path: '/api/play', input: { name: 'name', answers: 'answers', seconds: 'seconds' }, output: { right: 'right', points: 'points' } } }, things: { board: { list: { path: '/api/board', rows: 'rows' }, fields: { name: 'name', points: 'points', seconds: 'seconds' } } } };
    default:
      return { version: 1, start, actions: { plan: { path: '/api/calendar', input: { 'last frost': 'lastFrost', crops: 'crops' }, output: { jobs: { path: 'jobs', item: { crop: 'crop', date: 'when' } } } } } };
  }
};

async function run(folder: string, brief: string, opts: { spoil?: string; change?: boolean; send?: 'multipart' | 'text'; extra?: Extra } = {}) {
  const app = mkdtempSync(join(root, 'app-'));
  const file = join(HERE, 'briefs', folder, opts.change ? 'expect-change.json' : 'expect.json');
  writeFileSync(join(app, 'judge.json'), JSON.stringify(judgeJson(brief, opts.send ?? 'multipart', file, { ...(opts.spoil ? { SPOIL: opts.spoil } : {}), ...opts.extra })));
  return judge({ app, brief: join(HERE, 'briefs', folder), port: PORT, change: opts.change === true });
}

const failed = (r: Awaited<ReturnType<typeof run>>) => r.lines.filter((l) => l.status !== 'pass').map((l) => l.id);
const says = (r: Awaited<ReturnType<typeof run>>, id: string) => r.lines.find((l) => l.id === id)?.say ?? '';

const CHANGES: Record<string, Extra> = { '13': { LOAVES_MAX: '120', WEIGHT_MIN: '150' }, '14': { AVERAGE: '1' }, '15': { BOARD_SIZE: '10', UNDER: '60' }, '16': { PUMPKINS: '1' } };
const BRIEFS: [string, string][] = [['13-dough-sums', '13'], ['14-market-takings', '14'], ['15-times-tables-race', '15'], ['16-seed-calendar', '16']];

describe('a correct app for each brief of its own logic passes every line', () => {
  for (const [folder, id] of BRIEFS) {
    it(`${folder}: the first build`, async () => {
      const r = await run(folder, id);
      expect(failed(r), r.lines.map((l) => `${l.id}: ${l.say}`).join('\n')).toEqual([]);
      expect(r.score.all).toBe(true);
    }, 90_000);
    it(`${folder}: the change request`, async () => {
      const r = await run(folder, id, { change: true, extra: CHANGES[id] });
      expect(failed(r), r.lines.map((l) => `${l.id}: ${l.say}`).join('\n')).toEqual([]);
    }, 90_000);
  }
  it('14: a file sent as plain text is read the same way as one sent as a form', async () => {
    const r = await run('14-market-takings', '14', { send: 'text' });
    expect(failed(r)).toEqual([]);
  }, 90_000);
});

describe('one mistake at a time: the judge fails the line about it and no other', () => {
  const cases: [string, string, string, string[]][] = [
    ['13-dough-sums', '13', 'starter-extra', ['rule-cases', 'rule-edges']],
    ['13-dough-sums', '13', 'no-limits', ['bad-input-refused']],
    ['14-market-takings', '14', 'refund-added', ['rule-cases']],
    ['14-market-takings', '14', 'no-quotes', ['rule-edges']],
    ['15-times-tables-race', '15', 'bonus-not-stacked', ['rule-cases', 'rule-edges', 'board-rules']],
    ['15-times-tables-race', '15', 'board-every-play', ['board-rules']],
    ['16-seed-calendar', '16', 'not-saturdays', ['rule-cases', 'rule-edges']],
  ];
  for (const [folder, id, spoil, lines] of cases) {
    it(`${folder} with ${spoil}`, async () => {
      const r = await run(folder, id, { spoil });
      expect(failed(r), r.lines.map((l) => `${l.id}: ${l.say}`).join('\n')).toEqual(lines);
    }, 90_000);
  }
  it('names what was wrong in a sentence', async () => {
    const r = await run('13-dough-sums', '13', { spoil: 'no-limits' });
    expect(says(r, 'bad-input-refused')).toMatch(/no loaves|was given an answer/);
  }, 90_000);
});

describe('one disagreement about where something is costs one line', () => {
  async function without(folder: string, brief: string, change: (j: any) => void) {
    const app = mkdtempSync(join(root, 'gap-'));
    const file = join(HERE, 'briefs', folder, 'expect.json');
    const j: any = judgeJson(brief, 'multipart', file, {});
    change(j);
    writeFileSync(join(app, 'judge.json'), JSON.stringify(j));
    return judge({ app, brief: join(HERE, 'briefs', folder), port: PORT });
  }
  it('a key for one optional input missing: judge-json fails, the cases that could be sent are judged, and nothing else fails', async () => {
    const r = await without('13-dough-sums', '13', (j) => delete j.actions['work out'].input.salt);
    expect(failed(r)).toEqual(['judge-json']);
    expect(r.lines.find((l) => l.id === 'rule-edges')?.say).toMatch(/not tried/);
    expect(r.score.total).toBe(r.lines.length);
  });
  it('no key for the one answer that all the cases are about: those lines are not checked, left out of the count, and judge-json fails once', async () => {
    const r = await without('13-dough-sums', '13', (j) => {
      j.actions['work out'].output = {};
    });
    expect(r.lines.filter((l) => l.status === 'fail').map((l) => l.id)).toEqual(['judge-json']);
    expect(r.lines.filter((l) => l.status === 'not-checked').map((l) => l.id)).toEqual(['rule-cases', 'rule-edges']);
    expect(r.score.total).toBe(r.lines.length - 2);
    expect(r.score.passed).toBe(r.score.total - 1);
    expect(says(r, 'rule-cases')).toMatch(/^not checked, because/);
  });
  it('no way to play for the score board: the board line is not checked', async () => {
    const r = await without('15-times-tables-race', '15', (j) => delete j.actions.play.input.seconds);
    expect(r.lines.find((l) => l.id === 'board-rules')?.status).toBe('not-checked');
    expect(r.lines.filter((l) => l.status === 'fail').map((l) => l.id)).toEqual(['judge-json']);
  });
});

describe('a missing judge.json is said once, and nothing else is guessed', () => {
  it('fails judge-json and cannot run the rest', async () => {
    const app = mkdtempSync(join(root, 'empty-'));
    const r = await judge({ app, brief: join(HERE, 'briefs/13-dough-sums'), port: PORT });
    expect(r.lines[0]).toMatchObject({ id: 'judge-json', status: 'fail' });
    expect(r.lines.slice(1).every((l) => l.status === 'could-not-run')).toBe(true);
    expect(r.score.passed).toBe(0);
  });
});
