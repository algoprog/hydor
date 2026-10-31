// Ctrl+F in a session: finds text in its messages, the ones not loaded yet too, and moves between
// matches (Enter: older, Shift+Enter: newer). The words light up in place.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { api, enc } from '../../lib/api';
import { useTimeline } from '../../lib/store';
import { cx, Throbber, IconButton } from '../../components/ui';
import { UNFOLD } from './items';

type Highlights = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
const highlights = () => (CSS as unknown as { highlights?: Highlights }).highlights;

/** Marks every occurrence of `q` inside `el` (CSS Custom Highlight API, so the page itself is untouched). */
function mark(el: HTMLElement | null, q: string) {
  const reg = highlights();
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!reg || !H) return;
  reg.delete('wa-find');
  if (!el || !q) return;
  const needle = q.toLowerCase();
  const ranges: Range[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent ?? '').toLowerCase();
    for (let i = t.indexOf(needle); i >= 0; i = t.indexOf(needle, i + needle.length)) {
      const r = new Range();
      r.setStart(n, i);
      r.setEnd(n, i + needle.length);
      ranges.push(r);
    }
  }
  reg.set('wa-find', new H(...ranges));
}

/** Loads older pages until the item is there, then scrolls it into view. */
async function reveal(key: string, seq: number, q: string) {
  for (let guard = 0; (useTimeline.getState().byKey[key]?.start ?? 0) > seq && guard < 200; guard++) await useTimeline.getState().loadEarlier(key);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  let el = document.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
  // A folded message of yours opens, so what was found is in sight.
  el?.dispatchEvent(new Event(UNFOLD));
  if (!el) {
    // Inside a folded work log: the nearest shown item before it.
    const shown = [...document.querySelectorAll<HTMLElement>('[data-seq]')].filter((e) => Number(e.dataset.seq) <= seq);
    el = shown[shown.length - 1] ?? null;
  }
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.remove('find-flash');
  void el.offsetWidth;
  el.classList.add('find-flash');
  mark(el, q);
}

/** `first`: words to look for at once (from the search box). */
export function FindBar({ sessionKey, first, onClose }: { sessionKey: string; first?: string; onClose: () => void }) {
  const [q, setQ] = useState(first ?? '');
  const [found, setFound] = useState<number[] | null>(null);
  const [cur, setCur] = useState(-1);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => highlights()?.delete('wa-find'), []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setFound(null);
      highlights()?.delete('wa-find');
      return;
    }
    const ctl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      api<{ matches: { seq: number }[] }>(`/api/sessions/${enc(sessionKey)}/find?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => {
          const seqs = r.matches.map((m) => m.seq);
          setFound(seqs);
          // Start from the newest match, the one closest to where you are.
          setCur(seqs.length - 1);
          if (seqs.length) reveal(sessionKey, seqs[seqs.length - 1], term);
          else highlights()?.delete('wa-find');
        })
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, sessionKey]);

  const step = (d: -1 | 1) => {
    if (!found?.length) return;
    const i = (cur + d + found.length) % found.length;
    setCur(i);
    reveal(sessionKey, found[i], q.trim());
  };

  return (
    <div className="anim-pop absolute top-2 right-3 z-20 flex items-center gap-1 rounded-xl border border-line bg-elevated py-1 pr-1 pl-3 shadow-lg sm:right-6">
      <input
        ref={input}
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? 1 : -1);
          }
        }}
        placeholder="Find in this session"
        className="h-7 w-44 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3 sm:w-56"
      />
      <span className={cx('tnum min-w-[52px] text-right text-[12px]', found && !found.length ? 'text-err' : 'text-fg-3')}>
        {busy ? <Throbber /> : found ? (found.length ? `${cur + 1} of ${found.length}` : 'None') : ''}
      </span>
      <IconButton label="Older match (Enter)" size="sm" onClick={() => step(-1)} disabled={!found?.length}>
        <ChevronUp size={15} />
      </IconButton>
      <IconButton label="Newer match (Shift+Enter)" size="sm" onClick={() => step(1)} disabled={!found?.length}>
        <ChevronDown size={15} />
      </IconButton>
      <IconButton label="Close (Esc)" size="sm" onClick={onClose}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
