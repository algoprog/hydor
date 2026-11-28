// The Projects page (/projects): every project in one place, as cards: its mark and colour, its name, what it is about,
// its folder, what it holds, when it was last at work and how its sessions are doing now (working, finished since you
// looked), with a few weeks of its work as small bars. A card opens the project's own page in its place
// (/projects/<id>, SpacePage.tsx, with an arrow back here); New session and its menu show beside it on hover. Files
// dropped on a card go into its folder.
// Below the cards, the folders you work in that no project has yet, each a tap from one. Find a project, and a sort
// (kept on this device), are above them.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowUpDown, Boxes, ChevronDown, Folder, Layers, Plus, Search, SquarePen, X } from 'lucide-react';
import type { SpacesActivity, SpaceView, FoundIn } from '@shared/spaces';
import { isGroup, spaceColor } from '@shared/spaces';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, MenuItem, Popover, Throbber } from '../../components/ui';
import { api } from '../../lib/api';
import { activityOf, isWorking } from '../../lib/activity';
import { basename, tildify, timeAgo } from '../../lib/format';
import { openProject } from '../../lib/nav';
import { useApp, useSessions } from '../../lib/store';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { dropInto } from '../files/actions';
import { PageHeader } from '../layout/PageHeader';
import { dragsFiles, dropMoves } from '../pages/uploads';
import { DropHint } from '../pages/UploadTray';
import { sessionSpaceId } from '../sessions/groups';
import { unreadOf } from '../sessions/SessionList';
import { memberNames, NewSpaceDialog, SpaceMark, startInSpace, useSpaceSuggestions } from './parts';
import { SpaceMenu } from './ProjectMenu';
import { SyncBadge } from './SyncMark';
import { useSpaces } from './state';

// ---- what the page keeps ----------------------------------------------------------------------------------------

type Sort = 'recent' | 'name' | 'sessions';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recent activity' },
  { value: 'name', label: 'Name' },
  { value: 'sessions', label: 'Most sessions' },
];
const SORT_KEY = 'wa.projects.sort';

const readSort = (): Sort => {
  try {
    const s = localStorage.getItem(SORT_KEY);
    return s === 'name' || s === 'sessions' ? s : 'recent';
  } catch {
    return 'recent';
  }
};

function sorted(list: SpaceView[], sort: Sort): SpaceView[] {
  const byName = (a: SpaceView, b: SpaceView) => a.name.localeCompare(b.name, LOCALE, { sensitivity: 'base' });
  const copy = [...list];
  if (sort === 'name') return copy.sort(byName);
  if (sort === 'sessions') return copy.sort((a, b) => b.sessions - a.sessions || (b.lastAt ?? 0) - (a.lastAt ?? 0) || byName(a, b));
  return copy.sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0) || byName(a, b));
}

/** The order the cards show in: one quiet button and its menu. */
function SortMenu({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={btn} size="sm" variant="ghost" icon={<ArrowUpDown size={13} />} title="Sort the projects" aria-label="Sort the projects" onClick={() => setOpen((o) => !o)}>
        <span className="max-sm:hidden">{SORTS.find((s) => s.value === value)!.label}</span>
      </Button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={190}>
        {SORTS.map((s) => (
          <MenuItem key={s.value} checked={s.value === value} onClick={() => (setOpen(false), onChange(s.value))}>
            {s.label}
          </MenuItem>
        ))}
      </Popover>
    </>
  );
}

// ---- how each project's sessions are doing ----------------------------------------------------------------------

/** What the sidebar's sessions say of a project: how many work now, and whether one finished since you looked. */
interface Doing {
  working: number;
  unread: boolean;
}

/**
 * Each project's sessions at work and finished since you looked, by the rule that puts a session under a project in the
 * sidebar (the project its own record names; not an archived session, nor a subagent's). Read as one small string, so the
 * page redraws only when one of these changes, not with every word a session streams.
 */
function useDoing(): Map<string, Doing> {
  const line = useSessions((st) => {
    const by = new Map<string, [number, number]>();
    for (const s of Object.values(st.byKey)) {
      const id = sessionSpaceId(s);
      if (!id || s.archived || s.subagentOf) continue;
      const w = isWorking(activityOf(s)) ? 1 : 0;
      const u = unreadOf(s) ? 1 : 0;
      if (!w && !u) continue;
      const was = by.get(id) ?? [0, 0];
      by.set(id, [was[0] + w, was[1] + u]);
    }
    return [...by].map(([id, [w, u]]) => `${id}\t${w}\t${u}`).join('\n');
  });
  return useMemo(() => {
    const out = new Map<string, Doing>();
    for (const row of line ? line.split('\n') : []) {
      const [id, w, u] = row.split('\t');
      out.set(id, { working: Number(w), unread: Number(u) > 0 });
    }
    return out;
  }, [line]);
}

/** A project's work over the last four weeks (messages a day, oldest first), by project id. */
function useWeeks(spaces: SpaceView[] | null): Map<string, number[]> | null {
  const [act, setAct] = useState<SpacesActivity | null>(null);
  const count = spaces?.length ?? 0;
  useEffect(() => {
    if (!count) return;
    let alive = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    api<SpacesActivity>(`/api/projects/activity?days=28&tz=${encodeURIComponent(tz)}`).then(
      (r) => alive && setAct(r),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [count]);
  return useMemo(() => (act ? new Map(act.projects.map((p) => [p.id, p.byDay])) : null), [act]);
}

/** The last four weeks as small bars in the project's colour, a bar for each day (none when it did nothing in them). */
function Weeks({ days, color }: { days?: number[]; color: string }) {
  const total = days?.reduce((n, d) => n + d, 0) ?? 0;
  if (!days || !total) return null;
  const top = Math.max(...days);
  const w = 2.5;
  const gap = 1;
  const h = 16;
  const label = total === 1 ? tr(`1 message in the last 4 weeks`) : tr(`${total} messages in the last 4 weeks`);
  return (
    <svg width={days.length * (w + gap) - gap} height={h} viewBox={`0 0 ${days.length * (w + gap) - gap} ${h}`} role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      {days.map((d, i) => {
        const bar = d ? Math.max(2, Math.round((d / top) * h)) : 1;
        return <rect key={i} x={i * (w + gap)} y={h - bar} width={w} height={bar} rx={0.8} fill={color} opacity={d ? 0.85 : 0.22} />;
      })}
    </svg>
  );
}

// ---- the cards --------------------------------------------------------------------------------------------------

/** A project's card is faded into its colour at the top: the band over it. */
const wash = (c: string, a = 22, b = 5) => `linear-gradient(120deg, color-mix(in oklab, ${c} ${a}%, transparent), color-mix(in oklab, ${c} ${b}%, transparent))`;

const sessionsText = (n: number) => (n === 1 ? tr(`${n} session`) : tr(`${n} sessions`));
const documentsText = (n: number) => (n === 1 ? tr(`${n} document`) : tr(`${n} documents`));
const skillsText = (n: number) => (n === 1 ? tr(`${n} skill`) : tr(`${n} skills`));
const keptText = (n: number) => (n === 1 ? tr(`${n} kept file`) : tr(`${n} kept files`));
const peopleText = (n: number) => (n === 1 ? tr(`Shared with ${n} person`) : tr(`Shared with ${n} people`));

/** What a project holds, in a line: "12 sessions · 4 documents · 3 skills · 6 kept files · Shared with 2 people". */
function holds(s: SpaceView): string {
  const parts: string[] = [];
  if (s.sessions) parts.push(sessionsText(s.sessions));
  if (s.docs) parts.push(documentsText(s.docs));
  if (s.skills) parts.push(skillsText(s.skills));
  if (s.library) parts.push(keptText(s.library));
  if (s.people) parts.push(peopleText(s.people));
  return parts.join(' · ');
}

/** The chip on a project Hydor found for a folder you work in: the programs it found it for (Claude Code first), its text and title. */
function foundChip(found: FoundIn[]) {
  const agents = (['claude', 'codex'] as const).filter((a) => found.includes(a));
  if (agents.length === 2) return { agents, text: 'From Claude Code and Codex', title: 'Hydor made this project for a folder you work in with Claude Code and Codex' };
  if (agents[0] === 'claude') return { agents, text: 'From Claude Code', title: 'Hydor made this project for a folder you work in with Claude Code' };
  return { agents, text: 'From Codex', title: 'Hydor made this project for a folder you work in with Codex' };
}

/**
 * A project's card: a band of its colour with its mark, its name and what it is about, its folder, what it holds, when it
 * was last at work and how its sessions are doing. A click (or Enter) opens its details; on hover or focus (always, on a
 * touch screen) New session and its menu show over the band. Files dropped on it go into its folder.
 */
function ProjectCard({ s, spaces, doing, weeks }: { s: SpaceView; spaces: SpaceView[]; doing?: Doing; weeks?: number[] }) {
  const home = useApp((x) => x.boot?.home);
  const c = spaceColor(s);
  const group = isGroup(s);
  const found = s.found?.length ? foundChip(s.found) : undefined;
  const held = holds(s);
  const [menu, setMenu] = useState(false);
  const [over, setOver] = useState(false);
  // Files of yours dropped on a project go into its folder (a group has no folder of its own to fill).
  const takes = !group;
  const onDragOver = (e: DragEvent) => {
    if (!dragsFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = !takes ? 'none' : dropMoves() ? 'move' : 'copy';
    if (takes && !over) setOver(true);
  };
  const onDrop = (e: DragEvent) => {
    if (!dragsFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    if (takes) void dropInto(e, s.folder);
  };
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={s.name}
      onClick={() => openProject(s.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), openProject(s.id))}
      onDragOver={onDragOver}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={onDrop}
      className={cx(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-panel text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        over ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-line-2',
      )}
    >
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-accent/10 p-3">
          <DropHint name={s.name} className="px-3.5 py-1.5 text-[13px]" />
        </div>
      )}
      <div className="relative h-16 w-full shrink-0" style={{ background: wash(c) }}>
        {/* New session and its menu: a click in them is not a click on the card. */}
        <div
          className={cx(
            'absolute top-1.5 right-1.5 flex items-center gap-1 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
            menu ? 'opacity-100' : 'opacity-0',
          )}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="secondary" icon={<SquarePen size={13} />} onClick={() => startInSpace(s)}>
            New session
          </Button>
          <SpaceMenu s={s} onOpen={setMenu} />
        </div>
        <div className="absolute right-2 bottom-1.5 flex items-center gap-1.5">
          {group && (
            <span className="inline-flex items-center gap-1 rounded-full bg-panel/70 px-2 py-0.5 text-[11.5px] font-medium text-fg-2">
              <Layers size={11} /> Group
            </span>
          )}
          {found && (
            <span className="inline-flex items-center gap-1 rounded-full bg-panel/70 px-2 py-0.5 text-[11.5px] font-medium text-fg-2" title={found.title}>
              {found.agents.map((a) => (
                <AgentIcon key={a} agent={a} size={11} />
              ))}
              {found.text}
            </span>
          )}
        </div>
        <span className="absolute -bottom-5 left-4 rounded-[13px] bg-panel p-[3px]">
          <SpaceMark s={s} size={40} className="rounded-[10px]" />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-4 pt-8 pb-3.5">
        <div className="flex items-center gap-2">
          <div translate="no" className="min-w-0 truncate text-[15.5px] font-semibold tracking-tight">
            {s.name}
          </div>
          {doing?.unread && !doing.working && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Finished since you last looked" />}
          {!!doing?.working && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bg-2 px-2 py-0.5 text-[11.5px] font-medium text-fg-2">
              <span className="breathe h-1.5 w-1.5 rounded-full bg-busy" />
              {tr(`${doing.working} working`)}
            </span>
          )}
        </div>
        {group ? (
          <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-fg-3">{tr(`Brings together ${memberNames(s, spaces)}`)}</div>
        ) : (
          s.description && (
            <div translate="no" className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-fg-3">
              {s.description}
            </div>
          )
        )}
        {!group && (
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3" title={s.folder}>
            <Folder size={12} className="shrink-0" />
            <span translate="no" className="min-w-0 truncate">
              {tildify(s.folder, home)}
            </span>
          </div>
        )}
        {held && <div className="mt-2.5 text-[12.5px] leading-snug text-fg-2">{held}</div>}
        {s.sync && <SyncBadge s={s} className="mt-2 max-w-full" />}
        <div className="min-h-3 flex-1" />
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <span className="min-w-0 flex-1 truncate text-[12px] text-fg-3">{s.lastAt ? (timeAgo(s.lastAt) === 'just now' ? 'Last at work just now' : tr(`Last at work ${timeAgo(s.lastAt)} ago`)) : 'No sessions yet'}</span>
          <Weeks days={weeks} color={c} />
        </div>
      </div>
    </div>
  );
}

// ---- folders you work in ----------------------------------------------------------------------------------------

/** Folders sessions worked in lately, or changed files in, that no project has: each a tap from a project of its own. */
function Suggestions({ onMake }: { onMake: (folder: string) => void }) {
  const home = useApp((s) => s.boot?.home);
  const [list, hide] = useSpaceSuggestions();
  if (!list?.length) return null;
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight">Folders you work in</h2>
      <div className="mb-3 text-[13px] text-fg-3">Where your sessions ran or changed files lately, not in a project yet: each could be one</div>
      <div className="grid gap-2 md:grid-cols-2">
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
                {sessionsText(x.sessions)}
                {' · '}
                {timeAgo(x.lastAt)}
              </div>
            </div>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => onMake(x.path)}>
              Make a project
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

// ---- the page ---------------------------------------------------------------------------------------------------

/** New project, and a way to make a group of projects beside it. */
function NewMenu({ onProject, onGroup, canGroup }: { onProject: () => void; onGroup: () => void; canGroup: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="flex">
        <Button size="sm" variant="primary" icon={<Plus size={14} />} className="rounded-r-none" onClick={onProject}>
          New project
        </Button>
        <Button ref={btn} size="sm" variant="primary" aria-label="More ways to make a project" aria-expanded={open} className="rounded-l-none border-l border-accent-fg/25 px-2" onClick={() => setOpen((o) => !o)}>
          <ChevronDown size={14} />
        </Button>
      </div>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={270}>
        <MenuItem icon={<Plus size={15} />} onClick={() => (setOpen(false), onProject())}>
          New project
        </MenuItem>
        <MenuItem icon={<Layers size={15} />} disabled={!canGroup} hint={canGroup ? undefined : 'Needs two projects'} onClick={() => (setOpen(false), onGroup())}>
          New group of projects…
        </MenuItem>
      </Popover>
    </>
  );
}

/** With no projects yet: what one is for, and the button that makes the first. */
function Intro({ onMake }: { onMake: () => void }) {
  return (
    <section className="rounded-3xl border border-line bg-panel px-5 py-8 text-center sm:px-8">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Boxes size={20} />
      </span>
      <h2 className="mt-3 text-[18px] font-semibold tracking-tight">Keep each project together</h2>
      <p className="mx-auto mt-1 max-w-[460px] text-[14px] leading-relaxed text-fg-2">A project holds one piece of work: a thesis, your taxes, a website. Its sessions, files, documents and what the agents remember stay with it.</p>
      <Button className="mt-4" variant="primary" icon={<Plus size={15} />} onClick={onMake}>
        New project
      </Button>
    </section>
  );
}

export function ProjectsPage() {
  const spaces = useSpaces();
  const home = useApp((s) => s.boot?.home);
  const doing = useDoing();
  const weeks = useWeeks(spaces);
  const [made, setMade] = useState<false | 'space' | 'group'>(false);
  // A suggested folder the new project starts with.
  const [from, setFrom] = useState<string | undefined>();
  const [find, setFind] = useState('');
  const [sort, setSortState] = useState<Sort>(readSort);
  const setSort = (s: Sort) => {
    setSortState(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {}
  };
  const plain = (spaces ?? []).filter((s) => !isGroup(s)).length;
  const make = () => {
    setFrom(undefined);
    setMade('space');
  };
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(
    () =>
      sorted(
        (spaces ?? []).filter((s) => {
          const text = `${s.name} ${s.description ?? ''} ${s.folder} ${tildify(s.folder, home)}`.toLowerCase();
          return words.every((w) => text.includes(w));
        }),
        sort,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spaces, find, sort, home],
  );
  // A file dropped beside the cards does nothing, rather than the browser opening it in the app's place.
  const refuse = (e: DragEvent) => {
    if (!dragsFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (e.type === 'dragover') e.dataTransfer.dropEffect = 'none';
  };
  return (
    <div className="flex h-full min-h-0 flex-col" onDragOver={refuse} onDrop={refuse}>
      <PageHeader
        title={
          <>
            Projects
            {!!spaces?.length && <span className="tnum ml-2 text-[13px] font-normal text-fg-3">{spaces.length}</span>}
          </>
        }
        tip="spaces"
        sub={<span className="max-sm:hidden">Each project’s sessions, files, documents and memory, together</span>}
        actions={<NewMenu onProject={make} onGroup={() => setMade('group')} canGroup={plain >= 2} />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1120px] px-3 py-5 sm:px-6 sm:py-6">
          <div className="space-y-10">
            {!spaces ? (
              <div className="flex justify-center py-10 text-fg-3">
                <Throbber size={28} />
              </div>
            ) : !spaces.length ? (
              <Intro onMake={make} />
            ) : (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <label className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-2.5 focus-within:border-accent/60 sm:max-w-[320px]">
                    <Search size={14} className="shrink-0 text-fg-3" />
                    <input
                      value={find}
                      onChange={(e) => setFind(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && find && (e.preventDefault(), setFind(''))}
                      placeholder="Find a project"
                      aria-label="Find a project"
                      enterKeyHint="search"
                      className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
                    />
                    {find && (
                      <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
                        <X size={13} />
                      </button>
                    )}
                  </label>
                  <span className="flex-1 max-sm:hidden" />
                  <SortMenu value={sort} onChange={setSort} />
                </div>
                {shown.length ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shown.map((s) => (
                      <ProjectCard key={s.id} s={s} spaces={spaces} doing={doing.get(s.id)} weeks={weeks?.get(s.id)} />
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-[13.5px] text-fg-3">
                    {tr(`No project matches “${find.trim()}”`)}
                  </div>
                )}
              </section>
            )}
            {spaces && !words.length && (
              <Suggestions
                onMake={(f) => {
                  setFrom(f);
                  setMade('space');
                }}
              />
            )}
          </div>
        </div>
      </div>
      <NewSpaceDialog open={!!made} group={made === 'group'} folder={made === 'space' ? from : undefined} onClose={() => setMade(false)} onMade={(s) => openProject(s.id)} />
    </div>
  );
}
