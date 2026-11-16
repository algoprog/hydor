// Wiki memory from documents: when knowledge indexes a new or changed document, the helper model reads it, the
// project's wiki gets its text as a source and its articles are updated (or added), and the project's memory gets a
// few short notes. A queue in the server process keeps it gentle: a base must be quiet for a while, then one
// document at a time, a few dozen an hour. Nothing here is thrown into knowledge's indexing: what goes wrong is
// recorded as an update with its error.
import type { DB } from '../../db.ts';
import { baseRow, chunksOf, docByPath } from '../../knowledge/store.ts';
import type { IndexedDoc } from '../../knowledge/events.ts';
import { memoryOn, addEntry, cleanText, entries, repoRoot, sameText, titleOf } from '../../memory/store.ts';
import { redactSecrets, secretIn, steeringIn } from '../../memory/secrets.ts';
import { spaceById } from '../../spaces/index.ts';
import { browseWiki } from '../browse.ts';
import { ingestWikiSource, wikiHash } from '../core.ts';
import { isWikiBase } from '../knowledge/bindings.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { wikiSettings } from '../settings/settings.ts';
import { checkPlan, helperDigestAsk, planPrompt, planSystem, writePrompt, writeSystem, type ArticleLine, type DigestAsk, type TextKind } from './plan.ts';
import { digested, markDigested, recordUpdate } from './store.ts';
import { appendLog, bodyOf, cleanLinks, composeArticle, freePath, readOrNull, splitFront, titleOfArticle, writeFile, writeIndex } from './write.ts';

/** The most of a document the helper reads. */
export const MAX_DOC_CHARS = 40_000;
/** An article longer than this is not rewritten (the model could not keep all of it). */
const MAX_ARTICLE_CHARS = 20_000;
/** Articles listed to the helper, the most that bear on the document first. */
const LIST_ARTICLES = 80;
/** A rewrite shorter than this share of the old article is refused: it dropped what the article said. */
const KEEP_SHARE = 0.8;

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

/** The articles to show the helper: the ones whose title words are in the document first. */
function listArticles(root: string, docText: string): { lines: ArticleLine[]; all: Set<string>; more: number; titles: Map<string, string> } {
  const all = browseWiki(root).articles;
  const hay = docText.toLowerCase();
  const scored = all.map((a) => {
    const words = a.title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
    return { a, score: words.filter((w) => hay.includes(w)).length };
  });
  scored.sort((x, y) => y.score - x.score || x.a.path.localeCompare(y.a.path));
  const shown = scored.slice(0, LIST_ARTICLES).map((s) => s.a);
  const lines = shown.map((a) => {
    const body = splitFront(readOrNull(root, a.path)?.content ?? '').body;
    const first = body.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
    return { path: a.path, title: a.title, first: oneLine(first) };
  });
  return { lines, all: new Set(all.map((a) => a.path)), more: Math.max(0, all.length - shown.length), titles: new Map(all.map((a) => [a.path, a.title])) };
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
  now: () => number;
  onUpdate?: (space: string | null) => void;
}

/**
 * Everything after the text is at hand, for a document and a conversation alike: keep it as a source, ask the helper
 * which articles it bears on, write them (never shorter than they were, never with a secret), refresh the index and
 * log, add the notes, mark the text as read and record the update. Never throws: what goes wrong is the update's error.
 */
export async function digestText(db: DB, ask: DigestAsk, i: DigestTextInput): Promise<void> {
  const { space, text: raw, cut, kind, title, hash, now } = i;
  const project = space ? spaceById(db, space) : null;
  const rec = (articles: string[], notes: number, error?: string) => {
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
    // What is kept and what the helper reads has no secret in it.
    const text = redactSecrets(cut ? `${raw}\n\n… (cut here: ${kind === 'conversation' ? 'only its first request and its latest turns were read' : `only the first ${MAX_DOC_CHARS.toLocaleString('en-US')} characters of the document were read`})` : raw);
    const origin = oneLine(i.origin).slice(0, 500);
    sourcePath = ingestWikiSource(root, text, origin).path;
    docText = text;
  } catch (e) {
    rec([], 0, `Could not keep the ${kind} as a source: ${(e as Error).message}`);
    return;
  }

  let articles: string[] = [];
  let notes = 0;
  try {
    const listing = listArticles(root, docText);
    const place = project ? repoRoot(project.folder) : null;
    const noteTitles = place ? entries(db, { scope: 'repo', scopeKey: place, limit: 100 }).map(titleOf) : [];
    const plan = checkPlan(await ask({ system: planSystem(kind), prompt: planPrompt({ project: project ? { name: project.name, description: project.description } : null, document: { title, text: docText, cut, kind }, articles: listing.lines, more: listing.more, noteTitles }), maxTokens: 2000 }), listing.all);

    // The articles to write: existing ones with their text, new ones with a free path.
    const targets: { path: string; title: string; current?: string }[] = [];
    for (const p of plan.update) {
      const cur = readOrNull(root, p);
      if (!cur) continue;
      if (cur.content.length > MAX_ARTICLE_CHARS) {
        problems.push(`${p} is too long to rewrite: left as it was`);
        continue;
      }
      targets.push({ path: p, title: titleOfArticle(cur.content, listing.titles.get(p) ?? p), current: cur.content });
    }
    const taken = new Set<string>([...listing.all, ...targets.map((t) => t.path)]);
    for (const c of plan.create) {
      const p = freePath(root, c.title, taken);
      taken.add(p);
      targets.push({ path: p, title: c.title });
    }

    if (targets.length) {
      const answer = (await ask({ system: writeSystem(kind), prompt: writePrompt({ document: { title, text: docText, cut, kind }, targets, others: [...listing.titles].filter(([p]) => !targets.some((t) => t.path === p)).slice(0, 60).map(([path, title]) => ({ path, title })) }), maxTokens: 8000 })) as { articles?: { path?: unknown; content?: unknown }[] };
      const accepted: { target: (typeof targets)[number]; body: string }[] = [];
      for (const a of Array.isArray(answer?.articles) ? answer.articles : []) {
        const target = targets.find((t) => t.path === a.path);
        if (!target || accepted.some((x) => x.target === target) || typeof a.content !== 'string') continue;
        const body = bodyOf(a.content);
        if (body.length < 20) continue;
        if (secretIn(body)) {
          problems.push(`${target.path}: left out, it held a secret`);
          continue;
        }
        if (target.current != null && body.length < splitFront(target.current).body.trim().length * KEEP_SHARE) {
          problems.push(`${target.path}: left as it was, the new text dropped what it said`);
          continue;
        }
        accepted.push({ target, body });
      }
      // A link may go to an article, the source, the index and the log, not to anything else.
      const known = new Set<string>([...listing.all, ...accepted.map((x) => x.target.path), sourcePath, 'index.md', 'log.md']);
      const written: { path: string; title: string }[] = [];
      const at = now();
      for (const { target, body } of accepted) {
        try {
          const text = cleanLinks(body, target.path, known);
          const did = await writeFile(root, target.path, (cur) => {
            // Another writer may have grown the article since it was read: never drop what it says now.
            if (cur != null && text.length < splitFront(cur).body.trim().length * KEEP_SHARE) return null;
            return composeArticle(cur, text, { title: target.title, source: sourcePath, now: at });
          });
          if (did) written.push({ path: target.path, title: target.title });
          else problems.push(`${target.path}: changed meanwhile, left as it is now`);
        } catch (e) {
          problems.push(`${target.path}: ${(e as Error).message}`);
        }
      }
      articles = written.map((w) => w.path);
      if (written.length) {
        try {
          await writeIndex(root);
          await appendLog(root, { document: title, articles: written.map((w) => ({ path: w.path, title: titleOfArticle(readOrNull(root, w.path)?.content ?? '', w.title) })), now: at });
        } catch (e) {
          problems.push(`index or log: ${(e as Error).message}`);
        }
      }
    }

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
  } catch (e) {
    // The helper failed (not there, a refused answer…): recorded; the document is tried again when it changes.
    rec(articles, notes, `${(e as Error).message}`.slice(0, 300));
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
    const doc = docByPath(db, ev.path, [base.id]);
    if (!doc || doc.status !== 'indexed') return 'skip';
    const { text: raw, cut } = documentText(db, doc.id);
    if (!raw.trim()) return 'skip';
    const hash = wikiHash(raw);
    if (digested(db, space, hash)) return 'skip';
    if (budgetBlocked()) {
      return 'later';
    }
    starts.push(now());

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
