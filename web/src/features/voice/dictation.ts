// Dictation: speech into the message being written, never sent by itself. The browser's own recognition
// shows the words as they come and adds them when you stop; otherwise the microphone is recorded and
// the server turns the recording into text (whisper.cpp or a service, Settings → Voice).
import { useEffect, useRef, useState } from 'react';
import { mu } from '../../lib/machine';
import { toast } from '../../lib/store';
import { canRecord, SpeechRecognition, speechLang } from './prefs';
import { toWav } from './wav';

export type Phase = 'idle' | 'starting' | 'listening' | 'transcribing';
/** Why the microphone cannot be used: each gets its own explanation. */
export type Problem = 'insecure' | 'denied' | 'nomic' | 'busy' | 'service' | 'unsupported';

/** The longest recording, after which it stops by itself. */
const MAX_MS = 10 * 60_000;

interface Session {
  stop(): void;
  /** Stops and drops what was heard. */
  abort(): void;
  /** Listens on in another language (the browser's recognition starts again; what was heard stays). */
  relang?(lang: string): void;
}

/** Adds words to text heard so far. Safari sometimes repeats what it heard before in a newer result; that is not said twice. */
export function join(a: string, b: string): string {
  const x = a.trim();
  const y = b.trim();
  if (!y) return x;
  if (!x) return y;
  return y.toLowerCase().startsWith(x.toLowerCase()) ? y : `${x} ${y}`;
}

function heardOf(results: any): { final: string; interim: string } {
  let final = '';
  let interim = '';
  for (let i = 0; i < results.length; i++) {
    const t = String(results[i]?.[0]?.transcript ?? '');
    if (results[i].isFinal) final = join(final, t);
    else interim = join(interim, t);
  }
  return { final, interim };
}

const problemOfMediaError = (e: unknown): Problem | 'other' => {
  const n = (e as Error)?.name;
  if (!window.isSecureContext) return 'insecure';
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'denied';
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'nomic';
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'busy';
  return 'other';
};

/** The input level, 0 to 1, a few dozen times a second, while recording. */
function meter(ctx: AudioContext | null, stream: MediaStream, on: (v: number) => void): () => void {
  if (!ctx) return () => {};
  try {
    void ctx.resume?.().catch(() => {});
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    // Into a silent output: some browsers only run a graph that reaches the speakers.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(an);
    an.connect(mute).connect(ctx.destination);
    const buf = new Uint8Array(an.fftSize);
    let raf = 0;
    let shown = 0;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const b of buf) sum += ((b - 128) / 128) ** 2;
      // Up at once, down slowly, so the bars follow speech rather than flicker between syllables.
      shown = Math.max(Math.min(1, Math.sqrt(sum / buf.length) * 5), shown * 0.93);
      on(shown);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close().catch(() => {});
    };
  } catch {
    void ctx.close().catch(() => {});
    return () => {};
  }
}

/** The recording's text from the server, sent as 16 kHz WAV when the browser can make it. */
async function transcribe(blob: Blob): Promise<string> {
  const wav = await toWav(blob);
  const r = await fetch(mu(`/api/voice/transcribe?lang=${encodeURIComponent(speechLang())}`), {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: wav ?? blob,
    credentials: 'same-origin',
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error ?? `The server answered ${r.status}`);
  return String(d?.text ?? '').trim();
}

export interface Dictation {
  phase: Phase;
  mode: 'browser' | 'server' | null;
  /** What the browser's recognition has heard so far. */
  heard: string;
  since: number;
  problem: Problem | null;
  clearProblem(): void;
  start(mode: 'browser' | 'server'): void;
  stop(): void;
  /** The language changed while listening. */
  relang(lang: string): void;
  /** Gets the input level while the server's recognition records. */
  onLevel: { current: (v: number) => void };
}

export function useDictation(insert: (text: string) => void): Dictation {
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<'browser' | 'server' | null>(null);
  const [heard, setHeard] = useState('');
  const [since, setSince] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(null);
  const sess = useRef<Session | null>(null);
  const put = useRef(insert);
  put.current = insert;
  const onLevel = useRef<(v: number) => void>(() => {});

  // Leaving the page drops a dictation under way: its words have nowhere to go.
  useEffect(() => () => sess.current?.abort(), []);

  const done = (s: Session) => {
    if (sess.current !== s) return;
    sess.current = null;
    setPhase('idle');
    setHeard('');
  };

  const browser = (lang: string, carry = '') => {
    const SR = SpeechRecognition();
    if (!SR) return;
    if (!window.isSecureContext) return setProblem('insecure');
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let got = { final: '', interim: '' };
    let error = '';
    let next: string | null = null;
    const s: Session = {
      stop: () => rec.stop(),
      abort: () => {
        sess.current = null;
        try {
          rec.abort();
        } catch {}
      },
      relang: (l) => {
        next = l;
        rec.stop();
      },
    };
    rec.onstart = () => sess.current === s && setPhase('listening');
    rec.onresult = (e: any) => {
      got = heardOf(e.results);
      setHeard(join(join(carry, got.final), got.interim));
    };
    rec.onerror = (e: any) => (error = String(e.error ?? 'unknown'));
    rec.onend = () => {
      if (sess.current !== s) return;
      // When it stops before a result is final, the words heard last still count.
      const text = join(carry, got.final || got.interim);
      if (next) return browser(next, text);
      done(s);
      if (text) put.current(text);
      if (error && error !== 'aborted') explain(error, !!text);
    };
    sess.current = s;
    if (!carry) setSince(Date.now());
    setMode('browser');
    setPhase('starting');
    try {
      rec.start();
    } catch {
      done(s);
      toast('The browser’s speech recognition did not start; try again.', 'error');
    }
  };

  const explain = (error: string, gotWords: boolean) => {
    if (error === 'not-allowed') return setProblem(window.isSecureContext ? 'denied' : 'insecure');
    if (error === 'service-not-allowed') return setProblem('service');
    if (error === 'audio-capture') return setProblem('nomic');
    if (error === 'no-speech') return gotWords || toast('No words were heard. Tap the microphone and speak.');
    if (error === 'network') return toast('The browser’s speech service could not be reached. Check the connection, or turn on speech recognition on the server in Settings → Voice.', 'error');
    if (error === 'language-not-supported') return toast(`This browser cannot recognize ${speechLang()}. Pick another language in Settings → Voice.`, 'error');
    toast(`Dictation stopped (${error})`, 'error');
  };

  const server = async () => {
    if (!window.isSecureContext) return setProblem('insecure');
    if (!navigator.mediaDevices?.getUserMedia || !canRecord()) return setProblem('unsupported');
    // Made within the tap, so that Safari lets it run (it shows the input level).
    const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    let ctx: AudioContext | null = null;
    try {
      ctx = Ctx ? new Ctx() : null;
    } catch {}
    // Until the microphone is on, stopping just lets go.
    const s: Session = { stop: () => (sess.current = null), abort: () => (sess.current = null) };
    sess.current = s;
    setMode('server');
    setPhase('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      void ctx?.close().catch(() => {});
      done(s);
      const p = problemOfMediaError(e);
      return p === 'other' ? toast(`The microphone did not start: ${(e as Error).message}`, 'error') : setProblem(p);
    }
    const release = () => stream.getTracks().forEach((t) => t.stop());
    if (sess.current !== s) {
      void ctx?.close().catch(() => {});
      return release();
    }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported?.(m));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    } catch (e) {
      release();
      done(s);
      return toast(`This browser cannot record: ${(e as Error).message}`, 'error');
    }
    const chunks: Blob[] = [];
    let dropped = false;
    const stopMeter = meter(ctx, stream, (v) => onLevel.current(v));
    const cap = setTimeout(() => s.stop(), MAX_MS);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      clearTimeout(cap);
      release();
      stopMeter();
      if (dropped || sess.current !== s) return;
      setPhase('transcribing');
      try {
        const text = await transcribe(new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }));
        if (sess.current !== s) return;
        if (text) put.current(text);
        else toast('No words were heard. Try again a little closer to the microphone.');
      } catch (e) {
        if (sess.current === s) toast((e as Error).message, 'error');
      } finally {
        done(s);
      }
    };
    s.stop = () => rec.state !== 'inactive' && rec.stop();
    s.abort = () => {
      dropped = true;
      sess.current = null;
      if (rec.state !== 'inactive') rec.stop();
    };
    rec.start(1000);
    setSince(Date.now());
    setPhase('listening');
  };

  return {
    phase,
    mode,
    heard,
    since,
    problem,
    clearProblem: () => setProblem(null),
    start: (m) => {
      if (sess.current) return;
      setProblem(null);
      if (m === 'browser') browser(speechLang());
      else void server();
    },
    stop: () => {
      const s = sess.current;
      if (!s) return;
      // Still starting: nothing heard yet, so it just ends.
      if (phase === 'starting') {
        s.abort();
        sess.current = null;
        setPhase('idle');
        setHeard('');
      } else s.stop();
    },
    relang: (lang) => sess.current?.relang?.(lang),
    onLevel,
  };
}
