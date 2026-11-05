// Replies read aloud with the browser's own speech synthesis, as plain text (plain.ts). It is spoken a
// few sentences at a time (long utterances stall in some browsers), which also makes pausing reliable:
// pausing stops the current part, resuming says it again.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { toast } from '../../lib/store';
import { parts, speakable } from './plain';
import { canSpeak, speechLang, useVoicePrefs } from './prefs';

// ---- reading ------------------------------------------------------------------------------------------

export interface Reading {
  /** The reply being read (its timeline id); null when nothing is. */
  id: string | null;
  status: 'idle' | 'speaking' | 'paused';
  part: number;
  parts: number;
  /** The start of the reply, to show what is being read. */
  preview: string;
}

const IDLE: Reading = { id: null, status: 'idle', part: 0, parts: 0, preview: '' };
export const useReading = create<Reading>(() => IDLE);

let queue: string[] = [];
/** Bumped by every start, pause and stop, so a stopped utterance's late events change nothing. */
let token = 0;
/** What is read is a confidential session's: only a voice on this device reads it (some browsers' voices are online). */
let localOnly = false;

/** A voice on this device for the language, the chosen one when it is one. */
function localVoice(synth: SpeechSynthesis, lang: string, chosen?: SpeechSynthesisVoice): SpeechSynthesisVoice | undefined {
  if (chosen?.localService) return chosen;
  const here = synth.getVoices().filter((v) => v.localService);
  const base = lang.toLowerCase().split('-')[0];
  return here.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ?? here.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base);
}

function say(i: number) {
  const synth = window.speechSynthesis;
  const t = ++token;
  if (i >= queue.length) return stopReading();
  const u = new SpeechSynthesisUtterance(queue[i]);
  const p = useVoicePrefs.getState();
  let v = p.voice ? synth.getVoices().find((x) => x.voiceURI === p.voice) : undefined;
  if (localOnly) {
    v = localVoice(synth, speechLang(p.lang), v);
    if (!v) {
      stopReading();
      return toast('This session is confidential, and this browser has no voice on this device for its language, so it is not read aloud.', 'error');
    }
  }
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else u.lang = speechLang(p.lang);
  u.rate = Math.min(2, Math.max(0.5, p.rate || 1));
  u.onend = () => t === token && say(i + 1);
  u.onerror = (e) => {
    if (t !== token || e.error === 'interrupted' || e.error === 'canceled') return;
    stopReading();
    toast(e.error === 'not-allowed' ? 'The browser stopped reading aloud: tap the speaker again to start it.' : `Could not read aloud (${e.error})`, 'error');
  };
  useReading.setState({ status: 'speaking', part: i });
  synth.speak(u);
  // Some browsers start out paused (after a pause elsewhere on the page).
  if (synth.paused) synth.resume();
}

/** Reads a reply aloud, from its start; another one being read stops. `local`: with a voice on this device only. */
export function readAloud(id: string, markdown: string, local = false) {
  if (!canSpeak()) return;
  localOnly = local;
  const synth = window.speechSynthesis;
  const list = parts(speakable(markdown));
  if (!list.length) return toast('There are no words to read in this reply');
  const busy = synth.speaking || synth.pending;
  token++;
  synth.cancel();
  queue = list;
  useReading.setState({ id, status: 'speaking', part: 0, parts: list.length, preview: list[0].slice(0, 90) });
  // Right after cancel() Chrome may drop what is spoken next; Safari wants the first words said within the tap.
  if (busy) {
    const t = token;
    setTimeout(() => t === token && say(0), 80);
  } else say(0);
}

export function pauseReading() {
  if (useReading.getState().status !== 'speaking') return;
  token++;
  window.speechSynthesis.cancel();
  useReading.setState({ status: 'paused' });
}

export function resumeReading() {
  const r = useReading.getState();
  if (r.status === 'paused') say(r.part);
}

export function stopReading() {
  token++;
  queue = [];
  if (canSpeak()) window.speechSynthesis.cancel();
  useReading.setState(IDLE);
}

/** The voices this browser has, which some load a moment after the page. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [list, setList] = useState<SpeechSynthesisVoice[]>(() => (canSpeak() ? window.speechSynthesis.getVoices() : []));
  useEffect(() => {
    if (!canSpeak()) return;
    const synth = window.speechSynthesis;
    const on = () => setList(synth.getVoices());
    on();
    try {
      synth.addEventListener('voiceschanged', on);
      return () => synth.removeEventListener('voiceschanged', on);
    } catch {
      return;
    }
  }, []);
  return list;
}
