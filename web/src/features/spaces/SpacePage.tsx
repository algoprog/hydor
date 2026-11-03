// A space's own page. At the top, in the space's colour: its mark, name and what it is about, New session, and
// one menu (open its folder in Files, show only its sessions in the sidebar, delete it); its tabs under them.
// Overview: its sessions, what it holds in the Library, and what every session in it gets (its folder, guidelines,
// documents, skills, assistant and memory), with a group's spaces. Then its Library, its files (SpaceFiles), its
// knowledge (documents only its sessions search, with the shared ones too unless it leaves them out), its skills
// (SpaceSkills) and its settings. It shows at once from the spaces the app knows, and fills in what it fetches.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Boxes, Brain, Check, ChevronRight, FolderOpen, FolderPlus, ListFilter, MessagesSquare, MoreHorizontal, Plus, ScrollText, Sparkles, SquarePen, Trash2, UserRound } from 'lucide-react';
import type { KnowledgeBase } from '@shared/knowledge';
import type { SessionSummary } from '@shared/types';
import { isGroup, MAX_SPACE_INSTRUCTIONS, SPACE_COLORS, spaceColor, type Space, type SpaceView } from '@shared/spaces';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Switch, Tabs, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { api, del, enc, patch, post } from '../../lib/api';
import { tildify, timeAgo } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toastError, useApp, useSessions, useUI } from '../../lib/store';
import type { PickedFile } from '../../lib/upload';
import { tr } from '../../i18n/runtime';
import { AssistantIcon } from '../assistants/icons';
import { useAssistantsState } from '../assistants/state';
import { goFolder } from '../files/actions';
import { addFiles, BaseCard, DropFiles, MeaningHint, TrySearch, useKnowledge } from '../knowledge/parts';
import { BackButton, NavButton, PageHeader } from '../layout/PageHeader';
import { SpaceLibrary } from '../pages/Library';
import { ActivityText } from '../sessions/SessionList';
import { MemberPicker, memberNames, SpaceMark, startInSpace } from './parts';
import { SpaceFiles } from './SpaceFiles';
import { SpaceSkillsTab } from './SpaceSkills';
import { loadSpaces, useSpaces } from './state';

export type SpaceTab = 'overview' | 'library' | 'files' | 'knowledge' | 'skills' | 'settings';

const plural = (n: number, one: string, many: string) => tr(`${n} ${n === 1 ? one : many}`);

const tabPath = (id: string, t: SpaceTab) => `/spaces/${id}${t === 'overview' ? '' : `/${t}`}`;

// ---- pieces ----------------------------------------------------------------------------------------------------

/** A part of the page: its title (and how many it holds), what leads further, and what it holds. */
function Card({ title, count, action, children, className }: { title: ReactNode; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
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

/** The quiet link at a card's top right: "All 12", "Open in the Library". */
function CardLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
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

/** Asks, then deletes the space and goes back to the list (its sessions, folder, documents and skills stay). */
async function deleteSpace(s: Space, confirm: ReturnType<typeof useConfirm>[0]) {
  const ok = await confirm({
    title: tr(`Delete the ${s.name} space?`),
    body: 'Its sessions, folder, documents, skills and what it holds in the Library stay. The sessions, folder and Library’s things just no longer belong to a space, its knowledge moves to the shared knowledge, and its skills to your skill library.',
    confirm: 'Delete',
    danger: true,
  });
  if (!ok) return;
  try {
    await del(`/api/spaces/${enc(s.id)}`);
  } catch (e) {
    toastError(e);
    return;
  }
  loadSpaces();
  go('/spaces');
}

// ---- the top --------------------------------------------------------------------------------------------------

/** The space's one menu: its folder in Files, only its sessions in the sidebar, and deleting it. */
function SpaceMenu({ s }: { s: Space }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const filter = useUI((x) => x.spaceFilter);
  const [confirm, confirmNode] = useConfirm();
  const pick = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <>
      <IconButton ref={ref} label="More" active={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={18} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={290} title={<span translate="no">{s.name}</span>}>
        <MenuItem icon={<FolderOpen size={15} />} onClick={pick(() => goFolder(s.folder))}>
          Open its folder in Files
        </MenuItem>
        <MenuItem icon={<ListFilter size={15} />} checked={filter === s.id} onClick={pick(() => useUI.getState().set({ spaceFilter: filter === s.id ? null : s.id }))}>
          Only its sessions in the sidebar
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<Trash2 size={15} />} danger onClick={pick(() => void deleteSpace(s, confirm))}>
          Delete the space
        </MenuItem>
      </Popover>
      {confirmNode}
    </>
  );
}

/** Its mark, name and what it is about over a wash of its colour, New session and its menu, and its tabs. */
function Top({ s, view, tab }: { s: Space; view?: SpaceView; tab: SpaceTab }) {
  const spaces = useSpaces();
  const home = useApp((x) => x.boot?.home);
  const wide = useMediaQuery('(min-width: 640px)');
  const group = isGroup(s);
  const c = spaceColor(s);
  return (
    <header className="relative shrink-0 border-b border-line pt-[var(--safe-top)]">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${c} 15%, transparent), color-mix(in oklab, ${c} 3%, transparent))` }} />
      <div className="relative mx-auto flex max-w-[1120px] items-center gap-2 px-3 pt-3 sm:gap-3 sm:px-6 sm:pt-5">
        <NavButton />
        <BackButton label="All spaces" onClick={() => go('/spaces')} />
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
      </div>
      <div className="relative mx-auto max-w-[1120px] px-1.5 pt-1.5 sm:px-4 sm:pt-3">
        <Tabs
          value={tab}
          dense={!wide}
          onChange={(t) => go(tabPath(s.id, t), true)}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'library', label: 'Library', count: wide ? view?.library : undefined },
            { value: 'files', label: 'Files' },
            { value: 'knowledge', label: 'Knowledge', count: wide ? view?.docs : undefined },
            { value: 'skills', label: 'Skills', count: wide ? view?.skills : undefined },
            { value: 'settings', label: 'Settings' },
          ]}
        />
      </div>
    </header>
  );
}

// ---- Overview ----------------------------------------------------------------------------------------------------

/** How many of a space's sessions the overview lists before All. */
const RECENT = 6;

/** Its sessions, what it holds in the Library, and what every session in it gets. */
function OverviewTab({ s, view, keys }: { s: Space; view?: SpaceView; keys?: string[] }) {
  const home = useApp((x) => x.boot?.home);
  const byKey = useSessions((x) => x.byKey);
  const spaces = useSpaces();
  const assistants = useAssistantsState()?.assistants ?? [];
  const [all, setAll] = useState(false);
  // Those the server listed, and any started or moved here since (the session list keeps up), the last at work first.
  const sessions = useMemo(() => {
    const out = new Map<string, SessionSummary>();
    for (const k of keys ?? []) if (byKey[k]) out.set(k, byKey[k]);
    for (const x of Object.values(byKey)) if (x.extra?.space === s.id) out.set(x.key, x);
    return [...out.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [byKey, keys, s.id]);
  const shown = all ? sessions : sessions.slice(0, RECENT);
  const to = (t: SpaceTab) => go(tabPath(s.id, t), true);
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
                A new one works in this space’s folder, with its guidelines, documents and skills.
              </Blank>
            </div>
          )}
        </Card>
        <Card
          title="In the Library"
          count={view?.library}
          action={
            !!view?.library && (
              <CardLink onClick={() => go(`/library?space=${s.id}`)}>
                Open in the Library <ArrowRight size={13} />
              </CardLink>
            )
          }
        >
          <div className="px-4 pb-4">{view ? <SpaceLibrary space={view} limit={6} framed={false} /> : null}</div>
        </Card>
      </div>
      <aside className="min-w-0 space-y-5">
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
            <Fact icon={<BookOpen size={16} />} label="Knowledge" onClick={() => to('knowledge')}>
              {view?.docs ? plural(view.docs, 'document', 'documents') : <span className="text-fg-3">No documents yet</span>}
              {s.sharedKnowledge === false && <span className="block text-fg-3">Not the shared knowledge</span>}
            </Fact>
            <Fact icon={<Sparkles size={16} />} label="Skills" onClick={() => to('skills')}>
              {view?.skills ? plural(view.skills, 'skill', 'skills') : <span className="text-fg-3">None of its own</span>}
            </Fact>
            <Fact icon={<UserRound size={16} />} label="Starts as" onClick={() => to('settings')}>
              {assistant ? <span translate="no">{assistant}</span> : <span className="text-fg-3">The assistant picked on the start page</span>}
            </Fact>
            <Fact icon={<Brain size={16} />} label="Memory" onClick={() => go('/settings?s=memory')}>
              What agents remember about it
            </Fact>
          </div>
        </Card>
        {members.length > 0 && (
          <Card title="The spaces it brings together" count={members.length}>
            <div className="divide-y divide-line border-t border-line">
              {members.map((m) => (
                <button key={m.id} type="button" onClick={() => go(`/spaces/${m.id}`)} className="flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-1">
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

// ---- Knowledge ----------------------------------------------------------------------------------------------------

/** Documents only this space's sessions search, and whether they search the shared ones too. */
function KnowledgeTab({ s, onSaved }: { s: Space; onSaved: (next: Space) => void }) {
  const [st, load] = useKnowledge();
  const spaces = useSpaces();
  const own = st?.bases.filter((b) => b.space === s.id) ?? [];
  const sharedDocs = (st?.bases ?? []).filter((b) => !b.space || (spaces && !spaces.some((x) => x.id === b.space))).reduce((n, b) => n + b.docs, 0);
  const useShared = s.sharedKnowledge !== false;
  const members = (s.members ?? []).map((id) => spaces?.find((x) => x.id === id)).filter((x): x is SpaceView => !!x);
  const setShared = async (on: boolean) => {
    try {
      onSaved(await patch<Space>(`/api/spaces/${enc(s.id)}`, { sharedKnowledge: on }));
      loadSpaces();
    } catch (e) {
      toastError(e);
    }
  };
  const newBase = async () => {
    try {
      await post('/api/knowledge', { name: own.length ? 'New knowledge base' : s.name, space: s.id });
      load();
    } catch (e) {
      toastError(e);
    }
  };
  /** Files dropped before the space has a base: one is made for them, named for the space. */
  const firstFiles = async (picked: PickedFile[]) => {
    try {
      const b = await post<KnowledgeBase>('/api/knowledge', { name: s.name, space: s.id });
      await addFiles(b, picked);
      load();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-2">
          <BookOpen size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">Also search the shared knowledge</div>
          <div className="text-[12.5px] text-fg-3">
            {sharedDocs ? `${plural(sharedDocs, 'document', 'documents')} every session can search` : 'Documents every session can search'}
            {' · '}
            <button type="button" onClick={() => go('/knowledge')} className="font-medium text-accent hover:underline">
              Shared knowledge
            </button>
          </div>
        </div>
        <Switch on={useShared} label="Also search the shared knowledge" onChange={(v) => void setShared(v)} />
      </div>
      {members.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel px-4 py-3.5">
          <div className="text-[13.5px] font-medium">Also the documents of the spaces it brings together</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button key={m.id} type="button" onClick={() => go(`/spaces/${m.id}/knowledge`)} className="flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-bg-2 pr-2.5 pl-1.5 text-[12.5px] hover:bg-bg-3">
                <SpaceMark s={m} size={15} />
                <span translate="no" className="min-w-0 truncate">
                  {m.name}
                </span>
                <span className="tnum text-fg-3">{m.docs}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!st ? (
        <div className="flex justify-center py-6 text-fg-3">
          <Throbber size={24} />
        </div>
      ) : !own.length ? (
        <div className="rounded-2xl border border-line bg-panel">
          <Blank icon={<BookOpen size={19} />} title="No documents yet">
            {members.length
              ? 'Documents of the group’s own, beside those of its spaces: papers, contracts, notes, a whole folder. Agents find passages by their words or what they mean, and cite the file and page they read.'
              : 'Documents only this space’s sessions search: papers, contracts, notes, a whole folder. Agents find passages by their words or what they mean, and cite the file and page they read.'}
          </Blank>
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <DropFiles big onFiles={(p) => void firstFiles(p)} />
            <div className="mt-3 text-center">
              <Button variant="ghost" icon={<FolderPlus size={14} />} onClick={() => void newBase()}>
                Start with a folder on this computer instead
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <TrySearch space={s.id} />
          {!st.meaning && <MeaningHint />}
          {own.map((b) => (
            <BaseCard key={b.id} b={b} meaning={st.meaning} />
          ))}
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => void newBase()}>
            New knowledge base
          </Button>
        </>
      )}
    </div>
  );
}

// ---- Settings ----------------------------------------------------------------------------------------------------

/** One part of a space's settings: what it is on the left (above, on a phone), its fields on the right. */
function Row({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
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
function SettingsTab({ s, onSaved }: { s: Space; onSaved: (next: Space) => void }) {
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
  const save = async () => {
    try {
      onSaved(
        await patch<Space>(`/api/spaces/${enc(s.id)}`, {
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
    <div className="mx-auto max-w-[860px]">
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        <Row title="The space" sub="Its name, what it is about and its colour: on its card, its page and the start page">
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
        <Row title="How its sessions start" sub="Picking the space on the start page picks this assistant too">
          <span className="mb-1.5 block text-[12.5px] text-fg-2">Its sessions start as</span>
          <div role="radiogroup" aria-label="Its sessions start as" className="flex flex-wrap gap-1.5">
            <Chip on={!form.assistant} onClick={() => setForm({ ...form, assistant: '' })}>
              The assistant picked on the start page
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
        <Row title="The spaces it brings together" sub="A group: its sessions work with all of them, their files, documents and guidelines.">
          {inGroups.length ? (
            <div className="text-[12.5px] text-fg-3">{tr(`It is in ${inGroups.map((g) => g.name).join(', ')}, so it cannot bring other spaces together itself.`)}</div>
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
          <div className="text-[14px] font-semibold">Delete the space</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">Its sessions, folder, documents, skills and what it holds in the Library stay.</div>
        </div>
        <Button variant="secondary" icon={<Trash2 size={14} />} onClick={() => void deleteSpace(s, confirm)} className="text-err">
          Delete the space
        </Button>
      </div>
      {confirmNode}
    </div>
  );
}

// ---- the page ------------------------------------------------------------------------------------------------------

export function SpacePage({ id, tab }: { id: string; tab: SpaceTab }) {
  const spaces = useSpaces();
  const view = spaces?.find((x) => x.id === id);
  const [data, setData] = useState<{ space: Space; sessions: string[] } | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ space: Space; sessions: string[] }>(`/api/spaces/${enc(id)}`).then(
      (r) => {
        if (!live) return;
        setData(r);
        setGone(false);
      },
      // A space deleted (or an address that names none) says so once, in place of the page.
      (e) => live && ((e as { status?: number }).status === 404 || /no such space/i.test((e as Error).message) ? setGone(true) : toastError(e)),
    );
    return () => {
      live = false;
    };
  }, [id, spaces]);
  if (gone)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Spaces" />
        <Empty icon={<Boxes size={22} />} title="This space is gone">
          <span className="block">It was deleted, or the address is not one of your spaces.</span>
          <span className="mt-3 inline-flex">
            <Button size="sm" variant="secondary" icon={<ArrowLeft size={14} />} onClick={() => go('/spaces')}>
              All spaces
            </Button>
          </span>
        </Empty>
      </div>
    );
  // The space as the list knows it shows at once; what the page fetches (fresher after a save) takes its place.
  const s: Space | undefined = data?.space ?? view;
  if (!s)
    return (
      <div className="flex h-full items-center justify-center text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const saved = (next: Space) => setData((d) => ({ space: next, sessions: d?.sessions ?? [] }));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Top s={s} view={view} tab={tab} />
      {tab === 'files' ? (
        // The folder scrolls in its own box, so the page keeps its height.
        <div className="min-h-0 flex-1">
          <div className="mx-auto h-full max-w-[1120px] px-3 pt-4 pb-3 sm:px-6">
            <SpaceFiles s={s} onSaved={saved} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1120px] px-3 py-5 sm:px-6 sm:py-6">
            {tab === 'knowledge' ? (
              <KnowledgeTab s={s} onSaved={saved} />
            ) : tab === 'skills' ? (
              <SpaceSkillsTab s={s} />
            ) : tab === 'settings' ? (
              <SettingsTab s={s} onSaved={saved} />
            ) : tab === 'library' ? (
              view ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[13px] text-fg-3">Pages, slides, documents, pictures and videos made in this space, or moved to it</span>
                    <Button size="sm" variant="ghost" onClick={() => go(`/library?space=${s.id}`)}>
                      Open in the Library
                      <ArrowRight size={13} className="ml-1" />
                    </Button>
                  </div>
                  <SpaceLibrary space={view} />
                </div>
              ) : null
            ) : (
              <OverviewTab s={s} view={view} keys={data?.sessions} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
