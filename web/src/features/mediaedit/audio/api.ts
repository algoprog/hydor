// The sound editor's calls to the server (server/mediaedit/audio*.ts): what a sound is, its bytes for the browser to
// read, sounds kept (a recording, a file from this device), an edit started and followed until it is made (and
// stopped), the words of a sound, and sounds made with AI.
import type { KeptSound, SoundEditAsk, SoundEditJob, SoundFacts, SoundWord } from '@shared/mediaedit-audio';
import { api, del, enc, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';

export const soundFacts = (src: string) => api<SoundFacts>(`/api/mediaedit/audio/info?src=${enc(src)}`);

/** Where the browser reads a sound from: as it is, or (`m4a`) made an M4A the browser reads (a video's sound, Safari's Ogg). */
export const soundBytesUrl = (src: string, m4a = false) => mu(`/api/mediaedit/audio/source?src=${enc(src)}${m4a ? '&as=m4a' : ''}`);

/** A sound's bytes kept by the server (a recording, a file from this device): its name there ("naget-sound:…"). */
export async function keepSound(data: Blob, name?: string): Promise<KeptSound> {
  const r = await fetch(mu(`/api/mediaedit/audio/sounds${name ? `?name=${enc(name)}` : ''}`), { method: 'POST', body: data, headers: { 'content-type': 'application/octet-stream' }, credentials: 'same-origin' });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `${r.status} ${r.statusText}`);
  return j as KeptSound;
}

/** An edit started, followed until it ends (`onJob` hears how far it is), then its job as it ended. */
export async function makeSoundEdit(ask: SoundEditAsk, onJob: (j: SoundEditJob) => void): Promise<SoundEditJob> {
  let j = await post<SoundEditJob>('/api/mediaedit/audio', ask);
  onJob(j);
  while (j.status === 'queued' || j.status === 'running') {
    await new Promise((r) => setTimeout(r, 500));
    j = await api<SoundEditJob>(`/api/mediaedit/audio/${enc(j.job)}`);
    onJob(j);
  }
  return j;
}

export const stopSoundEdit = (job: string) => del<SoundEditJob>(`/api/mediaedit/audio/${enc(job)}`).catch(() => null);

export interface SoundWords {
  status: 'none' | 'running' | 'done' | 'failed';
  progress?: number;
  words?: SoundWord[];
  error?: string;
}
export const startWords = (src: string) => post<SoundWords>('/api/mediaedit/audio/words', { src });
export const readWords = (src: string) => api<SoundWords>(`/api/mediaedit/audio/words?src=${enc(src)}`);

export type MakeKind = 'music' | 'speech' | 'sound';
export interface MakeEstimate {
  model: string;
  label: string;
  voices: string[];
  voice?: string;
  described: boolean;
  keySet: boolean;
  cost?: number;
  seconds: number;
  maxSeconds?: number;
  why?: string;
}
export interface MakeAsk {
  kind: MakeKind;
  prompt: string;
  seconds?: number;
  voice?: string;
  how?: string;
  instrumental?: boolean;
}
export const estimateMake = (a: MakeAsk) => post<MakeEstimate>('/api/mediaedit/audio/make/estimate', a);
export const makeWithAi = (a: MakeAsk, signal?: AbortSignal) => api<{ src: string; seconds: number; cost?: number; model: string; name: string }>('/api/mediaedit/audio/make', { method: 'POST', body: a, signal });
