// A project's work in hand, on its Overview (spaces/SpacePage.tsx): the jobs of its sessions and of its folder that run,
// wait, or serve, as the Jobs page shows them, each opening its panel there; nothing while there are none. For a group,
// those of the projects it brings together too. It reads only that project's jobs, and none that ended
// (GET /api/jobs?ended=0&project=<id>): at once, at each change the server tells, and every five seconds while it shows.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { JobsList } from '@shared/jobs';
import type { Space } from '@shared/spaces';
import { api, enc } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { useMediaQuery } from '../../components/ui';
import { useJobActions } from './actions';
import { JobRow } from './JobRow';
import { useJobs, useNow } from './store';
import { filterList } from './tags';
import { waitsFor } from './words';

/** The most rows the card shows (fewer on a phone, where each takes more room); the rest are a click away, on the Jobs page. */
const MOST = 6;
const MOST_PHONE = 3;

/** The jobs of a project (and of the projects a group brings together) at work, read again as they change. */
function useProjectJobs(id: string): [JobsList | null, () => void] {
  const [list, setList] = useState<JobsList | null>(null);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let live = true;
    const read = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await api<JobsList>(`/api/jobs?ended=0&project=${enc(id)}`);
        if (!live) return;
        setList(l);
        // The clocks count by the server's time, as the Jobs page's do.
        if (l.at) useJobs.setState({ skew: l.at - Date.now() });
      } catch {}
    };
    void read();
    const timer = window.setInterval(read, 5000);
    document.addEventListener('visibilitychange', read);
    const off = onFeatureEvent('jobs', () => void read());
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', read);
      off();
    };
  }, [id, asked]);
  return [list, () => setAsked((n) => n + 1)];
}

/** `card`: the Overview's card around it, given how many there are, whether some are left out, and its rows. */
export function ProjectJobs({ s, card }: { s: Pick<Space, 'id' | 'members'>; card: (count: number, more: boolean, body: ReactNode) => ReactNode }) {
  const ids = useMemo(() => [s.id, ...(s.members ?? [])], [s.id, s.members]);
  const [read, again] = useProjectJobs(s.id);
  // Kept to this project's also where the server would give more.
  const list = useMemo(() => (read ? filterList(read, { projects: ids }) : null), [read, ids]);
  const now = useNow();
  const { actions, byId, thenOf, overlays } = useJobActions(list, now, { reload: again });
  const most = useMediaQuery('(min-width: 640px)') ? MOST : MOST_PHONE;
  const rows = list ? [...list.running, ...list.queued, ...list.servers] : [];
  // A group's jobs come from several projects, so each row says its own.
  const one = !s.members?.length;
  return (
    <>
      {rows.length > 0 &&
        card(
          rows.length,
          rows.length > most,
          <div className="divide-y divide-line border-t border-line">
            {rows.slice(0, most).map((job) => (
              <JobRow key={job.id} job={job} now={now} waits={job.state === 'queued' ? waitsFor(job, byId) : []} then={thenOf(job)} marked={false} projectShown={one} actions={actions} />
            ))}
          </div>,
        )}
      {overlays}
    </>
  );
}
