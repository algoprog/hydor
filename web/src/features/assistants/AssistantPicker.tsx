// Which assistant a session works as. On the start page: the one the new session starts as, General the
// first time, then the one the start page used last; picking one turns its connections on. In a session's
// message box: another one from the next message on.
import { useEffect, useRef, useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { assistantExtra, type Assistant, type AssistantSwitch } from '@shared/assistants';
import type { SessionExtra } from '@shared/features';
import type { SessionSummary } from '@shared/types';
import { enc, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { cx, MenuItem, MenuLabel, MenuSep, Picker, Popover, SettingChip, useSheets } from '../../components/ui';
import { AssistantIcon } from './icons';
import { assistantIn, lastAssistant, useAssistantsState } from './state';

const AGENTS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };

/** What picking it also sets, in words: "Claude Code · opus". */
function suggests(a: Assistant, acpName: (id: string) => string | undefined): string {
  if (!a.agent) return '';
  return [a.agent === 'acp' ? (acpName(a.acpAgent ?? '') ?? a.acpAgent) : AGENTS[a.agent], a.model].filter(Boolean).join(' · ');
}

/**
 * The assistants to pick from. By a chip, they are a grid of names, two to a row, and what the one pointed
 * at does shows under it, so the menu stays short however many there are. A phone's sheet from the bottom
 * has the room to list each with its line, as there is nothing to point at there.
 */
function AssistantMenu({ list, cur, heading, onPick, onSettings }: { list: Assistant[]; cur?: Assistant; heading: string; onPick: (a: Assistant) => void; onSettings: () => void }) {
  const acp = useApp((s) => s.boot?.acpAgents);
  const sheet = useSheets();
  // The one pointed at (or reached with Tab), whose line shows under the grid.
  const [peek, setPeek] = useState<Assistant | null>(null);
  const acpName = (id: string) => acp?.find((x) => x.id === id)?.name;
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
        onClick={() => onPick(a)}
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
        onClick={() => onPick(a)}
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
  const builtin = list.filter((a) => a.builtin);
  const mine = list.filter((a) => !a.builtin);
  const shown = peek ?? cur;
  return (
    <>
      <MenuLabel>{heading}</MenuLabel>
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
      <MenuItem icon={<Settings2 size={14} />} onClick={onSettings}>
        Make or change assistants
      </MenuItem>
    </>
  );
}

/** The start page's assistant picker: which assistant the new session starts as. */
export function AssistantStartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const st = useAssistantsState();
  const sheet = useSheets();
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
  return (
    <>
      <SettingChip
        ref={ref}
        label="Assistant"
        open={open}
        onClick={() => setOpen((o) => !o)}
        title={cur ? `${cur.name}\n${cur.description}` : 'Which assistant this session starts as'}
        value={
          <span className="inline-flex items-center gap-1.5">
            <AssistantIcon icon={cur?.icon ?? 'sparkles'} size={13} plain className="shrink-0 text-fg-3" />
            {cur?.name ?? '…'}
          </span>
        }
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={Math.min(sheet ? 340 : 360, window.innerWidth - 16)} title="Assistant">
        <AssistantMenu
          list={st.assistants}
          cur={cur}
          heading="Start as"
          onPick={(a) => {
            set(a);
            setOpen(false);
          }}
          onSettings={() => {
            setOpen(false);
            go('/settings?s=assistants');
          }}
        />
      </Popover>
    </>
  );
}

/** The assistant a session works as; undefined while the list loads, null for none (started elsewhere, or before assistants). */
export function useSessionAssistant(s: SessionSummary): Assistant | null | undefined {
  const st = useAssistantsState();
  const id = s.extra?.assistant;
  if (!st) return undefined;
  return typeof id === 'string' ? (st.assistants.find((a) => a.id === id) ?? null) : null;
}

/**
 * In a session's message box: which assistant the agent works as, and another from the next message on
 * (its connections on, and the model and mode it suggests set, as on the start page). Beside the model on a
 * wide box; named (`label`) in the Options menu of a narrow one. `onConfig` hears of a model or mode it set.
 */
export function SessionAssistantPicker({ s, label, onConfig }: { s: SessionSummary; label?: string; onConfig?: (c: { model?: string; mode?: string }) => void }) {
  const st = useAssistantsState();
  const cur = useSessionAssistant(s);
  if (!st || cur === undefined) return null;
  const pick = async (a: Assistant) => {
    if (a.id === cur?.id) return;
    try {
      const r = await put<AssistantSwitch>(`/api/assistants/session/${enc(s.key)}`, { id: a.id });
      if (r.model || r.mode) onConfig?.({ ...(r.model ? { model: r.model } : {}), ...(r.mode ? { mode: r.mode } : {}) });
      toast(`The agent works as ${a.name} from your next message`);
    } catch (e) {
      toastError(e);
    }
  };
  const name = cur?.name ?? (label ? 'None' : 'No assistant');
  return (
    <Picker
      icon={label ? undefined : <AssistantIcon icon={cur?.icon ?? 'sparkles'} size={13} plain className="shrink-0" />}
      label={label}
      value={
        label ? (
          <span className="inline-flex items-center gap-1.5">
            {cur && <AssistantIcon icon={cur.icon} size={13} plain className="shrink-0 text-fg-3" />}
            {name}
          </span>
        ) : (
          name
        )
      }
      title={cur ? `Assistant: ${cur.name}\n${cur.description}` : 'Assistant: none. Pick one to shape how the agent works from your next message'}
      width={360}
    >
      {(close) => (
        <AssistantMenu
          list={st.assistants}
          cur={cur ?? undefined}
          heading="Switch to"
          onPick={(a) => {
            close();
            void pick(a);
          }}
          onSettings={() => {
            close();
            go('/settings?s=assistants');
          }}
        />
      )}
    </Picker>
  );
}
