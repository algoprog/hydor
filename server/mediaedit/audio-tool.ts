// edit_audio: an agent's edits to a sound (a file of its session, a video's sound, or a Library sound), made on this
// computer with ffmpeg as the sound editor makes them (audio.ts): the part kept, parts cut or made silent, long pauses
// shortened, filler words taken out (with speech recognition on this computer), its speed and pitch, its volume, fades,
// peak or loudness, noise reduction, tone, dynamics, echo, reverb, reverse, mono, and other sounds mixed over it at a
// place (music under a voice, a sound effect). The file goes in the session's audio/ folder, listed as generate_audio
// lists its sounds, so the conversation shows it in the same player; a Library sound can be put back in its place or
// beside it. It waits up to about nine minutes, then hands back the job to wait for again.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  changeSpeed,
  clearRange,
  deleteRanges,
  effectWords,
  EFFECTS,
  isFiller,
  mergeRanges,
  newId,
  ROOMS,
  shortenPauses,
  soundClock,
  soundLength,
  wordsOnTrack,
  type SoundEffect,
  type SoundEffectType,
  type SoundFormat,
  type SoundRecipe,
} from '../../shared/mediaedit-audio.ts';
import { agentBaseEnv } from '../env.ts';
import type { RunTool } from '../features/types.ts';
import { ffmpegTools } from '../media/frames.ts';
import { keepFile } from '../media/index.ts';
import { mustMedia } from '../media/store.ts';
import { keptKind, prepareSound, replaceLibrarySound, soundJob, soundOf, startSoundEdit, waitForSoundJob, type Sound } from './audio.ts';
import { waitForWords } from './audio-words.ts';

const WAIT_MS = 540_000;

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const pairOf = (v: unknown): [number, number] | undefined => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(Number(x))) && Number(v[1]) > Number(v[0]) ? [Number(v[0]), Number(v[1])] : undefined);

/** What each job did, in a few words, for its answer (kept two hours). */
const said = new Map<string, { what: string; library?: { id: string; as: 'replace' | 'copy'; title: string } }>();

/** The silent stretches of a file (seconds of it), as ffmpeg's silencedetect finds them. */
export async function silencesOf(file: string, o: { threshold: number; min: number }): Promise<[number, number][]> {
  const tools = await ffmpegTools();
  if (!tools) return [];
  const text = await new Promise<string>((resolve) =>
    execFile(
      tools.ffmpeg,
      ['-hide_banner', '-nostdin', '-v', 'info', '-protocol_whitelist', 'file', '-i', `file:${file}`, '-map', '0:a:0', '-af', `silencedetect=n=${o.threshold}dB:d=${o.min}`, '-f', 'null', '-'],
      { timeout: 30 * 60_000, maxBuffer: 64 << 20, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } },
      (_e, out, err) => resolve(String(out ?? '') + String(err ?? '')),
    ),
  );
  return readSilences(text);
}

/** silencedetect's lines ("silence_start: 1.2", "silence_end: 3.4 | silence_duration: 2.2") as stretches. */
export function readSilences(text: string): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (const m of text.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const t = Math.max(0, Number(m[2]));
    if (m[1] === 'start') start = t;
    else if (start !== null) {
      out.push([start, t]);
      start = null;
    }
  }
  return out;
}

const LOUDNESS: Record<string, number> = { podcast: -16, streaming: -14, broadcast: -23 };
const DENOISE: Record<string, number> = { light: 8, medium: 14, strong: 24 };
const presetOf = (type: SoundEffectType, name: unknown) => {
  const s = String(name ?? '').toLowerCase();
  return EFFECTS[type].presets?.find((p) => p.label.toLowerCase().startsWith(s))?.p;
};

/** One whole-sound effect from the agent's words: its type and settings (a preset by name, or settings), or null. */
function effectFrom(type: SoundEffectType, v: unknown): Record<string, number> | null {
  if (v === undefined || v === null || v === false) return null;
  if (type === 'reverse' || type === 'mono') return v === true ? {} : null;
  if (typeof v === 'string') {
    if (type === 'loudness' && LOUDNESS[v.toLowerCase()] !== undefined) return { lufs: LOUDNESS[v.toLowerCase()] };
    if (type === 'denoise' && DENOISE[v.toLowerCase()] !== undefined) return { amount: DENOISE[v.toLowerCase()] };
    if (type === 'reverb') {
      const i = ROOMS.findIndex((r) => r.label.toLowerCase() === v.toLowerCase());
      return i >= 0 ? { room: i } : null;
    }
    const p = presetOf(type, v);
    if (p) return p;
  }
  if (typeof v === 'number') {
    const first = EFFECTS[type].params[0];
    return first ? { [first.id]: v } : {};
  }
  if (v === true) return {};
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, number> = {};
    const alias: Record<string, string> = { low_cut: 'lowCut', high_cut: 'highCut', delay_ms: 'delay', amount: type === 'reverb' ? 'mix' : 'amount', middle: 'mid' };
    for (const [k, x] of Object.entries(o)) {
      const id = alias[k] ?? k;
      if (type === 'reverb' && id === 'room' && typeof x === 'string') {
        const i = ROOMS.findIndex((r) => r.label.toLowerCase() === x.toLowerCase());
        if (i >= 0) out.room = i;
      } else if (num(x) !== undefined) out[id] = num(x)!;
    }
    if (typeof o.preset === 'string') Object.assign(out, presetOf(type, o.preset) ?? {});
    return out;
  }
  return null;
}

function answer(id: string): string | { isError: true; text: string } {
  const v = soundJob(id);
  if (!v) return { isError: true, text: `No such edit (job ${id}): it ended over an hour ago, or the app started again since. Call edit_audio again.` };
  if (v.status === 'failed') return { isError: true, text: `The sound was not edited: ${v.error ?? 'ffmpeg failed'}` };
  if (v.status === 'stopped') return { isError: true, text: 'The edit was stopped before it was done: nothing was saved.' };
  if (v.status !== 'done' || !v.path) {
    const pct = v.progress ? `, ${Math.round(v.progress * 100)}% done` : '';
    return `The sound is still being edited (job ${id}${pct}); the app keeps at it. Call edit_audio with job: "${id}" to wait for it again; the user hears it once you do.`;
  }
  const s = said.get(id);
  const bits = [v.seconds ? `${v.seconds} s` : '', v.bytes ? size(v.bytes) : ''].filter(Boolean).join(', ');
  return [
    `Edited the sound${s?.what ? ` (${s.what})` : ''}:`,
    `${v.path} (${bits})`,
    'The user hears it in your reply, in a player where they can download it, keep it in their Library and open it in the sound editor: don’t repeat it or its path. You cannot listen to it: speak of it as what you asked for.',
  ].join('\n');
}

export function editAudioTool(): RunTool {
  return {
    name: 'edit_audio',
    annotations: { readOnlyHint: false, openWorldHint: false },
    description: [
      'Edit a sound on this computer with ffmpeg: free, and nothing leaves the computer. Use it on a sound the user gave or one you made (generate_audio), a video’s sound, or a sound of the user’s Library:',
      'keep a part (trim), take parts out (cuts), make parts silent (silence), shorten long pauses (pauses), take out filler words such as "um" and "uh" (remove_fillers: speech recognition on this computer, Settings → Voice), play it faster or slower with its pitch kept (speed), make it higher or lower (pitch),',
      'louder or quieter (volume), fade it in and out, make its loudest peak a level (normalize) or its loudness a target (loudness: podcast −16 LUFS, streaming −14, broadcast −23), reduce steady noise (denoise), change its tone (eq: bass, middle, treble, or a preset: clearer voice, telephone, radio, warmer, brighter, less boomy, more bass), take out low rumble (highpass) or hiss (lowpass), even it out (compressor), keep its peaks down (limiter), add echo or reverb, play it backwards (reverse), make it mono,',
      'and mix other sounds over it (mix: music under a voice, a sound effect at a moment), each at a place, with its volume and fades.',
      'trim, cuts and silence are seconds of the original; pauses and fillers are found in what is left; mix’s at and effects’ from and to are seconds of the edited sound (after the trim, the cuts, the pauses and the speed).',
      'The file is saved in the session’s folder (audio/) and shown to the user in your reply (a Library sound can also go back in its place, or beside it: save_to_library). The user can change it further in the app’s sound editor (Edit on a sound). It takes seconds for most sounds; it waits up to about nine minutes, then gives a job id to wait for it again (job).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The sound: a file of the session (MP3, WAV, M4A, AAC, OGG, Opus, FLAC or WebM), or a video (its sound).' },
        library: { type: 'string', description: 'Instead of path: a sound of the user’s Library, by its id (app_api GET /api/media lists them).' },
        save_to_library: { type: 'string', enum: ['replace', 'copy'], description: 'With library: put the result in the Library over that sound (replace: its title, project and folder kept) or beside it as a new one (copy). Left out, only the file in your folder is made.' },
        trim: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'The part to keep: [start, end] in seconds of the original.' },
        cuts: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, description: 'Parts to take out (what follows moves back): [[start, end], …] in seconds of the original.' },
        silence: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, description: 'Parts to make silent, keeping its length: [[start, end], …] in seconds of the original.' },
        pauses: {
          type: 'object',
          properties: { longer_than: { type: 'number', description: 'Pauses longer than this many seconds (default 0.8).' }, keep: { type: 'number', description: 'Seconds of each such pause kept (default 0.4).' }, threshold: { type: 'number', description: 'How quiet a pause is, in dB (default −40).' } },
          description: 'Shorten long pauses (silences) to keep it moving.',
        },
        remove_fillers: { type: 'boolean', description: 'Take out filler words ("um", "uh", "er"…), found by speech recognition on this computer (Settings → Voice; reading a long sound takes a few minutes).' },
        speed: { type: 'number', minimum: 0.25, maximum: 4, description: 'How fast it plays, its pitch kept: 0.9 a little slower, 1.25 a quarter faster.' },
        pitch: { type: 'number', minimum: -12, maximum: 12, description: 'Higher or lower, in semitones, at the same speed.' },
        volume: { type: 'number', minimum: -40, maximum: 24, description: 'Louder or quieter, in dB (+6 about twice as loud to the ear… roughly; −6 quieter).' },
        fade_in: { type: 'number', minimum: 0, maximum: 30, description: 'Seconds at the start coming in from silence.' },
        fade_out: { type: 'number', minimum: 0, maximum: 30, description: 'Seconds at the end going out to silence.' },
        normalize: { type: 'number', minimum: -12, maximum: 0, description: 'Make its loudest peak this level, in dB (−1 is usual).' },
        loudness: { description: 'Make its loudness a target: "podcast" (−16 LUFS), "streaming" (−14), "broadcast" (−23), or a number of LUFS; its peaks stay under −1 dB.' },
        denoise: { description: 'Reduce steady noise (hiss, hum, a fan): "light", "medium", "strong", or the reduction in dB (4 to 40).' },
        eq: { description: 'Its tone: a preset ("clearer voice", "telephone", "radio", "warmer", "brighter", "less boomy", "more bass") or { bass, mid, treble } in dB (−15 to 15), with low_cut and high_cut in Hz.' },
        highpass: { type: 'number', minimum: 20, maximum: 2000, description: 'Take out what is lower than this many Hz (rumble, hum: 80).' },
        lowpass: { type: 'number', minimum: 500, maximum: 20000, description: 'Take out what is higher than this many Hz (hiss: 8000).' },
        compressor: { description: 'Even out loud and quiet parts: "gentle", "voice", "strong", "music", or { threshold (dB), ratio, attack (ms), release (ms), makeup (dB) }.' },
        limiter: { type: 'number', minimum: -12, maximum: 0, description: 'Keep its peaks under this level, in dB.' },
        echo: { type: 'object', properties: { delay_ms: { type: 'number' }, decay: { type: 'number', minimum: 0.05, maximum: 0.9 } }, description: 'Repeats, each delay_ms after the last and decay as loud.' },
        reverb: { description: 'As if in a room: "small room", "room", "hall", "cathedral", or { room, amount (0 to 1) }.' },
        reverse: { type: 'boolean', description: 'Play it backwards.' },
        mono: { type: 'boolean', description: 'The same sound in both speakers.' },
        effects: {
          type: 'array',
          maxItems: 30,
          description: 'Effects on a part only, applied after the ones above: [{ type, from, to, …its settings }], type one of gain (db), fadeIn, fadeOut, normalize (peak), loudness (lufs), denoise (amount), eq (bass, mid, treble, lowCut, highCut), highpass (hz), lowpass (hz), compressor, limiter (ceiling), pitch (semitones), reverse, echo (delay, decay), reverb (room 0 to 3, mix), mono; from and to in seconds of the edited sound.',
          items: { type: 'object', properties: { type: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' } }, required: ['type'] },
        },
        mix: {
          type: 'array',
          maxItems: 15,
          description: 'Other sounds over it, each on a track of its own: music under a voice, a sound effect at a moment.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The sound (a file of the session), or library: a Library sound’s id.' },
              library: { type: 'string' },
              at: { type: 'number', description: 'Where it starts, in seconds of the edited sound (default 0).' },
              volume: { type: 'number', description: 'Its volume in dB (−12 for music under a voice).' },
              from: { type: 'number', description: 'The part of it used, from (seconds of that sound).' },
              to: { type: 'number', description: 'And to (default: to its end, or the end of the edited sound).' },
              fade_in: { type: 'number' },
              fade_out: { type: 'number' },
            },
          },
        },
        format: { type: 'string', enum: ['mp3', 'm4a', 'ogg', 'wav', 'flac'], description: 'The kind of file (default: the original’s, else mp3).' },
        quality: { type: 'integer', description: 'Kilobits a second for mp3 (96–320), m4a (96–256) or ogg (48–160).' },
        channels: { type: 'string', enum: ['mono', 'stereo'], description: 'Mono or stereo (default: as the sounds are).' },
        name: { type: 'string', description: 'A short file name, without extension (default: the sound’s, and “edited”).' },
        job: { type: 'string', description: 'A job id an earlier call gave while it was still being edited: waits for it instead.' },
      },
    },
    async run(a, ctx) {
      const until = Date.now() + WAIT_MS;
      if (typeof a.job === 'string' && a.job.trim()) {
        const id = a.job.trim();
        if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('job: the id an earlier call gave.');
        if (soundJob(id)) await waitForSoundJob(id, until - Date.now(), ctx.signal);
        return finishLibrary(id, ctx);
      }
      try {
        const lib = typeof a.library === 'string' && a.library.trim() ? mustMedia(ctx.deps.db, a.library.trim()) : null;
        if (lib && lib.kind !== 'audio' && lib.kind !== 'video') return { isError: true, text: `${lib.id} is a picture of the Library, not a sound.` };
        if (!lib && a.save_to_library) return { isError: true, text: 'save_to_library goes with library: the Library sound’s id.' };
        if (!lib && (typeof a.path !== 'string' || !a.path.trim())) throw new Error('path: the sound to edit (or library: a Library sound’s id).');
        const src = lib ? `media:${lib.id}` : String(a.path);
        const sound: Sound = await soundOf(ctx.deps.db, src, { cwd: ctx.cwd });
        const what: string[] = [];
        const T = 'main';
        // The kept parts of the original, end to end.
        const [t0, t1] = pairOf(a.trim) ? [Math.max(0, pairOf(a.trim)![0]), Math.min(sound.duration, pairOf(a.trim)![1])] : [0, sound.duration];
        if (t1 - t0 < 0.01) return { isError: true, text: `trim: keep a part of it (it is ${Math.round(sound.duration * 10) / 10} s long).` };
        let parts: [number, number][] = [[t0, t1]];
        const cuts = mergeRanges((Array.isArray(a.cuts) ? a.cuts : []).map(pairOf).filter((x: unknown): x is [number, number] => !!x));
        for (const [s, e] of cuts) parts = parts.flatMap(([x, y]): [number, number][] => (e <= x || s >= y ? [[x, y]] : [...(s > x ? [[x, s] as [number, number]] : []), ...(e < y ? [[e, y] as [number, number]] : [])]));
        parts = parts.filter(([x, y]) => y - x >= 0.005);
        if (!parts.length) return { isError: true, text: 'Nothing of the sound would be left: keep a part of it.' };
        if (pairOf(a.trim)) what.push(`kept ${soundClock(t0, 1)} to ${soundClock(t1, 1)}`);
        if (cuts.length) what.push(`${cuts.length} part${cuts.length === 1 ? '' : 's'} cut`);
        let at = 0;
        const clips = parts.map(([x, y]) => {
          const c = { id: newId(), src: '', at, from: x, to: y };
          at += y - x;
          return c;
        });
        let r: SoundRecipe = { tracks: [{ id: T, name: sound.name, clips }] };
        /** A moment of the original, on the timeline (null where it was cut). */
        const toLine = (s: number) => {
          for (const c of clips) if (s >= c.from && s <= c.to) return c.at + (s - c.from);
          return null;
        };
        const silence = (Array.isArray(a.silence) ? a.silence : []).map(pairOf).filter((x: unknown): x is [number, number] => !!x);
        for (const [s, e] of silence) {
          for (const c of clips) {
            const x = Math.max(s, c.from);
            const y = Math.min(e, c.to);
            if (y > x) r = clearRange(r, [T], toLine(x)!, toLine(y)!);
          }
        }
        if (silence.length) what.push(`${silence.length} part${silence.length === 1 ? '' : 's'} made silent`);
        if (a.pauses && typeof a.pauses === 'object') {
          const longer = Math.max(0.2, num(a.pauses.longer_than) ?? 0.8);
          const keep = Math.max(0, Math.min(longer, num(a.pauses.keep) ?? 0.4));
          const found = await silencesOf(sound.file, { threshold: Math.max(-80, Math.min(-10, num(a.pauses.threshold) ?? -40)), min: longer });
          const onLine: [number, number][] = [];
          for (const [s, e] of found)
            for (const c of clips) {
              const x = Math.max(s, c.from);
              const y = Math.min(e, c.to);
              if (y - x > longer) onLine.push([toLine(x)!, toLine(y)!]);
            }
          const e = shortenPauses(r, [T], onLine, { longer, keep, ripple: true });
          r = e.recipe;
          if (e.count) what.push(`${e.count} long pause${e.count === 1 ? '' : 's'} shortened (${Math.round(e.removed * 10) / 10} s taken out)`);
        }
        if (a.remove_fillers === true) {
          const words = await waitForWords(sound.file, Math.max(30_000, until - Date.now() - 120_000), ctx.signal);
          if (!Array.isArray(words)) return { isError: true, text: `Filler words need the sound’s words: ${words.error}. Leave remove_fillers out to edit it without.` };
          const track = r.tracks.find((t) => t.id === T)!;
          const fillers = wordsOnTrack(track, (s) => (s === '' ? words : undefined)).filter((w) => isFiller(w.w));
          const e = deleteRanges(r, [T], fillers.map((w) => [Math.max(0, w.a - 0.03), w.b + 0.03] as [number, number]), true);
          r = e.recipe;
          what.push(fillers.length ? `${fillers.length} filler word${fillers.length === 1 ? '' : 's'} taken out` : 'no filler words found');
        }
        const speed = num(a.speed);
        if (speed !== undefined && Math.abs(speed - 1) > 0.001) {
          r = changeSpeed(r, [T], 0, soundLength(r), Math.min(4, Math.max(0.25, speed))).recipe;
          what.push(`${speed}× speed`);
        }
        // Other sounds over it, a track each.
        for (const [i, m] of (Array.isArray(a.mix) ? a.mix : []).slice(0, 15).entries()) {
          const mlib = typeof m?.library === 'string' && m.library.trim() ? mustMedia(ctx.deps.db, m.library.trim()) : null;
          const msrc = mlib ? `media:${mlib.id}` : typeof m?.path === 'string' ? m.path.trim() : '';
          if (!msrc) return { isError: true, text: `mix[${i}]: path (a sound of the session) or library (a Library sound’s id).` };
          const ms = await soundOf(ctx.deps.db, msrc, { cwd: ctx.cwd });
          const from = Math.max(0, Math.min(ms.duration, num(m.from) ?? 0));
          const startAt = Math.max(0, num(m.at) ?? 0);
          const to = Math.max(from + 0.01, Math.min(ms.duration, num(m.to) ?? ms.duration));
          r.tracks.push({
            id: `mix${i}`,
            name: mlib?.title ?? ms.name,
            ...(num(m.volume) !== undefined ? { volume: num(m.volume) } : {}),
            clips: [{ id: newId(), src: msrc, at: startAt, from, to, ...(num(m.fade_in) ? { fadeIn: num(m.fade_in) } : {}), ...(num(m.fade_out) ? { fadeOut: num(m.fade_out) } : {}) }],
          });
          what.push(`${mlib?.title ?? ms.name} mixed in at ${soundClock(startAt, 1)}`);
        }
        // The whole sound's effects, in the order that sounds best.
        const effects: SoundEffect[] = [];
        const add = (type: SoundEffectType, v: unknown, track?: string) => {
          const p = effectFrom(type, v);
          if (!p) return;
          const e: SoundEffect = { id: newId(), type, ...(Object.keys(p).length ? { p } : {}), ...(track ? { track } : {}) };
          effects.push(e);
          what.push(effectWords(e));
        };
        // What changes the voice itself goes on its own track, before the others are mixed over it.
        add('denoise', a.denoise, T);
        add('highpass', a.highpass, T);
        add('lowpass', a.lowpass, T);
        add('eq', a.eq, T);
        add('compressor', a.compressor, T);
        add('pitch', a.pitch, T);
        add('reverse', a.reverse, T);
        add('echo', a.echo, T);
        add('reverb', a.reverb, T);
        add('mono', a.mono);
        add('gain', a.volume);
        if (num(a.fade_in)) add('fadeIn', { seconds: num(a.fade_in) });
        if (num(a.fade_out)) add('fadeOut', { seconds: num(a.fade_out) });
        add('normalize', a.normalize);
        add('loudness', a.loudness);
        add('limiter', a.limiter);
        for (const e of Array.isArray(a.effects) ? a.effects.slice(0, 30) : []) {
          if (!e || typeof e !== 'object' || !(e.type in EFFECTS)) return { isError: true, text: `effects: each a { type } of ${Object.keys(EFFECTS).join(', ')}.` };
          const { type, from, to, ...rest } = e as Record<string, unknown>;
          const p = effectFrom(type as SoundEffectType, Object.keys(rest).length ? rest : true) ?? {};
          const range = num(from) !== undefined || num(to) !== undefined ? ([Math.max(0, num(from) ?? 0), Math.min(soundLength(r), num(to) ?? soundLength(r))] as [number, number]) : undefined;
          const fx: SoundEffect = { id: newId(), type: type as SoundEffectType, ...(Object.keys(p).length ? { p } : {}), ...(range ? { range } : {}) };
          effects.push(fx);
          what.push(`${effectWords(fx)}${range ? ` from ${soundClock(range[0], 1)} to ${soundClock(range[1], 1)}` : ''}`);
        }
        if (effects.length) r.effects = effects;
        const own = keptKind(sound.file);
        const format: SoundFormat = ['mp3', 'm4a', 'ogg', 'wav', 'flac'].includes(a.format) ? a.format : (own ?? 'mp3');
        const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : `${lib?.title ?? sound.name} edited`;
        const prep = await prepareSound(
          ctx.deps,
          { src, recipe: r, out: { format, ...(num(a.quality) ? { kbps: num(a.quality) } : {}), ...(a.channels === 'mono' ? { channels: 1 } : a.channels === 'stereo' ? { channels: 2 } : {}) } as never },
          { cwd: ctx.cwd, to: { into: path.join(ctx.cwd, 'audio'), name } },
        );
        const job = startSoundEdit(prep);
        said.set(job.job, { what: what.join(', '), ...(lib && (a.save_to_library === 'replace' || a.save_to_library === 'copy') ? { library: { id: lib.id, as: a.save_to_library, title: lib.title } } : {}) });
        setTimeout(() => said.delete(job.job), 2 * 3600_000).unref?.();
        await waitForSoundJob(job.job, until - Date.now(), ctx.signal);
        return finishLibrary(job.job, ctx);
      } catch (e) {
        return { isError: true, text: String((e as Error).message ?? e) };
      }
    },
  };
}

/** The answer, once the Library has its copy where the agent asked (as the editor's Save or Save a copy puts it). */
async function finishLibrary(id: string, ctx: Parameters<RunTool['run']>[1]): Promise<string | { isError: true; text: string }> {
  const out = answer(id);
  const v = soundJob(id);
  const lib = said.get(id)?.library;
  if (typeof out !== 'string' || !lib || v?.status !== 'done' || !v.path) return out;
  try {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-sound-'));
    const copy = path.join(tmp, `${lib.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').slice(0, 80) || 'sound'} (edited)${path.extname(v.path)}`);
    await fs.promises.copyFile(v.path, copy);
    let line: string;
    if (lib.as === 'replace') {
      const item = await replaceLibrarySound(ctx.deps, mustMedia(ctx.deps.db, lib.id), copy, path.extname(v.path).slice(1));
      line = `It is in the Library in place of “${lib.title}” (${item.id}).`;
    } else {
      const from = mustMedia(ctx.deps.db, lib.id);
      const { item } = await keepFile(ctx.deps, { path: copy, ...(from.space ? { space: from.space } : {}) }, { move: true });
      line = `It is in the Library as a new sound beside “${lib.title}” (${item.id}).`;
    }
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
    said.delete(id);
    return `${out}\n${line}`;
  } catch (e) {
    return `${out}\nIt could not be put in the Library: ${(e as Error).message}`;
  }
}
