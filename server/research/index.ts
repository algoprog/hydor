// Deep research: a session started in this mode leads a research. It plans the searches the question needs,
// sends researchers (its child sessions: server/children) after each part, at most its breadth at a time, digs
// into what they leave open for its rounds (depth), has the key claims cross-checked, and delivers a cited
// report as a page or a Word document. Here: what the lead and the researchers are told, and the budget kept
// as they work: web searches counted across the research (the app's web_search, with the agents' own web
// search off so every search counts), and rounds counted as researchers start.
import { researchOf, type ResearchSettings, type ResearchState } from '../../shared/research.ts';
import { childKeys } from '../children/family.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { GivenAtStart } from '../features/freshStart.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { leadInstructions, RESEARCHER_INSTRUCTIONS } from './instructions.ts';

/** The research a session takes part in: its lead's key and settings, and whether it leads or researches. */
export function researchFor(db: DB, key: string, extra = sessionExtra(db, key)): { lead: string; settings: ResearchSettings; role: 'lead' | 'researcher' } | null {
  const own = researchOf(extra);
  if (own) return { lead: key, settings: own, role: 'lead' };
  const p = extra.parent;
  const theirs = typeof p === 'string' && p ? researchOf(sessionExtra(db, p)) : null;
  return theirs ? { lead: p as string, settings: theirs, role: 'researcher' } : null;
}

const count = (db: DB, k: string) => Number(kvGet(db, k) ?? 0) || 0;
const usedKey = (lead: string) => `research.used.${lead}`;
const roundsKey = (lead: string) => `research.rounds.${lead}`;
const BUSY = new Set(['working', 'waiting', 'starting']);

export function researchState(d: Pick<Deps, 'db'>, lead: string): ResearchState | null {
  const settings = researchOf(sessionExtra(d.db, lead));
  if (!settings) return null;
  return { key: lead, settings, used: count(d.db, usedKey(lead)), rounds: count(d.db, roundsKey(lead)), researchers: childKeys(d.db, lead) };
}

/** The lead's pages hear where the research stands. */
function tell(d: Deps, lead: string) {
  const s = researchState(d, lead);
  if (s) d.toSubscribers(lead, { t: 'feature', id: 'research', key: lead, data: s });
}

/** A web search in a research: counted, or refused once the budget is spent. */
function search(ctx: RunCtx, r: NonNullable<ReturnType<typeof researchFor>>) {
  const d = ctx.deps;
  const used = count(d.db, usedKey(r.lead)) + 1;
  const max = r.settings.queries;
  if (used > max)
    return {
      refuse:
        r.role === 'lead'
          ? `This research's search budget is spent (${max} searches). Search no further: check what you have (read_page on the cited pages is fine) and write the report.`
          : `This research's search budget is spent (${max} searches). Search no further: end your turn now with your report of what you found.`,
    };
  kvSet(d.db, usedKey(r.lead), String(used));
  tell(d, r.lead);
  return { note: `(${max - used} of ${max} searches left in this research.)` };
}

/** A researcher started: a new round when none is at work, refused past the rounds (and the checking one). */
function start(ctx: RunCtx, r: NonNullable<ReturnType<typeof researchFor>>) {
  const d = ctx.deps;
  if (childKeys(d.db, r.lead).some((k) => BUSY.has(d.sessions.summary(k)?.live?.status ?? ''))) return null;
  const rounds = count(d.db, roundsKey(r.lead));
  if (rounds >= r.settings.depth + 1)
    return { refuse: `This research has had its ${r.settings.depth} round${r.settings.depth === 1 ? '' : 's'} of research and a checking round: start no more researchers. Write the report from what you have.` };
  kvSet(d.db, roundsKey(r.lead), String(rounds + 1));
  tell(d, r.lead);
  return null;
}

/** The research each run was started for, in words ("none" for none): a research turned on, off or changed later starts it afresh. */
const given = new GivenAtStart();
const researchWords = (r: ReturnType<typeof researchFor>): string => (r ? JSON.stringify([r.role, r.lead, r.settings]) : 'none');

export const research: Feature = {
  id: 'research',

  routes(d) {
    d.app.get('/api/research/:key', async (req) => researchState(d, (req.params as { key: string }).key) ?? { key: (req.params as { key: string }).key, settings: null });
  },

  spawn(s, d) {
    // A new Codex thread has no key yet: its own settings say whether it leads, its parent's whether it researches.
    const r = researchFor(d.db, s.key ?? '', s.extra);
    given.note(s.runId, researchWords(r));
    if (!r) return undefined;
    // Every search goes through web_search, where the budget is kept: the agents' own web search is off.
    const off = s.agent === 'claude' ? { disallowedTools: ['WebSearch'] } : s.agent === 'codex' ? { codexConfig: { web_search: 'disabled' } } : {};
    return { instructions: [r.role === 'lead' ? leadInstructions(r.settings) : RESEARCHER_INSTRUCTIONS], ...off };
  },

  async beforeSend(key, d) {
    await given.refresh(key, d, () => researchWords(researchFor(d.db, key)));
  },

  aroundTool(name, ctx) {
    if (name !== 'web_search' && name !== 'start_child_session') return null;
    const r = researchFor(ctx.deps.db, ctx.key);
    if (!r) return null;
    if (name === 'web_search') return search(ctx, r);
    return r.role === 'lead' ? start(ctx, r) : null;
  },

  turnEnd(t, d) {
    // A researcher finished: the lead's bar shows it.
    const r = researchFor(d.db, t.key);
    if (r) tell(d, r.lead);
  },
};
