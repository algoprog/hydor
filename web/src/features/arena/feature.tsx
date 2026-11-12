// The model arena: on the start page, an option under Options to run the same prompt on one or two more
// models; in each of a match's sessions, a bar to compare their answers; the compare page, where you keep the
// best one; and the board of which models win (Usage → Arena).
import { useMemo, useRef, useState } from 'react';
import { Swords } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import { ARENA_MAX, arenaOf, contenderId, type Contender } from '@shared/arena';
import type { SessionSummary } from '@shared/types';
import { AgentIcon } from '../../components/AgentIcon';
import { useCatalog } from '../../components/AgentPickers';
import { cx, inputCls, OptionRow, Popover, SettingChip } from '../../components/ui';
import { go } from '../../lib/nav';
import { useApp } from '../../lib/store';
import type { WebFeature } from '../registry';
import { useCostlyMode } from '../tips/ModeExplainer';
import { ComparePage } from './ComparePage';
import { useContenderName } from './names';

const DOCK = 'mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]';
const LAST = 'naget.arena.v1';

/** The models one can pick: each agent's, a few each, the default first. */
function useChoices(): Contender[] {
  const claude = useCatalog('claude');
  const codex = useCatalog('codex');
  const custom = useCatalog('acp', 'console');
  const acps = useApp((s) => s.boot?.acpAgents) ?? [];
  return useMemo(() => {
    const out: Contender[] = [];
    const of = (agent: Contender['agent'], cat: typeof claude, acpAgent?: string) => {
      const models = (cat?.models ?? []).filter((m) => m.value !== 'default');
      for (const m of models.slice(0, 5)) out.push({ agent, model: m.value, ...(acpAgent ? { acpAgent } : {}) });
    };
    of('claude', claude);
    of('codex', codex);
    of('acp', custom, 'console');
    for (const a of acps.filter((x) => !x.builtin)) out.push({ agent: 'acp', acpAgent: a.id });
    return out;
  }, [claude, codex, custom, acps]);
}

/** On the start page, under Options: one model, or the same prompt on one or two more, side by side. Not kept for the next start. */
function ArenaStartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const name = useContenderName();
  const choices = useChoices();
  const picked = arenaOf(value) ?? [];
  const ids = new Set(picked.map(contenderId));
  const set = (next: Contender[]) => {
    if (next.length) localStorage.setItem(LAST, JSON.stringify(next));
    onChange({ arena: next.length ? { with: next } : undefined });
  };
  const toggle = (c: Contender) => {
    const id = contenderId(c);
    if (ids.has(id)) set(picked.filter((x) => contenderId(x) !== id));
    else set([...picked, c].slice(-(ARENA_MAX - 1)));
  };
  const turnOn = () => {
    let last: Contender[] = [];
    try {
      last = arenaOf({ arena: { with: JSON.parse(localStorage.getItem(LAST) ?? '[]') } }) ?? [];
    } catch {}
    set(last.length ? last : choices.slice(0, 1));
  };
  // Picked for the first time, it is explained before it is on (what it is for, what it costs).
  const { ask, dialog } = useCostlyMode();
  // A long list gets a find field, so the menu still fits on the screen.
  const shown = choices.filter((c) => !q.trim() || name(c).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  return (
    <>
      <SettingChip
        ref={ref}
        label="Arena"
        icon={<Swords size={14} />}
        value={picked.length ? `+${picked.length} model${picked.length === 1 ? '' : 's'}` : 'Off'}
        on={!!picked.length}
        open={open}
        onClick={() => setOpen((o) => !o)}
        title={picked.length ? `The same prompt also goes to ${picked.map(name).join(' and ')}: compare the answers and keep the best` : 'One model answers'}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320} title="Arena">
        <OptionRow label="Off" hint="One model answers" selected={!picked.length} onClick={() => (set([]), setOpen(false))} />
        <OptionRow label="Compare models" hint="The same prompt to more models, side by side" selected={!!picked.length} onClick={() => !picked.length && ask('arena', turnOn)} />
        {!!picked.length && (
          <div className="mx-1 mt-1 border-t border-line pt-1.5">
            <div className="px-2 pb-1 text-[11.5px] text-fg-3">Beside the model you picked, also ask (up to {ARENA_MAX - 1}):</div>
            {choices.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a model" className={cx(inputCls, 'mx-1 mb-1 h-8 w-[calc(100%-8px)] text-[13px]')} />}
            {shown.map((c) => (
              <button
                key={contenderId(c)}
                type="button"
                onClick={() => toggle(c)}
                className={cx('flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-bg-2', ids.has(contenderId(c)) && 'font-medium text-accent')}
              >
                <AgentIcon agent={c.agent} size={14} name={c.acpAgent === 'console' ? 'Custom' : undefined} />
                <span className="min-w-0 flex-1 truncate">{name(c)}</span>
                <span className={cx('h-3.5 w-3.5 shrink-0 rounded-[4px] ring-1 ring-line-2 ring-inset', ids.has(contenderId(c)) && 'bg-accent ring-accent')} />
              </button>
            ))}
          </div>
        )}
        <div className="mx-1 mt-1 border-t border-line px-2 pt-2 pb-1 text-[12px] leading-snug text-fg-3">
          Each model works in a session of its own, in the same folder (turn on New worktree in a git repository, so each gets its own copy). Keep the best answer; the
          others are archived, and every pick counts toward which models win on your tasks (Usage → Arena).
        </div>
        {dialog}
      </Popover>
    </>
  );
}

/** In a match's sessions: how many models it is, and the way to compare them. */
function ArenaDock({ s }: { s: SessionSummary }) {
  const id = typeof s.extra?.arena === 'string' ? s.extra.arena : null;
  if (!id) return null;
  return (
    <div className={DOCK}>
      <Swords size={14} className="shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-fg-2">
        <span className="font-medium text-fg">Arena</span>
        <span className="max-sm:hidden"> · the same prompt went to other models</span>
      </span>
      <button type="button" onClick={() => go(`/arena/${id}`)} className="shrink-0 font-medium text-accent hover:underline">
        Compare the answers
      </button>
    </div>
  );
}

export const arenaFeature: WebFeature = {
  id: 'arena',
  StartOptions: ArenaStartOption,
  SessionDock: ArenaDock,
  routes: [{ match: (p) => p.startsWith('/arena/'), Page: ComparePage }],
};
