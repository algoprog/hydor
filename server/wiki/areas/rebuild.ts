// Rebuilding a wiki from its sources. raw/ holds what the wiki was built from (documents' text, conversations,
// commit messages, notes moved from memory, all kept redacted); a rebuild archives the wiki as it is (its articles,
// index, log and structure, into .history/rebuilds/<time>/, the ARCHIVES_KEPT latest kept; raw/ and output/ never
// move), reads every source again through the digest's plan and write path (oldest first, one at a time, at most
// REBUILD_PER_HOUR an hour, no source kept twice), then organises the areas, writes the hubs, does the queued folds,
// and makes every old path that is gone a redirect to the new article that matches it best (else to index.md), so
// notes and links that name old paths still lead somewhere. An archive can be put back (restore). Memory notes are
// never touched. A rebuild a restart cut short goes on where it stopped (jobs.ts).
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../../auth.ts';
import type { DB } from '../../db.ts';
import { helperCost } from '../../helper.ts';
import { searchKnowledge } from '../../knowledge/search.ts';
import { spaceById } from '../../spaces/index.ts';
import { archiveWiki, dropArchive, redirectOf, restoreWiki, wikiArchives, wikiHash } from '../core.ts';
import { browseWiki } from '../browse.ts';
import { wikiBase } from '../deliver.ts';
import { MAX_DOC_CHARS, digestText } from '../digest/digest.ts';
import type { DigestAsk, TextKind } from '../digest/plan.ts';
import { changeUpdate, recordUpdate } from '../digest/store.ts';
import { appendLines, frontValue, listOf, readOrNull, splitFront, summaryOf, titleOfArticle, writeFile, writeIndex } from '../digest/write.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { areaArticles } from './articles.ts';
import { claimJob, jobRunning, jobState, releaseJob, saveJob, type JobState } from './jobs.ts';
import { runMerges } from './merge.ts';
import { redirectStub } from './redirects.ts';
import { hasAreas, isHubPath, loadRegistry } from './registry.ts';
import { reorganiseWiki, reorganising } from './reorganise.ts';
import { refreshHubs } from './tend.ts';

/** Sources a rebuild reads an hour at most, and the archives of earlier wikis kept. */

/**
 * Drops the archives beyond those kept: the latest few, and always the oldest, the wiki as it was before its first
 * rebuild, so a run of failed rebuilds can never push it out. `made` (the one just archived) never goes.
 */
function pruneArchives(root: string, made: string): void {
  const all = wikiArchives(root);
  const keep = new Set([all[0]?.name, ...all.slice(-ARCHIVES_KEPT).map((a) => a.name), made]);
  for (const a of all) if (!keep.has(a.name)) dropArchive(root, a.name);
}

export const REBUILD_PER_HOUR = 60;
export const ARCHIVES_KEPT = 3;

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
/** An archive's name from a moment, and back: the ISO time with the characters some systems refuse as dashes. */
export const archiveName = (t: number) => new Date(t).toISOString().replace(/[:.]/g, '-');
export const archiveTime = (name: string) => name.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
const nameOf = (at: string) => (/T\d\d:\d\d/.test(at) ? at.replace(/[:.]/g, '-') : at);

// ---- the sources ----------------------------------------------------------------------------------------------

export interface RebuildSource {
  /** raw/… (a kept source), or wiki/… (an article that cites no source, read from the archive). */
  path: string;
  title: string;
  origin: string;
  kind: TextKind;
  text: string;
}

/** What a source note says it came from, as a title the helper reads, and how to read it (a conversation or a document). */
function titleAndKind(origin: string, fallback: string): { title: string; kind: TextKind } {
  const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;
  if (origin.startsWith('session:')) return { title: clip(origin.slice(8).split(' · ')[0]), kind: 'conversation' };
  if (origin.startsWith('commits:')) return { title: clip(`Commits ${origin.slice(8).split(' · ').slice(1).join(' · ')}`), kind: 'conversation' };
  if (origin.startsWith('knowledge:')) return { title: clip(origin.slice(10).replace(/^[^/]*\//, '')), kind: 'document' };
  if (origin.startsWith('memory notes')) return { title: 'Notes from memory', kind: 'document' };
  if (origin.startsWith('file:')) return { title: clip(path.posix.basename(origin.slice(5).split('#')[0])), kind: 'document' };
  return { title: clip(origin), kind: 'document' };
}

/** A kept source as the digest reads it: its text (without the note's front matter), where it came from, its title. */
export function readSource(root: string, rel: string): RebuildSource | null {
  const cur = readOrNull(root, rel);
  if (!cur) return null;
  const f = splitFront(cur.content);
  const origin = frontValue(f, 'source') ?? rel;
  const text = f.body.trim();
  if (!text) return null;
  const { title, kind } = titleAndKind(origin, path.posix.basename(rel, '.md'));
  return { path: rel, title, origin, kind, text: text.slice(0, MAX_DOC_CHARS) };
}

/**
 * The sources a rebuild reads, oldest first: every source note in raw/ (by the day it was kept, then its file's time,
 * then its path), then each article that cites none of them (an agent wrote it from nothing kept), so a rebuild
 * never drops what has no source.
 */
export function rebuildSources(root: string): { path: string; chars: number }[] {
  const notes: { path: string; day: string; mtime: number; chars: number }[] = [];
  for (const s of browseWiki(root).sources) {
    const cur = readOrNull(root, s.path);
    if (!cur) continue;
    const f = splitFront(cur.content);
    if (!frontValue(f, 'source')) continue;
    let mtime = 0;
    try {
      mtime = fs.statSync(path.join(root, ...s.path.split('/'))).mtimeMs;
    } catch {
      /* gone meanwhile */
    }
    notes.push({ path: s.path, day: frontValue(f, 'ingested') ?? '', mtime, chars: Math.min(MAX_DOC_CHARS, f.body.trim().length) });
  }
  notes.sort((a, b) => a.day.localeCompare(b.day) || a.mtime - b.mtime || a.path.localeCompare(b.path));
  const kept = new Set(notes.map((n) => n.path));
  const loose = areaArticles(root)
    .filter((a) => !listOf(splitFront(a.content), 'sources').some((s) => kept.has(s)))
    .map((a) => ({ path: a.path, chars: Math.min(MAX_DOC_CHARS, a.body.trim().length) }));
  return [...notes.map((n) => ({ path: n.path, chars: n.chars })), ...loose];
}

// ---- the estimate ---------------------------------------------------------------------------------------------

export interface RebuildEstimate {
  sources: number;
  /** Helper calls, about: two a source, the organisation (the proposal and the fit check), one a hub. */
  calls: number;
  /** The most it may take: two more for each article of the wiki now, when no new article holds what it said and it is read again. */
  callsMax: number;
  /** What the helper reads of the sources, in characters. */
  chars: number;
  helper: { model: string; label: string; priced: boolean; usd?: number; usdMax?: number; note?: string };
  /** The wiki's articles now, and the archives there are. */
  articles: number;
  archives: { at: string; articles: number }[];
}

export function rebuildEstimate(db: DB, root: string): RebuildEstimate {
  const sources = rebuildSources(root);
  const chars = sources.reduce((n, s) => n + s.chars, 0);
  const articles = areaArticles(root).length;
  const expected = Math.max(articles, sources.length);
  const r = loadRegistry(root);
  const hubs = hasAreas(r) ? Math.max(1, r.areas.length - 1) : Math.max(1, Math.round(expected / 5));
  const fit = Math.ceil(expected / 20);
  const calls = 2 * sources.length + 1 + fit + hubs;
  // About four characters a token: each source is read twice (the plan, the writing) with the prompts, the article list
  // and the articles it changes; the organisation reads every article's line; a hub its articles' beginnings.
  const tokensIn = Math.round((2 * chars + sources.length * 14_000 + expected * 600 + 3_000 + hubs * 5_000) / 4);
  const tokensOut = Math.round((sources.length * 5_000 + expected * 120 + hubs * 1_200) / 4);
  const cost = helperCost(db, { tokensIn, tokensOut });
  // Each article read again (no new one holds it) costs about what a source of its size does.
  const articleChars = areaArticles(root).reduce((n, a) => n + Math.min(MAX_DOC_CHARS, a.body.length), 0);
  const most = helperCost(db, { tokensIn: tokensIn + Math.round((2 * articleChars + articles * 14_000) / 4), tokensOut: tokensOut + Math.round((articles * 5_000) / 4) });
  const helper = cost.model === 'auto' ? { ...cost, note: 'Automatic uses your Claude account’s usage: Claude Haiku, and Sonnet for the areas' } : { ...cost, ...(most.usd != null ? { usdMax: most.usd } : {}) };
  return { sources: sources.length, calls, callsMax: calls + 2 * articles, chars, helper, articles, archives: archivesOf(root) };
}

/** The archives of earlier wikis, newest first: when each was archived, and how many articles it held. */
export function archivesOf(root: string): { at: string; articles: number }[] {
  return wikiArchives(root)
    .reverse()
    .map((a) => ({ at: archiveTime(a.name), articles: countArticles(path.join(a.dir, 'wiki')) }));
}

function countArticles(dir: string): number {
  let n = 0;
  const walk = (d: string, rel: string) => {
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!(rel === '' && e.name === 'areas')) walk(path.join(d, e.name), `${rel}${e.name}/`);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        try {
          if (redirectOf(fs.readFileSync(path.join(d, e.name), 'utf8').slice(0, 4000)) == null) n++;
        } catch {
          /* unreadable: not counted */
        }
      }
    }
  };
  walk(dir, '');
  return n;
}

// ---- matching an old path to a new article --------------------------------------------------------------------

const STOP = new Set('about after also and are because been but can for from has have how into its more not now one only other over same than that the their them then there these they this those through under use used uses using was were what when where which while who why will with without your'.split(' '));
const words = (s: string) => [...new Set((s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP.has(w)))];

/**
 * The new article an old one's content went to: the one sharing most of its title's and summary's words (rarer words
 * weigh more, a title's more), helped by the wiki's own search when it is indexed; null when none shares enough.
 */
export function bestMatch(old: { title: string; summary: string }, candidates: { path: string; title: string; summary: string; text?: string }[], searched: string[] = []): string | null {
  const q = words(`${old.title} ${old.summary}`);
  if (!q.length || !candidates.length) return null;
  const df = new Map<string, number>();
  const sets = candidates.map((c) => ({ c, title: new Set(words(c.title)), head: new Set(words(`${c.title} ${c.summary}`)), all: new Set(words(`${c.title} ${c.summary} ${c.text ?? ''}`)) }));
  for (const s of sets) for (const w of s.all) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + candidates.length / (df.get(w) ?? 0.5));
  const total = q.reduce((n, w) => n + idf(w), 0);
  let best: { path: string; score: number; shared: number } | null = null;
  for (const s of sets) {
    // A word in the new article's title weighs most, in its summary less, in its text least.
    const shared = q.filter((w) => s.all.has(w));
    let score = shared.reduce((n, w) => n + idf(w) * (s.title.has(w) ? 1.5 : s.head.has(w) ? 1 : 0.6), 0) / total;
    const rank = searched.indexOf(s.c.path);
    if (rank >= 0 && rank < 3) score += 0.15 / (rank + 1);
    if (!best || score > best.score) best = { path: s.c.path, score, shared: shared.length };
  }
  return best && best.shared >= 2 && best.score >= 0.3 ? best.path : null;
}

/** The old wiki's articles, hubs and redirects, by path, from an archive. */
function archivedFiles(dir: string): { rel: string; content: string }[] {
  const out: { rel: string; content: string }[] = [];
  const walk = (d: string, rel: string) => {
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile() && e.name.endsWith('.md')) {
        try {
          out.push({ rel: r, content: fs.readFileSync(path.join(d, e.name), 'utf8') });
        } catch {
          /* unreadable: no redirect for it */
        }
      }
    }
  };
  walk(path.join(dir, 'wiki'), 'wiki');
  return out;
}

/**
 * Every path of the archived wiki that the new one does not have becomes a redirect: to the new article (a hub to the
 * new hub) that matches it best, else to index.md. A redirect of the old wiki leads where its target leads now.
 */
/** The new wiki's articles as matching sees them: title, summary, and the headings and beginning of their text. */
const matchable = (root: string) => areaArticles(root).map((a) => ({ path: a.path, title: a.title, summary: a.summary, text: `${a.headings.join(' ')} ${a.body.slice(0, 4000)}` }));

/** A word's stem for "is it in there": its first five letters (a plural or another form of it counts). */
const stem = (w: string) => w.slice(0, 5);

/**
 * Whether a new article holds what an old one was about: at least TITLE_COVER of its title's words (the rarer weighing
 * more; a word by its stem) are in the new article's title, summary or text. Stricter than a redirect's match, as
 * sharing a few common words ("hydor", "commands") is not holding the topic.
 */
export function holds(oldTitle: string, c: { title: string; summary: string; text?: string }, all: { title: string; summary: string; text?: string }[]): boolean {
  const q = words(oldTitle);
  if (!q.length) return true;
  const texts = all.map((x) => new Set(words(`${x.title} ${x.summary} ${x.text ?? ''}`).map(stem)));
  const idf = (w: string) => Math.log(1 + all.length / (texts.filter((t) => t.has(stem(w))).length || 0.5));
  const mine = new Set(words(`${c.title} ${c.summary} ${c.text ?? ''}`).map(stem));
  const total = q.reduce((n, w) => n + idf(w), 0);
  return q.filter((w) => mine.has(stem(w))).reduce((n, w) => n + idf(w), 0) / total >= TITLE_COVER;
}
export const TITLE_COVER = 0.6;

/** The earlier wiki's articles (not hubs, not redirects) that no new article holds: read again as sources, so a rebuild drops nothing. */
export function uncovered(root: string, archiveDir: string, skip: Set<string>): string[] {
  const now = matchable(root);
  return archivedFiles(archiveDir)
    .filter((o) => !isHubPath(o.rel) && redirectOf(o.content) == null && !skip.has(o.rel))
    .filter((o) => {
      const title = titleOfArticle(o.content, path.posix.basename(o.rel, '.md'));
      const best = bestMatch({ title, summary: summaryOf(o.content) }, now);
      return !best || !holds(title, now.find((c) => c.path === best)!, now);
    })
    .map((o) => o.rel);
}

export async function redirectOldPaths(db: DB | null, space: string | null, root: string, archiveDir: string, now: number): Promise<{ matched: number; toIndex: number }> {
  const out = { matched: 0, toIndex: 0 };
  const articles = matchable(root);
  const hubs = browseWiki(root)
    .articles.filter((a) => isHubPath(a.path))
    .map((a) => {
      const c = readOrNull(root, a.path)?.content ?? '';
      return { path: a.path, title: titleOfArticle(c, a.title), summary: summaryOf(c) };
    });
  const base = db && space ? wikiBase(db, space) : null;
  const old = archivedFiles(archiveDir);
  const oldByPath = new Map(old.map((o) => [o.rel, o.content]));
  const resolved = new Map<string, string>();
  const matchFor = async (rel: string, content: string, depth = 0): Promise<string> => {
    if (resolved.has(rel)) return resolved.get(rel)!;
    let to: string | null = null;
    const target = redirectOf(content);
    if (target && depth < 3) {
      // An old redirect: where its target is now.
      if (target === 'index.md') to = 'index.md';
      else if (readOrNull(root, target) && redirectOf(readOrNull(root, target)!.content) == null) to = target;
      else if (oldByPath.has(target)) to = await matchFor(target, oldByPath.get(target)!, depth + 1);
    }
    if (!to) {
      const title = titleOfArticle(content, path.posix.basename(rel, '.md'));
      const summary = summaryOf(content);
      let searched: string[] = [];
      if (base && !isHubPath(rel)) {
        try {
          const hits = (await searchKnowledge(db!, { query: `${title} ${summary}`.slice(0, 500), bases: [base.base], limit: 20, mode: 'auto', vector: null })).hits;
          searched = [...new Set(hits.map((h) => path.relative(base.root, h.path).split(path.sep).join('/')))];
        } catch {
          /* the index not ready: the words alone */
        }
      }
      to = bestMatch({ title, summary }, isHubPath(rel) ? hubs : articles, searched) ?? 'index.md';
    }
    resolved.set(rel, to);
    return to;
  };
  for (const o of old) {
    if (readOrNull(root, o.rel)) continue;
    const to = await matchFor(o.rel, o.content);
    const title = titleOfArticle(o.content, path.posix.basename(o.rel, '.md'));
    const toTitle = to === 'index.md' ? 'the index' : titleOfArticle(readOrNull(root, to)?.content ?? '', to);
    const did = await writeFile(root, o.rel, (cur) => (cur == null ? redirectStub({ from: o.rel, to, title, toTitle, now, what: 'rebuilt' }) : null)).catch(() => false);
    if (did) {
      if (to === 'index.md') out.toIndex++;
      else out.matched++;
    }
  }
  return out;
}

// ---- running it ---------------------------------------------------------------------------------------------------

export interface RebuildOptions {
  /** The helper (Haiku on Automatic) and the stronger one for the areas (Sonnet). */
  ask: DigestAsk;
  strong: DigestAsk;
  onUpdate?: (space: string | null) => void;
  /** Sources an hour at most (REBUILD_PER_HOUR), and how long a failed source waits before it is tried again. */
  perHour?: number;
  retryMs?: number;
  now?: () => number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The wiki of a place, or why there is none to rebuild. */
function rootOf(db: DB, space: string | null): string {
  if (space && !spaceById(db, space)) throw new HttpError(404, 'No such project');
  if (!wikiMemoryOn(db, space)) throw new HttpError(409, space ? 'Wiki memory is off for this project' : 'The shared wiki is off in Settings → Memory → Wiki memory');
  const root = wikiRoot(db, space);
  if (!root) throw new HttpError(409, 'The wiki is still empty: nothing has been kept in it yet');
  return root;
}

export const estimateRebuild = (db: DB, space: string | null): RebuildEstimate => rebuildEstimate(db, rootOf(db, space));

/**
 * Starts a rebuild: archives the wiki now (so a failure here says so at once), then reads its sources in the
 * background. 409 while the wiki does something else at a person's request.
 */
export async function startRebuild(db: DB, space: string | null, o: RebuildOptions): Promise<{ started: true; sources: number; archive: string }> {
  const root = rootOf(db, space);
  if (!claimJob(space)) throw new HttpError(409, 'The wiki is busy with a rebuild, an update or a reorganisation: try again when it is done');
  try {
    if (reorganising()) throw new HttpError(409, 'A reorganisation is running: try again in a few minutes');
    const now = (o.now ?? Date.now)();
    const sources = rebuildSources(root);
    if (!sources.length) throw new HttpError(409, 'The wiki has no sources to rebuild from');
    const name = archiveName(now);
    await archiveWiki(root, name);
    // The latest few archives are kept, and the oldest (the wiki before its first rebuild); the one just made never goes.
    pruneArchives(root, name);
    const updateId = recordUpdate(db, { space, base: 'rebuild', document: `Rebuilding: 0 of ${sources.length} sources`, path: `rebuild:${new Date(now).toISOString()}`, articles: [], notes: 0 }, now);
    const job: JobState = { kind: 'rebuild', state: 'running', phase: 'sources', done: 0, total: sources.length, startedAt: now, archive: name, sources: sources.map((s) => s.path), failed: [], did: [], updateId, starts: [] };
    saveJob(db, space, job);
    o.onUpdate?.(space);
    void runRebuild(db, space, root, job, o);
    return { started: true, sources: sources.length, archive: archiveTime(name) };
  } catch (e) {
    releaseJob(space);
    throw e;
  }
}

/** Goes on with a rebuild (from where it stopped, after a restart). Never throws; the job slot is released at the end. */
export async function runRebuild(db: DB, space: string | null, root: string, job: JobState, o: RebuildOptions): Promise<void> {
  const now = o.now ?? Date.now;
  const perHour = o.perHour ?? REBUILD_PER_HOUR;
  const save = () => saveJob(db, space, job);
  const row = (document: string, articles?: string[], error?: string | null) => {
    if (job.updateId) changeUpdate(db, job.updateId, { document, articles, error }, now());
    o.onUpdate?.(space);
  };
  const written = new Set<string>();
  const archiveDir = path.join(root, '.history', 'rebuilds', job.archive ?? '');
  try {
    const sources = job.sources ?? [];
    const readFrom = async (from: number) => {
      for (let i = from; i < sources.length; i++) {
        // At most perHour sources started in any hour.
        for (;;) {
          job.starts = (job.starts ?? []).filter((t) => t > now() - 3600_000);
          if (job.starts.length < perHour) break;
          await sleep(Math.max(1000, job.starts[0] + 3600_000 - now() + 1000));
        }
        job.starts.push(now());
        const rel = sources[i];
        const src = rel.startsWith('raw/') ? readSource(root, rel) : readArchived(archiveDir, rel);
        let ok = !src;
        for (let attempt = 0; src && !ok && attempt < 2; attempt++) {
          if (attempt) await sleep(o.retryMs ?? 60_000);
          ok = await digestText(db, o.ask, {
            space,
            base: 'rebuild',
            title: src.title,
            path: `rebuild:${rel}`,
            origin: src.origin,
            text: src.text,
            cut: false,
            kind: src.kind,
            notes: false,
            hash: wikiHash(src.text),
            now,
            source: rel.startsWith('raw/') ? rel : null,
            quiet: true,
            report: (r) => r.articles.forEach((p) => written.add(p)),
          });
        }
        if (!ok) job.failed = [...(job.failed ?? []), rel];
        job.done = i + 1;
        save();
        row(`Rebuilding: ${job.done} of ${job.total} sources`, [...written].slice(0, 50));
      }
    };
    if (job.phase === 'sources') {
      await readFrom(job.done);
      if (job.carried == null) {
        // What the earlier wiki said that no new article holds (the helper keeps a little of each source, and may have
        // left a topic out): those articles, from the archive, are read as sources too.
        const extra = uncovered(root, archiveDir, new Set(sources));
        job.carried = extra.length;
        sources.push(...extra);
        job.sources = sources;
        job.total = sources.length;
        save();
        if (extra.length) await readFrom(job.done);
      }
      const failed = job.failed?.length ?? 0;
      if (sources.length && failed > sources.length / 2) throw new Error(`The helper could not read ${failed} of ${sources.length} sources: restore the previous wiki, or rebuild again later`);
      job.phase = 'organise';
      save();
    }
    if (job.phase === 'organise') {
      row('Rebuilding: organising the areas', [...written].slice(0, 50));
      // One reorganisation at a time in the app: wait for another wiki's to end.
      for (let i = 0; i < 60 && reorganising(); i++) await sleep(5_000);
      const r = await reorganiseWiki(root, { db, space, propose: o.strong, check: o.ask, project: space ? (() => { const p = spaceById(db, space); return p ? { name: p.name, description: p.description } : null; })() : null, now: now(), onUpdate: o.onUpdate });
      job.did = [...(job.did ?? []), r.ran ? r.summary! : `Areas not organised: ${r.error}`];
      job.phase = 'hubs';
      save();
    }
    if (job.phase === 'hubs') {
      row('Rebuilding: writing the hubs', [...written].slice(0, 50));
      const hubs = await refreshHubs(db, o.ask, [root], { max: Infinity, now: now() });
      const merged = (await runMerges(root, o.ask, { db, space, now: now(), onUpdate: o.onUpdate })).filter((m) => m.ok).length;
      job.did = [...(job.did ?? []), `Wrote ${hubs} hub${hubs === 1 ? '' : 's'}${merged ? `; did ${merged} queued merge${merged === 1 ? '' : 's'}` : ''}`];
      job.phase = 'redirects';
      save();
    }
    if (job.phase === 'redirects') {
      row('Rebuilding: pointing old paths to the new articles', [...written].slice(0, 50));
      const r = await redirectOldPaths(db, space, root, archiveDir, now());
      job.did = [...(job.did ?? []), `${r.matched + r.toIndex} old path${r.matched + r.toIndex === 1 ? '' : 's'} now lead to the new articles (${r.toIndex} to the index)`];
    }
    await writeIndex(root).catch(() => {});
    const articles = areaArticles(root);
    const reg = loadRegistry(root);
    const areas = hasAreas(reg) ? reg.areas.length - 1 : 0;
    const failed = job.failed?.length ?? 0;
    const kept = job.total - (job.carried ?? 0);
    const carried = job.carried ? ` and ${job.carried} earlier article${job.carried === 1 ? '' : 's'} no new one covered` : '';
    const summary = `Rebuilt from ${kept} source${kept === 1 ? '' : 's'}${carried}: ${articles.length} article${articles.length === 1 ? '' : 's'}${areas ? ` in ${areas} area${areas === 1 ? '' : 's'}` : ''}${failed ? `; ${failed} source${failed === 1 ? '' : 's'} could not be read` : ''}`;
    await appendLines(root, [`- ${day(now())} · rebuilt from ${kept} sources${carried}: ${articles.length} articles (the earlier wiki is archived)`]).catch(() => {});
    Object.assign(job, { state: 'done', endedAt: now(), phase: undefined, did: [summary, ...(job.did ?? [])] });
    save();
    row(summary, articles.map((a) => a.path).slice(0, 50), failed ? `Could not read: ${job.failed!.join(', ')}`.slice(0, 600) : null);
  } catch (e) {
    Object.assign(job, { state: 'failed', endedAt: now(), error: (e as Error).message.slice(0, 400) });
    save();
    row(`Rebuild stopped after ${job.done} of ${job.total} sources`, [...written].slice(0, 50), job.error);
  } finally {
    releaseJob(space);
    o.onUpdate?.(space);
  }
}

/** An article that cited no source, read from the archive as its own source (never kept in raw/). */
function readArchived(archiveDir: string, rel: string): RebuildSource | null {
  try {
    const content = fs.readFileSync(path.join(archiveDir, ...rel.split('/')), 'utf8');
    if (redirectOf(content) != null) return null;
    const body = splitFront(content).body.trim();
    if (!body) return null;
    const title = titleOfArticle(content, path.posix.basename(rel, '.md'));
    return { path: rel, title, origin: `wiki article ${rel} of the earlier wiki`, kind: 'document', text: body.slice(0, MAX_DOC_CHARS) };
  } catch {
    return null;
  }
}

// ---- restoring ------------------------------------------------------------------------------------------------

/**
 * Puts an archived wiki back: what is there now is archived first (the latest ARCHIVES_KEPT kept). Refused while the
 * wiki rebuilds, updates or reorganises.
 */
export async function restoreArchive(db: DB, space: string | null, at: string, o: { onUpdate?: (space: string | null) => void; now?: number } = {}): Promise<{ restored: string; archived: string; articles: number }> {
  const root = rootOf(db, space);
  const name = nameOf(String(at ?? ''));
  if (!wikiArchives(root).some((a) => a.name === name)) throw new HttpError(404, 'No such archive of this wiki');
  if (!claimJob(space)) throw new HttpError(409, 'The wiki is busy with a rebuild, an update or a reorganisation: try again when it is done');
  try {
    const now = o.now ?? Date.now();
    let keepAs = archiveName(now);
    if (keepAs === name) keepAs = archiveName(now + 1);
    await restoreWiki(root, name, keepAs);
    pruneArchives(root, keepAs);
    const articles = areaArticles(root).length;
    recordUpdate(db, { space, base: 'rebuild', document: `Restored the wiki archived on ${archiveTime(name).slice(0, 16).replace('T', ' ')} (${articles} article${articles === 1 ? '' : 's'}); the one it replaced is archived`, path: `restore:${archiveTime(name)}`, articles: [], notes: 0 }, now);
    const job = jobState(db, space);
    if (job && job.state !== 'running') saveJob(db, space, { ...job, did: [`Restored the wiki archived on ${archiveTime(name)}`, ...(job.did ?? [])].slice(0, 10) });
    return { restored: archiveTime(name), archived: archiveTime(keepAs), articles };
  } finally {
    releaseJob(space);
    o.onUpdate?.(space);
  }
}

/** GET …/wiki/rebuild: what the wiki is doing at a person's request (or did last), and its archives. */
export function wikiJobStatus(db: DB, space: string | null): { state: 'idle' | 'running' | 'done' | 'failed'; kind?: string; phase?: string; done: number; total: number; startedAt?: number; endedAt?: number; error?: string; parts?: string[]; did?: string[]; archives: { at: string; articles: number }[] } {
  if (space && !spaceById(db, space)) throw new HttpError(404, 'No such project');
  let root: string | null = null;
  try {
    root = wikiMemoryOn(db, space) ? wikiRoot(db, space) : null;
  } catch {
    root = null;
  }
  const job = jobState(db, space);
  const archives = root ? archivesOf(root) : [];
  if (!job) return { state: 'idle', done: 0, total: 0, archives };
  // A job the database says runs that no part of this process runs was cut short (it is taken up at the start).
  const state = job.state === 'running' && !jobRunning(space) ? 'failed' : job.state;
  return {
    state,
    kind: job.kind,
    ...(job.phase && state === 'running' ? { phase: job.phase } : {}),
    done: job.done,
    total: job.total,
    startedAt: job.startedAt,
    ...(job.endedAt ? { endedAt: job.endedAt } : {}),
    ...(job.error || state !== job.state ? { error: job.error ?? 'It stopped when the app restarted' } : {}),
    ...(job.parts ? { parts: job.parts } : {}),
    ...(job.did?.length ? { did: job.did } : {}),
    archives,
  };
}
