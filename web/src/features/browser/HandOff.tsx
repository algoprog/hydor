// Handing the page you are on to an agent to do something in it: Ask's Do (BrowserAsk.tsx). It gets a tab of its own at
// your page, with your sign-ins on the site, only the browser, and asks before it sends, posts, deletes or pays. Only
// Claude Code and Custom, the app's own agent, can be kept to one tab.
import { programUsable } from '@shared/programs';
import type { Agent } from '@shared/types';
import { post } from '../../lib/api';
import { agentKey, lastAgent, startSettings } from '../../lib/start';
import { toastError, useApp } from '../../lib/store';
import { agentName } from '../../components/AgentIcon';
import { modelLabel, useCatalog } from '../../components/AgentPickers';

/** The model and account an agent runs with, as the start page last had them (as Help's questions do). */
export function useRunFor(agent: Agent, acp: string | null) {
  const boot = useApp((s) => s.boot);
  const cat = useCatalog(agent, acp ?? undefined);
  const r = startSettings().runs?.[agentKey(agent, acp)] ?? {};
  const p = cat?.prefs ?? {};
  const model = (r.model !== undefined ? r.model : p.model) ?? (agent === 'codex' ? (cat?.models.find((x) => x.isDefault)?.value ?? null) : null);
  const account = (r.account !== undefined ? r.account : p.account) ?? '';
  const acct = boot?.accounts.some((a) => a.id === account && a.agent === agent) ? account : undefined;
  const acpName = agent === 'acp' ? boot?.acpAgents.find((a) => a.id === acp)?.name : undefined;
  return { agent, acp, model, account: acct, label: `${agentName(agent, acpName)} · ${modelLabel(cat, model)}` };
}

export type Who = 'claude' | 'custom';

/** The agents that can be kept to one tab: Claude Code and Hydor's own agent, Custom. */
export const whoOf = (w: Who): { agent: Agent; acp: string | null } => (w === 'claude' ? { agent: 'claude', acp: null } : { agent: 'acp', acp: 'console' });

/** Which of the two the start page last had: Claude Code unless it was Custom, or Claude Code is not signed in here. */
export const lastWho = (): Who => {
  const last = lastAgent();
  return (last.agent === 'acp' && last.acp === 'console') || !programUsable(useApp.getState().boot?.programs, 'claude') ? 'custom' : 'claude';
};

/**
 * Starts a session that gets a tab of its own at this tab's page to do what was asked there (your tab stays yours), with
 * the model and account the start page last had for that agent unless `run` says. `more`: other fields of the request
 * (attachments). The key of the session, or null when it did not start (the reason is shown).
 */
export async function startDo(tab: string, prompt: string, who: Who = lastWho(), run?: { model: string | null; account?: string }, more?: Record<string, unknown>): Promise<string | null> {
  const { agent, acp } = whoOf(who);
  const r = startSettings().runs?.[agentKey(agent, acp)] ?? {};
  const account = run ? run.account : useApp.getState().boot?.accounts.some((a) => a.id === r.account && a.agent === agent) ? r.account : undefined;
  try {
    const made = await post<{ key: string }>('/api/sessions', {
      ...more,
      agent,
      acpAgent: agent === 'acp' ? acp : undefined,
      prompt,
      model: (run ? run.model : r.model) ?? undefined,
      account,
      extra: { browserHandoff: { tab } },
    });
    return made.key;
  } catch (e) {
    toastError(e);
    return null;
  }
}
