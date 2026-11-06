// The typeset pages' words (shared/latex-pdfwords.ts), for the preview: an invisible layer of them over each page in
// view, so words can be picked on a page as on any page of text (and what is picked goes to its place in the source),
// and Find in the pages (Ctrl+F over them): every match marked, the current one apart, Enter to the next (Shift+Enter
// the one before), each taking the source to its line.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { findInPages, type PdfMatch, type PdfPageWords } from '@shared/latex-pdfwords';
import { IconButton } from '../../../components/ui';
import { pdfWords } from './api';

/** The words of the typesetting on screen, read a moment after it shows. */
export function usePdfWords(key: string | null, on: boolean): PdfPageWords[] | null {
  const [got, setGot] = useState<{ key: string; pages: PdfPageWords[] } | null>(null);
  useEffect(() => {
    if (!key || !on || got?.key === key) return;
    let alive = true;
    const t = setTimeout(
      () =>
        void pdfWords(key).then(
          (pages) => alive && setGot({ key, pages }),
          () => {},
        ),
      700,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, on]);
  return got && got.key === key ? got.pages : null;
}

/** A page's words, invisible over its picture, to pick (`k`: pixels a point). */
export function TextLayer({ words, page, k }: { words: PdfPageWords; page: number; k: number }) {
  return (
    <div data-pdf-text={page} className="absolute inset-0 select-text [&_span::selection]:bg-accent/35">
      {words.words.map((w, i) => (
        <span
          key={i}
          data-i={i}
          className="absolute leading-none whitespace-pre text-transparent"
          style={{ left: w[1] * k, top: w[2] * k, width: w[3] * k, height: w[4] * k, fontSize: Math.max(4, w[4] * k * 0.9) }}
        >
          {`${w[0]} `}
        </span>
      ))}
    </div>
  );
}

/** The matches on a page, marked (the current one apart). */
export function Marks({ list, current, k }: { list: PdfMatch[]; current: PdfMatch | null; k: number }) {
  return (
    <>
      {list.flatMap((m, i) =>
        m.boxes.map((b, j) => (
          <div
            key={`${i}:${j}`}
            className={m === current ? 'pointer-events-none absolute rounded-[2px] bg-accent/45 ring-1 ring-accent' : 'pointer-events-none absolute rounded-[2px] bg-[#f5b400]/35'}
            style={{ left: b.x * k - 1, top: b.y * k - 1, width: b.w * k + 2, height: b.h * k + 2 }}
          />
        )),
      )}
    </>
  );
}

/** Find in the pages: the words looked for, its matches, and which one is current. */
export function usePdfFind(pages: PdfPageWords[] | null) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cur, setCur] = useState(0);
  const matches = useMemo(() => (open && pages && q.trim() ? findInPages(pages, q) : []), [open, pages, q]);
  useEffect(() => setCur(0), [q, pages]);
  return { open, setOpen, q, setQ, cur: matches.length ? Math.min(cur, matches.length - 1) : -1, setCur, matches };
}

export function PdfFindBar({ find, loading, onGo }: { find: ReturnType<typeof usePdfFind>; loading: boolean; onGo: (i: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (find.open) input.current?.select();
  }, [find.open]);
  const n = find.matches.length;
  const go = (d: number) => {
    if (!n) return;
    const i = (find.cur + d + n) % n;
    find.setCur(i);
    onGo(i);
  };
  return (
    <div className="absolute top-2 right-3 z-20 flex w-[min(360px,calc(100%-24px))] items-center gap-1 rounded-xl border border-line bg-elevated px-2 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
      <input
        ref={input}
        autoFocus
        value={find.q}
        onChange={(e) => find.setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            go(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') find.setOpen(false);
        }}
        placeholder="Find in the pages"
        aria-label="Find in the pages"
        className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-fg outline-none placeholder:text-fg-3"
      />
      <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{loading ? '…' : find.q.trim() ? (n ? `${find.cur + 1}/${n}` : '0/0') : ''}</span>
      <IconButton label="The one before (Shift+Enter)" size="sm" disabled={!n} onClick={() => go(-1)}>
        <ChevronUp size={14} />
      </IconButton>
      <IconButton label="The next (Enter)" size="sm" disabled={!n} onClick={() => go(1)}>
        <ChevronDown size={14} />
      </IconButton>
      <IconButton label="Close" size="sm" onClick={() => find.setOpen(false)}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
