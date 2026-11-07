// A diagram's clipboard and the files it is saved as from the editor itself. Copied shapes go on the system clipboard
// as JSON of their own (and in this browser's storage, for where the clipboard cannot be read), so they paste into this
// diagram, another one, or another window. What else is pasted becomes what it is: draw.io's shapes (its own clipboard
// format), a Mermaid diagram, a picture, or words in a text shape. A page (or what is picked) is drawn as SVG or PNG
// here, its pictures inside it, light or dark, see-through or not, at any scale.
import { isShape, normalizeDiagram, type Diagram, type DiagramItem, type DiagramPage } from '@shared/diagram';
import { pageSvg } from '@shared/diagram-render';
import { DARK, LIGHT } from '@shared/diagram';
import { mu } from '../../../lib/machine';

const KEY = 'hydor.diagram.clipboard';
const MARK = 'hydor-diagram';

/** Puts items on the clipboard (and in this browser's own, for pasting where the clipboard cannot be read). */
export async function copyItems(items: DiagramItem[]): Promise<void> {
  const text = JSON.stringify({ [MARK]: 1, items });
  try {
    localStorage.setItem(KEY, text);
  } catch {}
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}

/** What a paste holds: items copied from a diagram, a picture, or text. */
export type Pasted = { kind: 'items'; items: DiagramItem[] } | { kind: 'image'; blob: Blob } | { kind: 'text'; text: string } | null;

const itemsOf = (text: string): DiagramItem[] | null => {
  try {
    const v = JSON.parse(text);
    if (v && v[MARK] === 1 && Array.isArray(v.items)) {
      // Checked as a page's items are.
      return normalizeDiagram({ pages: [{ items: v.items }] }).pages[0].items;
    }
  } catch {}
  return null;
};

/** What a paste event (or, without one, the clipboard) holds. */
export async function readPaste(e?: ClipboardEvent): Promise<Pasted> {
  if (e?.clipboardData) {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (file) return { kind: 'image', blob: file };
    const text = e.clipboardData.getData('text/plain');
    if (text) return itemsOf(text) ? { kind: 'items', items: itemsOf(text)! } : { kind: 'text', text };
  }
  try {
    const list = await navigator.clipboard.read();
    for (const it of list) {
      const img = it.types.find((t) => t.startsWith('image/'));
      if (img) return { kind: 'image', blob: await it.getType(img) };
      if (it.types.includes('text/plain')) {
        const text = await (await it.getType('text/plain')).text();
        const items = itemsOf(text);
        return items ? { kind: 'items', items } : { kind: 'text', text };
      }
    }
  } catch {}
  const kept = (() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  })();
  const items = kept ? itemsOf(kept) : null;
  return items ? { kind: 'items', items } : null;
}

/** Undoes raw DEFLATE (draw.io's compressed pages), in the browser. */
export async function inflateRaw(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** A file's bytes as a data: address. */
export const dataUrlOf = (b: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('The picture could not be read'));
    r.readAsDataURL(b);
  });

/** A picture kept by the app, by its address there. */
export const assetUrl = (src: string) => (src.startsWith('naget-asset:') ? mu(`/api/pages/assets/${src.slice('naget-asset:'.length)}`) : src);

/** Each picture of a page as a data: address (so a file made here holds them, and a canvas may draw them). */
async function inlinePictures(p: DiagramPage): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const it of p.items) {
    if (!isShape(it) || !it.src || out.has(it.src) || it.src.startsWith('data:')) continue;
    try {
      const r = await fetch(assetUrl(it.src), { credentials: 'same-origin' });
      if (r.ok) out.set(it.src, await dataUrlOf(await r.blob()));
    } catch {}
  }
  return out;
}

export interface DrawOpts {
  only?: Set<string>;
  dark?: boolean;
  transparent?: boolean;
  scale?: number;
}

/** A page (or what is picked of it) as an SVG file's text, its pictures inside. */
export async function svgText(d: Diagram, p: DiagramPage, o: DrawOpts = {}): Promise<{ svg: string; w: number; h: number }> {
  const pics = await inlinePictures(p);
  const { svg, box } = pageSvg(d, p, { only: o.only, theme: o.dark ? DARK : LIGHT, background: !o.transparent, src: (s) => pics.get(s) ?? s, scale: o.scale ?? 1 });
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, w: Math.round(box.w * (o.scale ?? 1)), h: Math.round(box.h * (o.scale ?? 1)) };
}

/** A page (or what is picked) as a PNG, drawn by this browser. */
export async function pngBlob(d: Diagram, p: DiagramPage, o: DrawOpts = {}): Promise<Blob> {
  const { svg, w, h } = await svgText(d, p, o);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error('The picture could not be drawn'));
      img.src = url;
    });
    const max = 16000;
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('The picture could not be made'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
