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

/** Where an element is laid out on the page, whatever is scrolled: its offsets, up to the top. */
function layoutTop(el: HTMLElement): number {
  let y = 0;
  for (let x: HTMLElement | null = el; x; x = x.offsetParent as HTMLElement | null) y += x.offsetTop;
  return y;
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
        // What loads above it after (a profile, a list) pushes it down: follow it for a moment.
        let top = layoutTop(row);
        const settle = Date.now() + 2000;
        const follow = () => {
          if (!row.isConnected || Date.now() > settle) return;
          const now = layoutTop(row);
          if (Math.abs(now - top) > 8) {
            top = now;
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
          setTimeout(follow, 150);
        };
        setTimeout(follow, 150);
        return resolve(true);
      }
      if (Date.now() > until) return resolve(false);
      setTimeout(look, 120);
    };
    look();
  });
}
