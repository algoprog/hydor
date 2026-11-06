// Recordings as they arrive from the browser: what format they are in, turning them into WAV with
// ffmpeg when whisper.cpp cannot read them as they are, and sending them to an OpenAI-compatible
// transcription service.
import fs from 'node:fs';
import { HttpError } from '../auth.ts';
import { run, which } from './fetch.ts';
import { clean } from './whisper.ts';

export type AudioKind = 'wav' | 'mp3' | 'flac' | 'ogg' | 'webm' | 'mp4' | 'unknown';

/** The format, from the file's first bytes. */
export function sniff(b: Buffer): AudioKind {
  const s = (from: number, to: number) => b.subarray(from, to).toString('latin1');
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return 'wav';
  if (s(0, 4) === 'fLaC') return 'flac';
  if (s(0, 4) === 'OggS') return 'ogg';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (s(4, 8) === 'ftyp') return 'mp4';
  // An MPEG audio frame of layer I–III (AAC's ADTS frames start alike, with layer 0).
  if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return 'mp3';
  return 'unknown';
}

/** What whisper.cpp reads by itself (Ogg is left out: browsers record Opus in it, which it cannot read). */
export const readable = (k: AudioKind) => k === 'wav' || k === 'mp3' || k === 'flac';

export const ffmpegPath = () => which('ffmpeg');

/** Turns a recording into 16 kHz mono WAV with ffmpeg. */
export async function toWav(input: string, output: string, timeout = 120_000): Promise<void> {
  const ff = ffmpegPath();
  if (!ff) throw new HttpError(415, 'This recording is in a format the server reads only with ffmpeg, which is not installed here (on Debian or Ubuntu: sudo apt install ffmpeg).');
  const r = await run(ff, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'wav', output], { timeout });
  if (r.code !== 0 || !fs.existsSync(output)) throw new HttpError(422, `ffmpeg could not read the recording: ${(r.err || r.out).trim().split('\n').pop() ?? ''}`);
}

const EXT: Record<AudioKind, string> = { wav: 'wav', mp3: 'mp3', flac: 'flac', ogg: 'ogg', webm: 'webm', mp4: 'mp4', unknown: 'webm' };
const MIME: Record<AudioKind, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg', webm: 'audio/webm', mp4: 'audio/mp4', unknown: 'application/octet-stream' };

/** "https://api.openai.com/v1" from that, or from the whole …/audio/transcriptions address. */
export const endpointBase = (url: string) => url.trim().replace(/\/+$/, '').replace(/\/audio\/transcriptions$/, '');

/** The text of a recording, from an OpenAI-compatible /audio/transcriptions endpoint. */
export async function viaEndpoint(e: { url: string; model: string; apiKey?: string }, audio: Buffer, lang: string): Promise<string> {
  const kind = sniff(audio);
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(audio)], { type: MIME[kind] }), `speech.${EXT[kind]}`);
  fd.append('model', e.model || 'whisper-1');
  if (lang && lang !== 'auto') fd.append('language', lang);
  fd.append('response_format', 'json');
  let r: Response;
  try {
    r = await fetch(`${endpointBase(e.url)}/audio/transcriptions`, { method: 'POST', headers: e.apiKey ? { authorization: `Bearer ${e.apiKey}` } : {}, body: fd, signal: AbortSignal.timeout(180_000) });
  } catch (err) {
    const why = (err as Error).name === 'TimeoutError' ? 'it did not answer in 3 minutes' : ((err as Error & { cause?: Error }).cause?.message ?? (err as Error).message);
    throw new HttpError(502, `Could not reach the transcription service at ${endpointBase(e.url)}: ${why}`);
  }
  const body = await r.text();
  let d: any = null;
  try {
    d = JSON.parse(body);
  } catch {}
  if (!r.ok) {
    const msg = d?.error?.message ?? (typeof d?.error === 'string' ? d.error : null) ?? d?.detail ?? body.slice(0, 200);
    throw new HttpError(502, `The transcription service answered ${r.status}${msg ? `: ${String(msg).trim()}` : ''}`);
  }
  // Servers built on whisper mark silence as it does ("[BLANK_AUDIO]").
  return clean(String(d ? (d.text ?? '') : body));
}

/** The speech in a recording with its times, from an OpenAI-compatible endpoint (verbose_json gives its segments). */
export async function viaEndpointTimed(e: { url: string; model: string; apiKey?: string }, audio: Buffer, lang: string): Promise<{ from: number; to: number; text: string }[]> {
  const kind = sniff(audio);
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(audio)], { type: MIME[kind] }), `speech.${EXT[kind]}`);
  fd.append('model', e.model || 'whisper-1');
  if (lang && lang !== 'auto') fd.append('language', lang);
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'segment');
  let r: Response;
  try {
    r = await fetch(`${endpointBase(e.url)}/audio/transcriptions`, { method: 'POST', headers: e.apiKey ? { authorization: `Bearer ${e.apiKey}` } : {}, body: fd, signal: AbortSignal.timeout(600_000) });
  } catch (err) {
    throw new HttpError(502, `Could not reach the transcription service at ${endpointBase(e.url)}: ${(err as Error).message}`);
  }
  const body = await r.text();
  let d: any = null;
  try {
    d = JSON.parse(body);
  } catch {}
  if (!r.ok) throw new HttpError(502, `The transcription service answered ${r.status}${d?.error?.message ? `: ${String(d.error.message).trim()}` : ''}`);
  const segs: any[] = Array.isArray(d?.segments) ? d.segments : [];
  if (!segs.length && typeof d?.text === 'string' && d.text.trim()) throw new HttpError(502, 'The transcription service gave the words without their times, so they cannot be captions: use whisper.cpp on this computer (Settings → Voice)');
  return segs.map((s) => ({ from: Number(s.start) || 0, to: Number(s.end) || 0, text: clean(String(s.text ?? '')) })).filter((s) => s.text && s.to > s.from);
}
