// Presenting a deck: the slideshow over everything, full screen where the device allows (click, the arrow keys,
// Space or a swipe go on; B or W blank the screen; G shows every slide; a number and Enter go to that slide; L a
// laser pointer, P a pen, E erases its lines, C live captions; Escape ends it). The presenter's view: the slide, the
// next one, the speaker notes and a timer, with a second window for the audience (on another screen or a projector)
// that follows it, and that it follows in turn; the presenter's laser, pen and captions show in it too. Live parts
// (custom code, web pages, 3D) run in each, in frames of their own; quizzes are answered there.
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, MonitorUp, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import type { Deck } from '@shared/slides';
import { api, enc } from '../../../lib/api';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../../components/ui';
import type { Marks, Show } from '@shared/slides-runtime';
import { OfflineFrames } from '../frame';
import { liveOpts, PICS, RT, useDeckFonts } from './rt';
import { SlideThumb } from './Thumb';

/** The slideshow's controls in the user's language. */
const words = () => ({
  prev: tr('Previous'),
  next: tr('Next'),
  grid: tr('All slides'),
  full: tr('Full screen'),
  exit: tr('End the slideshow'),
  end: tr('The end of the slideshow. Click to leave.'),
  laser: tr('Laser pointer (L)'),
  pen: tr('Pen (P)'),
  erase: tr('Erase the drawings (E)'),
  captions: tr('Live captions (C)'),
  noCaptions: tr('Live captions need a browser that turns speech into words, such as Chrome.'),
  listening: tr('Listening…'),
});

/** The slideshow over everything, from slide `from`. */
export function Slideshow({ deck, from, onClose }: { deck: Deck; from: number; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Beside a confidential session, its live parts load nothing from anywhere.
  const offline = useContext(OfflineFrames);
  useDeckFonts(deck);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const show = RT.show(el, deck, { mode: 'full', at: from, keys: true, onExit: () => close.current(), words: words(), ...PICS, ...liveOpts(offline) });
    void el.requestFullscreen?.().catch(() => {});
    // Leaving full screen (Escape, the browser's own) ends it too.
    const onFs = () => !document.fullscreenElement && close.current();
    const t = window.setTimeout(() => document.addEventListener('fullscreenchange', onFs), 400);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('fullscreenchange', onFs);
      show.destroy();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    // The deck as it was when the slideshow started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(<div ref={host} className="fixed inset-0 z-[90] bg-black" />, document.body);
}

type Msg = { t: 'hello' } | { t: 'deck'; deck: Deck; i: number; step: number } | { t: 'go'; i: number; step: number } | { t: 'moved'; i: number; step: number } | { t: 'marks'; m: Marks } | { t: 'bye' };

const channelOf = (id: string) => `naget-show:${id}`;

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`;
}

/** The presenter's view, over everything: the slide, the next, the notes, a timer, and the audience's window. */
export function Presenter({ deck, from, pageId, onClose }: { deck: Deck; from: number; pageId: string; onClose: () => void }) {
  const fonts = useDeckFonts(deck);
  const host = useRef<HTMLDivElement>(null);
  const show = useRef<Show | null>(null);
  const [at, setAt] = useState({ i: from, step: 0, steps: 0 });
  const [started] = useState(Date.now());
  const [paused, setPaused] = useState<{ at: number; total: number }>({ at: 0, total: 0 });
  const [, tick] = useState(0);
  const [notesSize, setNotesSize] = useState(() => Number(localStorage.getItem('wa.slides.notesSize')) || 22);
  const [audience, setAudience] = useState<Window | null>(null);
  // The next slide as wide as its place beside the slideshow (up to a point, so the notes keep their room).
  const nextBox = useRef<HTMLDivElement>(null);
  const [nextW, setNextW] = useState(320);
  useLayoutEffect(() => {
    const el = nextBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNextW(Math.max(160, Math.min(640, Math.floor(el.clientWidth)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bc = useMemo(() => new BroadcastChannel(channelOf(pageId)), [pageId]);
  const close = useRef(onClose);
  close.current = onClose;
  const offline = useContext(OfflineFrames);
  const visible = deck.slides.map((s, i) => ({ s, i })).filter((x) => !x.s.hidden);

  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => localStorage.setItem('wa.slides.notesSize', String(notesSize)), [notesSize]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = RT.show(el, deck, {
      mode: 'full',
      at: from,
      keys: true,
      onExit: () => close.current(),
      onMove: (i, step) => {
        const now = { i, step, steps: show.current?.at().steps ?? 0 };
        setAt(now);
        bc.postMessage({ t: 'go', i, step } satisfies Msg);
      },
      // The laser, the pen's lines and the captions show in the audience's window too.
      onMarks: (m) => bc.postMessage({ t: 'marks', m } satisfies Msg),
      words: words(),
      ...PICS,
      ...liveOpts(offline),
    });
    show.current = s;
    setAt(s.at());
    bc.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.t === 'hello') {
        const cur = s.at();
        bc.postMessage({ t: 'deck', deck, i: cur.i, step: cur.step } satisfies Msg);
      } else if (m.t === 'moved') {
        const cur = s.at();
        if (cur.i !== m.i || cur.step !== m.step) s.go(m.i, m.step);
      }
    };
    return () => {
      bc.postMessage({ t: 'bye' } satisfies Msg);
      s.destroy();
      bc.close();
      show.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = visible.findIndex((x) => x.i === at.i);
  const next = at.step < at.steps ? null : visible[pos + 1];
  const notes = deck.slides[at.i]?.notes ?? '';
  const elapsed = (paused.at ? paused.at : Date.now()) - started - paused.total;
  const openAudience = () => {
    const w = window.open(`/pages/${pageId}/show`, `naget-show-${pageId}`, 'popup=yes,width=1280,height=760');
    if (w) setAudience(w);
  };
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#101012] text-[#ecebe8]">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 px-3">
        <span className="font-mono text-[20px] tabular-nums">{clock(elapsed)}</span>
        <button
          type="button"
          title={paused.at ? 'Go on' : 'Pause the timer'}
          aria-label={paused.at ? 'Go on' : 'Pause the timer'}
          onClick={() => setPaused((p) => (p.at ? { at: 0, total: p.total + (Date.now() - p.at) } : { at: Date.now(), total: p.total }))}
          className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          {paused.at ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          type="button"
          title="Start the timer again"
          aria-label="Start the timer again"
          onClick={() => setPaused({ at: paused.at ? Date.now() : 0, total: Date.now() - started - (paused.at ? 0 : 0) })}
          className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          <RotateCcw size={15} />
        </button>
        <span className="text-[13px] text-white/60 tabular-nums">{new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="min-w-0 flex-1 text-center text-[13px] text-white/70 tabular-nums">
          {tr('Slide')} {pos + 1} / {visible.length}
        </span>
        <button
          type="button"
          onClick={openAudience}
          className={cx('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] hover:bg-white/10', audience && !audience.closed ? 'text-[#8fd18f]' : 'text-white/80')}
        >
          <MonitorUp size={15} />
          {audience && !audience.closed ? 'The audience’s window is open' : 'Open the audience’s window'}
        </button>
        <button type="button" onClick={onClose} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-white/80 hover:bg-white/10">
          <X size={15} />
          End the slideshow
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 p-3 max-md:flex-col">
        <div ref={host} className="relative min-h-0 flex-[1.6] overflow-hidden rounded-xl bg-black" />
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div ref={nextBox} className="shrink-0">
            <div className="mb-1 text-[12px] font-medium tracking-wide text-white/50 uppercase">{next ? 'Next' : at.step < at.steps ? 'Next: more on this slide' : 'Next'}</div>
            {next ? (
              <div className="w-fit overflow-hidden rounded-lg ring-1 ring-white/15">
                <SlideThumb deck={deck} index={next.i} slide={next.s} theme={deck.theme} width={nextW} fonts={fonts} />
              </div>
            ) : (
              <div className="grid h-[120px] place-items-center rounded-lg bg-white/5 text-[13px] text-white/50">{at.step < at.steps ? 'Its next animation' : 'The end of the slideshow'}</div>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-white/[.04] ring-1 ring-white/10">
            <div className="flex shrink-0 items-center gap-1 px-3 pt-2">
              <span className="min-w-0 flex-1 text-[12px] font-medium tracking-wide text-white/50 uppercase">Notes</span>
              <button type="button" aria-label="Smaller notes" title="Smaller" onClick={() => setNotesSize((n) => Math.max(12, n - 2))} className="grid h-7 w-7 place-items-center rounded-md text-white/70 hover:bg-white/10">
                <Minus size={13} />
              </button>
              <button type="button" aria-label="Larger notes" title="Larger" onClick={() => setNotesSize((n) => Math.min(48, n + 2))} className="grid h-7 w-7 place-items-center rounded-md text-white/70 hover:bg-white/10">
                <Plus size={13} />
              </button>
            </div>
            <div translate="no" className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3 leading-relaxed whitespace-pre-wrap" style={{ fontSize: notesSize }}>
              {notes || <span className="text-white/35">{tr('No notes for this slide.')}</span>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => show.current?.prev()} className="flex h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-white/10 text-[14px] hover:bg-white/15">
              <ChevronLeft size={18} />
              Back
            </button>
            <button type="button" onClick={() => show.current?.next()} className="flex h-12 flex-[2] items-center justify-center gap-1 rounded-xl bg-white/90 text-[14px] font-semibold text-black hover:bg-white">
              Next
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The audience's window (/pages/<id>/show): the slideshow alone, following the presenter's view. */
export function AudienceView({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [start, setStart] = useState({ i: 0, step: 0 });
  const [ended, setEnded] = useState(false);
  const bc = useMemo(() => new BroadcastChannel(channelOf(id)), [id]);
  // Drawn again once KaTeX is there, for a deck with equations, where it was.
  const katex = useDeckFonts(deck) >= 0 && !!PICS.katex;
  const pos = useRef(start);
  pos.current = pos.current.i || pos.current.step ? pos.current : start;
  useEffect(() => {
    let alive = true;
    bc.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.t === 'deck' && alive) {
        setStart({ i: m.i, step: m.step });
        setDeck(m.deck);
      }
      if (m.t === 'bye') setEnded(true);
    };
    bc.postMessage({ t: 'hello' } satisfies Msg);
    // Opened on its own (no presenter's view): the deck as saved.
    const t = window.setTimeout(() => {
      if (!alive) return;
      api<{ model?: Deck }>(`/api/pages/${enc(id)}`)
        .then((r) => alive && r.model && setDeck((d) => d ?? r.model!))
        .catch(() => {});
    }, 700);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [id]);
  useEffect(() => {
    const el = host.current;
    if (!el || !deck) return;
    let echo = false;
    const s = RT.show(el, deck, {
      mode: 'full',
      at: pos.current.i,
      step: pos.current.step,
      keys: true,
      onExit: () => void document.exitFullscreen?.().catch(() => {}),
      onMove: (i, step) => {
        pos.current = { i, step };
        if (!echo) bc.postMessage({ t: 'moved', i, step } satisfies Msg);
      },
      words: words(),
      ...PICS,
      ...liveOpts(false),
    });
    const prev = bc.onmessage;
    bc.onmessage = (e: MessageEvent<Msg>) => {
      prev?.call(bc, e);
      const m = e.data;
      if (m.t === 'go') {
        const cur = s.at();
        if (cur.i === m.i && cur.step === m.step) return;
        echo = true;
        s.go(m.i, m.step);
        echo = false;
      } else if (m.t === 'marks') s.marks(m.m);
    };
    return () => {
      bc.onmessage = prev;
      s.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, katex]);
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black" onDoubleClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>
      <div ref={host} className="absolute inset-0" />
      {!deck && <div className="absolute inset-0 grid place-items-center text-[14px] text-white/60">{tr('Waiting for the slides…')}</div>}
      {ended && <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[12.5px] text-white/70">{tr('The presenter’s view was closed')}</div>}
    </div>,
    document.body,
  );
}
