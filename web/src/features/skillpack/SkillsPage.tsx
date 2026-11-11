// Settings → Skills: every skill agents can load, in one place. The library's (built in, your own, those of
// your plugins) reach every agent the app starts; Claude Code and Codex have their own folders of skills too,
// and spaces have skills of their own. Skills agents suggest wait at the top for your answer. A search, a
// row of filters and one menu; each skill opens to read, switch off, change or remove. A switch here is for
// every session; a space's Skills tab shows the same list for its own sessions (`space`), where a switch
// turns a skill on or off for them alone, with the space's own skills and those of the spaces it brings together.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookPlus,
  BrainCircuit,
  CalendarRange,
  ChartColumn,
  Code2,
  Copy,
  FilePen,
  FileText,
  FolderOpen,
  Globe,
  Info,
  ListChecks,
  Palette,
  PenLine,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
  Lightbulb,
} from 'lucide-react';
import {
  composeSkill,
  parseSkill,
  SKILL_CATEGORIES,
  switchKey,
  type LibrarySkill,
  type SkillDoc,
  type SkillLibrary,
  type SkillProposal,
  type SpaceSkill,
  type SpaceSkills,
} from '@shared/skillpack';
import type { Space } from '@shared/spaces';
import type { Agent, SkillEntry } from '@shared/types';
import { api, del, enc, post, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { ago, tildify } from '../../lib/format';
import { go, openSession, showInFiles } from '../../lib/nav';
import { toast, toastError, useApp, useSessions } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuSep, Segmented, Switch, Tabs, Throbber, useConfirm } from '../../components/ui';
import { EditorDialog } from '../settings/Instructions';
import { EmptyRow, Group, MoreMenu, Notice, Row, SectionActions, Stack } from '../settings/kit';
import { loadSpaces } from '../spaces/state';
import { ProposalPanel } from './ProposalCard';
import { SkillHistory, Triggers } from './SkillView';

// ---- what a skill is, wherever it comes from ----------------------------------------------------------

type Source = 'bundled' | 'learned' | 'plugin' | 'claude' | 'codex' | 'space';
type Filter = 'all' | 'builtin' | 'yours' | 'plugins' | 'agents' | 'spaces' | 'changed';

/** On a space's page: its switch for a skill, and how the skill is without it (as Settings has it, or on for its own). */
interface Here {
  name: string;
  agent?: 'claude' | 'codex';
  /** On without the space's switch. */
  usual: boolean;
  /** The space switches it. */
  set: boolean;
}

interface Item {
  key: string;
  name: string;
  description: string;
  source: Source;
  category?: string;
  on: boolean;
  lib?: LibrarySkill;
  agent?: SkillEntry;
  /** A space's own skill: which space. */
  space?: { id: string; name: string };
  /** On a space's page, one of its own skills. */
  own?: SpaceSkill;
  here?: Here;
  /** In Settings: the spaces that switch it the other way for their own sessions. */
  projects?: { id: string; name: string; on: boolean }[];
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

const agentOf = (s: SkillEntry): 'claude' | 'codex' => (s.agent === 'codex' ? 'codex' : 'claude');

/** Settings: every skill, each with the spaces that switch it the other way. */
function items(lib: SkillLibrary | null, agents: SkillEntry[] | null): Item[] {
  const out: Item[] = [];
  const switched = lib?.switched ?? [];
  const across = (key: string, on: boolean) => switched.flatMap((p) => (key in p.switches && p.switches[key] !== on ? [{ id: p.id, name: p.name, on: p.switches[key] }] : []));
  for (const s of lib?.skills ?? [])
    out.push({ key: `lib:${s.name}`, name: s.name, description: s.description, source: s.source, category: s.category, on: !s.off, lib: s, projects: across(s.name, !s.off) });
  for (const s of agents ?? [])
    out.push({ key: `${s.agent}:${s.path}`, name: s.name, description: s.description, source: agentOf(s), on: s.enabled, agent: s, projects: across(switchKey(s.name, agentOf(s)), s.enabled) });
  for (const g of lib?.spaces ?? [])
    for (const s of g.skills)
      out.push({ key: `space:${g.id}:${s.name}`, name: s.name, description: s.description, source: 'space', on: switched.find((p) => p.id === g.id)?.switches[s.name] !== false, space: { id: g.id, name: g.name } });
  return out;
}

/**
 * A space's page: the skills its sessions get. Its own first, then those of the spaces it brings together, each in
 * place of any of its name after it; the library's; Claude Code's and Codex's own for its folder. Each as the space
 * switches it, or else as Settings has it (its own skills: on).
 */
function spaceItems(sp: Space, lib: SkillLibrary | null, agents: SkillEntry[] | null, mine: SpaceSkills | null): Item[] {
  const sw = mine?.switches ?? {};
  const out: Item[] = [];
  const taken = new Set<string>();
  const here = (name: string, usual: boolean, agent?: 'claude' | 'codex'): Here => ({ name, agent, usual, set: switchKey(name, agent) in sw });
  for (const k of mine?.skills ?? []) {
    taken.add(k.name);
    out.push({ key: `own:${k.name}`, name: k.name, description: k.description, source: 'space', on: sw[k.name] ?? true, space: { id: sp.id, name: sp.name }, own: k, here: here(k.name, true) });
  }
  for (const m of mine?.members ?? [])
    for (const k of m.skills) {
      if (taken.has(k.name)) continue;
      taken.add(k.name);
      out.push({ key: `member:${m.id}:${k.name}`, name: k.name, description: k.description, source: 'space', on: sw[k.name] ?? true, space: { id: m.id, name: m.name }, here: here(k.name, true) });
    }
  for (const s of lib?.skills ?? [])
    if (!taken.has(s.name))
      out.push({ key: `lib:${s.name}`, name: s.name, description: s.description, source: s.source, category: s.category, on: sw[s.name] ?? !s.off, lib: s, here: here(s.name, !s.off) });
  for (const s of agents ?? []) {
    const a = agentOf(s);
    out.push({ key: `${s.agent}:${s.path}`, name: s.name, description: s.description, source: a, on: sw[switchKey(s.name, a)] ?? s.enabled, agent: s, here: here(s.name, s.enabled, a) });
  }
  return out;
}

const inFilter = (i: Item, f: Filter) =>
  f === 'all' ||
  (f === 'builtin' && i.source === 'bundled') ||
  (f === 'yours' && i.source === 'learned') ||
  (f === 'plugins' && i.source === 'plugin') ||
  (f === 'agents' && (i.source === 'claude' || i.source === 'codex')) ||
  (f === 'spaces' && i.source === 'space') ||
  (f === 'changed' && !!i.here?.set);

const used = (s: { uses: number; lastUsed?: number }) => (s.uses ? `Used ${s.uses === 1 ? 'once' : `${s.uses} times`}${s.lastUsed ? `, last ${ago(s.lastUsed)}` : ''}` : '');

/** "Off in Thesis", "On in 3 projects": the spaces that switch a skill the other way, in a few words. */
function inProjects(list: { name: string; on: boolean }[]): string {
  const on = list.filter((p) => p.on);
  const off = list.filter((p) => !p.on);
  return [
    on.length === 1 ? `On in ${on[0].name}` : on.length ? `On in ${on.length} projects` : '',
    off.length === 1 ? `Off in ${off[0].name}` : off.length ? `Off in ${off.length} projects` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

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
  if (i.own) return <>This project’s own</>;
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

/** A switch a space set the other way from how the skill is without it: "On here", "Off here". */
const switchedHere = (i: Item) => !!i.here?.set && i.on !== i.here.usual;

/** A skill's icon for a row's tile. */
function iconOf(i: Item): ReactNode {
  if (i.source === 'claude' || i.source === 'codex') return <AgentIcon agent={i.source} size={16} />;
  const C = i.source === 'plugin' && !i.category ? Puzzle : categoryOf(i.category).icon;
  return <C size={16} />;
}

/** The first rows a long group shows; the rest wait behind "Show all". */
const FIRST = 8;

function SkillRow({ i, onOpen, onToggle }: { i: Item; onOpen: () => void; onToggle?: (on: boolean) => void }) {
  const meta = [i.lib ? used(i.lib) : i.own ? used(i.own) : '', i.projects?.length ? inProjects(i.projects) : ''].filter(Boolean);
  const from = i.source !== 'bundled' && !i.own;
  return (
    <Row
      icon={iconOf(i)}
      label={
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <button type="button" onClick={onOpen} translate="no" className={cx('min-w-0 text-left font-medium hover:underline', !i.on && 'text-fg-2')}>
            {i.name}
          </button>
          {i.source === 'learned' && <Badge tone="ok">Yours</Badge>}
          {i.source === 'plugin' && <Badge tone="info">Plugin</Badge>}
          {i.own?.overrides && <Badge tone="info">In place of the library’s</Badge>}
          {switchedHere(i) ? <Badge tone={i.on ? 'ok' : 'neutral'}>{i.on ? 'On here' : 'Off here'}</Badge> : !i.on && <Badge>Off</Badge>}
        </span>
      }
      hint={
        <button type="button" onClick={onOpen} translate={i.source === 'bundled' ? undefined : 'no'} className="line-clamp-1 w-full text-left">
          {i.description}
        </button>
      }
      info={
        (from || meta.length > 0) && (
          <p>
            {from && <From i={i} />}
            {from && meta.length ? ' · ' : ''}
            {meta.join(' · ')}
          </p>
        )
      }
      control={onToggle && <Switch on={i.on} onChange={onToggle} label={i.on ? `Turn ${i.name} off` : `Turn ${i.name} on`} />}
    />
  );
}

/** A group's title with how many it holds. */
const titled = (title: ReactNode, n: number) => (
  <>
    <span>{title}</span> <span className="tnum font-normal text-fg-3">{n}</span>
  </>
);

/** Skills agents suggested, waiting for your yes. */
function Waiting({ list, onReview }: { list: SkillProposal[]; onReview: (p: SkillProposal) => void }) {
  const titles = useSessions((x) => x.byKey);
  return (
    <Group
      title={list.length === 1 ? 'An agent suggests a skill' : `Agents suggest ${list.length} skills`}
      info="After hard tasks, agents can offer to keep what they learned. Nothing is saved until you approve."
    >
      {list.map((p) => {
        const Icon = p.kind === 'new' ? BookPlus : FilePen;
        return (
          <Row
            key={p.id}
            icon={<Icon size={16} />}
            label={
              <>
                {p.kind === 'new' ? 'New skill: ' : 'Change to '}
                <span translate="no">{p.name}</span>
              </>
            }
            hint={
              <>
                {ago(p.createdAt)} ·{' '}
                <button type="button" onClick={() => openSession(p.key)} className="hover:text-fg hover:underline" translate="no">
                  {titles[p.key]?.title || 'its conversation'}
                </button>
                {p.findings.length ? ' · has warnings' : ''}
              </>
            }
            control={
              <Button size="sm" variant="primary" onClick={() => onReview(p)}>
                Review
              </Button>
            }
          />
        );
      })}
    </Group>
  );
}

// ---- reading a skill -----------------------------------------------------------------------------------

/**
 * A skill opened: what it says, where it comes from, and what you can do with it. On a space's page (`sp`), its
 * switch is the space's, and a library skill can be copied into the space to change for it alone.
 */
function SkillDetail({
  i,
  sp,
  onClose,
  onToggle,
  onReset,
  onEdit,
  onEditFile,
  onRemove,
  onCopy,
  onEditOwn,
}: {
  i: Item;
  sp?: Space;
  onClose: () => void;
  onToggle?: (on: boolean) => void;
  /** Back to how it is without the space's switch. */
  onReset?: () => void;
  onEdit: (doc: SkillDoc) => void;
  onEditFile: (path: string) => void;
  onRemove: () => void;
  /** A library skill copied into the space, to change for it alone. */
  onCopy?: () => void;
  /** One of the space's own skills, to change. */
  onEditOwn?: () => void;
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
        ? api<SkillDoc>(`/api/projects/${enc(i.space.id)}/skills/${enc(i.name)}`)
        : api<{ content: string | null }>(`/api/fs/read?path=${enc(i.agent!.path)}`).then((f) => ({ name: i.name, text: f.content ?? '', source: 'learned', file: i.agent!.path, history: [] }) as SkillDoc);
    load.then(
      (d) => alive && setDoc(d),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
    // The same skill as its switch changes: read once.
  }, [i.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const fm = doc ? parseSkill(doc.text) : null;
  const history = i.lib || i.space ? (doc?.history ?? []) : [];
  const actions: ReactNode[] = [];
  if (i.own && doc) {
    actions.push(
      <Button key="rm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemove}>
        Remove
      </Button>,
      <Button key="edit" icon={<PenLine size={14} />} onClick={onEditOwn}>
        Change
      </Button>,
    );
  } else if (sp && i.lib && doc) {
    actions.push(
      <Button key="copy" icon={<Copy size={14} />} onClick={onCopy} title="A copy of it becomes one of this project’s own skills, in its place for this project’s sessions; the library’s stays as it is">
        Change for this project
      </Button>,
    );
  } else if (i.source === 'learned' && doc) {
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
      <Button key="space" icon={<FolderOpen size={14} />} onClick={() => (onClose(), go(`/projects/${enc(i.space!.id)}/skills`))}>
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
          {i.own && used(i.own) && <span>{used(i.own)}</span>}
          <span className="flex-1" />
          {onToggle && (
            <span className="flex items-center gap-2 text-fg-2">
              {sp ? (i.on ? 'This project’s agents get it' : 'Off: this project’s agents do not get it') : i.on ? 'Agents get it' : 'Off: agents do not get it'}
              <Switch on={i.on} onChange={onToggle} label={i.on ? `Turn ${i.name} off` : `Turn ${i.name} on`} />
            </span>
          )}
        </div>
        {sp && i.here?.set && (i.lib || i.agent) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-bg-1 px-3 py-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">{i.here.usual ? 'Set for this project: Settings → Skills has it on for every other session.' : 'Set for this project: Settings → Skills has it off for every other session.'}</span>
            {onReset && (
              <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} onClick={onReset}>
                Follow Settings
              </Button>
            )}
          </div>
        )}
        {!sp && !!i.projects?.length && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-3">
            <span>Projects that switch it the other way for their sessions:</span>
            {i.projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => (onClose(), go(`/projects/${enc(p.id)}/skills`))}
                className="inline-flex h-6 items-center gap-1.5 rounded-full bg-bg-2 px-2.5 text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg"
              >
                <span translate="no">{p.name}</span>
                <span className="text-fg-3">{p.on ? 'On' : 'Off'}</span>
              </button>
            ))}
          </div>
        )}
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

/**
 * A new skill, or a change to one of yours (or your own version of one that is not): its words, in plain fields.
 * One for Claude Code or Codex alone goes in that agent's own folder, which it reads in every folder.
 */
export function SkillEditor({ doc, onClose, onSaved }: { doc?: SkillDoc; onClose: () => void; onSaved: (name: string) => void }) {
  const fm = doc ? parseSkill(doc.text) : null;
  const [name, setName] = useState(doc?.name ?? '');
  const [desc, setDesc] = useState(fm?.description ?? '');
  const [category, setCategory] = useState(fm?.category ?? '');
  const [body, setBody] = useState(fm?.body.replace(/^\s*\n/, '') ?? '');
  const [words, setWords] = useState(fm?.triggers.join(', ') ?? '');
  const [who, setWho] = useState<For>('all');
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
        await post('/api/setup/skills', { agent: who, name: slug, description: desc, scope: 'user', body });
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

/** "Citation style" → citation-style, as the server names a skill. */
const slugOf = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

/** A new skill of a space's own, or one of its skills to change (`name`): its name, when to use it, and the skill. */
function ProjectSkillEditor({ sp, name, onClose, onSaved }: { sp: Space; name?: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<{ name: string; description: string; body: string } | null>(name ? null : { name: '', description: '', body: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!name) return;
    api<SkillDoc>(`/api/projects/${enc(sp.id)}/skills/${enc(name)}`).then(
      (d) => {
        const fm = parseSkill(d.text);
        setForm({ name, description: fm.description ?? '', body: fm.body.replace(/^\s*\n/, '') });
      },
      (e) => (toastError(e), onClose()),
    );
  }, [sp.id, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !!form && !!slugOf(form.name) && !!form.description.trim() && !!form.body.trim() && !busy;
  const save = async () => {
    if (!form || !ready) return;
    setBusy(true);
    try {
      const body = { ...form, name: slugOf(form.name) };
      await (name ? put(`/api/projects/${enc(sp.id)}/skills/${enc(name)}`, body) : post(`/api/projects/${enc(sp.id)}/skills`, body));
      onSaved();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={700}
      title={name ? `Change ${name}` : 'New skill for this project'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!ready} icon={busy ? <Throbber /> : undefined}>
            {name ? 'Save' : 'Add the skill'}
          </Button>
        </>
      }
    >
      {!form ? (
        <div className="flex justify-center py-10 text-fg-3">
          <Throbber size={24} />
        </div>
      ) : (
        <div className="space-y-3.5">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Name</span>
            <input
              autoFocus={!name}
              className={cx(inputCls, 'font-mono text-[13.5px]')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onBlur={() => setForm({ ...form, name: slugOf(form.name) })}
              placeholder="citation-style"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">When to use it</span>
            <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Use when citing a source in the thesis" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">The skill</span>
            <textarea
              rows={12}
              spellCheck={false}
              className={cx(inputCls, 'h-auto resize-y py-2 font-mono text-[13px] leading-relaxed')}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="The steps in order, the checks, and the mistakes to avoid"
            />
          </label>
        </div>
      )}
    </Dialog>
  );
}

/** How agents get skills, for those who want to know; on a space's page, how its skills work. */
function HowItWorks({ lib, sp, onClose }: { lib: SkillLibrary; sp?: Space; onClose: () => void }) {
  const home = useApp((s) => s.boot?.home);
  if (sp)
    return (
      <Dialog open onClose={onClose} width={560} title="How a project’s skills work" footer={<Button onClick={onClose}>Close</Button>}>
        <div className="space-y-3 pb-2 text-[13.5px] leading-relaxed text-fg-2">
          <p>
            This page lists every skill this project’s sessions get: its own, those of the projects it brings together if it is a group, the skill library’s (built in, yours, your plugins’), and
            Claude Code’s and Codex’s own for its folder.
          </p>
          <p>
            A switch here turns a skill on or off for this project’s sessions alone, whatever Settings → Skills says for every other session. A skill switched the other way says On here or Off here. Switch
            it back, or click Follow Settings in its window, and it follows Settings again.
          </p>
          <p>
            Its own skills take the place of any skill of the same name, and only its sessions get them. To change a library skill for this project alone, open it and click Change for this project: a copy
            becomes one of the project’s own.
          </p>
          <p>A new session gets the switches as they are when it starts; one already going keeps what it started with (Custom follows them from its next turn).</p>
        </div>
      </Dialog>
    );
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
        <p>
          The switches here are for every session. A project can have skills of its own, which only its sessions get, and switch any skill on or off for its own sessions: on the project’s page, its
          Skills tab.
        </p>
        <p>
          When a session starts with a message, its agent also hears which skills fit that message, if any clearly do: found by their words and, with search by meaning on in Settings → Memory, by
          what they mean. Turn it off with Suggest skills that fit, in this page’s ⋯ menu.
        </p>
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
/** On a space's page: its own first, and the ones it switched. */
const SPACE_FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'spaces', label: 'Its own' },
  { value: 'builtin', label: 'Built in' },
  { value: 'yours', label: 'Yours' },
  { value: 'plugins', label: 'From plugins' },
  { value: 'agents', label: 'Claude Code and Codex' },
  { value: 'changed', label: 'Changed here' },
];

/**
 * Settings → Skills (every session), or with `space` a space's Skills tab: the skills its sessions get, each with
 * a switch for them alone.
 */
export function SkillsSettings({ space: sp }: { space?: Space } = {}) {
  const home = useApp((s) => s.boot?.home);
  // Settings lists the agents' own skills for every folder (your home folder's); a space's, for its folder too.
  const cwd = sp ? sp.folder : (home ?? '');
  const spId = sp?.id;
  const [lib, setLib] = useState<SkillLibrary | null>(null);
  const [agents, setAgents] = useState<{ skills: SkillEntry[]; errors: string[] } | null>(null);
  const [mine, setMine] = useState<SpaceSkills | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ doc?: SkillDoc } | null>(null);
  const [ownEdit, setOwnEdit] = useState<{ name?: string } | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [review, setReview] = useState<SkillProposal | null>(null);
  const [how, setHow] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, confirmNode] = useConfirm();

  const loadLib = useCallback(() => api<SkillLibrary>('/api/skillpack').then(setLib, toastError), []);
  const loadAgents = useCallback(
    () =>
      api<{ skills: SkillEntry[]; errors: string[] }>(`/api/setup/skills${cwd ? `?cwd=${enc(cwd)}` : ''}`).then(setAgents, (e: Error) => setAgents({ skills: [], errors: [e.message] })),
    [cwd],
  );
  const loadMine = useCallback(() => (spId ? api<SpaceSkills>(`/api/projects/${enc(spId)}/skills`).then(setMine, toastError) : Promise.resolve()), [spId]);
  useEffect(() => {
    loadLib();
  }, [loadLib]);
  useEffect(() => {
    setAgents(null);
    loadAgents();
  }, [loadAgents]);
  useEffect(() => {
    setMine(null);
    void loadMine();
  }, [loadMine]);
  // A suggestion answered in a conversation, a new one, a skill saved, a plugin turned on, a project's switch: the list follows.
  useFeatureEvent('skillpack', () => {
    loadLib();
    void loadMine();
  });
  useFeatureEvent('plugins', (e) => {
    if ((e as { changed?: boolean })?.changed) loadLib();
  });
  const ownChanged = () => {
    void loadMine();
    loadSpaces();
  };

  const all = useMemo(() => (sp ? spaceItems(sp, lib, agents?.skills ?? null, mine) : items(lib, agents?.skills ?? null)), [sp, lib, agents, mine]);
  const filters = sp ? SPACE_FILTERS : FILTERS;
  const counts = useMemo(() => Object.fromEntries(filters.map((f) => [f.value, all.filter((i) => inFilter(i, f.value)).length])) as Record<Filter, number>, [all, filters]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((i) => inFilter(i, filter) && words.every((w) => `${i.name} ${i.description} ${i.lib?.plugin?.title ?? ''} ${i.space?.name ?? ''}`.toLowerCase().includes(w)));
  const open = openKey ? (all.find((i) => i.key === openKey) ?? null) : null;
  const switched = Object.keys(mine?.switches ?? {}).length;

  // Grouped: on a space's page its own first, then those of the spaces it brings together; the library's by what
  // they are for; each agent's own; in Settings, each space's own.
  const groups = useMemo(() => {
    const out: { key: string; title: ReactNode; items: Item[]; info?: ReactNode; empty?: boolean }[] = [];
    if (sp) {
      const own = shown.filter((i) => i.own);
      const empty = !own.length && !words.length && (filter === 'all' || filter === 'spaces');
      if (own.length || empty)
        out.push({
          key: 'own',
          title: 'Its own',
          items: own,
          info: (
            <>
              <p>Only this project’s sessions get these, each in place of any skill of the same name.</p>
              <p>To change a skill below for this project alone, open it and click Change for this project. Agents working in the project can propose one too, after a task that took real effort.</p>
            </>
          ),
          empty,
        });
      const members = new Map<string, Item[]>();
      for (const i of shown.filter((x) => x.space && !x.own)) members.set(i.space!.id, [...(members.get(i.space!.id) ?? []), i]);
      for (const [id, list] of members)
        out.push({
          key: `m:${id}`,
          title: <span translate="no">{list[0].space!.name}</span>,
          items: list,
          info: 'A project this one brings together: its own skills, which this project’s sessions get too. Change them on its page.',
        });
    }
    const library = shown.filter((i) => i.lib);
    const order = [...Object.keys(SKILL_CATEGORIES), ''];
    for (const c of order) {
      const list = library.filter((i) => (i.category && i.category in SKILL_CATEGORIES ? i.category : '') === c).sort((a, b) => a.name.localeCompare(b.name));
      if (!list.length) continue;
      out.push({ key: `c:${c}`, title: categoryLabel(c), items: list });
    }
    for (const a of ['claude', 'codex'] as const) {
      const list = shown.filter((i) => i.source === a);
      if (list.length)
        out.push({
          key: a,
          title: `${agentName(a)}’s own`,
          items: list.sort((x, y) => x.name.localeCompare(y.name)),
          info: sp
            ? a === 'claude'
              ? 'In Claude Code’s own folder and this project’s folder: only Claude Code sessions get them.'
              : 'Codex’s own for this project’s folder, and the ones it comes with: only Codex sessions get them.'
            : a === 'claude'
              ? 'In Claude Code’s own folder: only Claude Code sessions get them. A project’s folder can have more: see them on its Skills tab.'
              : 'In Codex’s own folders, and the ones it comes with: only Codex sessions get them.',
        });
    }
    if (!sp) {
      const spaces = new Map<string, Item[]>();
      for (const i of shown.filter((x) => x.space)) spaces.set(i.space!.id, [...(spaces.get(i.space!.id) ?? []), i]);
      for (const [id, list] of spaces)
        out.push({ key: `s:${id}`, title: <span translate="no">{list[0].space!.name}</span>, items: list, info: 'Only this project’s sessions get these. Change them on the project’s page.' });
    }
    return out;
  }, [shown, sp, filter, words.length]);

  /** A switch: in Settings, for every session; on a space's page, for its sessions alone (back to Settings' say when it matches). */
  const toggle = async (i: Item, on: boolean) => {
    if (sp && i.here) {
      const h = i.here;
      const value = on === h.usual ? null : on;
      const key = switchKey(h.name, h.agent);
      setMine((m) => {
        if (!m) return m;
        const switches = { ...m.switches };
        if (value === null) delete switches[key];
        else switches[key] = value;
        return { ...m, switches };
      });
      try {
        const r = await put<{ switches: Record<string, boolean> }>(`/api/projects/${enc(sp.id)}/skill-switches`, { name: h.name, agent: h.agent ?? null, on: value });
        setMine((m) => m && { ...m, switches: r.switches });
      } catch (e) {
        toastError(e);
        void loadMine();
      }
      return;
    }
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

  const resetAll = async () => {
    if (!sp) return;
    const ok = await confirm({
      title: 'Reset this project’s switches?',
      body: 'Every skill goes back to what Settings → Skills says for every session, and its own skills are on again.',
      confirm: 'Reset',
    });
    if (!ok) return;
    try {
      await del(`/api/projects/${enc(sp.id)}/skill-switches`);
      setMine((m) => m && { ...m, switches: {} });
      toast('Every skill is as Settings has it', 'ok');
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (i: Item) => {
    if (sp && i.own) {
      const ok = await confirm({
        title: `Remove ${i.name}?`,
        body: i.own.overrides ? 'The project’s sessions go back to the library’s skill of that name. You can bring this one back from this tab.' : 'The project’s sessions stop seeing it. You can bring it back from this tab.',
        confirm: 'Remove',
        danger: true,
      });
      if (!ok) return;
      try {
        await del(`/api/projects/${enc(sp.id)}/skills/${enc(i.name)}`);
        toast(`Removed ${i.name}`, 'ok');
      } catch (e) {
        toastError(e);
      }
      ownChanged();
    } else if (i.lib) {
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
        await post('/api/setup/skills/delete', { agent: i.agent.agent, path: i.agent.path, ...(cwd ? { cwd } : {}) });
        toast(`Deleted ${i.name}`, 'ok');
      } catch (e) {
        toastError(e);
      }
      loadAgents();
    }
    setOpenKey(null);
  };

  /** A library skill copied into the space, then open to change for it alone. */
  const copy = async (i: Item) => {
    if (!sp) return;
    try {
      await post(`/api/projects/${enc(sp.id)}/skills`, { from: i.name });
      setOpenKey(null);
      ownChanged();
      setOwnEdit({ name: i.name });
    } catch (e) {
      toastError(e);
    }
  };

  const restore = async (name: string) => {
    try {
      await post(sp ? `/api/projects/${enc(sp.id)}/skills/${enc(name)}/restore` : `/api/skillpack/skills/${enc(name)}/restore`);
      toast(`${name} is back`, 'ok');
    } catch (e) {
      toastError(e);
    }
    if (sp) ownChanged();
    else loadLib();
  };

  const setTriggers = (on: boolean) => {
    if (!lib) return;
    setLib({ ...lib, triggers: on });
    put('/api/skillpack/settings', { triggers: on }).catch((e) => (toastError(e), loadLib()));
  };
  const setSuggest = (on: boolean) => {
    if (!lib) return;
    setLib({ ...lib, suggest: on });
    put('/api/skillpack/settings', { suggest: on }).catch((e) => (toastError(e), loadLib()));
  };

  const loading = !lib || (sp && !mine);
  const removed = sp ? (mine?.removed ?? []) : (lib?.removed ?? []);
  const removedShown = removed.length > 0 && (filter === 'all' || filter === (sp ? 'spaces' : 'yours')) && !words.length;
  const newSkill = (
    <Button size="sm" variant="primary" icon={<Plus size={14} />} disabled={loading} onClick={() => (sp ? setOwnEdit({}) : setEditing({}))}>
      New skill
    </Button>
  );
  const more = (
    <MoreMenu width={290}>
      {(close) =>
        sp ? (
          <>
            <MenuItem icon={<Undo2 size={14} />} disabled={!switched} onClick={() => (close(), void resetAll())}>
              Reset every switch here
            </MenuItem>
            <MenuItem icon={<Settings2 size={14} />} onClick={() => (close(), go('/settings?s=skills'))}>
              Skills for every project
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Info size={14} />} onClick={() => (close(), setHow(true))}>
              How a project’s skills work
            </MenuItem>
          </>
        ) : (
          lib && (
            <>
              <MenuItem icon={<Lightbulb size={14} />} checked={lib.suggest} onClick={() => (close(), setSuggest(!lib.suggest))}>
                Suggest skills that fit
              </MenuItem>
              <MenuItem icon={<Sparkles size={14} />} checked={lib.triggers} onClick={() => (close(), setTriggers(!lib.triggers))}>
                Bring skills in by keywords
              </MenuItem>
              <MenuItem icon={<FolderOpen size={14} />} onClick={() => (close(), go(`/files?dir=${enc(lib.folders.learned)}`))}>
                Your skills folder
              </MenuItem>
              <MenuItem icon={<Puzzle size={14} />} onClick={() => (close(), go('/settings?s=plugins'))}>
                Get more with plugins
              </MenuItem>
              <MenuSep />
              <MenuItem icon={<Info size={14} />} onClick={() => (close(), setHow(true))}>
                How agents get skills
              </MenuItem>
            </>
          )
        )
      }
    </MoreMenu>
  );
  const shownFilters = filters.filter((f) => f.value === 'all' || counts[f.value] > 0 || filter === f.value || (sp && f.value === 'spaces'));

  return (
    <Stack>
      {!sp && (
        <SectionActions>
          {newSkill}
          {more}
        </SectionActions>
      )}
      {!sp && lib && lib.pending.length > 0 && <Waiting list={lib.pending} onReview={setReview} />}
      {sp && <p className="text-[13px] leading-snug text-fg-3">The skills this project’s sessions get. A switch here is for this project alone.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            placeholder={loading ? 'Search skills' : `Search ${all.length} skills`}
            className={cx(inputCls, 'h-8 pr-8 pl-9 text-[13px]')}
          />
          {q && (
            <span className="absolute top-1/2 right-1 -translate-y-1/2">
              <IconButton label="Clear search" size="sm" onClick={() => setQ('')}>
                <X size={14} />
              </IconButton>
            </span>
          )}
        </div>
        <div className="max-w-full overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <div className="w-max">
            <Segmented size="sm" value={filter} onChange={setFilter} options={shownFilters.map((f) => ({
                value: f.value,
                label: (
                  <>
                    {f.label}
                    {!!counts[f.value] && <span className="tnum font-normal text-fg-3">{counts[f.value]}</span>}
                  </>
                ),
              }))} />
          </div>
        </div>
        {sp && (
          <div className="flex items-center gap-1">
            {newSkill}
            {more}
          </div>
        )}
      </div>

      {loading ? (
        <Group>
          <div className="flex justify-center px-4 py-6">
            <Throbber className="text-fg-3" />
          </div>
        </Group>
      ) : groups.length ? (
        groups.map((g) => {
          const full = !!words.length || expanded.has(g.key);
          const list = full ? g.items : g.items.slice(0, FIRST);
          return (
            <Group key={g.key} title={titled(g.title, g.items.length)} info={g.info}>
              {g.empty && sp ? (
                <EmptyRow
                  action={
                    <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setOwnEdit({})}>
                      New skill
                    </Button>
                  }
                >
                  None yet: skills only this project’s sessions get, for how its work is done.
                </EmptyRow>
              ) : (
                <>
                  {list.map((i) => (
                    <SkillRow key={i.key} i={i} onOpen={() => setOpenKey(i.key)} onToggle={sp ? (i.here ? (on) => void toggle(i, on) : undefined) : i.lib || i.agent ? (on) => void toggle(i, on) : undefined} />
                  ))}
                  {list.length < g.items.length && (
                    <button type="button" onClick={() => setExpanded((e) => new Set(e).add(g.key))} className="block w-full rounded-b-[11px] px-4 py-2.5 text-center text-[13px] text-fg-2 transition-colors hover:bg-bg-1 hover:text-fg">
                      Show all {g.items.length}
                    </button>
                  )}
                </>
              )}
            </Group>
          );
        })
      ) : (
        <Group>
          <EmptyRow>
            {words.length
              ? 'No skills match.'
              : filter === 'changed'
                ? 'Nothing switched here yet: every skill is as Settings → Skills has it.'
                : filter === 'yours'
                  ? 'None of your own yet. Write one with New skill, or approve one an agent suggests.'
                  : 'No skills here yet.'}
          </EmptyRow>
        </Group>
      )}
      {!loading && !agents && (filter === 'all' || filter === 'agents') && (
        <div className="flex items-center gap-2 px-1 text-[12.5px] text-fg-3">
          <Throbber /> Looking for Claude Code’s and Codex’s own skills…
        </div>
      )}
      {!!agents?.errors.length && (filter === 'all' || filter === 'agents') && (
        <Notice tone="warn">
          <span title={agents.errors.join('\n')}>Some of the agents’ own skills could not be read: {agents.errors[0]}</span>
        </Notice>
      )}

      {removedShown && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px] text-fg-3">
          <span>Removed:</span>
          {removed.map((r) => (
            <button key={r.name} type="button" onClick={() => void restore(r.name)} className="inline-flex items-center gap-1 hover:text-fg" title={`Removed ${ago(r.at)}. Bring it back`} translate="no">
              <RotateCcw size={12} /> {r.name}
            </button>
          ))}
        </div>
      )}

      {open && (
        <SkillDetail
          i={open}
          sp={sp}
          onClose={() => setOpenKey(null)}
          onToggle={sp ? (open.here ? (on) => void toggle(open, on) : undefined) : open.lib || open.agent ? (on) => void toggle(open, on) : undefined}
          onReset={open.here ? () => void toggle(open, open.here!.usual) : undefined}
          onEdit={(doc) => (setOpenKey(null), setEditing({ doc }))}
          onEditFile={(p) => (setOpenKey(null), setFile(p))}
          onRemove={() => void remove(open)}
          onCopy={() => void copy(open)}
          onEditOwn={() => (setOpenKey(null), setOwnEdit({ name: open.name }))}
        />
      )}
      {editing && (
        <SkillEditor
          doc={editing.doc}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadLib();
            loadAgents();
          }}
        />
      )}
      {sp && ownEdit && <ProjectSkillEditor sp={sp} name={ownEdit.name} onClose={() => setOwnEdit(null)} onSaved={ownChanged} />}
      <EditorDialog path={file} onClose={() => (setFile(null), loadAgents())} />
      {how && lib && <HowItWorks lib={lib} sp={sp} onClose={() => setHow(false)} />}
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
    </Stack>
  );
}
