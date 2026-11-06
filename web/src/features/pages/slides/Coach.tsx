// Rehearsing with a coach, as PowerPoint's Speaker Coach: the slideshow as you would give it, timed slide by slide,
// while the browser's speech recognition (where it has one, as live captions use it) hears you: your pace in words a
// minute as you go (a quiet word when it is too fast or too slow), filler words (um, uh, like, you know, basically,
// actually, so… in the language of Settings → Voice where the coach knows its fillers) and reading a slide's own words
// out. At the end, a report: the time against the one you aimed for, each slide's time, your pace, the fillers, the
// slides read out, rushed or lingered on; Use these timings makes each slide go on by itself after its rehearsed time
// (its build's clicks too).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, RotateCcw, Timer } from 'lucide-react';
import type { Deck } from '@shared/slides';
import { coachReport, fillersIn, paceHint, readShare, rehearsedTimings, rollingPace, slideWords, speechUnits, withTimings, type CoachReport, type RehearsedSlide } from '@shared/slides-show';
import { tr } from '../../../i18n/runtime';
import { Button, cx, Dialog } from '../../../components/ui';
import { SpeechRecognition, speechLang } from '../../voice/prefs';
import { slideTitle } from '@shared/slides';
import { Slideshow } from './Present';

function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}

/** The time aimed for, kept for the next rehearsal of any deck. */
const TARGET_KEY = 'wa.slides.coachTarget';

/** Before rehearsing: the time to aim for, and whether the browser can listen. */
function CoachSetup({ deck, onStart, onClose }: { deck: Deck; onStart: (minutes: number | undefined) => void; onClose: () => void }) {
  const [minutes, setMinutes] = useState(() => localStorage.getItem(TARGET_KEY) ?? '');
  const listens = !!SpeechRecognition();
  const shown = deck.slides.filter((s) => !s.hidden).length;
  const start = () => {
    const m = Number(minutes);
    localStorage.setItem(TARGET_KEY, m > 0 ? String(m) : '');
    onStart(m > 0 ? Math.min(600, m) : undefined);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr('Rehearse with coach')}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel')}
          </Button>
          <Button variant="primary" icon={<Timer size={15} />} onClick={start}>
            {tr('Start rehearsing')}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-fg-2">
        {tr('Give the slideshow as you would. The coach times each slide, and listens for your pace, filler words and reading the slides out; at the end it shows how it went, and can give each slide its rehearsed time.')}
      </p>
      <label className="mt-3 flex items-center gap-2 text-[13px] text-fg-2">
        <span className="min-w-0 flex-1">{tr('The time to aim for')}</span>
        <input
          inputMode="decimal"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
          placeholder={tr('None')}
          aria-label={tr('The time to aim for, in minutes')}
          className="h-8 w-20 rounded-lg border border-line bg-bg-1 px-2 text-right text-[13px] tabular-nums outline-none focus:border-accent"
        />
        <span className="w-14 text-fg-3">{tr('minutes')}</span>
      </label>
      {Number(minutes) > 0 && shown > 0 && <p className="mt-1 text-right text-[12px] text-fg-3">{tr(`About ${clock((Number(minutes) * 60_000) / shown)} a slide`)}</p>}
      <p className={cx('mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] leading-snug', listens ? 'bg-bg-1 text-fg-3' : 'bg-warn/10 text-fg-2')}>
        {listens ? <Mic size={14} className="mt-0.5 shrink-0" /> : <MicOff size={14} className="mt-0.5 shrink-0" />}
        {listens
          ? tr(`It listens in ${speechLang()} (Settings → Voice changes it), through the browser’s speech recognition (Chrome and Edge may send your voice to their makers’ servers to turn it into words).`)
          : tr('This browser cannot turn speech into words (Chrome and Edge can), so the coach times your slides only.')}
      </p>
    </Dialog>
  );
}

/** What the coach hears on one slide while it shows. */
interface Live {
  i: number;
  /** When the slide came (ms since 1970), and when each click of its build did, from then. */
  at: number;
  steps: number[];
  said: string[];
}

/** The slideshow with the coach over it: the times, the pace, the fillers, a word when a slide is read out; then the report. */
function CoachShow({ deck, from, pageId, title, target, onEnd }: { deck: Deck; from: number; pageId?: string; title?: string; target?: number; onEnd: (r: RehearsedSlide[]) => void }) {
  const lang = speechLang();
  const done = useRef<RehearsedSlide[]>([]);
  const cur = useRef<Live | null>(null);
  const started = useRef(Date.now());
  const said = useRef<{ t: number; units: number }[]>([]);
  const [heard, setHeard] = useState('');
  const [fillers, setFillers] = useState(0);
  const [listening, setListening] = useState<boolean | null>(null);
  const [, tick] = useState(0);
  const end = useRef(onEnd);
  end.current = onEnd;

  // A slide's time ends when another comes.
  const close = (now = Date.now()) => {
    const c = cur.current;
    if (c) done.current.push({ i: c.i, ms: now - c.at, steps: c.steps, said: c.said });
    cur.current = null;
  };
  const onMove = (i: number, step: number) => {
    const now = Date.now();
    const c = cur.current;
    if (c && c.i === i) {
      if (step > c.steps.length) c.steps.push(now - c.at);
      return;
    }
    close(now);
    cur.current = { i, at: now, steps: [], said: [] };
  };

  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 500);
    const SR = SpeechRecognition();
    if (!SR) {
      setListening(false);
      return () => window.clearInterval(t);
    }
    let on = true;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.onresult = (ev: any) => {
      let now = '';
      for (let k = ev.resultIndex; k < ev.results.length; k++) {
        const x = ev.results[k];
        const text = String(x[0]?.transcript ?? '').trim();
        if (!x.isFinal) now += ` ${text}`;
        else if (text) {
          cur.current?.said.push(text);
          said.current.push({ t: Date.now(), units: speechUnits(text) });
          const f = Object.values(fillersIn([text], lang)).reduce((a, b) => a + b, 0);
          if (f) setFillers((n) => n + f);
        }
      }
      const last = [...(cur.current?.said.slice(-2) ?? []), now].join(' ').replace(/\s+/g, ' ').trim();
      setHeard(last.length > 90 ? `…${last.slice(-90).replace(/^\S*\s/, '')}` : last);
    };
    r.onerror = (ev: any) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') {
        on = false;
        setListening(false);
      }
    };
    // It stops by itself after a silence: listen again while rehearsing.
    r.onend = () => {
      if (on)
        try {
          r.start();
        } catch {}
    };
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
    return () => {
      on = false;
      window.clearInterval(t);
      try {
        r.abort();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = Date.now();
  const c = cur.current;
  const total = now - started.current;
  const wpm = rollingPace(said.current, now, 30_000, started.current);
  const hint = paceHint(wpm, lang);
  const slide = c ? deck.slides[c.i] : undefined;
  const reading = !!slide && !!c && c.said.length > 0 && readShare(c.said.join(' '), slideWords(slide)) >= 0.5;
  const over = target !== undefined && total > target * 60_000;
  const hud = (
    <div className="pointer-events-none absolute top-3 right-3 z-[5] flex w-[min(78vw,260px)] flex-col gap-1.5 rounded-2xl bg-black/65 px-3.5 py-2.5 text-[12.5px] text-white/85 shadow-lg ring-1 ring-white/10">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-white/60">{tr('This slide')}</span>
        <span className="font-mono text-[15px] text-white tabular-nums">{clock(c ? now - c.at : 0)}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-white/60">{tr('In all')}</span>
        <span className={cx('font-mono tabular-nums', over ? 'text-[#ffb4a8]' : 'text-white')}>
          {clock(total)}
          {target !== undefined && <span className="text-white/50"> / {clock(target * 60_000)}</span>}
        </span>
      </div>
      {listening && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 text-white/60">{tr('Pace')}</span>
            <span className="tabular-nums">{wpm === null ? '…' : tr(`${wpm} words a minute`)}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 text-white/60">{tr('Filler words')}</span>
            <span className="tabular-nums">{fillers}</span>
          </div>
          {hint && <div className="rounded-lg bg-white/10 px-2 py-1 text-white">{hint === 'fast' ? tr('A little fast: slow down a bit') : tr('A little slow: you can go faster')}</div>}
          {reading && <div className="rounded-lg bg-white/10 px-2 py-1 text-white">{tr('You are reading the slide: say it in your own words')}</div>}
          {heard && (
            <div translate="no" className="line-clamp-2 text-[12px] text-white/55 italic">
              {heard}
            </div>
          )}
        </>
      )}
      {listening === false && <div className="text-[12px] text-white/55">{tr('Not listening: timing the slides only')}</div>}
    </div>
  );
  return (
    <Slideshow
      deck={deck}
      from={from}
      pageId={pageId}
      title={title}
      onMove={onMove}
      over={hud}
      onClose={() => {
        close();
        end.current(done.current);
      }}
    />
  );
}

/** The rehearsal's report: how long against the aim, each slide's time and pace, the fillers, and what to look at. */
function CoachReportDialog({ deck, report, onTimings, onAgain, onClose }: { deck: Deck; report: CoachReport; onTimings: () => void; onAgain: () => void; onClose: () => void }) {
  const [used, setUsed] = useState(false);
  const longest = Math.max(1, ...report.slides.map((s) => s.ms));
  const share = report.slides.length ? (report.target ?? report.total) / report.slides.length : 0;
  const [lo, hi] = report.range;
  const pace = report.words < 20 ? null : report.perMinute > hi ? tr('a little fast') : report.perMinute < lo ? tr('a little slow') : tr('a comfortable pace');
  const name = (i: number) => slideTitle(deck.slides[i] ?? { id: '', els: [] }) || tr(`Slide ${i + 1}`);
  const diff = report.target !== undefined ? report.total - report.target : 0;
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr('How the rehearsal went')}
      width={560}
      footer={
        <>
          <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={onAgain}>
            {tr('Rehearse again')}
          </Button>
          <span className="flex-1" />
          <Button
            variant="secondary"
            disabled={used || !report.slides.length}
            onClick={() => {
              onTimings();
              setUsed(true);
            }}
          >
            {used ? tr('The timings are used') : tr('Use these timings')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {tr('Done')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2">
        <Stat
          label={tr('In all')}
          value={clock(report.total)}
          sub={report.target !== undefined ? (Math.abs(diff) < 15_000 ? tr('right on time') : diff > 0 ? tr(`${clock(diff)} over`) : tr(`${clock(-diff)} under`)) : undefined}
          warn={report.target !== undefined && diff > 15_000}
        />
        <Stat label={tr('Pace')} value={report.words ? tr(`${report.perMinute} a minute`) : '–'} sub={pace ?? (report.words ? undefined : tr('nothing heard'))} warn={!!pace && pace !== tr('a comfortable pace')} />
        <Stat
          label={tr('Filler words')}
          value={String(report.fillers.reduce((n, f) => n + f[1], 0))}
          sub={
            report.fillers
              .slice(0, 3)
              .map((f) => `${f[0]} ×${f[1]}`)
              .join(', ') || undefined
          }
        />
      </div>
      {(report.reading.length > 0 || report.slides.some((s) => s.flag)) && (
        <ul className="mt-3 space-y-1 text-[13px] leading-snug text-fg-2">
          {report.reading.length > 0 && (
            <li>
              {tr(`You read out the words of ${report.reading.length === 1 ? 'one slide' : `${report.reading.length} slides`} (${report.reading.map((i) => i + 1).join(', ')}): say what they mean in your own words, and leave the slide to show them.`)}
            </li>
          )}
          {report.slides.some((s) => s.flag === 'rushed') && (
            <li>
              {tr('Rushed:')}{' '}
              {report.slides
                .filter((s) => s.flag === 'rushed')
                .map((s) => s.i + 1)
                .join(', ')}
            </li>
          )}
          {report.slides.some((s) => s.flag === 'lingered') && (
            <li>
              {tr('Lingered on:')}{' '}
              {report.slides
                .filter((s) => s.flag === 'lingered')
                .map((s) => s.i + 1)
                .join(', ')}
            </li>
          )}
        </ul>
      )}
      <div className="mt-3 text-[12px] font-medium tracking-wide text-fg-3 uppercase">{tr('Each slide')}</div>
      <div className="mt-1 max-h-[38vh] space-y-1 overflow-y-auto pr-1">
        {report.slides.map((s) => (
          <div key={s.i} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-6 shrink-0 text-right text-fg-3 tabular-nums">{s.i + 1}</span>
            <span translate="no" className="w-[34%] min-w-0 shrink-0 truncate text-fg-2" title={name(s.i)}>
              {name(s.i)}
            </span>
            <div className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-bg-2">
              <div className={cx('absolute inset-y-0 left-0 rounded', s.flag === 'rushed' ? 'bg-warn' : s.flag === 'lingered' ? 'bg-err/70' : 'bg-accent/70')} style={{ width: `${Math.max(2, (s.ms / longest) * 100)}%` }} />
              {share > 0 && <div className="absolute inset-y-0 w-px bg-fg/40" style={{ left: `${Math.min(100, (share / longest) * 100)}%` }} />}
            </div>
            <span className="w-11 shrink-0 text-right text-fg-2 tabular-nums">{clock(s.ms)}</span>
            <span className="w-16 shrink-0 text-right text-fg-3 tabular-nums">{s.words ? tr(`${s.perMinute}/min`) : ''}</span>
          </div>
        ))}
      </div>
      {share > 0 && <p className="mt-2 text-[12px] text-fg-3">{report.target !== undefined ? tr('The line on each bar is its share of the time you aimed for.') : tr('The line on each bar is the average time a slide took.')}</p>}
      <p className="mt-1 text-[12px] leading-snug text-fg-3">{tr('Use these timings: each slide goes on by itself after its rehearsed time, its animations’ clicks as you made them (Slide → Transition → Goes on changes it back).')}</p>
    </Dialog>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-bg-1 px-3 py-2 ring-1 ring-line">
      <div className="text-[11.5px] text-fg-3">{label}</div>
      <div className="text-[18px] font-semibold tabular-nums">{value}</div>
      {sub && <div className={cx('truncate text-[12px]', warn ? 'text-warn' : 'text-fg-3')}>{sub}</div>}
    </div>
  );
}

/**
 * Rehearse with coach, from start to end: the time to aim for, the slideshow with the coach, the report; Use these
 * timings changes the deck (`change`, one step to undo).
 */
export function Coach({ deck, from, pageId, title, change, onClose }: { deck: Deck; from: number; pageId?: string; title?: string; change: (f: (d: Deck) => Deck) => void; onClose: () => void }) {
  const [stage, setStage] = useState<'setup' | 'show' | 'report'>('setup');
  const [target, setTarget] = useState<number | undefined>(undefined);
  const [rehearsed, setRehearsed] = useState<RehearsedSlide[]>([]);
  const [run, setRun] = useState(0);
  const report = useMemo(() => coachReport(rehearsed, deck, { lang: speechLang(), targetMinutes: target }), [rehearsed, deck, target]);
  if (stage === 'setup')
    return (
      <CoachSetup
        deck={deck}
        onClose={onClose}
        onStart={(m) => {
          setTarget(m);
          setStage('show');
        }}
      />
    );
  if (stage === 'show')
    return (
      <CoachShow
        key={run}
        deck={deck}
        from={from}
        pageId={pageId}
        title={title}
        target={target}
        onEnd={(r) => {
          setRehearsed(r);
          setStage('report');
        }}
      />
    );
  return (
    <CoachReportDialog
      deck={deck}
      report={report}
      onTimings={() => change((d) => withTimings(d, rehearsedTimings(report)))}
      onAgain={() => {
        setRun((n) => n + 1);
        setStage('show');
      }}
      onClose={onClose}
    />
  );
}
