// Settings → Assistants: the assistants to start sessions as (the built-ins to duplicate, your own to
// change or delete, Claude Code agent files to import), and where task folders go. How the agents talk to
// you is part of Agent Guidelines now (features/guidelines).
import { useEffect, useRef, useState } from 'react';
import { Copy, FileUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { ASSISTANT_ICONS, ASSISTANT_MODES, TOOL_KINDS, type Assistant, type AssistantsState, type ToolKind } from '@shared/assistants';
import type { ConnectionView } from '@shared/connections';
import type { Agent } from '@shared/types';
import { api, del, enc, post, put } from '../../lib/api';
import { tildify } from '../../lib/format';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { ModelPicker } from '../../components/AgentPickers';
import { AgentIcon } from '../../components/AgentIcon';
import { FolderChip } from '../../components/FolderPicker';
import { Badge, Button, cx, Dialog, IconButton, inputCls, OptionRow, Picker, Popover, Section, Segmented, Switch, Throbber, useConfirm } from '../../components/ui';
import { AssistantIcon, ICONS } from './icons';
import { useAssistants, useAssistantsState } from './state';

type Draft = Partial<Assistant>;
const saved = (r: AssistantsState) => useAssistants.getState().set(r);

export function AssistantsSettings() {
  const st = useAssistantsState();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  if (!st) return <Throbber className="text-fg-3" />;
  const remove = async (a: Assistant) => {
    if (!(await confirm({ title: `Delete ${a.name}?`, body: 'Sessions started with it keep going without its instructions.', confirm: 'Delete', danger: true }))) return;
    del<AssistantsState>(`/api/assistants/${enc(a.id)}`).then(saved, toastError);
  };
  return (
    <div className="space-y-4">
      <Section
        title="Assistants"
        sub="Pick one when you start a session: who the agent is for it, how it works and what it may use"
        actions={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" icon={<FileUp size={14} />} onClick={() => setImporting(true)}>
              Import
            </Button>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEdit({ icon: 'bot', folder: 'task' })}>
              New assistant
            </Button>
          </div>
        }
      >
        <div className="-my-1 divide-y divide-line">
          {st.assistants.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-2.5">
              <AssistantIcon icon={a.icon} size={16} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13.5px] font-medium">
                  <span className="truncate">{a.name}</span>
                  {a.builtin && <Badge>Built in</Badge>}
                  {a.source && <Badge tone="claude">Imported</Badge>}
                </div>
                <div className="truncate text-[12.5px] text-fg-3">{a.description || 'No description'}</div>
              </div>
              {!a.builtin && (
                <IconButton label={`Edit ${a.name}`} size="sm" onClick={() => setEdit(a)}>
                  <Pencil size={14} />
                </IconButton>
              )}
              <IconButton label={`Duplicate ${a.name}`} size="sm" onClick={() => setEdit({ ...a, id: undefined, builtin: undefined, source: undefined, name: `${a.name} (copy)` })}>
                <Copy size={14} />
              </IconButton>
              {!a.builtin && (
                <IconButton label={`Delete ${a.name}`} size="sm" onClick={() => remove(a)}>
                  <Trash2 size={14} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      </Section>
      <CleanUpSection on={st.cleanUp} />
      <TaskFolderSection st={st} />
      <EditAssistant value={edit} onClose={() => setEdit(null)} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      {confirmNode}
    </div>
  );
}

// ---- cleaning up after a task ------------------------------------------------------------------------------

function CleanUpSection({ on }: { on: boolean }) {
  const set = (cleanUp: boolean) =>
    put<AssistantsState>('/api/assistants/settings', { cleanUp })
      .then((r) => (saved(r), toast(cleanUp ? 'Agents clean up after a task from their next session' : 'Agents leave what they made in place from their next session', 'ok')), toastError);
  return (
    <Section title="When a task is done" sub="What every agent does at the end of a task, whatever the assistant">
      <label className="flex cursor-pointer items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] text-fg">Clean up after a task</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">
            The agent removes what it made along the way and no longer needs: scratch and test files, temporary data, extra branches and worktrees, processes it started. It keeps
            the work you asked for, never touches what it did not make, asks first about anything large or unclear, and says what it removed.
          </span>
        </span>
        <Switch on={on} onChange={set} label="Clean up after a task" className="mt-0.5" />
      </label>
    </Section>
  );
}

// ---- task folders ------------------------------------------------------------------------------------------

function TaskFolderSection({ st }: { st: AssistantsState }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const set = (taskRoot: string) => put<AssistantsState>('/api/assistants/settings', { taskRoot }).then(saved, toastError);
  return (
    <Section title="Task folders" sub="A session started without a folder gets a new one here, named by the day and the task">
      <div className="flex flex-wrap items-center gap-2">
        <FolderChip value={st.taskRoot} onChange={set} />
        {st.taskRoot !== st.defaultTaskRoot && (
          <Button size="sm" variant="ghost" onClick={() => set('')}>
            Back to {tildify(st.defaultTaskRoot, home)}
          </Button>
        )}
      </div>
      <p className="mt-2 text-[12.5px] text-fg-3">
        New ones look like <span className="font-mono text-[12px] text-fg-2">{tildify(st.taskRoot, home)}/2026-10-31-plan-trip-lisbon</span>. Coder works in the folder you pick instead.
      </p>
    </Section>
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

function EditAssistant({ value, onClose }: { value: Draft | null; onClose: () => void }) {
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
      const body = { ...d, tools: d.tools && d.tools.length < TOOL_KINDS.length ? d.tools : undefined };
      const r = d.id ? await put<AssistantsState>(`/api/assistants/${enc(d.id)}`, body) : await post<AssistantsState>('/api/assistants', body);
      saved(r);
      toast(d.id ? `${d.name} is saved` : `${d.name} is ready to pick on the start page`, 'ok');
      onClose();
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
      title={d.id ? `Edit ${value?.name ?? ''}` : 'New assistant'}
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
      <div className="space-y-4 text-[13px]">
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
          <Field label="Agent and model" hint="Picked with it on the start page.">
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
          <Field label="Connections" hint="Apps from Settings → Connections to turn on in its sessions.">
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

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
