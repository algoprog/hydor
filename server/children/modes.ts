// A child session's mode: the parent's, never freer. Each agent names its modes differently, so they are
// compared by how far they let the agent go without asking: plan < ask < edits < auto < full.
import type { Agent } from '../../shared/types.ts';
import { CONSOLE_ID } from '../agents/acp.ts';

const PLAN = 0;
const ASK = 1;
const EDITS = 2;
const AUTO = 3;
/** Custom's Full access still asks before risky commands. */
const FULL = 4;
/** Never asks at all. */
const BYPASS = 5;

const LEVELS: Record<string, Record<string, number>> = {
  claude: { plan: PLAN, default: ASK, acceptEdits: EDITS, auto: AUTO, bypassPermissions: BYPASS },
  // Codex has no "edits": Auto also runs commands (in its sandbox) without asking.
  codex: { plan: PLAN, 'read-only': ASK, auto: AUTO, 'auto-review': AUTO, full: BYPASS },
  custom: { plan: PLAN, ask: ASK, edits: EDITS, auto: AUTO, full: FULL },
};

/** Whose mode names a session uses: claude, codex, custom; null for another ACP agent (its modes are its own). */
export const modeFamily = (agent: Agent, acpAgent?: string): string | null => (agent === 'acp' ? (acpAgent === CONSOLE_ID ? 'custom' : null) : agent);

/** How free a mode is; ask when it is not known. */
export const modeLevel = (family: string | null, mode: string | undefined): number => (family && mode ? (LEVELS[family]?.[mode] ?? ASK) : ASK);

/**
 * The mode for a child of agent family `child`: the parent's own when the child's agent has it, else the
 * freest of the child's modes that is no freer than the parent's. None for another ACP agent (its default).
 */
export function childMode(parent: { family: string | null; mode?: string }, child: string | null): string | undefined {
  if (!child || !LEVELS[child]) return undefined;
  const table = LEVELS[child];
  const level = modeLevel(parent.family, parent.mode);
  if (parent.family === child && parent.mode && parent.mode in table) return parent.mode;
  let best: string | undefined;
  for (const [m, l] of Object.entries(table)) if (l <= level && (best === undefined || l > table[best])) best = m;
  return best;
}
