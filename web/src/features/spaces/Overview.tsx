// The Projects page's overview, across projects (where the column beside the page already lists every project, the
// cards would only repeat it): the latest sessions in any project, what the projects lately made in the Library, a chart
// of where the last four weeks' work went with a bar for each project, the projects shared with people, and (on a
// computer, with the column) the way to group projects together. Each part is a card of a project's own Overview.
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import { spaceColor, type SpaceView, type SpacesActivity } from '@shared/spaces';
import { Throbber } from '../../components/ui';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { ProjectsLibrary } from '../pages/Library';
import { ActivityText } from '../sessions/SessionList';
import { SpaceMark } from './parts';
import { Card, CardLink } from './SpacePage';
import { openShareDialog } from './ShareHost';

/** How many sessions the first card lists, and how many after Show more. */
const FEW = 8;
const MANY = 30;
/** The days the chart shows. */
const DAYS = 28;

const ROW = 'flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-1';
// Each count is a sentence of its own for the dictionaries ("{0} message", "{0} messages"), which have a word order and plurals of their own.
const messages = (n: number) => (n === 1 ? tr(`${n} message`) : tr(`${n} messages`));
const sessionsOf = (n: number) => (n === 1 ? tr(`${n} session`) : tr(`${n} sessions`));
const people = (n: number) => (n === 1 ? tr(`${n} person`) : tr(`${n} people`));

/** The sessions most lately at work in any of the projects, each with its project: a click opens it. */
function LatestSessions({ spaces }: { spaces: SpaceView[] }) {
  const byKey = useSessions((x) => x.byKey);
  const loaded = useSessions((x) => x.loaded);
  const [more, setMore] = useState(false);
  const sessions = useMemo(() => {
    const ids = new Set(spaces.map((s) => s.id));
    return Object.values(byKey)
      .filter((x) => x.extra?.space && ids.has(String(x.extra.space)) && !x.subagentOf && !x.archived)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [byKey, spaces]);
  if (loaded && !sessions.length) return null;
  const shown = sessions.slice(0, more ? MANY : FEW);
  return (
    <Card title="Latest sessions" action={sessions.length > FEW && <CardLink onClick={() => setMore((x) => !x)}>{more ? 'Show fewer' : 'Show more'}</CardLink>}>
      {loaded ? (
        <div className="divide-y divide-line border-t border-line">
          {shown.map((x) => {
            const space = spaces.find((s) => s.id === x.extra?.space)!;
            return (
              <button key={x.key} type="button" onClick={() => openSession(x.key)} className={ROW}>
                <SpaceMark s={space} size={28} className="rounded-[8px]" />
                <span className="min-w-0 flex-1">
                  <span translate="no" className="block truncate text-[13.5px]">
                    {x.title}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
                    <span translate="no" className="truncate">
                      {space.name}
                    </span>
                    {(x.live || x.external) && (
                      <>
                        <span>·</span>
                        <ActivityText s={x} className="shrink-0" />
                      </>
                    )}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[12px] text-fg-3">{timeAgo(x.updatedAt)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex justify-center border-t border-line py-6 text-fg-3">
          <Throbber size={22} />
        </div>
      )}
    </Card>
  );
}

/** A day as "Nov 18" (its date is UTC midnight, whatever the zone it was counted in). */
const dateOf = (start: number) => new Date(start).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The last four weeks: messages a day stacked by project, a bar for each project's share, and the projects that were quiet. */
function WhereTheWorkWent({ spaces }: { spaces: SpaceView[] }) {
  const [act, setAct] = useState<SpacesActivity | null>(null);
  // Asked again as sessions come and go in the projects.
  const inProjects = useSessions((x) => {
    const ids = new Set(spaces.map((s) => s.id));
    return Object.values(x.byKey).filter((s) => s.extra?.space && ids.has(String(s.extra.space))).length;
  });
  useEffect(() => {
    let current = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    api<SpacesActivity>(`/api/projects/activity?days=${DAYS}&tz=${encodeURIComponent(tz)}`)
      .then((r) => current && setAct(r))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [inProjects]);
  const rows = (act?.projects ?? []).flatMap((p) => {
    const space = spaces.find((s) => s.id === p.id);
    return space ? [{ p, space }] : [];
  });
  if (!act || !rows.length) return null;
  const totals = act.days.map((_, i) => rows.reduce((n, r) => n + r.p.byDay[i], 0));
  const max = Math.max(1, ...totals);
  const top = Math.max(1, rows[0].p.prompts);
  const prompts = rows.reduce((n, r) => n + r.p.prompts, 0);
  const sessions = rows.reduce((n, r) => n + r.p.sessions, 0);
  const sum = `${messages(prompts)} · ${sessionsOf(sessions)}`;
  const busy = new Set(rows.map((r) => r.space.id));
  const quiet = spaces.filter((s) => !busy.has(s.id)).map((s) => s.name);
  const names = quiet.slice(0, 4).join(', ');
  return (
    <Card title="Where the work went" action={<span className="shrink-0 text-[12.5px] text-fg-3">Last 4 weeks</span>}>
      <div className="border-t border-line px-4 pt-3.5 pb-1">
        <div className="text-[13px] text-fg-2">{sum}</div>
        <div className="mt-3 flex h-24 items-end gap-[3px]" role="img" aria-label={sum}>
          {act.days.map((day, i) => (
            <div key={day.key} title={`${dateOf(day.start)}: ${messages(totals[i])}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              {totals[i] > 0 ? (
                [...rows]
                  .reverse()
                  .filter((r) => r.p.byDay[i] > 0)
                  .map((r) => <span key={r.space.id} style={{ height: `${(r.p.byDay[i] / max) * 100}%`, background: spaceColor(r.space) }} className="block min-h-[2px] w-full first:rounded-t-[3px]" />)
              ) : (
                <span className="block h-[2px] w-full rounded-full bg-bg-2" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11.5px] text-fg-3">
          <span translate="no">{dateOf(act.days[0].start)}</span>
          <span>Today</span>
        </div>
      </div>
      <div className="mt-2 divide-y divide-line border-t border-line">
        {rows.map(({ p, space }) => (
          <button key={space.id} type="button" onClick={() => go(`/projects/${space.id}`)} className={ROW}>
            <SpaceMark s={space} size={22} className="rounded-[7px]" />
            <span className="min-w-0 flex-1">
              <span translate="no" className="block truncate text-[13.5px] font-medium">
                {space.name}
              </span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-bg-2">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (p.prompts / top) * 100)}%`, background: spaceColor(space) }} />
              </span>
            </span>
            <span className="tnum shrink-0 text-right text-[12px] text-fg-3">{messages(p.prompts)}</span>
          </button>
        ))}
        {quiet.length > 0 && (
          <div className="border-t border-line px-4 py-2.5 text-[12.5px] leading-snug text-fg-3">
            {quiet.length > 4 ? tr(`Quiet these 4 weeks: ${names} and ${quiet.length - 4} more`) : tr(`Quiet these 4 weeks: ${names}`)}
          </div>
        )}
      </div>
    </Card>
  );
}

/** The projects shared with people, and with how many: a click opens Share with people for it. */
function SharedProjects({ spaces }: { spaces: SpaceView[] }) {
  const shared = spaces.filter((s) => s.people);
  if (!shared.length) return null;
  return (
    <Card title="Shared with people" count={shared.length}>
      <div className="divide-y divide-line border-t border-line">
        {shared.map((s) => (
          <button key={s.id} type="button" onClick={() => openShareDialog(s)} className={ROW}>
            <SpaceMark s={s} size={22} className="rounded-[7px]" />
            <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
              {s.name}
            </span>
            <span className="shrink-0 text-[12px] text-fg-3">{people(s.people ?? 0)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/** `spaces`: every project, groups too. `onGroup`: when given, the row that starts a group. */
export function ProjectsOverview({ spaces, onGroup }: { spaces: SpaceView[]; onGroup?: () => void }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <LatestSessions spaces={spaces} />
        {spaces.some((s) => s.library > 0) && (
          <Card
            title="Lately in the Library"
            action={
              <CardLink onClick={() => go('/library')}>
                <span>Open the Library</span> <ArrowRight size={13} />
              </CardLink>
            }
          >
            <div className="px-4 pb-4">
              <ProjectsLibrary limit={6} />
            </div>
          </Card>
        )}
      </div>
      <aside className="min-w-0 space-y-5">
        <WhereTheWorkWent spaces={spaces} />
        <SharedProjects spaces={spaces} />
        {onGroup && (
          <button type="button" onClick={onGroup} className="flex w-full items-start gap-3 rounded-2xl border border-dashed border-line-2 px-4 py-3.5 text-left text-fg-2 transition-colors hover:bg-bg-1 hover:text-fg">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-3">
              <Layers size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">Group projects together</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">Sessions in a group work with all its projects: their files, documents and guidelines</span>
            </span>
          </button>
        )}
      </aside>
    </div>
  );
}
