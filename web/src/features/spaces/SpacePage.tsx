// What a project's details window shows (ProjectDialog.tsx holds it over the page). At the top, in the project's colour:
// its mark, name and what it is about, New session, one menu (open its folder in Files, show only its sessions in the
// sidebar, share it with people, delete it) and Close; its tabs under them. Overview: its sessions, who it is shared
// with (ShareDialog.tsx) and what every session in it gets (its folder, guidelines, memory, skills and assistant), with a
// group's projects. Then its files (SpaceFiles: its folder, and the things kept in it), its
// memory (memory/ProjectMemory: its notes, its wiki memory and its own documents in one list), its skills
// (SpaceSkills), its agents and its settings. The tabs change in the window, not the address. It shows at once from the
// projects the app knows, and fills in what it fetches.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bot, Boxes, Brain, Check, ChevronRight, FolderOpen, LayoutDashboard, MessagesSquare, ScrollText, Settings, Sparkles, SquarePen, Trash2, UserRound, X } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { isGroup, MAX_SPACE_INSTRUCTIONS, SPACE_COLORS, spaceColor, type Space, type SpaceView } from '@shared/spaces';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Empty, IconButton, inputCls, Segmented, Switch, Tabs, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { api, enc, patch } from '../../lib/api';
import { tildify, timeAgo } from '../../lib/format';
import { closeProject, go, openProject, openSession, type ProjectPart, type ProjectTab } from '../../lib/nav';
import { toastError, useApp, useSessions } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { AgentsBoard } from '../assistants/AgentsBoard';
import { AssistantIcon } from '../assistants/icons';
import { useAssistantsState } from '../assistants/state';
import { useKnowledge } from '../knowledge/parts';
import { ActivityText } from '../sessions/SessionList';
import { MemberPicker, memberNames, SpaceMark, startInSpace } from './parts';
import { deleteSpace, SpaceMenu } from './ProjectMenu';
import { activityText, PersonMark, useShares } from './ShareDialog';
import { openShareDialog } from './ShareHost';
import { RecentFiles } from './RecentFiles';
import { SpaceFiles } from './SpaceFiles';
import { SpaceSkillsTab } from './SpaceSkills';
import { DEFAULT_WIKI_DOCUMENTS } from '@shared/wiki';
import { DocumentLimit } from '../wiki/DocumentLimit';
import { useSpaceMemory, useWikiSettings, type SpaceMemory } from '../wiki/spaceMemory';
import { ProjectMemory } from './memory/ProjectMemory';
import { loadSpaces, useSpaces } from './state';

export type SpaceTab = ProjectTab;

/** The kinds the Memory tab's chips narrow its list to: all first. */
export type MemoryPart = ProjectPart;

const plural = (n: number, one: string, many: string) => tr(`${n} ${n === 1 ? one : many}`);

// ---- pieces ----------------------------------------------------------------------------------------------------

/** A part of the tab: its title (and how many it holds), what leads further, and what it holds. */
export function Card({ title, count, action, children, className }: { title: ReactNode; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 overflow-hidden rounded-2xl border border-line bg-panel', className)}>
      <header className="flex min-h-12 items-center gap-2 px-4 py-2.5">
        <h2 className="min-w-0 truncate text-[14.5px] font-semibold tracking-tight">{title}</h2>
        {!!count && <span className="tnum shrink-0 rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3">{count}</span>}
        <span className="flex-1" />
        {action}
      </header>
      {children}
    </section>
  );
}

/** The quiet link at a card's top right: "All 12", "Share". */
export function CardLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-fg-3 hover:bg-bg-2 hover:text-fg">
      {children}
    </button>
  );
}

/** Nothing here yet: what will be, and the way to start it. */
function Blank({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 pt-6 pb-7 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-bg-2 text-fg-2">{icon}</span>
      <div className="mt-3 text-[14px] font-semibold">{title}</div>
      <div className="mt-1 max-w-[420px] text-[13px] leading-relaxed text-fg-3">{children}</div>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** One thing every session in the space gets: what it is, what it says, and where to change it. */
function Fact({ icon, label, children, onClick }: { icon: ReactNode; label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-fg-3">{label}</span>
        <span className="block text-[13.5px] leading-snug text-fg">{children}</span>
      </span>
      <ChevronRight size={15} className="mt-2 shrink-0 text-fg-3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}

// ---- the top --------------------------------------------------------------------------------------------------

/** How much the project remembers: notes, wiki articles and documents (what is loaded so far). */
const memoryTotal = (m: SpaceMemory, view?: SpaceView) => (m.notes ?? 0) + (m.wiki?.on ? (m.wiki.articles?.length ?? 0) : 0) + (view?.docs ?? 0) || undefined;

/** Its mark, name and what it is about over a wash of its colour, New session, its menu and Close, and its tabs. */
function Top({ s, view, tab, onTab, memory }: { s: Space; view?: SpaceView; tab: SpaceTab; onTab: (t: SpaceTab) => void; memory: SpaceMemory }) {
  const spaces = useSpaces();
  const home = useApp((x) => x.boot?.home);
  const wide = useMediaQuery('(min-width: 640px)');
  const group = isGroup(s);
  const c = spaceColor(s);
  return (
    <header className="relative shrink-0 border-b border-line pt-[var(--safe-top)] sm:pt-0">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${c} 15%, transparent), color-mix(in oklab, ${c} 3%, transparent))` }} />
      <div className="relative flex items-center gap-2 px-3 pt-3 sm:gap-3 sm:px-6 sm:pt-5">
        <SpaceMark s={s} size={wide ? 46 : 34} className="rounded-[12px] max-sm:rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <h1 translate="no" className="truncate text-[17px] leading-tight font-semibold tracking-tight sm:text-[21px]">
            {s.name}
          </h1>
          <div translate={group ? undefined : 'no'} className="mt-0.5 truncate text-[12.5px] text-fg-3 sm:text-[13.5px]" title={group ? undefined : s.description || s.folder}>
            {group ? tr(`Brings together ${memberNames(s, spaces)}`) : s.description || tildify(s.folder, home)}
          </div>
        </div>
        <Button size="sm" variant="primary" icon={<SquarePen size={14} />} onClick={() => startInSpace(s)} title={tr(`New session in ${s.name}`)} className="max-sm:w-8 max-sm:px-0">
          <span className="max-sm:hidden">New session</span>
        </Button>
        <SpaceMenu s={s} />
        <IconButton label="Close" onClick={closeProject}>
          <X size={18} />
        </IconButton>
      </div>
      {/* The tabs that do not fit (on a phone) are under More at the row's end; the open one's line lies on the border. */}
      <div className="relative -mb-px px-1.5 pt-1 sm:px-4 sm:pt-3">
        <Tabs
          value={tab}
          dense={!wide}
          fold
          onChange={onTab}
          options={[
            { value: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
            { value: 'files', label: 'Files', icon: <FolderOpen size={15} /> },
            { value: 'memory', label: 'Memory', count: wide ? memoryTotal(memory, view) : undefined, icon: <Brain size={15} /> },
            { value: 'skills', label: 'Skills', count: wide ? view?.skills : undefined, icon: <Sparkles size={15} /> },
            { value: 'agents', label: 'Agents', icon: <Bot size={15} /> },
            { value: 'settings', label: 'Settings', icon: <Settings size={15} /> },
          ]}
        />
      </div>
    </header>
  );
}

// ---- Overview ----------------------------------------------------------------------------------------------------

/** How many of a space's sessions the overview lists before All. */
const RECENT = 6;

/** Its sessions, who it is shared with, and what every session in it gets. */
function OverviewTab({ s, view, keys, memory, onTab }: { s: Space; view?: SpaceView; keys?: string[]; memory: SpaceMemory; onTab: (t: SpaceTab) => void }) {
  const home = useApp((x) => x.boot?.home);
  const byKey = useSessions((x) => x.byKey);
  const spaces = useSpaces();
  const assistants = useAssistantsState()?.assistants ?? [];
  const [all, setAll] = useState(false);
  // Those the server listed, and any started or moved here since (the session list keeps up), the last at work first.
  const sessions = useMemo(() => {
    const out = new Map<string, SessionSummary>();
    for (const k of keys ?? []) if (byKey[k] && !byKey[k].subagentOf) out.set(k, byKey[k]);
    for (const x of Object.values(byKey)) if (x.extra?.space === s.id && !x.subagentOf) out.set(x.key, x);
    return [...out.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [byKey, keys, s.id]);
  const shown = all ? sessions : sessions.slice(0, RECENT);
  const to = onTab;
  const assistant = assistants.find((a) => a.id === s.assistant)?.name;
  const others = s.folders?.length ?? 0;
  const members = (s.members ?? []).map((id) => spaces?.find((x) => x.id === id)).filter((x): x is SpaceView => !!x);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <Card title="Sessions" count={sessions.length} action={sessions.length > RECENT && <CardLink onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : tr(`All ${sessions.length}`)}</CardLink>}>
          {sessions.length ? (
            <div className="divide-y divide-line border-t border-line">
              {shown.map((x) => (
                <button key={x.key} type="button" onClick={() => openSession(x.key)} className="flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-1">
                  <AgentIcon agent={x.agent} name={x.acpName} size={15} />
                  <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px]">
                    {x.title}
                  </span>
                  <ActivityText s={x} className="max-w-[35%] shrink-0 text-[12px] max-sm:hidden" />
                  <span className="tnum shrink-0 text-[12px] text-fg-3">{timeAgo(x.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : !keys ? (
            <div className="flex justify-center border-t border-line py-6 text-fg-3">
              <Throbber size={22} />
            </div>
          ) : (
            <div className="border-t border-line">
              <Blank
                icon={<MessagesSquare size={19} />}
                title="No sessions yet"
                action={
                  <Button size="sm" variant="primary" icon={<SquarePen size={14} />} onClick={() => startInSpace(s)}>
                    New session
                  </Button>
                }
              >
                A new one works in this project’s folder, with its guidelines, documents and skills.
              </Blank>
            </div>
          )}
        </Card>
        <RecentFiles
          s={s}
          card={(count, body) => (
            <Card title="Files" count={count} action={<CardLink onClick={() => to('files')}>All files</CardLink>}>
              {body}
            </Card>
          )}
        />
      </div>
      <aside className="min-w-0 space-y-5">
        <SharedWith s={s} />
        <Card title="Every session here">
          <div className="divide-y divide-line border-t border-line">
            <Fact icon={<FolderOpen size={16} />} label="Folder" onClick={() => to('files')}>
              <span translate="no" className="block truncate" title={s.folder}>
                {tildify(s.folder, home)}
              </span>
              {others > 0 && <span className="block text-fg-3">{tr(`and ${others} more ${others === 1 ? 'folder' : 'folders'}`)}</span>}
            </Fact>
            <Fact icon={<ScrollText size={16} />} label="Guidelines" onClick={() => to('settings')}>
              {s.instructions?.trim() ? (
                <span translate="no" className="line-clamp-3 text-fg-2">
                  {s.instructions.trim()}
                </span>
              ) : (
                <span className="text-fg-3">Nothing yet: add its guidelines</span>
              )}
            </Fact>
            <Fact icon={<Brain size={16} />} label="Memory" onClick={() => to('memory')}>
              {memorySummary(memory, view) || <span className="text-fg-3">Nothing yet</span>}
              {s.sharedKnowledge === false && <span className="block text-fg-3">Not the shared knowledge</span>}
            </Fact>
            <Fact icon={<Sparkles size={16} />} label="Skills" onClick={() => to('skills')}>
              {view?.skills ? plural(view.skills, 'skill', 'skills') : <span className="text-fg-3">None of its own</span>}
            </Fact>
            <Fact icon={<UserRound size={16} />} label="Starts as" onClick={() => to('settings')}>
              {assistant ? <span translate="no">{assistant}</span> : <span className="text-fg-3">The agent picked on the start page</span>}
            </Fact>
          </div>
        </Card>
        {members.length > 0 && (
          <Card title="The projects it brings together" count={members.length}>
            <div className="divide-y divide-line border-t border-line">
              {members.map((m) => (
                <button key={m.id} type="button" onClick={() => openProject(m.id)} className="flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-1">
                  <SpaceMark s={m} size={26} className="rounded-[8px]" />
                  <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                    {m.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-fg-3">{plural(m.sessions, 'session', 'sessions')}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </aside>
    </div>
  );
}

/** "12 notes · 8 articles · 5 documents": what the project remembers, as far as it is known (articles only while wiki memory is on; none of a kind, none shown). */
function memorySummary(m: SpaceMemory, view?: SpaceView) {
  const parts: string[] = [];
  if (m.notes) parts.push(plural(m.notes, 'note', 'notes'));
  const articles = m.wiki?.on ? (m.wiki.articles?.length ?? 0) : 0;
  if (articles) parts.push(plural(articles, 'article', 'articles'));
  if (view?.docs) parts.push(plural(view.docs, 'document', 'documents'));
  return parts.join(' · ');
}

/** Who the project is shared with (ShareDialog.tsx), each with what they did last; nothing while it is shared with no one. */
function SharedWith({ s }: { s: Space }) {
  const { shares } = useShares(s.id);
  if (!shares?.length) return null;
  return (
    <Card title="Shared with" count={shares.length} action={<CardLink onClick={() => openShareDialog(s)}>Share</CardLink>}>
      <div className="divide-y divide-line border-t border-line">
        {shares.map((sh) => (
          <button key={sh.id} type="button" onClick={() => openShareDialog(s)} className="flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-1">
            <PersonMark name={sh.name} size={28} />
            <span className="min-w-0 flex-1">
              <span translate="no" className="block truncate text-[13.5px] font-medium">
                {sh.name}
              </span>
              <span className="block truncate text-[12px] text-fg-3">{activityText(sh)}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---- Settings ----------------------------------------------------------------------------------------------------

/** One part of a space's settings: what it is on the left (above, on a phone), its fields on the right. */
function Row({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-3 px-4 py-5 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)] sm:gap-8 sm:px-6">
      <div>
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {sub && <p className="mt-1 text-[12.5px] leading-snug text-fg-3">{sub}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

/** A choice of several shown at once, as a chip: an assistant, or none. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cx(
        'flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
        on ? 'border-accent/50 bg-accent-soft text-fg' : 'border-line bg-bg-1 text-fg-2 hover:bg-bg-2 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

/** The space itself: its name, what it is about, its colour, what its agents follow, the assistant they start as, its group. */
function SettingsTab({ s, onSaved, onWikiChanged }: { s: Space; onSaved: (next: Space) => void; onWikiChanged: () => void }) {
  const [form, setForm] = useState<Partial<Space>>(s);
  const [confirm, confirmNode] = useConfirm();
  const assistants = useAssistantsState()?.assistants ?? [];
  const spaces = useSpaces();
  // A space in a group stays a plain space (groups are one level deep).
  const inGroups = (spaces ?? []).filter((x) => x.members?.includes(s.id));
  useEffect(() => setForm(s), [s]);
  const sameMembers = (form.members ?? []).join() === (s.members ?? []).join();
  const dirty = !sameMembers || (['name', 'description', 'instructions', 'assistant', 'color'] as const).some((k) => (form[k] ?? '') !== (s[k] ?? ''));
  const color = form.color ?? s.color;
  const wikiDefault = useWikiSettings()?.enabled ?? true;
  const [knowledge] = useKnowledge();
  const sharedDocs = (knowledge?.bases ?? []).filter((b) => !b.wiki && (!b.space || (spaces && !spaces.some((x) => x.id === b.space)))).reduce((n, b) => n + b.docs, 0);
  /** "Also search the shared knowledge" saves at once, apart from the form (absent means on). */
  const setShared = async (on: boolean) => {
    try {
      onSaved(await patch<Space>(`/api/projects/${enc(s.id)}`, { sharedKnowledge: on }));
      loadSpaces();
    } catch (e) {
      toastError(e);
    }
  };
  const wikiChoice = s.wikiMemory === true ? 'on' : s.wikiMemory === false ? 'off' : 'inherit';
  /** The project's own Wiki memory switch saves at once, apart from the form: true, false, or null (as in Settings). */
  const setWiki = async (choice: 'inherit' | 'on' | 'off') => {
    if (choice === wikiChoice) return;
    try {
      onSaved(await patch<Space>(`/api/projects/${enc(s.id)}`, { wikiMemory: choice === 'inherit' ? null : choice === 'on' }));
      onWikiChanged();
    } catch (e) {
      toastError(e);
    }
  };
  const wikiLimit = useWikiSettings()?.documentLimit ?? DEFAULT_WIKI_DOCUMENTS;
  const limitChoice = s.wikiDocumentLimit === undefined ? 'inherit' : 'own';
  /** The most documents its wiki reads saves at once too: a number of its own, or null (as in Settings). */
  const setLimit = async (limit: number | null) => {
    try {
      onSaved(await patch<Space>(`/api/projects/${enc(s.id)}`, { wikiDocumentLimit: limit }));
      onWikiChanged();
    } catch (e) {
      toastError(e);
    }
  };
  /** "Searchable from other projects" saves at once, apart from the form (absent means on). */
  const setMemoryShared = async (on: boolean) => {
    try {
      onSaved(await patch<Space>(`/api/projects/${enc(s.id)}`, { memoryShared: on }));
    } catch (e) {
      toastError(e);
    }
  };
  const save = async () => {
    try {
      onSaved(
        await patch<Space>(`/api/projects/${enc(s.id)}`, {
          name: form.name,
          description: form.description ?? '',
          instructions: form.instructions ?? '',
          assistant: form.assistant ?? '',
          color: form.color,
          ...(sameMembers ? {} : { members: form.members ?? [] }),
        }),
      );
      loadSpaces();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        <Row title="The project" sub="Its name, what it is about and its colour: on its card, its page and the start page">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-fg-2">Name</span>
            <span className="flex items-center gap-2.5">
              <SpaceMark s={{ name: form.name?.trim() || s.name, color, members: form.members }} size={38} className="rounded-[10px]" />
              <input className={inputCls} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-fg-2">What it is about</span>
            <input className={inputCls} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          </label>
          <div>
            <span className="mb-1.5 block text-[12.5px] text-fg-2">Its colour</span>
            <div role="radiogroup" aria-label="Its colour" className="flex flex-wrap items-center gap-2">
              {Object.keys(SPACE_COLORS).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-label={c}
                  aria-checked={color === c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cx('flex h-7 w-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-panel', color === c && 'ring-2 ring-fg-3')}
                  style={{ background: SPACE_COLORS[c] }}
                >
                  {color === c && <Check size={14} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        </Row>
        <Row title="What every agent in it follows" sub="Its Agent Guidelines: who it is for, how to work, what to keep in mind. Every session in it gets them.">
          <textarea
            rows={7}
            maxLength={MAX_SPACE_INSTRUCTIONS}
            className={cx(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
            value={form.instructions ?? ''}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder="e.g. Cite in APA 7. My advisor prefers short paragraphs."
            aria-label="Agent Guidelines"
          />
        </Row>
        <Row title="How its sessions start" sub="Picking the project on the start page picks this agent too">
          <span className="mb-1.5 block text-[12.5px] text-fg-2">Its sessions start as</span>
          <div role="radiogroup" aria-label="Its sessions start as" className="flex flex-wrap gap-1.5">
            <Chip on={!form.assistant} onClick={() => setForm({ ...form, assistant: '' })}>
              The agent picked on the start page
            </Chip>
            {assistants.map((a) => (
              <Chip key={a.id} on={form.assistant === a.id} onClick={() => setForm({ ...form, assistant: a.id })}>
                <AssistantIcon icon={a.icon} size={14} plain className="shrink-0" />
                <span translate="no" className="min-w-0 truncate">
                  {a.name}
                </span>
              </Chip>
            ))}
          </div>
        </Row>
        <Row title="Wiki memory" sub="Articles agents keep for this project, from its documents and its work.">
          <Segmented
            size="sm"
            value={wikiChoice}
            onChange={(c) => void setWiki(c)}
            options={[
              { value: 'inherit', label: wikiDefault ? 'As in Settings (On)' : 'As in Settings (Off)' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <p className="text-[12.5px] leading-snug text-fg-3">
            Its documents and its work become articles with sources, which agents can read and add to.{' '}
            <button type="button" onClick={() => go('/settings?s=memory')} className="text-accent hover:underline">
              Settings → Memory
            </button>{' '}
            has the default for every project.
          </p>
        </Row>
        {wikiChoice !== 'off' && (
          <Row title="Most documents to read into its wiki" sub="With more documents than this, a project’s wiki reads the pinned, the most used and the newest of them: agents search them all.">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                size="sm"
                value={limitChoice}
                onChange={(c) => void (c === 'inherit' ? setLimit(null) : setLimit(s.wikiDocumentLimit ?? wikiLimit))}
                options={[
                  { value: 'inherit', label: tr(`As in Settings (${wikiLimit})`) },
                  { value: 'own', label: 'A number of its own' },
                ]}
              />
              {limitChoice === 'own' && <DocumentLimit label="Most documents to read into its wiki" value={s.wikiDocumentLimit ?? wikiLimit} onCommit={(n) => void setLimit(n)} />}
            </div>
          </Row>
        )}
        <Row
          title="Also search the shared knowledge"
          sub={
            <>
              {sharedDocs ? `${plural(sharedDocs, 'document', 'documents')} every session can search` : 'Documents every session can search'}
              {' · '}
              <button type="button" onClick={() => go('/knowledge')} className="font-medium text-accent hover:underline">
                Shared knowledge
              </button>
            </>
          }
        >
          <Switch on={s.sharedKnowledge !== false} label="Also search the shared knowledge" onChange={(v) => void setShared(v)} />
        </Row>
        {!isGroup(s) && (
          <Row title="Searchable from other projects" sub="Agents in your other projects can find and read this project’s notes, wiki, documents and conversations when they look for them. They never change them.">
            <Switch on={s.memoryShared !== false} label="Searchable from other projects" onChange={(v) => void setMemoryShared(v)} />
          </Row>
        )}
        <Row title="The projects it brings together" sub="A group: its sessions work with all of them, their files, documents and guidelines.">
          {inGroups.length ? (
            <div className="text-[12.5px] text-fg-3">{tr(`It is in ${inGroups.map((g) => g.name).join(', ')}, so it cannot bring other projects together itself.`)}</div>
          ) : (
            <MemberPicker value={form.members ?? []} onChange={(members) => setForm({ ...form, members })} self={s.id} />
          )}
        </Row>
      </div>
      {/* Save and Undo changes, once something changed; they stay in view while the page scrolls. */}
      {dirty && (
        <div className="sticky bottom-3 z-10 mt-4 flex items-center gap-2 rounded-2xl border border-line-2 bg-elevated px-4 py-2.5 shadow-lg">
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">Unsaved changes</span>
          <Button variant="ghost" onClick={() => setForm(s)}>
            Undo changes
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!form.name?.trim()}>
            Save
          </Button>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-err/25 px-4 py-4 sm:px-6">
        <div className="min-w-[min(100%,260px)] flex-1">
          <div className="text-[14px] font-semibold">Delete the project</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">Its sessions, folder, files, documents and skills stay.</div>
        </div>
        <Button variant="secondary" icon={<Trash2 size={14} />} onClick={() => void deleteSpace(s, confirm)} className="text-err">
          Delete the project
        </Button>
      </div>
      {confirmNode}
    </div>
  );
}

// ---- the window's content -----------------------------------------------------------------------------------------

/** Only a Close, over a short message or while the project loads. */
function Bare({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex shrink-0 items-center justify-end border-b border-line px-2 pt-[calc(var(--safe-top)+8px)] pb-2 sm:pt-2">
        <IconButton label="Close" onClick={closeProject}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col pb-[var(--safe-bottom)]">{children}</div>
    </>
  );
}

/** The project's window: its header and tabs, and the tab that is open (`tab`, `part` and `share` are how it opened). */
export function SpacePage({ id, tab: first, part: firstPart, share, req }: { id: string; tab: SpaceTab; part?: MemoryPart; share?: boolean; req?: number }) {
  const spaces = useSpaces();
  const view = spaces?.find((x) => x.id === id);
  const [tab, setTab] = useState<SpaceTab>(first);
  const [part, setPart] = useState<MemoryPart>(firstPart ?? 'all');
  // Asked again for a tab while the window is open (its Files from a message's Show, say): that tab shows.
  const asked = useRef(req);
  useEffect(() => {
    if (req === asked.current) return;
    asked.current = req;
    setTab(first);
    // The Memory tab opens on the chip asked for, else All.
    setPart(firstPart ?? 'all');
  }, [req, first, firstPart]);
  // Opened to share it (from the search box, the guide or an agent): the Share dialog opens over the window, once.
  const shared = useRef(false);
  useEffect(() => {
    if (!share || !view || shared.current) return;
    shared.current = true;
    openShareDialog(view);
  }, [share, !!view]);
  const [data, setData] = useState<{ space: Space; sessions: string[]; memoryKey?: string } | null>(null);
  const [gone, setGone] = useState(false);
  const memory = useSpaceMemory(id, (data?.space ?? view)?.folder, data?.memoryKey);
  useEffect(() => {
    let live = true;
    api<{ space: Space; sessions: string[]; memoryKey?: string }>(`/api/projects/${enc(id)}`).then(
      (r) => {
        if (!live) return;
        setData(r);
        setGone(false);
      },
      // A space deleted (or an address that names none) says so once, in place of the window's content.
      (e) => live && ((e as { status?: number }).status === 404 || /no such space/i.test((e as Error).message) ? setGone(true) : toastError(e)),
    );
    return () => {
      live = false;
    };
  }, [id, spaces]);
  if (gone)
    return (
      <Bare>
        <Empty icon={<Boxes size={22} />} title="This project is gone">
          <span className="block">It was deleted, or the address is not one of your projects.</span>
        </Empty>
      </Bare>
    );
  // The space as the list knows it shows at once; what the window fetches (fresher after a save) takes its place.
  const s: Space | undefined = data?.space ?? view;
  if (!s)
    return (
      <Bare>
        <div className="flex h-full items-center justify-center text-fg-3">
          <Throbber size={28} />
        </div>
      </Bare>
    );
  const saved = (next: Space) => setData((d) => ({ space: next, sessions: d?.sessions ?? [] }));
  const to = (t: SpaceTab) => {
    setTab(t);
    if (t === 'memory') setPart('all');
  };
  return (
    <>
      <Top s={s} view={view} tab={tab} onTab={to} memory={memory} />
      {tab === 'files' ? (
        // The folder scrolls in its own box, so the window keeps its height.
        <div className="min-h-0 flex-1 pb-[var(--safe-bottom)]">
          <div className="h-full px-3 pt-4 pb-3 sm:px-6">
            <SpaceFiles s={s} onSaved={saved} />
          </div>
        </div>
      ) : tab === 'memory' ? (
        // Its list and its reader scroll in their own boxes, so the window keeps its height.
        <div className="min-h-0 flex-1 pb-[var(--safe-bottom)]">
          <div className="h-full px-3 pt-4 pb-3 sm:px-6">
            <ProjectMemory s={s} view={view} memory={memory} part={part} onPart={setPart} onTab={to} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-[var(--safe-bottom)]">
          <div className="px-3 py-5 sm:px-6 sm:py-6">
            {tab === 'skills' ? (
              <SpaceSkillsTab s={s} />
            ) : tab === 'agents' ? (
              <AgentsBoard space={s} />
            ) : tab === 'settings' ? (
              <SettingsTab s={s} onSaved={saved} onWikiChanged={memory.reload} />
            ) : (
              <OverviewTab s={s} view={view} keys={data?.sessions} memory={memory} onTab={to} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
