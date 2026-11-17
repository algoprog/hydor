// Wiki memory from documents: when knowledge indexes a new or changed document, the helper model reads it, the
// project's wiki gets its text as a source and its articles are updated (or added), and the project's memory gets a
// few short notes. A queue in the server process keeps it gentle: a base must be quiet for a while, then one
// document at a time, a few dozen an hour. Nothing here is thrown into knowledge's indexing: what goes wrong is
// recorded as an update with its error.
import type { DB } from '../../db.ts';
import fs from 'node:fs';
import path from 'node:path';
import { baseRow, chunksOf, docByPath } from '../../knowledge/store.ts';
import { searchKnowledge } from '../../knowledge/search.ts';
import { meaningOn, queryVector } from '../../memory/embed.ts';
import type { IndexedDoc } from '../../knowledge/events.ts';
import { memoryOn, addEntry, cleanText, entries, repoRoot, sameText, titleOf } from '../../memory/store.ts';
import { redactSecrets, secretIn, steeringIn } from '../../memory/secrets.ts';
import { spaceById } from '../../spaces/index.ts';
import { browseWiki } from '../browse.ts';
import { contractDocument, ingestWikiSource, wikiHash } from '../core.ts';
import { isWikiBase, wikiKnowledgeSchema } from '../knowledge/bindings.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { wikiSettings } from '../settings/settings.ts';
import { guardWikiFolder } from '../settings/gitignore.ts';
import { analysisAvailable, analyzeDataFile, needsAnalysis } from './analyze.ts';
import { checkPlan, helperDigestAsk, planPrompt, planSystem, writePrompt, writeSystem, type ArticleLine, type DigestAsk, type TextKind } from './plan.ts';
import { gitHead, resolvePaths } from './anchors.ts';
import { SPLIT_AT, splitArticle } from './split.ts';
import { wikiReads } from './limit.ts';
import { digested, markDigested, recordUpdate } from './store.ts';
import { appendLog, appendRevisions, areasOfArticle, bodyOf, cleanLinks, clipLine, freePath, judgeRewrite, parseRemoved, readOrNull, splitFront, storeArticle, summaryOf, SUMMARY_MAX, titleOfArticle, writeIndex, type Stored } from './write.ts';
import { hasAreas, isHubPath, loadRegistry, OTHER, placedIn } from '../areas/registry.ts';
import type { Removed } from './history.ts';

/** The most of a document the helper reads. */
export const MAX_DOC_CHARS = 40_000;
/** An article longer than this is not rewritten when splitting it failed (the model could not keep all of it). */
const MAX_ARTICLE_CHARS = 20_000;
/** Articles listed to the helper, the most that bear on the document first. */
export const LIST_ARTICLES = 20;

/** Whether documents may update wiki memory (Settings → Memory → Wiki memory), as the settings say; on unless off. */
const fromDocumentsOn = (db: DB) => wikiSettings(db).fromDocuments;

/** A document's text from its passages, without the overlap each passage repeats of the one before; at most MAX_DOC_CHARS. */
export function documentText(db: DB, docId: number, max = MAX_DOC_CHARS): { text: string; cut: boolean } {
  const rows = chunksOf(db, docId, 0, 100_000);
  let text = '';
  let prev = '';
  let cut = false;
  for (const r of rows) {
    let t = r.text;
    for (let k = Math.min(prev.length, t.length, 220); k >= 20; k--) {
      if (t.startsWith(prev.slice(-k))) {
        t = t.slice(k).replace(/^\s+/, '');
        break;
      }
    }
    prev = r.text;
    text += (text ? '\n\n' : '') + t;
    if (text.length > max) {
      text = text.slice(0, max);
      cut = true;
      break;
    }
  }
  return { text, cut };
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** How the two rankings (title words, meaning) are joined: reciprocal rank fusion, as the knowledge search joins its own. */
const RRF_K = 60;

/** What the wiki's index finds by meaning for a text: article paths, best first. Nothing when meaning is off or the wiki is not indexed yet. */
async function byMeaning(db: DB, root: string, space: string | null, doc: { title: string; text: string }): Promise<string[]> {
  try {
    if (!meaningOn(db)) return [];
    wikiKnowledgeSchema(db);
    const real = fs.realpathSync(root);
    const row = db.prepare('select base from kb_wiki_bindings where root = ? and space is ? and active = 1').get(real, space) as { base: string } | undefined;
    if (!row) return [];
    const query = `${doc.title}\n${doc.text.slice(0, 1500)}`;
    const vector = await queryVector(db, query, { wait: true, timeoutMs: 20_000 });
    if (!vector) return [];
    const { hits, meaning } = await searchKnowledge(db, { query, bases: [row.base], mode: 'meaning', limit: 50, vector });
    if (!meaning) return [];
    const seen: string[] = [];
    for (const h of hits) {
      const rel = path.relative(real, h.path).split(path.sep).join('/');
      if (/^wiki\/.+\.md$/.test(rel) && !seen.includes(rel)) seen.push(rel);
    }
    return seen;
  } catch {
    // The knowledge index failing never stops the digest: the title words still rank the articles.
    return [];
  }
}

/**
 * The articles to show the helper: the best LIST_ARTICLES by the title words that are in the text and by meaning (the
 * wiki's own index, when search by meaning is on and the wiki is indexed), the two rankings fused by rank; each as its
 * path, title and summary (or first line). The full set stays for checking the paths it names.
 */
export async function listArticles(db: DB, root: string, space: string | null, doc: { title: string; text: string }): Promise<{ lines: ArticleLine[]; all: Set<string>; more: number; titles: Map<string, string> }> {
  // Hubs are kept from their articles, never written by the digest; redirects are not listed at all.
  // Contracts are handled through their own reviewed lifecycle, never as digest targets or helper context.
  const all = browseWiki(root).articles.filter((a) => {
    if (isHubPath(a.path)) return false;
    const current = readOrNull(root, a.path);
    return !!current && !contractDocument(a.path, current.content);
  });
  const registry = loadRegistry(root);
  const names = hasAreas(registry) ? new Map(registry.areas.map((a) => [a.id, a.name])) : null;
  const hay = doc.text.toLowerCase();
  const scored = all
    .map((a) => ({ a, score: (a.title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((w) => hay.includes(w)).length }))
    .sort((x, y) => y.score - x.score || x.a.path.localeCompare(y.a.path));
  const fused = new Map<string, number>();
  const join = (paths: string[]) => paths.forEach((p, i) => fused.set(p, (fused.get(p) ?? 0) + 1 / (RRF_K + i + 1)));
  join(scored.filter((s) => s.score > 0).map((s) => s.a.path));
  const known = new Set(all.map((a) => a.path));
  join((await byMeaning(db, root, space, doc)).filter((p) => known.has(p)));
  const order = new Map(scored.map((s, i) => [s.a.path, i]));
  const shown = [...all].sort((x, y) => (fused.get(y.path) ?? 0) - (fused.get(x.path) ?? 0) || order.get(x.path)! - order.get(y.path)!).slice(0, LIST_ARTICLES);
  const lines = shown.map((a) => {
    const content = readOrNull(root, a.path)?.content ?? '';
    return { path: a.path, title: a.title, first: oneLine(summaryOf(content)), ...(names ? { areas: placedIn(areasOfArticle(content), registry).map((id) => names.get(id) ?? id).join(', ') } : {}) };
  });
  return { lines, all: known, more: Math.max(0, all.length - shown.length), titles: new Map(all.map((a) => [a.path, a.title])) };
}

export interface DigestTextInput {
  /** The project (null: the shared wiki) whose wiki and memory the text goes to. */
  space: string | null;
  /** What the update is listed under: the knowledge base (documents) or another label (conversations). */
  base: string;
  title: string;
  /** A document's path, or `session:<key>`. */
  path: string;
  /** Where the kept source says it came from. */
  origin: string;
  text: string;
  /** Only part of it is given (a long document's beginning, a long conversation's first request and latest turns). */
  cut: boolean;
  kind: TextKind;
  /** Short memory notes for the project too (documents; memory's own learning does them for conversations). */
  notes: boolean;
  /** Its hash (wikiHash of the text), marked as read once the helper has answered. */
  hash: string;
  /** A conversation read before, of which only the newer turns are given. */
  continued?: boolean;
  now: () => number;
  onUpdate?: (space: string | null) => void;
  /** A source the wiki keeps already (a rebuild reads its sources again): the articles cite it, nothing is kept a second time. Null: none to keep or cite. */
  source?: string | null;
  /** No update of its own (a rebuild keeps one row for all its sources): `report` hears what it did instead. */
  quiet?: boolean;
  report?: (r: { articles: string[]; notes: number; error?: string }) => void;
}

/**
 * Everything after the text is at hand, for a document and a conversation alike: keep it as a source, ask the helper
 * which articles it bears on, write them (never shorter than they were, never with a secret), refresh the index and
 * log, add the notes, mark the text as read and record the update. Never throws: what goes wrong is the update's error. Returns whether the
 * text was digested (the helper answered, even with nothing to add); false when it could not be kept or the helper failed.
 */
export async function digestText(db: DB, ask: DigestAsk, i: DigestTextInput): Promise<boolean> {
  const { space, text: raw, cut, kind, title, hash, now } = i;
  const project = space ? spaceById(db, space) : null;
  const rec = (articles: string[], notes: number, error?: string) => {
    i.report?.({ articles, notes, error });
    if (i.quiet) return;
    recordUpdate(db, { space, base: i.base, document: i.title, path: i.path, articles, notes, error }, now());
    i.onUpdate?.(space);
  };
  const problems: string[] = [];
  let root: string | null;
  let sourcePath: string;
  let docText: string;
  try {
    root = wikiRoot(db, space, { create: true });
    if (!root) throw new Error('The wiki folder is not available');
    // Protect a project-local wiki before the first automatic write (only when Settings ask for it).
    await guardWikiFolder(db, space, root);
    // What is kept and what the helper reads has no secret in it.
    const text = redactSecrets(cut ? `${raw}\n\n… (cut here: ${kind === 'conversation' ? 'only its first request and its latest turns were read' : `only the first ${MAX_DOC_CHARS.toLocaleString('en-US')} characters of the document were read`})` : raw);
    const origin = oneLine(i.origin).slice(0, 500);
    sourcePath = i.source !== undefined ? (i.source ?? '') : ingestWikiSource(root, text, origin).path;
    docText = text;
  } catch (e) {
    rec([], 0, `Could not keep the ${kind} as a source: ${(e as Error).message}`);
    return false;
  }

  let articles: string[] = [];
  let notes = 0;
  try {
    const listing = await listArticles(db, root, space, { title, text: docText });
    const place = project ? repoRoot(project.folder) : null;
    const noteTitles = place ? entries(db, { scope: 'repo', scopeKey: place, limit: 100 }).map(titleOf) : [];
    // The wiki's areas, while it has them: each new article is placed in one in the same call.
    const registry = loadRegistry(root);
    const areas = hasAreas(registry) ? registry.areas.filter((a) => a.id !== OTHER).map((a) => ({ id: a.id, name: a.name, about: a.about })) : undefined;
    const plan = checkPlan(
      await ask({ system: planSystem(kind), prompt: planPrompt({ project: project ? { name: project.name, description: project.description } : null, document: { title, text: docText, cut, kind, continued: i.continued }, articles: listing.lines, more: listing.more, noteTitles, areas }), maxTokens: 2000 }),
      listing.all,
      areas ? new Set([...areas.map((a) => a.id), OTHER]) : undefined,
    );
    const at = now();
    // The project's repository, for the paths an article names and the commit it was written against (none outside git).
    const head = place ? await gitHead(place) : null;
    const repo = place && head ? { root: place, head } : null;
    const written: { path: string; title: string }[] = [];

    // The articles to write: existing ones with their text (a long one is split first), new ones with a free path.
    const targets: { path: string; title: string; current?: string; area?: string }[] = [];
    for (const p of plan.update) {
      const cur = readOrNull(root, p);
      // A review could have turned an article into a contract while the model was planning.
      if (!cur || contractDocument(p, cur.content)) continue;
      const title0 = titleOfArticle(cur.content, listing.titles.get(p) ?? p);
      if (splitFront(cur.content).body.length > SPLIT_AT) {
        const s = await splitArticle(root, ask, { path: p, title: title0, current: cur.content, incoming: { title, text: docText, kind }, taken: new Set(listing.all), source: title, now: at, repo });
        if (s.ok) {
          // The article is a hub now; the new text goes to the part it belongs in.
          for (const w of s.done.written) {
            written.push(w);
            listing.all.add(w.path);
            listing.titles.set(w.path, w.title);
          }
          targets.push(s.done.target);
          continue;
        }
        problems.push(`${p}: could not split it (${s.error})`);
      }
      if (cur.content.length > MAX_ARTICLE_CHARS) {
        problems.push(`${p} is too long to rewrite: left as it was`);
        continue;
      }
      targets.push({ path: p, title: title0, current: cur.content });
    }
    const taken = new Set<string>([...listing.all, ...targets.map((t) => t.path)]);
    for (const c of plan.create) {
      // A "new" article whose title an article has already is that article: updated, never made twice ("Title" and "Title 2").
      const same = [...listing.titles].find(([p, t]) => t.trim().toLowerCase() === c.title.trim().toLowerCase() && !targets.some((x) => x.path === p))?.[0];
      const cur = same ? readOrNull(root, same) : null;
      if (same && cur && splitFront(cur.content).body.length <= SPLIT_AT && cur.content.length <= MAX_ARTICLE_CHARS) {
        targets.push({ path: same, title: titleOfArticle(cur.content, c.title), current: cur.content });
        continue;
      }
      const p = freePath(root, c.title, taken);
      taken.add(p);
      targets.push({ path: p, title: c.title, ...(c.area ? { area: c.area } : {}) });
    }

    if (targets.length) {
      const answer = (await ask({ system: writeSystem(kind), prompt: writePrompt({ today: new Date(at).toISOString().slice(0, 10), document: { title, text: docText, cut, kind, continued: i.continued }, targets, others: [...listing.titles].filter(([p]) => !targets.some((t) => t.path === p)).slice(0, 60).map(([path, title]) => ({ path, title })) }), maxTokens: 8000 })) as { articles?: { path?: unknown; content?: unknown; summary?: unknown; removed?: unknown }[] };
      const accepted: { target: (typeof targets)[number]; body: string; summary?: string; removed: { items: Removed[]; valid: boolean } }[] = [];
      for (const a of Array.isArray(answer?.articles) ? answer.articles : []) {
        const target = targets.find((t) => t.path === a.path);
        if (!target || accepted.some((x) => x.target === target) || typeof a.content !== 'string') continue;
        const body = bodyOf(a.content);
        if (body.length < 20) continue;
        if (secretIn(body)) {
          problems.push(`${target.path}: left out, it held a secret`);
          continue;
        }
        // A shorter rewrite is accepted only with a list of what it replaced, each with its reason.
        const removed = parseRemoved(a.removed);
        if (target.current != null) {
          const j = judgeRewrite(splitFront(target.current).body, body, removed);
          if (!j.ok) {
            problems.push(`${target.path}: left as it was, ${j.reason}`);
            continue;
          }
        }
        accepted.push({ target, body, summary: typeof a.summary === 'string' && a.summary.trim() ? clipLine(a.summary, SUMMARY_MAX) : undefined, removed });
      }
      // A link may go to an article, the source, the index and the log, not to anything else.
      const known = new Set<string>([...listing.all, ...accepted.map((x) => x.target.path), ...(sourcePath ? [sourcePath] : []), 'index.md', 'log.md']);
      const revised: { path: string; title: string; replaced: number }[] = [];
      const plain: { path: string; title: string }[] = [];
      for (const { target, body, summary, removed } of accepted) {
        try {
          const text = cleanLinks(body, target.path, known);
          // The article is written against what the file holds now: another writer may have changed it since it was read.
          const stored: Stored = await storeArticle(root, { path: target.path, title: target.title, body: text, source: sourcePath || undefined, now: at, summary, anchors: repo ? await resolvePaths(repo.root, text) : undefined, commit: head, removed, why: title, areas: target.area ? [target.area] : undefined });
          if (stored.status === 'refused' && stored.reason !== 'changed meanwhile') problems.push(`${target.path}: left as it was, ${stored.reason}`);
          else if (stored.status !== 'written') problems.push(`${target.path}: changed meanwhile, left as it is now`);
          else {
            const entry = { path: target.path, title: titleOfArticle(readOrNull(root, target.path)?.content ?? '', target.title) };
            if (stored.replaced) revised.push({ ...entry, replaced: stored.replaced });
            else plain.push(entry);
            if (!written.some((w) => w.path === target.path)) written.push(entry);
          }
        } catch (e) {
          problems.push(`${target.path}: ${(e as Error).message}`);
        }
      }
      if (written.length) {
        try {
          await writeIndex(root);
          if (plain.length) await appendLog(root, { document: title, articles: plain, now: at });
          if (revised.length) await appendRevisions(root, { source: title, now: at, revised });
        } catch (e) {
          problems.push(`index or log: ${(e as Error).message}`);
        }
      }
    } else if (written.length) {
      try {
        await writeIndex(root);
      } catch (e) {
        problems.push(`index: ${(e as Error).message}`);
      }
    }
    articles = written.map((w) => w.path);

    // Notes for a project's documents: short, new, with nothing secret and nothing that steers.
    if (i.notes && project && place) {
      for (const n of plan.notes) {
        const body = cleanText(/^from\b/i.test(n.text) ? n.text : `From ${title}: ${n.text}`);
        if (secretIn(body) || steeringIn(body) || sameText(db, { scope: 'repo', scopeKey: place }, body)) continue;
        try {
          addEntry(db, { scope: 'repo', scopeKey: place, text: body, title: n.title || undefined, basis: 'inferred' }, { source: 'auto', why: `Read ${title}` });
          notes++;
        } catch (e) {
          problems.push(`note: ${(e as Error).message}`);
        }
      }
    }
    markDigested(db, space, hash, now());
    if (!articles.length && !notes && !problems.length) problems.push('Nothing in it to add to the wiki or to memory');
    rec(articles, notes, problems.length ? problems.join('; ').slice(0, 600) : undefined);
    return true;
  } catch (e) {
    // The helper failed (not there, a refused answer…): recorded; the document is tried again when it changes.
    rec(articles, notes, `${(e as Error).message}`.slice(0, 300));
    return false;
  }
}

export interface DigestOptions {
  /** The helper (default: the helper model of Settings → Models). */
  ask?: DigestAsk;
  /** How long a base must have no new document before its documents are read (default 30 s). */
  quietMs?: number;
  /** Most documents read an hour (default 40). */
  perHour?: number;
  now?: () => number;
  /** The timers do not keep the process alive (default; a test waiting on them turns it off). */
  unref?: boolean;
  /** Told after each recorded update, with the project (null: the shared wiki). */
  onUpdate?: (space: string | null) => void;
}

export interface Digest {
  /** A document was indexed. */
  enqueue(doc: IndexedDoc): void;
  /** How many documents wait. */
  pending(): number;
  /**
   * Reads now the waiting documents `match` picks, without waiting for their base to be quiet (the hour's budget
   * still holds): how many were read when none of them waits any more or the budget stops them.
   */
  readNow(match: (doc: IndexedDoc) => boolean): Promise<number>;
  /** Resolves when nothing is running and nothing waits that could run now (waiting for the hour's budget does not count). */
  settled(): Promise<void>;
  /** Stops the timers. */
  dispose(): void;
}

type Outcome = 'done' | 'skip' | 'later';

export function createDigest(db: DB, o: DigestOptions = {}): Digest {
  const ask = o.ask ?? helperDigestAsk(db);
  const quietMs = o.quietMs ?? 30_000;
  const perHour = o.perHour ?? 40;
  const now = o.now ?? Date.now;
  /** Waiting documents in the order they came, one per document. */
  const waiting: { ev: IndexedDoc; at: number }[] = [];
  const lastAt = new Map<string, number>();
  const starts: number[] = [];
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let watchers: (() => void)[] = [];

  const readyIndex = () => waiting.findIndex((w) => now() - (lastAt.get(w.ev.base) ?? 0) >= quietMs);
  const budgetBlocked = () => {
    while (starts.length && starts[0] <= now() - 3600_000) starts.shift();
    return starts.length >= perHour;
  };
  const check = () => {
    const idle = !running && (!waiting.length || (readyIndex() >= 0 && budgetBlocked()));
    if (idle) {
      const w = watchers;
      watchers = [];
      w.forEach((f) => f());
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = undefined;
    if (running || !waiting.length) return;
    let at = Math.min(...waiting.map((w) => (lastAt.get(w.ev.base) ?? 0) + quietMs));
    if (at <= now() && budgetBlocked()) at = starts[0] + 3600_000 + 1000;
    timer = setTimeout(() => void run(), Math.max(0, at - now()));
    if (o.unref !== false) timer.unref?.();
  };

  async function run() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const i = readyIndex();
        if (i < 0) break;
        const item = waiting[i];
        waiting.splice(i, 1);
        let outcome: Outcome = 'skip';
        try {
          outcome = await digestOne(item.ev);
        } catch (e) {
          console.warn(`[wiki] digest of ${item.ev.path}: ${(e as Error).message}`);
        }
        if (outcome === 'later') {
          waiting.splice(i, 0, item);
          break;
        }
      }
    } finally {
      running = false;
      schedule();
      check();
    }
  }

  async function digestOne(ev: IndexedDoc): Promise<Outcome> {
    let base;
    try {
      base = baseRow(db, ev.base);
    } catch {
      return 'skip';
    }
    // A wiki's own folder is a knowledge base too: it must not digest itself.
    if (isWikiBase(db, base.id)) return 'skip';
    const space = base.space;
    const project = space ? spaceById(db, space) : null;
    if (space && !project) return 'skip';
    if (!memoryOn(db) || !fromDocumentsOn(db) || !wikiMemoryOn(db, space)) return 'skip';
    // More documents than its wiki reads (Wiki memory's limit): it reads the pinned, the most used and the newest; the rest stay for agents to search, with no update listed for each.
    if (!wikiReads(db, space, base.id, ev.path)) return 'skip';
    const doc = docByPath(db, ev.path, [base.id]);
    if (!doc || doc.status !== 'indexed') return 'skip';
    const { text: raw, cut } = documentText(db, doc.id);
    if (!raw.trim()) return 'skip';
    const hash = wikiHash(raw);
    if (digested(db, space, hash)) return 'skip';
    // A large data file (a big CSV, a spreadsheet, JSON data) reads badly as text: the helper analyses it with code in a
    // sandbox and only its findings go on to the wiki. Where there is no such sandbox, agents search it only.
    const data = needsAnalysis({ path: doc.path, format: doc.format, size: doc.size }, cut ? Number.POSITIVE_INFINITY : raw.length);
    const listed = (error: string) => {
      recordUpdate(db, { space, base: base.id, document: doc.title, path: doc.path, articles: [], notes: 0, error }, now());
      o.onUpdate?.(space);
    };
    if (data && !analysisAvailable()) {
      listed('A large data file: agents search it, but it was not analysed for the wiki, as this computer has no sandbox to run code in');
      return 'done';
    }
    if (budgetBlocked()) {
      return 'later';
    }
    starts.push(now());

    if (data) {
      const a = await analyzeDataFile({ file: doc.path, title: doc.title, ask });
      if (!a.ok) {
        // Tried again when the file changes.
        listed(`Could not analyse it with code: ${a.error}`.slice(0, 300));
        return 'done';
      }
      const text = `Findings from analysing the data file ${doc.title} with code (${a.runs} run${a.runs === 1 ? '' : 's'}; the file itself stays in the project's knowledge, for agents to search and analyse):\n\n${a.findings}`;
      await digestText(db, ask, { space, base: base.id, title: doc.title, path: doc.path, origin: `knowledge:${base.name}/${doc.title} (analysed with code)`, text, cut: false, kind: 'document', notes: true, hash, now, onUpdate: o.onUpdate });
      return 'done';
    }
    await digestText(db, ask, { space, base: base.id, title: doc.title, path: doc.path, origin: `knowledge:${base.name}/${doc.title}`, text: raw, cut, kind: 'document', notes: true, hash, now, onUpdate: o.onUpdate });
    return 'done';
  }

  return {
    enqueue(ev) {
      const i = waiting.findIndex((w) => w.ev.base === ev.base && w.ev.path === ev.path);
      if (i >= 0) waiting.splice(i, 1);
      waiting.push({ ev, at: now() });
      lastAt.set(ev.base, now());
      schedule();
    },
    pending: () => waiting.length,
    async readNow(match) {
      const mine = waiting.filter((w) => match(w.ev));
      if (!mine.length) return 0;
      for (const w of mine) lastAt.set(w.ev.base, now() - quietMs);
      const before = waiting.length;
      if (!running) void run();
      await new Promise<void>((resolve) => {
        watchers.push(resolve);
        check();
      });
      return Math.max(0, before - waiting.length);
    },
    settled: () =>
      new Promise<void>((resolve) => {
        watchers.push(resolve);
        check();
      }),
    dispose() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
