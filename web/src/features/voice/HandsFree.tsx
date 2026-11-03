// Hands-free: talk to the app while walking. A screen of its own listens, says what the server did with
// what it heard (start a session, steer one, how they are doing, read a reply, approve, stop), and listens
// again; when the session it is following finishes or needs you, it says so. It hears with the browser's
// own recognition, else records and has the server transcribe (Settings → Voice), and speaks with the
// browser's voices. The screen stays on while it is open.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Headphones, Loader, Mic, Pause, Volume2, X } from 'lucide-react';
import type { NotifyEvent } from '@shared/types';
import { cx } from '../../components/ui';
import { enc, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { useSessions } from '../../lib/store';
import { currentLang } from '../../i18n';
import { tr } from '../../i18n/runtime';
import { parts, speakable } from './plain';
import { canRecord, canSpeak, SpeechRecognition, speechLang, useServerVoice, useVoicePrefs } from './prefs';
import { toWav } from './wav';

export const useHandsFree = create<{ open: boolean; focus?: string }>(() => ({ open: false }));

/** Opens hands-free mode, about a session when one is given. The first words are said within the tap (Safari wants that). */
export function openHandsFree(focus?: string) {
  say(tr('I’m listening.'));
  useHandsFree.setState({ open: true, focus });
}

// ---- speaking -----------------------------------------------------------------------------------------

/** The language spoken and heard: Settings → Voice's, else the app's own (Greek → el-GR), else the browser's. */
const LOCALES: Record<string, string> = { zh: 'zh-CN', el: 'el-GR' };
const voiceLang = () => useVoicePrefs.getState().lang || LOCALES[currentLang()] || speechLang();

let speaking: { cancel: () => void } | null = null;

/** Says text with the voice and pace from Settings → Voice; resolves when it has been said (or cut short). */
function say(text: string): Promise<void> {
  if (!canSpeak() || !text.trim()) return Promise.resolve();
  const synth = window.speechSynthesis;
  synth.cancel();
  const list = parts(speakable(text));
  const p = useVoicePrefs.getState();
  const voice = p.voice ? synth.getVoices().find((v) => v.voiceURI === p.voice) : undefined;
  return new Promise((resolve) => {
    let i = 0;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      speaking = null;
      resolve();
    };
    speaking = {
      cancel: () => {
        synth.cancel();
        end();
      },
    };
    const next = () => {
      if (done) return;
      if (i >= list.length) return end();
      const u = new SpeechSynthesisUtterance(list[i++]);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = voiceLang();
      u.rate = Math.min(2, Math.max(0.5, p.rate || 1));
      u.onend = next;
      u.onerror = end;
      synth.speak(u);
    };
    next();
  });
}

// ---- hearing ------------------------------------------------------------------------------------------

interface Listening {
  promise: Promise<string>;
  abort: () => void;
}

/** Listening cannot go on (the microphone is not allowed, or there is none): said once, and it pauses. */
class Deaf extends Error {}

/** One thing said, with the browser's own recognition: its words, or '' when nothing was said. */
function hearInBrowser(lang: string, onHeard: (t: string) => void): Listening {
  const SR = SpeechRecognition()!;
  const rec = new SR();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = true;
  let final = '';
  let interim = '';
  let abort = () => {};
  const promise = new Promise<string>((resolve, reject) => {
    rec.onresult = (e: any) => {
      final = '';
      interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = String(e.results[i]?.[0]?.transcript ?? '');
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      onHeard((final || interim).trim());
    };
    let error = '';
    rec.onend = () => (/not-allowed|service-not-allowed|audio-capture/.test(error) ? reject(new Deaf(error === 'audio-capture' ? 'No microphone was found.' : 'The microphone is not allowed for this page.')) : resolve((final || interim).trim()));
    rec.onerror = (e: any) => (error = String(e.error ?? ''));
    abort = () => {
      final = '';
      interim = '';
      try {
        rec.abort();
      } catch {}
      resolve('');
    };
    try {
      rec.start();
    } catch {
      resolve('');
    }
  });
  return { promise, abort: () => abort() };
}

/**
 * One thing said, recorded and transcribed by the server: recording stops after a moment of quiet that
 * follows speech, or after a while with none.
 */
function hearOnServer(lang: string, onLevel: (v: number) => void): Listening {
  let abort = () => {};
  const promise = (async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      throw new Deaf((e as Error)?.name === 'NotFoundError' ? 'No microphone was found.' : 'The microphone is not allowed for this page.');
    }
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    let cancelled = false;
    abort = () => {
      cancelled = true;
      if (rec.state !== 'inactive') rec.stop();
    };
    rec.start();
    const buf = new Float32Array(an.fftSize);
    const started = Date.now();
    let spoke = 0;
    let quiet = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (rec.state === 'inactive') return resolve();
        an.getFloatTimeDomainData(buf);
        const level = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
        onLevel(Math.min(1, level * 8));
        const now = Date.now();
        if (level > 0.03) {
          spoke ||= now;
          quiet = 0;
        } else if (spoke) quiet ||= now;
        // A second and a half of quiet after speech, half a minute in all, or fifteen seconds of nothing.
        if ((spoke && quiet && now - quiet > 1500) || now - started > 30_000 || (!spoke && now - started > 15_000)) {
          rec.stop();
          return resolve();
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    if (cancelled || !spoke || !chunks.length) return '';
    const wav = (await toWav(new Blob(chunks, { type: rec.mimeType }))) ?? new Blob(chunks, { type: rec.mimeType });
    try {
      const r = await fetch(mu(`/api/voice/transcribe?lang=${enc(lang)}`), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: wav, credentials: 'same-origin' });
      return r.ok ? String((await r.json()).text ?? '').trim() : '';
    } catch {
      return '';
    }
  })();
  return { promise, abort: () => abort() };
}

// ---- the screen ---------------------------------------------------------------------------------------

type Phase = 'listening' | 'thinking' | 'speaking' | 'paused';

/** Saying goodbye ends hands-free mode, in the app's languages too. */
const BYE = /^(stop listening|goodbye|bye|that'?s all|end hands-free|exit|αντίο|τέλος|γεια σου|再见|拜拜|结束)/i;

export function HandsFree() {
  const { open, focus } = useHandsFree();
  const server = useServerVoice();
  const [phase, setPhase] = useState<Phase>('listening');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [level, setLevel] = useState(0);
  const listening = useRef<Listening | null>(null);
  const announce = useRef<string[]>([]);
  const paused = useRef(false);
  const alive = useRef(false);
  const focused = useSessions((s) => (focus ? s.byKey[focus] : undefined));
  const browser = !!SpeechRecognition();
  const canHear = browser || (!!server?.ready && canRecord());

  // The screen stays on while walking.
  useEffect(() => {
    if (!open) return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as any).wakeLock
      ?.request('screen')
      .then((l: typeof lock) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [open]);

  // What the followed session (or one started from here) does next is said when it finishes or needs you.
  useEffect(() => {
    if (!open) return;
    const on = (e: Event) => {
      const n = (e as CustomEvent<NotifyEvent>).detail;
      if (n.machine) return;
      const mine = n.key === useHandsFree.getState().focus;
      if (n.kind === 'done' && !mine) return;
      const text =
        n.kind === 'waiting'
          ? `${tr(`${n.title} needs you:`)} ${n.body}. ${tr(n.approval ? 'Say approve or deny.' : 'Answer it on the screen.')}`
          : n.kind === 'done'
            ? tr(`${n.title} is done. Say “read it” to hear the answer.`)
            : tr(`${n.title} stopped with an error.`);
      announce.current.push(text);
      if (n.kind === 'waiting') useHandsFree.setState({ focus: n.key });
      // Said at once: the listening stops for it, and starts again after.
      listening.current?.abort();
    };
    window.addEventListener('naget:notify', on);
    return () => window.removeEventListener('naget:notify', on);
  }, [open]);

  useEffect(() => {
    if (!open || !canHear) return;
    alive.current = true;
    paused.current = false;
    const lang = voiceLang();
    void (async () => {
      // The greeting said within the tap that opened this ends first.
      while (window.speechSynthesis?.speaking && alive.current) await new Promise((r) => setTimeout(r, 150));
      while (alive.current) {
        while (announce.current.length && alive.current) {
          setPhase('speaking');
          const t = announce.current.shift()!;
          setReply(t);
          await say(t);
        }
        if (paused.current) {
          setPhase('paused');
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        setPhase('listening');
        setHeard('');
        listening.current = browser ? hearInBrowser(lang, setHeard) : hearOnServer(lang, setLevel);
        let text = '';
        try {
          text = await listening.current.promise;
        } catch (e) {
          // No microphone to listen with: said once, then it waits for a tap.
          paused.current = true;
          setReply(e instanceof Deaf ? `${tr(e.message)} ${tr('Allow it in the browser, then tap to listen.')}` : tr('Listening stopped. Tap to listen again.'));
          setPhase('paused');
          if (e instanceof Deaf) await say(tr(e.message));
        }
        listening.current = null;
        setLevel(0);
        if (!alive.current || !text) continue;
        setHeard(text);
        if (BYE.test(text)) {
          await say(tr('Bye.'));
          useHandsFree.setState({ open: false });
          break;
        }
        setPhase('thinking');
        try {
          const r = await post<{ say: string; focus?: string }>('/api/voice/command', { text, focus: useHandsFree.getState().focus });
          if (r.focus) useHandsFree.setState({ focus: r.focus });
          setReply(r.say);
          setPhase('speaking');
          await say(r.say);
        } catch (e) {
          const msg = (e as Error).message;
          setReply(msg);
          setPhase('speaking');
          await say(msg);
        }
      }
    })();
    return () => {
      alive.current = false;
      listening.current?.abort();
      speaking?.cancel();
    };
  }, [open, canHear, browser]);

  if (!open) return null;
  const close = () => useHandsFree.setState({ open: false });
  const tapOrb = () => {
    if (phase === 'speaking') return speaking?.cancel();
    paused.current = !paused.current;
    if (paused.current) {
      listening.current?.abort();
      setPhase('paused');
    }
  };
  const icon = phase === 'thinking' ? <Loader size={44} className="animate-spin" /> : phase === 'speaking' ? <Volume2 size={44} /> : phase === 'paused' ? <Pause size={44} /> : <Mic size={44} />;
  const words = { listening: 'Listening…', thinking: 'Working on it…', speaking: 'Speaking', paused: 'Paused: tap to listen' }[phase];
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-bg px-5 pt-[calc(var(--safe-top)+16px)] pb-[calc(var(--safe-bottom)+20px)]">
      <div className="flex items-center gap-2">
        <Headphones size={18} className="text-fg-3" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">Hands-free</div>
          <div className="truncate text-[12.5px] text-fg-3" translate="no">
            {focused ? focused.title : 'Talk to Naget Agent'}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="End hands-free" className="rounded-full p-2 text-fg-3 hover:bg-bg-2 hover:text-fg">
          <X size={22} />
        </button>
      </div>
      {!canHear ? (
        <div className="m-auto max-w-[420px] text-center text-[15px] leading-relaxed text-fg-2">
          This browser cannot listen. Use Chrome or Safari, or turn on speech recognition on the server in Settings → Voice.
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <button
              type="button"
              onClick={tapOrb}
              aria-label={words}
              className={cx('flex h-40 w-40 items-center justify-center rounded-full transition-[background,transform] duration-200', phase === 'listening' ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg')}
              style={phase === 'listening' && level ? { transform: `scale(${1 + level * 0.15})` } : undefined}
            >
              {icon}
            </button>
            <div className="text-[17px] font-medium text-fg-2">{words}</div>
            <div className="w-full max-w-[560px] space-y-3 text-center">
              {heard && (
                <div className="text-[16px] text-fg-2" translate="no">
                  “{heard}”
                </div>
              )}
              {reply && phase !== 'listening' && (
                <div className="text-[19px] leading-snug" translate="no">
                  {reply}
                </div>
              )}
            </div>
          </div>
          <div className="mx-auto max-w-[460px] text-center text-[13px] leading-relaxed text-fg-3">
            Say things like “Start a session to plan my weekend in Crete”, “How are my sessions doing?”, “Read me the answer”, “Approve”, “Tell it to use metric units”, “Stop”, or “Goodbye” to finish.
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

/** By the message box: hands-free mode, about this session when in one. Only where the browser can speak and listen. */
export function HandsFreeButton({ s }: { s?: { key: string }; insert: (text: string) => void; disabled?: boolean }) {
  const server = useServerVoice();
  if (!canSpeak() || !(SpeechRecognition() || (server?.ready && canRecord()))) return null;
  return (
    <button
      type="button"
      data-tip="handsfree"
      onClick={() => openHandsFree(s?.key)}
      title="Hands-free: talk to the app, and hear what it did"
      aria-label="Hands-free"
      className="shrink-0 rounded-lg p-2 text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg"
    >
      <Headphones size={17} />
    </button>
  );
}

/** For the search box's action. */
export const startHandsFree = () => openHandsFree();
