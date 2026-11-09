// What agents are told of memory: what it is for and how to write notes that are found again, then the notes.
// The user's own profile has a block of its own (profile.ts). Here come, while they fit in the budget:
// 1. the project's profile (the tidy-up's summary, once its notes no longer fit);
// 2. this session's own notes, for a session that goes on (where its task stands), in at most half the room;
// 3. a small place (about the user, or a project, with no topics and little kept) whole: it fits;
// 4. from the bigger places, the notes and topics that bear on the request: a top-k by hybrid search (words by
//    BM25 and meaning by the embedding model, fused by rank: search.ts), each standing out enough from the rest
//    for this request to count. Fewer than k when fewer bear on it: nothing is given just to fill the room. With
//    search by meaning on, this waits only for a model about to be up (embed.ts), else finds them by words alone;
// 5. for the bigger places, an index of the rest, a title each (the tidy-up writes them): what is kept and how
//    to find it, so an agent knows when to look something up (recall).
// k is Settings → Memory's "Notes each agent starts with". Notes a summary given sums up are left out of the
// notes and of the index. The notes given as bearing on the request count as needed (Settings shows that, and
// suggests removing notes never needed); only an agent's own look-ups weigh in ranking (search.ts).
// An agent gets this once, in the instructions it starts with: Custom too, which keeps it until its conversation is
// condensed (index.ts), so the provider's cache of the conversation holds.
import type { MemoryEntry } from '../../shared/memory.ts';
import type { DB } from '../db.ts';
import { requestVector } from './embed.ts';
import { findNotes } from './search.ts';
import { childrenOf, entries, markUsed, placeKey, placesOf, titleOf, topK, words, type Place } from './store.ts';

/** Fewest characters of notes an agent may get; a larger k gets PER_NOTE more for each note. The index has its own room. */
export const MEMORY_BUDGET = 5000;
const PER_NOTE = 400;
/** A place with no topics and at most this much kept is given whole (the tidy-up sums a place up past it: tidy.ts). */
export const SMALL_PLACE = 2400;
/** Most characters of one place's index. */
export const INDEX_CHARS = 2400;

const HEAD = [
  '# Memory from earlier sessions',
  'Hydor keeps notes from this user’s past sessions, shared by every agent here. Below: those that bear most on this request, and an index of the rest by title; recall finds any of them, by words and by meaning. Use them as background: they may be out of date, a note marked unchecked is an agent’s conclusion no one has confirmed, and what the user says now always comes first. Do not mention them unless they help.',
  'Memory is for what a later session could not find out by itself: what the user wants or has told you, decisions and why, pitfalls, rules learned the hard way and how you know them. Save such a thing with remember when the user asks or when you learn it: one fact per note, said so that a search in other words finds it, and not what the project’s files or history already record. What every agent should always know about the user goes in their profile instead (update_user_profile). forget removes a note by its number; search_sessions and read_session look through past conversations. Never save secrets.',
].join('\n');

/**
 * The instructions' part when the notes for the request come with the first message (memoryParts): the same for every
 * session of a place until its notes change, so the provider's cache of the instructions holds from one to the next.
 */
const SPLIT_HEAD = [
  '# Memory from earlier sessions',
  'Hydor keeps notes from this user’s past sessions, shared by every agent here. Below: the profiles of the places they are about, the whole of a place that keeps only a few, and an index of the rest by title; the notes that bear most on the request come with the message that starts the session. recall finds any of them, by words and by meaning. Use them as background: they may be out of date, a note marked unchecked is an agent’s conclusion no one has confirmed, and what the user says now always comes first. Do not mention them unless they help.',
  HEAD.split('\n')[2],
].join('\n');

/** Ahead of the notes that come with the first message. */
const REQUEST_HEAD = 'From memory (see Memory from earlier sessions in your instructions), the notes that bear most on this:';

/** For a confidential session, which reads memory and saves nothing to it (server/confidential). */
const READ_ONLY_HEAD = [
  '# Memory from earlier sessions',
  'Hydor keeps notes from this user’s past sessions. Below: those that bear most on this request, and an index of the rest by title; recall finds any of them, and search_sessions and read_session look through past conversations. Use them as background: they may be out of date, a note marked unchecked is an agent’s conclusion no one has confirmed, and what the user says now always comes first. Do not mention them unless they help.',
  'This session is confidential, so nothing from it is saved to memory: you can’t add or change notes or the user’s profile here.',
].join('\n');

const line = (e: MemoryEntry) => {
  const t = e.text.replace(/\s+/g, ' ');
  if (e.kind === 'profile') return `Profile: ${t} [#${e.id}]`;
  if (e.kind === 'topic') return `- ${t} [#${e.id}, sums up ${e.covers ?? 0} notes]`;
  return `- ${t} [#${e.id}${e.basis === 'inferred' ? ', unchecked' : ''}]`;
};

/** An index entry: its title, and a topic's size. */
const indexItem = (e: MemoryEntry) => `${titleOf(e)} [${e.kind === 'topic' ? `topic #${e.id}, ${e.covers ?? 0} notes` : `#${e.id}`}]`;

/** How much text a place's active notes take, and whether it has topics. */
function placeSize(db: DB, p: Place, now: number): { chars: number; topics: boolean } {
  const r = db
    .prepare(
      `select coalesce(sum(case when kind = 'note' then length(text) else 0 end), 0) as chars, sum(case when kind = 'topic' then 1 else 0 end) as topics
       from memory_entries where scope = ? and scope_key = ? and status = 'active' and (expires_at is null or expires_at > ?)`,
    )
    .get(p.scope, p.scopeKey, now) as { chars: number; topics: number | null };
  return { chars: r.chars, topics: (r.topics ?? 0) > 0 };
}

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
    index: [] as string[],
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
  // What bears on the request, in every place (not for one of a word or two: "thanks", "go on").
  const found =
    o.query && words(o.query).length >= 2
      ? (await findNotes(db, { places: lasting, query: o.query, limit: k * 3, kinds: ['note', 'topic'], now, vector: await requestVector(db, o.query) })).filter((f) => f.relevant)
      : [];
  const bearing = new Set(found.map((f) => f.entry.id));
  // 3. A small place whole, what bears on the request first.
  const small = lasting.filter((p) => {
    const s = placeSize(db, p, now);
    return !s.topics && s.chars <= SMALL_PLACE;
  });
  const smallKeys = new Set(small.map(placeKey));
  const isSmall = (e: Place) => smallKeys.has(placeKey(e));
  for (const f of found) if (isSmall(f.entry)) take(f.entry, true);
  for (const p of small) for (const e of entries(db, { ...at(p), kinds: ['note'], limit: 100 })) take(e, bearing.has(e.id));
  // 4. From the bigger places, the k that bear most on it.
  let n = 0;
  for (const f of found) {
    if (n >= k) break;
    if (!isSmall(f.entry) && take(f.entry, true)) n++;
  }
  // 5. An index of the rest of each bigger place: its topics, then its notes no topic given sums up, newest first.
  for (const p of lasting) {
    if (isSmall(p)) continue;
    const g = byPlace.get(placeKey(p))!;
    const rest = [...entries(db, { ...at(p), kinds: ['topic'], limit: 200 }), ...entries(db, { ...at(p), kinds: ['note'], limit: 2000 })].filter((e) => !taken.has(e.id) && !covered.has(e.id));
    // A topic in the index stands for its notes.
    const inTopics = new Set(rest.filter((e) => e.kind === 'topic').flatMap((t) => childrenOf(db, t.id)));
    let room = INDEX_CHARS;
    let more = 0;
    for (const e of rest) {
      if (e.kind === 'note' && inTopics.has(e.id)) continue;
      const item = indexItem(e);
      if (item.length + 3 > room) {
        more++;
        continue;
      }
      g.index.push(item);
      room -= item.length + 3;
    }
    if (more) g.index.push(`${more} more`);
  }
  markUsed(db, used, now);
  const body = groups.flatMap((g) =>
    g.lines.length || g.index.length ? ['', g.title, ...g.lines, ...(g.index.length ? [`Also kept here (recall finds them): ${g.index.join(' · ')}`] : [])] : [],
  );
  return body.length ? `${head}\n${body.join('\n')}` : head;
}

/**
 * Memory in two parts, for an agent that starts with instructions of its own (Claude Code, Codex, ACP agents):
 * `stable`, for its instructions: the project's profile, a place that keeps only a few notes whole, and an index of the
 * rest of each place by title (all of it, whatever the request), so it is the same for every session of the place
 * until its notes change and the provider's cache of the instructions holds from one session to the next. `request`,
 * with the message that starts the session, once: the k notes that bear most on that request (`query`), and this
 * session's own notes for a session that goes on (`session`). Custom keeps memoryInstructions, a block it keeps for
 * its whole conversation.
 */
export async function memoryParts(db: DB, o: { cwd?: string; key?: string; session: boolean; query?: string; k?: number; now?: number }): Promise<{ stable: string; request: string }> {
  const now = o.now ?? Date.now();
  const k = o.k ?? topK(db);
  const places = placesOf({ cwd: o.cwd, key: o.session ? o.key : undefined });
  const lasting = places.filter((p) => p.scope !== 'session');
  const titleFor = (p: Place) => (p.scope === 'global' ? 'About the user:' : p.scope === 'repo' ? `This project (${p.scopeKey}):` : 'This session so far:');
  const at = (p: { scope: MemoryEntry['scope']; scopeKey: string }) => ({ scope: p.scope, scopeKey: p.scopeKey, live: now });
  const covered = new Set<number>();
  // The user's profile has a block of its own: the notes it still stands for are left out here.
  for (const p of entries(db, { ...at({ scope: 'global', scopeKey: '' }), kinds: ['profile'], limit: 1 })) for (const c of childrenOf(db, p.id)) covered.add(c);
  const small = new Set(
    lasting
      .filter((p) => {
        const s = placeSize(db, p, now);
        return !s.topics && s.chars <= SMALL_PLACE;
      })
      .map(placeKey),
  );
  const isSmall = (e: Place) => small.has(placeKey(e));

  // ---- the stable part
  const given = new Set<number>();
  const stableGroups = lasting.map((p) => ({ place: p, title: titleFor(p), lines: [] as string[], index: [] as string[] }));
  const stableOf = new Map(stableGroups.map((g) => [placeKey(g.place), g]));
  let left = MEMORY_BUDGET - SPLIT_HEAD.length;
  const give = (e: MemoryEntry) => {
    const g = stableOf.get(placeKey(e));
    if (!g || given.has(e.id) || covered.has(e.id)) return;
    const l = line(e);
    const cost = l.length + 1 + (g.lines.length ? 0 : g.title.length + 2);
    if (cost > left) return;
    g.lines.push(l);
    left -= cost;
    given.add(e.id);
    if (e.kind !== 'note') for (const c of childrenOf(db, e.id)) covered.add(c);
  };
  for (const p of lasting) if (p.scope === 'repo') for (const e of entries(db, { ...at(p), kinds: ['profile'], limit: 1 })) give(e);
  for (const p of lasting) if (isSmall(p)) for (const e of entries(db, { ...at(p), kinds: ['note'], limit: 100 })) give(e);
  for (const p of lasting) {
    if (isSmall(p)) continue;
    const g = stableOf.get(placeKey(p))!;
    const rest = [...entries(db, { ...at(p), kinds: ['topic'], limit: 200 }), ...entries(db, { ...at(p), kinds: ['note'], limit: 2000 })].filter((e) => !given.has(e.id) && !covered.has(e.id));
    const inTopics = new Set(rest.filter((e) => e.kind === 'topic').flatMap((t) => childrenOf(db, t.id)));
    let room = INDEX_CHARS;
    let more = 0;
    for (const e of rest) {
      if (e.kind === 'note' && inTopics.has(e.id)) continue;
      const item = indexItem(e);
      if (item.length + 3 > room) {
        more++;
        continue;
      }
      g.index.push(item);
      room -= item.length + 3;
    }
    if (more) g.index.push(`${more} more`);
  }
  const stableBody = stableGroups.flatMap((g) =>
    g.lines.length || g.index.length ? ['', g.title, ...g.lines, ...(g.index.length ? [`Also kept here (recall finds them): ${g.index.join(' · ')}`] : [])] : [],
  );
  const stable = stableBody.length ? `${SPLIT_HEAD}\n${stableBody.join('\n')}` : SPLIT_HEAD;

  // ---- the part for the request: this session's own notes, then what bears on the request outside the places given whole
  const groups = places.map((p) => ({ place: p, title: titleFor(p), lines: [] as string[] }));
  const byPlace = new Map(groups.map((g) => [placeKey(g.place), g]));
  let room = Math.max(MEMORY_BUDGET, k * PER_NOTE) - REQUEST_HEAD.length;
  const taken = new Set<number>();
  const used: number[] = [];
  const take = (e: MemoryEntry, relevant = false): boolean => {
    const g = byPlace.get(placeKey(e));
    if (!g || taken.has(e.id) || given.has(e.id) || covered.has(e.id)) return false;
    const l = line(e);
    const cost = l.length + 1 + (g.lines.length ? 0 : g.title.length + 2);
    if (cost > room) return false;
    g.lines.push(l);
    room -= cost;
    taken.add(e.id);
    if (relevant) used.push(e.id);
    return true;
  };
  const own = places.find((p) => p.scope === 'session');
  if (own) {
    const keep = Math.floor(room / 2);
    room -= keep;
    for (const e of entries(db, { ...at(own), limit: 200 })) take(e);
    room += keep;
  }
  const found =
    o.query && words(o.query).length >= 2
      ? (await findNotes(db, { places: lasting, query: o.query, limit: k * 3, kinds: ['note', 'topic'], now, vector: await requestVector(db, o.query) })).filter((f) => f.relevant)
      : [];
  // A small place is whole in the instructions: its notes that bear on the request count as needed all the same.
  for (const f of found) if (isSmall(f.entry) && given.has(f.entry.id)) used.push(f.entry.id);
  let n = 0;
  for (const f of found) {
    if (n >= k) break;
    if (!isSmall(f.entry) && take(f.entry, true)) n++;
  }
  markUsed(db, used, now);
  const body = groups.flatMap((g) => (g.lines.length ? ['', g.title, ...g.lines] : []));
  return { stable, request: body.length ? `${REQUEST_HEAD}\n${body.join('\n')}` : '' };
}
