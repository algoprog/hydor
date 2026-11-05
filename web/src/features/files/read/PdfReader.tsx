// Files' reader for PDFs (Highlight, beside Fill & sign): the pages drawn by the app's PDF code, their words laid over
// them as transparent text the browser selects (a long press on a phone, with its handles), and the highlights kept
// beside the file (server/pdfnotes) drawn over their words at any zoom. Selecting words, or dragging a box around a
// figure or an equation (Select an area, or Alt and drag with a mouse), brings a small bar: four colours, Note, Ask
// (Files' Ask beside the file, with the words or a picture of the part and its page) and Copy; a highlight clicked
// brings it too, with Delete. Notes lists them all beside the pages (a sheet on a phone). Zoom: a pinch, Ctrl with the
// wheel, Ctrl+= and Ctrl+−, Fit width (Ctrl+0).
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Copy, Highlighter, NotebookPen, Sparkles, SquareDashedMousePointer, StickyNote, Trash2, X } from 'lucide-react';
import { HIGHLIGHT_COLORS, joinLines, type HighlightColor, type PdfHighlight, type PdfNotesView, type PdfRect, type TextRun } from '@shared/pdfnotes';
import { api, enc } from '../../../lib/api';
import { useFeatureEvent } from '../../../lib/featureEvents';
import { toast, toastError, useToasts } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { Button, cx, Empty, IconButton, Popover, SheetsOnPhone, Throbber, useIsMobile } from '../../../components/ui';
import type { PdfInfo } from '../fill/model';
import { askAbout } from '../FileAsk';
import { NotesList, NotesMenu } from './NotesPanel';
import {
  areaPicture,
  changeNotes,
  COLOR_NAMES,
  copyWords,
  deepOf,
  hitHighlight,
  keepColor,
  lastColor,
  loadNotes,
  newId,
  pageRuns,
  pageUrl,
  piecesOf,
  pointOf,
  rgbOf,
  TAB,
  wordsOf,
  wordWidth,
  type PagePiece,
} from './notes';

/** What the bar is for: words selected, an area dragged, or a highlight clicked. */
type Pick = { kind: 'text'; pieces: PagePiece[]; text: string } | { kind: 'area'; page: number; rect: PdfRect } | { kind: 'mark'; id: string };

const NOTES_KEY = 'wa.pdf.notes';

/** The words inside a box, from a page's runs: characters whose middle is in it. */
function wordsInBox(runs: TextRun[] | undefined, b: PdfRect): string {
  const parts: string[] = [];
  for (const r of runs ?? []) {
    const my = r.y + r.h / 2;
    if (my < b.y || my > b.y + b.h || r.x > b.x + b.w || r.x + r.w < b.x) continue;
    let s = '';
    for (let i = 0; i < r.t.length; i++) {
      const mx = (r.e[i] + r.e[i + 1]) / 2;
      if (mx >= b.x && mx <= b.x + b.w) s += r.t[i];
      else if (s && !s.endsWith(' ')) s += ' ';
    }
    if (s.trim()) parts.push(s.trim());
  }
  return joinLines(parts);
}

export function PdfReader({ path, mtime, canAsk, onClose, onFileSaved }: { path: string; mtime: number; canAsk: boolean; onClose: () => void; onFileSaved: (saved: { path: string; replaced: boolean }) => void }) {
  const mobile = useIsMobile();
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [error, setError] = useState('');
  const [hs, setHs] = useState<PdfHighlight[]>([]);
  const [kept, setKept] = useState<PdfNotesView['kept']>(undefined);
  const [pick, setPick] = useState<Pick | null>(null);
  const [areaMode, setAreaMode] = useState(false);
  const [notesOpen, setNotesOpen] = useState(() => !mobile && localStorage.getItem(NOTES_KEY) === '1');
  const [editing, setEditing] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [box, setBox] = useState<{ page: number; rect: PdfRect } | null>(null);
  const [near, setNear] = useState<Set<number>>(() => new Set([1, 2]));
  const [runsV, setRunsV] = useState(0);
  const runs = useRef(new Map<number, TextRun[]>());
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const notesBtn = useRef<HTMLButtonElement>(null);
  const noteAnchor = useRef<HTMLDivElement>(null);
  const [colW, setColW] = useState(0);
  const [wideReader, setWideReader] = useState(true);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const width = Math.round(colW * zoom);
  const hsRef = useRef(hs);
  hsRef.current = hs;

  useEffect(() => {
    if (!mobile) localStorage.setItem(NOTES_KEY, notesOpen ? '1' : '0');
  }, [notesOpen, mobile]);

  // ---- loading -------------------------------------------------------------------------------------------------

  useEffect(() => {
    let alive = true;
    api<PdfInfo>(`/api/pdf/info?path=${enc(path)}`)
      .then((r) => alive && setInfo(r))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [path, mtime]);

  const rev = useRef(0);
  const reload = useCallback(() => {
    const mine = rev.current;
    loadNotes(path).then(
      (v) => {
        if (rev.current !== mine) return;
        setHs(v.highlights);
        setKept(v.kept);
      },
      (e) => setError((e as Error).message),
    );
  }, [path]);
  useEffect(() => {
    runs.current = new Map();
    setRunsV((n) => n + 1);
    reload();
  }, [reload, mtime]);
  // Changes made elsewhere (another tab, an agent): taken in.
  useFeatureEvent('pdfnotes', (e) => {
    const d = e.data as { path?: string; from?: string } | null;
    if (d?.path === path && d.from !== TAB) reload();
  });

  // The pages near the view get their words (and keep them).
  useEffect(() => {
    let alive = true;
    for (const n of near) {
      if (runs.current.has(n)) continue;
      pageRuns(path, n, mtime).then(
        (r) => {
          if (!alive) return;
          runs.current.set(n, r);
          setRunsV((v) => v + 1);
        },
        () => {},
      );
    }
    return () => {
      alive = false;
    };
  }, [near, path, mtime]);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !info) return;
    const io = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const en of entries) {
            const n = Number((en.target as HTMLElement).dataset.page);
            if (en.isIntersecting && !next.has(n)) ((changed = true), next.add(n));
          }
          return changed ? next : prev;
        });
      },
      { root: sc, rootMargin: '150% 0px' },
    );
    pageEls.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [info, colW]);

  // ---- size and zoom (as Fill & sign's) -------------------------------------------------------------------------

  useLayoutEffect(() => {
    const el = scroller.current;
    const host = root.current;
    if (!el || !host) return;
    const fit = () => {
      setColW(Math.max(200, Math.min(920, el.clientWidth - (mobile ? 16 : 48))));
      setWideReader(host.clientWidth >= 860);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(host);
    return () => ro.disconnect();
  }, [mobile, info]);

  const anchor = useRef<{ fx: number; fy: number; px: number; py: number } | null>(null);
  const zoomTo = useCallback((z: number, x?: number, y?: number) => {
    const sc = scroller.current;
    const next = Math.max(1, Math.min(4, z));
    if (!sc || Math.abs(next - zoomRef.current) < 0.001) return;
    const px = x ?? sc.clientWidth / 2;
    const py = y ?? sc.clientHeight / 2;
    anchor.current ??= { fx: (sc.scrollLeft + px) / Math.max(1, sc.scrollWidth), fy: (sc.scrollTop + py) / Math.max(1, sc.scrollHeight), px, py };
    setZoom(next);
  }, []);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const sc = scroller.current;
    const a = anchor.current;
    anchor.current = null;
    if (!sc || !a) return;
    sc.scrollLeft = a.fx * sc.scrollWidth - a.px;
    sc.scrollTop = a.fy * sc.scrollHeight - a.py;
  }, [zoom]);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; z: number } | null = null;
    const spread = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) pinch = { d: spread(), z: zoomRef.current };
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        const r = sc.getBoundingClientRect();
        zoomTo((pinch.z * spread()) / Math.max(1, pinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    };
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = sc.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY / 400), e.clientX - r.left, e.clientY - r.top);
    };
    sc.addEventListener('pointerdown', down);
    sc.addEventListener('pointermove', move);
    sc.addEventListener('pointerup', up);
    sc.addEventListener('pointercancel', up);
    sc.addEventListener('wheel', wheel, { passive: false });
    return () => {
      sc.removeEventListener('pointerdown', down);
      sc.removeEventListener('pointermove', move);
      sc.removeEventListener('pointerup', up);
      sc.removeEventListener('pointercancel', up);
      sc.removeEventListener('wheel', wheel);
    };
  }, [zoomTo]);

  // ---- keeping the notes ------------------------------------------------------------------------------------------

  const send = useCallback(
    (put: PdfHighlight[], remove: string[] = []) => {
      const mine = ++rev.current;
      changeNotes(path, { put, remove }).then(
        (v) => {
          if (rev.current !== mine) return;
          setHs(v.highlights);
          setKept(v.kept);
        },
        (e) => {
          toastError(e);
          reload();
        },
      );
    },
    [path, reload],
  );
  const put = useCallback(
    (list: PdfHighlight[]) => {
      setHs((prev) => {
        const next = [...prev];
        for (const h of list) {
          const i = next.findIndex((x) => x.id === h.id);
          if (i >= 0) next[i] = h;
          else next.push(h);
        }
        return next;
      });
      send(list);
    },
    [send],
  );
  // A note is sent once the typing stops for a moment (and before the reader closes).
  const waiting = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const change = useCallback(
    (h: PdfHighlight, patch: Partial<PdfHighlight>, later = false) => {
      const next = { ...(hsRef.current.find((x) => x.id === h.id) ?? h), ...patch };
      setHs((prev) => prev.map((x) => (x.id === h.id ? next : x)));
      clearTimeout(waiting.current.get(h.id));
      if (!later) {
        waiting.current.delete(h.id);
        send([next]);
        return;
      }
      ++rev.current;
      waiting.current.set(
        h.id,
        setTimeout(() => {
          waiting.current.delete(h.id);
          const now = hsRef.current.find((x) => x.id === h.id);
          if (now) send([now]);
        }, 600),
      );
    },
    [send],
  );
  useEffect(() => {
    const w = waiting.current;
    return () => {
      for (const [id, t] of w) {
        clearTimeout(t);
        const now = hsRef.current.find((x) => x.id === id);
        if (now) void changeNotes(path, { put: [now] }).catch(() => {});
      }
      w.clear();
    };
  }, [path]);
  const remove = useCallback(
    (h: PdfHighlight) => {
      setHs((prev) => prev.filter((x) => x.id !== h.id));
      setPick((p) => (p?.kind === 'mark' && p.id === h.id ? null : p));
      setEditing((e) => (e === h.id ? null : e));
      send([], [h.id]);
      useToasts.getState().push('ok', tr('Highlight deleted'), { label: tr('Undo'), run: () => put([h]) });
    },
    [send, put],
  );

  // ---- picking ----------------------------------------------------------------------------------------------------

  const clearSelection = () => window.getSelection()?.removeAllRanges();
  const mouseDown = useRef(false);
  /** The words selected now, when they are on these pages. */
  const readSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!root.current?.contains(range.commonAncestorContainer)) return;
    const a = pointOf(range.startContainer, range.startOffset, false);
    const b = pointOf(range.endContainer, range.endOffset, true);
    if (!a || !b) return;
    const pieces = piecesOf(a, b, (p) => runs.current.get(p));
    if (!pieces.length) return;
    setPick({ kind: 'text', pieces, text: joinLines(pieces.map((p) => p.text)) });
    setEditing(null);
  }, []);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      clearTimeout(t);
      // With a mouse, the bar waits for the button to come up.
      t = setTimeout(() => !mouseDown.current && readSelection(), 90);
    };
    const up = () => {
      if (!mouseDown.current) return;
      mouseDown.current = false;
      setTimeout(readSelection, 0);
    };
    document.addEventListener('selectionchange', on);
    window.addEventListener('pointerup', up);
    return () => {
      clearTimeout(t);
      document.removeEventListener('selectionchange', on);
      window.removeEventListener('pointerup', up);
    };
  }, [readSelection]);

  const picked = pick?.kind === 'mark' ? (hs.find((h) => h.id === pick.id) ?? null) : null;

  const highlight = (color: HighlightColor, note?: string): PdfHighlight | null => {
    keepColor(color);
    if (!pick) return null;
    if (pick.kind === 'mark') {
      if (picked) change(picked, { color });
      return picked;
    }
    const at = Date.now();
    // The same words highlighted again take the new colour rather than a second highlight.
    const same = (p: PagePiece) => hsRef.current.find((h) => h.kind === 'text' && h.page === p.page && h.text === p.text && h.rects[0] && Math.abs(h.rects[0].x - p.rects[0].x) < 1 && Math.abs(h.rects[0].y - p.rects[0].y) < 1);
    const made: PdfHighlight[] =
      pick.kind === 'text'
        ? pick.pieces.map((p, i) => {
            const was = same(p);
            return was ? { ...was, color, edited: at } : { id: newId(), page: p.page, kind: 'text', rects: p.rects, text: p.text, color, o: p.o, at, ...(i === 0 && note ? { note } : {}) };
          })
        : [{ id: newId(), page: pick.page, kind: 'area', rects: [pick.rect], text: wordsInBox(runs.current.get(pick.page), pick.rect) || undefined, color, at }];
    put(made);
    clearSelection();
    setPick(null);
    return made[0];
  };

  /** The words or the picture of what is picked, for Ask and Copy. */
  const whatOf = (): { page: number; text?: string; area?: PdfRect } | null => {
    if (!pick) return null;
    if (pick.kind === 'text') return { page: pick.pieces[0].page, text: pick.text };
    if (pick.kind === 'area') return { page: pick.page, area: pick.rect, text: wordsInBox(runs.current.get(pick.page), pick.rect) || undefined };
    if (!picked) return null;
    return picked.kind === 'area' ? { page: picked.page, area: picked.rects[0], text: picked.text } : { page: picked.page, text: picked.text };
  };

  const ask = async (w = whatOf()) => {
    if (!w) return;
    try {
      if (w.area) {
        const pic = await areaPicture(path, w.page, w.area, mtime);
        await askAbout(path, { page: w.page, text: w.text, image: { ...pic, url: URL.createObjectURL(pic.blob) } });
      } else await askAbout(path, { page: w.page, text: w.text });
      clearSelection();
      setPick(null);
    } catch (e) {
      toastError(e);
    }
  };

  const copy = async () => {
    const w = whatOf();
    if (!w) return;
    clearSelection();
    setPick(null);
    // An area: its picture, where the browser lets a page copy one; else its words.
    if (w.area && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        const pic = areaPicture(path, w.page, w.area, mtime).then((p) => p.blob);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pic })]);
        toast(tr('Copied a picture of it'), 'ok');
        return;
      } catch {}
    }
    if (w.text) await copyWords(w.text, w.area ? 'Copied its words' : 'Copied');
    else toast(tr('The browser did not allow copying'), 'error');
  };

  const note = () => {
    const h = pick?.kind === 'mark' ? picked : highlight(lastColor());
    if (!h) return;
    setPick({ kind: 'mark', id: h.id });
    setEditing(h.id);
  };

  // Escape lets go; Delete takes away the highlight picked; copying words copies them as they read.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Escape') {
        if (pick || areaMode || box) {
          setPick(null);
          setAreaMode(false);
          setBox(null);
          clearSelection();
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && picked) {
        e.preventDefault();
        remove(picked);
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
        zoomTo(e.key === '0' ? 1 : e.key === '-' ? zoomRef.current / 1.25 : zoomRef.current * 1.25);
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      if (pick?.kind !== 'text' || !e.clipboardData) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !root.current?.contains(sel.anchorNode)) return;
      e.clipboardData.setData('text/plain', pick.text);
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    document.addEventListener('copy', onCopy);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('copy', onCopy);
    };
  }, [pick, picked, areaMode, box, remove, zoomTo]);

  // ---- an area dragged ------------------------------------------------------------------------------------------------

  const drag = useRef<{ page: number; x0: number; y0: number; k: number; size: { width: number; height: number } } | null>(null);
  const dragEnded = useRef(0);
  const onPagePointerDown = (e: React.PointerEvent<HTMLDivElement>, n: number, k: number, size: { width: number; height: number }) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-bar]')) return;
    if (!(areaMode || (e.altKey && e.pointerType === 'mouse'))) {
      if (e.pointerType === 'mouse') mouseDown.current = true;
      return;
    }
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { page: n, x0: (e.clientX - r.left) / k, y0: (e.clientY - r.top) / k, k, size };
    e.currentTarget.setPointerCapture(e.pointerId);
    clearSelection();
    setPick(null);
  };
  const onPagePointerMove = (e: React.PointerEvent<HTMLDivElement>, n: number, k: number) => {
    const d = drag.current;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / k;
    const y = (e.clientY - r.top) / k;
    if (d && d.page === n) {
      const cx2 = Math.max(0, Math.min(d.size.width, x));
      const cy2 = Math.max(0, Math.min(d.size.height, y));
      setBox({ page: n, rect: { x: Math.min(d.x0, cx2), y: Math.min(d.y0, cy2), w: Math.abs(cx2 - d.x0), h: Math.abs(cy2 - d.y0) } });
      return;
    }
    if (e.pointerType !== 'mouse' || mouseDown.current) return;
    const h = hitHighlight(hsRef.current, n, x, y);
    const id = h?.note?.trim() ? h.id : null;
    setHover((was) => (was === id ? was : id));
  };
  const onPagePointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    dragEnded.current = Date.now();
    setBox((b) => {
      if (b && b.rect.w > 4 && b.rect.h > 4) {
        setPick({ kind: 'area', page: b.page, rect: b.rect });
        setAreaMode(false);
      }
      return null;
    });
  };
  const onPageClick = (e: React.MouseEvent<HTMLDivElement>, n: number, k: number) => {
    if (Date.now() - dragEnded.current < 300 || (e.target as HTMLElement).closest('[data-bar]')) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && root.current?.contains(sel.anchorNode)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const h = hitHighlight(hsRef.current, n, (e.clientX - r.left) / k, (e.clientY - r.top) / k);
    setPick(h ? { kind: 'mark', id: h.id } : null);
    if (!h) setEditing(null);
  };

  /** Goes to a highlight: its page scrolled so it shows a third of the way down, picked. */
  const goTo = (h: PdfHighlight) => {
    const sc = scroller.current;
    const el = pageEls.current[h.page - 1];
    const p = info?.pages[h.page - 1];
    if (sc && el && p) {
      const k = width / p.width;
      const r = h.rects[0];
      sc.scrollTop = el.offsetTop + (r ? r.y * k : 0) - sc.clientHeight / 3;
      if (r) sc.scrollLeft = Math.max(0, el.offsetLeft + r.x * k - sc.clientWidth / 3);
    }
    setPick({ kind: 'mark', id: h.id });
    if (mobile) setNotesOpen(false);
  };

  // ---- drawing ----------------------------------------------------------------------------------------------------------

  const onTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const scanned = !!info && runs.current.has(1) && !runs.current.get(1)!.length && (info.pages.length < 2 || (runs.current.has(2) && !runs.current.get(2)!.length));
  const editingH = editing ? (hs.find((h) => h.id === editing) ?? null) : null;

  /** Where the bar goes on its page (pixels): over what is picked, or under it near the page's top and on touch screens. */
  const barPlace = (): { page: number; rect: PdfRect; last: PdfRect } | null => {
    if (!pick) return null;
    if (pick.kind === 'text') {
      const first = pick.pieces[0];
      const last = pick.pieces[pick.pieces.length - 1];
      return onTouch ? { page: last.page, rect: last.rects[last.rects.length - 1], last: last.rects[last.rects.length - 1] } : { page: first.page, rect: first.rects[0], last: first.rects[first.rects.length - 1] };
    }
    if (pick.kind === 'area') return { page: pick.page, rect: pick.rect, last: pick.rect };
    if (!picked) return null;
    return { page: picked.page, rect: picked.rects[0], last: picked.rects[picked.rects.length - 1] };
  };
  const place = barPlace();
  const current: HighlightColor | null = picked?.color ?? null;

  const bar = place && (
    <Bar
      key={`${pick?.kind}:${pick?.kind === 'mark' ? pick.id : ''}`}
      color={current}
      mark={!!picked}
      hasNote={!!picked?.note?.trim()}
      canAsk={canAsk}
      onColor={(c) => void highlight(c)}
      onNote={note}
      onAsk={() => void ask()}
      onCopy={() => void copy()}
      onDelete={() => picked && remove(picked)}
    />
  );

  const listProps = {
    path,
    mtime,
    hs,
    kept,
    selected: picked?.id ?? null,
    canAsk,
    onGo: goTo,
    onChange: change,
    onRemove: remove,
    onAsk: (h: PdfHighlight) => void ask(h.kind === 'area' ? { page: h.page, area: h.rects[0], text: h.text } : { page: h.page, text: h.text }),
    onView: (v: PdfNotesView) => {
      ++rev.current;
      setHs(v.highlights);
      setKept(v.kept);
    },
    onFileSaved,
  };

  const hint = areaMode ? 'Drag a box around a figure or an equation' : 'Select words to highlight them, or hold Alt and drag a box around a figure';

  return (
    <SheetsOnPhone.Provider value>
      <div ref={root} className="@container relative flex h-full min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2 sm:h-11 sm:px-3">
          {mobile ? (
            <IconButton label="Select an area" active={areaMode} aria-pressed={areaMode} onClick={() => (setAreaMode((a) => !a), setPick(null))} className={cx('h-9 w-9', areaMode && 'text-accent')}>
              <SquareDashedMousePointer size={17} />
            </IconButton>
          ) : (
            <Button size="sm" variant={areaMode ? 'secondary' : 'ghost'} aria-pressed={areaMode} icon={<SquareDashedMousePointer size={14} />} onClick={() => (setAreaMode((a) => !a), setPick(null))}>
              Select an area
            </Button>
          )}
          <div className={cx('min-w-0 flex-1 truncate px-1 text-fg-3', mobile ? 'text-[12px]' : 'text-[12.5px]', !areaMode && '@max-[680px]:invisible')}>{hint}</div>
          {mobile ? (
            <IconButton ref={notesBtn} label="Notes" active={notesOpen} onClick={() => setNotesOpen((o) => !o)} className="relative h-9 w-9">
              <NotebookPen size={17} />
              {hs.length > 0 && <span className="tnum absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 font-semibold text-accent-fg">{hs.length}</span>}
            </IconButton>
          ) : (
            <Button ref={notesBtn} size="sm" variant={notesOpen ? 'secondary' : 'ghost'} icon={<NotebookPen size={14} />} onClick={() => setNotesOpen((o) => !o)}>
              Notes {hs.length > 0 && <span className="tnum font-normal text-fg-3">{hs.length}</span>}
            </Button>
          )}
          {mobile ? (
            <IconButton label="Close Highlight" onClick={onClose} className="h-9 w-9">
              <X size={18} />
            </IconButton>
          ) : (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
        {scanned && (
          <div className="flex shrink-0 items-start gap-2 border-b border-line bg-bg-1 px-3 py-1.5 text-[12.5px] leading-snug text-fg-2">
            <Highlighter size={14} className="mt-0.5 shrink-0 text-fg-3" />
            <span>This PDF has no words to select (it is probably a scan): drag a box around a part with Select an area to highlight it.</span>
          </div>
        )}
        <div className="relative flex min-h-0 flex-1">
          <div ref={scroller} className="relative min-h-0 min-w-0 flex-1 touch-pan-x touch-pan-y overflow-auto bg-bg-1 py-3 sm:py-6">
            {error ? (
              <Empty title="Could not open the PDF">{error}</Empty>
            ) : !info || !colW ? (
              <div className="flex h-full items-center justify-center text-fg-3">
                <Throbber size={34} />
              </div>
            ) : (
              <div className="mx-auto flex flex-col gap-4 sm:gap-6" style={{ width }}>
                {info.pages.map((p, i) => {
                  const n = i + 1;
                  const k = width / p.width;
                  const mine = hs.filter((h) => h.page === n);
                  return (
                    <Page
                      key={n}
                      n={n}
                      size={p}
                      width={width}
                      src={pageUrl(path, n, Math.min(2400, Math.ceil((width * Math.min(2, window.devicePixelRatio || 1)) / 400) * 400), mtime)}
                      refEl={(el) => (pageEls.current[i] = el)}
                      runs={near.has(n) ? runs.current.get(n) : undefined}
                      hs={mine}
                      picked={picked?.id ?? null}
                      areaMode={areaMode}
                      pickRects={pick?.kind === 'area' && pick.page === n ? [pick.rect] : []}
                      box={box?.page === n ? box.rect : null}
                      onPointerDown={(e) => onPagePointerDown(e, n, k, p)}
                      onPointerMove={(e) => onPagePointerMove(e, n, k)}
                      onPointerUp={onPagePointerUp}
                      onPointerLeave={() => setHover(null)}
                      onClick={(e) => onPageClick(e, n, k)}
                    >
                      {place?.page === n && <BarAt k={k} rect={place.rect} last={place.last} pageWidth={width} below={onTouch}>{bar}</BarAt>}
                      {editingH?.page === n && <div ref={noteAnchor} data-bar className="pointer-events-none absolute" style={{ left: editingH.rects[editingH.rects.length - 1].x * k, top: (editingH.rects[editingH.rects.length - 1].y + editingH.rects[editingH.rects.length - 1].h) * k + 4, width: 1, height: 1 }} />}
                      {hover && !pick && mine.some((h) => h.id === hover) && <HoverNote h={mine.find((h) => h.id === hover)!} k={k} pageWidth={width} />}
                    </Page>
                  );
                })}
              </div>
            )}
          </div>
          {!mobile && notesOpen && (
            <div className={cx('flex min-h-0 w-[320px] shrink-0 flex-col border-l border-line bg-bg', !wideReader && 'absolute inset-y-0 right-0 z-20 shadow-[-8px_0_24px_rgba(0,0,0,0.18)]')}>
              <NotesList {...listProps} header onClose={() => setNotesOpen(false)} />
            </div>
          )}
        </div>
        {mobile && (
          <Popover
            anchor={notesBtn}
            open={notesOpen}
            onClose={() => setNotesOpen(false)}
            title={
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  Notes {hs.length > 0 && <span className="tnum font-normal text-fg-3">{hs.length}</span>}
                </span>
                <NotesMenu path={path} hs={hs} kept={kept} onView={listProps.onView} onFileSaved={onFileSaved} />
              </div>
            }
          >
            <div className="h-[min(70dvh,560px)]">
              <NotesList {...listProps} header={false} />
            </div>
          </Popover>
        )}
        <Popover anchor={noteAnchor} open={!!editingH} onClose={() => setEditing(null)} width={320} title="Note">
          {editingH && <NoteEditor key={editingH.id} h={editingH} onChange={(v) => change(editingH, { note: v }, true)} onDone={() => setEditing(null)} />}
        </Popover>
        {zoom > 1.01 && (
          <button type="button" onClick={() => zoomTo(1)} className="absolute right-4 bottom-[max(16px,var(--safe-bottom))] z-10 rounded-full border border-line bg-elevated px-3 py-1.5 text-[12.5px] text-fg-2 shadow-lg hover:text-fg">
            Fit width
          </button>
        )}
      </div>
    </SheetsOnPhone.Provider>
  );
}

/** One page: its picture, the highlights on it, its words to select, and what floats over it (the bar). */
function Page({
  n,
  size,
  width,
  src,
  refEl,
  runs,
  hs,
  picked,
  areaMode,
  pickRects,
  box,
  children,
  ...on
}: {
  n: number;
  size: { width: number; height: number };
  width: number;
  src: string;
  refEl: (el: HTMLDivElement | null) => void;
  runs: TextRun[] | undefined;
  hs: PdfHighlight[];
  picked: string | null;
  areaMode: boolean;
  pickRects: PdfRect[];
  box: PdfRect | null;
  children?: ReactNode;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const k = width / size.width;
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      ref={refEl}
      data-page={n}
      className={cx('relative shrink-0 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)]', areaMode ? 'cursor-crosshair touch-none select-none' : '')}
      style={{ width, height: size.height * k }}
      {...on}
    >
      <img src={src} alt="" draggable={false} loading={n > 2 ? 'lazy' : 'eager'} onLoad={() => setLoaded(true)} className="pointer-events-none absolute inset-0 h-full w-full select-none" />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-400">
          <Throbber size={26} />
        </div>
      )}
      <Marks hs={hs} k={k} picked={picked} />
      {pickRects.map((r, i) => (
        <div key={i} className="pointer-events-none absolute rounded-[2px] border-2 border-dashed border-[rgba(37,99,235,0.9)] bg-[rgba(37,99,235,0.06)]" style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k }} />
      ))}
      {box && <div className="pointer-events-none absolute rounded-[2px] border-2 border-dashed border-[rgba(37,99,235,0.9)] bg-[rgba(37,99,235,0.08)]" style={{ left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k }} />}
      {runs && <Words runs={runs} k={k} off={areaMode} />}
      {children}
    </div>
  );
}

/** The highlights of a page over their words: multiplied with the paper, as a marker is. */
const Marks = memo(function Marks({ hs, k, picked }: { hs: PdfHighlight[]; k: number; picked: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {hs.map((h) => {
        const sel = picked === h.id;
        if (h.kind === 'area') {
          const r = h.rects[0];
          return (
            <div
              key={h.id}
              className={cx('absolute rounded-[2px]', sel && 'outline-2 outline-offset-2 outline-[rgba(37,99,235,0.9)]')}
              style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k, border: `2px solid ${deepOf(h.color)}`, background: rgbOf(h.color, 0.14), mixBlendMode: 'multiply' }}
            >
              {h.note?.trim() && <NoteDot h={h} />}
            </div>
          );
        }
        const last = h.rects[h.rects.length - 1];
        return (
          <div key={h.id}>
            {h.rects.map((r, i) => (
              <div
                key={i}
                className={cx('absolute rounded-[1px]', sel && 'outline-2 outline-[rgba(37,99,235,0.85)]')}
                style={{ left: r.x * k, top: (r.y - r.h * 0.08) * k, width: r.w * k, height: r.h * 1.16 * k, background: rgbOf(h.color), mixBlendMode: 'multiply' }}
              />
            ))}
            {h.note?.trim() && last && (
              <div className="absolute" style={{ left: (last.x + last.w) * k, top: (last.y - last.h * 0.08) * k, width: 0, height: 0 }}>
                <NoteDot h={h} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

/** The small mark of a highlight that has a note. */
function NoteDot({ h }: { h: PdfHighlight }) {
  return <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full ring-1 ring-white" style={{ background: deepOf(h.color) }} />;
}

/**
 * A page's words as transparent text over its picture, a span a word placed and stretched to its box, so the browser
 * selects them as the page shows them. While a selection is dragged, a sheet under them keeps it from leaping to the
 * end of the page when the pointer is between lines.
 */
const Words = memo(function Words({ runs, k, off }: { runs: TextRun[]; k: number; off: boolean }) {
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    if (!selecting) return;
    const up = () => setSelecting(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [selecting]);
  const spans = useMemo(
    () =>
      runs.flatMap((r, i) => {
        const fs = Math.max(1, r.h * k);
        return wordsOf(r.t).map(([a, b]) => {
          const w = r.t.slice(a, b);
          const natural = (wordWidth(w) * fs) / 100;
          const target = Math.max(0.5, (r.e[b] - r.e[a]) * k);
          const style: CSSProperties = { left: r.e[a] * k, top: r.y * k, fontSize: fs, height: fs, transform: `scaleX(${natural > 0 ? target / natural : 1})` };
          return (
            <span key={`${i}:${a}`} data-r={i} data-c={a} style={style}>
              {w}
            </span>
          );
        });
      }),
    [runs, k],
  );
  return (
    <div
      translate="no"
      onPointerDown={(e) => e.pointerType === 'mouse' && e.button === 0 && !e.altKey && setSelecting(true)}
      className={cx(
        'absolute inset-0 isolate overflow-hidden leading-none select-text selection:bg-[rgba(37,99,235,0.32)] [&>span]:absolute [&>span]:origin-top-left [&>span]:cursor-text [&>span]:[font-family:sans-serif] [&>span]:whitespace-pre [&>span]:text-transparent',
        off && 'pointer-events-none select-none',
      )}
    >
      {spans}
      <div aria-hidden className={cx('absolute inset-x-0 bottom-0 -z-10 cursor-default select-none', selecting ? 'top-0' : 'top-full')} />
    </div>
  );
});

/** The bar's place on its page: over what is picked (under it near the page's top, and on touch screens). */
function BarAt({ k, rect, last, pageWidth, below, children }: { k: number; rect: PdfRect; last: PdfRect; pageWidth: number; below: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => setW(ref.current?.offsetWidth ?? 0), [children]);
  const under = below || rect.y * k < 52;
  const at = under ? last : rect;
  const left = Math.max(4, Math.min(pageWidth - w - 4, at.x * k));
  const top = under ? (at.y + at.h) * k + 8 : rect.y * k - 46;
  return (
    <div
      ref={ref}
      data-bar
      className="absolute z-10"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      // Keeps the selection while a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** The bar: four colours (the highlight's own ticked), Note, Ask, Copy, and Delete for a highlight. */
function Bar({
  color,
  mark,
  hasNote,
  canAsk,
  onColor,
  onNote,
  onAsk,
  onCopy,
  onDelete,
}: {
  color: HighlightColor | null;
  mark: boolean;
  hasNote: boolean;
  canAsk: boolean;
  onColor: (c: HighlightColor) => void;
  onNote: () => void;
  onAsk: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const mobile = useIsMobile();
  const btn = (label: string, icon: ReactNode, on: () => void, show = true) =>
    show &&
    (mobile ? (
      <IconButton label={label} onClick={on} className="h-9 w-9">
        {icon}
      </IconButton>
    ) : (
      <button type="button" onClick={on} className="inline-flex h-7.5 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-fg-2 hover:bg-bg-2 hover:text-fg">
        {icon}
        {label}
      </button>
    ));
  return (
    <div role="toolbar" aria-label="Highlight" className="flex items-center gap-0.5 rounded-[12px] border border-line bg-elevated p-1 whitespace-nowrap shadow-lg">
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={COLOR_NAMES[c]}
          aria-pressed={color === c}
          title={COLOR_NAMES[c]}
          onClick={() => onColor(c)}
          className={cx('flex items-center justify-center rounded-lg hover:bg-bg-2', mobile ? 'h-9 w-9' : 'h-7.5 w-7.5')}
        >
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full ring-1 ring-black/15" style={{ background: rgbOf(c) }}>
            {color === c && <Check size={11} strokeWidth={3} className="text-black/70" />}
          </span>
        </button>
      ))}
      <span className="mx-0.5 h-5 w-px bg-line" />
      {btn(hasNote ? 'Edit note' : 'Note', <StickyNote size={14} />, onNote)}
      {btn('Ask', <Sparkles size={14} className="text-accent" />, onAsk, canAsk)}
      {btn('Copy', <Copy size={14} />, onCopy)}
      {mark && (
        <IconButton label="Delete" size="sm" onClick={onDelete} className={mobile ? 'h-9 w-9' : 'h-7.5 w-7.5'}>
          <Trash2 size={14} />
        </IconButton>
      )}
    </div>
  );
}

/** A highlight's note, shown while the pointer rests on it. */
function HoverNote({ h, k, pageWidth }: { h: PdfHighlight; k: number; pageWidth: number }) {
  const last = h.rects[h.rects.length - 1];
  const left = Math.max(4, Math.min(pageWidth - 284, last.x * k));
  return (
    <div className="pointer-events-none absolute z-10 w-[280px] rounded-xl border border-line bg-elevated px-3 py-2 shadow-lg" style={{ left, top: (last.y + last.h * 1.1) * k + 6 }}>
      <div translate="no" className="line-clamp-[8] text-[12.5px] leading-snug whitespace-pre-wrap text-fg">
        {h.note}
      </div>
    </div>
  );
}

/** Writing a highlight's note: kept as it is typed; Done (or Ctrl+Enter) closes it. */
function NoteEditor({ h, onChange, onDone }: { h: PdfHighlight; onChange: (v: string) => void; onDone: () => void }) {
  const [text, setText] = useState(h.note ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);
  return (
    <div className="p-1.5" data-bar>
      {h.text && (
        <div translate="no" className="mb-1.5 line-clamp-2 border-l-2 pl-2 text-[12px] leading-snug text-fg-3" style={{ borderColor: deepOf(h.color) }}>
          {h.text}
        </div>
      )}
      <textarea
        ref={ref}
        value={text}
        rows={4}
        translate="no"
        placeholder="Your note"
        aria-label="Note"
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onDone();
          if (e.key === 'Escape') onDone();
        }}
        className="block w-full resize-y rounded-lg border border-line bg-bg px-2.5 py-2 text-[13.5px] leading-snug outline-none focus:border-accent/60 max-sm:text-[16px]"
      />
      <div className="mt-1.5 flex justify-end">
        <Button size="sm" variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
