// Checks rebuilding a wiki from its sources, restoring an earlier one, and Update now, with a stand-in helper and a
// temporary wiki: the estimate; the archive (raw/, output/ and memory notes untouched; three archives kept); every
// source read again through the digest without being kept twice, an article that cites no source read too; the
// areas, hubs and the one Rebuild row; old paths leading to the new articles (or the index); restore both ways; one
// run at a time per wiki (409s); a rebuild a restart cut short going on where it stopped; a helper that fails; the
// parts of Update now; and the routes.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/areas/rebuild-test.ts && DATA_DIR=/tmp/hydor-test-rebuild node dist/dev/rebuild-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { kvSet, openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { addEntry, entries } from '../../memory/store.ts';
import { createSpace } from '../../spaces/index.ts';
import { archiveWiki, ingestWikiSource } from '../core.ts';
import { wikiDigest } from '../digest/index.ts';
import { PLAN_SYSTEM, PLAN_SYSTEM_CONVERSATION, WRITE_SYSTEM, WRITE_SYSTEM_CONVERSATION, type DigestAsk } from '../digest/plan.ts';
import { digestText } from '../digest/digest.ts';
import { updatesOf } from '../digest/store.ts';
import { wikiRoot } from '../roots.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { HUB_SYSTEM } from './hubs.ts';
import { claimJob, jobRunning, jobState, releaseJob, saveJob } from './jobs.ts';
import { archiveName, bestMatch, holds, rebuildSources, startRebuild, wikiJobStatus } from './rebuild.ts';
import { readFollowing } from './redirects.ts';
import { loadRegistry } from './registry.ts';
import { FIT_SYSTEM, PROPOSE_SYSTEM } from './reorganise.ts';
import { resumeWikiJobs } from './resume.ts';
import { setAreasHelper } from './tend.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-rebuild-')));
const db = openDb(path.join(temp, 'test.db'));
kvSet(db, 'memory.meaning', '0');
setWikiSettings(db, { enabled: true, hubPath: path.join(temp, 'hub'), projectWikis: 'hub' });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const folder = path.join(temp, 'engine');
fs.mkdirSync(folder);
const space = createSpace(db, { name: 'Engine', folder });
const root = wikiRoot(db, space.id, { create: true })!;
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const put = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const article = (title: string, summary: string, body: string, extra = '') => `---\ntitle: ${JSON.stringify(title)}\nsummary: ${JSON.stringify(summary)}\n${extra}updated: 2026-11-10\n---\n\n# ${title}\n\n${body}\n`;

// ---- the sources (kept as the digest keeps them), the old wiki built from them, a plan, memory notes
const doc = ingestWikiSource(root, 'Crawl handbook: the scheduler picks 4,000 hosts an hour.', 'knowledge:Docs/Crawl handbook').path;
const session = ingestWikiSource(root, 'User: the crawler ran out of memory.\nAgent: it now pauses at 85 percent.', 'session:Fix the crawler memory · 2026-11-10').path;
const commits = ingestWikiSource(root, 'a1b2c3 Set BM25 k1 to 1.2', 'commits:Engine · a1b2c3–d4e5f6').path;
const notes = ingestWikiSource(root, '- Words and meaning are fused with RRF, k 60.', 'memory notes · Engine · 2026-11-10').path;
put('wiki/crawl-scheduler.md', article('Crawl scheduler', 'How hosts are scheduled by the crawl scheduler', 'The scheduler picks 4,000 hosts an hour.', `areas: [crawling]\nsources:\n  - ${doc}\n`));
put('wiki/memory-guard-crawl-31.md', article('Memory guard thresholds for crawl 31', 'When the crawler pauses for memory', 'It pauses at 85 percent.', `areas: [crawling]\nsources:\n  - ${session}\n`));
put('wiki/bm25.md', article('BM25 settings', 'The BM25 setting used for ranking', 'k1 is 1.2.', `areas: [ranking-and-fusion]\nsources:\n  - ${commits}\n`));
put('wiki/rrf.md', article('Fusion', 'How rankings are fused', 'RRF with k 60.', `areas: [ranking-and-fusion]\nsources:\n  - ${notes}\n`));
put('wiki/office-plants.md', article('Office plants', 'Watering the ficus', 'On Mondays.', `areas: [other]\nsources:\n  - ${doc}\n`));
put('wiki/stray.md', article('Stray thoughts', 'Notes on nothing in particular', 'Nothing much.', `areas: [other]\nsources:\n  - ${doc}\n`));
// An agent wrote this one from nothing kept: a rebuild still reads it.
put('wiki/team-lunch.md', article('Team lunch', 'When lunch is', 'Lunch is at noon on Fridays.'));
put('wiki/old-scheduler.md', '---\ntitle: "Old scheduler notes"\nredirect: wiki/crawl-scheduler.md\n---\n\n# Old scheduler notes\n\nMerged.\n');
put('wiki/areas/crawling.md', '---\nkind: hub\narea: crawling\ntitle: "Crawling"\nsummary: "How the crawler works"\nmembers:\n  - wiki/crawl-scheduler.md 2026-11-10 00000000\n---\n\n# Crawling\n\nThe crawler.\n');
put('wiki/areas/ranking-and-fusion.md', '---\nkind: hub\narea: ranking-and-fusion\ntitle: "Ranking and fusion"\nsummary: "How results are ranked and fused"\nmembers:\n  - wiki/bm25.md 2026-11-10 00000000\n---\n\n# Ranking and fusion\n\nRanking.\n');
put('.structure/areas.json', JSON.stringify({ version: 1, areas: [{ id: 'crawling', name: 'Crawling', about: 'How the crawler works' }, { id: 'ranking-and-fusion', name: 'Ranking and fusion', about: 'How results are ranked and fused' }] }));
put('index.md', '# Wiki index\n\nThe old index.\n');
put('log.md', '# Log\n\n- 2026-11-10 · the old log\n');
put('output/projects/launch/plan.md', '# Launch plan\n\n- [ ] ship it\n');
const place = folder;
addEntry(db, { scope: 'repo', scopeKey: place, text: 'The crawler pauses at 85 percent memory.' }, { source: 'user' });
const noteCount = () => entries(db, { scope: 'repo', scopeKey: place, limit: 100 }).length;
const notesBefore = noteCount();

/** The bytes of a folder of the wiki, to see that a rebuild never touched it. */
const tree = (rel: string): string =>
  crypto
    .createHash('sha256')
    .update(
      fs
        .readdirSync(path.join(root, rel), { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.join(e.parentPath, e.name))
        .sort()
        .map((f) => `${path.relative(root, f)}:${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`)
        .join('\n'),
    )
    .digest('hex');
let rawBefore = tree('raw');
const rawList = () => fs.readdirSync(path.join(root, 'raw', 'articles')).sort();
const rawListBefore = rawList();
const outputBefore = tree('output');
const oldWiki = Object.fromEntries(['wiki/crawl-scheduler.md', 'wiki/bm25.md', 'wiki/team-lunch.md'].map((p) => [p, read(p)]));

// ---- the stand-in helper: each source makes one new article, named for the lasting topic
const NEW: Record<string, [string, string]> = {
  'Crawl handbook': ['Crawl scheduling', 'The crawl scheduler picks 4,000 hosts an hour for the crawler.'],
  'Fix the crawler memory': ['Crawl memory guard', 'The crawler pauses for memory when it passes 85 percent.'],
  'Commits a1b2c3–d4e5f6': ['Ranking changes', 'The BM25 setting for ranking: k1 was set to 1.2.'],
  'Notes from memory': ['Rank fusion', 'Words and meaning are fused with RRF, k 60.'],
  'Team lunch': ['Team lunch', 'Lunch is at noon on Fridays.'],
  // An article of the earlier wiki no new one covers, read again (Stray thoughts gives nothing).
  'Office plants': ['Office plants', 'The office ficus is watered on Mondays.'],
};
const asked: { system: string; prompt: string; strong?: boolean }[] = [];
let failing = false;
/** While set, the helper waits on it (a rebuild stays running while the test looks). */
let gate: Promise<void> | null = null;
const ask: DigestAsk = async (q) => {
  asked.push(q);
  if (gate) await gate;
  if (failing) throw new Error('the helper is not there');
  if (q.system === PLAN_SYSTEM || q.system === PLAN_SYSTEM_CONVERSATION) {
    const title = /^(?:Document|Conversation) "([^"]+)"/m.exec(q.prompt)?.[1] ?? '';
    return { update: [], create: NEW[title] ? [{ title: NEW[title][0] }] : [], notes: [{ title: 'never', text: 'A note a rebuild must never keep.' }] };
  }
  if (q.system === WRITE_SYSTEM || q.system === WRITE_SYSTEM_CONVERSATION)
    return {
      articles: [...q.prompt.matchAll(/^New article (wiki\/\S+), titled "([^"]+)"/gm)].map((m) => {
        const body = Object.values(NEW).find((n) => n[0] === m[2])?.[1] ?? 'Something.';
        return { path: m[1], summary: body, content: `# ${m[2]}\n\n${body}` };
      }),
    };
  if (q.system === PROPOSE_SYSTEM)
    return {
      areas: [
        { key: 'crawling', name: 'Crawling', about: 'How the crawler fetches the web' },
        { key: 'ranking', name: 'Ranking', about: 'How results are scored and fused' },
      ],
      articles: [
        { path: 'wiki/crawl-scheduling.md', areas: ['crawling'] },
        { path: 'wiki/crawl-memory-guard.md', areas: ['crawling'] },
        { path: 'wiki/ranking-changes.md', areas: ['ranking'] },
        { path: 'wiki/rank-fusion.md', areas: ['ranking'] },
        { path: 'wiki/team-lunch.md', areas: ['other'] },
      ],
    };
  if (q.system === FIT_SYSTEM) return { articles: [...q.prompt.matchAll(/^- (wiki\/\S+) · .* · areas: (.*)$/gm)].map((m) => ({ path: m[1], fits: m[2].split(', '), best: m[2].split(', ')[0] })) };
  if (q.system === HUB_SYSTEM) return { overview: 'An area.', facts: [], order: [] };
  throw new Error(`unexpected question: ${q.system.slice(0, 50)}`);
};
setAreasHelper(() => ask);
const app = Fastify();
wikiDigest.routes!({ app, db, broadcast() {} } as unknown as Deps);
const call = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url: `/api/projects/${space.id}${url}`, ...(payload ? { payload } : {}) });
const settled = async () => {
  for (let i = 0; i < 400 && jobRunning(space.id); i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(jobRunning(space.id), false, 'the job ended');
};

test('the estimate: the sources (an article that cites none counts), the calls, the characters, the helper', async () => {
  assert.deepEqual(
    rebuildSources(root).map((s) => s.path),
    [doc, session, commits, notes, 'wiki/team-lunch.md'],
  );
  const res = await call('POST', '/wiki/rebuild', {});
  assert.equal(res.statusCode, 200, res.body);
  const e = res.json();
  // The five kept sources, and the project's memory note, read fresh (the project's folder has no files, no commits, no conversations or documents).
  assert.equal(e.sources, 6);
  assert.deepEqual(e.reads, { kept: 5, files: [], notes: 1, commits: 0, commitSources: 0, documents: 0, sessions: 0 });
  assert.ok(e.minutes >= 1 && e.workers >= 1);
  assert.equal(e.calls, 2 * 6 + 1 + 1 + 2, 'two a source, the proposal, one fit check, a hub for each of the two areas');
  assert.equal(e.callsMax, e.calls + 2 * 7, 'at most two more for each article of the wiki now');
  assert.ok(e.chars > 100);
  assert.deepEqual([e.helper.model, e.helper.priced], ['auto', false]);
  assert.match(e.helper.note, /Claude account’s usage/);
  assert.deepEqual(e.archives, []);
  assert.equal(fs.existsSync(path.join(root, '.history', 'rebuilds')), false, 'an estimate changes nothing');
});

test('a rebuild: archived first; every source read again, none kept twice; what no new article covers read too; areas, hubs, one Rebuild row; old paths lead to the new articles', async () => {
  asked.length = 0;
  let open!: () => void;
  gate = new Promise<void>((r) => (open = r));
  const res = await call('POST', '/wiki/rebuild', { confirm: true });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().started, true);
  // One at a time: a second rebuild, an update and a reorganisation wait; the status says where it is.
  assert.equal(jobRunning(space.id), true);
  assert.equal((await call('POST', '/wiki/rebuild', { confirm: true })).statusCode, 409);
  assert.equal((await call('POST', '/wiki/update', {})).statusCode, 409);
  assert.equal((await call('POST', '/wiki/reorganise')).statusCode, 409);
  const running = (await call('GET', '/wiki/rebuild')).json();
  assert.deepEqual([running.state, running.kind, running.phase, running.done, running.total], ['running', 'rebuild', 'sources', 0, 6]);
  assert.match(updatesOf(db, space.id)[0].document, /^Rebuilding: 0 of 6 sources$/);
  gate = null;
  open();
  await settled();
  const status = (await call('GET', '/wiki/rebuild')).json();
  assert.equal(status.state, 'done', JSON.stringify(status));
  assert.equal(status.kind, 'rebuild');
  assert.deepEqual([status.done, status.total], [8, 8], 'the six sources, then the two earlier articles no new one covered');
  assert.match(status.did[0], /^Rebuilt from 6 sources and 2 earlier articles no new one covered: 6 articles in 2 areas/);
  assert.equal(status.archives.length, 1);
  assert.equal(status.archives[0].articles, 7, 'the old wiki: its articles, not its hubs or redirects');
  // The old wiki is archived whole; the sources and plans never moved; nothing kept twice; no memory note touched.
  const arch = path.join(root, '.history', 'rebuilds', fs.readdirSync(path.join(root, '.history', 'rebuilds'))[0]);
  for (const f of ['wiki/crawl-scheduler.md', 'wiki/areas/crawling.md', 'index.md', 'log.md', '.structure/areas.json']) assert.ok(fs.existsSync(path.join(arch, f)), f);
  assert.equal(fs.readFileSync(path.join(arch, 'wiki/bm25.md'), 'utf8'), oldWiki['wiki/bm25.md']);
  // raw/ only gained what the rebuild makes fresh (the project's memory notes, kept as one source): none of its sources kept a second time.
  const added = rawList().filter((f) => !rawListBefore.includes(f));
  assert.equal(added.length, 2, 'one source, its note and its original');
  assert.match(read(`raw/articles/${added.find((f) => f.endsWith('.md'))}`), /^source: "notes:Engine · \d{4}-\d\d-\d\d · 1 of 1"$/m);
  assert.ok(rawListBefore.every((f) => rawList().includes(f)), 'no source went');
  rawBefore = tree('raw');
  assert.equal(tree('output'), outputBefore, 'output/ untouched');
  assert.equal(noteCount(), notesBefore, 'memory notes untouched');
  assert.equal(asked.filter((q) => q.system === PLAN_SYSTEM || q.system === PLAN_SYSTEM_CONVERSATION).length, 8);
  assert.ok(asked.some((q) => q.system === PLAN_SYSTEM && q.prompt.includes('Document "Office plants"')), 'an earlier article no new one covered, read as a source');
  assert.ok(asked.some((q) => q.system === PLAN_SYSTEM_CONVERSATION && q.prompt.includes('Conversation "Fix the crawler memory"')), 'a conversation read as one');
  assert.ok(asked.find((q) => q.system === PROPOSE_SYSTEM)?.strong, 'the areas by the stronger model');
  // The new wiki: its articles cite the sources they came from, in areas, with hubs.
  assert.match(read('wiki/crawl-scheduling.md'), new RegExp(`sources:\\n {2}- ${doc.replace(/[.]/g, '\\.')}`));
  assert.match(read('wiki/crawl-scheduling.md'), /^areas: \[crawling\]$/m);
  assert.ok(!/^sources:/m.test(read('wiki/team-lunch.md')), 'read from the archive, it cites no source');
  assert.deepEqual(
    loadRegistry(root)!.areas.map((a) => a.id),
    ['crawling', 'ranking', 'other'],
  );
  assert.ok(fs.existsSync(path.join(root, 'wiki/areas/ranking.md')));
  assert.match(read('index.md'), /<!-- articles:start -->/);
  assert.match(read('log.md'), /rebuilt from 6 sources and 2 earlier articles no new one covered: 6 articles/);
  // Old paths: to the new article holding what they said, else the index; an old redirect where its target went; an old hub to the new hub.
  const to = (p: string) => /^redirect: (\S+)$/m.exec(read(p))?.[1];
  assert.equal(to('wiki/crawl-scheduler.md'), 'wiki/crawl-scheduling.md');
  assert.equal(to('wiki/memory-guard-crawl-31.md'), 'wiki/crawl-memory-guard.md');
  assert.equal(to('wiki/bm25.md'), 'wiki/ranking-changes.md');
  assert.equal(to('wiki/rrf.md'), 'wiki/rank-fusion.md');
  assert.equal(to('wiki/office-plants.md'), undefined, 'read again: an article at its old path');
  assert.match(read('wiki/office-plants.md'), /watered on Mondays/);
  assert.equal(to('wiki/stray.md'), 'index.md', 'nothing kept of it: the index');
  assert.equal(to('wiki/old-scheduler.md'), 'wiki/crawl-scheduling.md');
  assert.equal(to('wiki/areas/ranking-and-fusion.md'), 'wiki/areas/ranking.md');
  assert.equal(readFollowing(root, 'wiki/bm25.md').path, 'wiki/ranking-changes.md');
  assert.match(readFollowing(root, 'wiki/bm25.md').note!, /rebuilt from its sources/);
  // One row in Recent updates for the whole of it.
  const rows = updatesOf(db, space.id).filter((u) => u.path.startsWith('rebuild:'));
  assert.equal(rows.length, 1);
  assert.match(rows[0].document, /^Rebuilt from 6 sources and 2 earlier articles/);
  assert.equal(updatesOf(db, space.id).filter((u) => /^rebuild:(?:raw|wiki)\//.test(u.path)).length, 0, 'no row for each source');
});

test('restore: the earlier wiki back, the rebuilt one archived; and back again', async () => {
  const before = wikiJobStatus(db, space.id).archives;
  const res = await call('POST', '/wiki/rebuild/restore', { at: before[0].at });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().articles, 7);
  for (const [p, text] of Object.entries(oldWiki)) assert.equal(read(p), text, `${p} as it was`);
  assert.equal(read('index.md'), '# Wiki index\n\nThe old index.\n');
  assert.equal(loadRegistry(root)!.areas[0].id, 'crawling');
  assert.equal(fs.existsSync(path.join(root, 'wiki/crawl-scheduling.md')), false);
  const now = wikiJobStatus(db, space.id).archives;
  assert.equal(now.length, 1, 'the restored archive left the archives; the rebuilt wiki took its place');
  assert.equal(now[0].articles, 6);
  assert.equal(updatesOf(db, space.id)[0].path.startsWith('restore:'), true);
  assert.equal((await call('POST', '/wiki/rebuild/restore', { at: '2001-01-01T00:00:00.000Z' })).statusCode, 404);
  assert.equal((await call('POST', '/wiki/rebuild/restore', {})).statusCode, 400);
  assert.equal((await call('POST', '/wiki/rebuild/restore', { at: now[0].at })).statusCode, 200);
  assert.equal(fs.existsSync(path.join(root, 'wiki/crawl-scheduling.md')), true, 'the rebuilt wiki again');
  assert.equal(tree('raw'), rawBefore);
});

test('the three latest archives are kept, and always the oldest: the wiki before its first rebuild', async () => {
  const before = wikiJobStatus(db, space.id).archives;
  const first = before[before.length - 1]?.at; // newest first: the oldest is the last
  for (let i = 0; i < 3; i++) {
    await startRebuild(db, space.id, { ask, strong: (q) => ask({ ...q, strong: true }) });
    await settled();
  }
  const kept = wikiJobStatus(db, space.id).archives;
  assert.equal(kept.length, 4, 'the three latest and the oldest');
  assert.equal(kept[kept.length - 1].at, first, 'the oldest is never dropped');
});

test('a rebuild a restart cut short goes on where it stopped', async () => {
  const sources = rebuildSources(root).map((s) => s.path);
  const name = archiveName(Date.now() + 5000);
  await archiveWiki(root, name);
  saveJob(db, space.id, { kind: 'rebuild', state: 'running', phase: 'sources', done: 3, total: sources.length, startedAt: Date.now(), archive: name, sources, failed: [], did: [], starts: [], carried: 0 });
  assert.equal(wikiJobStatus(db, space.id).state, 'failed', 'before it is taken up: shown as stopped');
  asked.length = 0;
  assert.equal(resumeWikiJobs(db), 1);
  await settled();
  assert.equal(jobState(db, space.id)!.state, 'done');
  assert.equal(asked.filter((q) => q.system === PLAN_SYSTEM || q.system === PLAN_SYSTEM_CONVERSATION).length, sources.length - 3, 'only the sources it had not read');
  // An update cut short is not taken up again.
  saveJob(db, space.id, { kind: 'update', state: 'running', done: 0, total: 3, startedAt: Date.now(), parts: ['sources', 'articles', 'areas'] });
  assert.equal(resumeWikiJobs(db), 0);
  assert.match(jobState(db, space.id)!.error!, /restarted/);
});

test('a helper that fails: the rebuild stops and says so; the earlier wiki can be put back', async () => {
  failing = true;
  await startRebuild(db, space.id, { ask, strong: ask, retryMs: 5 });
  await settled();
  failing = false;
  const s = wikiJobStatus(db, space.id);
  assert.equal(s.state, 'failed');
  assert.match(s.error!, /could not read (\d+) of \1 sources: restore the previous wiki/);
  assert.match(updatesOf(db, space.id)[0].error ?? '', /could not read/);
  const res = await call('POST', '/wiki/rebuild/restore', { at: s.archives[0].at });
  assert.equal(res.statusCode, 200, res.body);
  assert.ok(fs.existsSync(path.join(root, 'wiki/crawl-scheduling.md')));
});

test('Update now: its parts in the background, what it did in the status; the parts checked', async () => {
  assert.equal((await call('POST', '/wiki/update', { parts: ['nothing'] })).statusCode, 400);
  assert.equal((await call('POST', '/wiki/update', { parts: [] })).statusCode, 400);
  const res = await call('POST', '/wiki/update', { parts: ['areas', 'articles'] });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json(), { started: true, parts: ['articles', 'areas'] });
  await settled();
  const s = (await call('GET', '/wiki/rebuild')).json();
  assert.equal(s.state, 'done', JSON.stringify(s));
  assert.equal(s.kind, 'update');
  assert.deepEqual(s.parts, ['articles', 'areas']);
  assert.ok(s.did.some((l: string) => /^Brought \d+ stale articles? up to date$/.test(l)), JSON.stringify(s.did));
  assert.ok(s.did.some((l: string) => /^Wrote \d+ hubs?$/.test(l)));
  assert.ok(s.did.some((l: string) => /^Did \d+ queued merges?$/.test(l)));
  assert.ok(s.did.some((l: string) => /^Areas: /.test(l)));
  const all = await call('POST', '/wiki/update', {});
  assert.deepEqual(all.json().parts, ['sources', 'articles', 'areas'], 'all three by default');
  await settled();
  const done = (await call('GET', '/wiki/rebuild')).json();
  assert.ok(done.did.some((l: string) => /^Read \d+ conversations?$/.test(l)), JSON.stringify(done.did));
  assert.ok(done.did.some((l: string) => /commits/i.test(l)));
});

test('the routes: a project that is not there, the shared wiki, a busy wiki', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/projects/nope/wiki/rebuild' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/projects/nope/wiki/update', payload: {} })).statusCode, 404);
  const shared = (await app.inject({ method: 'GET', url: '/api/wiki/rebuild' })).json();
  assert.equal(shared.state, 'idle');
  assert.equal((await app.inject({ method: 'POST', url: '/api/wiki/rebuild', payload: {} })).json().sources, 0, 'the shared wiki keeps no sources');
  const refused = await app.inject({ method: 'POST', url: '/api/wiki/rebuild', payload: { confirm: true } });
  assert.equal(refused.statusCode, 409);
  assert.match(refused.body, /no sources to rebuild from/);
  assert.ok(claimJob(space.id));
  assert.equal((await call('POST', '/wiki/rebuild', { confirm: true })).statusCode, 409);
  assert.equal((await call('POST', '/wiki/rebuild/restore', { at: wikiJobStatus(db, space.id).archives[0].at })).statusCode, 409);
  releaseJob(space.id);
  const empty = path.join(temp, 'empty');
  fs.mkdirSync(empty);
  const none = createSpace(db, { name: 'Nothing yet', folder: empty });
  assert.equal((await app.inject({ method: 'POST', url: `/api/projects/${none.id}/wiki/rebuild`, payload: {} })).statusCode, 409);
});

test('matching an old article to a new one: shared words, rarer ones weigh more; too little in common is no match', () => {
  const c = [
    { path: 'wiki/a.md', title: 'Crawl scheduling', summary: 'The crawl scheduler picks hosts' },
    { path: 'wiki/b.md', title: 'Ranking changes', summary: 'BM25 settings for ranking' },
  ];
  assert.equal(bestMatch({ title: 'Crawl scheduler', summary: 'How hosts are scheduled' }, c), 'wiki/a.md');
  assert.equal(bestMatch({ title: 'BM25 settings', summary: 'k1 and b for ranking' }, c), 'wiki/b.md');
  assert.equal(bestMatch({ title: 'Office plants', summary: 'Watering' }, c), null);
  // Holding the topic is more than sharing a few words: the old title's words, by their stems.
  const cli = { title: 'Hydor command line interface', summary: 'The hydor command and its commands', text: 'It runs on CI machines.' };
  assert.equal(holds('Phone access and public link base', cli, [cli, ...c]), false);
  assert.equal(holds('Terminal symbols in the hydor CLI', { ...cli, text: 'Terminal symbols are plain ASCII in the hydor CLI.' }, [cli, ...c]), true);
  assert.equal(holds('BM25 settings', c[1], c), true, 'settings and setting: one stem');
});

test('the digest never makes an article twice: a "new" one with a title that exists updates it', async () => {
  const titled = fs.readdirSync(path.join(root, 'wiki')).filter((f) => f.startsWith('crawl-scheduling'));
  let wrote = '';
  const once: DigestAsk = async (q) => {
    if (q.system === PLAN_SYSTEM) return { update: [], create: [{ title: 'crawl scheduling' }], notes: [] };
    if (q.system === WRITE_SYSTEM) {
      wrote = q.prompt;
      return { articles: [{ path: 'wiki/crawl-scheduling.md', summary: 'Scheduling', content: '# Crawl scheduling\n\nThe crawl scheduler picks 4,000 hosts an hour for the crawler. Robots rules are read first.' }] };
    }
    throw new Error('unexpected');
  };
  assert.ok(await digestText(db, once, { space: space.id, base: 'test', title: 'Robots', path: '/docs/robots.md', origin: 'test:robots', text: 'Robots rules are read before a host is scheduled.', cut: false, kind: 'document', notes: false, hash: 'robots-1', now: () => Date.now() }));
  assert.match(wrote, /^Existing article wiki\/crawl-scheduling\.md/m, 'given as the article that exists');
  assert.deepEqual(fs.readdirSync(path.join(root, 'wiki')).filter((f) => f.startsWith('crawl-scheduling')), titled, 'no second one');
  assert.match(read('wiki/crawl-scheduling.md'), /Robots rules are read first/);
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
setAreasHelper(null);
fs.rmSync(temp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit();
