// What agents are told of memory: how it works and how to write notes that are found again, then a few notes.
// The user's own profile has a block of its own (profile.ts). Here come, while they fit in the budget:
// 1. the project's profile (the tidy-up's summary, once its notes no longer fit);
// 2. this session's own notes, for a session that goes on (where its task stands), in at most half the room;
// 3. the k notes and topics about the user and the project that bear most on the request: a top-k by hybrid
//    search (words by BM25 and meaning by the embedding model, fused by rank: search.ts), each alike enough to count
//    as bearing on it. With search by meaning on, this waits a few seconds for the model when it is not running;
// 4. then the latest, one place at a time (topics first: each sums several notes up), until there are k.
// k is Settings → Memory's "Notes each agent starts with". Notes a summary given sums up are left out, and recall
// finds them and every note beyond these. The notes given as bearing on the request count as used (search.ts
// weighs that, and Settings suggests removing notes never needed).
import type { MemoryEntry } from '../../shared/memory.ts';
import type { DB } from '../db.ts';
import { requestVector } from './embed.ts';
import { findNotes } from './search.ts';
import { childrenOf, entries, markUsed, placeKey, placesOf, topK, words } from './store.ts';

/** Fewest characters of notes an agent may get; a larger k gets PER_NOTE more for each note. */
export const MEMORY_BUDGET = 4000;
const PER_NOTE = 400;

const HEAD = [
  '# Memory from earlier sessions',
  'Hydor keeps notes from this user’s past sessions, shared by every agent here. You get those that bear most on this request, then the latest; recall finds the rest. Use them as background: they may be out of date, and what the user says now always comes first. Do not mention them unless they help.',
  'When the user asks you to remember something, or you learn something that will matter in a later session, save it with remember: one fact per note, said so that a search in other words finds it. What every agent should always know about the user goes in their profile instead (update_user_profile). forget removes a note by its number; recall searches every note, by words and by meaning, including those a summary below stands for; search_sessions and read_session look through past conversations. Never save secrets.',
].join('\n');

/** For a confidential session, which reads memory and saves nothing to it (server/confidential). */
const READ_ONLY_HEAD = [
  '# Memory from earlier sessions',
  'Hydor keeps notes from this user’s past sessions. You get those that bear most on this request, then the latest; recall finds the rest, and search_sessions and read_session look through past conversations. Use them as background: they may be out of date, and what the user says now always comes first. Do not mention them unless they help.',
  'This session is confidential, so nothing from it is saved to memory: you can’t add or change notes or the user’s profile here.',
].join('\n');

const line = (e: MemoryEntry) => {
  const t = e.text.replace(/\s+/g, ' ');
  if (e.kind === 'profile') return `Profile: ${t} [#${e.id}]`;
  if (e.kind === 'topic') return `- ${t} [#${e.id}, sums up ${e.covers ?? 0} notes]`;
  return `- ${t} [#${e.id}]`;
};

/**
 * The memory block for an agent's instructions. `session` adds this session's own notes (for a session that
 * goes on); `query`, the request at hand, picks the k notes that bear most on it (`k`: Settings' unless given).
 */
export async function memoryInstructions(db: DB, o: { cwd?: string; key?: string; session: boolean; query?: string; k?: number; budget?: number; now?: number; readOnly?: boolean }): Promise<string> {
  const head = o.readOnly ? READ_ONLY_HEAD : HEAD;
  const now = o.now ?? Date.now();
  const k = o.k ?? topK(db);
  const places = placesOf({ cwd: o.cwd, key: o.session ? o.key : undefined });
  const lasting = places.filter((p) => p.scope !== 'session');
  const groups = places.map((p) => ({
    place: p,
    title: p.scope === 'global' ? 'About the user:' : p.scope === 'repo' ? `This project (${p.scopeKey}):` : 'This session so far:',
    lines: [] as string[],
  }));
  const byPlace = new Map(groups.map((g) => [placeKey(g.place), g]));
  let left = (o.budget ?? Math.max(MEMORY_BUDGET, k * PER_NOTE)) - head.length;
  const taken = new Set<number>();
  const covered = new Set<number>();
  const used: number[] = [];
  /** Gives an entry, under its place, when it fits and is not given or summed up already. */
  const take = (e: MemoryEntry, relevant = false): boolean => {
    const g = byPlace.get(placeKey(e));
    if (!g || taken.has(e.id) || covered.has(e.id)) return false;
    const l = line(e);
    const cost = l.length + 1 + (g.lines.length ? 0 : g.title.length + 2);
    if (cost > left) return false;
    g.lines.push(l);
    left -= cost;
    taken.add(e.id);
    if (relevant) used.push(e.id);
    if (e.kind !== 'note') for (const c of childrenOf(db, e.id)) covered.add(c);
    return true;
  };
  const at = (p: { scope: MemoryEntry['scope']; scopeKey: string }) => ({ scope: p.scope, scopeKey: p.scopeKey, live: now });
  // The user's profile has a block of its own: the notes it still stands for (a tidy-up wrote it once) are left out here.
  for (const p of entries(db, { ...at({ scope: 'global', scopeKey: '' }), kinds: ['profile'], limit: 1 })) for (const c of childrenOf(db, p.id)) covered.add(c);
  // 1. The project's profile.
  for (const p of lasting) if (p.scope === 'repo') for (const e of entries(db, { ...at(p), kinds: ['profile'], limit: 1 })) take(e);
  // 2. This session's own notes, the latest first, leaving at least half the room to the rest.
  const own = places.find((p) => p.scope === 'session');
  if (own) {
    const keep = Math.floor(left / 2);
    left -= keep;
    for (const e of entries(db, { ...at(own), limit: 200 })) take(e);
    left += keep;
  }
  // 3. The k that bear most on the request (not for one of a word or two: "thanks", "go on").
  let n = 0;
  if (o.query && words(o.query).length >= 2)
    for (const f of await findNotes(db, { places: lasting, query: o.query, limit: k * 3, kinds: ['note', 'topic'], now, vector: await requestVector(db, o.query) })) {
      if (n >= k) break;
      if (f.relevant && take(f.entry, true)) n++;
    }
  // 4. Then the latest, until there are k: one from each place in turn, so neither crowds the other out.
  const queues = lasting.map((p) => [...entries(db, { ...at(p), kinds: ['topic'], limit: k + 20 }), ...entries(db, { ...at(p), kinds: ['note'], limit: k * 4 + 40 })]);
  const next = queues.map(() => 0);
  while (n < k && queues.some((q, i) => next[i] < q.length))
    for (let i = 0; i < queues.length && n < k; i++)
      while (next[i] < queues[i].length)
        if (take(queues[i][next[i]++])) {
          n++;
          break;
        }
  markUsed(db, used, now);
  const body = groups.flatMap((g) => (g.lines.length ? ['', g.title, ...g.lines] : []));
  return body.length ? `${head}\n${body.join('\n')}` : head;
}
