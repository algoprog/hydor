// The LaTeX editor's calls: typesetting the document as it is in the editor (saved or not), what this computer has
// for LaTeX, the addresses of a typesetting's pages and PDF, SyncTeX both ways, and pictures and files added from
// the device (a picture LaTeX cannot take, a GIF, WebP or SVG, becomes a PNG first; a PDF becomes one on the server).
import { cleanTexName, extOf, TEX_FILE_EXT, type TexCompiled, type TexDoc, type TexSetup } from '@shared/latex';
import { api, enc, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';
import { uploadPicture } from '../pictures';

/** `folder`: a file's document (opened from Files), typeset among the other files of its folder. */
export const typeset = (model: TexDoc, base: string | undefined, folder?: string, signal?: AbortSignal) =>
  api<TexCompiled>('/api/pages/tex/compile', { method: 'POST', body: { model, base, folder }, signal });

let setupOnce: Promise<TexSetup> | null = null;
/** What this computer has (asked once; again after a failure). */
export function texSetup(): Promise<TexSetup> {
  setupOnce ??= api<TexSetup>('/api/pages/tex/setup').catch((e) => {
    setupOnce = null;
    throw e;
  });
  return setupOnce;
}

export const pageUrl = (key: string, page: number, width: number) => mu(`/api/pages/tex/${key}/${page}?w=${width}`);
export const pdfUrl = (key: string) => mu(`/api/pages/tex/${key}/pdf`);
export const assetUrl = (src: string) => mu(`/api/pages/assets/${src.slice('naget-asset:'.length)}`);

/** The source of a point of a page (in points from its top left), or null. */
export async function sourceAt(key: string, page: number, x: number, y: number): Promise<{ file: string; line: number } | null> {
  const r = await api<{ file?: string; line?: number }>(`/api/pages/tex/${key}/sync?page=${page}&x=${x.toFixed(1)}&y=${y.toFixed(1)}`);
  return r.file && r.line ? { file: r.file, line: r.line } : null;
}

/** Where a line of the source shows: its page and box, in points from the page's top left; or null. */
export async function placeOf(key: string, file: string, line: number): Promise<{ page: number; x: number; y: number; w: number; h: number } | null> {
  const r = await api<{ page?: number; x?: number; y?: number; w?: number; h?: number }>(`/api/pages/tex/${key}/place?file=${enc(file)}&line=${line}`);
  return r.page ? { page: r.page, x: r.x ?? 0, y: r.y ?? 0, w: r.w ?? 0, h: r.h ?? 0 } : null;
}

/** A file's name as a document may have it: its own, odd characters made dashes, `ext` when it has none of its kind. */
export function cleanName(name: string, kind: 'file' | 'picture', ext = kind === 'file' ? 'tex' : 'png'): string {
  let n = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[^A-Za-z0-9_.+-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  if (!n) n = kind === 'file' ? 'file' : 'picture';
  const e = extOf(n);
  const ok = kind === 'file' ? TEX_FILE_EXT.includes(e) : ['png', 'jpg', 'jpeg'].includes(e);
  if (!ok) n = `${e ? n.slice(0, -e.length - 1) : n}.${ext}`;
  return cleanTexName(n, kind) ?? `${kind === 'file' ? 'file' : 'picture'}.${ext}`;
}

/** `name`, or name-2, name-3… when a file or picture of the document has it already. */
export function freeName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const e = extOf(name);
  const stem = e ? name.slice(0, -e.length - 1) : name;
  for (let i = 2; ; i++) {
    const n = `${stem}-${i}${e ? `.${e}` : ''}`;
    if (!lower.has(n.toLowerCase())) return n;
  }
}

const readData = (file: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('The file could not be read'));
    r.readAsDataURL(file);
  });

/** A picture the browser shows (GIF, WebP, SVG…) drawn as a PNG, no larger than it needs to be. */
async function asPng(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('That file is not a picture this browser can show'));
      i.src = url;
    });
    const nw = img.naturalWidth || 1200;
    const nh = img.naturalHeight || 900;
    // Drawings (SVG) are drawn large enough to stay sharp in print.
    const k = Math.min(2400 / Math.max(nw, nh), file.type === 'image/svg+xml' ? 2400 / Math.max(nw, nh) : 1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(nw * k));
    c.height = Math.max(1, Math.round(nh * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A picture from the device, kept by the app, with the name it goes by in the document: a PNG or JPEG as it is (made
 * smaller when large), a PDF made into a PNG of its first page by the server, any other picture drawn as a PNG.
 */
export async function addPicture(file: File, taken: string[]): Promise<{ name: string; src: string }> {
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (pdf) {
    const r = await post<{ name: string; src: string }>('/api/pages/tex/picture', { name: file.name, data: await readData(file) });
    return { name: freeName(cleanName(r.name, 'picture'), taken), src: r.src };
  }
  if (/\.eps$/i.test(file.name) || file.type === 'application/postscript') throw new Error('EPS pictures cannot be added: save it as PDF or PNG first.');
  if (file.type === 'image/png' || file.type === 'image/jpeg') {
    const r = await uploadPicture(file);
    // A large picture comes back as a JPEG unless it was a PNG.
    return { name: freeName(cleanName(file.name, 'picture', file.type === 'image/png' ? 'png' : 'jpg'), taken), src: r.src };
  }
  const data = await asPng(file);
  const r = await post<{ src: string }>('/api/pages/assets', { data });
  return { name: freeName(cleanName(file.name.replace(/\.[^.]+$/, '.png'), 'picture'), taken), src: r.src };
}

/** A text file from the device (a .tex, .bib, .sty…), with the name it goes by in the document. */
export async function addFileFromDevice(file: File, taken: string[]): Promise<{ name: string; text: string }> {
  if (file.size > 2 * 1024 * 1024) throw new Error(`${file.name} is over 2 MB`);
  if (!TEX_FILE_EXT.includes(extOf(file.name))) throw new Error(`${file.name} is not a file LaTeX reads here (.tex, .bib, .sty, .cls…)`);
  return { name: freeName(cleanName(file.name, 'file'), taken), text: await file.text() };
}

/** Asks for files from the device (`accept`: what the chooser shows); none when none were picked. */
export function chooseFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => ok([...(input.files ?? [])]);
    input.oncancel = () => ok([]);
    input.click();
  });
}

export const PICTURE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf,.pdf';
export const FILE_ACCEPT = TEX_FILE_EXT.map((e) => `.${e}`).join(',');
