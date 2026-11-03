// Spaces: each project's sessions, files, documents, Library, memory, guidelines, skills and assistant together.
// The list (beside the shared knowledge, on the page's second tab): a card for each space with what it holds and
// New session, the folders worth a space of their own, and Group spaces together. A space's own page: Overview (its
// latest sessions, what it holds in the Library, and at a glance where it works, what its agents follow, its
// documents and skills), its Library, its files (its folder and the folders it works with, SpaceFiles), its
// knowledge (documents only its sessions search, with the shared ones too unless it leaves them out), its skills
// (SpaceSkills), and its settings. A group brings spaces together: its sessions work with all of them. Picked by name
// on the start page in place of a folder.
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  Brain,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  LibraryBig,
  MessagesSquare,
  Plus,
  ScrollText,
  Sparkles,
  SquarePen,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import type { KnowledgeBase } from '@shared/knowledge';
import type { Space, SpaceView } from '@shared/spaces';
import { isGroup, MAX_SPACE_INSTRUCTIONS, SPACE_COLORS, spaceColor } from '@shared/spaces';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Empty, inputCls, Switch, Tabs, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { api, del, enc, patch, post } from '../../lib/api';
import { basename, tildify, timeAgo } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toastError, useApp, useSessions } from '../../lib/store';
import type { PickedFile } from '../../lib/upload';
import { tr } from '../../i18n/runtime';
import { PageHeader } from '../layout/PageHeader';
import { useAssistantsState } from '../assistants/state';
import { addFiles, BaseCard, DropFiles, MeaningHint, TrySearch, useKnowledge } from '../knowledge/parts';
import { SpaceLibrary } from '../pages/Library';
import { MemberPicker, memberNames, NewSpaceDialog, SpaceMark, SpacesTabs, startInSpace, useSpaceSuggestions } from './parts';
import { SpaceFiles } from './SpaceFiles';
import { SpaceSkillsTab } from './SpaceSkills';
import { loadSpaces, useSpaces } from './state';

const plural = (n: number, one: string, many: string) => tr(`${n} ${n === 1 ? one : many}`);

/** A space's colour, faded into the card's own: the band over its card, the wash behind its overview. */
const wash = (c: string, a = 22, b = 5) => `linear-gradient(120deg, color-mix(in oklab, ${c} ${a}%, transparent), color-mix(in oklab, ${c} ${b}%, transparent))`;

// ---- the list ----------------------------------------------------------------------------------------------

/** Folders sessions worked in lately, or changed files in, that no space has: each a tap from a space of its own. */
function Suggestions({ onMake }: { onMake: (folder: string) => void }) {
  const home = useApp((s) => s.boot?.home);
  const [list, hide] = useSpaceSuggestions();
  if (!list?.length) return null;
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight">Folders you work in</h2>
      <div className="mb-3 text-[13px] text-fg-3">Where your sessions ran or changed files lately, not in a space yet: each could be one</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((x) => (
          <div key={x.path} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-3">
              <Folder size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div translate="no" className="truncate text-[13.5px] font-medium" title={x.path}>
                {basename(x.path)}
              </div>
              <div className="truncate text-[12px] text-fg-3">
                <span translate="no">{tildify(x.path, home)}</span>
                {' · '}
                {plural(x.sessions, 'session', 'sessions')}
                {' · '}
                {timeAgo(x.lastAt)}
              </div>
            </div>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => onMake(x.path)}>
              Make a space
            </Button>
            <button type="button" aria-label={tr(`Not a project: ${basename(x.path)}`)} title="Not a project: stop suggesting it" onClick={() => hide(x.path)} className="shrink-0 rounded p-1.5 text-fg-3 hover:bg-bg-3 hover:text-fg">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** What a space holds, in a line: "12 sessions · 6 in the Library · 4 documents". */
function holds(s: SpaceView): string {
  const parts = [plural(s.sessions, 'session', 'sessions')];
  if (s.library) parts.push(tr(`${s.library} in the Library`));
  if (s.docs) parts.push(plural(s.docs, 'document', 'documents'));
  if (s.skills) parts.push(plural(s.skills, 'skill', 'skills'));
  return parts.join(' · ');
}

/** A space's card: a band of its colour with its mark, its name and what it is about, what it holds, and New session. */
function SpaceCard({ s, spaces }: { s: SpaceView; spaces: SpaceView[] }) {
  const home = useApp((x) => x.boot?.home);
  const c = spaceColor(s);
  const group = isGroup(s);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => go(`/spaces/${s.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && go(`/spaces/${s.id}`)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left transition-colors outline-none hover:border-line-2 focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="relative h-14 w-full" style={{ background: wash(c) }}>
        {group && (
          <span className="absolute top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-panel/70 px-2 py-0.5 text-[11.5px] font-medium text-fg-2">
            <Layers size={11} /> Group
          </span>
        )}
        <span className="absolute -bottom-5 left-4 rounded-[13px] bg-panel p-[3px]">
          <SpaceMark s={s} size={40} className="rounded-[10px]" />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-4 pt-7 pb-3.5">
        <div translate="no" className="truncate text-[15.5px] font-semibold tracking-tight">
          {s.name}
        </div>
        <div translate={group ? undefined : 'no'} className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-fg-3">
          {group ? tr(`Brings together ${memberNames(s, spaces)}`) : s.description || tildify(s.folder, home)}
        </div>
        <div className="mt-3 text-[12.5px] text-fg-2">{holds(s)}</div>
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <span className="min-w-0 flex-1 truncate text-[12px] text-fg-3">{s.lastAt ? tr(`Last at work ${timeAgo(s.lastAt)} ago`) : 'No sessions yet'}</span>
          <Button
            size="sm"
            variant="secondary"
            icon={<SquarePen size={13} />}
            onClick={(e) => {
              e.stopPropagation();
              startInSpace(s);
            }}
          >
            New session
          </Button>
        </div>
      </div>
    </div>
  );
}

/** With no spaces yet: what one is for, in three lines, and the button that makes the first. */
function Intro({ onMake }: { onMake: () => void }) {
  const points: [ReactNode, string, string][] = [
    [<MessagesSquare key="s" size={17} />, 'Sessions that know the project', 'Every agent in it follows its guidelines, and searches its documents and skills.'],
    [<LibraryBig key="l" size={17} />, 'Its files and Library together', 'Its folder, and the pages, slides and pictures made in it, in one place.'],
    [<Boxes key="b" size={17} />, 'Picked by name', 'On the start page, pick the space instead of a folder.'],
  ];
  return (
    <section className="rounded-3xl border border-line bg-panel px-5 py-7 sm:px-8">
      <h2 className="text-[20px] font-semibold tracking-tight">Keep each project together</h2>
      <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-fg-2">A space holds one project: a thesis, your taxes, a website. Its sessions, files, documents and what the agents remember stay with it.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {points.map(([icon, title, body]) => (
          <div key={title} className="rounded-2xl bg-bg-1 px-4 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent-soft text-accent">{icon}</span>
            <div className="mt-2.5 text-[13.5px] font-semibold">{title}</div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{body}</div>
          </div>
        ))}
      </div>
      <Button className="mt-5" variant="primary" icon={<Plus size={15} />} onClick={onMake}>
        Make a space
      </Button>
    </section>
  );
}

function List() {
  const spaces = useSpaces();
  const [made, setMade] = useState<false | 'space' | 'group'>(false);
  // A suggested folder the new space starts with.
  const [from, setFrom] = useState<string | undefined>();
  const plain = (spaces ?? []).filter((s) => !isGroup(s)).length;
  const make = () => {
    setFrom(undefined);
    setMade('space');
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Spaces"
        tip="spaces"
        sub="Each project’s sessions, files, documents and Library, together"
        actions={
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={make}>
            New space
          </Button>
        }
      >
        <SpacesTabs tab="spaces" />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1120px] space-y-10 px-3 py-5 sm:px-6 sm:py-6">
          {!spaces ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !spaces.length ? (
            <Intro onMake={make} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {spaces.map((s) => (
                <SpaceCard key={s.id} s={s} spaces={spaces} />
              ))}
              {plain >= 2 && (
                <button
                  type="button"
                  onClick={() => setMade('group')}
                  className="flex min-h-[180px] flex-col items-start justify-center gap-2 rounded-2xl border border-dashed border-line-2 px-5 py-4 text-left text-fg-2 transition-colors hover:bg-bg-1 hover:text-fg"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bg-2 text-fg-3">
                    <Layers size={17} />
                  </span>
                  <span className="text-[14px] font-semibold">Group spaces together</span>
                  <span className="text-[12.5px] leading-snug text-fg-3">Sessions in a group work with all its spaces: their files, documents and guidelines</span>
                </button>
              )}
            </div>
          )}
          {spaces && (
            <Suggestions
              onMake={(f) => {
                setFrom(f);
                setMade('space');
              }}
            />
          )}
        </div>
      </div>
      <NewSpaceDialog open={!!made} group={made === 'group'} folder={made === 'space' ? from : undefined} onClose={() => setMade(false)} onMade={(s) => go(`/spaces/${s.id}`)} />
    </div>
  );
}

// ---- a space's own page --------------------------------------------------------------------------------------

/** A titled part of the overview, with a way to all of it. */
function Part({ title, more, onMore, children }: { title: string; more?: string; onMore?: () => void; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <span className="flex-1" />
        {more && onMore && (
          <button type="button" onClick={onMore} className="flex items-center gap-1 text-[12.5px] font-medium text-fg-3 hover:text-fg">
            {more}
            <ArrowRight size={13} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** One line of the overview's side: what it is, what it says, and where it leads. */
function Fact({ icon, label, children, onClick }: { icon: ReactNode; label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-bg-1">
      <span className="mt-0.5 shrink-0 text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-fg-3">{label}</span>
        <span className="block text-[13px] leading-snug text-fg">{children}</span>
      </span>
    </button>
  );
}

/** How many of a space's sessions the overview lists before Show all. */
const RECENT = 6;

/** Its latest sessions, what it holds in the Library, and at a glance where it works and what its agents follow. */
function OverviewTab({ s, view, keys }: { s: Space; view?: SpaceView; keys: string[] }) {
  const home = useApp((x) => x.boot?.home);
  const byKey = useSessions((x) => x.byKey);
  const assistants = useAssistantsState()?.assistants ?? [];
  const [all, setAll] = useState(false);
  const sessions = keys.map((k) => byKey[k]).filter(Boolean);
  const shown = all ? sessions : sessions.slice(0, RECENT);
  const to = (tab: Tab) => go(`/spaces/${s.id}/${tab}`, true);
  const assistant = assistants.find((a) => a.id === s.assistant)?.name;
  const others = s.folders?.length ?? 0;
  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-8">
        <Part title="Sessions" more={sessions.length > RECENT ? (all ? 'Show fewer' : tr(`All ${sessions.length}`)) : undefined} onMore={() => setAll((x) => !x)}>
          <div className="overflow-hidden rounded-2xl border border-line bg-panel">
            <button type="button" onClick={() => startInSpace(s)} className="flex w-full items-center gap-2.5 border-b border-line px-4 py-2.5 text-left text-[13.5px] font-medium text-accent transition-colors hover:bg-bg-1">
              <SquarePen size={15} />
              {tr(`New session in ${s.name}`)}
            </button>
            {shown.length ? (
              <div className="divide-y divide-line">
                {shown.map((x) => (
                  <button key={x.key} type="button" onClick={() => openSession(x.key)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-bg-1">
                    <AgentIcon agent={x.agent} size={14} name={x.acpName} />
                    <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px]">
                      {x.title}
                    </span>
                    <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(x.updatedAt)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-4 text-[13px] leading-relaxed text-fg-3">No sessions yet. A new one works in this space’s folder, with its guidelines, documents and skills.</div>
            )}
          </div>
        </Part>
        <Part title="In the Library" more={view?.library ? 'Open in the Library' : undefined} onMore={() => to('library')}>
          {view ? <SpaceLibrary space={view} limit={6} /> : null}
        </Part>
      </div>
      <aside className="min-w-0 space-y-4">
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="h-1.5" style={{ background: spaceColor(s) }} />
          <div className="divide-y divide-line">
            <Fact icon={<FolderOpen size={16} />} label="Works in" onClick={() => to('files')}>
              <span translate="no" className="block truncate" title={s.folder}>
                {tildify(s.folder, home)}
              </span>
              {others > 0 && <span className="text-fg-3">{tr(`and ${others} more ${others === 1 ? 'folder' : 'folders'}`)}</span>}
            </Fact>
            <Fact icon={<ScrollText size={16} />} label="What its agents follow" onClick={() => to('settings')}>
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
            <Fact icon={<UserRound size={16} />} label="Its sessions start as" onClick={() => to('settings')}>
              {assistant ? <span translate="no">{assistant}</span> : <span className="text-fg-3">The assistant picked on the start page</span>}
            </Fact>
            <Fact icon={<Brain size={16} />} label="Memory" onClick={() => go('/settings?s=memory')}>
              What agents remember about it
            </Fact>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Documents only this space's sessions search, and whether they search the shared ones too. */
function KnowledgeTab({ s, onSaved }: { s: Space; onSaved: (next: Space) => void }) {
  const [st, load] = useKnowledge();
  const spaces = useSpaces();
  const own = st?.bases.filter((b) => b.space === s.id) ?? [];
  const sharedDocs = (st?.bases ?? []).filter((b) => !b.space || (spaces && !spaces.some((x) => x.id === b.space))).reduce((n, b) => n + b.docs, 0);
  const useShared = s.sharedKnowledge !== false;
  const members = (s.members ?? []).map((id) => spaces?.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
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
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
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
        <div className="rounded-xl border border-line bg-panel px-4 py-3">
          <div className="text-[13.5px] font-medium">Also the documents of the spaces it brings together</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
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
        <div className="space-y-4">
          <div className="text-[13.5px] leading-relaxed text-fg-2">
            {members.length
              ? 'Documents of the group’s own, beside those of its spaces: papers, contracts, notes, a whole folder. Agents find passages by their words or what they mean, and cite the file and page they read.'
              : 'Documents only this space’s sessions search: papers, contracts, notes, a whole folder. Agents find passages by their words or what they mean, and cite the file and page they read.'}
          </div>
          <DropFiles big onFiles={(p) => void firstFiles(p)} />
          <div className="text-center">
            <Button variant="ghost" icon={<FolderPlus size={14} />} onClick={() => void newBase()}>
              Start with a folder on this computer instead
            </Button>
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

/** A part of a space's settings: its title, a line on what it does, and its fields. */
function Group({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 py-4 sm:px-5">
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {sub && <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{sub}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
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
  const remove = async () => {
    const ok = await confirm({
      title: tr(`Delete the ${s.name} space?`),
      body: 'Its sessions, folder, documents, skills and what it holds in the Library stay. The sessions, folder and Library’s things just no longer belong to a space, its knowledge moves to the shared knowledge, and its skills to your skill library.',
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await del(`/api/spaces/${enc(s.id)}`).catch(toastError);
    loadSpaces();
    go('/spaces');
  };
  return (
    <div className="max-w-[720px] space-y-4">
      <Group title="The space">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-fg-2">Name</span>
          <input className={inputCls} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-fg-2">What it is about</span>
          <input className={inputCls} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
        </label>
        <div>
          <span className="mb-1.5 block text-[12.5px] text-fg-2">Its colour</span>
          <div className="flex items-center gap-1.5">
            {Object.keys(SPACE_COLORS).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={(form.color ?? s.color) === c}
                onClick={() => setForm({ ...form, color: c })}
                className={cx('h-6 w-6 rounded-full ring-offset-2 ring-offset-panel transition-shadow', (form.color ?? s.color) === c && 'ring-2 ring-fg-3')}
                style={{ background: SPACE_COLORS[c] }}
              />
            ))}
          </div>
        </div>
      </Group>
      <Group title="What every agent in it follows" sub="Its Agent Guidelines: who it is for, how to work, what to keep in mind. Every session in it gets them.">
        <textarea
          rows={6}
          maxLength={MAX_SPACE_INSTRUCTIONS}
          className={cx(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
          value={form.instructions ?? ''}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          placeholder="e.g. Cite in APA 7. My advisor prefers short paragraphs."
          aria-label="Agent Guidelines"
        />
      </Group>
      <Group title="How its sessions start">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-fg-2">Its sessions start as</span>
          <select className={cx(inputCls, 'pr-8')} value={form.assistant ?? ''} onChange={(e) => setForm({ ...form, assistant: e.target.value })}>
            <option value="">The assistant picked on the start page</option>
            {assistants.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </Group>
      <Group title="The spaces it brings together" sub="A group: its sessions work with all of them, their files, documents and guidelines.">
        {inGroups.length ? (
          <div className="text-[12.5px] text-fg-3">{tr(`It is in ${inGroups.map((g) => g.name).join(', ')}, so it cannot bring other spaces together itself.`)}</div>
        ) : (
          <MemberPicker value={form.members ?? []} onChange={(members) => setForm({ ...form, members })} self={s.id} />
        )}
      </Group>
      <div className="sticky bottom-0 -mx-1 flex items-center gap-2 bg-bg/90 px-1 py-3 backdrop-blur-sm">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty || !form.name?.trim()}>
          Save
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setForm(s)}>
            Undo changes
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove()}>
          Delete the space
        </Button>
      </div>
      {confirmNode}
    </div>
  );
}

type Tab = 'overview' | 'library' | 'files' | 'knowledge' | 'skills' | 'settings';

/** A space's own page: its tabs under its name, with New session. */
function Detail({ id, tab }: { id: string; tab: Tab }) {
  const [data, setData] = useState<{ space: Space; sessions: string[] } | null>(null);
  const [gone, setGone] = useState(false);
  const spaces = useSpaces();
  const view = spaces?.find((x) => x.id === id);
  // Six tabs fit a phone's width without their counts.
  const counts = useMediaQuery('(min-width: 640px)');
  useEffect(() => {
    api<{ space: Space; sessions: string[] }>(`/api/spaces/${enc(id)}`).then(
      (r) => {
        setData(r);
        setGone(false);
      },
      // A space deleted (or an address that names none) says so once, in place of the page.
      (e) => ((e as { status?: number }).status === 404 || /no such space/i.test((e as Error).message) ? setGone(true) : toastError(e)),
    );
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
  if (!data)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const s = data.space;
  const saved = (next: Space) => setData({ ...data, space: next });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={
          <span translate="no" className="flex items-center gap-2">
            <SpaceMark s={s} size={22} className="rounded-md" />
            {s.name}
          </span>
        }
        sub={isGroup(s) ? tr(`Brings together ${memberNames(s, spaces)}`) : s.description ? <span translate="no">{s.description}</span> : 'Space'}
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => go('/spaces')}>
              <span className="max-sm:hidden">All spaces</span>
            </Button>
            <Button size="sm" variant="primary" icon={<SquarePen size={14} />} onClick={() => startInSpace(s)}>
              New session
            </Button>
          </>
        }
      >
        <Tabs
          value={tab}
          className="max-[374px]:gap-0"
          onChange={(t) => go(`/spaces/${s.id}${t === 'overview' ? '' : `/${t}`}`, true)}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'library', label: 'Library', count: counts ? view?.library : undefined },
            { value: 'files', label: 'Files' },
            { value: 'knowledge', label: 'Knowledge', count: counts ? view?.docs : undefined },
            { value: 'skills', label: 'Skills', count: counts ? view?.skills : undefined },
            { value: 'settings', label: 'Settings' },
          ]}
        />
      </PageHeader>
      {tab === 'files' ? (
        // The folder scrolls in its own box, so the page keeps its height.
        <div className="min-h-0 flex-1">
          <div className="mx-auto h-full max-w-[1100px] px-3 pt-4 pb-3 sm:px-6">
            <SpaceFiles s={s} onSaved={saved} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cx('mx-auto px-3 py-5 sm:px-6', tab === 'overview' || tab === 'library' ? 'max-w-[1120px]' : 'max-w-[880px]')}>
            {tab === 'knowledge' ? (
              <KnowledgeTab s={s} onSaved={saved} />
            ) : tab === 'skills' ? (
              <SpaceSkillsTab s={s} />
            ) : tab === 'settings' ? (
              <SettingsTab s={s} onSaved={saved} />
            ) : tab === 'library' ? (
              view ? (
                <>
                  <div className="mb-4 flex items-center gap-2 text-[13px] text-fg-3">
                    <span className="min-w-0 flex-1">Pages, slides, documents, pictures and videos made in this space, or moved to it</span>
                    <Button size="sm" variant="ghost" onClick={() => go(`/library?space=${s.id}`)}>
                      Open in the Library
                      <ArrowRight size={13} className="ml-1" />
                    </Button>
                  </div>
                  <SpaceLibrary space={view} />
                </>
              ) : null
            ) : (
              <OverviewTab s={s} view={view} keys={data.sessions} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SpacesPage() {
  const [loc] = useLocation();
  const m = /^\/spaces\/([a-z0-9]+)(?:\/(library|files|knowledge|skills|settings))?$/.exec(loc);
  return m ? <Detail id={m[1]} tab={(m[2] as Tab | undefined) ?? 'overview'} /> : <List />;
}
