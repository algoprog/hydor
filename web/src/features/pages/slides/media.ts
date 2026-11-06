// Videos for slides: a YouTube or Vimeo video's still, which the server fetches and keeps as a picture so it shows
// everywhere the slide does (the editor, the slideshow, a deck's own page, PowerPoint's file) without the web; and a
// video from this device, sent to the app in pieces (so no proxy's limit on a request's size stops it) and kept with
// the deck, its first frame taken here as its still. And 3D models for the web format's 3D parts: a GLB file from this
// device, kept with the deck as its pictures are.
import { post } from '../../../lib/api';
import { mu } from '../../../lib/machine';

/** A YouTube or Vimeo video's still, kept by the app ("naget-asset:<sha>"), or undefined when its site gave none. */
export async function fetchVideoStill(url: string): Promise<string | undefined> {
  try {
    return (await post<{ src: string }>('/api/pages/video-still', { url })).src;
  } catch {
    return undefined;
  }
}

/** The largest video the app keeps (as the server says), and the pieces it is sent in. */
export const MAX_VIDEO = 200 * 1024 * 1024;
const PIECE = 32 * 1024 * 1024;

/** The videos a slide takes, as a file picker asks for them. */
const VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.m4v,.mov,.webm';

/** Whether a file is a video a slide takes, by its kind or its name. */
export const isVideoFile = (f: File) => /^video\/(mp4|webm|quicktime|x-m4v)$/.test(f.type) || /\.(mp4|m4v|mov|webm)$/i.test(f.name);

/** Asks for a video file; null when none was picked. */
export function chooseVideo(): Promise<File | null> {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = VIDEO_TYPES;
    input.onchange = () => ok(input.files?.[0] ?? null);
    input.oncancel = () => ok(null);
    input.click();
  });
}

/** A video's first frame as a JPEG no wider than a slide, and the video's size; null when this browser cannot show it. */
export function firstFrame(file: Blob): Promise<{ data: string; w: number; h: number } | null> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let over = false;
    const end = (got: { data: string; w: number; h: number } | null) => {
      if (over) return;
      over = true;
      window.clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      ok(got);
    };
    // A file the browser cannot read never says so: it is given a while.
    const timer = window.setTimeout(() => end(null), 15_000);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onerror = () => end(null);
    // A hair in, which every browser draws (some draw nothing for the frame at 0 before it plays).
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.01, v.duration || 0.01);
    };
    v.onseeked = () => {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return end(null);
      const k = Math.min(1, 1280 / w);
      const c = document.createElement('canvas');
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      try {
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        end({ data: c.toDataURL('image/jpeg', 0.86), w, h });
      } catch {
        end(null);
      }
    };
    v.src = url;
  });
}

/** The largest 3D model the app keeps with a deck, as its pictures. */
export const MAX_MODEL = 12 * 1024 * 1024;

/** Asks for a 3D model (a GLB file); null when none was picked. */
export function chooseModel(): Promise<File | null> {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,model/gltf-binary';
    input.onchange = () => ok(input.files?.[0] ?? null);
    input.oncancel = () => ok(null);
    input.click();
  });
}

/** A GLB file from this device kept by the app: its source ("naget-asset:<sha>"). */
export async function uploadModel(file: File): Promise<string> {
  if (!/\.glb$/i.test(file.name) && file.type !== 'model/gltf-binary') throw new Error('That is not a GLB file (a 3D model in one file)');
  if (file.size > MAX_MODEL) throw new Error(`That model is over ${MAX_MODEL / 1024 / 1024} MB`);
  // A GLB starts with "glTF".
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...head) !== 'glTF') throw new Error('That file is not a GLB model');
  const data = await new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^;,]*/, 'data:model/gltf-binary'));
    r.onerror = () => fail(new Error('The model could not be read'));
    r.readAsDataURL(file);
  });
  return (await post<{ src: string }>('/api/pages/assets', { data, model: true })).src;
}

/** One piece of an upload, sent as it is, with how much of it went. */
function sendPiece(url: string, piece: Blob, onSent: (n: number) => void): Promise<{ received?: number; src?: string }> {
  return new Promise((ok, fail) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => onSent(e.loaded);
    xhr.onload = () => {
      let body: { received?: number; src?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) ok(body);
      else fail(new Error(body.error ?? `The video could not be sent (${xhr.status})`));
    };
    xhr.onerror = () => fail(new Error('The video could not be sent: the connection failed'));
    xhr.send(piece);
  });
}

/** A video from this device kept by the app: its source ("naget-video:<sha>"); `onProgress` hears how much went (0–1). */
export async function uploadVideo(file: File, onProgress: (share: number) => void): Promise<string> {
  if (!file.size) throw new Error('That video is empty');
  if (file.size > MAX_VIDEO) throw new Error(`That video is over ${MAX_VIDEO / 1024 / 1024} MB`);
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
  let got: { received?: number; src?: string } = {};
  for (let at = 0; at < file.size; at += PIECE) {
    const piece = file.slice(at, Math.min(file.size, at + PIECE));
    got = await sendPiece(mu(`/api/pages/videos?upload=${id}&offset=${at}&total=${file.size}`), piece, (n) => onProgress(Math.min(1, (at + n) / file.size)));
  }
  if (!got.src) throw new Error('The video did not arrive whole');
  return got.src;
}
