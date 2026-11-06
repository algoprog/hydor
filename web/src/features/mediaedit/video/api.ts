// The video editor's calls to the server (server/mediaedit/video.ts): what a video, a picture or a sound is (its length,
// size and sound, and whether ffmpeg is here), a video's frames and a sound's shape for the timeline, what this ffmpeg
// can make (and the graphics card), a sound from this device or the microphone kept, captions from what is said, an
// edit started and followed until it is made, and stopped; and the address the browser plays each kind of source from.
import type { VideoEditAsk, VideoEditJob, VideoFacts, VideoText } from '@shared/mediaedit-video';
import { api, del, enc, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';

/** Where the browser plays a source from: a deck's video or picture, a Library item's file, a sound kept here, or a file's path. */
export function playUrl(src: string): string {
  const kept = /^naget-video:([a-f0-9]{16,64})$/.exec(src);
  if (kept) return mu(`/api/pages/videos/${kept[1]}`);
  const pic = /^naget-asset:([a-f0-9]{16,64})$/.exec(src);
  if (pic) return mu(`/api/pages/assets/${pic[1]}`);
  const snd = /^naget-sound:([a-f0-9]{16,64})$/.exec(src);
  if (snd) return mu(`/api/mediaedit/video/sound/${snd[1]}`);
  const media = /^media:([a-f0-9]{10})$/.exec(src);
  if (media) return mu(`/api/media/${media[1]}/file`);
  if (src.startsWith('/api/') || /^(https?|data|blob):/.test(src)) return src.startsWith('/api/') ? mu(src) : src;
  return mu(`/api/fs/raw?path=${enc(src)}`);
}

export const videoFacts = (src: string) => api<VideoFacts>(`/api/mediaedit/video/info?src=${enc(src)}`);

/** `n` of a video's frames side by side, each `h` pixels tall, from `from` to `to` (seconds of it). */
export const stripUrl = (src: string, n: number, h: number, from?: number, to?: number) => mu(`/api/mediaedit/video/strip?src=${enc(src)}&n=${n}&h=${h}${from !== undefined && to !== undefined ? `&from=${from.toFixed(2)}&to=${to.toFixed(2)}` : ''}`);

const peaksKept = new Map<string, Promise<number[] | null>>();
/** How loud a video's or a sound's sound is along its length (`n` levels, 0–1), asked once. */
export function soundShape(src: string, n: number): Promise<number[] | null> {
  const key = `${src}\0${n}`;
  let p = peaksKept.get(key);
  if (!p) {
    p = api<{ peaks: number[] | null }>(`/api/mediaedit/video/peaks?src=${enc(src)}&n=${n}`).then(
      (r) => r.peaks,
      () => null,
    );
    peaksKept.set(key, p);
  }
  return p;
}

export interface Encoders {
  ffmpeg: boolean;
  h264: boolean;
  h265: boolean;
  av1: boolean;
  webm: boolean;
  gpu: { mode: 'auto' | 'off'; forcedOff?: boolean; checked: boolean; checking?: boolean; found: { label: string; api: string; encoders: Record<string, string> } | null; broken?: string[] };
}
export const encoders = () => api<Encoders>('/api/mediaedit/video/encoders');

/** A sound from this device or the microphone, kept by the editor: its source ("naget-sound:…") and length. */
export async function keepSound(blob: Blob): Promise<{ src: string; duration: number }> {
  const r = await fetch(mu('/api/mediaedit/video/sound'), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: blob, credentials: 'same-origin' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `The sound could not be sent (${r.status})`);
  return body;
}

/** A picture from this device kept as a deck's picture would be: its source ("naget-asset:…"). */
export async function keepPicture(file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error('That picture is over 12 MB');
  const data = await new Promise<string>((ok, fail) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = () => fail(new Error('The picture could not be read'));
    fr.readAsDataURL(file);
  });
  return (await post<{ src: string }>('/api/pages/assets', { data })).src;
}

/** Captions from what is said in the edit (its clips' sound and its voice-over), with their times. */
export const makeCaptions = (ask: Pick<VideoEditAsk, 'src' | 'recipe'> & { lang?: string }, signal?: AbortSignal) =>
  api<{ captions: Pick<VideoText, 'from' | 'to' | 'text'>[]; srt: string }>('/api/mediaedit/video/captions', { method: 'POST', body: ask, signal });

/** An edit started, followed until it ends (`onJob` hears how far it is), then its job as it ended. */
export async function makeEdit(ask: VideoEditAsk, o: { onJob: (j: VideoEditJob) => void }): Promise<VideoEditJob> {
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
