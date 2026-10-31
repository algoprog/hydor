// What this browser keeps for voice: the language you speak, whether dictation uses the browser's own
// recognition or the server's, and the voice and pace replies are read in. The server's own settings
// (whisper.cpp, a service) come from it and stay current with its news.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { VoiceState } from '@shared/voice';
import { api } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';

export interface VoicePrefs {
  /** BCP 47, like "de-DE"; '' follows the browser's language. */
  lang: string;
  /** Dictate with the browser's own recognition, or the server's when it is on. */
  use: 'browser' | 'server';
  /** The voice replies are read in (its voiceURI); '' lets the browser pick one for the language. */
  voice: string;
  /** Reading pace, 0.5 to 2. */
  rate: number;
}

const KEY = 'wa.voice';
const DEFAULTS: VoicePrefs = { lang: '', use: 'browser', voice: '', rate: 1 };

function load(): VoicePrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export const useVoicePrefs = create<VoicePrefs & { set: (p: Partial<VoicePrefs>) => void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    try {
      const { set: _s, ...prefs } = get();
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {}
  },
}));

/** The language dictation listens for. */
export const speechLang = (lang = useVoicePrefs.getState().lang) => lang || navigator.language || 'en-US';

// ---- the browser's abilities -------------------------------------------------------------------------

type Ctor = new () => any;
/** The browser's speech recognition (Chrome, Edge, Safari on Mac and iPhone), if it has one. */
export const SpeechRecognition = (): Ctor | null => ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null) as Ctor | null;
export const canRecord = () => typeof MediaRecorder !== 'undefined';
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** Phones and tablets by Apple, whose settings are named in the explanations. */
export const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---- the server's speech recognition -------------------------------------------------------------------

export const useVoiceServer = create<{ st: VoiceState | null }>(() => ({ st: null }));
let asked = false;

/** The server's speech recognition: asked once a page load, then kept current by its news. */
export function useServerVoice(): VoiceState | null {
  const st = useVoiceServer((s) => s.st);
  useEffect(() => {
    if (asked) return;
    asked = true;
    onFeatureEvent('voice', (e) => useVoiceServer.setState({ st: e.data as VoiceState }));
    api<VoiceState>('/api/voice').then(
      (st) => useVoiceServer.setState({ st }),
      () => (asked = false),
    );
  }, []);
  return st;
}

/** How dictation works here: the browser's recognition, the server's, or none. */
export function dictationMode(server: VoiceState | null, use: VoicePrefs['use']): 'browser' | 'server' | null {
  const own = !!SpeechRecognition();
  const viaServer = !!server?.ready && canRecord();
  if (use === 'server' && viaServer) return 'server';
  return own ? 'browser' : viaServer ? 'server' : null;
}
