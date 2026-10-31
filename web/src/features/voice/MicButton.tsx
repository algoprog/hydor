// The microphone by the message box. Tap to speak, tap again to stop: the words join the message, which
// you still send yourself. It shows when this browser recognizes speech, or when the server does
// (Settings → Voice). While it listens, a panel above the box shows the time, the words heard so far
// (or the input level) and the language; when the microphone cannot be used, it says why.
import { useEffect, useRef, useState } from 'react';
import { Check, Mic } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { go } from '../../lib/nav';
import { Button, cx, OptionRow, Popover, Throbber } from '../../components/ui';
import { useDictation, type Dictation, type Problem } from './dictation';
import { languageCode, languageName, LANGUAGES } from './languages';
import { dictationMode, isApple, speechLang, useServerVoice, useVoicePrefs } from './prefs';

const PROBLEMS: Record<Problem, { title: string; body: () => string }> = {
  insecure: {
    title: 'The microphone needs a secure connection',
    body: () =>
      `Browsers allow the microphone only on pages served over HTTPS, or on this computer at localhost. This page is at ${location.origin}: open Naget Agent through an HTTPS address to dictate.`,
  },
  denied: {
    title: 'The microphone is blocked for this site',
    body: () =>
      isApple()
        ? 'Allow it for this site: tap aA in the address bar, then Website Settings → Microphone (or Settings → Apps → Safari → Microphone), then try again.'
        : 'Allow it for this site from the icon at the left of the address bar (site settings), then try again.',
  },
  nomic: { title: 'No microphone was found', body: () => 'Connect one, or check that your system lets this browser use it, then try again.' },
  busy: { title: 'The microphone is busy', body: () => 'Another app may be using it. Close that app, then try again.' },
  service: {
    title: 'Speech recognition is off here',
    body: () =>
      isApple()
        ? 'Turn on Dictation in Settings → General → Keyboard, then try again. Or let the server recognize speech: Settings → Voice.'
        : 'This browser’s speech service is not allowed here. Let the server recognize speech instead: Settings → Voice.',
  },
  unsupported: { title: 'This browser cannot record', body: () => 'A current Chrome, Edge, Firefox or Safari can. Or type your message.' },
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return <span className="tnum shrink-0 text-[12px] text-fg-3">{clock(now - since)}</span>;
}

/** Five bars that follow the input level. */
function Level({ d }: { d: Dictation }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    const shape = [0.55, 0.85, 1, 0.75, 0.5];
    d.onLevel.current = (v) => bars.current.forEach((b, i) => b && (b.style.transform = `scaleY(${Math.max(0.15, Math.min(1, v * shape[i] * 1.6))})`));
    return () => {
      d.onLevel.current = () => {};
    };
  }, [d.onLevel]);
  return (
    <span className="flex h-4 shrink-0 items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} ref={(el) => void (bars.current[i] = el)} style={{ transform: 'scaleY(0.15)' }} className="h-4 w-[3px] origin-center rounded-full bg-err transition-transform duration-75" />
      ))}
    </span>
  );
}

/** The language listened for; changing it while listening carries on in the new one. */
function LanguageChip({ d }: { d: Dictation }) {
  const lang = useVoicePrefs((p) => p.lang);
  const set = useVoicePrefs((p) => p.set);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const cur = speechLang(lang);
  const pick = (l: string) => {
    setOpen(false);
    set({ lang: l });
    if (d.mode === 'browser') d.relang(speechLang(l));
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Listening for ${languageName(cur)} · change`}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium tracking-wide text-fg-3 ring-1 ring-line-2 transition-colors hover:bg-bg-2 hover:text-fg"
      >
        {languageCode(cur)}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={260} prefer="above">
        <OptionRow label={`Same as this browser`} hint={languageName(navigator.language || 'en-US')} selected={!lang} onClick={() => pick('')} />
        {LANGUAGES.map((l) => (
          <OptionRow key={l} label={languageName(l)} hint={l} selected={lang === l} onClick={() => pick(l)} />
        ))}
      </Popover>
    </>
  );
}

/** Above the message box while dictating: the time, what is heard, the language, and Done. */
function LivePanel({ d }: { d: Dictation }) {
  const tail = d.heard.length > 160 ? `…${d.heard.slice(-160)}` : d.heard;
  const words =
    d.phase === 'transcribing'
      ? 'Turning your words into text…'
      : d.phase === 'starting'
        ? 'Starting the microphone…'
        : d.mode === 'browser'
          ? tail || 'Listening… speak now'
          : 'Recording…';
  return (
    <div
      role="status"
      aria-live="polite"
      data-dictation={d.phase}
      className="anim-pop absolute inset-x-1 bottom-full z-20 mb-2 flex items-center gap-2.5 rounded-2xl border border-line-2 bg-elevated px-3 py-2 shadow-lg sm:inset-x-3"
    >
      {d.phase === 'transcribing' ? (
        <Throbber size={15} className="shrink-0" />
      ) : (
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-err/50 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-err" />
        </span>
      )}
      {d.phase === 'listening' && <Elapsed since={d.since} />}
      {d.phase === 'listening' && d.mode === 'server' && <Level d={d} />}
      <span className={cx('line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-snug break-words', d.heard && d.phase !== 'transcribing' ? 'text-fg' : 'text-fg-3')}>{words}</span>
      {d.phase !== 'transcribing' && <LanguageChip d={d} />}
      {d.phase === 'listening' && (
        <button type="button" onClick={d.stop} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent-soft">
          <Check size={13} strokeWidth={2.6} />
          Done
        </button>
      )}
    </div>
  );
}

export function MicButton({ insert, disabled }: { s?: SessionSummary; insert: (text: string) => void; disabled?: boolean }) {
  const server = useServerVoice();
  const use = useVoicePrefs((p) => p.use);
  const d = useDictation(insert);
  const ref = useRef<HTMLButtonElement>(null);
  const mode = dictationMode(server, use);
  const active = d.phase !== 'idle';
  if (!mode && !active && !d.problem) return null;
  const busy = d.phase === 'transcribing';
  const live = d.phase === 'listening' || d.phase === 'starting';
  const p = d.problem ? PROBLEMS[d.problem] : null;
  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={(disabled && !active) || busy}
        aria-pressed={live}
        onClick={() => (active ? d.stop() : mode && d.start(mode))}
        title={busy ? 'Turning your words into text…' : live ? 'Stop and add the words' : 'Dictate: speak your message'}
        aria-label={live ? 'Stop dictating' : 'Dictate'}
        className={cx(
          'relative shrink-0 rounded-lg p-2 transition duration-150 active:scale-90 disabled:opacity-50',
          live ? 'bg-err text-white shadow-[0_0_0_4px_color-mix(in_srgb,var(--err)_18%,transparent)] hover:opacity-90' : 'text-fg-3 hover:bg-bg-2 hover:text-fg',
        )}
      >
        {busy ? <Throbber size={17} /> : <Mic size={17} />}
      </button>
      {active && <LivePanel d={d} />}
      <Popover anchor={ref} open={!!p} onClose={d.clearProblem} width={320} prefer="above">
        {p && (
          <div className="px-2.5 pt-2 pb-1.5">
            <div className="text-[13.5px] font-semibold">{p.title}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">{p.body()}</p>
            <div className="mt-2.5 flex justify-end gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  d.clearProblem();
                  go('/settings?s=voice');
                }}
              >
                Voice settings
              </Button>
              <Button size="sm" variant="secondary" onClick={d.clearProblem}>
                OK
              </Button>
            </div>
          </div>
        )}
      </Popover>
    </>
  );
}
