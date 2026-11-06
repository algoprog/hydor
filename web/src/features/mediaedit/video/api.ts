// The video editor's calls to the server (server/mediaedit/video.ts): what a video is (its length, size and sound, and
// whether ffmpeg is here), its frames for the timeline, an edit started and followed until it is made, and stopped; and
// the address the browser plays each kind of video from.
import type { VideoEditAsk, VideoEditJob, VideoFacts } from '@shared/mediaedit-video';
import { api, del, enc, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';

/** Where the browser plays a video from: a deck's ("naget-video:…"), a Library item's file, or a file's path. */
export function playUrl(src: string): string {
  const kept = /^naget-video:([a-f0-9]{16,64})$/.exec(src);
  if (kept) return mu(`/api/pages/videos/${kept[1]}`);
  const media = /^media:([a-f0-9]{10})$/.exec(src);
  if (media) return mu(`/api/media/${media[1]}/file`);
  if (src.startsWith('/api/') || /^(https?|data|blob):/.test(src)) return src.startsWith('/api/') ? mu(src) : src;
  return mu(`/api/fs/raw?path=${enc(src)}`);
}

/** Where the browser plays a sound for the music from: a Library sound, or a sound file. */
export const soundUrl = (src: string) => playUrl(src);

export const videoFacts = (src: string) => api<VideoFacts>(`/api/mediaedit/video/info?src=${enc(src)}`);

/** `n` of its frames side by side, each `h` pixels tall. */
export const stripUrl = (src: string, n: number, h: number) => mu(`/api/mediaedit/video/strip?src=${enc(src)}&n=${n}&h=${h}`);

/** An edit started, followed until it ends (`onJob` hears how far it is), then its job as it ended. */
export async function makeEdit(ask: VideoEditAsk, o: { onJob: (j: VideoEditJob) => void; signal?: { stopped: boolean } }): Promise<VideoEditJob> {
  let j = await post<VideoEditJob>('/api/mediaedit/video', ask);
  o.onJob(j);
  while (j.status === 'queued' || j.status === 'running') {
    await new Promise((r) => setTimeout(r, 600));
    j = await api<VideoEditJob>(`/api/mediaedit/video/${enc(j.job)}`);
    o.onJob(j);
  }
  return j;
}

export const stopEdit = (job: string) => del<VideoEditJob>(`/api/mediaedit/video/${enc(job)}`).catch(() => null);
