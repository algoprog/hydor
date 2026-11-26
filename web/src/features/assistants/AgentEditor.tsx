// The New agent window: one window to make an agent (describe it, then set it up), to change every setting of one
// (All settings) and to make a copy (Duplicate). The settings are seven short sections in a column at the left, each
// showing its current value under its name, so that everything is in view at once; on a phone the sections are a list
// and one opens at a time. A pane that still scrolls shows a shade and a "More below" button.
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Brain, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Compass, FilePen, FileSearch, FileText, FolderOpen, Globe, Monitor, Puzzle, Send, Sparkles, SquareTerminal, Trash2, Users, Wallet, Wrench, X, type LucideIcon } from 'lucide-react';
import { ASSISTANT_ICONS, ASSISTANT_MODES, TOOL_KINDS, type AgentDraft, type Assistant, type AssistantsState, type ToolKind } from '@shared/assistants';
import type { TaskSchedule } from '@shared/automations';
import type { ConnectionView } from '@shared/connections';
import { tierLabel, TIERS, type Tier } from '@shared/tiers';
import type { Agent } from '@shared/types';
import { api, enc, post, put } from '../../lib/api';
import { money } from '../../lib/format';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { ModelPicker } from '../../components/AgentPickers';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Dialog, IconButton, inputCls, OptionRow, Picker, Popover, Switch, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { Group, Info, Notice, Row } from '../settings/kit';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { loadActivity, scheduleDraft, schedulesText, toolPhrases, useAgentActivity, whenText, whereText } from './agentsState';
import { AssistantIcon, ICONS } from './icons';
import { assistantTranslate } from './language';
import { OutputEditor, outputText } from './OutputEditor';
import { ScheduleChoice } from './Sentences';
import { useAssistants, useAssistantsState } from './state';

type Draft = Partial<Assistant>;

// ---- the pieces ------------------------------------------------------------------------------------------

function IconChoice({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} title="Pick an icon" className="shrink-0 rounded-[12px] transition-transform active:scale-95">
        <AssistantIcon icon={value} size={20} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={264}>
        <div className="grid grid-cols-6 gap-1 p-1">
          {ASSISTANT_ICONS.map((n) => {
            const I = ICONS[n];
            return (
              <button
                key={n}
                type="button"
                title={n}
                onClick={() => (onChange(n), setOpen(false))}
                className={cx('flex h-9 w-9 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', n === value && 'bg-accent-soft text-accent')}
              >
                <I size={17} />
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

/** The program it suggests, by name: Claude Code, Codex, or one of Settings → More agents. */
function programName(d: Draft, acp: { id: string; name: string }[]): string {
  return d.agent === 'acp' ? (acp.find((a) => a.id === d.acpAgent)?.name ?? d.acpAgent ?? '') : d.agent === 'claude' ? 'Claude Code' : 'Codex';
}

/** The agent it suggests: any (the start page's), Claude Code, Codex, or one of Settings → More agents. */
function AgentChoice({ d, set }: { d: Draft; set: (p: Draft) => void }) {
  const acp = useApp((s) => s.boot?.acpAgents) ?? [];
  const label = !d.agent ? 'Any agent' : programName(d, acp);
  const opt = (agent: Agent | undefined, acpAgent: string | undefined, name: string, hint: string, close: () => void) => (
    <OptionRow
      key={`${agent}:${acpAgent ?? ''}`}
      icon={agent ? <AgentIcon agent={agent} name={name} size={14} /> : undefined}
      label={name}
      hint={hint}
      selected={d.agent === agent && (agent !== 'acp' || d.acpAgent === acpAgent)}
      onClick={() => {
        set({ agent, acpAgent, model: undefined });
        close();
      }}
    />
  );
  return (
    <Picker icon={d.agent ? <AgentIcon agent={d.agent} name={label} size={13} /> : undefined} value={label} title="The agent it suggests" width={280}>
      {(close) => [
        opt(undefined, undefined, 'Any agent', 'Keeps the one picked on the start page', close),
        opt('claude', undefined, 'Claude Code', 'Anthropic', close),
        opt('codex', undefined, 'Codex', 'OpenAI', close),
        ...acp.map((a) => opt('acp', a.id, a.name, a.builtin ? 'Any model' : 'ACP agent', close)),
      ]}
    </Picker>
  );
}

function ModeChoice({ d, set }: { d: Draft; set: (p: Draft) => void }) {
  const cur = ASSISTANT_MODES.find((m) => m.id === d.mode);
  return (
    <Picker value={cur?.label ?? 'As picked'} title="Its permission mode" width={280}>
      {(close) => [
        <OptionRow key="" label="As picked" hint="Keeps the mode picked on the start page" selected={!cur} onClick={() => (set({ mode: undefined }), close())} />,
        ...ASSISTANT_MODES.map((m) => <OptionRow key={m.id} label={m.label} hint={m.hint} selected={cur?.id === m.id} onClick={() => (set({ mode: m.id }), close())} />),
      ]}
    </Picker>
  );
}

/** Names added one at a time (skills), with suggestions. */
function NameList({ value, onChange, suggestions, placeholder }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((v) => (
        <span key={v} className="inline-flex h-7 items-center gap-1 rounded-full bg-bg-2 pr-1 pl-2.5 text-[12.5px]">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 text-fg-3 hover:bg-bg-3 hover:text-fg">
            <Trash2 size={11} />
          </button>
        </span>
      ))}
      <input
        list="assistant-skill-names"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        className={cx(inputCls, 'h-8 w-44 min-w-0 flex-1 text-[13px]')}
      />
      <datalist id="assistant-skill-names">
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/**
 * A pane that scrolls, and says so: a shade at the top once it has scrolled, and while there is more below a fade at
 * the bottom with a "More below" button that scrolls on. `className` is for what sits inside (its padding).
 */
export function ScrollPane({ children, className }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
    setScrolled(el.scrollTop > 4);
  }, []);
  useEffect(() => {
    const el = box.current;
    const content = inner.current;
    if (!el || !content) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(content);
    return () => ro.disconnect();
  }, [measure]);
  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <div ref={box} onScroll={measure} className="h-full overflow-y-auto overscroll-contain">
        <div ref={inner} className={className}>
          {children}
        </div>
      </div>
      {scrolled && <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-elevated to-transparent" />}
      {more && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-elevated to-transparent" />
          <button
            type="button"
            onClick={() => box.current?.scrollBy({ top: box.current.clientHeight * 0.7, behavior: 'smooth' })}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-panel px-3 py-1 text-[12px] font-medium text-fg-2 shadow-sm hover:text-fg"
          >
            <ChevronDown size={13} />
            More below
          </button>
        </>
      )}
    </div>
  );
}

/** Words in a list ("a, b and c"), each a piece of its own, so the page translates each one and the "and". */
function Listed({ items }: { items: { key: string; node: ReactNode }[] }) {
  return (
    <>
      {items.map((x, i) => (
        <Fragment key={x.key}>
          {i > 0 && <span>{i === items.length - 1 ? ' and ' : ', '}</span>}
          {x.node}
        </Fragment>
      ))}
    </>
  );
}

/** Describe, then Set up: where a new agent is (only an indicator). */
function Steps({ step }: { step: 1 | 2 }) {
  const item = (n: 1 | 2, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cx('flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-semibold', step === n ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg-3')}>{n}</span>
      <span className={cx('text-[12.5px]', step === n ? 'text-fg' : 'text-fg-3')}>{label}</span>
    </span>
  );
  return (
    <div className="hidden items-center gap-2 sm:flex" aria-label="Steps">
      {item(1, 'Describe')}
      <span className="h-px w-4 bg-line" />
      {item(2, 'Set up')}
    </div>
  );
}

/** A list of choices of which one is on, as one box of rows; `extra` shows under a row's words while it is chosen. */
function RadioList<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; hint: string; extra?: ReactNode }[] }) {
  return (
    <div role="radiogroup" className="overflow-hidden divide-y divide-line rounded-xl border border-line bg-panel">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <div key={o.id}>
            <button type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-1">
              <span className={cx('h-4 w-4 shrink-0 rounded-full', on ? 'border-[5px] border-accent' : 'border-2 border-line-2')} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-fg">{o.label}</span>
                <span className="block text-[12px] text-fg-3">{o.hint}</span>
              </span>
            </button>
            {on && o.extra && <div className="-mt-0.5 pr-3.5 pb-3 pl-[42px]">{o.extra}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** One of two or more cards of which one is on (Where it works). */
function ChoiceCard({ on, icon, label, hint, disabled, onClick }: { on: boolean; icon: ReactNode; label: string; hint: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx('rounded-xl border p-3 text-left transition-colors disabled:opacity-50', on ? 'border-accent bg-accent-soft' : 'border-line enabled:hover:border-line-2')}
    >
      <span className="flex items-center gap-2 text-fg">
        {icon}
        <span className="text-[13.5px] font-medium">{label}</span>
      </span>
      <span className="mt-1 block text-[12px] text-fg-3">{hint}</span>
    </button>
  );
}

// ---- the sections ----------------------------------------------------------------------------------------

type SectionId = 'about' | 'when' | 'model' | 'tools' | 'team' | 'results' | 'budget';

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; lead: string }[] = [
  { id: 'about', label: 'About', icon: FileText, lead: 'What it does and how it works.' },
  { id: 'when', label: 'Where and when', icon: CalendarClock, lead: 'Where it is offered, and when it works by itself.' },
  { id: 'model', label: 'Model', icon: Brain, lead: 'What it thinks with, and when it asks you first.' },
  { id: 'tools', label: 'Tools', icon: Wrench, lead: 'What it may use while it works.' },
  { id: 'team', label: 'Team', icon: Users, lead: 'Agents it may hand parts of its work to.' },
  { id: 'results', label: 'Results', icon: Send, lead: 'What it hands back at the end of each task, and where it goes.' },
  { id: 'budget', label: 'Budget', icon: Wallet, lead: 'What its sessions may spend in a month.' },
];

const TOOL_ICONS: Record<ToolKind, LucideIcon> = { read: FileSearch, edit: FilePen, run: SquareTerminal, web: Globe, browser: Compass, computer: Monitor, mcp: Puzzle };

const TIER_HINTS: { id: Tier | undefined; label: string; hint: string }[] = [
  { id: undefined, label: 'Automatic', hint: 'The model picked where it starts' },
  { id: 'quick', label: 'Quick', hint: 'The cheapest, for small and clear jobs' },
  { id: 'standard', label: 'Standard', hint: 'Clear tasks of medium size' },
  { id: 'best', label: 'Best', hint: 'Plans, leads subagents and checks their work' },
  { id: 'max', label: 'Max', hint: 'The strongest, for the hardest problems' },
];

const IDEAS: { icon: string; title: string; text: string }[] = [
  { icon: 'newspaper', title: 'Paper digest', text: 'Every weekday at 8, find new papers on my research topics and keep the five best in my files, two lines each.' },
  { icon: 'chart-column', title: 'Weekly report', text: 'Every Friday afternoon, write my weekly progress report from my commits and notes, and let me check it before it goes.' },
  { icon: 'shield', title: 'Change reviewer', text: 'Review each change I make to this project for bugs and missing tests, and tell me what to fix first.' },
  { icon: 'languages', title: 'Translator', text: 'Translate what I give it into Chinese and Greek, keeping headings, links and code as they are.' },
];

const saved = (r: AssistantsState) => useAssistants.getState().set(r);

// ---- the window ------------------------------------------------------------------------------------------

export function AgentDialog({
  open,
  value,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** An agent to change (with id), a copy to make (no id: Duplicate), or none: a new agent, which starts at Describe. */
  value?: Partial<Assistant> | null;
  /** Made from a project's Agents tab (?project=): it works in that project. */
  project?: string;
  onClose: () => void;
  onSaved?: (a: Assistant) => void;
}) {
  const st = useAssistantsState();
  const all = st?.assistants ?? [];
  const spaces = useSpaces();
  const activity = useAgentActivity();
  const boot = useApp((s) => s.boot);
  const acp = boot?.acpAgents ?? [];
  const home = boot?.home ?? '';
  const root = useUI((s) => s.explorerRoot) ?? home;
  const wide = useMediaQuery('(min-width: 640px)');
  const [confirm, confirmNode] = useConfirm();
  const isNew = !value;
  const [step, setStep] = useState<1 | 2>(1);
  const [text, setText] = useState('');
  const [d, setD] = useState<Draft>({});
  const [drafted, setDrafted] = useState(false);
  const [schedule, setSchedule] = useState<TaskSchedule | undefined>();
  const [task, setTask] = useState('');
  const [section, setSection] = useState<SectionId | null>(null);
  const [budget, setBudget] = useState('');
  const [limit, setLimit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'save' | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [conns, setConns] = useState<ConnectionView[] | null>(null);
  const ideaBox = useRef<HTMLTextAreaElement>(null);
  const limitBox = useRef<HTMLInputElement>(null);

  // Everything starts again each time it opens.
  useLayoutEffect(() => {
    if (!open) return;
    setStep(value ? 2 : 1);
    setText('');
    setD(value ?? {});
    setDrafted(false);
    setSchedule(undefined);
    setTask('');
    setSection(null);
    setBudget(value?.budgetUsd ? String(value.budgetUsd) : '');
    setLimit(!!value?.budgetUsd);
    setDirty(false);
    setBusy(null);
  }, [open, value]);
  // Suggestions: the skills the agents have, and the connected apps.
  useEffect(() => {
    if (!open) return;
    api<{ skills: { name: string }[] }>(`/api/setup/skills?cwd=${enc(root)}`)
      .then((r) => setSkills([...new Set(r.skills.map((s) => s.name))].sort()))
      .catch(() => {});
    api<{ connections: ConnectionView[] }>('/api/connections')
      .then((r) => setConns(r.connections ?? []))
      .catch(() => setConns([]));
  }, [open]);

  const set = (p: Draft) => {
    setD((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  const isDirty = dirty || (isNew && (!!text.trim() || drafted));
  const requestClose = async () => {
    if (
      isDirty &&
      !(await confirm({ title: d.id ? 'Discard your changes?' : 'Discard this agent?', body: 'What you set here is not saved.', confirm: 'Discard', danger: true }))
    )
      return;
    onClose();
  };

  const draft = async () => {
    if (!text.trim() || busy) return;
    setBusy('draft');
    try {
      const r = await post<AgentDraft>('/api/assistants/draft', { text });
      setD(project ? { ...r.agent, projects: [project] } : r.agent);
      setSchedule(r.schedule);
      setTask(r.task ?? '');
      setBudget(r.agent.budgetUsd ? String(r.agent.budgetUsd) : '');
      setLimit(!!r.agent.budgetUsd);
      setDrafted(true);
      setSection(null);
      setStep(2);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const byHand = () => {
    setD({ icon: 'bot', folder: 'task', ...(project ? { projects: [project] } : {}) });
    setSchedule(undefined);
    setTask('');
    setBudget('');
    setLimit(false);
    setDrafted(false);
    setSection(null);
    setStep(2);
  };
  const pickSchedule = (s?: TaskSchedule) => {
    setSchedule(s);
    if (s && !task) setTask(`Do your work as ${d.name || 'the agent'}.`);
    setDirty(true);
  };

  const n = Number(budget);
  const budgetUsd = limit && budget.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
  const save = async () => {
    setBusy('save');
    try {
      const body = { ...d, tools: d.tools && d.tools.length < TOOL_KINDS.length ? d.tools : undefined, budgetUsd };
      let r: AssistantsState & { assistant: Assistant };
      if (d.id) {
        r = await put<AssistantsState & { assistant: Assistant }>(`/api/assistants/${enc(d.id)}`, body);
        saved(r);
        toast(`${d.name} is saved`, 'ok');
      } else {
        r = await post<AssistantsState & { assistant: Assistant }>('/api/assistants', { ...body, ...(drafted ? { drafted: true } : {}) });
        saved(r);
        const a = r.assistant;
        if (schedule) {
          const only = a.projects?.length === 1 ? spaces?.find((s) => s.id === a.projects![0]) : undefined;
          await post('/api/tasks', { ...scheduleDraft(a, schedule, task || `Do your work as ${a.name}.`, only?.folder ?? (boot?.defaultCwd || home)), enabled: true });
        }
        loadActivity();
        toast(`${a.name} is ready`, 'ok');
      }
      setDirty(false);
      onClose();
      onSaved?.(r.assistant);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const tools = d.tools ?? TOOL_KINDS.map((k) => k.id);
  const toggleTool = (k: ToolKind, on: boolean) => {
    const next = on ? TOOL_KINDS.map((x) => x.id).filter((x) => x === k || tools.includes(x)) : tools.filter((x) => x !== k);
    set({ tools: next.length === TOOL_KINDS.length ? undefined : next });
  };
  const connOn = (id: string) => d.connections?.includes(id) ?? false;
  const others = all.filter((x) => x.id !== d.id);
  const schedules = d.id ? (activity?.[d.id]?.schedules ?? []) : [];

  const close = (
    <IconButton label="Close" size="sm" onClick={requestClose}>
      <X size={16} />
    </IconButton>
  );

  // ---- Describe

  const describe = (
    <>
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <h2 className="flex-1 text-[16px] font-semibold tracking-tight">New agent</h2>
        <Steps step={1} />
        {close}
      </div>
      <div className="flex min-h-0 flex-1">
        <ScrollPane className="mx-auto w-full max-w-[640px] px-5 py-3 sm:px-8 sm:pt-6">
          <h2 className="text-[20px] font-semibold tracking-tight">What should your agent do?</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg-3">Say it in your own words, and when it should work by itself if it should. You can check and change everything before it is made.</p>
          <textarea
            ref={ideaBox}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft()}
            rows={5}
            autoFocus
            maxLength={4000}
            disabled={busy === 'draft'}
            aria-label="What should your agent do?"
            placeholder="Every Friday afternoon, write my weekly progress report from my commits and notes, and let me check it before it goes."
            className={cx(inputCls, 'mt-4 h-auto resize-none py-2.5 text-[14px] leading-relaxed')}
          />
          <div className="mt-5 mb-2 text-[12.5px] font-medium text-fg-3">Or start from an idea</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {IDEAS.map((idea) => (
              <button
                key={idea.title}
                type="button"
                disabled={busy === 'draft'}
                onClick={() => (setText(tr(idea.text)), ideaBox.current?.focus())}
                className={cx(
                  'rounded-xl border p-3 text-left transition-colors',
                  text === tr(idea.text) || text === idea.text ? 'border-accent/60 bg-accent-soft' : 'border-line bg-panel hover:border-line-2 hover:bg-bg-1',
                )}
              >
                <span className="flex items-center gap-2">
                  <AssistantIcon icon={idea.icon} size={13} />
                  <span className="text-[13px] font-medium text-fg">{idea.title}</span>
                </span>
                <span className="mt-1.5 block text-[12.5px] leading-snug text-fg-3">{idea.text}</span>
              </button>
            ))}
          </div>
        </ScrollPane>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 pb-[max(12px,var(--safe-bottom))] sm:px-5">
        <Button variant="ghost" onClick={byHand} disabled={busy === 'draft'}>
          Set it up myself
        </Button>
        <span className="flex-1" />
        <Button variant="primary" icon={busy === 'draft' ? <Throbber size={13} /> : <Sparkles size={14} />} disabled={!text.trim() || !!busy} onClick={draft}>
          {busy === 'draft' ? 'Drafting…' : 'Draft my agent'}
        </Button>
      </div>
    </>
  );

  // ---- Set up

  const when = d.id ? schedulesText(schedules) : schedule ? whenText(schedule) : 'when asked';
  const first = (d.instructions ?? '').trim().split('\n')[0].slice(0, 80);
  const skillCount = d.skills?.length ?? 0;
  const summary = (id: SectionId): ReactNode => {
    switch (id) {
      case 'about':
        return d.description?.trim() ? <span translate="no">{d.description.trim()}</span> : first ? <span translate="no">{first}</span> : <span>Not written yet</span>;
      case 'when':
        return (
          <>
            <span>{whereText(d, spaces)}</span>
            <span> · </span>
            <span>{when}</span>
          </>
        );
      case 'model':
        return (
          <>
            <span>{tierLabel(d.tier)}</span>
            {d.agent && (
              <>
                <span> · </span>
                <span>{programName(d, acp)}</span>
              </>
            )}
          </>
        );
      case 'tools':
        return (
          <>
            <Listed items={toolPhrases(d).map((w) => ({ key: w, node: <span>{w}</span> }))} />
            {skillCount > 0 && (
              <>
                <span> · </span>
                <span>{skillCount === 1 ? '1 skill' : `${skillCount} skills`}</span>
              </>
            )}
          </>
        );
      case 'team': {
        const asked = (d.canAsk ?? []).map((id) => all.find((x) => x.id === id)).filter((x): x is Assistant => !!x);
        if (!asked.length) return <span>Works alone</span>;
        return (
          <>
            <span>Asks </span>
            {asked.length > 3 ? <span>{`${asked.length} other agents`}</span> : <Listed items={asked.map((x) => ({ key: x.id, node: <span translate={assistantTranslate(x)}>{x.name}</span> }))} />}
          </>
        );
      }
      case 'results':
        return <span>{outputText(d.output)}</span>;
      case 'budget':
        return budgetUsd ? (
          <>
            <span>{money(budgetUsd)}</span>
            <span> a month</span>
          </>
        ) : (
          <span>No limit</span>
        );
    }
  };
  const summaryLine = (id: SectionId) => <span className="block truncate text-[12px] text-fg-3 first-letter:uppercase">{summary(id)}</span>;

  const cur = wide ? (section ?? 'about') : section;
  const curSection = SECTIONS.find((s) => s.id === cur);
  const labelCls = 'mb-1.5 block text-[13px] text-fg-2';

  const pane = (id: SectionId): ReactNode => {
    switch (id) {
      case 'about':
        return (
          <div className="space-y-6">
            <div>
              <label htmlFor="agent-line" className={labelCls}>
                One line about it
              </label>
              <input id="agent-line" value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} maxLength={160} placeholder="Keeps the household accounts in order" className={inputCls} />
              <div className="mt-1 text-[12px] text-fg-3">Shown on its card and in the start page's menu.</div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-1 text-[13px] text-fg-2">
                <label htmlFor="agent-instructions">Instructions</label>
                <Info>Who it is and how it works: it reads this at the start of every session with it. Write it as the built-in agents do: “You are the user’s bookkeeper for this session”, then a few lines on how it works.</Info>
              </div>
              <textarea
                id="agent-instructions"
                value={d.instructions ?? ''}
                onChange={(e) => set({ instructions: e.target.value })}
                rows={wide ? 12 : 9}
                maxLength={20000}
                placeholder={'You are the user’s bookkeeper for this session.\n- Ask for the statements you need.\n- Keep totals in a spreadsheet in the working folder.'}
                className={cx(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
              />
            </div>
          </div>
        );
      case 'when': {
        const some = !!d.projects?.length;
        const noProjects = !spaces?.length;
        return (
          <div className="space-y-6">
            <Group title="Where it works" bare>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChoiceCard on={!some} icon={<Globe size={16} />} label="Everywhere" hint="In every project and outside them" onClick={() => set({ projects: undefined })} />
                <ChoiceCard
                  on={some}
                  icon={<FolderOpen size={16} />}
                  label="Only in some projects"
                  hint={noProjects ? 'You have no projects yet' : "Offered only there, working in the project's folder"}
                  disabled={noProjects}
                  onClick={() => set({ projects: d.projects?.length ? d.projects : spaces?.[0] ? [spaces[0].id] : undefined })}
                />
              </div>
              {some && (
                <div className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {(spaces ?? []).map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2">
                      <SpaceMark s={s} size={15} />
                      <span translate="no" className="min-w-0 flex-1 truncate text-[13px]">
                        {s.name}
                      </span>
                      <Switch
                        on={!!d.projects?.includes(s.id)}
                        label={s.name}
                        onChange={(on) => {
                          const next = on ? [...(d.projects ?? []), s.id] : (d.projects ?? []).filter((x) => x !== s.id);
                          set({ projects: next.length ? next : undefined });
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </Group>
            <Group title="When it works" bare>
              {d.id ? (
                <>
                  {schedules.length ? (
                    <div className="divide-y divide-line rounded-xl border border-line">
                      {schedules.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                          <CalendarClock size={15} className="shrink-0 text-fg-3" />
                          <span translate="no" className="min-w-0 flex-1 truncate text-[13px]">
                            {s.name}
                          </span>
                          <span className="shrink-0 text-[12px] text-fg-3">
                            {whenText(s.schedule)}
                            {s.enabled ? '' : ' · paused'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[13px] text-fg-3">It works when you or another agent asks.</div>
                  )}
                  <div className="mt-2 text-[12px] text-fg-3">Add and change its schedules on its page, under Schedules.</div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-line p-2">
                    <ScheduleChoice value={schedule} onChange={pickSchedule} />
                  </div>
                  {schedule && (
                    <div className="mt-3">
                      <label htmlFor="agent-task" className={labelCls}>
                        Each run starts with
                      </label>
                      <input
                        id="agent-task"
                        value={task}
                        onChange={(e) => (setTask(e.target.value), setDirty(true))}
                        maxLength={2000}
                        placeholder={`Do your work as ${d.name || 'the agent'}.`}
                        className={inputCls}
                      />
                    </div>
                  )}
                </>
              )}
            </Group>
            <Group>
              <Row
                label="Keeps one conversation, with an inbox"
                info="Messages from you and other agents go into one conversation of its own, one at a time, and it remembers what came before; each answer goes back to whoever sent it. Its scheduled runs post there too."
                control={<Switch on={!!d.standing} onChange={(on) => set({ standing: on || undefined })} label="Keeps one conversation, with an inbox" />}
              />
              <Row
                label="Where its sessions start"
                hint="When no folder is picked on the start page"
                control={
                  <Picker value={d.folder === 'project' ? 'The folder on the start page' : 'A new task folder'} title="Where its sessions start" width={290}>
                    {(done) => [
                      <OptionRow key="task" label="A new task folder" hint="A fresh folder for each session" selected={(d.folder ?? 'task') === 'task'} onClick={() => (set({ folder: 'task' }), done())} />,
                      <OptionRow key="project" label="The folder on the start page" hint="As Coder does, for agents that work in a project" selected={d.folder === 'project'} onClick={() => (set({ folder: 'project' }), done())} />,
                    ]}
                  </Picker>
                }
              />
            </Group>
          </div>
        );
      }
      case 'model':
        return (
          <div className="space-y-6">
            <Group
              title="Thinks with"
              info="A tier picks its model for the program it runs on (Settings → Models → Tiers). Automatic keeps the model picked where it starts: the start page, a task, the agent that asks it."
              bare
            >
              <RadioList<Tier | 'auto'>
                value={d.tier ?? 'auto'}
                onChange={(v) => set({ tier: v === 'auto' ? undefined : v })}
                options={TIER_HINTS.map((t) => ({ id: t.id ?? 'auto', label: t.label, hint: t.hint }))}
              />
            </Group>
            <Group>
              <Row
                label="Runs on"
                hint="The program it suggests on the start page"
                control={
                  <>
                    <AgentChoice d={d} set={set} />
                    {d.agent && <ModelPicker agent={d.agent} acp={d.acpAgent} value={d.model ?? null} onChange={(v) => set({ model: v ?? undefined })} />}
                  </>
                }
              />
              <Row label="Permission mode" hint="When it asks you first" control={<ModeChoice d={d} set={set} />} />
              <Row
                label="Subagents it starts"
                hint="Never above this tier"
                control={
                  <Picker value={d.helperMax ? tierLabel(d.helperMax) : 'Any'} title="Subagents it starts, never above" width={240}>
                    {(done) => [
                      <OptionRow key="any" label="Any" hint="No limit" selected={!d.helperMax} onClick={() => (set({ helperMax: undefined }), done())} />,
                      ...TIERS.map((t) => <OptionRow key={t.id} label={t.label} selected={d.helperMax === t.id} onClick={() => (set({ helperMax: t.id }), done())} />),
                    ]}
                  </Picker>
                }
              />
              <Row
                label="Step up when a check fails"
                info="A subagent whose reply does not pass a quick check runs again one tier up; a scheduled run that fails, too."
                control={<Switch on={d.stepUp !== false} onChange={(on) => set({ stepUp: on ? undefined : false })} label="Step up when a check fails" />}
              />
            </Group>
          </div>
        );
      case 'tools':
        return (
          <div className="space-y-6">
            <Group
              title="What it may use"
              info="Claude Code and Custom have the ones you turn off switched off; Codex is told not to use them. The app’s own tools (pages, memory) stay on."
              actions={
                d.tools && d.tools.length < TOOL_KINDS.length ? (
                  <button type="button" onClick={() => set({ tools: undefined })} className="text-[12.5px] text-accent hover:underline">
                    Turn all on
                  </button>
                ) : undefined
              }
            >
              {TOOL_KINDS.map((k) => {
                const I = TOOL_ICONS[k.id];
                return <Row key={k.id} className="py-2.5!" icon={<I size={16} />} label={k.label} hint={k.hint} control={<Switch on={tools.includes(k.id)} onChange={(on) => toggleTool(k.id, on)} label={k.label} />} />;
              })}
            </Group>
            <Group title="Skills to favor" hint="When one fits the task, it loads it before starting." bare>
              <NameList value={d.skills ?? []} onChange={(v) => set({ skills: v })} suggestions={skills} placeholder="Add a skill" />
            </Group>
            {!!(conns?.length || d.connections?.length) && (
              <Group title="Connected apps" hint="Accounts from Apps → Connected apps to turn on in its sessions.">
                {(conns ?? []).map((c) => (
                  <Row
                    key={c.id}
                    label={<span translate="no">{c.name}</span>}
                    control={
                      c.enabled ? (
                        <span className="text-[12px] text-fg-3">On for every session</span>
                      ) : (
                        <Switch on={connOn(c.id)} onChange={(on) => set({ connections: on ? [...(d.connections ?? []), c.id] : (d.connections ?? []).filter((x) => x !== c.id) })} label={`${c.name} on in its sessions`} />
                      )
                    }
                  />
                ))}
                {(d.connections ?? [])
                  .filter((id) => !conns?.some((c) => c.id === id))
                  .map((id) => (
                    <Row
                      key={id}
                      label={<span translate="no">{id}</span>}
                      hint="Not connected"
                      control={
                        <IconButton label={`Remove ${id}`} size="sm" onClick={() => set({ connections: d.connections!.filter((x) => x !== id) })}>
                          <Trash2 size={13} />
                        </IconButton>
                      }
                    />
                  ))}
              </Group>
            )}
          </div>
        );
      case 'team':
        return (
          <div className="space-y-6">
            <Group>
              <Row label="Other agents may hand it work" control={<Switch on={d.askable !== false} onChange={(on) => set({ askable: on ? undefined : false })} label="Other agents may hand it work" />} />
            </Group>
            <Group title="It may hand work to" hint="Each works with its own settings. Built-in agents may ask any agent." bare={!others.length}>
              {others.length ? (
                others.map((x) => (
                  <Row
                    key={x.id}
                    icon={<AssistantIcon icon={x.icon} size={15} plain />}
                    label={<span translate={assistantTranslate(x)}>{x.name}</span>}
                    hint={x.description ? <span translate={assistantTranslate(x)}>{x.description}</span> : undefined}
                    control={
                      <Switch
                        on={!!d.canAsk?.includes(x.id)}
                        label={x.name}
                        onChange={(on) => {
                          const next = on ? [...(d.canAsk ?? []), x.id] : (d.canAsk ?? []).filter((y) => y !== x.id);
                          set({ canAsk: next.length ? next : undefined });
                        }}
                      />
                    }
                  />
                ))
              ) : (
                <Notice>No other agents yet.</Notice>
              )}
            </Group>
          </div>
        );
      case 'results':
        return <OutputEditor value={d.output} onChange={(output) => set({ output })} agent={{ id: d.id, name: d.name ?? '' }} />;
      case 'budget': {
        const spent = d.id ? activity?.[d.id]?.monthUsd : undefined;
        return (
          <div>
            <RadioList<'none' | 'limit'>
              value={limit ? 'limit' : 'none'}
              onChange={(v) => {
                setDirty(true);
                setLimit(v === 'limit');
                if (v === 'limit') setTimeout(() => limitBox.current?.focus(), 0);
              }}
              options={[
                { id: 'none', label: 'No limit', hint: 'Its sessions spend what they need' },
                {
                  id: 'limit',
                  label: 'A monthly limit',
                  hint: 'No new session starts as it once this is spent',
                  extra: (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-fg-3">$</span>
                      <input ref={limitBox} inputMode="decimal" value={budget} onChange={(e) => (setBudget(e.target.value), setDirty(true))} placeholder="20" aria-label="Dollars a month" className={cx(inputCls, 'w-28')} />
                      <span className="text-fg-3">a month</span>
                    </div>
                  ),
                },
              ]}
            />
            <div className="mt-3 text-[12px] leading-snug text-fg-3">Each session is capped at what is left; a new month starts afresh.</div>
            {spent != null && (
              <div className="mt-1 text-[12.5px] text-fg-2">
                Spent this month: <span>{money(spent)}</span>
              </div>
            )}
          </div>
        );
      }
    }
  };

  const setup = (
    <>
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 pt-3.5 pb-3 sm:px-5">
        <IconChoice value={d.icon ?? 'bot'} onChange={(icon) => set({ icon })} />
        <input
          value={d.name ?? ''}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={60}
          autoFocus={!d.name}
          aria-label="Name"
          placeholder="Name your agent"
          className="h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-[17px] font-semibold tracking-tight outline-none placeholder:text-fg-3 hover:bg-bg-2 focus:bg-bg-2"
        />
        {isNew && <Steps step={2} />}
        {close}
      </div>
      <div className="flex min-h-0 flex-1">
        {wide ? (
          <>
            <nav aria-label="Settings" className="w-[224px] shrink-0 space-y-0.5 overflow-y-auto border-r border-line p-2">
              {SECTIONS.map((s) => {
                const on = s.id === cur;
                const I = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    onClick={() => setSection(s.id)}
                    className={cx('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', on ? 'bg-bg-2' : 'hover:bg-bg-1')}
                  >
                    <I size={16} className={cx('mt-0.5 shrink-0', on ? 'text-fg' : 'text-fg-3')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-fg">{s.label}</span>
                      {summaryLine(s.id)}
                    </span>
                  </button>
                );
              })}
            </nav>
            <ScrollPane key={cur} className="px-5 py-5 sm:px-6">
              {curSection && (
                <>
                  <h3 className="text-[15px] font-semibold">{curSection.label}</h3>
                  <p className="mt-0.5 mb-5 text-[12.5px] text-fg-3">{curSection.lead}</p>
                  {pane(curSection.id)}
                </>
              )}
            </ScrollPane>
          </>
        ) : curSection ? (
          <ScrollPane key={cur} className="px-5 py-5">
            <button type="button" onClick={() => setSection(null)} className="mb-3 -ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-[13px] text-fg-2 hover:text-fg">
              <ChevronLeft size={15} />
              All settings
            </button>
            <h3 className="text-[15px] font-semibold">{curSection.label}</h3>
            <p className="mt-0.5 mb-5 text-[12.5px] text-fg-3">{curSection.lead}</p>
            {pane(curSection.id)}
          </ScrollPane>
        ) : (
          <ScrollPane className="p-4">
            <div className="divide-y divide-line rounded-xl border border-line bg-panel">
              {SECTIONS.map((s) => {
                const I = s.icon;
                return (
                  <button key={s.id} type="button" onClick={() => setSection(s.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-2">
                      <I size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-fg">{s.label}</span>
                      {summaryLine(s.id)}
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-fg-3" />
                  </button>
                );
              })}
            </div>
          </ScrollPane>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 pb-[max(12px,var(--safe-bottom))] sm:px-5">
        {isNew && (
          <Button variant="ghost" icon={<ChevronLeft size={14} />} onClick={() => setStep(1)} disabled={busy === 'save'}>
            Back
          </Button>
        )}
        <span className="hidden min-w-0 truncate text-[12.5px] text-fg-3 sm:block">
          {!d.name?.trim() ? (d.id ? 'Give it a name to save it.' : 'Give it a name to create it.') : drafted ? 'Drafted from what you wrote: check it, then create it.' : null}
        </span>
        <span className="flex-1" />
        {!isNew && (
          <Button variant="ghost" onClick={requestClose}>
            Cancel
          </Button>
        )}
        <Button variant="primary" onClick={save} disabled={!d.name?.trim() || !!busy}>
          {d.id ? (busy === 'save' ? 'Saving…' : 'Save') : busy === 'save' ? 'Creating…' : 'Create agent'}
        </Button>
      </div>
    </>
  );

  return (
    <>
      <Dialog open={open} bare label={value?.id ? (value.name ?? 'Agent') : 'New agent'} width={800} part="agents" onClose={requestClose}>
        <div data-i18n="agents" className="flex h-[92dvh] min-h-0 flex-col sm:h-[min(720px,90dvh)]">
          {step === 1 && isNew ? describe : setup}
        </div>
      </Dialog>
      {confirmNode}
    </>
  );
}
