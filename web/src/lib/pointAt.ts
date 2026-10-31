// Points at something on a page by its words. The search box opens a page with `find=<words>`; this waits for
// the setting, note or row that says them to show (pages load what they list), scrolls it to the middle and
// lights it up for a moment.
import { fold } from '@shared/find';

const norm = (s: string) => fold(s).replace(/\s+/g, ' ').trim();

/** The element under `root` whose own text is `words`; for a long one (a note), one whose text holds them. */
export function elementSaying(root: ParentNode, words: string): HTMLElement | null {
  const want = norm(words);
  if (!want) return null;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let holder: HTMLElement | null = null;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || !el.offsetParent || el.closest('input, textarea, [contenteditable="true"]')) continue;
    const own = norm(el.textContent ?? '');
    if (own === want) return el;
    if (!holder && want.length > 24 && own.includes(want)) holder = el;
  }
  return holder;
}

/** The row an element is in: the item of a list, or a section's part; else a step up. */
function rowOf(el: HTMLElement): HTMLElement {
  let x: HTMLElement | null = el;
  for (let i = 0; x && i < 8; i++, x = x.parentElement) {
    const p: HTMLElement | null = x.parentElement;
    if (!p) break;
    if (p.classList.contains('divide-y') || p.tagName === 'SECTION' || p.getAttribute('role') === 'list') return x;
  }
  return el.parentElement ?? el;
}

/** Outlines an element for a couple of seconds. */
export function flash(el: HTMLElement) {
  el.classList.remove('find-point');
  void el.offsetWidth;
  el.classList.add('find-point');
}

/** Waits up to `ms` for the words to show under `root`, then points at them. Whether it found them. */
export function pointAt(root: () => ParentNode | null, words: string, ms = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const until = Date.now() + ms;
    const look = () => {
      const r = root();
      const el = r && elementSaying(r, words);
      if (el) {
        const row = rowOf(el);
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(row);
        return resolve(true);
      }
      if (Date.now() > until) return resolve(false);
      setTimeout(look, 120);
    };
    look();
  });
}
