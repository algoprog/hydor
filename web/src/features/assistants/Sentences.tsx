// An agent in a few sentences: what it does, where and when it works, what it thinks with, what it may use,
// whom it asks for help and what it may spend. Each underlined part opens what changes it, in place: an agent
// being drafted (New agent) changes on the page until it is made; one of yours is saved as you change it.
import { useRef, useState, type ReactNode } from 'react';
import { CalendarClock, Pencil, Plus } from 'lucide-react';
import { TOOL_KINDS, type AgentSchedule, type Assistant, type ToolKind } from '@shared/assistants';
import type { TaskSchedule } from '@shared/automations';
import type { SpaceView } from '@shared/spaces';
import { TIERS, type Tier } from '@shared/tiers';
import { cx, inputCls, OptionRow, Popover, Segmented, Switch } from '../../components/ui';
import { AssistantIcon } from './icons';
import { asksText, schedulesText, tierText, toolsText, whenText, whereText } from './agentsState';
import { OutputEditor, outputText } from './OutputEditor';

type Patch = Partial<Assistant>;

/** One part of a sentence that changes: underlined when it can, and a popover by it with what changes it. */
function Phrase({ text, editable, title, children, width = 300 }: { text: string; editable: boolean; title: string; children?: (close: () => void) => ReactNode; width?: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!editable || !children) return <span className="font-medium text-fg">{text}</span>;
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={cx('rounded-[5px] px-0.5 font-medium text-fg decoration-accent decoration-dotted decoration-2 underline-offset-[5px] hover:bg-accent-soft', open ? 'bg-accent-soft' : 'underline')}
      >
        {text}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={width} title={title}>
        <div data-i18n="agents" className="p-1">
          {children(() => setOpen(false))}
        </div>
      </Popover>
    </>
  );
}

const Head = ({ children }: { children: ReactNode }) => <div className="px-2 pt-1.5 pb-1 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">{children}</div>;

/** When a drafted agent runs by itself: not at all, at a time of day on some days, or every so often. */
export function ScheduleChoice({ value, onChange }: { value?: TaskSchedule; onChange: (s?: TaskSchedule) => void }) {
  const kind = value?.kind === 'daily' ? 'daily' : value?.kind === 'every' ? 'every' : 'none';
  const days = value?.kind === 'daily' ? (value.days ?? [0, 1, 2, 3, 4, 5, 6]) : [1, 2, 3, 4, 5];
  const time = value?.kind === 'daily' ? value.time : '09:00';
  const minutes = value?.kind === 'every' ? value.minutes : 60;
  const daily = (p: { days?: number[]; time?: string }) => {
    const d = [...new Set(p.days ?? days)].sort();
    onChange({ kind: 'daily', time: p.time ?? time, days: d.length && d.length < 7 ? d : undefined });
  };
  return (
    <div className="space-y-2.5 px-2 py-1.5 text-[13px]">
      <Segmented
        size="sm"
        value={kind}
        onChange={(k) => onChange(k === 'none' ? undefined : k === 'daily' ? { kind: 'daily', time, days: days.length < 7 ? days : undefined } : { kind: 'every', minutes })}
        options={[
          { value: 'none', label: 'When asked' },
          { value: 'daily', label: 'At a time' },
          { value: 'every', label: 'Every…' },
        ]}
      />
      {kind === 'daily' && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
              <button
                key={i}
                type="button"
                aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}
                aria-pressed={days.includes(i)}
                onClick={() => daily({ days: days.includes(i) ? days.filter((x) => x !== i) : [...days, i] })}
                className={cx('h-7 w-7 rounded-full text-[12px] font-medium transition-colors', days.includes(i) ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg-3 hover:text-fg')}
              >
                {l}
              </button>
            ))}
          </div>
          <input type="time" value={time} onChange={(e) => e.target.value && daily({ time: e.target.value })} className={cx(inputCls, 'w-32')} aria-label="At" />
        </div>
      )}
      {kind === 'every' && (
        <select value={minutes} onChange={(e) => onChange({ kind: 'every', minutes: Number(e.target.value) })} className={cx(inputCls, 'w-44')} aria-label="How often">
          {[15, 30, 60, 120, 240, 360, 720].map((m) => (
            <option key={m} value={m}>
              {whenText({ kind: 'every', minutes: m })}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** What thinks with which tier: Automatic or a tier, and the highest one its helpers may have. */
function TierChoice({ a, set, close }: { a: Patch; set: (p: Patch) => void; close: () => void }) {
  return (
    <div>
      <OptionRow label="Automatic" hint="The model picked where it starts: the start page, a task, the agent that asks it" selected={!a.tier} onClick={() => (set({ tier: undefined }), close())} />
      {TIERS.map((t) => (
        <OptionRow key={t.id} label={t.label} hint={t.hint} selected={a.tier === t.id} onClick={() => (set({ tier: t.id }), close())} />
      ))}
      <div className="mt-1 border-t border-line px-2 pt-2 pb-1.5">
        <div className="mb-1.5 text-[12.5px] text-fg-2">Helpers it starts, never above</div>
        <Segmented<Tier | 'any'>
          size="sm"
          value={a.helperMax ?? 'any'}
          onChange={(v) => set({ helperMax: v === 'any' ? undefined : v })}
          options={[{ value: 'any', label: 'Any' }, ...TIERS.map((t) => ({ value: t.id, label: t.label }))]}
        />
        <label className="mt-2.5 flex cursor-pointer items-center gap-3">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">Step up when a check fails</span>
          <Switch on={a.stepUp !== false} onChange={(on) => set({ stepUp: on ? undefined : false })} label="Step up when a check fails" />
        </label>
      </div>
    </div>
  );
}

export interface SentencesProps {
  a: Patch;
  /** Its parts can be changed (yours, or a draft); a built-in one only reads. */
  editable: boolean;
  onChange: (p: Patch) => void;
  /** Every agent, for whom it asks. */
  all: Assistant[];
  spaces: SpaceView[] | null;
  /** A draft's schedule (changed here), or a saved agent's schedules (changed in their own editor). */
  when: { draft: true; schedule?: TaskSchedule; onSchedule: (s?: TaskSchedule) => void } | { draft: false; schedules: AgentSchedule[]; onAdd: () => void; onEdit: (id: string) => void };
}

/** The agent as sentences, each part underlined where it can change. */
export function AgentSentences({ a, editable, onChange, all, spaces, when }: SentencesProps) {
  const tools = a.tools ?? TOOL_KINDS.map((k) => k.id);
  const toggleTool = (k: ToolKind, on: boolean) => {
    const next = on ? TOOL_KINDS.map((x) => x.id).filter((x) => x === k || tools.includes(x)) : tools.filter((x) => x !== k);
    onChange({ tools: next.length === TOOL_KINDS.length ? undefined : next });
  };
  const others = all.filter((x) => x.id !== a.id);
  const whenWords = when.draft ? (when.schedule ? whenText(when.schedule) : 'when asked') : schedulesText(when.schedules);
  const desc = (a.description || '').trim().replace(/[.。]$/, '');
  return (
    <p className="text-[15px] leading-[2.05] text-fg-2">
      {desc ? <span translate="no">{desc}. </span> : null}
      It works{' '}
      <Phrase text={whereText(a, spaces)} editable={editable} title="Where it works">
        {() => (
          <div>
            <OptionRow label="Everywhere" hint="Offered in every project and outside them" selected={!a.projects?.length} onClick={() => onChange({ projects: undefined })} />
            {!!spaces?.length && <Head>Only in these projects</Head>}
            {(spaces ?? []).map((s) => {
              const on = !!a.projects?.includes(s.id);
              return (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-bg-2">
                  <span translate="no" className="min-w-0 flex-1 truncate text-[13px]">
                    {s.name}
                  </span>
                  <Switch
                    on={on}
                    label={s.name}
                    onChange={(v) => {
                      const next = v ? [...(a.projects ?? []), s.id] : (a.projects ?? []).filter((x) => x !== s.id);
                      onChange({ projects: next.length ? next : undefined });
                    }}
                  />
                </label>
              );
            })}
          </div>
        )}
      </Phrase>
      ,{' '}
      <Phrase text={whenWords} editable={editable} title="When it works" width={320}>
        {(close) => (
          <div>
            {when.draft ? (
              <ScheduleChoice value={when.schedule} onChange={when.onSchedule} />
            ) : (
              <div>
                <OptionRow label="When you or another agent asks" hint="Always" selected={false} onClick={close} />
                {when.schedules.length > 0 && <Head>Its schedules</Head>}
                {when.schedules.map((s) => (
                  <button key={s.id} type="button" onClick={() => (close(), when.onEdit(s.id))} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-bg-2">
                    <CalendarClock size={14} className="shrink-0 text-fg-3" />
                    <span className="min-w-0 flex-1">
                      <span translate="no" className="block truncate text-[13px]">
                        {s.name}
                      </span>
                      <span className="block truncate text-[12px] text-fg-3">
                        {whenText(s.schedule)}
                        {s.enabled ? '' : ' · paused'}
                      </span>
                    </span>
                    <Pencil size={13} className="shrink-0 text-fg-3" />
                  </button>
                ))}
                <button type="button" onClick={() => (close(), when.onAdd())} className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-accent hover:bg-bg-2">
                  <Plus size={14} />
                  Add a schedule
                </button>
              </div>
            )}
            <label className="mt-1 flex cursor-pointer items-center gap-3 border-t border-line px-2 pt-2 pb-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px]">Keeps one conversation, with an inbox</span>
                <span className="block text-[12px] leading-snug text-fg-3">Messages from you and other agents go in one at a time, and its scheduled runs post there too</span>
              </span>
              <Switch on={!!a.standing} onChange={(on) => onChange({ standing: on || undefined })} label="Keeps one conversation, with an inbox" />
            </label>
          </div>
        )}
      </Phrase>
      , and thinks with{' '}
      <Phrase text={tierText(a.tier)} editable={editable} title="What it thinks with" width={330}>
        {(close) => <TierChoice a={a} set={onChange} close={close} />}
      </Phrase>
      {a.helperMax ? <span> (its helpers {tierText(a.helperMax)} at most)</span> : null}. It may{' '}
      <Phrase text={toolsText(a)} editable={editable} title="What it may use" width={320}>
        {() => (
          <div>
            {TOOL_KINDS.map((k) => (
              <label key={k.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-bg-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-fg">{k.label}</span>
                  <span className="block truncate text-[12px] text-fg-3">{k.hint}</span>
                </span>
                <Switch on={tools.includes(k.id)} onChange={(on) => toggleTool(k.id, on)} label={k.label} />
              </label>
            ))}
          </div>
        )}
      </Phrase>
      , and asks{' '}
      <Phrase text={asksText(a, all)} editable={editable} title="Whom it asks for help" width={320}>
        {() => (
          <div>
            <Head>Agents it may hand work to</Head>
            {others.length === 0 && <div className="px-2 py-1.5 text-[12.5px] text-fg-3">No other agents yet.</div>}
            {others.map((x) => {
              const on = !!a.canAsk?.includes(x.id);
              return (
                <label key={x.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-bg-2">
                  <AssistantIcon icon={x.icon} size={13} />
                  <span translate="no" className="min-w-0 flex-1 truncate text-[13px]">
                    {x.name}
                  </span>
                  <Switch
                    on={on}
                    label={x.name}
                    onChange={(v) => {
                      const next = v ? [...(a.canAsk ?? []), x.id] : (a.canAsk ?? []).filter((y) => y !== x.id);
                      onChange({ canAsk: next.length ? next : undefined });
                    }}
                  />
                </label>
              );
            })}
            <label className="mt-1 flex cursor-pointer items-center gap-3 border-t border-line px-2 pt-2 pb-1.5">
              <span className="min-w-0 flex-1 text-[13px]">Other agents may hand it work</span>
              <Switch on={a.askable !== false} onChange={(v) => onChange({ askable: v ? undefined : false })} label="Other agents may hand it work" />
            </label>
          </div>
        )}
      </Phrase>{' '}
      for help. It hands back{' '}
      <Phrase text={outputText(a.output)} editable={editable} title="What it hands back" width={400}>
        {() => <OutputEditor value={a.output} onChange={(output) => onChange({ output })} />}
      </Phrase>
      . {a.budgetUsd ? 'It spends at most ' : 'It has '}
      <Phrase text={a.budgetUsd ? `$${a.budgetUsd}` : 'no monthly budget'} editable={editable} title="Its monthly budget" width={280}>
        {() => <BudgetChoice value={a.budgetUsd} onChange={(budgetUsd) => onChange({ budgetUsd })} />}
      </Phrase>
      {a.budgetUsd ? ' a month.' : '.'}
    </p>
  );
}

/** A monthly budget in dollars, or none. */
function BudgetChoice({ value, onChange }: { value?: number; onChange: (v?: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  const apply = (t: string) => {
    const n = Number(t);
    onChange(t.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined);
  };
  return (
    <div className="space-y-2 px-2 py-1.5 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="text-fg-3">$</span>
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => apply(text)}
          onKeyDown={(e) => e.key === 'Enter' && apply(text)}
          placeholder="No limit"
          className={cx(inputCls, 'w-28')}
          aria-label="Dollars a month"
        />
        <span className="text-fg-3">a month</span>
      </div>
      <div className="text-[12px] leading-snug text-fg-3">Once its sessions have spent this much in a month, none starts as it until the next. Each session is capped at what is left.</div>
    </div>
  );
}
