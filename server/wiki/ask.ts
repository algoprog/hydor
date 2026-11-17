// A new session in a project whose wiki memory is empty (but has something to build from) first asks whether to build
// it, and the agent gets its first message once the most important part is written. This file holds the decisions:
// when to ask, what the person said no to, and the sessions waiting (kept in the database, the server restarts often).
// Holding the message and starting the agent is SessionManager's (server/sessions.ts).
import type { MemoryAsk } from '../../shared/types.ts';
import type { SessionExtra } from '../../shared/features.ts';
import { isConfidential } from '../../shared/confidential.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { memoryOn } from '../memory/store.ts';
import { spaceById } from '../spaces/index.ts';
import { wikiChatEnabled } from './access.ts';
import { buildOffer, startBuild, type BuildOffer } from './areas/build.ts';
import { jobRunning, jobState, stopJob } from './areas/jobs.ts';
import { wikiMemoryOn } from './roots.ts';

/** How long "Start without memory" keeps the question away from the project. */
export const SNOOZE_MS = 7 * 24 * 3600_000;

/**
 * Sessions the question never comes to: the ones an app, a schedule, another agent, a page or a team of agents start,
 * as against a person starting a session on the start page (which alone sends `askMemory`).
 */
const NOT_ASKED = ['app', 'automations', 'parent', 'arena', 'assistant', 'swarm', 'research', 'help', 'page', 'file', 'make', 'board', 'experiment', 'inbox', 'chat'];

export const startedByPerson = (extra: SessionExtra | undefined) => !NOT_ASKED.some((k) => extra?.[k] !== undefined && extra[k] !== null && extra[k] !== false);

/** What the question asks of the wiki's build (part of Build from history); a test puts its own here. */
export const buildApi = { offer: buildOffer, start: startBuild, stop: stopJob };

// ---- what the person said no to ----------------------------------------------------------------------------------

const optKey = (space: string) => `wiki.ask.${space}`;

/** 'never' (Don't ask for this project), a time until which it does not ask (Start without memory), or nothing. */
export function askedNot(db: DB, space: string, now = Date.now()): 'never' | 'later' | null {
  const v = kvGet(db, optKey(space));
  if (v === 'never') return 'never';
  const until = v?.startsWith('until:') ? Number(v.slice(6)) : 0;
  return until > now ? 'later' : null;
}

export const askNever = (db: DB, space: string) => kvSet(db, optKey(space), 'never');
export const askLater = (db: DB, space: string, now = Date.now()) => {
  if (kvGet(db, optKey(space)) !== 'never') kvSet(db, optKey(space), `until:${now + SNOOZE_MS}`);
};

// ---- when to ask -------------------------------------------------------------------------------------------------

/** What the card shows of the offer. */
export const offerOf = (o: BuildOffer): Pick<MemoryAsk, 'counts' | 'minutes' | 'helper'> => ({ counts: o.counts, minutes: Math.max(1, Math.round(o.minutesEssentials)), helper: o.helper });

/**
 * Whether a session a person starts (`extra` and `space`, the project it is in, as create() knows them) asks to build the
 * project's memory first, and what it offers. Every condition: memory on, for the session and for the project's wiki; the
 * wiki empty with something to build from; no job running and no build ever run on it; and not said no to.
 */
export async function askFor(db: DB, o: { extra: SessionExtra | undefined; space: string | null | undefined; now?: number }): Promise<{ space: string; name: string; offer: BuildOffer } | null> {
  const { extra, space } = o;
  if (!space || !startedByPerson(extra) || isConfidential(extra)) return null;
  const project = spaceById(db, space);
  if (!project) return null;
  if (!memoryOn(db) || extra?.memory === false || !wikiChatEnabled(db, extra ?? {}) || !wikiMemoryOn(db, space)) return null;
  if (askedNot(db, space, o.now)) return null;
  if (jobRunning(space) || jobState(db, space)?.kind === 'build') return null;
  const offer = await buildApi.offer(db, space).catch(() => null);
  if (!offer || !offer.empty || !offer.worth) return null;
  return { space, name: project.name, offer };
}

// ---- the sessions waiting ----------------------------------------------------------------------------------------

/** A session whose first message is held: asking (the card), building (the agent starts when the essentials are read), failed. */
export interface Gate {
  state: MemoryAsk['state'];
  /** The project's id and name, and what it offered. */
  project: string;
  name: string;
  counts: MemoryAsk['counts'];
  minutes: number;
  helper: MemoryAsk['helper'];
  at: number;
  /** The first message as it goes to the agent (its files listed), what the capabilities read of it, and its pictures (saved). */
  text: string;
  said: string;
  images: { path: string; mediaType: string }[];
  error?: string;
  /** The failure is the agent not starting again for its message, not the build. */
  startFailed?: true;
}

const GATES = 'memory.ask.gates';

export function loadGates(db: DB): Map<string, Gate> {
  try {
    const m = JSON.parse(kvGet(db, GATES) || '{}');
    return new Map(Object.entries(m && typeof m === 'object' ? (m as Record<string, Gate>) : {}));
  } catch {
    return new Map();
  }
}

export const saveGates = (db: DB, gates: Map<string, Gate>) => kvSet(db, GATES, JSON.stringify(Object.fromEntries(gates)));

/** The card a gate shows (the id is the session's, so the page's cards keep one place). */
export const cardOf = (g: Gate): import('../../shared/types.ts').ApprovalRequest => ({
  id: 'memory-ask',
  title: g.state === 'asking' ? `Build ${g.name}’s memory first?` : g.state === 'failed' ? `Building ${g.name}’s memory did not finish` : `Building ${g.name}’s memory`,
  kind: 'other',
  options:
    g.state === 'asking'
      ? [
          { id: 'build', label: 'Build memory, then start', style: 'primary' },
          { id: 'start', label: 'Start without memory' },
          { id: 'never', label: 'Don’t ask for this project' },
        ]
      : g.state === 'failed'
        ? g.startFailed
          ? [
              { id: 'new', label: 'Start in a new session', style: 'primary' },
              { id: 'now', label: 'Try again' },
            ]
          : [
              { id: 'retry', label: 'Try again', style: 'primary' },
              { id: 'now', label: 'Start anyway' },
            ]
        : [
            { id: 'now', label: 'Start now' },
            { id: 'stop', label: 'Stop building' },
          ],
  memory: { state: g.state, project: g.project, name: g.name, counts: g.counts, minutes: g.minutes, helper: g.helper, ...(g.error ? { error: g.error } : {}), ...(g.startFailed ? { startFailed: true as const } : {}) },
  createdAt: g.at,
});
