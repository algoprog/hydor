// Videos still being made when their dialog closed. A video takes minutes, so closing the dialog does not stop it:
// it is followed here, and when it is done a note says so, with Insert, which hands it to the editor that asked for
// it. A video dialog opened again shows the newest one still waiting (being made, or made and not put in yet), so a
// note missed loses nothing.
import { create } from 'zustand';
import type { VideoJob } from '@shared/images';
import { useToasts } from '../../../lib/store';
import { videoJob } from './api';
import type { MadeVideo } from './store';

export interface Followed {
  job: VideoJob;
  prompt: string;
  /** The editor waiting for it (null once it has its answer). */
  done: ((v: MadeVideo | null) => void) | null;
}

/** The videos followed after their dialog closed, newest last. */
export const useFollowed = create<{ list: Followed[] }>(() => ({ list: [] }));

/** How often a video being made is asked after (in the dialog, and once it closed). */
export const POLL_OPEN = 3000;
const POLL_CLOSED = 5000;

export const madeOf = (j: VideoJob): MadeVideo | null => (j.src ? { src: j.src, poster: j.poster, w: j.w, h: j.h } : null);
export const finished = (j: VideoJob) => j.status === 'done' || j.status === 'failed';

const update = (id: string, f: (x: Followed) => Followed | null) => useFollowed.setState((s) => ({ list: s.list.flatMap((x) => (x.job.job === id ? (f(x) ?? []) : [x])) }));

/** Says the video is done (with Insert) or why it was not made; the editor waiting hears nothing until Insert. */
function announce(f: Followed) {
  const j = f.job;
  const made = madeOf(j);
  const name = f.prompt.length > 60 ? `${f.prompt.slice(0, 59)}…` : f.prompt;
  if (j.status === 'done' && made && f.done) {
    useToasts.getState().push('ok', 'The video is ready', { label: 'Insert', run: () => hand(j.job, made) }, name);
  } else if (j.status === 'failed') {
    useToasts.getState().push('error', 'The video could not be made', undefined, j.error ?? name);
    hand(j.job, null);
  }
}

/** The video to the editor that asked for it (null: none), once; it is no longer waiting. */
export function hand(id: string, made: MadeVideo | null) {
  const f = useFollowed.getState().list.find((x) => x.job.job === id);
  update(id, () => null);
  f?.done?.(made);
}

/** Follows a video whose dialog closed before it was done; `done` hears it when Insert is pressed. */
export function follow(job: VideoJob, prompt: string, done: (v: MadeVideo | null) => void) {
  useFollowed.setState((s) => ({ list: [...s.list.filter((x) => x.job.job !== job.job), { job, prompt, done }] }));
  if (finished(job)) return announce({ job, prompt, done });
  const tick = async () => {
    const f = useFollowed.getState().list.find((x) => x.job.job === job.job);
    if (!f) return;
    let j: VideoJob;
    try {
      j = await videoJob(job.job);
    } catch (e) {
      // Not found any more (the server restarted, or an hour went by): it is lost.
      useToasts.getState().push('error', 'The video being made was lost', undefined, (e as Error).message);
      return hand(job.job, null);
    }
    update(job.job, (x) => ({ ...x, job: j }));
    const now = useFollowed.getState().list.find((x) => x.job.job === job.job);
    if (!now) return;
    if (finished(j)) return announce(now);
    window.setTimeout(() => void tick(), POLL_CLOSED);
  };
  window.setTimeout(() => void tick(), POLL_CLOSED);
}

/** The newest video still waiting, taken back by a dialog opened again: no longer followed here, its editor told it went elsewhere. */
export function takeBack(): Followed | null {
  const list = useFollowed.getState().list;
  const f = list[list.length - 1];
  if (!f) return null;
  update(f.job.job, () => null);
  f.done?.(null);
  return { ...f, done: null };
}
