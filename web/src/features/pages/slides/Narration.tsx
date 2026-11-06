// A slide's narration, as PowerPoint's recorded narration and Canva's voice-overs: in the Slide tab, Record (the
// microphone, a level meter while it listens, the speaker notes to read from; then Again or Keep) or Make with AI (the
// speaker notes read aloud, or the slide's own words when it has none, by the voice model of Settings → Images, video
// and audio, its cost said first; the OpenRouter key asked for where there is none), for this slide or every slide;
// played and taken off there too. The slideshow plays them with Present → Play the narration, going on by itself as
// each ends. The sounds are kept with the deck as its videos are (server/pages/sounds.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Pause, Play, RotateCcw, Square, Trash2, WandSparkles } from 'lucide-react';
import { type Deck, type Narration as NarrationT } from '@shared/slides';
import { narrationWords } from '@shared/slides-show';
import { ApiError, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';
import { tr } from '../../../i18n/runtime';
import { Button, cx, Dialog, Segmented, Switch, Throbber } from '../../../components/ui';
import { KeyAsk } from '../../images/studio/KeyAsk';
import { errorWords, money, needsKey } from '../../images/studio/logic';
import { Select } from '../studio/fields';
import { Section } from './controls';
import { setSlide } from './ops';

type Change = (d: Deck | ((d: Deck) => Deck), key?: string) => void;

/** Where a kept narration is fetched from. */
export const soundUrl = (src: string) => mu(`/api/slides/sounds/${src.replace(/^naget-audio:/, '')}`);

function clock(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** A narration played in the panel: play or pause, how far it is, its length, and taking it off. */
function Player({ n, onRemove }: { n: NarrationT; onRemove?: () => void }) {
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(n.seconds);
  useEffect(() => {
    setOn(false);
    setAt(0);
    setLen(n.seconds);
  }, [n.src, n.seconds]);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-bg-1 px-2 py-1.5 ring-1 ring-line">
      <audio
        ref={a}
        src={soundUrl(n.src)}
        preload="metadata"
        onPlay={() => setOn(true)}
        onPause={() => setOn(false)}
        onEnded={() => setOn(false)}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLen(e.currentTarget.duration)}
      />
      <button
        type="button"
        aria-label={on ? tr('Pause the narration') : tr('Play the narration')}
        title={on ? tr('Pause the narration') : tr('Play the narration')}
        onClick={() => (on ? a.current?.pause() : void a.current?.play().catch(() => {}))}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-accent-fg"
      >
        {on ? <Pause size={13} /> : <Play size={13} className="translate-x-[1px]" />}
      </button>
      <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-3">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${len ? Math.min(100, (at / len) * 100) : 0}%` }} />
      </div>
      <span className="shrink-0 text-[11.5px] text-fg-3 tabular-nums">
        {on || at ? `${clock(at)} / ` : ''}
        {clock(len)}
      </span>
      {onRemove && (
        <button type="button" aria-label={tr('Remove the narration')} title={tr('Remove the narration')} onClick={onRemove} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

/** The Slide tab's Narration: the slide's, to play, record again, make with AI or take off; every slide's with AI. */
export function NarrationSection({ deck, index, change }: { deck: Deck; index: number; change: Change }) {
  const slide = deck.slides[index];
  const n = slide.narration;
  const [ask, setAsk] = useState<'record' | 'ai' | 'all' | null>(null);
  const narrated = deck.slides.filter((s) => s.narration).length;
  return (
    <Section title={tr('Narration')}>
      {n ? (
        <>
          <Player n={n} onRemove={() => change((d) => setSlide(d, index, ({ narration: _n, ...s }) => s))} />
          <p className="text-[11.5px] leading-snug text-fg-3">
            {n.ai ? tr('Made with AI.') : tr('Recorded.')} {tr('Present → Play the narration plays each slide’s, and goes on when it ends.')}
          </p>
        </>
      ) : (
        <p className="text-[12px] leading-snug text-fg-3">{tr('A voice for this slide, played by Present → Play the narration, which goes on to the next slide when it ends.')}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="secondary" icon={<Mic size={14} />} onClick={() => setAsk('record')}>
          {n ? tr('Record again') : tr('Record')}
        </Button>
        <Button size="sm" variant="secondary" icon={<WandSparkles size={14} />} onClick={() => setAsk('ai')}>
          {tr('Make with AI')}
        </Button>
      </div>
      {deck.slides.length > 1 && (
        <Button size="sm" variant="ghost" icon={<WandSparkles size={14} />} onClick={() => setAsk('all')}>
          {tr('Narrate every slide with AI')}
        </Button>
      )}
      {narrated > 0 && narrated < deck.slides.length && <p className="text-[11.5px] text-fg-3">{tr(`${narrated} of ${deck.slides.length} slides have a narration`)}</p>}
      {ask === 'record' && <RecordNarration deck={deck} index={index} change={change} onClose={() => setAsk(null)} />}
      {(ask === 'ai' || ask === 'all') && <NarrateWithAi deck={deck} index={index} every={ask === 'all'} change={change} onClose={() => setAsk(null)} />}
    </Section>
  );
}

// ---- recording ---------------------------------------------------------------------------------------------------

/** The kinds a voice may be recorded in, those PowerPoint and every browser play first (the server makes the rest an M4A). */
const SOUND_KINDS = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];

/** A sound kept by the app: its source and length (the server's, else as counted here). */
export async function keepSound(blob: Blob, seconds: number): Promise<{ src: string; seconds: number }> {
  const r = await fetch(mu(`/api/slides/sounds?seconds=${Math.round(seconds * 100) / 100}`), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: blob, credentials: 'same-origin' });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(j?.error ?? `${r.status} ${r.statusText}`, r.status, j);
  return { src: j.src, seconds: j.seconds || seconds };
}

/** Record: the microphone with a level meter, the notes to read from, a timer; then the take to hear, Again or Keep. */
function RecordNarration({ deck, index, change, onClose }: { deck: Deck; index: number; change: Change; onClose: () => void }) {
  const slide = deck.slides[index];
  const [phase, setPhase] = useState<'ready' | 'on' | 'take' | 'saving'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => new Array(48).fill(0));
  const [take, setTake] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [ms, setMs] = useState(0);
  const parts = useRef<{ stream: MediaStream; ctx: AudioContext; rec: MediaRecorder; frame: number; started: number } | null>(null);

  const release = () => {
    const p = parts.current;
    if (!p) return;
    cancelAnimationFrame(p.frame);
    p.stream.getTracks().forEach((t) => t.stop());
    void p.ctx.close().catch(() => {});
    parts.current = null;
  };
  useEffect(
    () => () => {
      if (parts.current?.rec.state === 'recording') parts.current.rec.stop();
      release();
    },
    [],
  );
  useEffect(() => () => void (take && URL.revokeObjectURL(take.url)), [take]);

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? tr('The microphone was not allowed: allow it in the browser’s site settings, then try again.') : tr('No microphone could be used.'));
      return;
    }
    const ctx = new AudioContext();
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(meter);
    const kind = SOUND_KINDS.find((k) => MediaRecorder.isTypeSupported(k));
    const rec = new MediaRecorder(stream, kind ? { mimeType: kind, audioBitsPerSecond: 96_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const seconds = parts.current ? (Date.now() - parts.current.started) / 1000 : 0;
      release();
      const blob = new Blob(chunks, { type: (rec.mimeType || kind || 'audio/webm').split(';')[0] });
      setTake({ blob, url: URL.createObjectURL(blob), seconds });
      setPhase('take');
    };
    const data = new Float32Array(meter.fftSize);
    let last = 0;
    const draw = (t: number) => {
      const p = parts.current;
      if (!p) return;
      p.frame = requestAnimationFrame(draw);
      setMs(Date.now() - p.started);
      if (t - last < 60) return;
      last = t;
      meter.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      // How loud, on a scale that shows speech well (RMS in decibels, -55 dB to -10 dB).
      const db = 10 * Math.log10(sum / data.length + 1e-12);
      const level = Math.max(0, Math.min(1, (db + 55) / 45));
      setLevels((l) => [...l.slice(1), level]);
    };
    parts.current = { stream, ctx, rec, frame: requestAnimationFrame(draw), started: Date.now() };
    rec.start(500);
    setPhase('on');
  };
  const stop = () => parts.current?.rec.state === 'recording' && parts.current.rec.stop();
  const again = () => {
    setTake(null);
    setLevels(new Array(48).fill(0));
    setMs(0);
    void start();
  };
  const keep = async () => {
    if (!take) return;
    setPhase('saving');
    setError(null);
    try {
      const got = await keepSound(take.blob, take.seconds);
      change((d) => setSlide(d, index, (s) => ({ ...s, narration: { src: got.src, seconds: got.seconds } })));
      onClose();
    } catch (e) {
      setError(errorWords(e));
      setPhase('take');
    }
  };
  const quiet = phase === 'on' && ms > 2500 && Math.max(...levels.slice(-30)) < 0.18;
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`Narration for slide ${index + 1}`)}
      width={480}
      footer={
        phase === 'take' || phase === 'saving' ? (
          <>
            <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={phase === 'saving'} onClick={again}>
              {tr('Again')}
            </Button>
            <Button variant="primary" disabled={phase === 'saving'} onClick={() => void keep()}>
              {phase === 'saving' ? tr('Keeping it') : tr('Keep')}
            </Button>
          </>
        ) : phase === 'on' ? (
          <Button variant="primary" icon={<Square size={12} className="fill-current" />} onClick={stop}>
            {tr('Stop')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {tr('Cancel')}
            </Button>
            <Button variant="primary" icon={<Mic size={14} />} onClick={() => void start()}>
              {tr('Start recording')}
            </Button>
          </>
        )
      }
    >
      <div className="mb-1 text-[12px] font-medium tracking-wide text-fg-3 uppercase">{slide.notes?.trim() ? tr('Your notes, to read from') : tr('This slide has no notes')}</div>
      <div translate="no" className="max-h-[34vh] min-h-[3.5em] overflow-y-auto rounded-lg bg-bg-1 px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap text-fg-2 ring-1 ring-line">
        {slide.notes?.trim() || <span className="text-fg-3">{tr('Say what the slide is about; the speaker notes, under the slide, are the place to write it first.')}</span>}
      </div>
      {phase === 'take' || phase === 'saving' ? (
        take && <audio src={take.url} controls className="mt-3 w-full" />
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-[2px]" aria-hidden>
            {levels.map((l, i) => (
              <span key={i} className={cx('w-full rounded-full', phase === 'on' ? 'bg-accent' : 'bg-bg-3')} style={{ height: `${Math.max(8, l * 100)}%` }} />
            ))}
          </div>
          <span className={cx('flex shrink-0 items-center gap-1.5 font-mono text-[14px] tabular-nums', phase === 'on' ? 'text-fg' : 'text-fg-3')}>
            {phase === 'on' && <span className="h-2 w-2 rounded-full bg-[#e5484d]" />}
            {clock(ms / 1000)}
          </span>
        </div>
      )}
      {quiet && <p className="mt-1.5 text-[12px] text-warn">{tr('It hears very little: come nearer the microphone, or check which one the browser uses.')}</p>}
      {error && <p className="mt-2 text-[12.5px] text-err">{error}</p>}
    </Dialog>
  );
}

// ---- made with AI ------------------------------------------------------------------------------------------------

interface Estimate {
  model: string;
  label: string;
  voices: string[];
  voice?: string;
  described: boolean;
  directions: boolean;
  keySet: boolean;
  each: { cost?: number; seconds: number; tooLong?: boolean }[];
  cost?: number;
  seconds: number;
  maxSeconds?: number;
}

/** How a voice's id reads: "en-US-Harper:MAI-Voice-2.1" → "Harper (en-US)", "English_radiant_girl" → "English radiant girl". */
function voiceName(v: string): string {
  const mai = /^([a-z]{2,3}-[A-Z]{2})-([^:]+)(?::.*)?$/.exec(v);
  if (mai) return `${mai[2]} (${mai[1]})`;
  const s = v.replace(/:.*$/, '');
  if (/[A-Z]/.test(s) && s.includes('_')) return s.replace(/_+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const lengthWords = (s: number) => (s >= 60 ? tr(`${Math.floor(s / 60)} min ${Math.round(s % 60)} s`) : tr(`${Math.max(1, Math.round(s))} s`));

/** Make with AI: this slide's words (to change before) or every slide's, the voice, the cost; then each slide gets its narration. */
function NarrateWithAi({ deck, index, every: everyAsked, change, onClose }: { deck: Deck; index: number; every: boolean; change: Change; onClose: () => void }) {
  const [every, setEvery] = useState(everyAsked);
  const [again, setAgain] = useState(false);
  const [words, setWords] = useState(() => narrationWords(deck.slides[index]));
  const [how, setHow] = useState(() => localStorage.getItem('wa.slides.narrationHow') ?? '');
  const [voice, setVoice] = useState(() => localStorage.getItem('wa.slides.narrationVoice') ?? '');
  const [est, setEst] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ done: number; of: number } | null>(null);
  const [keyAsk, setKeyAsk] = useState(false);
  const stop = useRef<AbortController | null>(null);
  // The slides to narrate and their words: this one, or each shown one with words (those with a narration only when asked).
  const jobs = useMemo(() => {
    if (!every) return words.trim() ? [{ i: index, text: words.trim() }] : [];
    return deck.slides.flatMap((s, i) => {
      if (s.hidden || (s.narration && !again)) return [];
      const t = narrationWords(s);
      return t ? [{ i, text: t }] : [];
    });
  }, [every, again, words, deck, index]);
  const fromNotes = !!deck.slides[index].notes?.trim();

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      post<Estimate>('/api/slides/narration/estimate', { texts: jobs.map((j) => j.text), how })
        .then((e) => {
          if (!alive) return;
          setEst(e);
          if (!e.keySet) setKeyAsk(true);
          if (e.voices.length && !e.voices.includes(voice)) setVoice(e.voice ?? e.voices[0]);
        })
        .catch((e) => alive && setError(errorWords(e)));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, how]);
  useEffect(() => () => stop.current?.abort(), []);

  const make = async () => {
    if (!jobs.length || busy) return;
    localStorage.setItem('wa.slides.narrationHow', how);
    if (voice) localStorage.setItem('wa.slides.narrationVoice', voice);
    setError(null);
    const ac = new AbortController();
    stop.current = ac;
    setBusy({ done: 0, of: jobs.length });
    for (let k = 0; k < jobs.length; k++) {
      const j = jobs[k];
      try {
        const got = await post<{ src: string; seconds: number; cost?: number; text: string }>('/api/slides/narration', { text: j.text, voice: voice || undefined, how: how || undefined });
        if (ac.signal.aborted) break;
        change((d) => setSlide(d, j.i, (s) => ({ ...s, narration: { src: got.src, seconds: got.seconds, text: got.text, ai: true } })));
        setBusy({ done: k + 1, of: jobs.length });
      } catch (e) {
        if (ac.signal.aborted) break;
        const m = errorWords(e);
        if (needsKey(m)) {
          setKeyAsk(true);
          setEst((x) => (x ? { ...x, keySet: false } : x));
        }
        setError(jobs.length > 1 ? tr(`Slide ${j.i + 1}: ${m}`) : m);
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    if (!ac.signal.aborted) onClose();
  };

  const tooLong = est?.each.some((e) => e.tooLong);
  const priceLine = !est
    ? ''
    : est.cost !== undefined
      ? tr(`With ${est.label}, through OpenRouter: about ${money(est.cost)} for ${lengthWords(est.seconds)} of narration`)
      : tr(`With ${est.label}, through OpenRouter: it does not list its price (about ${lengthWords(est.seconds)} of narration)`);
  return (
    <Dialog
      open
      onClose={() => {
        stop.current?.abort();
        onClose();
      }}
      title={every ? tr('Narrate every slide with AI') : tr(`Narrate slide ${index + 1} with AI`)}
      width={520}
      footer={
        busy ? (
          <>
            <span className="flex flex-1 items-center gap-2 text-[13px] text-fg-2">
              <Throbber size={14} />
              {busy.of > 1 ? tr(`Narrating: ${busy.done} of ${busy.of} slides done`) : tr('Making the narration')}
            </span>
            <Button variant="ghost" onClick={() => stop.current?.abort()}>
              {tr('Stop')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {tr('Cancel')}
            </Button>
            <Button variant="primary" icon={<WandSparkles size={14} />} disabled={!jobs.length || !est || !est.keySet || tooLong} onClick={() => void make()}>
              {jobs.length > 1 ? tr(`Narrate ${jobs.length} slides`) : tr('Make the narration')}
            </Button>
          </>
        )
      }
    >
      <div className="mb-3">
        <Segmented
          size="sm"
          value={every ? 'all' : 'one'}
          onChange={(v) => setEvery(v === 'all')}
          options={[
            { value: 'one', label: tr('This slide') },
            { value: 'all', label: tr('Every slide') },
          ]}
        />
      </div>
      {every ? (
        <div className="space-y-1.5 text-[13px] leading-snug text-fg-2">
          <p>{jobs.length ? tr(`${jobs.length} slide${jobs.length === 1 ? '' : 's'} get a narration of their speaker notes (or, without notes, of their own words).`) : tr('No slide is left to narrate: every slide with words has a narration.')}</p>
          {deck.slides.some((s) => s.narration) && (
            <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
              <span className="min-w-0 flex-1">{tr('Make again the slides that have one')}</span>
              <Switch label={tr('Make again the slides that have one')} on={again} onChange={setAgain} />
            </label>
          )}
        </div>
      ) : (
        <>
          <div className="mb-1 text-[12px] text-fg-3">{fromNotes ? tr('The words to read, from the speaker notes') : tr('The words to read, from the slide (it has no speaker notes)')}</div>
          <textarea translate="no" value={words} onChange={(e) => setWords(e.target.value)} rows={5} className="w-full resize-y rounded-lg border border-line bg-bg-1 px-3 py-2 text-[13.5px] leading-relaxed outline-none focus:border-accent" />
        </>
      )}
      {est && est.voices.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-[13px] text-fg-2">
          <span className="w-24 shrink-0">{tr('Voice')}</span>
          <Select value={voice} onChange={setVoice} className="min-w-0 flex-1" title={tr('Voice')} options={est.voices.map((v) => ({ value: v, label: voiceName(v) }))} />
        </label>
      )}
      {est && (est.described || est.directions) && (
        <label className="mt-2 flex items-center gap-2 text-[13px] text-fg-2">
          <span className="w-24 shrink-0">{est.described ? tr('How it sounds') : tr('How to read it')}</span>
          <input
            value={how}
            onChange={(e) => setHow(e.target.value.slice(0, 300))}
            placeholder={est.described ? tr('A clear, warm narrator, at an easy pace') : tr('Calm and friendly')}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-2 text-[13px] outline-none focus:border-accent"
          />
        </label>
      )}
      <p className="mt-3 text-[12.5px] leading-snug text-fg-3">{est ? priceLine : <Throbber size={12} />}</p>
      {tooLong && est?.maxSeconds && (
        <p className="mt-1 text-[12.5px] text-warn">{tr(`${est.label} reads at most ${lengthWords(est.maxSeconds)} at once: make the longest words shorter, or pick another voice model in Settings → Images, video and audio.`)}</p>
      )}
      {keyAsk && est && !est.keySet && (
        <div className="mt-3">
          <KeyAsk
            onSaved={() => {
              setKeyAsk(false);
              setEst((x) => (x ? { ...x, keySet: true } : x));
            }}
            onSkip={onClose}
          />
        </div>
      )}
      {error && <p className="mt-2 text-[12.5px] text-err">{error}</p>}
    </Dialog>
  );
}
