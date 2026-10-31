// Agents beyond Claude Code and Codex that speak the Agent Client Protocol (Gemini CLI, OpenCode…),
// set up in Settings → More agents: a pick for the start bar.
import { useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { AcpAgentDef } from '@shared/types';
import { go } from '../../lib/nav';
import { AgentIcon } from '../../components/AgentIcon';
import { cx, MenuItem, MenuSep, OptionRow, Popover } from '../../components/ui';

export function MoreAgents({ list, value, onPick }: { list: AcpAgentDef[]; value: string | null; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const current = list.find((a) => a.id === value);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Other agents (ACP)"
        className={cx(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors',
          current ? 'bg-bg-2 text-fg ring-1 ring-line' : 'text-fg-3 hover:bg-bg-2 hover:text-fg',
        )}
      >
        {current ? <AgentIcon agent="acp" name={current.name} size={14} /> : <Plus size={14} />}
        <span className="max-w-[120px] truncate">{current?.name ?? 'More'}</span>
        <ChevronDown size={13} className="text-fg-3" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={250}>
        {list.length ? (
          list.map((a) => <OptionRow key={a.id} icon={<AgentIcon agent="acp" name={a.name} size={14} />} label={a.name} hint={a.builtin ? 'Any model: OpenRouter, Ollama, or vLLM here' : [a.command, ...a.args].join(' ')} selected={a.id === value} onClick={() => (onPick(a.id), setOpen(false))} />)
        ) : (
          <div className="px-2.5 py-2 text-[12.5px] leading-relaxed text-fg-3">Gemini CLI, OpenCode, Qwen Code, Goose and other agents that speak ACP can run here too.</div>
        )}
        <MenuSep />
        <MenuItem onClick={() => (setOpen(false), go('/settings?s=agents'))}>{list.length ? 'Manage agents…' : 'Set one up…'}</MenuItem>
      </Popover>
    </>
  );
}
