// What Copy and Cut put on the clipboard in the slides editor, and how Paste tells it from anything else. Parts (or
// slides) copied are kept here, to paste on another slide or in another deck while the app is open, and are written to the
// system clipboard too: their words as plain text (so they paste as words anywhere), and as HTML carrying a marker that
// names this copy. Paste uses the parts kept here only while the clipboard still holds that marker (or, when a browser
// strips the marker, the very words that were written); once something else was copied, in this app or another one, the
// paste is what is on the clipboard now: a picture, or words as a new text box. A paste is never swallowed.
import { type Deck, type El, type Slide } from '@shared/slides';
import { partName } from './ops';

/** What was copied: parts of a slide, or slides (of the deck they were copied in, and which). */
export interface Clip {
  parts?: El[];
  slides?: { from: Deck; picks: number[] };
  /** Names this copy on the system clipboard. */
  token: string;
  /** The words written as plain text. */
  text: string;
}

export const MARK = 'data-hydor-slides';

let kept: Clip | null = null;
export const getClip = () => kept;
export const setClip = (c: Clip | null) => {
  kept = c;
};

const nl = (s: string) => s.replace(/\r\n?/g, '\n');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The words of parts: a text's paragraphs, a table's rows (cells with tabs), else the parts' names. */
export function wordsOf(els: El[]): string {
  const out: string[] = [];
  for (const e of els) {
    if (e.type === 'text' || e.type === 'shape') {
      const t = e.paras.map((p) => p.runs.map((r) => r.t).join('')).join('\n');
      if (t.trim()) out.push(t);
    } else if (e.type === 'table') out.push(e.rows.map((r) => r.join('\t')).join('\n'));
    else if (e.type === 'group') {
      const t = wordsOf(e.els);
      if (t) out.push(t);
    }
  }
  return out.length ? out.join('\n') : els.map(partName).join('\n');
}

/** The words of slides: their titles, one to a line (a deck's slides pasted elsewhere are words). */
export function slideWords(slides: Slide[]): string {
  return slides.map((s) => wordsOf(s.els.filter((e) => e.type === 'text' || e.type === 'shape').slice(0, 1)) || '').join('\n');
}

/** The HTML for a copy: its words as paragraphs, in a box that carries the marker. */
export function htmlFor(c: Clip): string {
  return `<meta charset="utf-8"><div ${MARK}="${c.token}">${nl(c.text)
    .split('\n')
    .map((l) => `<p>${esc(l)}</p>`)
    .join('')}</div>`;
}

/** Whether what the clipboard holds is still this copy: it carries its marker, or it is the words that were written. */
export function holds(c: Clip | null, html: string, text: string): boolean {
  if (!c) return false;
  if (html.includes(`${MARK}="${c.token}"`)) return true;
  // A browser that strips the marker: the same words, and nothing but them.
  return !html.includes(MARK) && !!text.trim() && nl(text).trim() === nl(c.text).trim();
}

/** A new copy, kept here, and its words and HTML for the system clipboard. */
export function copied(what: { parts?: El[]; slides?: { from: Deck; picks: number[] } }, text: string): Clip {
  const c: Clip = { ...what, token: Math.random().toString(36).slice(2, 12), text };
  kept = c;
  return c;
}

/** Writes a copy to the system clipboard (its words, and its HTML with the marker). Where the browser will not, only the app holds it. */
export async function writeSystem(c: Clip): Promise<void> {
  const html = htmlFor(c);
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([c.text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      return;
    }
  } catch {
    // Not allowed (no focus, no permission): the copy event below.
  }
  const on = (e: ClipboardEvent) => {
    e.preventDefault();
    e.clipboardData?.setData('text/plain', c.text);
    e.clipboardData?.setData('text/html', html);
  };
  document.addEventListener('copy', on, { once: true });
  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', on);
  }
}

/** What the system clipboard holds now, where the browser lets it be read (Edit → Paste): its HTML, its words, a picture; null when it does not. */
export async function readSystem(): Promise<{ html: string; text: string; image?: File } | null> {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      let html = '';
      let text = '';
      let image: File | undefined;
      for (const it of items) {
        if (it.types.includes('text/html')) html += await (await it.getType('text/html')).text();
        if (it.types.includes('text/plain')) text += await (await it.getType('text/plain')).text();
        const img = it.types.find((t) => t.startsWith('image/'));
        if (img && !image) {
          const b = await it.getType(img);
          image = new File([b], `pasted.${img.slice(6).replace('jpeg', 'jpg')}`, { type: img });
        }
      }
      return { html, text, image };
    }
    if (navigator.clipboard?.readText) return { html: '', text: await navigator.clipboard.readText() };
  } catch {
    // Not allowed: the keyboard's paste still works.
  }
  return null;
}
