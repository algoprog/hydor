// What a list of job rows can do, wherever it is (the Jobs page, a project's Overview): open a job's panel, change its
// tags, stop it (after asking), take an ended one out of the list; and what that opens over the page.
import { useMemo, useState, type ReactNode } from 'react';
import type { JobEntry, JobsList } from '@shared/jobs';
import { del, enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { useConfirm } from '../../components/ui';
import { JobPanel } from './JobPanel';
import type { RowActions } from './JobRow';
import { loadJobs } from './store';
import { TagsDialog } from './TagsDialog';
import { waitedBy, waitsFor } from './words';

export interface JobActions {
  actions: RowActions;
  /** Every job of the list, by id. */
  byId: Map<string, JobEntry>;
  /** The waiting jobs that wait for one. */
  thenOf: (job: JobEntry) => JobEntry[];
  /** The panel, the tags dialog and the question before Stop, while one is open: put them anywhere on the page. */
  overlays: ReactNode;
  confirm: ReturnType<typeof useConfirm>[0];
  closePanel: () => void;
}

/**
 * `onShow`: where a job named in another row ("Waits for …", "Then: …") goes; by default its panel opens. `reload`: what
 * reads the list again after a change, besides the Jobs page's own list.
 */
export function useJobActions(list: JobsList | null, now: number, o: { onShow?: (id: string) => void; reload?: () => void } = {}): JobActions {
  const byId = useMemo(() => new Map([...(list?.running ?? []), ...(list?.queued ?? []), ...(list?.servers ?? []), ...(list?.ended ?? [])].map((j) => [j.id, j])), [list]);
  const [confirm, confirmNode] = useConfirm();
  // The job whose panel is open and the one whose tags are changed, as they stand now; each keeps the last seen if it
  // leaves the list.
  const [shown, setShown] = useState<JobEntry | null>(null);
  const showing = shown ? (byId.get(shown.id) ?? shown) : null;
  const [tagging, setTagging] = useState<JobEntry | null>(null);
  const retagged = tagging ? (byId.get(tagging.id) ?? tagging) : null;

  const reload = async () => {
    o.reload?.();
    await loadJobs();
  };

  const stop = async (job: JobEntry) => {
    const waiting = job.state === 'queued';
    const others = waitedBy(job, list?.queued ?? []).length > 0;
    const ok = await confirm({
      title: waiting ? 'Stop this queued job?' : 'Stop this job?',
      body: (
        <>
          <b translate="no" className="font-medium break-words text-fg">
            {job.name}
          </b>
          <p className="mt-1">{waiting ? 'It will not start.' : 'It stops now and does not finish. What it has done so far stays.'}</p>
          {others && <p className="mt-1">Jobs that wait for it will not start either.</p>}
        </>
      ),
      confirm: 'Stop job',
      danger: true,
    });
    if (!ok) return;
    await post(`/api/jobs/${enc(job.id)}/stop`).catch(toastError);
    await reload();
  };

  const remove = async (job: JobEntry) => {
    await del(`/api/jobs/${enc(job.id)}`).catch(toastError);
    await reload();
  };

  const thenOf = (job: JobEntry) => waitedBy(job, list?.queued ?? []);
  const show =
    o.onShow ??
    ((id: string) => {
      const job = byId.get(id);
      if (job) setShown(job);
    });
  const actions: RowActions = { onShow: show, onDetails: setShown, onTags: setTagging, onStop: (j) => void stop(j), onRemove: (j) => void remove(j) };

  const overlays = (
    <>
      {showing && (
        <JobPanel
          key={showing.id}
          job={showing}
          now={now}
          waits={showing.state === 'queued' ? waitsFor(showing, byId) : (showing.after ?? []).flatMap((id) => byId.get(id) ?? [])}
          then={thenOf(showing)}
          onShow={show}
          onTags={() => setTagging(showing)}
          onStop={() => void stop(showing)}
          onClose={() => setShown(null)}
        />
      )}
      {retagged && <TagsDialog key={retagged.id} job={retagged} inUse={list?.tags ?? []} onClose={() => setTagging(null)} />}
      {confirmNode}
    </>
  );

  return { actions, byId, thenOf, overlays, confirm, closePanel: () => setShown(null) };
}
