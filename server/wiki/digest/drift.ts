// Articles that name files of the project's repository go out of date when those files change. Once a day, for each
// project whose folder is a git repository, an article's `anchors:` are compared with what changed since the commit it
// was written against (`git diff --name-only`, no model): the article gets `stale:`. Then a few stale articles a day are
// brought up to date by the helper from the article and the diffs, under the rules of every rewrite (the earlier
// text kept in the history, what was replaced listed with its reasons, a line in the log).
import { execFile } from 'node:child_process';
import { kvGet, kvSet, type DB } from '../../db.ts';
import { memoryOn, repoRoot } from '../../memory/store.ts';
import { redactSecrets, secretIn } from '../../memory/secrets.ts';
import { allSpaces } from '../../spaces/index.ts';
import { browseWiki } from '../browse.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { gitHead } from './anchors.ts';
import { DRIFT_SYSTEM, driftPrompt, helperDigestAsk, type DigestAsk } from './plan.ts';
import { recordUpdate } from './store.ts';
import { appendRevisions, bodyOf, cleanLinks, clipLine, parseRemoved, readOrNull, splitFront, storeArticle, SUMMARY_MAX, titleOfArticle, trackingOf, withStale, writeFile, writeIndex } from './write.ts';
import { resolvePaths } from './anchors.ts';

/** Stale articles the helper revises a day for each project. */
export const REVISE_PER_DAY = 5;
/** Each article's diff is cut to this many characters. */
export const DIFF_CHARS = 3_000;
/** How often a project's wiki is checked. */
export const DRIFT_EVERY_MS = 24 * 3_600_000;
/** The first check comes this long after the start, and then one is looked for this often (each project is checked once a day). */
const FIRST_MS = 10 * 60_000;
const TICK_MS = 3 * 3_600_000;

const GIT_TIMEOUT_MS = 10_000;
const git = (root: string, args: string[]): Promise<string | null> =>
  new Promise((resolve) => {
    execFile('git', ['-C', root, '-c', 'core.quotepath=off', ...args], { timeout: GIT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, out) => resolve(err ? null : out));
  });

/** The files that changed between a commit and HEAD, or null when the commit is not known (rewritten history). */
async function changedSince(root: string, commit: string): Promise<string[] | null> {
  const out = await git(root, ['diff', '--name-only', '-z', commit, 'HEAD']);
  return out == null ? null : out.split('\0').filter(Boolean);
}

/** The anchors (files, or directories ending in "/") that a changed file touches. */
export const touched = (anchors: string[], changed: string[]): string[] => anchors.filter((a) => (a.endsWith('/') ? changed.some((c) => c.startsWith(a)) : changed.includes(a)));

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface DriftOutcome {
  /** Articles marked or cleared as stale. */
  marked: number;
  /** Articles the helper brought up to date. */
  revised: number;
}

export interface DriftOptions {
  ask?: DigestAsk;
  now?: () => number;
  onUpdate?: (space: string | null) => void;
  /** Check every project now, whatever its last check (a test, Update now). */
  force?: boolean;
  /** One project alone (Update now). */
  only?: string;
  /** Stale articles revised at most (default REVISE_PER_DAY). */
  revise?: number;
}

/** One project's wiki: mark the stale articles, then revise a few. */
async function checkOne(db: DB, space: string, o: Required<Pick<DriftOptions, 'now'>> & DriftOptions): Promise<DriftOutcome> {
  const out: DriftOutcome = { marked: 0, revised: 0 };
  const project = allSpaces(db).find((s) => s.id === space);
  const root = wikiRoot(db, space);
  if (!project || !root) return out;
  const repo = repoRoot(project.folder);
  const head = repo ? await gitHead(repo) : null;
  if (!repo || !head) return out;
  const now = o.now();

  // Which articles name files that changed since their commit.
  const changes = new Map<string, string[] | null>();
  const stale: { path: string; title: string; commit: string; paths: string[] }[] = [];
  for (const a of browseWiki(root).articles) {
    const cur = readOrNull(root, a.path);
    if (!cur) continue;
    const t = trackingOf(cur.content);
    if (!t.anchors.length || !t.commit) continue;
    if (!changes.has(t.commit)) changes.set(t.commit, t.commit === head ? [] : await changedSince(repo, t.commit));
    const changed = changes.get(t.commit);
    if (!changed) continue;
    const paths = touched(t.anchors, changed);
    if (paths.join('\n') !== t.stale.join('\n')) {
      const did = await writeFile(root, a.path, (text) => (text != null && text === cur.content ? withStale(text, paths) : null));
      if (did) out.marked++;
    }
    if (paths.length) stale.push({ path: a.path, title: a.title, commit: t.commit, paths });
  }
  if (!stale.length) return out;

  // The ones tried longest ago first, so an article the helper cannot revise does not keep the others waiting.
  const triedKey = `wiki.drift.tried.${space}`;
  const tried = JSON.parse(kvGet(db, triedKey) || '{}') as Record<string, number>;
  stale.sort((x, y) => (tried[x.path] ?? 0) - (tried[y.path] ?? 0) || x.path.localeCompare(y.path));
  const ask = o.ask ?? helperDigestAsk(db);
  const revised: { path: string; title: string; replaced: number }[] = [];
  const problems: string[] = [];
  const written: string[] = [];
  const source = `code changes since ${stale[0].commit.slice(0, 7)}`;
  for (const s of stale.slice(0, o.revise ?? REVISE_PER_DAY)) {
    tried[s.path] = now;
    try {
      const cur = readOrNull(root, s.path);
      if (!cur) continue;
      const diff = await git(repo, ['diff', '--no-color', '-U2', s.commit, 'HEAD', '--', ...s.paths.slice(0, 5)]);
      if (!diff?.trim()) continue;
      const answer = (await ask({ system: DRIFT_SYSTEM, prompt: driftPrompt({ path: s.path, title: s.title, text: cur.content, paths: s.paths, diff: redactSecrets(diff).slice(0, DIFF_CHARS), today: day(now), commit: s.commit }), maxTokens: 8000 })) as { status?: unknown; content?: unknown; summary?: unknown; removed?: unknown };
      if (answer?.status === 'keep') {
        // Still true: written against today's commit, so it is not looked at again until something else changes.
        await writeFile(root, s.path, (text) => (text != null && text === cur.content ? withCommit(text, head) : null));
        out.marked++;
        continue;
      }
      if (answer?.status !== 'revise' || typeof answer.content !== 'string') {
        problems.push(`${s.path}: the helper gave no usable answer`);
        continue;
      }
      const body = bodyOf(answer.content);
      if (body.length < 20 || secretIn(body)) {
        problems.push(`${s.path}: left as it was, the new text was empty or held a secret`);
        continue;
      }
      const known = new Set<string>([...browseWiki(root).articles.map((a) => a.path), 'index.md', 'log.md']);
      const text = cleanLinks(body, s.path, known);
      const stored = await storeArticle(root, {
        path: s.path,
        title: titleOfArticle(cur.content, s.title),
        body: text,
        now,
        summary: typeof answer.summary === 'string' && answer.summary.trim() ? clipLine(answer.summary, SUMMARY_MAX) : undefined,
        anchors: await resolvePaths(repo, text),
        commit: head,
        removed: parseRemoved(answer.removed),
        why: source,
        expect: cur.content,
      });
      if (stored.status !== 'written') {
        problems.push(`${s.path}: left as it was, ${stored.reason ?? 'nothing changed'}`);
        continue;
      }
      out.revised++;
      written.push(s.path);
      revised.push({ path: s.path, title: titleOfArticle(readOrNull(root, s.path)?.content ?? '', s.title), replaced: stored.replaced });
    } catch (e) {
      // The helper is not there, or timed out: the rest wait for the next day.
      problems.push(`${s.path}: ${(e as Error).message.slice(0, 120)}`);
      break;
    }
  }
  // Marks of articles that are gone or old are dropped.
  for (const p of Object.keys(tried)) if (now - tried[p] > 30 * 86_400_000) delete tried[p];
  kvSet(db, triedKey, JSON.stringify(tried));
  if (revised.length) {
    try {
      await writeIndex(root);
      await appendRevisions(root, { source, now, revised });
    } catch (e) {
      problems.push(`index or log: ${(e as Error).message}`);
    }
  }
  if (written.length || problems.length) {
    recordUpdate(db, { space, base: 'code changes', document: 'Code changes', path: `code:${head.slice(0, 10)}`, articles: written, notes: 0, error: problems.length ? problems.join('; ').slice(0, 600) : undefined }, now);
    o.onUpdate?.(space);
  }
  return out;
}

/** The article's `commit:` set to a commit, with `stale:` removed; the body and every other key as they were. */
function withCommit(text: string, commit: string): string {
  const f = splitFront(text);
  if (!f.keys.length) return text;
  const lines = f.keys.filter((k) => k.key !== 'stale').flatMap((k) => (k.key === 'commit' ? [`commit: ${commit}`] : k.lines));
  if (!f.keys.some((k) => k.key === 'commit')) lines.push(`commit: ${commit}`);
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)!;
  return `---\n${lines.join('\n')}\n---\n${text.slice(m[0].length)}`;
}

/**
 * Checks every project wiki that has not been checked for a day: its project's folder is a git repository, memory and
 * wiki memory are on for it. Never throws.
 */
export async function checkWikiDrift(db: DB, o: DriftOptions = {}): Promise<DriftOutcome> {
  const total: DriftOutcome = { marked: 0, revised: 0 };
  const now = o.now ?? Date.now;
  if (!memoryOn(db)) return total;
  for (const space of allSpaces(db)) {
    try {
      if (o.only && space.id !== o.only) continue;
      if (!wikiMemoryOn(db, space.id)) continue;
      const key = `wiki.drift.checked.${space.id}`;
      if (!o.force && now() - Number(kvGet(db, key) || 0) < DRIFT_EVERY_MS) continue;
      const r = await checkOne(db, space.id, { ...o, now });
      kvSet(db, key, String(now()));
      total.marked += r.marked;
      total.revised += r.revised;
    } catch (e) {
      console.warn(`[wiki] checking articles against the code of ${space.name}: ${(e as Error).message}`);
    }
  }
  return total;
}

let timers: NodeJS.Timeout[] = [];

/** Starts the daily check (the first one soon after the start, then every few hours: each project is checked once a day). */
export function startWikiDrift(db: DB, onUpdate?: (space: string | null) => void): void {
  timers.forEach((t) => clearTimeout(t));
  const run = () => void checkWikiDrift(db, { onUpdate });
  const first = setTimeout(run, FIRST_MS);
  const every = setInterval(run, TICK_MS);
  first.unref?.();
  every.unref?.();
  timers = [first, every];
}
