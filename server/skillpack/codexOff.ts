// Which of Codex's own skills are switched off, as Hydor keeps it. Asking Codex takes a process of its own and a reload
// of every skill, so no turn of an agent waits for it: what it last said is kept, brought up to date in the background,
// and changed at once when a skill is switched on or off in Hydor.
import fs from 'node:fs';
import path from 'node:path';
import type { Agent } from '../../shared/types.ts';
import type { CodexControl } from '../agents/control.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { codexSkills, setSkillEnabled } from '../setup.ts';

const KEPT = 'skillpack.codexOff';

/** A folder's skills are asked of Codex at most once in `again` ms; a start with nothing kept waits `wait` ms for it. */
export const codexOffTiming = { again: 60_000, wait: 3000 };

export const realFile = (file: string) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};

/** The SKILL.md files kept as off, by their real paths; null when nothing was ever kept. */
export function keptCodexOff(db: DB): Set<string> | null {
  try {
    const v = JSON.parse(kvGet(db, KEPT) ?? 'null');
    return Array.isArray(v) ? new Set(v.filter((x) => typeof x === 'string')) : null;
  } catch {
    return null;
  }
}

const keep = (db: DB, off: Set<string>) => kvSet(db, KEPT, JSON.stringify([...off].sort()));

/** When each folder was last asked about, and the questions Codex has not answered yet. */
const asked = new Map<string, number>();
const asking = new Map<string, Promise<void>>();
/** The skills switched in Hydor, each with the number of that change: an answer asked for before it does not undo it. */
const switched = new Map<string, number>();
let changes = 0;
let warned = false;

/** Asks Codex about a folder's skills, unless it was just asked: the question in the air, or none. */
function refresh(db: DB, control: () => CodexControl, cwd: string): Promise<void> | undefined {
  const now = asking.get(cwd);
  if (now) return now;
  if (Date.now() - (asked.get(cwd) ?? -Infinity) < codexOffTiming.again) return undefined;
  asked.set(cwd, Date.now());
  const since = changes;
  const job = (async () => {
    const { skills } = await codexSkills(control(), cwd);
    // Codex tells of one folder at a time: what it says of these skills changes what is kept, the others' stays.
    const off = keptCodexOff(db) ?? new Set<string>();
    for (const k of skills) {
      const file = realFile(k.path);
      if ((switched.get(file) ?? 0) > since) continue;
      if (k.enabled) off.delete(file);
      else off.add(file);
    }
    keep(db, off);
  })()
    .catch((e) => {
      // No Codex, or one that fails: what is kept holds, and it is not asked again for a while.
      if (!warned) console.warn(`[skillpack] Codex did not say which of its skills are off: ${(e as Error)?.message ?? e}`);
      warned = true;
    })
    .finally(() => asking.delete(cwd));
  asking.set(cwd, job);
  return job;
}

/**
 * Codex's own skills switched off, by their real files: what is kept, at once, while Codex is asked again in the
 * background. With `start`, for an agent that is starting and with nothing ever kept, it waits a moment for the answer.
 */
export async function codexOff(db: DB, control: () => CodexControl, cwd: string, start = false): Promise<Set<string>> {
  const job = refresh(db, control, cwd);
  const kept = keptCodexOff(db);
  if (kept || !start || !job) return kept ?? new Set();
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([job, new Promise<void>((done) => (timer = setTimeout(done, codexOffTiming.wait)))]);
  clearTimeout(timer);
  return keptCodexOff(db) ?? new Set();
}

/** Switches one of Claude Code's or Codex's own skills (setup.ts); a Codex skill's switch is kept here at once. */
export async function switchSkill(db: DB, control: CodexControl, agent: Agent, name: string, file: string, enabled: boolean): Promise<void> {
  await setSkillEnabled(control, agent, name, file, enabled);
  if (agent !== 'codex') return;
  const real = realFile(file);
  switched.set(real, ++changes);
  const kept = keptCodexOff(db);
  if (!kept && enabled) return;
  const off = kept ?? new Set<string>();
  if (enabled) off.delete(real);
  else off.add(real);
  keep(db, off);
}

/** For tests: the questions in the air answered; and every folder as if it had not been asked about. */
export const codexOffSettled = () => Promise.all(asking.values());
export const askCodexAgain = () => asked.clear();
