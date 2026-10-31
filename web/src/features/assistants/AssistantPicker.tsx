// On the start page: which assistant the new session starts as. One row each (icon, name, one line);
// General the first time, then the last one picked. Picking one turns its connections on for the session.
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Settings2 } from 'lucide-react';
import { assistantExtra, type Assistant } from '@shared/assistants';
import type { SessionExtra } from '@shared/features';
import { go } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { cx, MenuItem, MenuLabel, MenuSep, Popover } from '../../components/ui';
import { AssistantIcon } from './icons';
import { assistantIn, lastAssistant, rememberAssistant, useAssistantsState } from './state';

const AGENTS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };

/** What picking it also sets, in words: "Claude Code · opus". */
function suggests(a: Assistant, acpName: (id: string) => string | undefined): string {
  if (!a.agent) return '';
  return [a.agent === 'acp' ? (acpName(a.acpAgent ?? '') ?? a.acpAgent) : AGENTS[a.agent], a.model].filter(Boolean).join(' · ');
}

export function AssistantStartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const st = useAssistantsState();
  const acp = useApp((s) => s.boot?.acpAgents);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const set = (a: Assistant) => onChange({ ...assistantExtra(a), connections: assistantExtra(a).connections });
  // A new session starts as the assistant picked last, while it still exists.
  useEffect(() => {
    if (!st || value.assistant !== undefined) return;
    const a = assistantIn(st, lastAssistant()) ?? assistantIn(st, undefined);
    if (a) set(a);
  }, [st]);
  if (!st) return null;
  const cur = assistantIn(st, typeof value.assistant === 'string' ? value.assistant : undefined);
  const acpName = (id: string) => acp?.find((x) => x.id === id)?.name;
  const pick = (a: Assistant) => {
    rememberAssistant(a.id);
    set(a);
    setOpen(false);
  };
  const row = (a: Assistant) => {
    const sel = a.id === cur?.id;
    const also = suggests(a, acpName);
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => pick(a)}
        title={[a.description, also && `Uses ${also}`].filter(Boolean).join('\n')}
        className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg-2', sel && 'bg-bg-2')}
      >
        <AssistantIcon icon={a.icon} size={15} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-fg">{a.name}</span>
          <span className="block truncate text-[12px] text-fg-3">{[a.description, also].filter(Boolean).join(' · ') || 'Your own assistant'}</span>
        </span>
        {sel && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
      </button>
    );
  };
  const mine = st.assistants.filter((a) => !a.builtin);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={cur ? `${cur.name}: ${cur.description}` : 'Which assistant this session starts as'}
        className={cx('inline-flex h-8 max-w-[11rem] min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2 text-fg')}
      >
        <AssistantIcon icon={cur?.icon ?? 'sparkles'} size={14} plain className="text-fg-3" />
        <span className="truncate font-medium">{cur?.name ?? 'Assistant'}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60 max-md:hidden" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={Math.min(340, window.innerWidth - 16)}>
        <MenuLabel>Start as</MenuLabel>
        {st.assistants.filter((a) => a.builtin).map(row)}
        {mine.length > 0 && (
          <>
            <MenuSep />
            <MenuLabel>Yours</MenuLabel>
            {mine.map(row)}
          </>
        )}
        <MenuSep />
        <MenuItem
          icon={<Settings2 size={14} />}
          onClick={() => {
            setOpen(false);
            go('/settings?s=assistants');
          }}
        >
          Make or change assistants…
        </MenuItem>
      </Popover>
    </>
  );
}
