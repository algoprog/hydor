// Splitting a long article: the helper reorganises it into a hub (what the topic is, with links to its parts) at the
// same path and 2–5 parts beside it. Accepted only when the parts together keep at least 90% of the text, in the words
// it had: it reorganises, it does not summarise. The article's text is kept in the wiki's history first.
import path from 'node:path';
import { secretIn } from '../../memory/secrets.ts';
import { readOrNull, slugOf, splitFront, storeArticle, bodyOf, cleanLinks, clipLine, SUMMARY_MAX, titleOfArticle, listOf, appendRevisions } from './write.ts';
import { snapshotArticle } from './history.ts';
import { resolvePaths } from './anchors.ts';
import { SPLIT_PARTS, splitPrompt, SPLIT_SYSTEM, type DigestAsk, type TextKind } from './plan.ts';

/** An article whose body is longer than this is split before it is updated. */
export const SPLIT_AT = 12_000;
/** The share of the old body the parts must hold. */
export const SPLIT_KEEP = 0.9;
/** The share of the old body's words, in order, that the parts must hold as they were. */
const SPLIT_VERBATIM = 0.8;

export interface SplitPart {
  path: string;
  title: string;
  summary: string;
  body: string;
}

export interface SplitPlan {
  hub: { body: string; summary: string };
  parts: SplitPart[];
  /** Index of the part the new text belongs in. */
  target: number;
}

const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) as string[];

/** The share of `old`'s runs of four words that `kept` has too (so a moved or rewrapped text still counts as kept). */
export function wordsKept(old: string, kept: string): number {
  const grams = (ws: string[]) => ws.slice(0, Math.max(0, ws.length - 3)).map((_, i) => ws.slice(i, i + 4).join(' '));
  const have = new Set(grams(words(kept)));
  const was = grams(words(old));
  return was.length ? was.filter((g) => have.has(g)).length / was.length : 1;
}

/** The hub and parts of the helper's answer as far as they hold up, or why not. */
export function checkSplit(raw: unknown, o: { path: string; oldBody: string; taken: Set<string>; exists: (p: string) => boolean; incoming: string }): { ok: true; plan: SplitPlan } | { ok: false; error: string } {
  const r = (raw ?? {}) as { hub?: { content?: unknown; summary?: unknown }; parts?: unknown; target?: unknown };
  const parts = Array.isArray(r.parts) ? r.parts : [];
  if (parts.length < SPLIT_PARTS.min || parts.length > SPLIT_PARTS.max) return { ok: false, error: `it gave ${parts.length} parts, not ${SPLIT_PARTS.min} to ${SPLIT_PARTS.max}` };
  if (typeof r.hub?.content !== 'string' || bodyOf(r.hub.content).length < 20) return { ok: false, error: 'it gave no hub page' };
  // wiki/areas/ holds the areas' hubs alone: an article called "Areas" keeps its parts beside it under another name.
  const slug = slugOf(path.posix.basename(o.path, '.md'));
  const dir = `wiki/${slug === 'areas' ? 'areas-parts' : slug}`;
  const taken = new Set(o.taken);
  const made: SplitPart[] = [];
  for (const p of parts as { title?: unknown; summary?: unknown; content?: unknown }[]) {
    const title = typeof p?.title === 'string' ? p.title.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const body = typeof p?.content === 'string' ? bodyOf(p.content) : '';
    if (title.length < 2 || body.length < 40) return { ok: false, error: 'a part had no title or no text' };
    const slug = slugOf(title);
    let file = `${dir}/${slug}.md`;
    for (let n = 2; taken.has(file) || o.exists(file); n++) file = `${dir}/${slug}-${n}.md`;
    taken.add(file);
    made.push({ path: file, title, summary: typeof p.summary === 'string' ? clipLine(p.summary, SUMMARY_MAX) : '', body });
  }
  const hubBody = bodyOf(r.hub.content);
  if ([hubBody, ...made.map((p) => p.body)].some((t) => secretIn(t))) return { ok: false, error: 'a part held a secret' };
  const kept = made.reduce((n, p) => n + p.body.length, 0);
  if (kept < o.oldBody.trim().length * SPLIT_KEEP) return { ok: false, error: `the parts kept ${Math.round((kept / Math.max(1, o.oldBody.trim().length)) * 100)}% of the text, under ${SPLIT_KEEP * 100}%` };
  if (wordsKept(o.oldBody, made.map((p) => p.body).join('\n')) < SPLIT_VERBATIM) return { ok: false, error: 'the parts did not keep the text in its words' };
  let target = typeof r.target === 'number' && Number.isInteger(r.target) && r.target >= 1 && r.target <= made.length ? r.target - 1 : -1;
  if (target < 0) target = bestPart(made, o.incoming);
  return { ok: true, plan: { hub: { body: hubBody, summary: typeof r.hub.summary === 'string' ? clipLine(r.hub.summary, SUMMARY_MAX) : '' }, parts: made, target } };
}

/** The part whose words the new text shares most. */
function bestPart(parts: SplitPart[], text: string): number {
  const ws = new Set(words(text).filter((w) => w.length >= 5));
  let best = 0;
  let score = -1;
  parts.forEach((p, i) => {
    const n = new Set(words(`${p.title} ${p.title} ${p.body}`));
    const s = [...ws].filter((w) => n.has(w)).length / Math.sqrt(n.size + 1);
    if (s > score) {
      best = i;
      score = s;
    }
  });
  return best;
}

export interface SplitOutcome {
  /** The part to update with the new text, as an existing article. */
  target: { path: string; title: string; current: string };
  /** Every article the split wrote: the hub and the parts. */
  written: { path: string; title: string }[];
  parts: number;
}

/**
 * Splits an existing article. Keeps its text in the history, writes the parts and then the hub over the article, and
 * logs it. Returns what was written, or why it was not done (the article is then left as it was).
 */
export async function splitArticle(
  root: string,
  ask: DigestAsk,
  o: {
    path: string;
    title: string;
    /** The article's whole file text as it was read. */
    current: string;
    incoming: { title: string; text: string; kind?: TextKind };
    /** Every article path there is, to keep new parts off them. */
    taken: Set<string>;
    source: string;
    now: number;
    /** The project's repository and its commit, for the parts' and the hub's anchors. */
    repo?: { root: string; head: string | null } | null;
  },
): Promise<{ ok: true; done: SplitOutcome } | { ok: false; error: string }> {
  const front = splitFront(o.current);
  const oldBody = front.body.trim();
  let answer: unknown;
  try {
    answer = await ask({ system: SPLIT_SYSTEM, prompt: splitPrompt({ path: o.path, title: o.title, body: oldBody, incoming: o.incoming }), maxTokens: 16_000 });
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
  const checked = checkSplit(answer, { path: o.path, oldBody, taken: o.taken, exists: (p) => readOrNull(root, p) !== null, incoming: o.incoming.text });
  if (!checked.ok) return { ok: false, error: checked.error };
  const { hub, parts, target } = checked.plan;
  const known = new Set<string>([...o.taken, o.path, ...parts.map((p) => p.path), 'index.md', 'log.md']);
  const sources = listOf(front, 'sources');
  // The parts are in the areas the article was in.
  const areas = listOf(front, 'areas');
  const head = o.repo?.head ?? null;
  const anchorsOf = (text: string) => (o.repo && head ? resolvePaths(o.repo.root, text) : Promise.resolve(undefined));
  // The text as it is now is kept first: whatever happens next, it can be got back.
  snapshotArticle(root, o.path, o.current, o.now, { source: `split into ${parts.length} parts` });
  try {
    // The parts first, so that a failure part way leaves copies of the text, never a hole in it.
    for (const p of parts) {
      const body = cleanLinks(p.body, p.path, known);
      const stored = await storeArticle(root, { path: p.path, title: p.title, body, now: o.now, summary: p.summary || undefined, anchors: await anchorsOf(body), commit: head, carry: sources, areas: areas.length ? areas : undefined });
      if (stored.status !== 'written') return { ok: false, error: `${p.path}: ${stored.reason ?? 'not written'}` };
    }
    // The hub over the article, only if it is still what was split; every part linked from it.
    const dir = path.posix.dirname(o.path);
    let hubBody = hub.body;
    const missing = parts.filter((p) => !hubBody.includes(`](${path.posix.relative(dir, p.path)})`));
    if (missing.length) hubBody += `\n\n## Parts\n\n${missing.map((p) => `- [${p.title}](${path.posix.relative(dir, p.path)})${p.summary ? ` — ${p.summary}` : ''}`).join('\n')}`;
    hubBody = cleanLinks(hubBody, o.path, known);
    const stored = await storeArticle(root, { path: o.path, title: o.title, body: hubBody, now: o.now, summary: hub.summary || undefined, anchors: await anchorsOf(hubBody), commit: head, judged: true, expect: o.current, why: `split into ${parts.length} parts` });
    if (stored.status !== 'written') return { ok: false, error: `${o.path}: ${stored.reason ?? 'not written'}; its parts were kept as articles` };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
  await appendRevisions(root, { source: o.source, now: o.now, split: [{ path: o.path, title: titleOfArticle(o.current, o.title), parts: parts.length }] });
  const part = parts[target];
  const current = readOrNull(root, part.path)?.content ?? '';
  return { ok: true, done: { target: { path: part.path, title: part.title, current }, written: [{ path: o.path, title: o.title }, ...parts.map((p) => ({ path: p.path, title: p.title }))], parts: parts.length } };
}
