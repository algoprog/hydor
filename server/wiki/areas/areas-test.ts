// Checks a wiki's areas with a stand-in helper and temporary wikis: the first organisation of 15 articles, every rule
// (each article placed, Other, two levels, areas of two or more, one area per two articles, unique stable ids, aliases
// on rename and merge, the churn limit), the triggers and the 7-day spacing, the fit check overruling the proposal,
// placement through the digest's plan step, hubs (facts that cite nothing, cite outside the area or are not in their
// article dropped; links made by the code; lengths capped; written again only when stale; the hourly cap), folds and
// merges (the revise path, the fallback, redirects, wiki_read following one, wiki_check accepting them, snapshots kept),
// the index grouped by area (flat under 10 articles), wiki_write refusing hubs, and the route.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/areas/areas-test.ts && DATA_DIR=/tmp/hydor-test-areas node dist/dev/areas-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { kvSet, openDb } from '../../db.ts';
import type { Deps, RunCtx } from '../../features/types.ts';
import { createSpace } from '../../spaces/index.ts';
import { checkWiki } from '../core.ts';
import { wikiDigest } from '../digest/index.ts';
import { digestText } from '../digest/digest.ts';
import { snapshotsOf } from '../digest/history.ts';
import { PLAN_SYSTEM, WRITE_SYSTEM, type DigestAsk } from '../digest/plan.ts';
import { updatesOf } from '../digest/store.ts';
import { composeArticle, indexBlock, writeIndex } from '../digest/write.ts';
import { wikiRoot } from '../roots.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { wikiTools } from '../tools.ts';
import { areaArticles, membersByArea, type AreaArticle } from './articles.ts';
import { checkHub, FACT_MAX, HUB_SYSTEM, hubBudget, hubPlans, hubStale, OVERVIEW_MAX, writeHub } from './hubs.ts';
import { MERGE_SYSTEM, runMerges } from './merge.ts';
import { readFollowing } from './redirects.ts';
import { emptyRegistry, hubPath, loadRegistry, OTHER, parseRegistry, registryText, updateRegistry, type Area, type Registry } from './registry.ts';
import { checkProposal, FIT_SYSTEM, OTHER_RETRY_MS, PROPOSE_SYSTEM, reorganiseDue, reorganiseWiki, settle, SPACING_MS } from './reorganise.ts';
import { PLACE_SYSTEM, placeArticles, refreshHubs, setAreasHelper, tendAreas } from './tend.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-areas-')));
const db = openDb(path.join(temp, 'test.db'));
kvSet(db, 'memory.meaning', '0');
setWikiSettings(db, { enabled: true, hubPath: path.join(temp, 'hub'), projectWikis: 'hub' });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const folder = path.join(temp, 'engine');
fs.mkdirSync(folder);
const space = createSpace(db, { name: 'Search engine', folder });
const root = wikiRoot(db, space.id, { create: true })!;
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const put = (r: string, rel: string, title: string, summary: string, body: string, extra = '') => {
  fs.mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
  fs.writeFileSync(path.join(r, rel), `---\ntitle: ${JSON.stringify(title)}\nsummary: ${JSON.stringify(summary)}\n${extra}updated: 2026-11-10\n---\n\n# ${title}\n\n${body}\n`);
};
const areasIn = (rel: string) => /^areas: \[(.*)\]$/m.exec(read(rel))?.[1].split(', ') ?? [];

// ---- the wiki: fifteen articles on crawling, ranking and releases, an event article or two, and two that fit nothing
const ARTICLES: [string, string, string, string][] = [
  ['wiki/crawl-scheduler.md', 'Crawl scheduler', 'How hosts are scheduled', 'The crawl scheduler picks 4,000 hosts an hour and keeps a politeness delay of 2 seconds per host.\n\n## Queues\n\nOne queue per host.'],
  ['wiki/crawl-dedup.md', 'Crawl deduplication', 'Near-duplicate pruning', 'Near-duplicate pages are pruned with SimHash at a distance of 3 bits, before they reach the index.'],
  ['wiki/crawl-memory.md', 'Crawl memory guard', 'When the crawler stops taking hosts', 'The crawler stops taking hosts when memory passes 85 percent, and starts again under 70 percent.'],
  ['wiki/crawl-31-memory.md', 'Memory guard thresholds for crawl 31', 'What crawl 31 changed', 'During crawl 31 the guard was raised to 90 percent for one night, then set back.'],
  ['wiki/robots.md', 'Robots rules', 'robots.txt handling', 'The crawler obeys robots.txt and caches it for a day.'],
  ['wiki/bm25.md', 'BM25 first stage', 'The first ranking stage', 'The first stage scores with BM25 with k1 of 1.2 and b of 0.75.'],
  ['wiki/reranker.md', 'Cross-encoder reranker', 'The second ranking stage', 'The reranker reads the top 100 passages with a MiniLM cross-encoder.'],
  ['wiki/ranking-eval.md', 'Ranking evaluation', 'How ranking is measured', 'Ranking is measured with nDCG at 10 on 500 queries.'],
  ['wiki/fusion.md', 'Rank fusion', 'Joining the word and meaning lists', 'Words and meaning are fused with reciprocal rank fusion, k of 60.'],
  ['wiki/ranking-dup.md', 'Reciprocal rank fusion settings', 'RRF settings', 'RRF uses k = 60 for both lists, as the fusion article says.'],
  ['wiki/release-process.md', 'Release process', 'How a version ships', 'Every release is tagged and built by CI, then shipped to the live server.'],
  ['wiki/sdk-release.md', 'SDK release to PyPI and npm', 'Publishing the SDK', 'The SDK is published to PyPI and npm from one workflow.'],
  ['wiki/editors-0-34.md', 'Picture editors rebuild in 0.34.0', 'The 0.34.0 editors release', 'Version 0.34.0 rebuilt the picture editor and added a sound editor.'],
  ['wiki/office-plants.md', 'Office plants', 'Watering', 'The office ficus is watered on Mondays.'],
  ['wiki/team-lunch.md', 'Team lunch', 'Fridays', 'Lunch is at noon on Fridays.'],
];
for (const [rel, title, summary, body] of ARTICLES) put(root, rel, title, summary, body);
await writeIndex(root);

// ---- the stand-in helper: answers by the question's system prompt
const asked: { system: string; prompt: string; strong?: boolean }[] = [];
let proposal: unknown = {};
let fit: (prompt: string) => unknown = (prompt) => ({ articles: [...prompt.matchAll(/^- (wiki\/\S+) · .* · areas: (.*)$/gm)].map((m) => ({ path: m[1], fits: m[2].split(', '), best: m[2].split(', ')[0] })) });
let hub: (prompt: string) => unknown = (prompt) => ({ overview: 'An area.', facts: [], order: [...prompt.matchAll(/^Article (wiki\/\S+) /gm)].map((m) => m[1]) });
let merge: (prompt: string) => unknown = () => ({});
let place: (prompt: string) => unknown = () => ({ articles: [] });
let plan: unknown = { update: [], create: [], notes: [] };
const ask: DigestAsk = async (q) => {
  asked.push(q);
  if (q.system === PROPOSE_SYSTEM) return proposal;
  if (q.system === FIT_SYSTEM) return fit(q.prompt);
  if (q.system === HUB_SYSTEM) return hub(q.prompt);
  if (q.system === MERGE_SYSTEM) return merge(q.prompt);
  if (q.system === PLACE_SYSTEM) return place(q.prompt);
  if (q.system === PLAN_SYSTEM) return plan;
  if (q.system === WRITE_SYSTEM) return { articles: [...q.prompt.matchAll(/^New article (wiki\/\S+), titled "([^"]+)"/gm)].map((m) => ({ path: m[1], summary: `About ${m[2]}`, content: `# ${m[2]}\n\nWhat the document says about ${m[2]}, at some length.` })) };
  throw new Error(`unexpected question: ${q.system.slice(0, 60)}`);
};
const at = Date.parse('2026-11-17T09:00:00Z');

test('the first organisation of 15 articles: every article placed, the rules held, the fit check overruling the proposal', async () => {
  assert.equal(reorganiseDue(null, areaArticles(root), at), 'first organisation');
  proposal = {
    areas: [
      { key: 'crawling', name: 'Crawling', about: 'How the crawler fetches, schedules and prunes the web' },
      { key: 'ranking', name: 'Ranking', about: 'How results are scored, fused and evaluated' },
      // A sub-area of an area of 12 or fewer: top-level instead.
      { key: 'fusion', name: 'Rank fusion', about: 'Joining word and meaning rankings', parent: 'ranking' },
      { key: 'releases', name: 'Releases', about: 'How versions are built and shipped' },
      // One article only: it dissolves into Other.
      { key: 'social', name: 'Social', about: 'Team life' },
      // A third level, and empty: gone.
      { key: 'deep', name: 'Deep', about: 'A third level', parent: 'fusion' },
      // The same name again: it joins Crawling.
      { key: 'crawl2', name: 'crawling', about: 'twice' },
      { key: 'other', name: 'Other', about: 'built in' },
    ],
    articles: [
      { path: 'wiki/crawl-scheduler.md', areas: ['crawling'] },
      { path: 'wiki/crawl-dedup.md', areas: ['crawl2'] },
      { path: 'wiki/crawl-memory.md', areas: ['crawling'] },
      { path: 'wiki/crawl-31-memory.md', areas: ['crawling'] },
      // Misplaced: the fit check moves it.
      { path: 'wiki/robots.md', areas: ['releases'] },
      { path: 'wiki/bm25.md', areas: ['ranking'] },
      { path: 'wiki/reranker.md', areas: ['ranking', 'nonsense'] },
      { path: 'wiki/ranking-eval.md', areas: ['ranking'] },
      { path: 'wiki/fusion.md', areas: ['fusion'] },
      { path: 'wiki/ranking-dup.md', areas: ['fusion', 'ranking', 'releases'] },
      { path: 'wiki/release-process.md', areas: ['releases'] },
      { path: 'wiki/sdk-release.md', areas: ['releases'] },
      { path: 'wiki/editors-0-34.md', areas: ['releases'] },
      { path: 'wiki/team-lunch.md', areas: ['social'] },
      // wiki/office-plants.md is left out, as Haiku did in the dry run.
      { path: 'wiki/not-there.md', areas: ['crawling'] },
    ],
    folds: [
      { from: 'wiki/crawl-31-memory.md', into: 'wiki/crawl-memory.md', why: 'an event of the memory guard' },
      { from: 'wiki/editors-0-34.md', into: null, title: 'Picture and video editors', why: 'a release, not a topic' },
      { from: 'wiki/not-there.md', into: 'wiki/robots.md' },
    ],
    duplicates: [{ paths: ['wiki/fusion.md', 'wiki/ranking-dup.md'], keep: 'wiki/fusion.md', why: 'the same settings' }],
  };
  const defaultFit = fit;
  fit = (prompt) => {
    const a = defaultFit(prompt) as { articles: { path: string; fits: string[]; best: string }[] };
    for (const x of a.articles) if (x.path === 'wiki/robots.md') Object.assign(x, { fits: [], best: 'crawling' });
    return a;
  };
  asked.length = 0;
  const r = await reorganiseWiki(root, { db, space: space.id, propose: ask, check: ask, project: { name: 'Search engine' }, now: at });
  fit = defaultFit;
  assert.equal(r.ran, true, r.error);
  assert.equal(r.first, true);
  assert.equal(asked.filter((q) => q.system === FIT_SYSTEM).length, 1, 'one fit-check call for 15 articles');
  assert.ok(asked.find((q) => q.system === FIT_SYSTEM)!.prompt.includes('wiki/office-plants.md'), 'the fit check sees every article the first time');
  const reg = loadRegistry(root)!;
  assert.deepEqual(
    reg.areas.map((a) => [a.id, a.name, a.parent]),
    [
      ['crawling', 'Crawling', null],
      ['ranking', 'Ranking', null],
      ['rank-fusion', 'Rank fusion', null],
      ['releases', 'Releases', null],
      ['other', 'Other', null],
    ],
  );
  // Every article is in an area: its front matter says so.
  for (const [rel] of ARTICLES) assert.ok(areasIn(rel).length >= 1, rel);
  assert.deepEqual(areasIn('wiki/robots.md'), ['crawling'], 'the fit check wins');
  assert.deepEqual(areasIn('wiki/crawl-dedup.md'), ['crawling'], 'a twin name joins the first');
  assert.deepEqual(areasIn('wiki/reranker.md'), ['ranking'], 'unknown keys dropped');
  assert.deepEqual(areasIn('wiki/ranking-dup.md'), ['rank-fusion', 'ranking'], 'two areas at most');
  assert.deepEqual(areasIn('wiki/office-plants.md'), [OTHER], 'left out: Other');
  assert.deepEqual(areasIn('wiki/team-lunch.md'), [OTHER], 'an area of one dissolves into Other');
  assert.equal(r.areas!.find((a) => a.id === OTHER)!.articles, 2);
  assert.match(r.summary!, /^Organised 15 articles into 4 areas: Crawling, Ranking, Rank fusion, Releases/);
  assert.match(read('log.md'), /- 2026-11-17 · reorganised: organised 15 articles into 4 areas/);
  assert.equal(reg.lastReorganisedAt, new Date(at).toISOString());
  assert.equal(Object.keys(reg.articlesAtReorganise).length, 15);
  assert.equal(reg.history.filter((h) => h.op === 'add').length, 4);
  assert.deepEqual(
    reg.queue.map((q) => [q.kind, q.from, q.into, q.title ?? null]),
    [
      ['fold', ['wiki/crawl-31-memory.md'], 'wiki/crawl-memory.md', null],
      ['fold', ['wiki/editors-0-34.md'], null, 'Picture and video editors'],
      ['duplicate', ['wiki/ranking-dup.md'], 'wiki/fusion.md', null],
    ],
    'folds and duplicates between articles that are there',
  );
  const u = updatesOf(db, space.id)[0];
  assert.equal(u.path, 'areas:2026-11-17');
  assert.match(u.document, /^Organised 15 articles/);
  assert.equal(u.articles.length, 15);
  // The structure is hidden: the wiki tools never reach it.
  assert.ok(fs.existsSync(path.join(root, '.structure', 'areas.json')));
  assert.equal(reorganiseDue(loadRegistry(root), areaArticles(root), at + 86400_000), null, 'not again within 7 days');
});

test('the index is grouped by area once there are 10 articles, Other last, an article in two areas under both', () => {
  const index = read('index.md');
  const heads = [...index.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['Crawling', 'Ranking', 'Rank fusion', 'Releases', 'Other'], 'no hub yet: plain headings');
  assert.ok(index.includes('<!-- articles:start -->') && index.includes('<!-- articles:end -->'));
  assert.equal(index.split('(wiki/ranking-dup.md)').length - 1, 2, 'under both its areas');
  assert.match(index, /## Other\n\nNot yet placed in an area\n\n- \[Office plants\]/);
  assert.match(index, /## Crawling\n\nHow the crawler fetches, schedules and prunes the web\n\n- \[/);
  // A small wiki keeps the flat list, areas or not.
  const small = path.join(temp, 'small');
  fs.mkdirSync(small);
  for (const [rel, title, summary, body] of ARTICLES.slice(0, 5)) put(small, rel, title, summary, `${body}`, 'areas: [crawling]\n');
  fs.mkdirSync(path.join(small, '.structure'));
  const r = emptyRegistry(at);
  r.areas.unshift({ id: 'crawling', name: 'Crawling', about: '', parent: null, aliases: [], createdAt: '', updatedAt: '' });
  fs.writeFileSync(path.join(small, '.structure', 'areas.json'), registryText(r, at));
  const block = indexBlock(small);
  assert.ok(!block.includes('## '), block);
  assert.equal(block.split('\n').length, 5);
});

test('the registry: Other always there and last, two levels, unknown fields dropped', () => {
  const r = parseRegistry(JSON.stringify({ areas: [{ id: 'other' }, { id: 'a', name: 'A', parent: 'b' }, { id: 'b', name: 'B', parent: 'c' }, { id: 'c', name: 'C' }, { id: 'a', name: 'twice' }, { id: 'Bad Id', name: 'x' }], junk: 1 }))!;
  assert.deepEqual(
    r.areas.map((a) => [a.id, a.parent]),
    [
      ['a', null],
      ['b', 'c'],
      ['c', null],
      ['other', null],
    ],
  );
  assert.equal((r as unknown as { junk?: number }).junk, undefined);
  assert.equal(parseRegistry('not json'), null);
});

test('the rules: areas of two or more, one area per two articles, sub-areas only past 12, two levels, unique names and stable ids', () => {
  const area = (id: string, parent: string | null = null): Area => ({ id, name: id.toUpperCase(), about: '', parent, aliases: [], createdAt: '', updatedAt: '' });
  const order = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  // Four areas of three articles each in six articles: one too many, the smallest (the last among equals) goes.
  const s = settle({
    areas: [area('a'), area('b'), area('c'), area('d')],
    place: new Map([
      ['a1', ['a', 'b']],
      ['a2', ['a', 'b']],
      ['a3', ['c', 'd']],
      ['a4', ['c', 'd']],
      ['a5', ['a', 'c']],
      ['a6', ['b', 'd']],
    ]),
    current: new Map(),
    old: [],
    first: true,
    order,
  });
  assert.deepEqual(
    s.areas.map((a) => a.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(s.place.get('a3'), ['c']);
  // Sub-areas only inside an area of more than 12 articles; then they stay.
  const big = Array.from({ length: 16 }, (_, i) => `p${i}`);
  const sub = settle({
    areas: [area('top'), area('kid', 'top'), area('grand', 'kid')],
    place: new Map(big.map((p, i) => [p, i < 3 ? ['kid'] : i < 5 ? ['grand'] : ['top']])),
    current: new Map(),
    old: [],
    first: true,
    order: big,
  });
  assert.deepEqual(
    sub.areas.map((a) => [a.id, a.parent]),
    [
      ['top', null],
      ['kid', 'top'],
      ['grand', null],
    ],
    'a third level is made top-level; a sub-area of an area of 14 (with it) stays',
  );
  const small = settle({ areas: [area('top'), area('kid', 'top')], place: new Map(big.slice(0, 6).map((p, i) => [p, i < 2 ? ['kid'] : ['top']])), current: new Map(), old: [], first: true, order: big.slice(0, 6) });
  assert.deepEqual(
    small.areas.map((a) => [a.id, a.parent]),
    [
      ['top', null],
      ['kid', null],
    ],
  );
  // Ids: an area that goes on keeps its id; renamedFrom keeps it too; a new one never takes an id in use, a hub's or a redirect's.
  const registry = emptyRegistry(at);
  registry.areas.unshift(area('crawling'), area('ranking'));
  const arts = ['wiki/x.md', 'wiki/y.md'].map((p) => ({ path: p, title: p, summary: '', headings: [], raw: [], hash: '', updated: '', content: '', body: '' }));
  const p = checkProposal(
    {
      areas: [
        { key: 'crawling', name: 'Web crawling' },
        { key: 'search', name: 'Search', renamedFrom: 'ranking' },
        { key: 'new', name: 'Crawling' },
        { key: 'other2', name: 'Other things' },
      ],
    },
    { registry, articles: arts, taken: (id) => id === 'other-things', now: at },
  );
  assert.deepEqual(
    p.areas.map((a) => [a.id, a.name]),
    [
      ['crawling', 'Web crawling'],
      ['ranking', 'Search'],
      ['crawling-2', 'Crawling'],
      ['other-things-2', 'Other things'],
    ],
  );
});

test('the churn limit: but for the first pass, at most a third of the articles move, the unplaced first', () => {
  const area = (id: string): Area => ({ id, name: id, about: '', parent: null, aliases: [], createdAt: '', updatedAt: '' });
  const order = Array.from({ length: 15 }, (_, i) => `p${String(i).padStart(2, '0')}`);
  const current = new Map(order.map((p, i) => [p, i < 2 ? [OTHER] : i < 9 ? ['a'] : ['b']]));
  // The proposal moves nine: the two in Other to b, seven of a's to c.
  const place = new Map(order.map((p, i) => [p, i < 2 ? ['b'] : i < 9 ? ['c'] : ['b']]));
  const s = settle({ areas: [area('b'), area('c')], place, current, old: [area('a'), area('b')], first: false, order });
  assert.equal(s.waiting, 4, 'nine proposed, five moved');
  assert.deepEqual(s.place.get('p00'), ['b'], 'the unplaced move first');
  assert.deepEqual(s.place.get('p01'), ['b']);
  assert.equal(order.filter((p) => s.place.get(p)!.includes('c')).length, 3);
  assert.equal(order.filter((p) => s.place.get(p)!.includes('a')).length, 4, 'the rest stay, and their area with them');
  assert.ok(s.areas.some((a) => a.id === 'a'));
  const first = settle({ areas: [area('b'), area('c')], place, current, old: [], first: true, order });
  assert.equal(first.waiting, 0, 'the first organisation moves everything');
});

test('the triggers and the 7-day spacing', () => {
  const art = (i: number, raw: string[], hash = 'h'): AreaArticle => ({ path: `wiki/a${i}.md`, title: `A${i}`, summary: '', headings: [], raw, hash, updated: '', content: '', body: '' });
  assert.equal(reorganiseDue(null, Array.from({ length: 9 }, (_, i) => art(i, [])), at), null, 'nine articles: not yet');
  assert.equal(reorganiseDue(null, Array.from({ length: 10 }, (_, i) => art(i, [])), at), 'first organisation');
  const r: Registry = emptyRegistry(at);
  r.areas.unshift({ id: 'a', name: 'A', about: '', parent: null, aliases: [], createdAt: '', updatedAt: '' });
  r.lastReorganisedAt = new Date(at - SPACING_MS - 1000).toISOString();
  const settled = Array.from({ length: 20 }, (_, i) => art(i, ['a']));
  r.articlesAtReorganise = Object.fromEntries(settled.map((a) => [a.path, a.hash]));
  r.sizesAtReorganise = { a: 20 };
  assert.equal(reorganiseDue(r, settled, at), null, 'a big area that has not grown, nothing new');
  assert.match(reorganiseDue(r, [...settled, art(21, ['a'], 'x')], at)!, /A holds 21 articles/);
  const withOther = settled.map((a, i) => (i < 4 ? art(i, [OTHER]) : a));
  assert.match(reorganiseDue(r, withOther, at)!, /4 articles not placed/);
  r.sizesAtReorganise = { a: 20, other: 4 };
  assert.equal(reorganiseDue(r, withOther, at), null, 'Other as it was after the last pass: left there on purpose');
  r.lastReorganisedAt = new Date(at - OTHER_RETRY_MS - 1000).toISOString();
  assert.match(reorganiseDue(r, withOther, at)!, /4 articles not placed/, 'still big a month later: tried again');
  r.lastReorganisedAt = new Date(at - SPACING_MS - 1000).toISOString();
  assert.match(reorganiseDue(r, settled.map((a, i) => (i < 5 ? art(i, [OTHER]) : a)), at)!, /5 articles not placed/);
  r.sizesAtReorganise = { a: 20 };
  const changed = settled.map((a, i) => (i < 5 ? art(i, ['a'], 'new') : a));
  assert.match(reorganiseDue(r, changed, at)!, /5 of 20 articles added or changed/);
  r.lastReorganisedAt = new Date(at - SPACING_MS + 3600_000).toISOString();
  assert.equal(reorganiseDue(r, withOther, at), null, 'within 7 days: never');
});

test('hubs: facts must cite an article of the area that says them; the code renders the links and caps every length', async () => {
  const reg = loadRegistry(root)!;
  const plans = hubPlans(reg, membersByArea(areaArticles(root), reg));
  assert.deepEqual(
    plans.map((h) => h.area.id),
    ['crawling', 'ranking', 'rank-fusion', 'releases'],
    'every area of two or more, not Other',
  );
  const crawling = plans.find((h) => h.area.id === 'crawling')!;
  const answer = {
    overview: 'A'.repeat(500),
    facts: [
      { text: 'The crawl scheduler picks 4,000 hosts an hour.', from: 'wiki/crawl-scheduler.md' },
      { text: 'Robots files are cached for a day.', from: '' },
      { text: 'The crawler obeys robots.txt in this order:', from: 'wiki/robots.md' },
      { text: 'BM25 uses k1 of 1.2.', from: 'wiki/bm25.md' },
      { text: 'The crawler stops taking hosts at 95 percent memory.', from: 'wiki/crawl-memory.md' },
      { text: 'Memory sits in the plans and evidence folders of the wiki.', from: 'wiki/crawl-memory.md' },
      { text: `${'Near-duplicate pages are pruned with SimHash at a distance of 3 bits, before they reach the index; '.repeat(3)}`, from: 'wiki/crawl-dedup.md' },
      { text: 'During crawl 31 the guard was raised to 90 percent for one night.', from: 'wiki/crawl-31-memory.md' },
      { text: 'The crawler obeys robots.txt and caches it for a day.', from: 'wiki/robots.md' },
      { text: 'The crawler stops taking hosts when memory passes 85 percent.', from: 'wiki/crawl-memory.md' },
      { text: 'A politeness delay of 2 seconds per host is kept.', from: 'wiki/crawl-scheduler.md' },
      { text: 'The crawler starts again under 70 percent memory.', from: 'wiki/crawl-memory.md' },
    ],
    order: ['wiki/robots.md', 'wiki/crawl-scheduler.md', 'wiki/bm25.md'],
  };
  const c = checkHub(answer, crawling);
  assert.ok(c.overview.length <= OVERVIEW_MAX);
  assert.equal(c.facts.length, 6, 'six at most');
  assert.ok(c.facts.every((f) => f.text.length <= FACT_MAX));
  assert.deepEqual(
    c.dropped.map((d) => d.why),
    ['cites no article', 'not a statement', 'cites wiki/bm25.md, not an article of the area', 'not what wiki/crawl-memory.md says', 'not what wiki/crawl-memory.md says'],
  );
  assert.deepEqual(c.order.slice(0, 2), ['wiki/robots.md', 'wiki/crawl-scheduler.md'], 'the model gives the order; members only');
  assert.equal(c.order.length, 5, 'every member, the rest after');
  hub = () => answer;
  const w = await writeHub(null, root, ask, crawling, at);
  assert.ok(w.ok);
  const text = read(hubPath('crawling'));
  assert.match(text, /^---\nkind: hub\narea: crawling\ntitle: "Crawling"\nsummary: "How the crawler fetches, schedules and prunes the web"\nmembers:\n {2}- wiki\/robots\.md 2026-11-10 [0-9a-f]{8}\n/);
  assert.match(text, /## Key facts\n\n- The crawl scheduler picks 4,000 hosts an hour\. \(\[Crawl scheduler\]\(\.\.\/crawl-scheduler\.md\)\)\n/);
  assert.match(text, /## Articles\n\n- \[Robots rules\]\(\.\.\/robots\.md\) — robots\.txt handling\n- \[Crawl scheduler\]\(\.\.\/crawl-scheduler\.md\) — How hosts are scheduled\n/);
  assert.ok(!text.includes('95 percent') && !text.includes('BM25') && !text.includes('evidence folders'));
  assert.deepEqual(checkWiki(root).issues.filter((i) => i.path === hubPath('crawling')), [], 'its links all work');
  // A hub with no fact that holds keeps its overview and list.
  const ranking = plans.find((h) => h.area.id === 'ranking')!;
  hub = () => ({ overview: 'How results are ranked.', facts: [{ text: 'Ranking uses GPT-9 everywhere.', from: 'wiki/bm25.md' }] });
  await writeHub(null, root, ask, ranking, at);
  assert.ok(!read(hubPath('ranking')).includes('Key facts'));
  assert.match(read(hubPath('ranking')), /How results are ranked\.\n\n## Articles/);
});

test('hubs are written again only when stale, and at most six an hour in all', async () => {
  const plansNow = () => {
    const reg = loadRegistry(root)!;
    return hubPlans(reg, membersByArea(areaArticles(root), reg));
  };
  const crawling = () => plansNow().find((h) => h.area.id === 'crawling')!;
  assert.equal(hubStale(root, crawling(), at), null, 'just written');
  // What an article says changed: the hub waits until it has stood an hour.
  fs.appendFileSync(path.join(root, 'wiki/robots.md'), '\nIt also reads the sitemap.\n');
  assert.equal(hubStale(root, crawling(), Date.now()), null, 'debounced');
  assert.equal(hubStale(root, crawling(), Date.now() + 2 * 3600_000), 'changed');
  assert.equal(hubStale(root, plansNow().find((h) => h.area.id === 'releases')!, at), 'new');
  // An article came: written again at once.
  fs.writeFileSync(path.join(root, 'wiki/crawl-budget.md'), '---\ntitle: "Crawl budget"\nareas: [crawling]\nupdated: 2026-11-12\n---\n\n# Crawl budget\n\nEach host gets a budget of pages a day.\n');
  assert.equal(hubStale(root, crawling(), at), 'members');
  // The hour's budget: five spent, one left.
  kvSet(db, 'wiki.hubs.writes', JSON.stringify(Array.from({ length: 5 }, () => Date.now() - 60_000)));
  assert.equal(hubBudget(db), 1);
  hub = (prompt) => ({ overview: 'Refreshed.', facts: [], order: [...prompt.matchAll(/^Article (wiki\/\S+) /gm)].map((m) => m[1]) });
  assert.equal(await refreshHubs(db, ask, [root]), 1, 'one, the hour allows no more');
  assert.equal(hubBudget(db), 0);
  assert.equal(await refreshHubs(db, ask, [root]), 0);
  kvSet(db, 'wiki.hubs.writes', '[]');
  const wrote = await refreshHubs(db, ask, [root]);
  assert.ok(wrote >= 2, `the rest: ${wrote}`);
  assert.ok(read('index.md').includes('## [Crawling](wiki/areas/crawling.md)'), 'the index links the hubs');
  assert.ok(read(hubPath('crawling')).includes('wiki/crawl-budget.md'));
});

test('articles that name no area are placed by the helper in one call, else in Other', async () => {
  put(root, 'wiki/fetcher.md', 'HTTP fetcher', 'How pages are fetched', 'The fetcher uses HTTP/2 with a 10 second timeout.');
  put(root, 'wiki/vacation.md', 'Vacation days', 'Holidays', 'Everyone gets 25 days.');
  put(root, 'wiki/typo.md', 'Index shards', 'Shards', 'The index has 64 shards.', 'areas: [crawlingg, ranking, releases, crawling]\n');
  asked.length = 0;
  place = () => ({ articles: [{ path: 'wiki/fetcher.md', areas: ['crawling'] }, { path: 'wiki/vacation.md', areas: ['made-up'] }] });
  const wrote = await placeArticles(root, ask, loadRegistry(root)!);
  assert.equal(asked.filter((q) => q.system === PLACE_SYSTEM).length, 1);
  assert.ok(!asked[0].prompt.includes('wiki/typo.md'), 'an article with an area it can be in is not asked about');
  assert.equal(wrote, 3);
  assert.deepEqual(areasIn('wiki/fetcher.md'), ['crawling']);
  assert.deepEqual(areasIn('wiki/vacation.md'), [OTHER]);
  assert.deepEqual(areasIn('wiki/typo.md'), ['ranking', 'releases'], 'unknown ids dropped, two at most');
  // An id written plainly, without brackets, counts too, and a rewrite keeps it.
  put(root, 'wiki/plain.md', 'Plain areas', 'An agent wrote it', 'Written by hand.', 'areas: crawling\n');
  assert.equal(await placeArticles(root, ask, loadRegistry(root)!), 0, 'placed already: nothing to write');
  assert.deepEqual(areaArticles(root).find((a) => a.path === 'wiki/plain.md')!.raw, ['crawling']);
  assert.match(composeArticle(read('wiki/plain.md'), '# Plain areas\n\nRewritten.', { title: 'Plain areas', now: at }), /^areas: \[crawling\]$/m, 'a rewrite keeps it');
});

test('placement through the plan step: a new article goes in the area the plan names, else Other', async () => {
  plan = { update: [], create: [{ title: 'Crawl politeness', area: 'crawling' }, { title: 'Coffee machine', area: 'kitchen' }], notes: [] };
  asked.length = 0;
  const ok = await digestText(db, ask, { space: space.id, base: 'test', title: 'Notes on politeness', path: '/docs/polite.md', origin: 'test:polite', text: 'Politeness: wait two seconds per host. The coffee machine is on floor 2.', cut: false, kind: 'document', notes: false, hash: 'polite-1', now: () => at });
  assert.equal(ok, true);
  const prompt = asked.find((q) => q.system === PLAN_SYSTEM)!.prompt;
  assert.match(prompt, /Areas of the wiki \(id · name · what belongs in it\)[\s\S]*- crawling · Crawling · How the crawler/);
  assert.match(prompt, /- wiki\/\S+ · .* · in (Crawling|Ranking|Releases|Rank fusion|Other)/, 'the articles show their areas');
  assert.ok(!prompt.includes('wiki/areas/'), 'hubs are never digest targets');
  assert.deepEqual(areasIn('wiki/crawl-politeness.md'), ['crawling']);
  assert.deepEqual(areasIn('wiki/coffee-machine.md'), [OTHER]);
});

test('a later pass: a rename keeps the id, a merged area’s name becomes an alias, its hub a redirect; the history says so', async () => {
  // Rank fusion's hub, so that its removal leaves a redirect.
  hub = (prompt) => ({ overview: 'x', facts: [], order: [...prompt.matchAll(/^Article (wiki\/\S+) /gm)].map((m) => m[1]) });
  assert.ok(fs.existsSync(path.join(root, hubPath('rank-fusion'))));
  const before = areaArticles(root).length;
  proposal = {
    areas: [
      { key: 'crawling', name: 'Web crawling', about: 'How the crawler fetches the web' },
      { key: 'ranking', name: 'Ranking', about: 'How results are scored, fused and evaluated' },
      { key: 'releases', name: 'Releases', about: 'How versions are built and shipped' },
      { key: 'office', name: 'Office life', about: 'Plants, lunch and holidays' },
    ],
    articles: [
      { path: 'wiki/fusion.md', areas: ['ranking'] },
      { path: 'wiki/ranking-dup.md', areas: ['ranking'] },
      { path: 'wiki/office-plants.md', areas: ['office'] },
      { path: 'wiki/team-lunch.md', areas: ['office'] },
      { path: 'wiki/vacation.md', areas: ['office'] },
    ],
  };
  const r = await reorganiseWiki(root, { db, space: space.id, propose: ask, check: ask, now: at + 8 * 86400_000 });
  assert.equal(r.ran, true, r.error);
  assert.equal(r.first, false);
  const reg = loadRegistry(root)!;
  const crawling = reg.areas.find((a) => a.id === 'crawling')!;
  assert.equal(crawling.name, 'Web crawling');
  assert.deepEqual(crawling.aliases, ['Crawling'], 'a rename keeps the id and the old name');
  assert.equal(reg.areas.find((a) => a.id === 'rank-fusion'), undefined);
  assert.ok(reg.areas.find((a) => a.id === 'ranking')!.aliases.includes('Rank fusion'), 'a merged area’s name is an alias of the area that took its articles');
  assert.ok(reg.areas.some((a) => a.id === 'office-life'));
  assert.match(r.summary!, /Merged Rank fusion into Ranking; renamed Crawling to Web crawling; added Office life; moved 5 articles/);
  assert.deepEqual(
    reg.history.slice(-4).map((h) => h.op),
    ['merge', 'rename', 'add', 'move'],
  );
  const stub = read(hubPath('rank-fusion'));
  assert.match(stub, /^---\ntitle: "Rank fusion"\nredirect: wiki\/areas\/ranking\.md\n/);
  assert.equal(readFollowing(root, hubPath('rank-fusion')).path, hubPath('ranking'));
  assert.equal(areaArticles(root).length, before, 'no article lost');
  assert.match(read('log.md'), /reorganised: merged Rank fusion into Ranking; renamed Crawling to Web crawling/);
});

test('folds and merges: the revise path, the fallback, redirects, snapshots, two a day', async () => {
  const reg = loadRegistry(root)!;
  assert.equal(reg.queue.length, 3);
  // The first: the helper merges both texts, keeping all of them.
  merge = (prompt) => {
    if (prompt.includes('Picture editors')) return { content: '# Short' };
    return {
      summary: 'When the crawler stops taking hosts, and what crawl 31 changed',
      content: '# Crawl memory guard\n\nThe crawler stops taking hosts when memory passes 85 percent, and starts again under 70 percent.\n\n## Crawl 31\n\nDuring crawl 31 the guard was raised to 90 percent for one night, then set back.',
      removed: [],
    };
  };
  // The event article names a file of the code: the new topic article keeps that tie.
  fs.writeFileSync(path.join(root, 'wiki/editors-0-34.md'), read('wiki/editors-0-34.md').replace('updated: 2026-11-10', 'anchors:\n  - web/src/editors/picture.tsx\ncommit: abc1234def\nupdated: 2026-11-10'));
  const day1 = at + 9 * 86400_000;
  const done = await runMerges(root, ask, { db, space: space.id, now: day1 });
  assert.deepEqual(
    done.map((d) => [d.ok, d.how, d.into]),
    [
      [true, 'revised', 'wiki/crawl-memory.md'],
      [true, 'appended', 'wiki/picture-and-video-editors.md'],
    ],
    'two a day',
  );
  assert.equal(loadRegistry(root)!.queue.length, 1, 'the third waits');
  assert.match(read('wiki/crawl-memory.md'), /raised to 90 percent/);
  assert.match(read('wiki/crawl-31-memory.md'), /^---\ntitle: "Memory guard thresholds for crawl 31"\nredirect: wiki\/crawl-memory\.md\n/);
  assert.ok(snapshotsOf(root, 'wiki/crawl-31-memory.md').length >= 1 && snapshotsOf(root, 'wiki/crawl-memory.md').length >= 1, 'both texts kept');
  // Refused: the new topic article holds the event article's text as it was.
  const editors = read('wiki/picture-and-video-editors.md');
  assert.match(editors, /## From Picture editors rebuild in 0\.34\.0\n\nVersion 0\.34\.0 rebuilt the picture editor and added a sound editor\./);
  assert.match(editors, /^areas: \[releases\]$/m, 'the union of their areas');
  assert.match(editors, /^anchors:\n {2}- web\/src\/editors\/picture\.tsx\ncommit: abc1234def$/m, 'and their ties to the code');
  assert.match(read('log.md'), /merged \[Memory guard thresholds for crawl 31\]\(wiki\/crawl-31-memory\.md\) into \[Crawl memory guard\]\(wiki\/crawl-memory\.md\)/);
  assert.equal(updatesOf(db, space.id).filter((u) => u.path.startsWith('merge:')).length, 2);
  // Stubs are out of the index, the areas and the hubs, and the check accepts them.
  assert.ok(!read('index.md').includes('wiki/crawl-31-memory.md'));
  assert.ok(!areaArticles(root).some((a) => a.path === 'wiki/crawl-31-memory.md'));
  assert.deepEqual(checkWiki(root).issues.filter((i) => /crawl-31|editors-0-34/.test(i.path) || /crawl-31|editors-0-34/.test(i.detail)), []);
  assert.deepEqual(await runMerges(root, ask, { db, space: space.id, now: day1 + 3600_000 }), [], 'not a third that day');
  merge = () => ({ summary: 'RRF', content: '# Rank fusion\n\nWords and meaning are fused with reciprocal rank fusion, k of 60.\n\nRRF uses k = 60 for both lists.', removed: [{ text: 'as the fusion article says', why: 'said twice: kept once' }] });
  const next = await runMerges(root, ask, { db, space: space.id, now: day1 + 86400_000 + 1000 });
  assert.equal(next[0]?.ok, true, JSON.stringify(next));
  assert.match(read('wiki/ranking-dup.md'), /redirect: wiki\/fusion\.md/);
});

test('the wiki tools: wiki_read follows a redirect, wiki_write refuses hubs and stubs and keeps an article’s areas', async () => {
  const ctx = { key: 'test:areas', runId: 'areas', agent: 'claude', cwd: folder, deps: { db, broadcast() {} } } as unknown as RunCtx;
  const tool = (name: string) => wikiTools().find((t) => t.name === name)!;
  const call = async (name: string, a: Record<string, unknown>) => JSON.parse(String(await tool(name).run(a, ctx)));
  const r = await call('wiki_read', { path: 'wiki/crawl-31-memory.md' });
  assert.equal(r.path, 'wiki/crawl-memory.md');
  assert.equal(r.redirectedFrom, 'wiki/crawl-31-memory.md');
  assert.match(r.note, /was merged into wiki\/crawl-memory\.md/);
  await assert.rejects(call('wiki_write', { path: 'wiki/areas/crawling.md', content: '# Mine', expectedSha256: null }), /Hubs are kept by Hydor from their articles: change the articles instead/);
  await assert.rejects(call('wiki_write', { path: 'wiki/areas/new.md', content: '# Mine', expectedSha256: null }), /Hubs are kept by Hydor/);
  await assert.rejects(call('wiki_write', { path: 'wiki/crawl-31-memory.md', content: '# Back', expectedSha256: null }), /was merged into wiki\/crawl-memory\.md/);
  const robots = await call('wiki_read', { path: 'wiki/robots.md' });
  const w = await call('wiki_write', { path: 'wiki/robots.md', content: '# Robots rules\n\nThe crawler obeys robots.txt, caches it for a day and reads the sitemap.\n', expectedSha256: robots.sha256 });
  assert.deepEqual(areasIn('wiki/robots.md'), ['crawling'], 'its areas kept');
  assert.equal(w.sha256, (await call('wiki_read', { path: 'wiki/robots.md' })).sha256);
  assert.match(read('index.md'), /reads the sitemap/, 'the index follows the write');
  assert.equal((await call('wiki_check', {})).issues.filter((i: { detail: string }) => /redirect/i.test(i.detail)).length, 0);
});

test('the route: POST /api/projects/:id/wiki/reorganise runs a pass now and says what changed', async () => {
  setAreasHelper(() => ask);
  const app = Fastify();
  wikiDigest.routes!({ app, db, broadcast() {} } as unknown as Deps);
  proposal = {
    areas: [
      { key: 'crawling', name: 'Web crawling', about: 'How the crawler fetches the web' },
      { key: 'ranking', name: 'Ranking', about: 'How results are scored' },
      { key: 'releases', name: 'Releases', about: 'Shipping' },
      { key: 'office-life', name: 'Office life', about: 'Office' },
    ],
    articles: [{ path: 'wiki/coffee-machine.md', areas: ['office-life'] }],
  };
  hub = (prompt) => ({ overview: 'x', facts: [], order: [...prompt.matchAll(/^Article (wiki\/\S+) /gm)].map((m) => m[1]) });
  const res = await app.inject({ method: 'POST', url: `/api/projects/${space.id}/wiki/reorganise` });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.ran, true);
  assert.equal(body.first, false);
  assert.match(body.summary, /^Moved 1 article$/);
  assert.ok(Array.isArray(body.areas) && body.areas.some((a: { id: string; articles: number }) => a.id === 'office-life' && a.articles === 4));
  assert.equal((await app.inject({ method: 'POST', url: '/api/projects/nope/wiki/reorganise' })).statusCode, 404);
  fs.mkdirSync(path.join(temp, 'empty'));
  const empty = createSpace(db, { name: 'Empty', folder: path.join(temp, 'empty') });
  assert.equal((await app.inject({ method: 'POST', url: `/api/projects/${empty.id}/wiki/reorganise` })).statusCode, 409);
  await new Promise((r) => setTimeout(r, 200));
  setAreasHelper(null);
  // Nothing lost along the way: every article is in an area.
  const reg = loadRegistry(root)!;
  for (const a of areaArticles(root)) assert.ok(a.raw.length && a.raw.every((id) => reg.areas.some((x) => x.id === id)), a.path);
  await updateRegistry(root, () => false);
});

test('the ten-minute check: the first organisation only while nobody is writing, then hubs within the hour’s budget', async () => {
  const f2 = path.join(temp, 'second');
  fs.mkdirSync(f2);
  const second = createSpace(db, { name: 'Second', folder: f2 });
  const r2 = wikiRoot(db, second.id, { create: true })!;
  for (const [rel, title, summary, body] of ARTICLES.slice(0, 10)) put(r2, rel, title, summary, body);
  proposal = { areas: [{ key: 'crawl', name: 'Crawling', about: 'The crawler' }, { key: 'rank', name: 'Ranking', about: 'Scoring' }], articles: ARTICLES.slice(0, 10).map(([p], i) => ({ path: p, areas: [i < 5 ? 'crawl' : 'rank'] })) };
  kvSet(db, 'wiki.hubs.writes', '[]');
  const busy = await tendAreas(db, { ask, quiet: false });
  assert.equal(busy.reorganised, null, 'someone is writing to an agent: no pass');
  assert.equal(loadRegistry(r2), null);
  const quiet = await tendAreas(db, { ask, quiet: true });
  assert.equal(quiet.reorganised?.ran, true, JSON.stringify(quiet.reorganised));
  assert.match(quiet.reorganised!.summary!, /^Organised 10 articles into 2 areas: Crawling, Ranking/);
  assert.ok(quiet.hubs >= 2, `hubs written in the same check: ${quiet.hubs}`);
  assert.ok(fs.existsSync(path.join(r2, hubPath('crawling'))) && fs.existsSync(path.join(r2, hubPath('ranking'))));
  assert.match(fs.readFileSync(path.join(r2, 'index.md'), 'utf8'), /## \[Crawling\]\(wiki\/areas\/crawling\.md\)/);
  const again = await tendAreas(db, { ask, quiet: true });
  assert.equal(again.reorganised, null, 'not due again');
  assert.equal(again.hubs, 0, 'nothing stale');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
    break;
  }
}
fs.rmSync(temp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
