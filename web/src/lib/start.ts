// What the start page had picked last (the agent, each agent's model, effort and mode, the assistant, the
// folder, memory, a spending cap): kept on the server so the page opens that way again, on any device.
// Read from the bootstrap; a pick is kept in this page at once and sent a moment later.
import type { Agent, StartRun, StartSettings } from '@shared/types';
import { put } from './api';
import { onFeatureEvent } from './featureEvents';
import { useApp } from './store';

/** What changed: null clears a field; an agent's run joins its last one. */
export type StartPatch = { [K in Exclude<keyof StartSettings, 'runs'>]?: StartSettings[K] | null } & { runs?: Record<string, StartRun> };

/** The start page's names for agents: 'claude', 'codex', 'acp:<id>'. */
export const agentKey = (agent: Agent, acp?: string | null): string => (agent === 'acp' ? `acp:${acp ?? ''}` : agent);

export function parseAgentKey(k: string | undefined): { agent: Agent; acp: string | null } | null {
  if (k === 'claude' || k === 'codex') return { agent: k, acp: null };
  if (k?.startsWith('acp:') && k.length > 4) return { agent: 'acp', acp: k.slice(4) };
  return null;
}

/** Before the server kept them, the browser kept the agent and the assistant. */
function fromBrowser(): StartSettings {
  try {
    return { agent: localStorage.getItem('wa.lastAgent') || undefined, assistant: localStorage.getItem('wa.lastAssistant') || undefined };
  } catch {
    return {};
  }
}

/** The last picks, as this page knows them. */
export function startSettings(): StartSettings {
  return { ...fromBrowser(), ...useApp.getState().boot?.start };
}

/** The agent picked last (Claude Code the first time, or when the one picked is gone). */
export function lastAgent(): { agent: Agent; acp: string | null } {
  const a = parseAgentKey(startSettings().agent);
  const acp = useApp.getState().boot?.acpAgents;
  if (a?.agent === 'acp' && acp && !acp.some((x) => x.id === a.acp)) return { agent: 'claude', acp: null };
  return a ?? { agent: 'claude', acp: null };
}

function join<T extends StartSettings | StartPatch>(cur: T, p: StartPatch, keepNulls: boolean): T {
  const out: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(p)) {
    if (k === 'runs' || v === undefined) continue;
    if (v === null && !keepNulls) delete out[k];
    else out[k] = v;
  }
  if (p.runs) {
    const runs: Record<string, StartRun> = { ...(cur.runs as Record<string, StartRun> | undefined) };
    for (const [k, r] of Object.entries(p.runs)) runs[k] = { ...runs[k], ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) };
    out.runs = runs;
  }
  return out as T;
}

let unsent: StartPatch | null = null;
let sending = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function send() {
  const p = unsent;
  unsent = null;
  if (!p) return;
  sending++;
  put<StartSettings>('/api/start', p)
    .then((start) => {
      // The server's copy is the whole of it, tidied; a pick made meanwhile goes next.
      if (!unsent && sending === 1) setLocal(start);
    })
    .catch(() => {})
    .finally(() => sending--);
}

function setLocal(start: StartSettings) {
  const boot = useApp.getState().boot;
  if (boot) useApp.getState().set({ boot: { ...boot, start } });
}

/** Keeps a pick: in this page at once, on the server a moment later (a run of picks goes as one). */
export function saveStart(p: StartPatch, now = false) {
  setLocal(join(startSettings(), p, false));
  unsent = join(unsent ?? {}, p, true);
  clearTimeout(timer);
  timer = setTimeout(send, now ? 0 : 500);
}

// Another page or device picked something: the next start page opens with it.
onFeatureEvent('start', (e) => {
  if (!unsent && !sending && e.data && typeof e.data === 'object') setLocal(e.data as StartSettings);
});
