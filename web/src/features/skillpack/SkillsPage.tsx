// Settings → Skills: every skill agents can load, in one place. The library's (built in, your own, those of
// your plugins) reach every agent the app starts; Claude Code and Codex have their own folders of skills too,
// and spaces have skills of their own. Skills agents suggest wait at the top for your answer. A search, a
// row of filters and one menu; each skill opens to read, switch off, change or remove.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookPlus,
  BrainCircuit,
  CalendarRange,
  ChartColumn,
  Code2,
  FilePen,
  FileText,
  FolderOpen,
  Globe,
  Info,
  ListChecks,
  MoreHorizontal,
  Palette,
  PenLine,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { composeSkill, parseSkill, SKILL_CATEGORIES, type LibrarySkill, type SkillDoc, type SkillLibrary, type SkillProposal } from '@shared/skillpack';
import type { Agent, SkillEntry } from '@shared/types';
import { api, enc, post, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { ago, tildify } from '../../lib/format';
import { go, openSession, showInFiles } from '../../lib/nav';
import { toast, toastError, useApp, useSessions } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuSep, Popover, Segmented, Switch, Tabs, Throbber, useConfirm } from '../../components/ui';
import { EditorDialog } from '../settings/Instructions';
import { ProposalPanel } from './ProposalCard';
import { SkillHistory, Triggers } from './SkillView';

// ---- what a skill is, wherever it comes from ----------------------------------------------------------

type Source = 'bundled' | 'learned' | 'plugin' | 'claude' | 'codex' | 'space';
type Filter = 'all' | 'builtin' | 'yours' | 'plugins' | 'agents' | 'spaces';

interface Item {
  key: string;
  name: string;
  description: string;
  source: Source;
  category?: string;
  on: boolean;
  lib?: LibrarySkill;
  agent?: SkillEntry;
  space?: { id: string; name: string };
}

/** Each group's icon and colour. */
const CATEGORY: Record<string, { icon: LucideIcon; tone: string }> = {
  work: { icon: ListChecks, tone: 'bg-ok/12 text-ok' },
  writing: { icon: PenLine, tone: 'bg-accent/14 text-accent' },
  documents: { icon: FileText, tone: 'bg-info/12 text-info' },
  research: { icon: Globe, tone: 'bg-info/12 text-info' },
  planning: { icon: CalendarRange, tone: 'bg-warn/12 text-warn' },
  data: { icon: ChartColumn, tone: 'bg-ok/12 text-ok' },
  creative: { icon: Palette, tone: 'bg-claude/12 text-claude' },
  coding: { icon: Code2, tone: 'bg-codex/12 text-codex' },
  ai: { icon: BrainCircuit, tone: 'bg-accent/14 text-accent' },
  app: { icon: Sparkles, tone: 'bg-accent/14 text-accent' },
};
const OTHER = { icon: Sparkles, tone: 'bg-bg-3 text-fg-2' };
const categoryOf = (c?: string) => (c && CATEGORY[c]) || OTHER;
const categoryLabel = (c?: string) => (c && c in SKILL_CATEGORIES ? SKILL_CATEGORIES[c as keyof typeof SKILL_CATEGORIES] : 'Other skills');

const SOURCE_LABEL: Record<Source, string> = { bundled: 'Built in', learned: 'Yours', plugin: 'Plugin', claude: 'Claude Code', codex: 'Codex', space: 'Project' };
const SCOPE_LABEL: Record<SkillEntry['scope'], string> = { user: 'In all folders', project: 'In this folder', repo: 'In this repository', plugin: 'From one of its plugins', system: 'Built into it', admin: 'Set by an admin' };

function items(lib: SkillLibrary | null, agents: SkillEntry[] | null): Item[] {
  const out: Item[] = [];
  for (const s of lib?.skills ?? [])
    out.push({ key: `lib:${s.name}`, name: s.name, description: s.description, source: s.source, category: s.category, on: !s.off, lib: s });
  for (const s of agents ?? []) out.push({ key: `${s.agent}:${s.path}`, name: s.name, description: s.description, source: s.agent === 'codex' ? 'codex' : 'claude', on: s.enabled, agent: s });
  for (const g of lib?.spaces ?? []) for (const s of g.skills) out.push({ key: `space:${g.id}:${s.name}`, name: s.name, description: s.description, source: 'space', on: true, space: { id: g.id, name: g.name } });
  return out;
}

const inFilter = (i: Item, f: Filter) =>
  f === 'all' ||
  (f === 'builtin' && i.source === 'bundled') ||
  (f === 'yours' && i.source === 'learned') ||
  (f === 'plugins' && i.source === 'plugin') ||
  (f === 'agents' && (i.source === 'claude' || i.source === 'codex')) ||
  (f === 'spaces' && i.source === 'space');

const used = (s: LibrarySkill) => (s.uses ? `Used ${s.uses === 1 ? 'once' : `${s.uses} times`}${s.lastUsed ? `, last ${ago(s.lastUsed)}` : ''}` : '');

// ---- rows and groups -----------------------------------------------------------------------------------

function Tile({ i, size = 34 }: { i: Item; size?: number }) {
  if (i.source === 'claude' || i.source === 'codex')
    return (
      <span className="flex shrink-0 items-center justify-center rounded-[10px] bg-bg-2" style={{ width: size, height: size }}>
        <AgentIcon agent={i.source} size={Math.round(size * 0.47)} />
      </span>
    );
  const c = i.source === 'plugin' && !i.category ? { icon: Puzzle, tone: 'bg-info/12 text-info' } : categoryOf(i.category);
  return (
    <span className={cx('flex shrink-0 items-center justify-center rounded-[10px]', c.tone)} style={{ width: size, height: size }}>
      <c.icon size={Math.round(size * 0.47)} />
    </span>
  );
}

/** Where a skill comes from, in a few words. */
function From({ i }: { i: Item }) {
  if (i.source === 'plugin') return <span translate="no">{i.lib?.plugin?.title ?? 'A plugin'}</span>;
  if (i.source === 'space') return <span translate="no">{i.space?.name}</span>;
  if (i.agent)
    return (
      <>
        <span>{agentName(i.agent.agent)}</span> · <span>{SCOPE_LABEL[i.agent.scope]}</span>
      </>
    );
  if (i.lib?.overrides) return <>Your version of a built-in skill</>;
  return <>{SOURCE_LABEL[i.source]}</>;
}

function Row({ i, onOpen, onToggle }: { i: Item; onOpen: () => void; onToggle?: (on: boolean) => void }) {
  const meta = [i.lib ? used(i.lib) : ''].filter(Boolean);
  return (
    <div className={cx('group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-bg-1 sm:px-4', !i.on && 'opacity-60')}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Tile i={i} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span translate="no" className="truncate text-[14px] font-medium text-fg">
              {i.name}
            </span>
            {i.source === 'learned' && <Badge tone="ok">Yours</Badge>}
            {i.source === 'plugin' && <Badge tone="info">Plugin</Badge>}
            {!i.on && <Badge>Off</Badge>}
          </span>
          <span translate={i.source === 'bundled' ? undefined : 'no'} className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">
            {i.description}
          </span>
          {(i.source !== 'bundled' || meta.length > 0) && (
            <span className="mt-0.5 block truncate text-[11.5px] text-fg-3">
              {i.source !== 'bundled' && <From i={i} />}
              {i.source !== 'bundled' && meta.length ? ' · ' : ''}
              {meta.join(' · ')}
            </span>
          )}
        </span>
      </button>
      {onToggle && <Switch on={i.on} onChange={onToggle} label={i.on ? `Turn ${i.name} off` : `Turn ${i.name} on`} className="shrink-0" />}
    </div>
  );
}

function Group({ icon, title, count, children, note }: { icon: ReactNode; title: ReactNode; count: number; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel">
      <header className="flex items-center gap-2 px-3 pt-3 pb-1.5 sm:px-4">
        <span className="text-fg-3">{icon}</span>
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg-2">{title}</h3>
        <span className="tnum text-[12px] text-fg-3">{count}</span>
      </header>
      {note && <p className="px-3 pb-1.5 text-[12px] leading-snug text-fg-3 sm:px-4">{note}</p>}
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

/** Skills agents suggested, waiting for your yes. */
function Waiting({ list, onReview }: { list: SkillProposal[]; onReview: (p: SkillProposal) => void }) {
  const titles = useSessions((x) => x.byKey);
  return (
    <section className="overflow-hidden rounded-2xl border border-accent/35 bg-accent/6">
      <header className="flex items-center gap-2 px-4 pt-3 pb-1">
        <Sparkles size={15} className="text-accent" />
        <h3 className="flex-1 text-[13.5px] font-semibold">
          {list.length === 1 ? 'An agent suggests a skill' : `Agents suggest ${list.length} skills`}
        </h3>
      </header>
      <p className="px-4 pb-2 text-[12.5px] text-fg-3">After hard tasks, agents can offer to keep what they learned. Nothing is saved until you approve.</p>
      <div className="divide-y divide-accent/15">
        {list.map((p) => {
          const Icon = p.kind === 'new' ? BookPlus : FilePen;
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">
                  {p.kind === 'new' ? 'New skill: ' : 'Change to '}
                  <span translate="no">{p.name}</span>
                </div>
                <div className="truncate text-[12px] text-fg-3">
                  {ago(p.createdAt)} ·{' '}
                  <button type="button" onClick={() => openSession(p.key)} className="hover:text-fg hover:underline" translate="no">
                    {titles[p.key]?.title || 'its conversation'}
                  </button>
                  {p.findings.length ? ' · has warnings' : ''}
                </div>
              </div>
              <Button size="sm" variant="primary" onClick={() => onReview(p)}>
                Review
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- reading a skill -----------------------------------------------------------------------------------

/** A skill opened: what it says, where it comes from, and what you can do with it. */
function SkillDetail({
  i,
  onClose,
  onToggle,
  onEdit,
  onEditFile,
  onRemove,
}: {
  i: Item;
  onClose: () => void;
  onToggle?: (on: boolean) => void;
  onEdit: (doc: SkillDoc) => void;
  onEditFile: (path: string) => void;
  onRemove: () => void;
}) {
  const home = useApp((s) => s.boot?.home);
  const [doc, setDoc] = useState<SkillDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'skill' | 'history'>('skill');
  useEffect(() => {
    let alive = true;
    const load: Promise<SkillDoc> = i.lib
      ? api<SkillDoc>(`/api/skillpack/skills/${enc(i.name)}`)
      : i.space
        ? api<SkillDoc>(`/api/spaces/${enc(i.space.id)}/skills/${enc(i.name)}`)
        : api<{ content: string | null }>(`/api/fs/read?path=${enc(i.agent!.path)}`).then((f) => ({ name: i.name, text: f.content ?? '', source: 'learned', file: i.agent!.path, history: [] }) as SkillDoc);
    load.then(
      (d) => alive && setDoc(d),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [i]);
  const fm = doc ? parseSkill(doc.text) : null;
  const history = i.lib ? (doc?.history ?? []) : [];
  const actions: ReactNode[] = [];
  if (i.source === 'learned' && doc) {
    actions.push(
      <Button key="rm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemove}>
        Remove
      </Button>,
      <Button key="edit" icon={<PenLine size={14} />} onClick={() => onEdit(doc)}>
        Change
      </Button>,
    );
  } else if ((i.source === 'bundled' || i.source === 'plugin') && doc) {
    if (i.source === 'plugin')
      actions.push(
        <Button key="plugin" variant="ghost" icon={<Puzzle size={14} />} onClick={() => (onClose(), go(`/settings?s=plugins&plugin=${enc(i.lib?.plugin?.name ?? '')}`))}>
          Its plugin
        </Button>,
      );
    actions.push(
      <Button key="own" icon={<PenLine size={14} />} onClick={() => onEdit(doc)} title="Agents get your version in its place; the original stays here to go back to">
        Make my own version
      </Button>,
    );
  } else if (i.agent) {
    if (i.agent.deletable)
      actions.push(
        <Button key="rm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemove}>
          Delete
        </Button>,
      );
    actions.push(
      <Button key="edit" icon={<PenLine size={14} />} onClick={() => onEditFile(i.agent!.path)}>
        {i.agent.deletable ? 'Change' : 'Open'}
      </Button>,
    );
  } else if (i.space) {
    actions.push(
      <Button key="space" icon={<FolderOpen size={14} />} onClick={() => (onClose(), go(`/spaces/${enc(i.space!.id)}/skills`))}>
        The project’s skills
      </Button>,
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      width={760}
      title={
        <span className="flex min-w-0 items-center gap-2.5">
          <Tile i={i} size={28} />
          <span translate="no" className="truncate">
            {i.name}
          </span>
        </span>
      }
      footer={
        <>
          {actions}
          <Button variant={actions.length ? 'ghost' : 'secondary'} onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-fg-3">
          <span className="flex items-center gap-1.5">
            <From i={i} />
          </span>
          {i.category && <span>{categoryLabel(i.category)}</span>}
          {i.lib && used(i.lib) && <span>{used(i.lib)}</span>}
          <span className="flex-1" />
          {onToggle && (
            <span className="flex items-center gap-2 text-fg-2">
              {i.on ? 'Agents get it' : 'Off: agents do not get it'}
              <Switch on={i.on} onChange={onToggle} label={i.on ? `Turn ${i.name} off` : `Turn ${i.name} on`} />
            </span>
          )}
        </div>
        {error ? (
          <p className="py-3 text-[13.5px] text-fg-2">{error}</p>
        ) : !doc || !fm ? (
          <div className="flex justify-center py-10">
            <Throbber size={26} />
          </div>
        ) : (
          <>
            {fm.description && (
              <p translate={i.source === 'bundled' ? undefined : 'no'} className="text-[14px] leading-relaxed text-fg-2">
                {fm.description}
              </p>
            )}
            {fm.triggers.length > 0 && <Triggers list={fm.triggers} />}
            {history.length > 0 && (
              <Tabs
                value={tab}
                onChange={setTab}
                className="border-b border-line"
                options={[
                  { value: 'skill', label: 'Instructions' },
                  { value: 'history', label: 'History', count: history.length },
                ]}
              />
            )}
            {tab === 'history' && history.length ? (
              <SkillHistory list={history} />
            ) : (
              <div className="rounded-xl border border-line bg-bg-1 px-4 py-3" translate={i.source === 'bundled' ? undefined : 'no'}>
                <Markdown text={fm.body} className="text-[13.5px]" />
              </div>
            )}
            <button type="button" onClick={() => (onClose(), showInFiles(doc.file))} className="block max-w-full truncate font-mono text-[11.5px] text-fg-3 hover:text-fg hover:underline" title="Show in Files">
              {tildify(doc.file, home)}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---- writing one ---------------------------------------------------------------------------------------

type For = 'all' | Agent;

/** A new skill, or a change to one of yours (or your own version of one that is not): its words, in plain fields. */
export function SkillEditor({ doc, cwd, onClose, onSaved }: { doc?: SkillDoc; cwd: string; onClose: () => void; onSaved: (name: string) => void }) {
  const fm = doc ? parseSkill(doc.text) : null;
  const [name, setName] = useState(doc?.name ?? '');
  const [desc, setDesc] = useState(fm?.description ?? '');
  const [category, setCategory] = useState(fm?.category ?? '');
  const [body, setBody] = useState(fm?.body.replace(/^\s*\n/, '') ?? '');
  const [words, setWords] = useState(fm?.triggers.join(', ') ?? '');
  const [who, setWho] = useState<For>('all');
  const [where, setWhere] = useState<'user' | 'project'>('user');
  const [busy, setBusy] = useState(false);
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const ok = !!slug && desc.trim().length >= 10 && (who !== 'all' || body.trim().length >= 40);
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const triggers = words
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean)
        .slice(0, 12);
      if (doc) {
        const text = composeSkill({ name: doc.name, description: desc, category: category || undefined, triggers, body });
        await put(`/api/skillpack/skills/${enc(doc.name)}`, { text });
        toast(doc.source === 'learned' ? `Saved ${doc.name}` : `Agents now get your version of ${doc.name}`, 'ok');
        onSaved(doc.name);
      } else if (who === 'all') {
        const r = await post<{ name: string }>('/api/skillpack/skills', { name: slug, description: desc, category: category || undefined, triggers, body });
        toast(`Added ${r.name} for every agent`, 'ok');
        onSaved(r.name);
      } else {
        await post('/api/setup/skills', { agent: who, name: slug, description: desc, scope: where, cwd, body });
        toast(`Added ${slug} for ${agentName(who)}`, 'ok');
        onSaved(slug);
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const title = doc ? (doc.source === 'learned' ? `Change ${doc.name}` : `Your version of ${doc.name}`) : 'New skill';
  return (
    <Dialog
      open
      onClose={onClose}
      width={720}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!ok || busy}>
            {busy ? <Throbber /> : doc ? 'Save' : 'Add skill'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        {!doc && (
          <Field label="Name" hint={slug && slug !== name ? `Saved as ${slug}` : 'Short, with dashes: invoice-checks, trip-budget'}>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="invoice-checks" autoFocus autoComplete="off" />
          </Field>
        )}
        <Field label="When to use it" hint="Agents see this line in every session and read the rest only when it fits. Start with “Use when…”.">
          <textarea className={cx(inputCls, 'h-16 resize-y py-2')} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Use when checking a supplier’s invoice before it is paid" />
        </Field>
        <Field label="Instructions" hint="The method itself, in Markdown: the steps in order, the checks, the mistakes to avoid.">
          <textarea className={cx(inputCls, 'h-[min(40vh,320px)] resize-y py-2 font-mono text-[13px] leading-relaxed')} value={body} onChange={(e) => setBody(e.target.value)} placeholder={'# Invoice checks\n\n1. Match the invoice to its order…'} spellCheck={false} />
        </Field>
        {(doc || who === 'all') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Group">
              <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Other skills</option>
                {Object.entries(SKILL_CATEGORIES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Words that bring it in" hint="Optional, for models that rarely load skills: comma separated">
              <input className={inputCls} value={words} onChange={(e) => setWords(e.target.value)} placeholder="check this invoice, supplier invoice" autoComplete="off" />
            </Field>
          </div>
        )}
        {!doc && (
          <Field label="Who gets it">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                size="sm"
                value={who}
                onChange={setWho}
                options={[
                  { value: 'all', label: 'Every agent' },
                  { value: 'claude', label: 'Claude Code', icon: <AgentIcon agent="claude" size={13} /> },
                  { value: 'codex', label: 'Codex', icon: <AgentIcon agent="codex" size={13} /> },
                ]}
              />
              {who === 'claude' && (
                <Segmented
                  size="sm"
                  value={where}
                  onChange={setWhere}
                  options={[
                    { value: 'user', label: 'All folders' },
                    { value: 'project', label: 'This folder' },
                  ]}
                />
              )}
            </div>
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] leading-snug text-fg-3">{hint}</span>}
    </label>
  );
}

/** How agents get skills, for those who want to know. */
function HowItWorks({ lib, onClose }: { lib: SkillLibrary; onClose: () => void }) {
  const home = useApp((s) => s.boot?.home);
  return (
    <Dialog open onClose={onClose} width={560} title="How agents get skills" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-3 pb-2 text-[13.5px] leading-relaxed text-fg-2">
        <p>A skill is a written method for one kind of work. Agents see each skill’s name and when to use it, and read the rest only when a task calls for it.</p>
        <p>
          Every session this app starts gets the built-in skills, yours and your plugins’: Claude Code as its plugin “hydor” (they show as hydor:research and so on), Codex as an extra skills folder, Custom
          in its skills list, and other agents as a list of files to read. Claude Code’s and Codex’s own skills stay theirs. Sessions started outside the app do not get these.
        </p>
        <p>
          Your own skills are kept in <span className="font-mono text-[12.5px]">{tildify(lib.folders.learned, home)}</span>, one folder per skill with its SKILL.md. A skill of yours with the name of a
          built-in one takes its place.
        </p>
        <p>A project can have skills of its own, which only its sessions get: on the project’s page, its Skills tab.</p>
      </div>
    </Dialog>
  );
}

// ---- the page --------------------------------------------------------------------------------------------

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'builtin', label: 'Built in' },
  { value: 'yours', label: 'Yours' },
  { value: 'plugins', label: 'From plugins' },
  { value: 'agents', label: 'Claude Code and Codex' },
  { value: 'spaces', label: 'In projects' },
];

export function SkillsSettings({ cwd }: { cwd: string }) {
  const [lib, setLib] = useState<SkillLibrary | null>(null);
  const [agents, setAgents] = useState<{ skills: SkillEntry[]; errors: string[] } | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Item | null>(null);
  const [editing, setEditing] = useState<{ doc?: SkillDoc } | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [review, setReview] = useState<SkillProposal | null>(null);
  const [how, setHow] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuAt = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();

  const loadLib = useCallback(() => api<SkillLibrary>('/api/skillpack').then(setLib, toastError), []);
  const loadAgents = useCallback(
    () =>
      api<{ skills: SkillEntry[]; errors: string[] }>(`/api/setup/skills?cwd=${enc(cwd)}`).then(setAgents, (e: Error) => setAgents({ skills: [], errors: [e.message] })),
    [cwd],
  );
  useEffect(() => {
    loadLib();
  }, [loadLib]);
  useEffect(() => {
    setAgents(null);
    loadAgents();
  }, [loadAgents]);
  // A suggestion answered in a conversation, a new one, a skill saved, a plugin turned on: the list follows.
  useFeatureEvent('skillpack', () => {
    loadLib();
  });
  useFeatureEvent('plugins', (e) => {
    if ((e as { changed?: boolean })?.changed) loadLib();
  });

  const all = useMemo(() => items(lib, agents?.skills ?? null), [lib, agents]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, all.filter((i) => inFilter(i, f.value)).length])) as Record<Filter, number>, [all]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((i) => inFilter(i, filter) && words.every((w) => `${i.name} ${i.description} ${i.lib?.plugin?.title ?? ''} ${i.space?.name ?? ''}`.toLowerCase().includes(w)));

  // Grouped: the library's by what they are for, then each agent's own, then each space's.
  const groups = useMemo(() => {
    const out: { key: string; icon: ReactNode; title: ReactNode; items: Item[]; note?: ReactNode }[] = [];
    const library = shown.filter((i) => i.lib);
    const order = [...Object.keys(SKILL_CATEGORIES), ''];
    for (const c of order) {
      const list = library.filter((i) => (i.category && i.category in SKILL_CATEGORIES ? i.category : '') === c).sort((a, b) => a.name.localeCompare(b.name));
      if (!list.length) continue;
      const C = categoryOf(c);
      out.push({ key: `c:${c}`, icon: <C.icon size={15} />, title: categoryLabel(c), items: list });
    }
    for (const a of ['claude', 'codex'] as const) {
      const list = shown.filter((i) => i.source === a);
      if (list.length)
        out.push({
          key: a,
          icon: <AgentIcon agent={a} size={15} />,
          title: `${agentName(a)}’s own`,
          items: list.sort((x, y) => x.name.localeCompare(y.name)),
          note: a === 'claude' ? 'In Claude Code’s own folders: only Claude Code sessions get them.' : 'In Codex’s own folders, and the ones it comes with: only Codex sessions get them.',
        });
    }
    const spaces = new Map<string, Item[]>();
    for (const i of shown.filter((x) => x.space)) spaces.set(i.space!.id, [...(spaces.get(i.space!.id) ?? []), i]);
    for (const [id, list] of spaces)
      out.push({ key: `s:${id}`, icon: <FolderOpen size={15} />, title: <span translate="no">{list[0].space!.name}</span>, items: list, note: 'Only this project’s sessions get these. Change them on the project’s page.' });
    return out;
  }, [shown]);

  const toggle = async (i: Item, on: boolean) => {
    const patchOne = (x: Item) => (x.key === i.key ? { ...x, on } : x);
    setOpen((o) => (o ? patchOne(o) : o));
    try {
      if (i.lib) {
        setLib((l) => l && { ...l, skills: l.skills.map((s) => (s.name === i.name ? { ...s, off: !on || undefined } : s)) });
        await put(`/api/skillpack/skills/${enc(i.name)}/off`, { off: !on });
      } else if (i.agent) {
        setAgents((a) => a && { ...a, skills: a.skills.map((s) => (s.path === i.agent!.path && s.agent === i.agent!.agent ? { ...s, enabled: on } : s)) });
        await post('/api/setup/skills/toggle', { agent: i.agent.agent, name: i.agent.name, path: i.agent.path, enabled: on });
      }
    } catch (e) {
      toastError(e);
      loadLib();
      loadAgents();
    }
  };

  const remove = async (i: Item) => {
    if (i.lib) {
      const ok = await confirm({
        title: `Remove ${i.name}?`,
        body: i.lib.overrides ? 'Agents go back to the built-in version. You can bring yours back from this page.' : 'Agents stop getting it. You can bring it back from this page.',
        confirm: 'Remove',
        danger: true,
      });
      if (!ok) return;
      try {
        await post(`/api/skillpack/skills/${enc(i.name)}/remove`);
        toast(`Removed ${i.name}`, 'ok');
      } catch (e) {
        toastError(e);
      }
      loadLib();
    } else if (i.agent) {
      const ok = await confirm({ title: `Delete ${i.name}?`, body: 'Its folder is deleted from disk, with every file in it.', confirm: 'Delete', danger: true });
      if (!ok) return;
      try {
        await post('/api/setup/skills/delete', { agent: i.agent.agent, path: i.agent.path, cwd });
        toast(`Deleted ${i.name}`, 'ok');
      } catch (e) {
        toastError(e);
      }
      loadAgents();
    }
    setOpen(null);
  };

  const restore = async (name: string) => {
    try {
      await post(`/api/skillpack/skills/${enc(name)}/restore`);
      toast(`${name} is back`, 'ok');
    } catch (e) {
      toastError(e);
    }
    loadLib();
  };

  const setTriggers = (on: boolean) => {
    if (!lib) return;
    setLib({ ...lib, triggers: on });
    put('/api/skillpack/settings', { triggers: on }).catch((e) => (toastError(e), loadLib()));
  };

  if (!lib)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );

  return (
    <div className="space-y-4">
      {lib.pending.length > 0 && <Waiting list={lib.pending} onReview={setReview} />}

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} placeholder={`Search ${all.length} skills`} className={cx(inputCls, 'pr-8 pl-9')} />
          {q && (
            <span className="absolute top-1/2 right-1 -translate-y-1/2">
              <IconButton label="Clear search" size="sm" onClick={() => setQ('')}>
                <X size={14} />
              </IconButton>
            </span>
          )}
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing({})}>
          <span className="hidden sm:inline">New skill</span>
          <span className="sm:hidden">New</span>
        </Button>
        <IconButton ref={menuAt} label="More" onClick={() => setMenu((o) => !o)}>
          <MoreHorizontal size={17} />
        </IconButton>
        <Popover anchor={menuAt} open={menu} onClose={() => setMenu(false)} align="end" width={290}>
          <MenuItem icon={<Sparkles size={14} />} checked={lib.triggers} onClick={() => (setMenu(false), setTriggers(!lib.triggers))}>
            Bring skills in by keywords
          </MenuItem>
          <MenuItem icon={<FolderOpen size={14} />} onClick={() => (setMenu(false), go(`/files?dir=${enc(lib.folders.learned)}`))}>
            Your skills folder
          </MenuItem>
          <MenuItem icon={<Puzzle size={14} />} onClick={() => (setMenu(false), go('/settings?s=plugins'))}>
            Get more with plugins
          </MenuItem>
          <MenuSep />
          <MenuItem icon={<Info size={14} />} onClick={() => (setMenu(false), setHow(true))}>
            How agents get skills
          </MenuItem>
        </Popover>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Show">
        {FILTERS.filter((f) => f.value === 'all' || counts[f.value] > 0 || filter === f.value).map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cx(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors',
              filter === f.value ? 'bg-fg text-bg' : 'bg-bg-2 text-fg-2 hover:bg-bg-3 hover:text-fg',
            )}
          >
            {f.label}
            <span className={cx('tnum text-[11.5px]', filter === f.value ? 'text-bg/70' : 'text-fg-3')}>{counts[f.value]}</span>
          </button>
        ))}
      </div>


      {groups.length ? (
        groups.map((g) => (
          <Group key={g.key} icon={g.icon} title={g.title} count={g.items.length} note={g.note}>
            {g.items.map((i) => (
              <Row key={i.key} i={i} onOpen={() => setOpen(i)} onToggle={i.lib || i.agent ? (on) => toggle(i, on) : undefined} />
            ))}
          </Group>
        ))
      ) : (
        <div className="rounded-2xl border border-line bg-panel px-5 py-10 text-center text-[13.5px] text-fg-3">
          {words.length ? 'No skills match.' : filter === 'yours' ? 'None of your own yet. Write one with New skill, or approve one an agent suggests.' : 'No skills here yet.'}
        </div>
      )}
      {!agents && (filter === 'all' || filter === 'agents') && (
        <div className="flex items-center gap-2 px-1 text-[12.5px] text-fg-3">
          <Throbber /> Looking for Claude Code’s and Codex’s own skills…
        </div>
      )}
      {!!agents?.errors.length && (filter === 'all' || filter === 'agents') && (
        <p className="px-1 text-[12px] leading-snug break-words text-fg-3" title={agents.errors.join('\n')}>
          Some of the agents’ own skills could not be read: {agents.errors[0]}
        </p>
      )}

      {lib.removed.length > 0 && (filter === 'all' || filter === 'yours') && !words.length && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px] text-fg-3">
          <span>Removed:</span>
          {lib.removed.map((r) => (
            <button key={r.name} type="button" onClick={() => restore(r.name)} className="inline-flex items-center gap-1 hover:text-fg" title={`Removed ${ago(r.at)}. Bring it back`} translate="no">
              <RotateCcw size={12} /> {r.name}
            </button>
          ))}
        </div>
      )}

      {open && (
        <SkillDetail
          i={open}
          onClose={() => setOpen(null)}
          onToggle={open.lib || open.agent ? (on) => toggle(open, on) : undefined}
          onEdit={(doc) => (setOpen(null), setEditing({ doc }))}
          onEditFile={(p) => (setOpen(null), setFile(p))}
          onRemove={() => remove(open)}
        />
      )}
      {editing && (
        <SkillEditor
          doc={editing.doc}
          cwd={cwd}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadLib();
            loadAgents();
          }}
        />
      )}
      <EditorDialog path={file} onClose={() => (setFile(null), loadAgents())} />
      {how && <HowItWorks lib={lib} onClose={() => setHow(false)} />}
      {review && (
        <Dialog open onClose={() => setReview(null)} width={760} title={`${review.kind === 'new' ? 'New skill' : 'Change to'} ${review.name}`}>
          <ProposalPanel
            p={review}
            framed={false}
            onChange={(p) => {
              setReview(p.status === 'pending' ? p : null);
              loadLib();
            }}
          />
          <div className="h-3" />
        </Dialog>
      )}
      {confirmNode}
    </div>
  );
}

