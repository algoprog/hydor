// The Jobs page's tag chips, project menu and search field. The picked chip and project are in the address
// (/jobs?tag=…, /jobs?untagged=1, /jobs?project=<id> or none, together); the words searched for are not.
import { useRef, useState, type RefObject } from 'react';
import { Boxes, ChevronDown, Search, X } from 'lucide-react';
import { cx, MenuItem, MenuSep, Popover } from '../../components/ui';
import { Chip, ScrollRow } from '../spaces/memory/ui';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { go } from '../../lib/nav';
import { NO_PROJECT, type JobFilter, type projectCounts, type tagChips } from './tags';
import { TagDot } from './TagPill';

type Picked = Pick<JobFilter, 'tag' | 'untagged'> & { project?: string };

/** The page's address for a tag chip, "No tag" or All (neither), and a project, no project, or all (none given). */
export function jobsHref(pick: Picked): string {
  const q = new URLSearchParams();
  if (pick.project) q.set('project', pick.project);
  if (pick.tag) q.set('tag', pick.tag);
  else if (pick.untagged) q.set('untagged', '1');
  const s = q.toString();
  return s ? `/jobs?${s}` : '/jobs';
}

/** Which project's jobs show: all, one project's (a group's: its projects' too) or those of none. Picking one lets go of
 *  the tag, which that project's jobs may not have. */
function ProjectMenu({ counts, project }: { counts: ReturnType<typeof projectCounts>; project?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const spaces = useSpaces();
  const space = (id: string) => spaces?.find((s) => s.id === id);
  const none = project === NO_PROJECT;
  // A project from the address that no job in the list has still shows, so it can be let go of.
  const picked = project && !none ? (space(project)?.name ?? counts.projects.find((p) => p.id === project)?.name) : undefined;
  const listed = project && !none && !counts.projects.some((p) => p.id === project) ? [...counts.projects, { id: project, name: picked ?? '', atWork: 0, total: 0 }] : counts.projects;
  const pick = (p?: string) => {
    setOpen(false);
    go(jobsHref({ project: p }));
  };
  const mark = (id: string, name: string) => <SpaceMark s={space(id) ?? { name, color: '' }} size={15} />;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-8 max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-[10px] border px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-accent/15 max-sm:h-9',
          project ? 'border-accent/50 bg-accent-soft text-fg' : 'border-line-2 bg-bg-1 text-fg-2 hover:bg-bg-2 hover:text-fg',
          open && 'bg-bg-2',
        )}
      >
        {picked !== undefined ? mark(project!, picked) : <Boxes size={14} aria-hidden className="shrink-0 text-fg-3" />}
        {picked !== undefined ? (
          <span translate="no" className="min-w-0 truncate">
            {picked || '…'}
          </span>
        ) : none ? (
          <span className="min-w-0 truncate">No project</span>
        ) : (
          <span className="min-w-0 truncate">All projects</span>
        )}
        <ChevronDown size={14} aria-hidden className="shrink-0 text-fg-3" />
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={250}>
        {/* Drawn outside the page, so it says whose words it uses ("No project" as the Jobs page means it). */}
        <div data-i18n="jobs" className="contents">
          <MenuItem icon={<Boxes size={15} />} checked={!project} onClick={() => pick()}>
            All projects
          </MenuItem>
          {listed.length > 0 && <MenuSep />}
          {listed.map((p) => (
            <MenuItem key={p.id} icon={mark(p.id, p.name)} checked={project === p.id} hint={p.atWork > 0 ? <span className="tnum">{p.atWork}</span> : undefined} onClick={() => pick(p.id)}>
              <span translate="no">{p.name || '…'}</span>
            </MenuItem>
          ))}
          {(counts.none.total > 0 || none) && (
            <>
              <MenuSep />
              <MenuItem checked={none} hint={counts.none.atWork > 0 ? <span className="tnum">{counts.none.atWork}</span> : undefined} onClick={() => pick(NO_PROJECT)}>
                No project
              </MenuItem>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}

export function Toolbar({
  chips,
  projects,
  atWork,
  tag,
  untagged,
  project,
  query,
  onQuery,
  input,
}: {
  /** The tags of the project picked (of all, when none is). */
  chips: ReturnType<typeof tagChips>;
  /** The projects of all the jobs, whatever is picked. */
  projects: ReturnType<typeof projectCounts>;
  /** Running and queued in the project picked, whatever their tags. */
  atWork: number;
  tag?: string;
  untagged?: boolean;
  project?: string;
  query: string;
  onQuery: (q: string) => void;
  input: RefObject<HTMLInputElement | null>;
}) {
  // A tag from the address that no job in the list has still shows, so it can be let go of.
  const tags = tag && !chips.tags.some((t) => t.name === tag) ? [...chips.tags, { name: tag, atWork: 0, total: 0, lastAt: 0 }] : chips.tags;
  const none = untagged && !tag;
  const pickTag = (pick: Pick<JobFilter, 'tag' | 'untagged'>) => go(jobsHref({ ...pick, project }));
  return (
    <div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        {/* With no tag anywhere there is nothing to choose between. */}
        {(tags.length > 0 || none) && (
          <ScrollRow show={tag ?? (none ? '·none' : '·all')}>
            <Chip on={!tag && !none} onClick={() => pickTag({})} count={atWork}>
              All
            </Chip>
            {tags.map((t) => (
              <Chip key={t.name} on={tag === t.name} onClick={() => pickTag({ tag: t.name })} count={t.atWork}>
                <TagDot tag={t.name} />
                <span translate="no">{t.name}</span>
              </Chip>
            ))}
            {(chips.untagged.total > 0 || none) && (
              <Chip on={!!none} onClick={() => pickTag({ untagged: true })} count={chips.untagged.atWork}>
                <TagDot tag={null} className={none ? '!border-bg' : undefined} />
                <span>No tag</span>
              </Chip>
            )}
          </ScrollRow>
        )}
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {/* With no project anywhere there is nothing to choose between. */}
        {(projects.projects.length > 0 || !!project) && <ProjectMenu counts={projects} project={project} />}
        <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
          <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            ref={input}
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || !query) return;
              e.stopPropagation();
              onQuery('');
            }}
            placeholder="Filter jobs"
            aria-label="Filter jobs"
            enterKeyHint="search"
            className="h-8 w-full rounded-[10px] border border-line-2 bg-bg-1 pr-8 pl-8 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15 max-sm:h-9 max-sm:text-[16px]"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear the filter"
              title="Clear the filter"
              onClick={() => {
                onQuery('');
                input.current?.focus();
              }}
              className="absolute top-1/2 right-1 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
