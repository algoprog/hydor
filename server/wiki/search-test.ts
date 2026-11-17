// Checks wiki_search (every mode and level, the area, path and include filters, other projects and who may be read,
// regular expression errors, caps, hidden and retired files, redirect stubs) and wiki_read's `section` and `lines`.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/search-test.ts
//   DATA_DIR=/tmp/hydor-test-wiki-search node dist/dev/search-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvSet, openDb } from '../db.ts';
import type { Deps, RunCtx, RunTool } from '../features/types.ts';
import { progress } from '../knowledge/indexer.ts';
import { docsOf } from '../knowledge/store.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { setEmbedderForTests } from '../memory/embed.ts';
import { createSpace, updateSpace } from '../spaces/index.ts';
import { ensureWikiKnowledge } from './knowledge/index.ts';
import { setWikiSettings } from './settings/settings.ts';
import { wikiTools } from './tools.ts';
import { headingsOf, linesOf, parseLines, readWikiPart, slugOf } from './sections.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-search-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

kvSet(db, 'memory.meaning', '0');
setWikiSettings(db, { enabled: true, hubPath: path.join(tmp, 'hub') });

const folderOf = (name: string) => {
  const f = path.join(tmp, name);
  fs.mkdirSync(path.join(f, '.git'), { recursive: true });
  fs.mkdirSync(path.join(f, 'wiki-memory', 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(f, 'wiki-memory', 'raw'), { recursive: true });
  fs.writeFileSync(path.join(f, 'AGENTS.md'), '# P\n\n- Wiki: `wiki-memory`\n');
  return f;
};
const alphaDir = folderOf('alpha-shop');
const betaDir = folderOf('beta-blog');
const gammaDir = folderOf('gamma-vault');
const deltaDir = folderOf('delta-lab');
const outsideDir = path.join(tmp, 'elsewhere');
fs.mkdirSync(outsideDir, { recursive: true });
const alpha = createSpace(db, { name: 'Alpha', folder: alphaDir });
const beta = createSpace(db, { name: 'Beta', folder: betaDir });
const gamma = createSpace(db, { name: 'Gamma', folder: gammaDir, memoryShared: false });
const delta = createSpace(db, { name: 'Delta', folder: deltaDir });

const put = (dir: string, rel: string, text: string) => {
  const f = path.join(dir, 'wiki-memory', ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const article = (title: string, summary: string, areas: string[] | null, body: string, extra = '') => `---\ntitle: ${title}\nsummary: ${summary}\n${areas ? `areas: [${areas.join(', ')}]\n` : ''}${extra}---\n\n${body}`;

// ---- Alpha's wiki: areas, hubs, articles, a redirect stub, a retired article, hidden files, sources and plans
put(
  alphaDir,
  '.structure/areas.json',
  JSON.stringify({
    version: 1,
    areas: [
      { id: 'search', name: 'Search and ranking', about: 'How results are found and ordered', parent: null, aliases: ['Retrieval', 'Ranking'], createdAt: 1, updatedAt: 1 },
      { id: 'search-eval', name: 'Evaluation', about: 'Measuring search quality', parent: 'search', aliases: [], createdAt: 1, updatedAt: 1 },
      { id: 'crawl', name: 'Crawling', about: 'Fetching pages for the index', parent: null, aliases: [], createdAt: 1, updatedAt: 1 },
      { id: 'other', name: 'Other', about: 'Other: not yet placed in an area', parent: null, aliases: [], createdAt: 1, updatedAt: 1 },
    ],
    history: [],
  }),
);
put(
  alphaDir,
  'wiki/search-ranking.md',
  article(
    'Search ranking',
    'How the ranker orders results',
    ['search'],
    `# Search ranking

The ranker orders candidates with a learned model.

## Overview

Candidates come from words and from meaning, fused by rank.

## Reranker

The reranker is a cross-encoder that rescores the top fifty candidates with xylophone features.

### Cross-encoder details

The cross-encoder reads the query and the passage together; its quirkiness is the zebrafish marker.

## Notes

\`\`\`sh
# not a heading: a comment in a code block
echo reranker
\`\`\`

## Evaluation

Quality is measured with nDCG.
`,
  ),
);
put(alphaDir, 'wiki/evaluation.md', article('Evaluation of ranking', 'nDCG and judgments', ['search-eval'], '# Evaluation of ranking\n\nJudgments are collected weekly; the metric is nDCG at ten with the reranker output.\n\n## Judgments\n\nPairwise judgments from the labelers.\n'));
put(alphaDir, 'wiki/crawl-31.md', article('Crawl 31', 'The thirty-first crawl', ['crawl'], '# Crawl 31\n\nThe crawl fetched pages at a polite rate; the throttle value was 4.\n\n## Results\n\nPages fetched: 1200.\n'));
put(alphaDir, 'wiki/crawl-32.md', article('Crawl 32', 'The thirty-second crawl', ['crawl', 'search'], '# Crawl 32\n\nThe crawl used the throttle value 6 and fetched many pages.\n'));
put(alphaDir, 'wiki/deploys.md', article('Deploys', 'How releases ship', null, '# Deploys\n\nReleases ship with a pipeline and a rollback script.\n'));
put(alphaDir, 'wiki/nested/deep.md', article('Deep note', 'A note in a folder', ['crawl'], '# Deep note\n\nThe nested note mentions the throttle value 9.\n'));
put(alphaDir, 'wiki/old-ranking.md', `---\ntitle: Old ranking\nredirect: wiki/search-ranking.md\n---\n\nMoved to [Search ranking](search-ranking.md). The reranker xylophone stub text.\n`);
put(alphaDir, 'wiki/retired.md', '---\ntitle: Retired\ndocument_status: retired\n---\n\n# Retired\n\nThe reranker xylophone retired text.\n');
put(alphaDir, 'wiki/areas/search.md', `---\nkind: hub\narea: search\ntitle: Search and ranking\nsummary: How results are found and ordered\nmembers: []\n---\n\n# Search and ranking\n\nThis hub covers the ranker, its reranker and evaluation.\n\n## Articles\n\n- [Search ranking](../search-ranking.md) — how the ranker orders results\n`);
put(alphaDir, 'wiki/areas/crawl.md', `---\nkind: hub\narea: crawl\ntitle: Crawling\nsummary: Fetching pages for the index\nmembers: []\n---\n\n# Crawling\n\nThis hub covers the crawls and their throttle values.\n`);
put(alphaDir, 'wiki/.hidden-note.md', '# hidden\n\nthrottle ghostword in a hidden file\n');
put(alphaDir, '.history/rebuilds/2026/wiki/ghost.md', '# ghost\n\nghostword throttle xylophone\n');
put(alphaDir, 'raw/source-1.md', '---\ntitle: Source 1\nsummary: a source\n---\n\nThe raw source says the quokka sampler was tuned.\n');
put(alphaDir, 'output/projects/launch/plan.md', '---\ntitle: Launch plan\nstatus: active\n---\n\n# Launch plan\n\nShip the quokka rollout on Friday.\n');
put(alphaDir, 'output/evidence/launch/done.md', '# Done\n\nThe quokka rollout shipped.\n');
put(alphaDir, 'index.md', '# Index\n\n- [Search ranking](wiki/search-ranking.md)\n');
// Many matching lines, and a long article, for caps.
put(alphaDir, 'wiki/many.md', article('Many lines', 'Lots of matches', ['other'], `# Many lines\n\n${Array.from({ length: 260 }, (_, i) => `line ${i} has the capword token`).join('\n')}\n`));
for (let i = 0; i < 40; i++) put(alphaDir, `wiki/bulk-${String(i).padStart(2, '0')}.md`, article(`Bulk article ${i}`, `${'A long summary of the bulk article about bulkword topics. '.repeat(2)}`, ['other'], `# Bulk ${i}\n\nThe bulkword appears here in article ${i}: ${'filler text about bulkword subjects and more. '.repeat(10)}\n`));

// ---- Beta's wiki: no areas; Gamma keeps itself to itself; Delta has wiki memory off
put(betaDir, 'wiki/blog.md', article('Blog engine', 'How the blog is built', null, '# Blog engine\n\nThe blog uses a static generator with a quokka mascot and rsync deploys.\n'));
put(gammaDir, 'wiki/vault.md', article('Vault keys', 'Rotating keys', null, '# Vault keys\n\nKey rotation uses the zebra marker quokka.\n'));
put(deltaDir, 'wiki/lab.md', article('Lab cluster', 'The lab', null, '# Lab cluster\n\nThe lab cluster runs quokka jobs.\n'));
updateSpace(db, delta.id, { wikiMemory: false });

const wikiOf: Record<string, string> = {};
for (const [dir, sp] of [[alphaDir, alpha], [betaDir, beta], [gammaDir, gamma]] as const) wikiOf[sp.id] = ensureWikiKnowledge(db, { root: path.join(dir, 'wiki-memory'), space: sp.id }).base;

const deps = { db, broadcast() {} } as unknown as Deps;
const ctxIn = (key: string, cwd: string, extra?: Record<string, unknown>): RunCtx => {
  if (extra) setSessionExtra(db, key, extra);
  return { runId: `r-${key}`, key, agent: 'claude', cwd, deps };
};
const here = ctxIn('claude:me', alphaDir, { space: alpha.id });
const outside = ctxIn('claude:out', outsideDir);
const tool = (ctx: RunCtx, name: string): RunTool => wikiTools().find((t) => t.name === name)!;
const call = async (ctx: RunCtx, name: string, a: Record<string, unknown>) => String(await tool(ctx, name).run(a, ctx));
const search = (a: Record<string, unknown>, ctx = here) => call(ctx, 'wiki_search', a);
const read = async (a: Record<string, unknown>, ctx = here) => JSON.parse(await call(ctx, 'wiki_read', a)) as Record<string, string>;

test('settle: the wiki is indexed', async () => {
  for (let i = 0; i < 400 && (progress.size || docsOf(db, wikiOf[alpha.id]).length < 50 || docsOf(db, wikiOf[beta.id]).length < 1 || docsOf(db, wikiOf[gamma.id]).length < 1); i++) await new Promise((r) => setTimeout(r, 25));
  assert.ok(docsOf(db, wikiOf[alpha.id]).length >= 50);
});

test('wiki switches are rechecked after a delayed semantic search', async () => {
  kvSet(db, 'memory.meaning', '1');
  try {
    // The other project's wiki may be disabled while the embedding call is in flight.
    setEmbedderForTests(async () => { updateSpace(db, beta.id, { wikiMemory: false }); return []; });
    assert.doesNotMatch(await search({ query: 'quokka', project: 'Beta', mode: 'hybrid' }), /wiki\/blog\.md/);
    updateSpace(db, beta.id, { wikiMemory: null });
    // The current project can also disable wiki access before the search returns.
    setEmbedderForTests(async () => { updateSpace(db, alpha.id, { wikiMemory: false }); return []; });
    assert.doesNotMatch(await search({ query: 'quokka', project: 'Beta', mode: 'hybrid' }), /wiki\/blog\.md/);
  } finally {
    setEmbedderForTests(null);
    kvSet(db, 'memory.meaning', '0');
    updateSpace(db, alpha.id, { wikiMemory: null });
    updateSpace(db, beta.id, { wikiMemory: null });
  }
});

// ---- wiki_read: section and lines
test('sections: headings leave out code fences, carry their ranges and their slugs', () => {
  const text = fs.readFileSync(path.join(alphaDir, 'wiki-memory/wiki/search-ranking.md'), 'utf8');
  const hs = headingsOf(linesOf(text));
  assert.deepEqual(
    hs.map((h) => [h.level, h.text]),
    [[1, 'Search ranking'], [2, 'Overview'], [2, 'Reranker'], [3, 'Cross-encoder details'], [2, 'Notes'], [2, 'Evaluation']],
    'the comment in the code block is not a heading',
  );
  const rer = hs.find((h) => h.text === 'Reranker')!;
  const cross = hs.find((h) => h.text === 'Cross-encoder details')!;
  assert.equal(rer.path, 'Search ranking › Reranker');
  assert.equal(cross.path, 'Search ranking › Reranker › Cross-encoder details');
  assert.equal(rer.end, cross.end, 'a section holds its subsections');
  assert.equal(slugOf('Cross-encoder details'), 'cross-encoder-details');
  assert.equal(slugOf('What `is` it? (a test)'), 'what-is-it-a-test');
});

test('wiki_read section: by text, by slug, by path, case aside, subsections included, with line numbers', async () => {
  for (const section of ['Reranker', 'reranker', '## Reranker', 'Search ranking › Reranker']) {
    const r = await read({ path: 'wiki/search-ranking.md', section });
    assert.match(r.content, /: ## Reranker/);
    assert.match(r.content, /cross-encoder that rescores/);
    assert.match(r.content, /zebrafish marker/, 'its subsection too');
    assert.ok(!/Quality is measured/.test(r.content) && !/Candidates come from/.test(r.content), section);
    assert.match(r.lines, /^\d+-\d+$/);
    assert.match(r.sha256, /^[a-f0-9]{64}$/);
  }
  const sub = await read({ path: 'wiki/search-ranking.md', section: 'cross-encoder-details' });
  assert.match(sub.content, /zebrafish/);
  assert.ok(!/rescores the top fifty/.test(sub.content), 'a subsection alone');
  const whole = await read({ path: 'wiki/search-ranking.md' });
  assert.equal(sub.sha256, whole.sha256, 'the sha256 is the whole file’s, for wiki_write');
  // The numbers are the file's own lines.
  const [from, to] = sub.lines.split('-').map(Number);
  const own = linesOf(whole.content);
  assert.ok(sub.content.startsWith(`${from}: ${own[from - 1]}`) && sub.content.endsWith(`${to}: ${own[to - 1]}`));
});

test('wiki_read section: an unknown one lists the headings; both section and lines is an error', async () => {
  await assert.rejects(read({ path: 'wiki/search-ranking.md', section: 'Nonesuch' }), (e: Error) => /No section “Nonesuch”/.test(e.message) && /# Search ranking \(line \d+\)/.test(e.message) && /### Cross-encoder details/.test(e.message) && /## Evaluation/.test(e.message));
  await assert.rejects(read({ path: 'wiki/search-ranking.md', section: 'Reranker', lines: '1-2' }), /section or lines, not both/);
});

test('wiki_read lines: a range, one line, an open end, and refusals', async () => {
  const whole = linesOf((await read({ path: 'wiki/deploys.md' })).content);
  const r = await read({ path: 'wiki/deploys.md', lines: '2-4' });
  assert.equal(r.lines, '2-4');
  assert.equal(r.content, [2, 3, 4].map((n) => `${n}: ${whole[n - 1]}`).join('\n'));
  assert.equal((await read({ path: 'wiki/deploys.md', lines: '1' })).content, `1: ${whole[0]}`);
  assert.equal((await read({ path: 'wiki/deploys.md', lines: `${whole.length - 1}-` })).lines, `${whole.length - 1}-${whole.length}`);
  assert.equal((await read({ path: 'wiki/deploys.md', lines: '3–5' })).lines, '3-5', 'an en dash, as results write it');
  assert.equal((await read({ path: 'wiki/deploys.md', lines: '3-9999' })).lines, `3-${whole.length}`, 'clamped to the end');
  await assert.rejects(read({ path: 'wiki/deploys.md', lines: '99' }), /has \d+ lines: line 99 is past its end/);
  await assert.rejects(read({ path: 'wiki/deploys.md', lines: '5-2' }), /ends before it starts/);
  await assert.rejects(read({ path: 'wiki/deploys.md', lines: 'abc' }), /range like "40-80"/);
  assert.throws(() => parseLines('0', 10), /start at 1/);
});

test('wiki_read follows a redirect stub once, and says so; hidden and retired stay unreadable', async () => {
  const r = await read({ path: 'wiki/old-ranking.md', section: 'Reranker' });
  assert.equal(r.path, 'wiki/search-ranking.md');
  assert.equal(r.redirectedFrom, 'wiki/old-ranking.md');
  assert.match(r.content, /cross-encoder/);
  assert.match((await read({ path: 'wiki/old-ranking.md' })).content, /# Search ranking/);
  await assert.rejects(read({ path: '.history/rebuilds/2026/wiki/ghost.md' }), /hidden/i);
  await assert.rejects(read({ path: 'wiki/retired.md', lines: '1-2' }), /Retired/);
  await assert.rejects(read({ path: 'wiki/.hidden-note.md', section: 'x' }), /hidden/i);
  assert.equal(JSON.stringify(readWikiPart(path.join(betaDir, 'wiki-memory'), 'wiki/blog.md', {})).includes('quokka'), true, 'no section or lines: the whole file as before');
});

test('wiki_read another project: read only, with section and lines', async () => {
  const r = await read({ path: 'wiki/blog.md', project: 'Beta', lines: '1-9' });
  assert.match(r.content, /quokka mascot/);
  assert.match((await read({ path: 'wiki/blog.md', project: 'Beta', section: 'Blog engine' })).content, /quokka mascot/);
  await assert.rejects(read({ path: 'wiki/vault.md', project: 'Gamma', lines: '1-2' }), /keeps itself to itself/);
});

// ---- wiki_search
test('wiki_search is offered read only, with its modes in the schema', () => {
  const t = tool(here, 'wiki_search');
  assert.equal(t.annotations?.readOnlyHint, true);
  const props = (t.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties;
  assert.deepEqual(props.mode.enum, ['hybrid', 'words', 'exact', 'regex']);
  assert.deepEqual(props.level.enum, ['any', 'area', 'article', 'section']);
  assert.deepEqual(props.include.enum, ['articles', 'sources', 'plans', 'all']);
});

test('hybrid (words only here: meaning is off): the answer says what was searched and what to do next', async () => {
  const out = await search({ query: 'reranker cross-encoder' });
  assert.match(out, /^Searched this project’s wiki \(articles, hybrid\) for “reranker cross-encoder”\./);
  assert.match(out, /Open a result with wiki_read/);
  assert.match(out, /Search by meaning is off or not ready: this used words only/);
  assert.match(out, /\nAreas:\n- Search and ranking — How results are found and ordered \(wiki\/areas\/search\.md\)/);
  assert.match(out, /\nArticles:\n- Search ranking — How the ranker orders results \(Search and ranking · wiki\/search-ranking\.md\)/);
  assert.match(out, /\nSections:\n(?:- .*\n)*- Search ranking › Reranker \(wiki\/search-ranking\.md, section "Reranker", lines \d+–\d+\): “[^”]*reranker[^”]*”/i);
  assert.match(out, /- Search ranking › Reranker › Cross-encoder details \(wiki\/search-ranking\.md, section "Cross-encoder details", lines \d+–\d+\)/, 'a subsection’s path, without the article’s title said twice');
  assert.ok(!out.includes('Old ranking') && !out.includes('xylophone stub') && !out.includes('retired text') && !out.includes('Retired'), 'redirect stubs and retired documents never');
  assert.ok(out.length <= 10_000);
});

test('a section result’s lines are the passage: wiki_read opens exactly them', async () => {
  const out = await search({ query: 'zebrafish marker', mode: 'words', level: 'section' });
  const m = /\(wiki\/search-ranking\.md, section "([^"]+)", lines (\d+)–(\d+)\)/.exec(out)!;
  assert.ok(m, out);
  assert.equal(m[1], 'Cross-encoder details');
  const r = await read({ path: 'wiki/search-ranking.md', lines: `${m[2]}-${m[3]}` });
  assert.match(r.content, /zebrafish/);
  const s = await read({ path: 'wiki/search-ranking.md', section: m[1] });
  assert.match(s.content, /zebrafish/, 'and the section named opens too');
  assert.ok(out.startsWith('Searched this project’s wiki (articles, words, section level)'));
  assert.ok(!/\nAreas:|\nArticles:/.test(out), 'one level');
});

test('level: article lists each article once, area lists areas, and sections list passages', async () => {
  const art = await search({ query: 'throttle value', level: 'article' });
  assert.match(art, /\nArticles:\n/);
  assert.ok(art.includes('- Crawl 31 — The thirty-first crawl (Crawling · wiki/crawl-31.md)') && art.includes('(Crawling, Search and ranking · wiki/crawl-32.md)') && art.includes('wiki/nested/deep.md'), art);
  assert.equal(art.split('wiki/crawl-31.md').length - 1, 1);
  const area = await search({ query: 'throttle value', level: 'area' });
  assert.match(area, /\nAreas:\n- Crawling — Fetching pages for the index \(wiki\/areas\/crawl\.md\)/);
  assert.ok(!/\nArticles:|\nSections:/.test(area));
  const sec = await search({ query: 'throttle value', level: 'section', limit: 3 });
  assert.equal(sec.split('\n').filter((l) => l.startsWith('- ')).length, 3);
});

test('hubs are searchable as articles, with their own area named', async () => {
  const out = await search({ query: 'hub covers the crawls', level: 'article' });
  assert.ok(out.includes('- Crawling — Fetching pages for the index (Crawling · wiki/areas/crawl.md)'), out);
});

test('the area filter: by name, id, alias, with sub-areas; and its errors', async () => {
  for (const area of ['Search and ranking', 'search', 'retrieval', 'RANKING']) {
    const out = await search({ query: 'reranker nDCG judgments', area, level: 'article' });
    assert.ok(out.includes('wiki/search-ranking.md'), area);
    assert.ok(out.includes('wiki/evaluation.md'), `${area}: its sub-area Evaluation is in it`);
    assert.ok(!out.includes('wiki/crawl-31.md') && !out.includes('wiki/deploys.md'), area);
    assert.match(out.split('\n')[0], /in area “/);
  }
  const sub = await search({ query: 'reranker nDCG judgments', area: 'Evaluation', level: 'article' });
  assert.ok(sub.includes('wiki/evaluation.md') && !sub.includes('wiki/search-ranking.md'), 'a sub-area alone');
  const both = await search({ query: 'crawl throttle', area: 'search', level: 'article' });
  assert.ok(both.includes('wiki/crawl-32.md'), 'an article in two areas is in each');
  const noArea = await search({ query: 'releases pipeline', area: 'other', level: 'article' });
  assert.ok(noArea.includes('wiki/deploys.md'), 'an article with no areas is in Other');
  await assert.rejects(search({ query: 'x', area: 'Cooking' }), (e: Error) => /No area “Cooking”/.test(e.message) && /Search and ranking, Evaluation, Crawling, Other/.test(e.message));
  // A wiki with no areas: the filter is an error that says so.
  await assert.rejects(search({ query: 'quokka', area: 'x', project: 'Beta' }), /has no areas yet/);
  await assert.rejects(search({ query: 'quokka', level: 'area', project: 'Beta' }), /has no areas yet/);
  assert.match(await search({ query: 'quokka', project: 'Beta' }), /Blog engine/, 'without a filter it is searched as any wiki');
  // The area filter also holds for exact text.
  const exact = await search({ query: 'throttle value', mode: 'exact', area: 'Crawling' });
  assert.ok(exact.includes('wiki/crawl-31.md') && exact.includes('wiki/nested/deep.md') && exact.includes('wiki/areas/crawl.md'), 'its articles and its hub');
  assert.ok(!(await search({ query: 'throttle value', mode: 'exact', area: 'Evaluation' })).includes('wiki/crawl-31.md'));
});

test('path: a prefix, a folder and a glob', async () => {
  const hubs = await search({ query: 'hub covers', path: 'wiki/areas/', level: 'article' });
  assert.ok(hubs.includes('wiki/areas/crawl.md') && hubs.includes('wiki/areas/search.md') && !hubs.includes('wiki/crawl-31.md'));
  const glob = await search({ query: 'throttle', path: 'wiki/crawl-*', level: 'article' });
  assert.ok(glob.includes('wiki/crawl-31.md') && glob.includes('wiki/crawl-32.md') && !glob.includes('wiki/nested/deep.md') && !glob.includes('areas/crawl.md'), glob);
  const deep = await search({ query: 'throttle', path: 'wiki/**/deep.md', mode: 'exact' });
  assert.ok(deep.includes('wiki/nested/deep.md') && !deep.includes('crawl-31'), deep);
  assert.ok((await search({ query: 'throttle', path: 'wiki/nested', mode: 'exact' })).includes('wiki/nested/deep.md'));
  await assert.rejects(search({ query: 'x', path: '../outside' }), /relative path inside the wiki/);
  await assert.rejects(search({ query: 'x', path: '.history/x' }), /no hidden folders/);
  await assert.rejects(search({ query: 'x', path: '/etc' }), /relative path/);
});

test('include: articles by default, sources, plans, all; a path in raw/ or output/ looks there', async () => {
  assert.match(await search({ query: 'quokka sampler' }), /Nothing found/, 'sources are not in the default');
  const src = await search({ query: 'quokka sampler', include: 'sources' });
  assert.ok(src.includes('raw/source-1.md') && src.includes('(articles') === false && src.includes('(sources, hybrid)'), src);
  const plans = await search({ query: 'quokka rollout', include: 'plans', level: 'article' });
  assert.ok(plans.includes('output/projects/launch/plan.md') && plans.includes('output/evidence/launch/done.md'), plans);
  const all = await search({ query: 'quokka', include: 'all', level: 'article' });
  assert.ok(all.includes('raw/source-1.md') && all.includes('output/projects/launch/plan.md') && all.includes('(articles, sources and plans, hybrid, article level)'), all);
  assert.ok((await search({ query: 'quokka', path: 'raw/' })).includes('raw/source-1.md'), 'a path in raw/');
  assert.ok((await search({ query: 'quokka', mode: 'exact', include: 'sources' })).includes('raw/source-1.md'));
  assert.match(await search({ query: 'quokka', mode: 'exact' }), /Nothing found/);
  await assert.rejects(search({ query: 'x', include: 'everything' }), /include must be one of: articles, sources, plans, all/);
});

test('exact: the text as written, case aside unless asked, with line numbers and context', async () => {
  const out = await search({ query: 'ZEBRAFISH MARKER', mode: 'exact' });
  assert.match(out, /^Searched this project’s wiki \(articles, exact\)/);
  assert.match(out, /\nwiki\/search-ranking\.md\n  \d+- \n  \d+: The cross-encoder reads the query and the passage together; its quirkiness is the zebrafish marker\.\n  \d+- ?(\n|$)/, out);
  assert.match(await search({ query: 'ZEBRAFISH MARKER', mode: 'exact', case: true }), /Nothing found/);
  assert.match(await search({ query: 'zebrafish marker', mode: 'exact', case: true }), /search-ranking\.md/);
  const wide = await search({ query: 'zebrafish marker', mode: 'exact', context: 0 });
  assert.ok(!/\d+- /.test(wide), 'no context lines');
  const five = await search({ query: 'zebrafish marker', mode: 'exact', context: 99 });
  assert.equal(five.split('\n').filter((l) => /^ {2}\d+[-:] ?/.test(l)).length, 11, 'at most five lines each side');
  // The text is the text: punctuation is not a pattern, and a match may span lines.
  assert.match(await search({ query: 'nDCG at ten', mode: 'exact' }), /evaluation\.md/);
  assert.match(await search({ query: 'a cross-encoder that rescores the top fifty', mode: 'exact' }), /search-ranking\.md/);
  assert.match(await search({ query: '(a|b)', mode: 'exact' }), /Nothing found/);
  assert.match(await search({ query: 'Reranker\n\nThe reranker is', mode: 'exact', context: 0 }), /search-ranking\.md\n  \d+: ## Reranker\n  \d+: \n  \d+: The reranker is a cross-encoder/);
});

test('regex: a pattern one line at a time; its errors; /pattern/flags', async () => {
  const out = await search({ query: 'throttle value (was )?\\d+', mode: 'regex', path: 'wiki/crawl-', context: 0 });
  assert.match(out, /wiki\/crawl-31\.md\n  \d+: The crawl fetched pages at a polite rate; the throttle value was 4\.\nwiki\/crawl-32\.md\n  \d+: The crawl used the throttle value 6 and fetched many pages\./);
  const m = await search({ query: '^## (Reranker|Notes)$', mode: 'regex', path: 'wiki/search-ranking.md', context: 0 });
  assert.match(m, /: ## Reranker\n/);
  assert.match(m, /: ## Notes$/);
  assert.ok(!m.includes('## Overview'));
  assert.match(await search({ query: '/ZEBRAFISH/i', mode: 'regex', context: 0 }), /zebrafish marker/);
  assert.match(await search({ query: 'ZEBRAFISH', mode: 'regex', case: true }), /Nothing found/);
  await assert.rejects(search({ query: '(unclosed', mode: 'regex' }), /Not a valid regular expression: .*(Unterminated group|Unmatched|Invalid)/i);
  await assert.rejects(search({ query: '[z-a]', mode: 'regex' }), /Not a valid regular expression/);
  await assert.rejects(search({ query: 'a*', mode: 'regex' }), /matches an empty line/);
  await assert.rejects(search({ query: 'x', mode: 'fuzzy' }), /mode must be one of: hybrid, words, exact, regex/);
  await assert.rejects(search({ query: 'x', level: 'paragraph' }), /level must be one of: any, area, article, section/);
  await assert.rejects(search({ query: '  ' }), /query is empty/);
});

test('exact levels: article counts, section groups, area hubs only', async () => {
  const art = await search({ query: 'throttle value', mode: 'exact', level: 'article' });
  assert.match(art, /\n- Crawl 31 — The thirty-first crawl \(Crawling · wiki\/crawl-31\.md\) — 1 match: \d+: “The crawl fetched/);
  const sec = await search({ query: 'Pages fetched', mode: 'exact', level: 'section', context: 0 });
  assert.match(sec, /wiki\/crawl-31\.md › Crawl 31 › Results \(section "Results", lines \d+–\d+\)\n  \d+: Pages fetched: 1200\./);
  const hubs = await search({ query: 'throttle', mode: 'exact', level: 'area' });
  assert.ok(hubs.includes('wiki/areas/crawl.md') && !hubs.includes('wiki/crawl-31.md'), hubs);
});

test('caps: 200 matches counted, the limit shown, 50 at most, 10,000 characters', async () => {
  const out = await search({ query: 'capword token', mode: 'exact', context: 0, limit: 5 });
  assert.equal(out.split('\n').filter((l) => /^ {2}\d+: line/.test(l)).length, 5);
  assert.match(out, /\(200\+ matches in 1 file; 5 shown: raise limit/);
  const many = await search({ query: 'capword token', mode: 'exact', context: 2, limit: 999 });
  assert.equal(many.split('\n').filter((l) => /^ {2}\d+: line/.test(l)).length, 50, 'the limit is at most 50');
  const hy = await search({ query: 'bulkword', limit: 50, level: 'any' });
  assert.ok(hy.length <= 10_000, `${hy.length}`);
  assert.match(hy, /More was found than fits here/);
  assert.ok(hy.split('\n').every((l) => l.length < 1000));
});

test('hidden folders and files, retired documents and redirect stubs are never searched, in any mode', async () => {
  for (const mode of ['hybrid', 'words', 'exact', 'regex']) {
    for (const include of ['articles', 'all']) {
      const out = await search({ query: mode === 'regex' ? 'ghostword|retired text|xylophone stub' : 'ghostword', mode, include });
      assert.match(out, /Nothing found/, `${mode} ${include}`);
    }
  }
  const x = await search({ query: 'xylophone', mode: 'exact', context: 0 });
  assert.ok(x.includes('wiki/search-ranking.md') && !x.includes('old-ranking') && !x.includes('retired.md') && !x.includes('ghost'), x);
  const w = await search({ query: 'xylophone', mode: 'words', level: 'article' });
  assert.ok(w.includes('wiki/search-ranking.md') && !w.includes('old-ranking') && !w.includes('retired.md'), w);
  // Retiring a document after it was indexed hides it at once.
  put(alphaDir, 'wiki/deploys.md', '---\ntitle: Deploys\ndocument_status: retired\n---\n\n# Deploys\n\nReleases ship with a pipeline and a rollback script.\n');
  assert.ok(!(await search({ query: 'rollback script', level: 'article' })).includes('wiki/deploys.md'));
  assert.ok(!(await search({ query: 'rollback script', mode: 'exact' })).includes('wiki/deploys.md'));
  put(alphaDir, 'wiki/deploys.md', article('Deploys', 'How releases ship', null, '# Deploys\n\nReleases ship with a pipeline and a rollback script.\n'));
});

test('other projects: by name, all, as memory_search allows them (Gamma keeps itself to itself, Delta has wiki memory off)', async () => {
  const b = await search({ query: 'quokka', project: 'Beta' });
  assert.match(b, /^Searched Beta’s wiki \(read only\) \(articles, hybrid\)/);
  assert.ok(b.includes('Blog engine') && b.includes('(Beta · wiki/blog.md)') && b.includes('project "Beta", wiki/blog.md') && !b.includes('Vault') && !b.includes('Lab cluster'), b);
  assert.match(b, /`project` for another project’s wiki/);
  for (const project of ['beta', 'beta-blog']) assert.ok((await search({ query: 'quokka', project })).includes('Blog engine'));
  assert.ok((await search({ query: 'quokka', project: 'Beta', mode: 'exact' })).includes('Beta · wiki/blog.md'));
  assert.ok((await search({ query: 'quokka', project: 'this' })).includes('Nothing found') === true, 'this project has no quokka article');
  const all = await search({ query: 'quokka', project: 'all', include: 'all', mode: 'exact', context: 0 });
  assert.ok(all.includes('Beta · wiki/blog.md') && all.includes('Alpha · raw/source-1.md'), all);
  assert.ok(!all.includes('zebra marker') && !all.includes('Gamma') && !all.includes('vault.md'), 'a project that keeps itself to itself is left out');
  assert.match(all, /Delta: wiki memory is off for this project, so it was not searched\./);
  const allHybrid = await search({ query: 'quokka', project: 'all', level: 'article' });
  assert.ok(allHybrid.includes('Blog engine') && !allHybrid.includes('Vault keys') && !allHybrid.includes('Lab cluster'), allHybrid);
  await assert.rejects(search({ query: 'quokka', project: 'Gamma' }), /“Gamma” keeps itself to itself/);
  await assert.rejects(search({ query: 'quokka', project: 'Delta' }), /wiki memory is off/);
  await assert.rejects(search({ query: 'quokka', project: 'Omega' }), (e: Error) => /No project called “Omega”/.test(e.message) && /Alpha, Beta, Delta/.test(e.message) && !/Gamma/.test(e.message));
  // Gamma’s own session reads Gamma, and the others.
  const inGamma = ctxIn('claude:g', gammaDir, { space: gamma.id });
  assert.ok((await search({ query: 'quokka' }, inGamma)).includes('Vault keys'));
  assert.ok((await search({ query: 'quokka', project: 'all' }, inGamma)).includes('Blog engine'));
  // Alpha's area filter, over all projects: Beta has no areas, and says so.
  const filtered = await search({ query: 'throttle', project: 'all', area: 'Crawling', level: 'article' });
  assert.ok(filtered.includes('Alpha · Crawling · wiki/crawl-31.md') && /Beta: it has no areas yet/.test(filtered), filtered);
});

test('a session outside a project searches the shared wiki; wiki memory off for the chat or a confidential session is refused', async () => {
  assert.match(await search({ query: 'quokka' }, outside), /^Searched the shared wiki \(articles, hybrid\) for “quokka”\.\nNothing found\.\nThe wiki is still empty/);
  const allOut = await search({ query: 'quokka', project: 'all', mode: 'exact' }, outside);
  assert.ok(allOut.includes('Beta · wiki/blog.md'), allOut);
  const off = ctxIn('claude:off', alphaDir, { space: alpha.id, wikiEnabled: false });
  await assert.rejects(search({ query: 'quokka' }, off), /Wiki memory is off for this chat/);
  await assert.rejects(search({ query: 'quokka', project: 'Beta' }, off), /Wiki memory is off for this chat/);
  const secret = ctxIn('claude:secret', alphaDir, { space: alpha.id, confidential: true, memory: false });
  await assert.rejects(search({ query: 'quokka' }, secret), /unavailable in confidential sessions/);
  await assert.rejects(search({ query: 'quokka', project: 'Beta' }, secret), /unavailable in confidential sessions/);
  updateSpace(db, alpha.id, { wikiMemory: false });
  await assert.rejects(search({ query: 'quokka' }), /Wiki memory is off for this project/);
  // Another project's open wiki must not bypass this chat's disabled project.
  await assert.rejects(search({ query: 'quokka', project: 'Beta' }), /Wiki memory is off for this chat or project/);
  await assert.rejects(read({ path: 'wiki/blog.md', project: 'Beta' }), /Wiki memory is off for this chat or project/);
  updateSpace(db, alpha.id, { wikiMemory: null });
});

test('an area the question names comes first; front matter and bare headings are not sections', async () => {
  const out = await search({ query: 'crawling', level: 'area' });
  assert.match(out, /\nAreas:\n- Crawling — Fetching pages for the index \(wiki\/areas\/crawl\.md\)/);
  const alias = await search({ query: 'retrieval', level: 'area', limit: 1 });
  assert.match(alias, /\nAreas:\n- Search and ranking /, 'by an old name too');
  const sec = await search({ query: 'thirty-first crawl', level: 'section' });
  assert.ok(!/title: Crawl 31|summary:/.test(sec) && !/lines 1–/.test(sec), sec);
  const art = await search({ query: 'thirty-first crawl', level: 'article' });
  assert.ok(art.includes('wiki/crawl-31.md'), 'the article is still found by its summary');
});

test('a wiki with no registry searches as before; a registry that is not one is ignored', async () => {
  const bad = path.join(alphaDir, 'wiki-memory', '.structure', 'areas.json');
  const good = fs.readFileSync(bad, 'utf8');
  fs.writeFileSync(bad, '{ not json');
  const out = await search({ query: 'reranker', level: 'article' });
  assert.match(out, /- Search ranking — How the ranker orders results \(wiki\/search-ranking\.md\)/, 'no area in the line');
  await assert.rejects(search({ query: 'reranker', area: 'search' }), /has no areas yet/);
  fs.writeFileSync(bad, good);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
