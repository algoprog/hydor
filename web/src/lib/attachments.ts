import { create } from 'zustand';
import type { QueuedMessage, TimelineItem } from '@shared/types';
import { mu } from './machine';
import { toast, useTimeline } from './store';

/**
 * A file attached to a message. Images go to the model as images; any other file is saved
 * on the host and its path is added to the message, so the agent can open it. One with a
 * `path` is already on the host (picked in Files): nothing is uploaded, the message names it.
 */
export interface Attachment {
  id: number;
  name: string;
  mediaType: string;
  size: number;
  /** Base64 contents (none for a file on the host). */
  data: string;
  image: boolean;
  /** Object URL for the thumbnail (images only); the file's own address for one on the host. */
  url?: string;
  /** A file or folder on the computer the app runs on. */
  path?: string;
  dir?: boolean;
}

// What the models accept as image input; other image types travel as files.
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_BYTES = 25 * 1024 * 1024;
let nextId = 1;

function base64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/** Reads files for attaching; `have` counts towards the per-message size limit. */
export async function readAttachments(files: FileList | File[], have: Attachment[] = []): Promise<Attachment[]> {
  const out: Attachment[] = [];
  // Files on the host go by their path, so they count for nothing.
  let total = have.reduce((n, a) => n + (a.path ? 0 : a.size), 0);
  for (const f of Array.from(files).slice(0, 20)) {
    if (total + f.size > MAX_BYTES) {
      toast(`${f.name || 'File'} not attached: a message can carry up to 25 MB of files`, 'error');
      continue;
    }
    const image = IMAGE_TYPES.has(f.type);
    out.push({
      id: nextId++,
      name: f.name || (image ? 'image.png' : 'file'),
      mediaType: f.type || 'application/octet-stream',
      size: f.size,
      data: await base64(f),
      image,
      url: image ? URL.createObjectURL(f) : undefined,
    });
    total += f.size;
  }
  return out;
}

/** A file or folder on the host as an attachment: shown like the others, sent by its path. */
export function hostAttachment(path: string, o: { size?: number; dir?: boolean; name?: string } = {}): Attachment {
  const file = path.split('/').filter(Boolean).pop() ?? path;
  const name = o.name || file;
  const image = !o.dir && /\.(png|jpe?g|gif|webp)$/i.test(file);
  return { id: nextId++, name, mediaType: '', size: o.size ?? 0, data: '', image, url: image ? mu(`/api/fs/raw?path=${encodeURIComponent(path)}`) : undefined, path, dir: o.dir };
}

/** The request fields for a message with these attachments. */
export function attachmentPayload(list: Attachment[]) {
  const sent = list.filter((a) => !a.path);
  const here = list.filter((a) => a.path).map((a) => a.path!);
  return {
    images: sent.filter((a) => a.image).map(({ mediaType, data, name }) => ({ mediaType, data, name })),
    files: sent.filter((a) => !a.image).map(({ name, data }) => ({ name, data })),
    ...(here.length ? { paths: here } : {}),
  };
}

export function releaseAttachments(list: Attachment[]) {
  for (const a of list) if (a.url && !a.path) URL.revokeObjectURL(a.url);
}

/** A sent message lists non-image attachments at its end; split them off for display. */
export function splitAttachedFiles(text: string): { text: string; files: string[] } {
  const m = /\n*Attached files:\n((?:- [^\n]+\n?)+)$/.exec(text);
  if (!m) return { text, files: [] };
  return { text: text.slice(0, m.index), files: m[1].trim().split('\n').map((l) => l.slice(2)) };
}

// ---- pictures of messages sent from this page ---------------------------------------------

/**
 * A message's own pictures come from the agent's transcript, once the agent has written the message down
 * (a moment, or up to a minute when it was sent while the agent worked), and are downloaded again then. Until
 * they have loaded, a message sent from this page shows its pictures as its box had them.
 */
export interface SentPictures {
  id: number;
  /** The message's words, as the conversation shows them. */
  text: string;
  urls: string[];
  /** How many items the session's transcript had when it was sent: the message comes after them. */
  after: number;
  /** It went to the queue, to go out when the running turn ends. */
  queued?: boolean;
  /** It went: the pictures are no longer its box's to keep. */
  own?: boolean;
  /** Its own pictures have loaded in their place, and `urls` are released. */
  done?: boolean;
}

/** By session. */
export const useSentPictures = create<{ byKey: Record<string, SentPictures[]> }>(() => ({ byKey: {} }));

const changeSent = (key: string, f: (list: SentPictures[]) => SentPictures[]) => useSentPictures.setState((s) => ({ byKey: { ...s.byKey, [key]: f(s.byKey[key] ?? []) } }));
const sentOne = (key: string, id: number) => useSentPictures.getState().byKey[key]?.find((p) => p.id === id);
const revoke = (p: SentPictures) => p.urls.forEach((u) => URL.revokeObjectURL(u));

/**
 * Session `key`'s box is sending `text` with `list` (`queued`: to the queue): the message shows their pictures
 * from here. Call the result with whether it went; one that did not keeps them in the box.
 */
export function sendingPictures(key: string, text: string, list: Attachment[], queued = false): (went: boolean) => void {
  const urls = list.filter((a) => a.image && a.url && !a.path).map((a) => a.url!);
  if (!urls.length) return () => {};
  const tl = useTimeline.getState().byKey[key];
  // Its length unknown (not loaded yet), only the message's first copy, before the transcript has it, shows them.
  const p: SentPictures = { id: nextId++, text, urls, after: tl && !(tl.loading && !tl.items.length) ? tl.total : Infinity, queued };
  changeSent(key, (l) => [...l, p]);
  return (went) => {
    if (sentOne(key, p.id)) changeSent(key, (l) => (went ? l.map((x) => (x.id === p.id ? { ...x, own: true } : x)) : l.filter((x) => x.id !== p.id)));
    // The box was left while it went: nothing shows them now.
    else if (went) revoke(p);
  };
}

/** The message shows its own pictures now: these go. It stays on the list, done, so a later one with the same words does not take its place. */
export function sentPicturesShown(key: string, id: number) {
  const p = sentOne(key, id);
  if (!p || p.done) return;
  revoke(p);
  changeSent(key, (l) => l.map((x) => (x.id === id ? { ...x, done: true } : x)));
}

/** A waiting message was changed or taken off: it shows the server's copies from now on. */
export function dropSentPictures(key: string, id: number) {
  const p = sentOne(key, id);
  if (!p) return;
  if (p.own && !p.done) revoke(p);
  changeSent(key, (l) => l.filter((x) => x.id !== id));
}

/** Session `key`'s box is gone (another session opened, the page left): its messages show their own pictures. */
export function releaseSentPictures(key: string) {
  const list = useSentPictures.getState().byKey[key];
  if (!list) return;
  for (const p of list) if (p.own && !p.done) revoke(p);
  useSentPictures.setState((s) => {
    const byKey = { ...s.byKey };
    delete byKey[key];
    return { byKey };
  });
}

/**
 * Which pictures sent from here each message of a conversation shows. In order, each message with pictures takes
 * the first sent before it with its words and number of pictures; one sent to the queue only when no other fits,
 * as it goes out after them. `items`: the first `saved` are the transcript's, the rest not in it yet.
 */
export function sentPicturesOf(list: SentPictures[] | undefined, items: TimelineItem[], saved: number): Map<string, SentPictures> {
  const out = new Map<string, SentPictures>();
  if (!list?.length) return out;
  const free = [...list];
  items.forEach((it, i) => {
    if (it.kind !== 'user' || !it.images) return;
    const text = splitAttachedFiles(it.text).text.trim();
    const fits = (p: SentPictures) => p.urls.length === it.images && p.text === text && (i >= saved || it.seq >= p.after);
    const p = free.find((x) => !x.queued && fits(x)) ?? free.find(fits);
    if (!p) return;
    out.set(it.id, p);
    free.splice(free.indexOf(p), 1);
  });
  return out;
}

/** The same for the messages waiting in the queue: each takes the first sent to the queue with its words and number of pictures. */
export function queuedPicturesOf(list: SentPictures[] | undefined, queue: QueuedMessage[]): Map<string, SentPictures> {
  const out = new Map<string, SentPictures>();
  const free = (list ?? []).filter((p) => p.queued && !p.done);
  for (const m of queue) {
    const p = free.find((x) => x.urls.length === (m.images ?? 0) && x.text === m.text.trim());
    if (!p) continue;
    out.set(m.id, p);
    free.splice(free.indexOf(p), 1);
  }
  return out;
}

/** Whether this browser can capture the screen (desktop browsers; phones cannot). */
export const canCaptureScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !matchMedia('(pointer: coarse)').matches;

/**
 * One still of a screen, window or tab the person picks in the browser's own prompt, as a PNG file;
 * null when they cancel. The capture stops as soon as the frame is taken.
 */
export async function captureScreen(): Promise<File | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    return null;
  }
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // The first frames can be blank while the capture starts.
    await new Promise((r) => setTimeout(r, 250));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return null;
    const label = stream.getVideoTracks()[0]?.label?.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return new File([blob], `${label || 'screen'}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.png`, { type: 'image/png' });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
