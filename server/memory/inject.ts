// What agents are told of memory: what it is for and how to write notes that are found again, then the notes.
// The user's own profile has a block of its own (profile.ts). Here come, while they fit in the budget:
// 1. the project's profile (the tidy-up's summary, once its notes no longer fit);
// 2. this session's own notes, for a session that goes on (where its task stands), in at most half the room;
// 3. a small place (about the user, or a project, with no topics and little kept) whole: it fits;
// 4. from the bigger places, the notes and topics that bear on the request: a top-k by hybrid search (words by
//    BM25 and meaning by the embedding model, fused by rank: search.ts), each standing out enough from the rest
//    for this request to count, picked as everywhere memory is given (deliver.ts pick: a topic stands for its notes
//    when two or more of them bear on it). Fewer than k when fewer bear on it: nothing is given just to fill the room.
//    With search by meaning on, this waits only for a model about to be up (embed.ts), else finds them by words alone;
// 5. for the bigger places, an index of the rest, a title each (the tidy-up writes them), the most used first: what
//    is kept and how to find it, so an agent knows when to look something up (recall). What does not fit is summed up
//    by the area of the project it is about.
// k is Settings → Memory's "Notes each agent starts with". Notes a summary given sums up are left out of the notes
// and of the index; what the helper kept from documents and conversations comes last in each place, quoted. What is
// given counts as given, not used (store.ts markGiven): only what agents do with it says that (given.ts).
// An agent gets this once, in the instructions it starts with: Custom too, which keeps it until its conversation is
// condensed (index.ts), so the provider's cache of the conversation holds. Custom with a model of a small context gets
// a smaller block (memClass: lean, tiny), so memory never crowds out its work.
import type { MemoryEntry } from '../../shared/memory.ts';
import type { DB } from '../db.ts';
import type { WikiLine } from '../wiki/deliver.ts';
import { BLOCK_SHARE, entryLine, inView, LEAN_INDEX_CHARS, LEAN_K, lineCost, originsOf, pick, placeText, TINY_K, WIKI_HEAD, type MemClass, type Origin, type PlaceLines } from './deliver.ts';
import { requestVector } from './embed.ts';
import { anchorsOf } from './given.ts';
import { findNotes } from './search.ts';
import { childrenOf, entries, markGiven, placeKey, placesOf, titleOf, topK, words, type Place } from './store.ts';

/** Fewest characters of notes an agent may get; a larger k gets PER_NOTE more for each note. The index has its own room. */
export const MEMORY_BUDGET = 5000;
const PER_NOTE = 400;
/** A place with no topics and at most this much kept is given whole (the tidy-up sums a place up past it: tidy.ts). */
export const SMALL_PLACE = 2400;
/** Most characters of one place's index. */
export const INDEX_CHARS = 2400;
/** Most areas the rest of an index is summed up by. */
const AREAS = 8;

const HEAD = [
  '# Memory from earlier sessions',
  'Hydor keeps notes from this user’s past sessions, shared by every agent here. Below: those that bear most on this request, and an index of the rest by title; recall finds any of them, by words and by meaning. Use them as background: they may be out of date, a note marked unchecked is an agent’s conclusion no one has confirmed, and what the user says now always comes first. Do not mention them unless they help.',
  'Memory is for what a later session could not find out by itself: what the user wants or has told you, decisions and why, pitfalls, rules learned the hard way and how you know them. Save such a thing with remember when the user asks or when you learn it: one fact per note, said so that a search in other words finds it, and not what the project’s files or history already record. What every agent should always know about the user goes in their profile instead (update_user_profile). forget removes a note by its number; search_sessions and read_session look through past conversations. memory_search looks through notes, wiki articles, documents and past conversations at once, here or in your other projects. Never save secrets.',
].join('\n');

/** For a model of a small context (memClass lean or tiny): the same, in few words. */
const LEAN_HEAD = [
  '# Memory from earlier sessions',
  'Notes Hydor kept from this user’s past sessions: background that may be out of date; what the user says now comes first. recall finds more; remember saves a lasting fact (one a note, never secrets); forget removes one by its number. memory_search looks through notes, wiki, documents and past conversations at once, here or in other projects.',
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
  'Hydor keeps notes from this user’s past sessions. Below: those that bear most on this request, and an index of the rest by title; recall finds any of them, and search_sessions and read_session look through past conversations. memory_search looks through notes, wiki articles, documents and past conversations at once, here or in your other projects. Use them as background: they may be out of date, a note marked unchecked is an agent’s conclusion no one has confirmed, and what the user says now always comes first. Do not mention them unless they help.',
  'This session is confidential, so nothing from it is saved to memory: you can’t add or change notes or the user’s profile here.',
].join('\n');

const LEAN_READ_ONLY_HEAD = [
  '# Memory from earlier sessions',
  'Notes Hydor kept from this user’s past sessions: background that may be out of date; what the user says now comes first. recall finds more; memory_search looks through notes, wiki, documents and past conversations at once, here or in other projects. This session is confidential: nothing from it is saved to memory.',
].join('\n');

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

const titleFor = (p: Place) => (p.scope === 'global' ? 'About the user:' : p.scope === 'repo' ? `This project (${p.scopeKey}):` : 'This session so far:');

/** The most used first: used (cited, looked up, worked on), then looked up, then the latest changed. */
/**
 * How much an entry was used, in steps that double (1, 2–3, 4–7, 8–15…): the index orders by these rather than by the
 * count itself, so it reads the same from one session to the next until a note is used much more, and the provider's
 * cache of the instructions holds.
 */
const useStep = (e: MemoryEntry) => (e.uses > 0 ? Math.floor(Math.log2(e.uses)) + 1 : 0);
const byUse = (a: MemoryEntry, b: MemoryEntry) => useStep(b) - useStep(a) || b.updatedAt - a.updatedAt || b.id - a.id;

/** The area of a project a path is in: its top two folders (server/memory), a file at the root by its name. */
export function areaOf(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/').filter(Boolean);
  if (!parts.length) return 'other';
  const dirs = p.endsWith('/') ? parts : parts.slice(0, -1);
  return dirs.length ? dirs.slice(0, 2).join('/') : parts[0];
}

/** What did not fit in an index: "and 54 more", or by the area each is about (its first anchor) when anchors say. */
function moreLine(db: DB, left: MemoryEntry[]): string {
  const anchors = anchorsOf(
    db,
    left.map((e) => e.id),
  );
  const count = new Map<string, number>();
  for (const e of left) {
    const first = anchors.get(e.id)?.[0];
    const a = first ? areaOf(first) : 'other';
    count.set(a, (count.get(a) ?? 0) + 1);
  }
  if (count.size === 1 && count.has('other')) return `and ${left.length} more`;
  const named = [...count].filter(([a]) => a !== 'other').sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  let other = count.get('other') ?? 0;
  for (const [, n] of named.slice(AREAS)) other += n;
  return `and by area: ${[...named.slice(0, AREAS).map(([a, n]) => `${a} (${n})`), ...(other ? [`other (${other})`] : [])].join(' · ')}`;
}

/** A bigger place's index: its topics, then its notes no topic in it sums up, the most used first, within `room`. */
function indexOf(db: DB, p: Place, now: number, skip: (e: MemoryEntry) => boolean, room: number): string[] {
  const at = { scope: p.scope, scopeKey: p.scopeKey, live: now };
  const topics = entries(db, { ...at, kinds: ['topic'], limit: 200 }).filter((e) => !skip(e));
  const notes = entries(db, { ...at, kinds: ['note'], limit: 2000 }).filter((e) => !skip(e));
  // A topic in the index stands for its notes.
  const inTopics = new Set(topics.flatMap((t) => childrenOf(db, t.id)));
  const rest = [...topics.sort(byUse), ...notes.filter((e) => !inTopics.has(e.id)).sort(byUse)];
  const items: { e: MemoryEntry; text: string }[] = [];
  let left: MemoryEntry[] = [];
  const all = room;
  for (const e of rest) {
    const item = indexItem(e);
    if (item.length + 3 > room) {
      left.push(e);
      continue;
    }
    items.push({ e, text: item });
    room -= item.length + 3;
  }
  if (!left.length) return items.map((i) => i.text);
  // What did not fit is summed up within the same room: the last titles make way for that line when they must.
  let more = moreLine(db, left);
  while (items.length && all - room + more.length > all) {
    const last = items.pop()!;
    room += last.text.length + 3;
    left = [last.e, ...left];
    more = moreLine(db, left);
  }
  return [...items.map((i) => i.text), more];
}

/** The room of Custom's block by class: its notes (the head included), k, and each place's index (null: none). */
export function blockRoom(cls: MemClass, o: { k: number; window?: number; budget?: number }): { notes: number; k: number; index: number | null } {
  const today = o.budget ?? Math.max(MEMORY_BUDGET, o.k * PER_NOTE);
  const share = o.window && o.window > 0 ? Math.floor(BLOCK_SHARE * 4 * o.window) : today;
  if (cls === 'tiny') return { notes: share, k: Math.min(o.k, TINY_K), index: null };
  if (cls === 'lean') return { notes: Math.min(today, share), k: Math.min(o.k, LEAN_K), index: LEAN_INDEX_CHARS };
  return { notes: today, k: o.k, index: INDEX_CHARS };
}

/**
 * The memory block for an agent's instructions. `session` adds this session's own notes (for a session that
 * goes on); `query`, the request at hand, picks the k notes that bear most on it (`k`: Settings' unless given).
 * `cls` (with `window`, the model's context in tokens) makes it fit a model of a small context.
 */
export async function memoryInstructions(
  db: DB,
  o: { cwd?: string; key?: string; session: boolean; query?: string; k?: number; budget?: number; now?: number; readOnly?: boolean; cls?: MemClass; window?: number },
): Promise<string> {
  return (await memoryBlock(db, o)).text;
}

/** memoryInstructions, with the entries it gives in full. */
export async function memoryBlock(
  db: DB,
  o: { cwd?: string; key?: string; session: boolean; query?: string; k?: number; budget?: number; now?: number; readOnly?: boolean; cls?: MemClass; window?: number },
): Promise<{ text: string; ids: number[] }> {
  const cls = o.cls ?? 'full';
  const head = cls === 'full' ? (o.readOnly ? READ_ONLY_HEAD : HEAD) : o.readOnly ? LEAN_READ_ONLY_HEAD : LEAN_HEAD;
  const now = o.now ?? Date.now();
  const fit = blockRoom(cls, { k: o.k ?? topK(db), window: o.window, budget: o.budget });
  const k = fit.k;
  const places = placesOf({ cwd: o.cwd, key: o.session ? o.key : undefined });
  const lasting = places.filter((p) => p.scope !== 'session');
  const groups = places.map((p) => ({ place: p, title: titleFor(p), own: [] as string[], quoted: [] as string[], index: [] as string[] }));
  const byPlace = new Map(groups.map((g) => [placeKey(g.place), g]));
  let left = fit.notes - head.length;
  const taken = new Set<number>();
  const covered = new Set<number>();
  const origins = new Map<number, Origin>();
  /** Gives an entry, under its place, when it fits and is not given or summed up already. */
  const take = (e: MemoryEntry): boolean => {
    const g = byPlace.get(placeKey(e));
    if (!g || taken.has(e.id) || covered.has(e.id)) return false;
    const origin = e.kind === 'note' ? origins.get(e.id) : undefined;
    const l = entryLine(e, origin);
    const cost = lineCost(g, l, !!origin);
    if (cost > left) return false;
    (origin ? g.quoted : g.own).push(l);
    left -= cost;
    taken.add(e.id);
    if (e.kind !== 'note') for (const c of childrenOf(db, e.id)) covered.add(c);
    return true;
  };
  const at = (p: { scope: MemoryEntry['scope']; scopeKey: string }) => ({ scope: p.scope, scopeKey: p.scopeKey, live: now });
  /** Where quoted material comes from, for these entries, before they are given. */
  const learn = (list: MemoryEntry[]) => originsOf(db, list.filter((e) => e.kind === 'note' && !origins.has(e.id)).map((e) => e.id)).forEach((v, id) => origins.set(id, v));
  // The user's profile has a block of its own: the notes it still stands for (a tidy-up wrote it once) are left out here.
  for (const p of entries(db, { ...at({ scope: 'global', scopeKey: '' }), kinds: ['profile'], limit: 1 })) for (const c of childrenOf(db, p.id)) covered.add(c);
  // 1. The project's profile.
  for (const p of lasting) if (p.scope === 'repo') for (const e of entries(db, { ...at(p), kinds: ['profile'], limit: 1 })) take(e);
  // 2. This session's own notes, the latest first, leaving at least half the room to the rest.
  const own = places.find((p) => p.scope === 'session');
  if (own) {
    const keep = Math.floor(left / 2);
    left -= keep;
    const list = entries(db, { ...at(own), limit: 200 });
    learn(list);
    for (const e of list) take(e);
    left += keep;
  }
  // What bears on the request, in every place (not for one of a word or two: "thanks", "go on").
  const found =
    o.query && words(o.query).length >= 2
      ? (await findNotes(db, { places: lasting, query: o.query, limit: k * 3, kinds: ['note', 'topic'], now, vector: await requestVector(db, o.query) })).filter((f) => f.relevant).map((f) => f.entry)
      : [];
  // 3. A small place whole, what bears on the request first.
  const small = lasting.filter((p) => {
    const s = placeSize(db, p, now);
    return !s.topics && s.chars <= SMALL_PLACE;
  });
  const smallKeys = new Set(small.map(placeKey));
  const isSmall = (e: Place) => smallKeys.has(placeKey(e));
  const picked = pick(db, found, inView(db, [], taken));
  learn(picked);
  for (const e of picked) if (isSmall(e)) take(e);
  for (const p of small) {
    const list = entries(db, { ...at(p), kinds: ['note'], limit: 100 });
    learn(list);
    for (const e of list) take(e);
  }
  // 4. From the bigger places, the k that bear most on it.
  let n = 0;
  for (const e of picked) {
    if (n >= k) break;
    if (!isSmall(e) && take(e)) n++;
  }
  // 5. An index of the rest of each bigger place; none in a tiny block (its head says recall finds more).
  if (fit.index != null)
    for (const p of lasting) {
      if (isSmall(p)) continue;
      byPlace.get(placeKey(p))!.index = indexOf(db, p, now, (e) => taken.has(e.id) || covered.has(e.id), fit.index);
    }
  // A confidential session reads memory and leaves nothing in it, not even a count.
  if (!o.readOnly) markGiven(db, [...taken], now);
  const body = groups.flatMap((g) => {
    const lines = placeText({ title: g.title, own: g.own, quoted: g.quoted });
    if (!g.index.length) return lines;
    return [...(lines.length ? lines : ['', g.title]), `Also kept here (recall finds them): ${g.index.join(' · ')}`];
  });
  return { text: body.length ? `${head}\n${body.join('\n')}` : head, ids: [...taken] };
}

/**
 * Memory in two parts, for an agent that starts with instructions of its own (Claude Code, Codex, ACP agents):
 * `stable`, for its instructions: the project's profile, a place that keeps only a few notes whole, and an index of the
 * rest of each place by title (all of it, whatever the request), so it is the same for every session of the place
 * until its notes change and the provider's cache of the instructions holds from one session to the next. `request`,
 * with the message that starts the session, once: the k notes that bear most on that request (`query`), this
 * session's own notes for a session that goes on (`session`), and the lines of the wiki articles that stand out for it
 * (`wiki`: the caller finds them). Entries in `exclude` (given to a session that goes on, still in its conversation)
 * are left out of the request's part. Custom keeps memoryInstructions, a block it keeps for its whole conversation.
 * Marks nothing given: the caller does, for what it uses (index.ts).
 */
export async function memoryParts(
  db: DB,
  o: { cwd?: string; key?: string; session: boolean; query?: string; k?: number; now?: number; exclude?: Iterable<number>; wiki?: WikiLine[] },
): Promise<{ stable: string; request: string; stableIds: number[]; requestIds: number[]; wikiRefs: string[] }> {
  const now = o.now ?? Date.now();
  const k = o.k ?? topK(db);
  const places = placesOf({ cwd: o.cwd, key: o.session ? o.key : undefined });
  const lasting = places.filter((p) => p.scope !== 'session');
  const at = (p: { scope: MemoryEntry['scope']; scopeKey: string }) => ({ scope: p.scope, scopeKey: p.scopeKey, live: now });
  const covered = new Set<number>();
  const origins = new Map<number, Origin>();
  const learn = (list: MemoryEntry[]) => originsOf(db, list.filter((e) => e.kind === 'note' && !origins.has(e.id)).map((e) => e.id)).forEach((v, id) => origins.set(id, v));
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
  const stableGroups = lasting.map((p) => ({ place: p, title: titleFor(p), own: [] as string[], quoted: [] as string[], index: [] as string[] }));
  const stableOf = new Map(stableGroups.map((g) => [placeKey(g.place), g]));
  let left = MEMORY_BUDGET - SPLIT_HEAD.length;
  const give = (e: MemoryEntry) => {
    const g = stableOf.get(placeKey(e));
    if (!g || given.has(e.id) || covered.has(e.id)) return;
    const origin = e.kind === 'note' ? origins.get(e.id) : undefined;
    const l = entryLine(e, origin);
    const cost = lineCost(g, l, !!origin);
    if (cost > left) return;
    (origin ? g.quoted : g.own).push(l);
    left -= cost;
    given.add(e.id);
    if (e.kind !== 'note') for (const c of childrenOf(db, e.id)) covered.add(c);
  };
  for (const p of lasting) if (p.scope === 'repo') for (const e of entries(db, { ...at(p), kinds: ['profile'], limit: 1 })) give(e);
  for (const p of lasting)
    if (isSmall(p)) {
      const list = entries(db, { ...at(p), kinds: ['note'], limit: 100 });
      learn(list);
      for (const e of list) give(e);
    }
  for (const p of lasting) if (!isSmall(p)) stableOf.get(placeKey(p))!.index = indexOf(db, p, now, (e) => given.has(e.id) || covered.has(e.id), INDEX_CHARS);
  const stableBody = stableGroups.flatMap((g) => {
    const lines = placeText({ title: g.title, own: g.own, quoted: g.quoted });
    if (!g.index.length) return lines;
    return [...(lines.length ? lines : ['', g.title]), `Also kept here (recall finds them): ${g.index.join(' · ')}`];
  });
  const stable = stableBody.length ? `${SPLIT_HEAD}\n${stableBody.join('\n')}` : SPLIT_HEAD;

  // ---- the part for the request: this session's own notes, then what bears on the request outside the places given whole
  const groups = places.map((p): PlaceLines & { place: Place } => ({ place: p, title: titleFor(p), own: [], quoted: [] }));
  const byPlace = new Map(groups.map((g) => [placeKey(g.place), g]));
  let room = Math.max(MEMORY_BUDGET, k * PER_NOTE) - REQUEST_HEAD.length;
  const taken = new Set<number>();
  const exclude = new Set(o.exclude ?? []);
  const take = (e: MemoryEntry): boolean => {
    const g = byPlace.get(placeKey(e));
    if (!g || taken.has(e.id) || given.has(e.id) || covered.has(e.id) || exclude.has(e.id)) return false;
    const origin = e.kind === 'note' ? origins.get(e.id) : undefined;
    const l = entryLine(e, origin);
    const cost = lineCost(g, l, !!origin);
    if (cost > room) return false;
    (origin ? g.quoted : g.own).push(l);
    room -= cost;
    taken.add(e.id);
    return true;
  };
  // The wiki's lines first in what is left at the end, so the notes do not crowd them out.
  const wiki = (o.wiki ?? []).filter((l) => l.text.length + 1 <= room);
  const wikiCost = wiki.length ? WIKI_HEAD.length + 2 + wiki.reduce((n, l) => n + l.text.length + 1, 0) : 0;
  room -= wikiCost;
  const own = places.find((p) => p.scope === 'session');
  if (own) {
    const keep = Math.floor(room / 2);
    room -= keep;
    const list = entries(db, { ...at(own), limit: 200 });
    learn(list);
    for (const e of list) take(e);
    room += keep;
  }
  const found =
    o.query && words(o.query).length >= 2
      ? (await findNotes(db, { places: lasting, query: o.query, limit: k * 3, kinds: ['note', 'topic'], now, vector: await requestVector(db, o.query) })).filter((f) => f.relevant).map((f) => f.entry)
      : [];
  const picked = pick(db, found, inView(db, [], [...given, ...exclude, ...taken]));
  learn(picked);
  let n = 0;
  for (const e of picked) {
    if (n >= k) break;
    if (!isSmall(e) && take(e)) n++;
  }
  const body = groups.flatMap((g) => placeText(g));
  if (wiki.length) body.push('', WIKI_HEAD, ...wiki.map((l) => l.text));
  return {
    stable,
    request: body.length ? `${REQUEST_HEAD}\n${body.join('\n')}` : '',
    stableIds: [...given],
    requestIds: [...taken],
    wikiRefs: wiki.map((l) => `w:${l.path}`),
  };
}
