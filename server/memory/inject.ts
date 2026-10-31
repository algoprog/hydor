// What agents are told of memory: the notes about the user, this project's and (when it goes on) this
// session's, as background from past sessions. The most relevant come first within a size cap: those
// matching the request at hand when it is known, then the most recently changed. Each place gets its
// turn in the cap, so a long list about one cannot crowd out the others.
import type { MemoryEntry } from '../../shared/memory.ts';
import type { DB } from '../db.ts';
import { entries, rank, repoRoot, words } from './store.ts';

/** Most characters of notes an agent gets. */
export const MEMORY_BUDGET = 4000;

const HEAD = [
  '# Memory from earlier sessions',
  'Naget Agent keeps notes from this user’s past sessions, shared by every agent here. Use them as background: they may be out of date, and what the user says now always comes first. Do not mention them unless they help.',
  'When the user asks you to remember something, or you learn something lasting about them or this project, save it with the remember tool (scope "global" for the user, "repo" for this project, "session" for this task’s state). forget removes a note by its number, recall searches the notes, and search_sessions and read_session look through past conversations. Never save secrets.',
].join('\n');

const line = (e: MemoryEntry) => `- ${e.text.replace(/\s+/g, ' ')} [#${e.id}]`;

/**
 * The memory block for an agent's instructions: how memory works, then the notes that fit. `session`
 * adds this session's own notes (for a session that goes on); `query` (the request at hand) ranks them.
 */
export function memoryInstructions(db: DB, o: { cwd?: string; key?: string; session: boolean; query?: string; budget?: number }): string {
  const q = o.query ? words(o.query).slice(0, 40) : [];
  const repo = o.cwd ? repoRoot(o.cwd) : null;
  const groups: { title: string; list: MemoryEntry[] }[] = [
    { title: 'About the user:', list: rank(entries(db, { scope: 'global', limit: 400 }), q) },
    { title: `This project (${repo}):`, list: repo ? rank(entries(db, { scope: 'repo', scopeKey: repo, limit: 400 }), q) : [] },
    { title: 'This session so far:', list: o.session && o.key ? rank(entries(db, { scope: 'session', scopeKey: o.key, limit: 200 }), q) : [] },
  ];
  // One note from each place in turn, best first, each while it fits.
  let left = (o.budget ?? MEMORY_BUDGET) - HEAD.length;
  const taken: string[][] = groups.map(() => []);
  const at = groups.map(() => 0);
  while (groups.some((g, i) => at[i] < g.list.length)) {
    groups.forEach((g, i) => {
      const e = g.list[at[i]++];
      if (!e) return;
      const l = line(e);
      const cost = l.length + 1 + (taken[i].length ? 0 : g.title.length + 2);
      if (cost > left) return;
      taken[i].push(l);
      left -= cost;
    });
  }
  const body = groups.flatMap((g, i) => (taken[i].length ? ['', g.title, ...taken[i]] : []));
  return body.length ? `${HEAD}\n${body.join('\n')}` : HEAD;
}
