// On the start page: which assistant the new session starts as. General the first time, then the one
// the start page used last. Picking one turns its connections on.
import { useEffect, useRef, useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { assistantExtra, type Assistant } from '@shared/assistants';
import type { SessionExtra } from '@shared/features';
import { go } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { cx, MenuItem, MenuLabel, MenuSep, Popover, SettingChip, useSheets } from '../../components/ui';
import { AssistantIcon } from './icons';
import { assistantIn, lastAssistant, useAssistantsState } from './state';

const AGENTS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };

/** What picking it also sets, in words: "Claude Code · opus". */
function suggests(a: Assistant, acpName: (id: string) => string | undefined): string {
  if (!a.agent) return '';
  return [a.agent === 'acp' ? (acpName(a.acpAgent ?? '') ?? a.acpAgent) : AGENTS[a.agent], a.model].filter(Boolean).join(' · ');
}

/**
 * The assistant picker. By its chip, the assistants are a grid of names, two to a row, and what the one
 * pointed at does shows under it, so the menu stays short however many there are. A phone's sheet from
 * the bottom has the room to list each with its line, as there is nothing to point at there.
 */
export function AssistantStartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const st = useAssistantsState();
  const acp = useApp((s) => s.boot?.acpAgents);
  const sheet = useSheets();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // The one pointed at (or reached with Tab), whose line shows under the grid.
  const [peek, setPeek] = useState<Assistant | null>(null);
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
    set(a);
    setOpen(false);
    setPeek(null);
  };
  const about = (a: Assistant) => {
    const also = suggests(a, acpName);
    return [a.description || 'Your own assistant', also && `Uses ${also}`].filter(Boolean).join(' · ');
  };
  const row = (a: Assistant) => {
    const sel = a.id === cur?.id;
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => pick(a)}
        className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg-2', sel && 'bg-bg-2')}
      >
        <AssistantIcon icon={a.icon} size={15} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-fg">{a.name}</span>
          <span className="block truncate text-[12px] text-fg-3">{about(a)}</span>
        </span>
        {sel && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
      </button>
    );
  };
  const tile = (a: Assistant) => {
    const sel = a.id === cur?.id;
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => pick(a)}
        onMouseEnter={() => setPeek(a)}
        onFocus={() => setPeek(a)}
        aria-pressed={sel}
        aria-description={about(a)}
        className={cx('flex h-9.5 min-w-0 items-center gap-2 rounded-lg pr-2 pl-1.5 text-left transition-colors hover:bg-bg-2', sel && 'bg-bg-2')}
      >
        <AssistantIcon icon={a.icon} size={13} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">{a.name}</span>
        {sel && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
      </button>
    );
  };
  const builtin = st.assistants.filter((a) => a.builtin);
  const mine = st.assistants.filter((a) => !a.builtin);
  const shown = peek ?? cur;
  return (
    <>
      <SettingChip
        ref={ref}
        label="Assistant"
        open={open}
        onClick={() => setOpen((o) => !o)}
        title={cur ? `${cur.name}: ${cur.description}` : 'Which assistant this session starts as'}
        value={
          <span className="inline-flex items-center gap-1.5">
            <AssistantIcon icon={cur?.icon ?? 'sparkles'} size={13} plain className="shrink-0 text-fg-3" />
            {cur?.name ?? '…'}
          </span>
        }
      />
      <Popover
        anchor={ref}
        open={open}
        onClose={() => {
          setOpen(false);
          setPeek(null);
        }}
        width={Math.min(sheet ? 340 : 360, window.innerWidth - 16)}
        title="Assistant"
      >
        <MenuLabel>Start as</MenuLabel>
        {sheet ? (
          <>
            {builtin.map(row)}
            {mine.length > 0 && (
              <>
                <MenuSep />
                <MenuLabel>Yours</MenuLabel>
                {mine.map(row)}
              </>
            )}
          </>
        ) : (
          <div onMouseLeave={() => setPeek(null)}>
            <div className="grid grid-cols-2 gap-0.5">{builtin.map(tile)}</div>
            {mine.length > 0 && (
              <>
                <MenuLabel>Yours</MenuLabel>
                <div className="grid grid-cols-2 gap-0.5">{mine.map(tile)}</div>
              </>
            )}
            <p className="mx-1.5 mt-1 line-clamp-2 min-h-[calc(2lh+9px)] border-t border-line px-1 pt-2 text-[12px] leading-4 text-fg-3">{shown ? about(shown) : ''}</p>
          </div>
        )}
        <MenuSep />
        <MenuItem
          icon={<Settings2 size={14} />}
          onClick={() => {
            setOpen(false);
            go('/settings?s=assistants');
          }}
        >
          Make or change assistants
        </MenuItem>
      </Popover>
    </>
  );
}
