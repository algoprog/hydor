// Spaces: each project's sessions, files, documents, Library, memory, guidelines, skills and assistant together.
// The list (beside the shared knowledge, on the page's second tab): a card for each space with what it holds and
// New session, the folders worth a space of their own, and Group spaces together. A space's own page is SpacePage.
// A group brings spaces together: its sessions work with all of them. Picked by name on the start page in place of
// a folder.
import { useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Boxes, Folder, Layers, LibraryBig, MessagesSquare, Plus, SquarePen, X } from 'lucide-react';
import type { SpaceView } from '@shared/spaces';
import { isGroup, spaceColor } from '@shared/spaces';
import { Button, Throbber } from '../../components/ui';
import { basename, tildify, timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { PageHeader } from '../layout/PageHeader';
import { memberNames, NewSpaceDialog, SpaceMark, SpacesTabs, startInSpace, useSpaceSuggestions } from './parts';
import { SpacePage, type SpaceTab } from './SpacePage';
import { useSpaces } from './state';

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
      <div className="mb-3 text-[13px] text-fg-3">Where your sessions ran or changed files lately, not in a project yet: each could be one</div>
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
      onClick={() => go(`/projects/${s.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && go(`/projects/${s.id}`)}
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
    [<Boxes key="b" size={17} />, 'Picked by name', 'On the start page, pick the project instead of a folder.'],
  ];
  return (
    <section className="rounded-3xl border border-line bg-panel px-5 py-7 sm:px-8">
      <h2 className="text-[20px] font-semibold tracking-tight">Keep each project together</h2>
      <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-fg-2">A project holds one project: a thesis, your taxes, a website. Its sessions, files, documents and what the agents remember stay with it.</p>
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
        Make a project
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
        title="Projects"
        tip="spaces"
        sub="Each project’s sessions, files, documents and Library, together"
        actions={
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={make}>
            New project
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
                  <span className="text-[14px] font-semibold">Group projects together</span>
                  <span className="text-[12.5px] leading-snug text-fg-3">Sessions in a group work with all its projects: their files, documents and guidelines</span>
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
      <NewSpaceDialog open={!!made} group={made === 'group'} folder={made === 'space' ? from : undefined} onClose={() => setMade(false)} onMade={(s) => go(`/projects/${s.id}`)} />
    </div>
  );
}

export function SpacesPage() {
  const [loc] = useLocation();
  const m = /^\/projects\/([a-z0-9]+)(?:\/(library|files|knowledge|skills|settings))?$/.exec(loc);
  return m ? <SpacePage id={m[1]} tab={(m[2] as SpaceTab | undefined) ?? 'overview'} /> : <List />;
}
