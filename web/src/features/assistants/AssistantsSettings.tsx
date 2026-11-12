// Settings → Your agents: where task folders go and cleaning up after a task (your agents themselves are on the
// Agents page). Also the agent editor that page's All settings opens (every setting of an agent), and importing
// Claude Code agent files. How the agents talk to you is part of Agent Guidelines now (features/guidelines).
import { useEffect, useRef, useState } from 'react';
import { Bot, FileUp, Trash2 } from 'lucide-react';
import { ASSISTANT_ICONS, ASSISTANT_MODES, TOOL_KINDS, type Assistant, type AssistantsState, type ToolKind } from '@shared/assistants';
import { TIERS, type Tier } from '@shared/tiers';
import type { ConnectionView } from '@shared/connections';
import type { Agent } from '@shared/types';
import { api, del, enc, post, put } from '../../lib/api';
import { tildify } from '../../lib/format';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { ModelPicker } from '../../components/AgentPickers';
import { AgentIcon } from '../../components/AgentIcon';
import { FolderChip } from '../../components/FolderPicker';
import { go } from '../../lib/nav';
import { Badge, Button, cx, Dialog, IconButton, inputCls, OptionRow, Picker, Popover, Segmented, Switch, Throbber } from '../../components/ui';
import { useSpaces } from '../spaces/state';
import { AssistantIcon, ICONS } from './icons';
import { OutputEditor } from './OutputEditor';
import { Group, Row, Stack } from '../settings/kit';
import { useAssistants, useAssistantsState } from './state';

type Draft = Partial<Assistant>;
const saved = (r: AssistantsState) => useAssistants.getState().set(r);

export function AssistantsSettings() {
  const st = useAssistantsState();
  const home = useApp((s) => s.boot?.home) ?? '';
  const wait = <Throbber className="text-fg-3" />;
  const mine = st ? st.assistants.filter((a) => !a.builtin).length : 0;
  const setCleanUp = (cleanUp: boolean) =>
    put<AssistantsState>('/api/assistants/settings', { cleanUp })
      .then((r) => (saved(r), toast(cleanUp ? 'Agents clean up after a task from their next session' : 'Agents leave what they made in place from their next session', 'ok')), toastError);
  const setRoot = (taskRoot: string) => put<AssistantsState>('/api/assistants/settings', { taskRoot }).then(saved, toastError);
  return (
    <Stack>
      <Group>
        <Row
          icon={<Bot size={16} />}
          label="Your agents"
          hint={!st ? undefined : mine ? `${mine} of your own, beside the built-in ones` : 'Only the built-in agents so far'}
          info="Make and change them on the Agents page: what each does, where and when it works, what it thinks with, and whom it asks."
          control={!st ? wait : undefined}
          onClick={() => go('/agents')}
        />
      </Group>
      <Group title="Tasks">
        <Row
          label="Clean up after a task"
          hint="Agents remove what they made along the way"
          info="The agent removes what it made along the way and no longer needs: scratch and test files, temporary data, extra branches and worktrees, processes it started. It keeps the work you asked for, never touches what it did not make, asks first about anything large or unclear, and says what it removed."
          control={st ? <Switch on={st.cleanUp} onChange={setCleanUp} label="Clean up after a task" /> : wait}
        />
        <Row
          label="Task folders"
          hint={st ? <>
              New ones look like <span translate="no" className="font-mono text-[12px] break-all text-fg-2">{tildify(st.taskRoot, home)}/2026-10-31-plan-trip-lisbon</span>
            </> : undefined}
          info="A session started without a folder gets a new one here, named by the day and the task. Coder works in the folder you pick instead."
          control={
            st ? (
              <>
                {st.taskRoot !== st.defaultTaskRoot && (
                  <Button size="sm" variant="ghost" onClick={() => setRoot('')}>
                    Back to <span translate="no">{tildify(st.defaultTaskRoot, home)}</span>
                  </Button>
                )}
                <FolderChip value={st.taskRoot} onChange={setRoot} />
              </>
            ) : (
              wait
            )
          }
        />
      </Group>
    </Stack>
  );
}

// ---- making and changing one -------------------------------------------------------------------------------

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

/** The agent it suggests: any (the start page's), Claude Code, Codex, or one of Settings → More agents. */
function AgentChoice({ d, set }: { d: Draft; set: (p: Draft) => void }) {
  const acp = useApp((s) => s.boot?.acpAgents) ?? [];
  const label = !d.agent ? 'Any agent' : d.agent === 'acp' ? (acp.find((a) => a.id === d.acpAgent)?.name ?? d.acpAgent) : d.agent === 'claude' ? 'Claude Code' : 'Codex';
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

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-1 text-[13px] text-fg-2">{label}</div>
    {children}
    {hint && <div className="mt-1 text-[12px] leading-snug text-fg-3">{hint}</div>}
  </div>
);

/** Every setting of an agent (the Agents page's All settings, New agent → Start empty, Duplicate); `onSaved` hears of the agent as saved. */
export function EditAssistant({ value, onClose, onSaved }: { value: Draft | null; onClose: () => void; onSaved?: (a: Assistant) => void }) {
  const spaces = useSpaces();
  const others = (useAssistantsState()?.assistants ?? []).filter((x) => x.id !== value?.id);
  const [budget, setBudget] = useState('');
  const home = useApp((s) => s.boot?.home) ?? '';
  const root = useUI((s) => s.explorerRoot) ?? home;
  const [d, setD] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [conns, setConns] = useState<ConnectionView[] | null>(null);
  const set = (p: Draft) => setD((x) => ({ ...x, ...p }));
  useEffect(() => {
    if (!value) return;
    setD(value);
    setBudget(value.budgetUsd ? String(value.budgetUsd) : '');
    // Suggestions: the skills the agents have, and the connected apps.
    api<{ skills: { name: string }[] }>(`/api/setup/skills?cwd=${enc(root)}`)
      .then((r) => setSkills([...new Set(r.skills.map((s) => s.name))].sort()))
      .catch(() => {});
    api<{ connections: ConnectionView[] }>('/api/connections')
      .then((r) => setConns(r.connections ?? []))
      .catch(() => setConns([]));
  }, [value]);
  const tools = d.tools ?? TOOL_KINDS.map((k) => k.id);
  const toggleTool = (k: ToolKind, on: boolean) => set({ tools: on ? TOOL_KINDS.map((x) => x.id).filter((x) => x === k || tools.includes(x)) : tools.filter((x) => x !== k) });
  const save = async () => {
    setBusy(true);
    try {
      const n = Number(budget);
      const body = { ...d, tools: d.tools && d.tools.length < TOOL_KINDS.length ? d.tools : undefined, budgetUsd: budget.trim() && Number.isFinite(n) && n > 0 ? n : undefined };
      const r = d.id ? await put<AssistantsState & { assistant: Assistant }>(`/api/assistants/${enc(d.id)}`, body) : await post<AssistantsState & { assistant: Assistant }>('/api/assistants', body);
      saved(r);
      toast(d.id ? `${d.name} is saved` : `${d.name} is ready`, 'ok');
      onClose();
      onSaved?.(r.assistant);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const connOn = (id: string) => d.connections?.includes(id) ?? false;
  return (
    <Dialog
      open={!!value}
      onClose={onClose}
      title={d.id ? `Edit ${value?.name ?? ''}` : 'New agent'}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !d.name?.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div data-i18n="agents" className="space-y-4 text-[13px]">
        <div className="flex items-end gap-3">
          <IconChoice value={d.icon ?? 'bot'} onChange={(icon) => set({ icon })} />
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-fg-2">Name</span>
            <input value={d.name ?? ''} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="Bookkeeper, Travel agent…" className={inputCls} autoFocus={!d.id} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-fg-2">One line about it</span>
          <input value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} maxLength={160} placeholder="Keeps the household accounts in order" className={inputCls} />
        </label>
        <Field label="Instructions" hint="Who it is and how it works: the agent reads this at the start of every session with it.">
          <textarea
            value={d.instructions ?? ''}
            onChange={(e) => set({ instructions: e.target.value })}
            rows={7}
            maxLength={20000}
            placeholder={'You are the user’s bookkeeper for this session.\n- Ask for the statements you need.\n- Keep totals in a spreadsheet in the working folder.'}
            className={cx(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
          />
        </Field>
        <Field label="Where it works" hint="An agent for some projects is offered only there, and works in the project's folder.">
          <Segmented
            size="sm"
            value={d.projects?.length ? 'some' : 'all'}
            onChange={(v) => set({ projects: v === 'all' ? undefined : d.projects?.length ? d.projects : spaces?.[0] ? [spaces[0].id] : undefined })}
            options={[
              { value: 'all', label: 'Everywhere' },
              { value: 'some', label: 'In projects' },
            ]}
          />
          {!!d.projects?.length && (
            <div className="mt-2 divide-y divide-line rounded-xl border border-line">
              {(spaces ?? []).map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2">
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
        </Field>
        <Field label="Where its sessions start" hint="When no folder is picked on the start page.">
          <Segmented
            size="sm"
            value={d.folder ?? 'task'}
            onChange={(folder) => set({ folder })}
            options={[
              { value: 'task', label: 'A new task folder' },
              { value: 'project', label: 'The folder on the start page' },
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Runs on" hint="The program and model it suggests, picked with it on the start page; a tier below picks the model instead.">
            <div className="-ml-2 flex flex-wrap items-center gap-0.5">
              <AgentChoice d={d} set={set} />
              {d.agent && <ModelPicker agent={d.agent} acp={d.acpAgent} value={d.model ?? null} onChange={(v) => set({ model: v ?? undefined })} />}
            </div>
          </Field>
          <Field label="Permission mode" hint="When the agent asks you first.">
            <div className="-ml-2">
              <ModeChoice d={d} set={set} />
            </div>
          </Field>
        </div>
        <Field label="Thinks with">
          <Segmented<Tier | 'auto'>
            size="sm"
            value={d.tier ?? 'auto'}
            onChange={(v) => set({ tier: v === 'auto' ? undefined : v })}
            options={[{ value: 'auto', label: 'Automatic' }, ...TIERS.map((t) => ({ value: t.id, label: t.label }))]}
          />
          {/* Under the choice it explains, not below the subagents' rows. */}
          <div className="mt-1 text-[12px] leading-snug text-fg-3">Automatic: the model picked where it starts. A tier: its model for the program it runs on (Settings → Models → Tiers).</div>
          <div className="mt-2.5 mb-1 text-[12.5px] text-fg-2">Subagents it starts, never above</div>
          <Segmented<Tier | 'any'>
            size="sm"
            value={d.helperMax ?? 'any'}
            onChange={(v) => set({ helperMax: v === 'any' ? undefined : v })}
            options={[{ value: 'any', label: 'Any' }, ...TIERS.map((t) => ({ value: t.id, label: t.label }))]}
          />
          <label className="mt-2.5 flex cursor-pointer items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-fg-2">Step up when a check fails</span>
              <span className="block text-[12px] leading-snug text-fg-3">A subagent on a tier whose reply does not pass a quick check runs again one tier up; a scheduled run that fails, too.</span>
            </span>
            <Switch on={d.stepUp !== false} onChange={(on) => set({ stepUp: on ? undefined : false })} label="Step up when a check fails" />
          </label>
        </Field>
        <Field label="What it may use" hint="Custom and Claude Code have the rest switched off; Codex is told. The app’s own tools (pages, memory) stay on.">
          <div className="divide-y divide-line rounded-xl border border-line">
            {TOOL_KINDS.map((k) => (
              <label key={k.id} className="flex cursor-pointer items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-fg">{k.label}</span>
                  <span className="block truncate text-[12px] text-fg-3">{k.hint}</span>
                </span>
                <Switch on={tools.includes(k.id)} onChange={(on) => toggleTool(k.id, on)} label={k.label} />
              </label>
            ))}
          </div>
        </Field>
        <Field label="Skills to favor" hint="When one fits the task, the agent loads it before starting.">
          <NameList value={d.skills ?? []} onChange={(v) => set({ skills: v })} suggestions={skills} placeholder="Add a skill" />
        </Field>
        {!!(conns?.length || d.connections?.length) && (
          <Field label="Connections" hint="Connected accounts (Apps → Connected apps) to turn on in its sessions.">
            <div className="divide-y divide-line rounded-xl border border-line">
              {(conns ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{c.name}</span>
                  {c.enabled ? (
                    <span className="text-[12px] text-fg-3">On for every session</span>
                  ) : (
                    <Switch on={connOn(c.id)} onChange={(on) => set({ connections: on ? [...(d.connections ?? []), c.id] : (d.connections ?? []).filter((x) => x !== c.id) })} label={`${c.name} on in its sessions`} />
                  )}
                </div>
              ))}
              {(d.connections ?? [])
                .filter((id) => !conns?.some((c) => c.id === id))
                .map((id) => (
                  <div key={id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{id} (not connected)</span>
                    <IconButton label={`Remove ${id}`} size="sm" onClick={() => set({ connections: d.connections!.filter((x) => x !== id) })}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ))}
            </div>
          </Field>
        )}
        <Field label="Team" hint="Agents it may hand parts of its work to, each working with its own settings. Built-in agents may ask any agent.">
          <div className="divide-y divide-line rounded-xl border border-line">
            {others.map((x) => (
              <label key={x.id} className="flex cursor-pointer items-center gap-3 px-3 py-2">
                <AssistantIcon icon={x.icon} size={13} />
                <span translate="no" className="min-w-0 flex-1 truncate text-[13px]">
                  {x.name}
                </span>
                <Switch
                  on={!!d.canAsk?.includes(x.id)}
                  label={x.name}
                  onChange={(on) => {
                    const next = on ? [...(d.canAsk ?? []), x.id] : (d.canAsk ?? []).filter((y) => y !== x.id);
                    set({ canAsk: next.length ? next : undefined });
                  }}
                />
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 text-[13px]">Other agents may hand it work</span>
              <Switch on={d.askable !== false} onChange={(on) => set({ askable: on ? undefined : false })} label="Other agents may hand it work" />
            </label>
          </div>
        </Field>
        <Field label="Monthly budget" hint="Once its sessions have spent this much in a month, none starts as it until the next; each is capped at what is left. Empty: no limit.">
          <div className="flex items-center gap-2">
            <span className="text-fg-3">$</span>
            <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="No limit" className={cx(inputCls, 'w-32')} aria-label="Dollars a month" />
          </div>
        </Field>
        <Field label="Its own conversation" hint="Messages from you and other agents go into one conversation of its own, one at a time, and it remembers what came before; each answer goes back to whoever sent it. Its scheduled runs post there too.">
          <label className="flex cursor-pointer items-center gap-3">
            <span className="min-w-0 flex-1 text-[13px]">Keeps one conversation, with an inbox</span>
            <Switch on={!!d.standing} onChange={(on) => set({ standing: on || undefined })} label="Keeps one conversation, with an inbox" />
          </label>
        </Field>
        <Field label="Hands back" hint="The fields of each result, checked when it hands one back (hand_back), and where each goes.">
          <OutputEditor value={d.output} onChange={(output) => set({ output })} />
        </Field>
      </div>
    </Dialog>
  );
}

// ---- importing Claude Code agents -----------------------------------------------------------------------

interface AgentFileRow {
  path: string;
  scope: 'user' | 'project';
  name: string;
  description: string;
  imported?: string;
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const root = useUI((s) => s.explorerRoot) ?? home;
  const [files, setFiles] = useState<AgentFileRow[] | null>(null);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () =>
    api<{ files: AgentFileRow[] }>(`/api/assistants/import?cwd=${enc(root)}`)
      .then((r) => setFiles(r.files))
      .catch((e) => (toastError(e), setFiles([])));
  useEffect(() => {
    if (open) load();
  }, [open]);
  const take = async (body: { path?: string; text?: string; name?: string }, what: string) => {
    setBusy(what);
    try {
      const r = await post<AssistantsState & { assistant: Assistant }>('/api/assistants/import', body);
      saved(r);
      toast(`${r.assistant.name} is ready to pick on the start page`, 'ok');
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Import Claude Code agents" width={520}>
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">
        Agent files (<span className="font-mono text-[12px]">.claude/agents/*.md</span>) become assistants: their name, description, model and tools, and the text below as the instructions.
      </p>
      {!files ? (
        <Throbber className="text-fg-3" />
      ) : !files.length ? (
        <p className="text-[13px] text-fg-3">
          None in <span className="font-mono text-[12px]">~/.claude/agents</span> or <span className="font-mono text-[12px]">{tildify(root, home)}/.claude/agents</span>.
        </p>
      ) : (
        <div className="-my-1 divide-y divide-line">
          {files.map((f) => (
            <div key={f.path} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13.5px] font-medium">
                  <span className="truncate">{f.name}</span>
                  <Badge>{f.scope === 'user' ? 'Yours' : 'This folder'}</Badge>
                </div>
                <div className="truncate text-[12.5px] text-fg-3" title={f.path}>
                  {f.description || tildify(f.path, home)}
                </div>
              </div>
              <Button size="sm" variant={f.imported ? 'ghost' : 'secondary'} disabled={!!busy} onClick={() => take({ path: f.path }, f.path)}>
                {busy === f.path ? 'Importing…' : f.imported ? 'Update' : 'Import'}
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        <span className="min-w-0 flex-1 text-[12.5px] text-fg-3">Or an agent file from this device</span>
        <Button size="sm" variant="secondary" icon={<FileUp size={14} />} disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === 'upload' ? 'Importing…' : 'Choose a file'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,text/markdown"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) await take({ text: await f.text(), name: f.name }, 'upload');
          }}
        />
      </div>
    </Dialog>
  );
}
