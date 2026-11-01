import { mu } from './machine';
import { toast } from './store';

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
export function hostAttachment(path: string, o: { size?: number; dir?: boolean } = {}): Attachment {
  const name = path.split('/').filter(Boolean).pop() ?? path;
  const image = !o.dir && /\.(png|jpe?g|gif|webp)$/i.test(name);
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
