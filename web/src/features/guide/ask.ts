// Asking an agent from Help: a question starts a session with the agent, model and account picked last on the
// start page, at the agent's own effort and permissions (so a change it makes in the app shows a card to confirm
// first), marked as asked from Help (`extra.help`, with the topic being read) so its agent answers from the
// guide, and leaving the agent's remembered settings as they were. Its conversation shows in a panel beside the
// guide; the session stays among the others, to read again or carry on.
import { create } from 'zustand';
import { post } from '../../lib/api';
import { agentKey, lastAgent, startSettings } from '../../lib/start';
import { useApp } from '../../lib/store';
import { agentName } from '../../components/AgentIcon';
import { modelLabel, useCatalog } from '../../components/AgentPickers';
import type { Agent } from '@shared/types';

interface AskState {
  /** The panel shows. */
  open: boolean;
  /** The session answering, once asked. */
  key: string | null;
  /** The question while its session starts. */
  pending?: string;
  /** Text for the panel's question box (an example picked). */
  draft: string;
  /** The topic open when the panel opened, which the question may be about. */
  topic?: string;
}

export const useAsk = create<AskState>(() => ({ open: false, key: null, draft: '' }));

/** Opens the panel for a new question: empty, or with a question to send or change first. */
export const openAsk = (o: { draft?: string; topic?: string } = {}) => useAsk.setState({ open: true, key: null, pending: undefined, draft: o.draft ?? '', topic: o.topic });

/** Shows the panel again with the conversation it had. */
export const reopenAsk = () => useAsk.setState({ open: true });

export const closeAsk = () => useAsk.setState({ open: false });

export interface AskRun {
  agent: Agent;
  acp: string | null;
  model: string | null;
  account?: string;
  /** "Claude Code · Sonnet 5.5". */
  label: string;
}

/** Who answers: the agent picked last on the start page, with the model and account it runs with from there. */
export function useAskRun(): AskRun {
  const boot = useApp((s) => s.boot);
  const { agent, acp } = lastAgent();
  const cat = useCatalog(agent, acp ?? undefined);
  const r = startSettings().runs?.[agentKey(agent, acp)] ?? {};
  const p = cat?.prefs ?? {};
  // As the start page does: Codex's default must be named, or it takes a model a ChatGPT sign-in may not allow.
  const model = (r.model !== undefined ? r.model : p.model) ?? (agent === 'codex' ? (cat?.models.find((x) => x.isDefault)?.value ?? null) : null);
  const account = (r.account !== undefined ? r.account : p.account) ?? '';
  const acct = boot?.accounts.some((a) => a.id === account && a.agent === agent) ? account : undefined;
  const acpName = agent === 'acp' ? boot?.acpAgents.find((a) => a.id === acp)?.name : undefined;
  return { agent, acp, model, account: acct, label: `${agentName(agent, acpName)} · ${modelLabel(cat, model)}` };
}

/**
 * Starts the session that answers, in the home folder (the server's default): the panel shows the question at
 * once and the conversation when it has started. If it can't start, the question goes back in the box.
 */
export async function askAgent(question: string, run: AskRun, topic?: string): Promise<void> {
  const q = question.trim();
  if (!q) return;
  useAsk.setState({ open: true, key: null, pending: q, draft: '', topic });
  try {
    const r = await post<{ key: string }>('/api/sessions', {
      agent: run.agent,
      acpAgent: run.agent === 'acp' ? run.acp : undefined,
      prompt: q,
      model: run.model ?? undefined,
      account: run.account,
      extra: { help: topic ?? true },
    });
    if (useAsk.getState().pending === q) useAsk.setState({ key: r.key, pending: undefined });
  } catch (e) {
    if (useAsk.getState().pending === q) useAsk.setState({ pending: undefined, draft: q });
    throw e;
  }
}
