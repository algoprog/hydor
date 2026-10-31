// Which agent a new session runs: Claude Code, Codex, Console (any model) or another agent that speaks
// ACP, all in one list, none ahead of the others. The last one used is picked next time.
import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AcpAgentDef, Agent } from '@shared/types';
import { go } from '../../lib/nav';
import { AgentIcon } from '../../components/AgentIcon';
import { cx, MenuItem, MenuSep, OptionRow, Popover } from '../../components/ui';

const HINT: Record<'claude' | 'codex', string> = {
  claude: 'Anthropic · Claude plan or API key',
  codex: 'OpenAI · ChatGPT plan or API key',
};

export function AgentPicker({ agent, acpId, acpList, onPick }: { agent: Agent; acpId: string | null; acpList: AcpAgentDef[]; onPick: (agent: Agent, acpId: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const acp = agent === 'acp' ? acpList.find((a) => a.id === acpId) : undefined;
  const name = agent === 'claude' ? 'Claude Code' : agent === 'codex' ? 'Codex' : (acp?.name ?? 'Agent');
  const pick = (a: Agent, id: string | null = null) => {
    onPick(a, id);
    setOpen(false);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Which agent runs the session"
        className={cx('inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-bg-2 px-3 text-[13.5px] font-medium text-fg ring-1 ring-line transition-colors hover:bg-bg-3', open && 'bg-bg-3')}
      >
        <AgentIcon agent={agent} name={acp?.name} size={15} />
        <span className="max-w-[160px] truncate">{name}</span>
        <ChevronDown size={14} className={cx('text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300}>
        <OptionRow icon={<AgentIcon agent="claude" size={15} />} label="Claude Code" hint={HINT.claude} selected={agent === 'claude'} onClick={() => pick('claude')} />
        <OptionRow icon={<AgentIcon agent="codex" size={15} />} label="Codex" hint={HINT.codex} selected={agent === 'codex'} onClick={() => pick('codex')} />
        {acpList.map((a) => (
          <OptionRow
            key={a.id}
            icon={<AgentIcon agent="acp" name={a.name} size={15} />}
            label={a.name}
            hint={a.builtin ? 'Any model: OpenRouter, Ollama, vLLM' : `ACP agent · ${a.command}`}
            selected={agent === 'acp' && a.id === acpId}
            onClick={() => pick('acp', a.id)}
          />
        ))}
        <MenuSep />
        <MenuItem onClick={() => (setOpen(false), go('/settings?s=models'))}>Models for Console…</MenuItem>
        <MenuItem onClick={() => (setOpen(false), go('/settings?s=agents'))}>Add or manage agents…</MenuItem>
      </Popover>
    </>
  );
}
