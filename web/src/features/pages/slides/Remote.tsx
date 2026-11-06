// Your phone as the slideshow's remote, as Google Slides' and Keynote's: the slideshow's controls → Phone remote shows
// a QR code of this app's address for it (/remote/<id>), which opens on a phone signed in to the same app with next,
// back, a slide by its number, a black screen, the speaker notes larger, the time since the slideshow started and
// the next slide's picture. The phone's commands go through the server to the window showing the slideshow, and where
// the slideshow is comes back the same way (server/slides-show/remote.ts), each on the slideshow's own channel.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Minus, MonitorOff, Plus, Smartphone, X } from 'lucide-react';
import { useLocation } from 'wouter';
import type { Deck } from '@shared/slides';
import type { Show } from '@shared/slides-runtime';
import type { RemoteCmd, RemoteState } from '@shared/slides-show';
import { qrCode, qrPath } from '@shared/qr';
import { ApiError, api, del, enc, post, put } from '../../../lib/api';
import { onFeatureEvent } from '../../../lib/featureEvents';
import { machineBase } from '../../../lib/machine';
import { live } from '../../../lib/ws';
import { tr } from '../../../i18n/runtime';
import { Button, cx, IconButton, Throbber } from '../../../components/ui';
import { CopyButton } from '../../../components/Markdown';
import { useDeckFonts } from './rt';
import { SlideThumb } from './Thumb';

/** What a page hears on a slideshow's channel (server/slides-show/remote.ts ShowNews), and that a phone opened it. */
type News = { show: string; state?: RemoteState; cmd?: RemoteCmd; ended?: boolean; phone?: boolean };

const channel = (id: string) => `page:show:${id}`;

/** The slides a slideshow shows (those not skipped; all of them when every one is). */
const shownOf = (deck: Deck | null) => {
  if (!deck) return [];
  const list = deck.slides.map((s, i) => ({ s, i })).filter((x) => !x.s.hidden);
  return list.length ? list : deck.slides.map((s, i) => ({ s, i }));
};

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

// ---- in the slideshow's window ---------------------------------------------------------------------------------

/**
 * The phone remote of a slideshow in this window: `start` makes it (its QR code shows), `attach` gives it the
 * slideshow, `moved` and `blanked` tell the phone; commands from the phone move the slideshow. It ends with the
 * slideshow. `panel` is the QR code's card, to put over the slides.
 */
export function useRemote(o: { deck: Deck | null; pageId?: string; title?: string }) {
  const [id, setId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = useRef<Show | null>(null);
  const blank = useRef<'black' | 'white' | null>(null);
  const started = useRef(Date.now());
  const starting = useRef(false);
  const shown = useMemo(() => shownOf(o.deck), [o.deck]);
  const idRef = useRef<string | null>(null);
  idRef.current = id;

  const state = (): RemoteState | null => {
    const s = show.current;
    if (!s) return null;
    const at = s.at();
    return {
      i: at.i,
      step: at.step,
      steps: at.steps,
      pos:
        Math.max(
          0,
          shown.findIndex((x) => x.i === at.i),
        ) + 1,
      count: shown.length,
      blank: blank.current,
      started: started.current,
    };
  };
  const send = () => {
    const now = idRef.current;
    const st = state();
    if (now && st) void put(`/api/slides/shows/${enc(now)}`, { state: st }).catch(() => {});
  };
  const apply = (c: RemoteCmd) => {
    const s = show.current;
    if (!s) return;
    if (c.do === 'next') s.next();
    else if (c.do === 'prev') s.prev();
    else if (c.do === 'first') s.go(shown[0].i);
    else if (c.do === 'last') s.go(shown[shown.length - 1].i);
    else if (c.do === 'go' && c.n && shown[c.n - 1]) s.go(shown[c.n - 1].i);
    else if (c.do === 'black' || c.do === 'white') s.blank(blank.current === c.do ? null : c.do);
  };

  useEffect(() => {
    if (!id) return;
    const off = live.sub(channel(id));
    const offNews = onFeatureEvent('slides-show', (e) => {
      const n = e.data as News;
      if (!n || n.show !== id) return;
      if (n.cmd) apply(n.cmd);
      if (n.phone) {
        setPhone(true);
        // The phone is there: the code's card goes, the remote stays.
        setOpen(false);
        send();
      }
    });
    send();
    // Every few seconds, so the phone knows the slideshow is still there.
    const beat = window.setInterval(send, 5000);
    return () => {
      off();
      offNews();
      window.clearInterval(beat);
      void del(`/api/slides/shows/${enc(id)}`).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const start = async () => {
    setOpen(true);
    if (idRef.current || starting.current || !o.pageId || !o.deck) return;
    starting.current = true;
    setError(null);
    try {
      const r = await post<{ id: string }>('/api/slides/shows', { page: o.pageId, title: o.title ?? '', deck: o.deck });
      setId(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      starting.current = false;
    }
  };
  const url = id ? `${location.origin}${machineBase}/remote/${id}` : '';
  const panel = open ? <RemotePanel url={url} phone={phone} error={error} onClose={() => setOpen(false)} /> : null;
  return {
    /** Shows the code (making the remote the first time). */
    start: () => void start(),
    toggle: () => (open ? setOpen(false) : void start()),
    on: !!id,
    attach: (s: Show | null) => (show.current = s),
    moved: send,
    blanked: (c: 'black' | 'white' | null) => {
      blank.current = c;
      send();
    },
    panel,
  };
}

const LOCAL = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/;

/** The QR code's card over the slides: the code, the address under it, and what it is for. */
function RemotePanel({ url, phone, error, onClose }: { url: string; phone: boolean; error: string | null; onClose: () => void }) {
  const code = useMemo(() => (url ? qrCode(url) : null), [url]);
  return (
    <div className="absolute inset-0 z-[6] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-[min(92vw,360px)] rounded-2xl bg-[#1c1c1f] p-4 text-[#ecebe8] shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <Smartphone size={16} className="text-white/70" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold">{tr('Your phone as the remote')}</div>
          <button type="button" aria-label={tr('Close')} title={tr('Close')} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>
        {error ? (
          <p className="text-[13px] leading-snug text-[#ff8a80]">{error}</p>
        ) : !code ? (
          <div className="grid h-[220px] place-items-center">
            <Throbber />
          </div>
        ) : (
          <>
            <div className="mx-auto w-fit rounded-xl bg-white p-2">
              <svg viewBox={`-4 -4 ${code.size + 8} ${code.size + 8}`} width={208} height={208} role="img" aria-label={tr('The remote’s address as a QR code')} shapeRendering="crispEdges">
                <rect x={-4} y={-4} width={code.size + 8} height={code.size + 8} fill="#fff" />
                <path d={qrPath(code)} fill="#000" />
              </svg>
            </div>
            <p className="mt-3 text-[13px] leading-snug text-white/75">{tr('Point your phone’s camera at it. The remote opens on a phone signed in to this app: next, back, any slide, a black screen, your notes and the next slide.')}</p>
            {LOCAL.test(location.hostname) && (
              <p className="mt-2 text-[12.5px] leading-snug text-[#ffd479]">
                {tr('This address is this computer’s own: a phone cannot open it. Open the app at an address your phone reaches (its network or public address), then show the code again.')}
              </p>
            )}
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1">
              <span translate="no" className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/70">
                {url}
              </span>
              <CopyButton text={url} />
            </div>
            {phone && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#8fd18f]">
                <Check size={14} />
                {tr('Your phone is the remote')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- on the phone ------------------------------------------------------------------------------------------------

/** The phone's remote (/remote/<id>): where the slideshow is, its notes larger, the next slide, and its buttons. */
export function RemotePage() {
  const [loc] = useLocation();
  const id = /^\/remote\/([A-Za-z0-9_-]{8,40})\/?$/.exec(loc)?.[1] ?? '';
  const [show, setShow] = useState<{ deck: Deck; title: string; state: RemoteState | null } | null>(null);
  const [gone, setGone] = useState<string | null>(id ? null : tr('This is not a slideshow’s remote.'));
  const [heard, setHeard] = useState(Date.now());
  const [, tick] = useState(0);
  const [size, setSize] = useState(() => Number(localStorage.getItem('wa.slides.remoteNotes')) || 20);
  const [going, setGoing] = useState(false);
  const fonts = useDeckFonts(show?.deck ?? null);
  useEffect(() => localStorage.setItem('wa.slides.remoteNotes', String(size)), [size]);
  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const off = live.sub(channel(id));
    const offNews = onFeatureEvent('slides-show', (e) => {
      const n = e.data as News;
      if (!n || n.show !== id) return;
      if (n.ended) setGone(tr('The slideshow has ended.'));
      if (n.state) {
        setHeard(Date.now());
        setShow((s) => (s ? { ...s, state: n.state! } : s));
      }
    });
    api<{ deck: Deck; title: string; state: RemoteState | null }>(`/api/slides/shows/${enc(id)}`)
      .then((r) => {
        if (!alive) return;
        setShow({ deck: r.deck, title: r.title, state: r.state });
        setHeard(Date.now());
      })
      .catch((e) => alive && setGone(e instanceof ApiError && e.status === 404 ? tr('This slideshow has ended, or it was not started here.') : e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      off();
      offNews();
    };
  }, [id]);

  const send = async (c: RemoteCmd) => {
    try {
      await post(`/api/slides/shows/${enc(id)}/do`, c);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone(tr('The slideshow has ended.'));
    }
  };

  const st = show?.state ?? null;
  const shown = show ? shownOf(show.deck) : [];
  const cur = st ? show?.deck.slides[st.i] : undefined;
  const nextSlide = st && st.step >= st.steps ? shown[st.pos] : undefined;
  const quiet = Date.now() - heard > 16_000;
  let body: ReactNode;
  if (gone) body = <p className="px-6 text-center text-[15px] text-fg-2">{gone}</p>;
  else if (!show) body = <Throbber />;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg text-fg" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      {body ? (
        <div className="grid flex-1 place-items-center">{body}</div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <div translate="no" className="truncate text-[14px] font-semibold">
                {show!.title || tr('Slideshow')}
              </div>
              <div className="text-[12.5px] text-fg-3 tabular-nums">{st ? tr(`Slide ${st.pos} of ${st.count}`) : tr('Waiting for the slideshow…')}</div>
            </div>
            <span className="font-mono text-[20px] tabular-nums">{st ? clock(Date.now() - st.started) : '00:00'}</span>
          </div>
          {quiet && <div className="shrink-0 bg-warn/15 px-3 py-1.5 text-[12.5px] text-fg-2">{tr('The slideshow’s window is not answering: is it still open?')}</div>}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-1 px-3 pt-2">
              <span className="min-w-0 flex-1 text-[12px] font-medium tracking-wide text-fg-3 uppercase">{tr('Notes')}</span>
              <IconButton label={tr('Smaller notes')} size="sm" onClick={() => setSize((n) => Math.max(14, n - 2))}>
                <Minus size={14} />
              </IconButton>
              <IconButton label={tr('Larger notes')} size="sm" onClick={() => setSize((n) => Math.min(44, n + 2))}>
                <Plus size={14} />
              </IconButton>
            </div>
            <div translate="no" className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3 leading-relaxed whitespace-pre-wrap" style={{ fontSize: size }}>
              {cur?.notes || <span className="text-[15px] text-fg-3">{tr('No notes for this slide.')}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium tracking-wide text-fg-3 uppercase">{tr('Next')}</div>
              <div className="text-[13px] text-fg-2">{!st ? '' : nextSlide ? tr(`Slide ${st.pos + 1}`) : st.step < st.steps ? tr('More on this slide') : tr('The end of the slideshow')}</div>
            </div>
            {nextSlide && (
              <div className="shrink-0 overflow-hidden rounded-md ring-1 ring-line">
                <SlideThumb deck={show!.deck} index={nextSlide.i} slide={nextSlide.s} theme={show!.deck.theme} width={150} fonts={fonts} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2 px-3 pt-1">
            <Button variant={st?.blank === 'black' ? 'primary' : 'secondary'} icon={<MonitorOff size={15} />} onClick={() => void send({ do: 'black' })} className="flex-1" aria-pressed={st?.blank === 'black'}>
              {st?.blank === 'black' ? tr('Show the slides') : tr('Black screen')}
            </Button>
            <GoTo count={shown.length} open={going} setOpen={setGoing} onGo={(n) => void send({ do: 'go', n })} />
          </div>
          <div className="flex shrink-0 gap-2 px-3 pt-2">
            <button type="button" onClick={() => void send({ do: 'prev' })} className="flex h-16 flex-1 items-center justify-center gap-1 rounded-2xl bg-bg-2 text-[16px] font-medium active:bg-bg-3">
              <ChevronLeft size={22} />
              {tr('Back')}
            </button>
            <button type="button" onClick={() => void send({ do: 'next' })} className="flex h-16 flex-[2] items-center justify-center gap-1 rounded-2xl bg-accent text-[17px] font-semibold text-accent-fg active:opacity-90">
              {tr('Next')}
              <ChevronRight size={22} />
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

/** A slide by its number: the button, and in its place while open, the number and Go. */
function GoTo({ count, open, setOpen, onGo }: { count: number; open: boolean; setOpen: (o: boolean) => void; onGo: (n: number) => void }) {
  const [n, setN] = useState('');
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="flex-1">
        {tr('Go to a slide')}
      </Button>
    );
  const go = () => {
    const k = Math.round(Number(n));
    if (k >= 1 && k <= count) {
      onGo(k);
      setOpen(false);
      setN('');
    }
  };
  return (
    <form
      className="flex flex-1 items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <input
        autoFocus
        inputMode="numeric"
        aria-label={tr('The slide’s number')}
        placeholder={`1–${count}`}
        value={n}
        onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className={cx('h-9 w-0 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-2 text-[15px] tabular-nums outline-none focus:border-accent')}
      />
      <Button variant="primary" type="submit" disabled={!n}>
        {tr('Go')}
      </Button>
      <IconButton label={tr('Close')} size="sm" onClick={() => setOpen(false)}>
        <X size={15} />
      </IconButton>
    </form>
  );
}
