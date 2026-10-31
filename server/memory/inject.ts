// What agents are told of memory: how it works, then the notes that fit in MEMORY_BUDGET, place by place in
// turn (about the user, this project, this session), so a long list about one cannot crowd out the others.
// Each place gives its profile first (the tidy-up's short summary, once a place's notes no longer fit), then
// the topics and notes bearing on the request at hand (by words and meaning), then the latest. Notes that a
// topic or profile already given sums up are left out: recall finds them. The notes given as bearing on the
// request count as used (search.ts weighs that, and Settings suggests removing notes never needed).
import type { MemoryEntry } from '../../shared/memory.ts';
import type { DB } from '../db.ts';
import { findNotes } from './search.ts';
import { childrenOf, entries, markUsed, placeKey, placesOf, words, type Place } from './store.ts';

/** Most characters of notes an agent gets. */
export const MEMORY_BUDGET = 4000;

const HEAD = [
  '# Memory from earlier sessions',
  'Naget Agent keeps notes from this user’s past sessions, shared by every agent here. Use them as background: they may be out of date, and what the user says now always comes first. Do not mention them unless they help.',
  'When the user asks you to remember something, or you learn something lasting about them or this project, save it with the remember tool (scope "global" for the user, "repo" for this project, "session" for this task’s state; "until" for what is true only until a date; "replaces" to correct a note). forget removes a note by its number; recall searches every note, by words and by meaning, including those a summary below stands for; search_sessions and read_session look through past conversations. Never save secrets.',
].join('\n');

const line = (e: MemoryEntry) => {
  const t = e.text.replace(/\s+/g, ' ');
  if (e.kind === 'profile') return `Profile: ${t} [#${e.id}]`;
  if (e.kind === 'topic') return `- ${t} [#${e.id}, sums up ${e.covers ?? 0} notes]`;
  return `- ${t} [#${e.id}]`;
};

interface Group {
  place: Place;
  title: string;
  items: { e: MemoryEntry; relevant: boolean }[];
}

/**
 * The memory block for an agent's instructions. `session` adds this session's own notes (for a session that
 * goes on); `query`, the request at hand, puts what bears on it first.
 */
export async function memoryInstructions(db: DB, o: { cwd?: string; key?: string; session: boolean; query?: string; budget?: number; now?: number }): Promise<string> {
  const now = o.now ?? Date.now();
  const places = placesOf({ cwd: o.cwd, key: o.session ? o.key : undefined });
  const groups: Group[] = places.map((p) => ({
    place: p,
    title: p.scope === 'global' ? 'About the user:' : p.scope === 'repo' ? `This project (${p.scopeKey}):` : 'This session so far:',
    items: [],
  }));
  const byPlace = new Map(groups.map((g) => [placeKey(g.place), g]));
  const seen = new Set<number>();
  const push = (e: MemoryEntry, relevant: boolean) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    byPlace.get(placeKey(e))?.items.push({ e, relevant });
  };
  // The profiles first, then what bears on the request (not for one of a word or two: "thanks", "go on").
  for (const g of groups) for (const e of entries(db, { scope: g.place.scope, scopeKey: g.place.scopeKey, kinds: ['profile'], live: now, limit: 1 })) push(e, false);
  if (o.query && words(o.query).length >= 2)
    for (const f of await findNotes(db, { places, query: o.query, limit: 60, kinds: ['note', 'topic'], now })) push(f.entry, f.relevant);
  // Then the latest: topics first (each sums several notes up), then notes.
  for (const g of groups) {
    const at = { scope: g.place.scope, scopeKey: g.place.scopeKey, live: now };
    for (const e of [...entries(db, { ...at, kinds: ['topic'], limit: 100 }), ...entries(db, { ...at, kinds: ['note'], limit: g.place.scope === 'session' ? 200 : 400 })]) push(e, false);
  }
  // One from each place in turn, best first, each while it fits; what a summary given sums up is left out.
  let left = (o.budget ?? MEMORY_BUDGET) - HEAD.length;
  const taken: string[][] = groups.map(() => []);
  const covered = new Set<number>();
  const used: number[] = [];
  const at = groups.map(() => 0);
  while (groups.some((g, i) => at[i] < g.items.length)) {
    groups.forEach((g, i) => {
      let it = g.items[at[i]++];
      while (it && covered.has(it.e.id)) it = g.items[at[i]++];
      if (!it) return;
      const l = line(it.e);
      const cost = l.length + 1 + (taken[i].length ? 0 : g.title.length + 2);
      if (cost > left) return;
      taken[i].push(l);
      left -= cost;
      if (it.relevant) used.push(it.e.id);
      if (it.e.kind !== 'note') for (const c of childrenOf(db, it.e.id)) covered.add(c);
    });
  }
  markUsed(db, used, now);
  const body = groups.flatMap((g, i) => (taken[i].length ? ['', g.title, ...taken[i]] : []));
  return body.length ? `${HEAD}\n${body.join('\n')}` : HEAD;
}
