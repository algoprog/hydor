// How a model in the arena is named: its agent's name and the model's ("Codex · GPT-5.5", "Custom · Qwen3 Coder").
import type { Contender } from '@shared/arena';
import { agentName } from '../../components/AgentIcon';
import { modelLabel, useCatalog } from '../../components/AgentPickers';
import { useApp } from '../../lib/store';

/** A model's name with its agent's: "Codex · GPT-5.5", "Custom · Qwen3 Coder". */
export function useContenderName() {
  const claude = useCatalog('claude');
  const codex = useCatalog('codex');
  const custom = useCatalog('acp', 'console');
  const acps = useApp((s) => s.boot?.acpAgents) ?? [];
  return (c: Contender) => {
    const cat = c.agent === 'claude' ? claude : c.agent === 'codex' ? codex : c.acpAgent === 'console' ? custom : undefined;
    const who = agentName(c.agent, c.agent === 'acp' ? (acps.find((a) => a.id === c.acpAgent)?.name ?? c.acpAgent) : undefined);
    return c.model || cat ? `${who} · ${modelLabel(cat, c.model)}` : who;
  };
}
