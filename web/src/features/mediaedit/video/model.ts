// The video editor's timeline as it is changed: each change a pure step on the recipe (shared/mediaedit-video.ts), so
// one step of undo each. The main track (V1) is magnetic, as Final Cut's is: its clips follow one another without gaps,
// so trimming or deleting one moves the rest; the other tracks (overlays, words, music, voice) keep their times unless
// a change ripples them. Times here are seconds of the timeline unless they say otherwise.
import {
  audioLength,
  clipLength,
  clipSpans,
  clampView,
  isStill,
  levelAt,
  MAX_AUDIO,
  MAX_CLIPS,
  MAX_OVERLAYS,
  MAX_TEXTS,
  MIN_PART,
  overlayLength,
  PICTURE_SECONDS,
  sourceAt,
  videoId,
  viewAt,
  type ClipSpan,
  type VideoAudio,
  type VideoClip,
  type VideoFactsOf,
  type VideoOverlay,
  type VideoRecipe,
  type VideoSize,
  type VideoText,
  type VideoTrackId,
} from '@shared/mediaedit-video';

/** What the editor keeps a step of undo for: the recipe, and the markers on the timeline. */
export interface Edit {
  recipe: VideoRecipe;
  markers: number[];
  /** A slide's video: the moment its still is taken at (seconds of the timeline). */
  stillAt?: number;
}

/** What is picked: a clip of the main track, its sound (A1), an overlay, words, a sound, or the transition after a clip. */
export type Picked = { kind: 'clip' | 'clipsound' | 'overlay' | 'text' | 'audio' | 'transition'; id: string } | null;

/** A part of one sound picked on its track (seconds of the timeline): Delete silences it. */
export type SoundRange = { kind: 'clip' | 'audio'; id: string; from: number; to: number } | null;

type SoundBits = Pick<VideoAudio, 'levels' | 'silence'>;

/** A sound's volume line and silenced parts moved `by` seconds (its start trimmed), what falls before 0 or after `len` cut. */
export function shiftSound<T extends SoundBits>(x: T, by: number, len: number): T {
  if (!x.levels && !x.silence) return x;
  const out = { ...x };
  if (x.levels) {
    const at0 = levelAt(x.levels, -by);
    const pts = x.levels.map(([t, d]) => [ms(t + by), d] as [number, number]).filter(([t]) => t >= 0 && t <= len);
    if (by < 0 && x.levels.some(([t]) => t + by < 0)) pts.unshift([0, at0]);
    out.levels = pts.length ? pts : undefined;
  }
  if (x.silence) {
    const sil = x.silence.map(([a, b]) => [ms(Math.max(0, a + by)), ms(Math.min(len, b + by))] as [number, number]).filter(([a, b]) => b - a >= 0.02);
    out.silence = sil.length ? sil : undefined;
  }
  return out;
}

/** A sound's volume line and silenced parts cut at `u` seconds into it: the parts before and after (the after's from 0). */
function splitSound<T extends SoundBits>(x: T, u: number, len: number): [T, T] {
  const a = { ...x };
  const b = { ...x };
  if (x.levels) {
    const at = levelAt(x.levels, u);
    a.levels = [...x.levels.filter(([t]) => t < u), [ms(u), at]];
    b.levels = [[0, at], ...x.levels.filter(([t]) => t > u).map(([t, d]) => [ms(t - u), d] as [number, number])];
  }
  if (x.silence) {
    const sa = x.silence.map(([p, q]) => [p, Math.min(q, u)] as [number, number]).filter(([p, q]) => q - p >= 0.02);
    const sb = x.silence.map(([p, q]) => [Math.max(0, p - u), Math.min(len - u, q - u)] as [number, number]).filter(([p, q]) => q - p >= 0.02);
    a.silence = sa.length ? sa : undefined;
    b.silence = sb.length ? sb : undefined;
  }
  return [a, b];
}

/** A part of a sound silenced (seconds of the timeline), the picture kept: a clip's own sound, or a sound of A2 or A3. */
export function silencePart(r: VideoRecipe, f: VideoFactsOf, kind: 'clip' | 'audio', id: string, from: number, to: number): VideoRecipe {
  const add = (x: SoundBits, start: number, len: number): SoundBits => {
    const a = Math.max(0, from - start);
    const b = Math.min(len, to - start);
    if (b - a < 0.02) return x;
    return { ...x, silence: [...(x.silence ?? []), [ms(a), ms(b)] as [number, number]].sort((p, q) => p[0] - q[0]) };
  };
  if (kind === 'clip') {
    const { spans } = spansOf(r, f);
    return { ...r, clips: (r.clips ?? []).map((c, i) => (c.id === id ? ({ ...c, ...add(c, spans[i].start, spans[i].length) } as VideoClip) : c)) };
  }
  return setAudio(r, id, (a) => ({ ...a, ...add(a, a.start, audioLength(a, f(a.src))) }) as VideoAudio);
}

/** The clips' own sound silenced from `from` to `to` (In to Out) wherever it crosses them, the picture kept. */
export function silenceClips(r: VideoRecipe, f: VideoFactsOf, from: number, to: number): VideoRecipe {
  let out = r;
  const { spans } = spansOf(r, f);
  (r.clips ?? []).forEach((c, i) => {
    if (spans[i].end > from && spans[i].start < to) out = silencePart(out, f, 'clip', c.id!, from, to);
  });
  return out;
}

/** Something in the media panel: a video, a picture or a sound, with its facts. */
export interface PoolItem {
  src: string;
  kind: 'video' | 'picture' | 'sound';
  name: string;
  facts: VideoSize;
  /** The video being edited. */
  main?: boolean;
}

export const spansOf = (r: VideoRecipe, f: VideoFactsOf) => clipSpans(r.clips ?? [], f);

/** Every clip, overlay, sound and text with an id of its own (the editor picks them by it). */
export function withIds(r: VideoRecipe): VideoRecipe {
  const id = <T extends { id?: string }>(x: T): T => (x.id ? x : { ...x, id: videoId() });
  return { ...r, clips: (r.clips ?? []).map(id), ...(r.overlays ? { overlays: r.overlays.map(id) } : {}), ...(r.audio ? { audio: r.audio.map(id) } : {}), ...(r.texts ? { texts: r.texts.map(id) } : {}) };
}

/** A recipe without the parts that are empty or undefined. */
export function tidy(r: VideoRecipe): VideoRecipe {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (v !== undefined && !(Array.isArray(v) && !v.length && k !== 'clips') && !(v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) out[k] = v;
  return out as VideoRecipe;
}

const ms = (n: number) => Math.round(n * 1000) / 1000;

/** The clip at a moment, its index and span; with two in a transition, the later one when `later`. */
export function clipAtTime(r: VideoRecipe, f: VideoFactsOf, t: number, later = false): { i: number; clip: VideoClip; span: ClipSpan } | null {
  const { spans } = spansOf(r, f);
  const hits = spans.map((s, i) => (t >= s.start - 1e-6 && t < s.end - 1e-6 ? i : -1)).filter((i) => i >= 0);
  const i = hits.length ? (later ? hits[hits.length - 1] : hits[0]) : spans.length - 1;
  return i >= 0 ? { i, clip: r.clips![i], span: spans[i] } : null;
}

/** Changes one clip by its id. */
export const setClip = (r: VideoRecipe, id: string, f: (c: VideoClip) => VideoClip): VideoRecipe => ({ ...r, clips: (r.clips ?? []).map((c) => (c.id === id ? f(c) : c)) });
export const setOverlay = (r: VideoRecipe, id: string, f: (o: VideoOverlay) => VideoOverlay): VideoRecipe => ({ ...r, overlays: (r.overlays ?? []).map((o) => (o.id === id ? f(o) : o)) });
export const setAudio = (r: VideoRecipe, id: string, f: (a: VideoAudio) => VideoAudio): VideoRecipe => ({ ...r, audio: (r.audio ?? []).map((a) => (a.id === id ? f(a) : a)) });
export const setText = (r: VideoRecipe, id: string, f: (t: VideoText) => VideoText): VideoRecipe => ({ ...r, texts: (r.texts ?? []).map((t) => (t.id === id ? f(t) : t)) });

/** A clip for something of the media panel. */
export function clipFor(item: PoolItem): VideoClip {
  return { id: videoId(), ...(item.main ? {} : { src: item.src }), name: item.name, ...(item.kind === 'picture' ? { picture: true, length: PICTURE_SECONDS } : {}) };
}

/** Puts a clip in the main track at `index` (the end when left out). */
export function insertClip(r: VideoRecipe, clip: VideoClip, index?: number): VideoRecipe {
  const clips = [...(r.clips ?? [])];
  clips.splice(index ?? clips.length, 0, clip);
  return { ...r, clips };
}

/** Moves the clips, words, overlays and sounds that start at or after `from` by `by` seconds (a ripple). */
export function ripple(r: VideoRecipe, from: number, by: number, o: { clipsToo?: boolean } = {}): VideoRecipe {
  if (Math.abs(by) < 1e-6) return r;
  const at = (t: number) => (t >= from - 1e-6 ? Math.max(0, ms(t + by)) : t);
  void o;
  return {
    ...r,
    ...(r.texts ? { texts: r.texts.map((t) => (t.from >= from - 1e-6 ? { ...t, from: at(t.from), to: Math.max(at(t.from) + MIN_PART, ms(t.to + by)) } : t)) } : {}),
    ...(r.overlays ? { overlays: r.overlays.map((x) => ({ ...x, start: at(x.start) })) } : {}),
    ...(r.audio ? { audio: r.audio.map((x) => ({ ...x, start: at(x.start) })) } : {}),
  };
}

/** A clip cut in two at a moment of the timeline: both halves keep what it had; the first goes straight into the second. */
export function splitClip(r: VideoRecipe, f: VideoFactsOf, id: string, t: number): VideoRecipe {
  const clips = r.clips ?? [];
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0) return r;
  const c = clips[i];
  const span = spansOf(r, f).spans[i];
  const u = t - span.start;
  if (u < MIN_PART * 2 || span.length - u < MIN_PART * 2) return r;
  const facts = f(c.src);
  let a: VideoClip;
  let b: VideoClip;
  if (isStill(c) || facts?.picture) {
    const len = c.length ?? PICTURE_SECONDS;
    a = { ...c, length: ms(u), ...(c.motion ? { motion: { from: c.motion.from, to: clampView(viewAt(c.motion, u, len)) } } : {}) };
    b = { ...c, id: videoId(), length: ms(len - u), ...(c.motion ? { motion: { from: clampView(viewAt(c.motion, u, len)), to: c.motion.to } } : {}) };
  } else {
    const s = ms(sourceAt(c, facts, u));
    const [x, y] = c.trim ?? [0, facts?.duration ?? 0];
    a = { ...c, trim: c.reverse ? [s, y] : [x, s] };
    b = { ...c, id: videoId(), trim: c.reverse ? [x, s] : [s, y] };
  }
  const [sa, sb] = splitSound(c, u, span.length);
  // The sound's halves are whole copies of the clip: the second half keeps its own id.
  a = { ...a, ...sa, soundFadeOut: undefined };
  b = { ...b, ...sb, id: b.id, soundFadeIn: undefined };
  delete a.transition;
  const out = [...clips];
  out.splice(i, 1, a, b);
  return { ...r, clips: out };
}

/** A clip taken out: the main track closes up; with `ripple`, what starts after it on the other tracks moves up too. */
export function deleteClip(r: VideoRecipe, f: VideoFactsOf, id: string, o: { ripple?: boolean } = {}): VideoRecipe {
  const clips = r.clips ?? [];
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0 || clips.length < 2) return r;
  const span = spansOf(r, f).spans[i];
  const gone = span.length - span.tin - span.tout + (span.tin + span.tout) / 2;
  const next = { ...r, clips: clips.filter((c) => c.id !== id) };
  // The clip before it keeps its transition only while there is a clip after it.
  if (i === clips.length - 1 && i > 0) next.clips = next.clips.map((c, j) => (j === i - 1 ? { ...c, transition: undefined } : c));
  return o.ripple ? ripple(next, span.end, -gone) : next;
}

/** Moves a clip of the main track to another place in it. */
export function moveClip(r: VideoRecipe, id: string, to: number): VideoRecipe {
  const clips = [...(r.clips ?? [])];
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0) return r;
  const [c] = clips.splice(i, 1);
  clips.splice(Math.max(0, Math.min(clips.length, to > i ? to - 1 : to)), 0, c);
  // The last clip has no transition after it.
  return { ...r, clips: clips.map((x, j) => (j === clips.length - 1 && x.transition ? { ...x, transition: undefined } : x)) };
}

/** A clip's start or end moved by `by` seconds of the timeline: its trim (a video) or its length (a picture). */
export function trimClip(c: VideoClip, facts: VideoSize | undefined, edge: 'start' | 'end', by: number): VideoClip {
  if (isStill(c) || facts?.picture) {
    const len = Math.max(0.2, Math.min(600, (c.length ?? PICTURE_SECONDS) + (edge === 'end' ? by : -by)));
    return { ...c, length: ms(len) };
  }
  const d = facts?.duration ?? 0;
  const sp = c.speed ?? 1;
  let [x, y] = c.trim ?? [0, d];
  // In the source, the clip's start is its trim's start (or end, played backwards).
  const s = by * sp;
  if (edge === 'start' !== !!c.reverse) x = Math.max(0, Math.min(y - MIN_PART * 2, x + (c.reverse ? -s : s)));
  else y = Math.min(d, Math.max(x + MIN_PART * 2, y + (c.reverse ? -s : s)));
  const next: VideoClip = { ...c, trim: x <= 0.001 && y >= d - 0.001 ? undefined : [ms(x), ms(y)] };
  if (edge !== 'start') return next;
  const moved = (clipLength(next, facts) - clipLength(c, facts));
  // Its volume line and silenced parts move with its start (only those: the part just trimmed is kept).
  return c.levels || c.silence ? { ...next, ...shiftSound({ levels: c.levels, silence: c.silence }, moved, clipLength(next, facts)) } : next;
}

/** The frame at a moment held for `seconds`: the clip split there, the held frame between its halves. */
export function freezeFrame(r: VideoRecipe, f: VideoFactsOf, id: string, t: number, seconds = 2): VideoRecipe {
  const clips = r.clips ?? [];
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0) return r;
  const c = clips[i];
  if (isStill(c) || f(c.src)?.picture) return r;
  const span = spansOf(r, f).spans[i];
  const at = ms(sourceAt(c, f(c.src), t - span.start));
  const still: VideoClip = { id: videoId(), ...(c.src ? { src: c.src } : {}), name: c.name, still: at, length: seconds, rotate: c.rotate, flipH: c.flipH, flipV: c.flipV, crop: c.crop, fit: c.fit, grade: c.grade };
  const split = splitClip(r, f, id, t);
  const j = split.clips!.findIndex((x) => x.id === id);
  const out = [...split.clips!];
  out.splice(j + 1, 0, JSON.parse(JSON.stringify(still)));
  return ripple({ ...split, clips: out }, t, seconds);
}

/** A clip's own sound put on the voice track as a sound of its own (with its times), the clip left without it. */
export function detachSound(r: VideoRecipe, f: VideoFactsOf, id: string, mainSrc: string): VideoRecipe {
  const clips = r.clips ?? [];
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0) return r;
  const c = clips[i];
  const facts = f(c.src);
  if (isStill(c) || facts?.picture || c.reverse || (c.speed ?? 1) !== 1 || !facts?.audio || c.mute) return r;
  const span = spansOf(r, f).spans[i];
  const item: VideoAudio = {
    id: videoId(),
    src: c.sound ?? c.src ?? mainSrc,
    name: c.name ?? 'Sound',
    track: 'voice',
    start: ms(span.start),
    trim: c.trim ?? [0, ms(facts.duration)],
    clip: c.id,
    ...(c.volume !== undefined ? { volume: c.volume } : {}),
    ...(c.channels ? { channels: c.channels } : {}),
    ...(c.levels ? { levels: c.levels } : {}),
    ...(c.silence ? { silence: c.silence } : {}),
    ...(c.clean ? { clean: c.clean } : {}),
    ...(c.even ? { even: true } : {}),
    ...(c.soundFadeIn ? { fadeIn: c.soundFadeIn } : {}),
    ...(c.soundFadeOut ? { fadeOut: c.soundFadeOut } : {}),
  };
  const bare = { mute: true, volume: undefined, sound: undefined, channels: undefined, levels: undefined, silence: undefined, clean: undefined, even: undefined, soundFadeIn: undefined, soundFadeOut: undefined };
  return { ...setClip(r, id, (x) => ({ ...x, ...bare })), audio: [...(r.audio ?? []), item] };
}

/** A sound detached from a clip put back as the clip's own (what was set of it goes with it; where it was moved is not kept). */
export function linkSound(r: VideoRecipe, audioId: string): VideoRecipe {
  const a = r.audio?.find((x) => x.id === audioId);
  if (!a?.clip || !r.clips?.some((c) => c.id === a.clip)) return r;
  const back = { mute: undefined, volume: a.volume, channels: a.channels, levels: a.levels, silence: a.silence, clean: a.clean, even: a.even, soundFadeIn: a.fadeIn, soundFadeOut: a.fadeOut };
  return { ...setClip(r, a.clip, (c) => ({ ...c, ...back })), audio: r.audio!.filter((x) => x.id !== audioId) };
}

/** Whether a clip's sound can be detached (a video with sound, forwards at its own speed). */
export const canDetach = (c: VideoClip, facts?: VideoSize) => !isStill(c) && !facts?.picture && !c.reverse && (c.speed ?? 1) === 1 && !!facts?.audio && !c.mute;

/** An overlay, a text or a sound cut in two at a moment of the timeline. */
export function splitItem(r: VideoRecipe, f: VideoFactsOf, kind: 'overlay' | 'text' | 'audio', id: string, t: number): VideoRecipe {
  if (kind === 'text') {
    const x = r.texts?.find((y) => y.id === id);
    if (!x || t <= x.from + MIN_PART || t >= x.to - MIN_PART) return r;
    const texts = r.texts!.flatMap((y) => (y.id === id ? [{ ...y, to: ms(t) }, { ...y, id: videoId(), from: ms(t) }] : [y]));
    return { ...r, texts };
  }
  if (kind === 'overlay') {
    const x = r.overlays?.find((y) => y.id === id);
    if (!x) return r;
    const facts = f(x.src);
    const len = overlayLength(x, facts);
    const u = t - x.start;
    if (u <= MIN_PART || u >= len - MIN_PART) return r;
    const [p, q] = x.trim ?? [0, facts?.duration ?? 0];
    const a: VideoOverlay = x.picture ? { ...x, length: ms(u), fadeOut: undefined } : { ...x, trim: [p, ms(p + u)], fadeOut: undefined };
    const b: VideoOverlay = x.picture ? { ...x, id: videoId(), start: ms(t), length: ms(len - u), fadeIn: undefined } : { ...x, id: videoId(), start: ms(t), trim: [ms(p + u), q], fadeIn: undefined };
    return { ...r, overlays: r.overlays!.flatMap((y) => (y.id === id ? [a, b] : [y])) };
  }
  const x = r.audio?.find((y) => y.id === id);
  if (!x) return r;
  const facts = f(x.src);
  const len = audioLength(x, facts);
  const u = t - x.start;
  if (u <= MIN_PART || u >= len - MIN_PART) return r;
  const [p, q] = x.trim ?? [0, facts?.duration ?? 0];
  const [sa, sb] = splitSound(x, u, len);
  return { ...r, audio: r.audio!.flatMap((y) => (y.id === id ? [{ ...x, ...sa, trim: [p, ms(p + u)] as [number, number], fadeOut: undefined }, { ...x, ...sb, id: videoId(), start: ms(t), trim: [ms(p + u), q] as [number, number], fadeIn: undefined }] : [y])) };
}

/** An overlay, a text or a sound taken out; with `ripple`, what starts after it on its track moves up. */
export function deleteItem(r: VideoRecipe, f: VideoFactsOf, kind: 'overlay' | 'text' | 'audio', id: string, o: { ripple?: boolean } = {}): VideoRecipe {
  if (kind === 'text') {
    const x = r.texts?.find((y) => y.id === id);
    const out = { ...r, texts: (r.texts ?? []).filter((y) => y.id !== id) };
    return x && o.ripple ? { ...out, texts: out.texts.map((y) => (y.from >= x.to - 1e-6 ? { ...y, from: ms(y.from - (x.to - x.from)), to: ms(y.to - (x.to - x.from)) } : y)) } : out;
  }
  if (kind === 'overlay') {
    const x = r.overlays?.find((y) => y.id === id);
    const out = { ...r, overlays: (r.overlays ?? []).filter((y) => y.id !== id) };
    if (!x || !o.ripple) return out;
    const len = overlayLength(x, f(x.src));
    return { ...out, overlays: out.overlays.map((y) => ((y.track ?? 2) === (x.track ?? 2) && y.start >= x.start + len - 1e-6 ? { ...y, start: ms(y.start - len) } : y)) };
  }
  const x = r.audio?.find((y) => y.id === id);
  const out = { ...r, audio: (r.audio ?? []).filter((y) => y.id !== id) };
  if (!x || !o.ripple) return out;
  const len = audioLength(x, f(x.src));
  return { ...out, audio: out.audio.map((y) => (y.track === x.track && y.start >= x.start + len - 1e-6 ? { ...y, start: ms(y.start - len) } : y)) };
}

/** The times things snap to: the playhead, the clips' and the other items' ends, the markers, In and Out. */
export function snapTimes(r: VideoRecipe, f: VideoFactsOf, o: { playhead: number; markers: number[]; inOut: [number | null, number | null]; except?: string | string[] }): number[] {
  const out = [0, o.playhead, ...o.markers, ...o.inOut.filter((x): x is number => x !== null)];
  const { spans } = spansOf(r, f);
  // The thing (or things, for a group) being moved is not something to line up with.
  const skip = (id: string | undefined) => (Array.isArray(o.except) ? o.except.includes(id ?? '') : id === o.except);
  (r.clips ?? []).forEach((c, i) => !skip(c.id) && out.push(spans[i].start, spans[i].end));
  for (const x of r.overlays ?? []) if (!skip(x.id)) out.push(x.start, x.start + overlayLength(x, f(x.src)));
  for (const x of r.audio ?? []) if (!skip(x.id)) out.push(x.start, x.start + audioLength(x, f(x.src)));
  for (const x of r.texts ?? []) if (!skip(x.id)) out.push(x.from, x.to);
  return out;
}

/** A time pulled to the nearest of `times` within `px` pixels at `pps` pixels a second; as it is otherwise. */
export function snap(t: number, times: number[], pps: number, px = 8): { t: number; to: number | null } {
  let best: number | null = null;
  for (const x of times) if (Math.abs(x - t) * pps <= px && (best === null || Math.abs(x - t) < Math.abs(best - t))) best = x;
  return best === null ? { t, to: null } : { t: best, to: best };
}

/** The clip, overlay, sound or text picked, if it is still there. */
export function pickedThing(r: VideoRecipe, p: Picked): VideoClip | VideoOverlay | VideoAudio | VideoText | null {
  if (!p) return null;
  if (p.kind === 'clip' || p.kind === 'clipsound' || p.kind === 'transition') return r.clips?.find((c) => c.id === p.id) ?? null;
  if (p.kind === 'overlay') return r.overlays?.find((o) => o.id === p.id) ?? null;
  if (p.kind === 'audio') return r.audio?.find((a) => a.id === p.id) ?? null;
  return r.texts?.find((t) => t.id === p.id) ?? null;
}

/** A clip's length on the timeline, for what is shown of it. */
export const lengthOf = (c: VideoClip, f: VideoFactsOf) => clipLength(c, f(c.src));


// ---- which track a thing is on, and what is picked ---------------------------------------------------------------------

/** One thing picked. */
export type Pick1 = NonNullable<Picked>;

/** The track a picked thing is on (a locked track's things are left as they are by every command). */
export function trackOf(r: VideoRecipe, p: Pick1): VideoTrackId {
  if (p.kind === 'clip' || p.kind === 'transition') return 'v1';
  if (p.kind === 'clipsound') return 'a1';
  if (p.kind === 'text') return 't1';
  if (p.kind === 'overlay') return r.overlays?.find((o) => o.id === p.id)?.track === 3 ? 'v3' : 'v2';
  return r.audio?.find((a) => a.id === p.id)?.track === 'voice' ? 'a3' : 'a2';
}

export const samePick = (a: Picked, b: Picked) => !!a && !!b && a.kind === b.kind && a.id === b.id;

/** A thing added to what is picked, or taken out of it when it already is (Shift or Ctrl and a click). */
export function togglePick(picks: Pick1[], p: Pick1): Pick1[] {
  return picks.some((x) => samePick(x, p)) ? picks.filter((x) => !samePick(x, p)) : [...picks, p];
}

/** Every thing whose box on the timeline touches the rectangle of the marquee: times from `t0` to `t1`, tracks `rows`. */
export function pickedIn(r: VideoRecipe, f: VideoFactsOf, t0: number, t1: number, rows: Set<VideoTrackId>): Pick1[] {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const hit = (a: number, b: number) => b > lo && a < hi;
  const out: Pick1[] = [];
  const { spans } = spansOf(r, f);
  (r.clips ?? []).forEach((c, i) => {
    if (rows.has('v1') && hit(spans[i].start, spans[i].end)) out.push({ kind: 'clip', id: c.id! });
    else if (rows.has('a1') && hit(spans[i].start, spans[i].end)) out.push({ kind: 'clipsound', id: c.id! });
  });
  for (const o of r.overlays ?? []) if (rows.has(o.track === 3 ? 'v3' : 'v2') && hit(o.start, o.start + overlayLength(o, f(o.src)))) out.push({ kind: 'overlay', id: o.id! });
  for (const x of r.texts ?? []) if (rows.has('t1') && hit(x.from, x.to)) out.push({ kind: 'text', id: x.id! });
  for (const a of r.audio ?? []) if (rows.has(a.track === 'voice' ? 'a3' : 'a2') && hit(a.start, a.start + audioLength(a, f(a.src)))) out.push({ kind: 'audio', id: a.id! });
  return out;
}

// ---- the clipboard: copy, cut, paste, duplicate and paste attributes -----------------------------------------------------

/** What Copy keeps: the clips, overlays, words and sounds picked, as they were (their ids made new when pasted). */
export interface Board {
  clips: VideoClip[];
  overlays: VideoOverlay[];
  texts: VideoText[];
  audio: VideoAudio[];
  /** Where the earliest of the overlays, words and sounds began on the timeline: what pasting measures from. */
  at: number;
}

const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** The picked things copied (a clip's sound picked on A1 copies the clip); null when there is nothing to copy. */
export function copyPicks(r: VideoRecipe, picks: Pick1[]): Board | null {
  const has = (kinds: string[], id: string | undefined) => picks.some((p) => kinds.includes(p.kind) && p.id === id);
  const board: Board = {
    clips: (r.clips ?? []).filter((c) => has(['clip', 'clipsound'], c.id)).map(copy),
    overlays: (r.overlays ?? []).filter((o) => has(['overlay'], o.id)).map(copy),
    texts: (r.texts ?? []).filter((t) => has(['text'], t.id)).map(copy),
    audio: (r.audio ?? []).filter((a) => has(['audio'], a.id)).map(copy),
    at: 0,
  };
  if (!board.clips.length && !board.overlays.length && !board.texts.length && !board.audio.length) return null;
  const starts = [...board.overlays.map((o) => o.start), ...board.texts.map((t) => t.from), ...board.audio.map((a) => a.start)];
  board.at = starts.length ? Math.min(...starts) : 0;
  return board;
}

/** Where a pasted board goes: its clips at `index` of the main track, the rest from the time `at`. */
export interface PasteAt {
  index?: number;
  at: number;
  /** Overlays go on this track (2 or 3) instead of the one they came from. */
  overlayTrack?: number;
  /** Sounds go on this track instead of the one they came from. */
  audioTrack?: 'music' | 'voice';
}

/** A board put in the recipe, every part with an id of its own; the things made are returned picked. Null when it would pass a limit. */
export function pasteBoard(r: VideoRecipe, f: VideoFactsOf, board: Board, to: PasteAt): { recipe: VideoRecipe; picks: Pick1[] } | null {
  if ((r.clips ?? []).length + board.clips.length > MAX_CLIPS || (r.overlays ?? []).length + board.overlays.length > MAX_OVERLAYS || (r.audio ?? []).length + board.audio.length > MAX_AUDIO || (r.texts ?? []).length + board.texts.length > MAX_TEXTS) return null;
  const picks: Pick1[] = [];
  let next = r;
  if (board.clips.length) {
    const fresh = board.clips.map((c, i) => {
      const x = { ...copy(c), id: videoId() };
      // The last of them goes into whatever comes after, with a cut.
      if (i === board.clips.length - 1) delete x.transition;
      picks.push({ kind: 'clip', id: x.id! });
      return x;
    });
    const clips = [...(next.clips ?? [])];
    clips.splice(Math.max(0, Math.min(clips.length, to.index ?? clips.length)), 0, ...fresh);
    next = { ...next, clips };
  }
  if (board.overlays.length || board.texts.length || board.audio.length) {
    // From the time asked, but not so late that the earliest starts after the end of the video.
    const room = Math.max(0, spansOf(next, f).length - 0.5);
    const dt = Math.max(-board.at, Math.min(to.at, room) - board.at);
    const late = (n: number) => ms(Math.max(0, n + dt));
    const overlays = board.overlays.map((o) => {
      const x: VideoOverlay = { ...copy(o), id: videoId(), start: late(o.start), ...(to.overlayTrack ? { track: to.overlayTrack } : {}) };
      picks.push({ kind: 'overlay', id: x.id! });
      return x;
    });
    const texts = board.texts.map((t) => {
      const x: VideoText = { ...copy(t), id: videoId(), from: late(t.from), to: ms(late(t.from) + (t.to - t.from)) };
      picks.push({ kind: 'text', id: x.id! });
      return x;
    });
    const audio = board.audio.map((a) => {
      const x: VideoAudio = { ...copy(a), id: videoId(), start: late(a.start), ...(to.audioTrack ? { track: to.audioTrack } : {}) };
      delete x.clip;
      picks.push({ kind: 'audio', id: x.id! });
      return x;
    });
    next = { ...next, ...(overlays.length ? { overlays: [...(next.overlays ?? []), ...overlays] } : {}), ...(texts.length ? { texts: [...(next.texts ?? []), ...texts] } : {}), ...(audio.length ? { audio: [...(next.audio ?? []), ...audio] } : {}) };
  }
  return { recipe: next, picks };
}

/** The picked things copied and pasted straight after themselves: clips after the last picked clip, the rest where the group ends. */
export function duplicatePicks(r: VideoRecipe, f: VideoFactsOf, picks: Pick1[]): { recipe: VideoRecipe; picks: Pick1[] } | null {
  const board = copyPicks(r, picks);
  if (!board) return null;
  const ids = new Set(board.clips.map((c) => c.id));
  const last = (r.clips ?? []).reduce((n, c, i) => (ids.has(c.id) ? i : n), -1);
  const ends = [...board.overlays.map((o) => o.start + overlayLength(o, f(o.src))), ...board.texts.map((t) => t.to), ...board.audio.map((a) => a.start + audioLength(a, f(a.src)))];
  return pasteBoard(r, f, board, { index: last + 1, at: ends.length ? Math.max(...ends) : 0 });
}

/** What Paste attributes carries from one thing to another, by kind: the look, the speed, the colour, the sound and its fades. */
const CLIP_ATTRS = ['fit', 'rotate', 'flipH', 'flipV', 'stabilize', 'grade', 'speed', 'keepPitch', 'volume', 'mute', 'channels', 'clean', 'even', 'soundFadeIn', 'soundFadeOut'] as const;
const OVERLAY_ATTRS = ['x', 'y', 'w', 'opacity', 'key', 'fadeIn', 'fadeOut'] as const;
const AUDIO_ATTRS = ['volume', 'channels', 'clean', 'even', 'fadeIn', 'fadeOut'] as const;
const TEXT_ATTRS = ['size', 'color', 'background', 'outline', 'bold'] as const;

/** A sound's settings by their names on a sound of A2 or A3, whichever kind of thing they are of (a clip's fades are its sound's). */
const soundSet = (x: Record<string, unknown>, clip: boolean) => ({ volume: x.volume, channels: x.channels, clean: x.clean, even: x.even, fadeIn: clip ? x.soundFadeIn : x.fadeIn, fadeOut: clip ? x.soundFadeOut : x.fadeOut });

/**
 * The attributes of the copied things put on the picked ones: a clip's look, speed, colour, volume and fades onto the
 * clips picked, an overlay's place, size and fades onto the overlays, words' style onto the words, a sound's level, channels,
 * clean-up and fades onto the sounds (a clip's own sound and a sound of A2 or A3 swap those). What is not an attribute
 * (its part, its place in time, its words, its crop) is kept. `changed` is how many things took something.
 */
export function pasteAttributes(r: VideoRecipe, board: Board, picks: Pick1[]): { recipe: VideoRecipe; changed: number } {
  let changed = 0;
  const src = { clip: board.clips[0], overlay: board.overlays[0], text: board.texts[0], audio: board.audio[0] };
  const ids = (kinds: string[]) => new Set<string | undefined>(picks.filter((p) => kinds.includes(p.kind)).map((p) => p.id));
  const take = <T extends object>(target: T, from: Record<string, unknown>, keys: readonly string[]): T => {
    const out = { ...target } as Record<string, unknown>;
    for (const k of keys) out[k] = from[k];
    changed++;
    return out as T;
  };
  const clipIds = ids(['clip', 'clipsound']);
  const clips = (r.clips ?? []).map((c) => {
    if (!clipIds.has(c.id)) return c;
    if (src.clip) {
      // A picture or a held frame has no speed of its own to take.
      const still = isStill(c) || c.picture;
      return take(c, { ...src.clip, ...(still ? { speed: c.speed, keepPitch: c.keepPitch } : {}) } as Record<string, unknown>, CLIP_ATTRS);
    }
    if (src.audio) {
      const s = soundSet(src.audio as unknown as Record<string, unknown>, false);
      return take(c, { volume: s.volume, channels: s.channels, clean: s.clean, even: s.even, soundFadeIn: s.fadeIn, soundFadeOut: s.fadeOut }, ['volume', 'channels', 'clean', 'even', 'soundFadeIn', 'soundFadeOut']);
    }
    return c;
  });
  const overlayIds = ids(['overlay']);
  const overlays = (r.overlays ?? []).map((o) => (overlayIds.has(o.id) && src.overlay ? take(o, src.overlay as unknown as Record<string, unknown>, OVERLAY_ATTRS) : o));
  const textIds = ids(['text']);
  const texts = (r.texts ?? []).map((t) => (textIds.has(t.id) && src.text ? take(t, src.text as unknown as Record<string, unknown>, TEXT_ATTRS) : t));
  const audioIds = ids(['audio']);
  const audio = (r.audio ?? []).map((a) => {
    if (!audioIds.has(a.id)) return a;
    if (src.audio) return take(a, src.audio as unknown as Record<string, unknown>, AUDIO_ATTRS);
    if (src.clip) return take(a, soundSet(src.clip as unknown as Record<string, unknown>, true), AUDIO_ATTRS);
    return a;
  });
  if (!changed) return { recipe: r, changed };
  return { recipe: { ...r, ...(r.clips ? { clips } : {}), ...(r.overlays ? { overlays } : {}), ...(r.texts ? { texts } : {}), ...(r.audio ? { audio } : {}) }, changed };
}

// ---- commands on several things at once -------------------------------------------------------------------------------

/** What is picked taken out in one step (a clip's own sound silenced, a transition made a cut); the last clip stays, and things on locked tracks. */
export function deletePicks(r: VideoRecipe, f: VideoFactsOf, picks: Pick1[], o: { ripple?: boolean; locked?: (t: VideoTrackId) => boolean } = {}): { recipe: VideoRecipe; done: number } {
  let next = r;
  let done = 0;
  for (const p of picks) {
    if (o.locked?.(trackOf(r, p))) continue;
    let after = next;
    if (p.kind === 'clip') after = deleteClip(next, f, p.id, { ripple: o.ripple });
    else if (p.kind === 'clipsound') after = setClip(next, p.id, (c) => ({ ...c, mute: true, volume: undefined, sound: undefined }));
    else if (p.kind === 'transition') after = setClip(next, p.id, (c) => ({ ...c, transition: undefined }));
    else after = deleteItem(next, f, p.kind, p.id, { ripple: o.ripple });
    if (after !== next) done++;
    next = after;
  }
  return { recipe: next, done };
}

/** Everything picked that the moment `t` falls inside, cut there, in one step; things on locked tracks are left whole. */
export function splitPicks(r: VideoRecipe, f: VideoFactsOf, picks: Pick1[], t: number, o: { locked?: (t: VideoTrackId) => boolean } = {}): { recipe: VideoRecipe; done: number } {
  let next = r;
  let done = 0;
  for (const p of picks) {
    if (p.kind === 'transition' || o.locked?.(trackOf(r, p))) continue;
    const after = p.kind === 'clip' || p.kind === 'clipsound' ? splitClip(next, f, p.id, t) : splitItem(next, f, p.kind, p.id, t);
    if (after !== next) done++;
    next = after;
  }
  return { recipe: next, done };
}

/** Several clips of the main track moved together to before the clip at index `to`, keeping their order; the last has no transition. */
export function moveClips(r: VideoRecipe, ids: string[], to: number): VideoRecipe {
  const clips = r.clips ?? [];
  const moving = clips.filter((c) => ids.includes(c.id!));
  if (!moving.length) return r;
  const before = clips.slice(0, Math.max(0, Math.min(clips.length, to))).filter((c) => ids.includes(c.id!)).length;
  const rest = clips.filter((c) => !ids.includes(c.id!));
  const at = Math.max(0, Math.min(rest.length, to - before));
  const out = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  return { ...r, clips: out.map((x, j) => (j === out.length - 1 && x.transition ? { ...x, transition: undefined } : x)) };
}

/** Overlays, words and sounds picked moved `dt` seconds together (not before the start of the timeline); the rest as they were. */
export function shiftPicks(r: VideoRecipe, picks: Pick1[], dt: number): VideoRecipe {
  const ids = (k: string) => new Set<string | undefined>(picks.filter((p) => p.kind === k).map((p) => p.id));
  const o = ids('overlay');
  const t = ids('text');
  const a = ids('audio');
  const starts = [...(r.overlays ?? []).filter((x) => o.has(x.id)).map((x) => x.start), ...(r.texts ?? []).filter((x) => t.has(x.id)).map((x) => x.from), ...(r.audio ?? []).filter((x) => a.has(x.id)).map((x) => x.start)];
  if (!starts.length) return r;
  const d = Math.max(dt, -Math.min(...starts));
  return {
    ...r,
    ...(r.overlays ? { overlays: r.overlays.map((x) => (o.has(x.id) ? { ...x, start: ms(x.start + d) } : x)) } : {}),
    ...(r.texts ? { texts: r.texts.map((x) => (t.has(x.id) ? { ...x, from: ms(x.from + d), to: ms(x.to + d) } : x)) } : {}),
    ...(r.audio ? { audio: r.audio.map((x) => (a.has(x.id) ? { ...x, start: ms(x.start + d) } : x)) } : {}),
  };
}

// ---- trimming to a time, and moving between cuts -----------------------------------------------------------------------

/**
 * An overlay, words or a sound with one of its ends brought to the moment `s` of the timeline (`first` is the thing as it
 * was before the change: a drag keeps asking from it). A picture's or words' length, a video's or sound's part kept.
 */
export function trimItemTo(r: VideoRecipe, f: VideoFactsOf, kind: 'overlay' | 'text' | 'audio', first: VideoOverlay | VideoText | VideoAudio, edge: 'start' | 'end', s: number): VideoRecipe {
  const id = first.id!;
  if (kind === 'text') {
    const x = first as VideoText;
    return setText(r, id, (y) => (edge === 'start' ? { ...y, from: ms(Math.min(s, x.to - 0.1)) } : { ...y, to: ms(Math.max(s, x.from + 0.1)) }));
  }
  // An overlay or a sound: what they share (a source, a start, a part kept, a picture) read from either.
  const it = first as { src: string; start: number; trim?: [number, number]; picture?: boolean };
  const facts = f(it.src);
  const len = kind === 'overlay' ? overlayLength(first as VideoOverlay, facts) : audioLength(first as VideoAudio, facts);
  const [a, b] = it.trim ?? [0, facts?.duration ?? len];
  const still = kind === 'overlay' && (it.picture || facts?.picture);
  if (edge === 'end') {
    const nl = Math.max(0.1, s - it.start);
    if (still) return setOverlay(r, id, (o) => ({ ...o, length: ms(nl) }));
    const nb = Math.min(facts?.duration ?? a + nl, a + nl);
    return kind === 'overlay' ? setOverlay(r, id, (o) => ({ ...o, trim: [a, ms(nb)] })) : setAudio(r, id, (m) => ({ ...m, trim: [a, ms(nb)] }));
  }
  const d = Math.max(-it.start, Math.min(len - 0.1, s - it.start));
  if (still) return setOverlay(r, id, (o) => ({ ...o, start: ms(it.start + d), length: ms(len - d) }));
  const na = Math.max(0, a + d);
  const nd = na - a;
  return kind === 'overlay' ? setOverlay(r, id, (o) => ({ ...o, start: ms(it.start + nd), trim: [ms(na), b] })) : setAudio(r, id, () => ({ ...(first as VideoAudio), ...shiftSound(first as VideoAudio, -nd, len - nd), start: ms(it.start + nd), trim: [ms(na), b] }));
}

/**
 * The picked thing's start (Q) or end (W) brought to the playhead, what was before it (or after it) cut away. Nothing
 * when the playhead is not inside it. A clip of the main track closes up, as that track does; others stay where they are.
 */
export function trimToPlayhead(r: VideoRecipe, f: VideoFactsOf, p: Pick1, edge: 'start' | 'end', t: number): VideoRecipe {
  if (p.kind === 'transition') return r;
  if (p.kind === 'clip' || p.kind === 'clipsound') {
    const i = (r.clips ?? []).findIndex((c) => c.id === p.id);
    if (i < 0) return r;
    const span = spansOf(r, f).spans[i];
    if (t <= span.start + MIN_PART * 2 || t >= span.end - MIN_PART * 2) return r;
    return setClip(r, p.id, (c) => trimClip(c, f(c.src), edge, edge === 'start' ? t - span.start : t - span.end));
  }
  const x = pickedThing(r, p) as VideoOverlay | VideoText | VideoAudio | null;
  if (!x) return r;
  const from = p.kind === 'text' ? (x as VideoText).from : (x as VideoOverlay).start;
  const len = p.kind === 'text' ? (x as VideoText).to - from : p.kind === 'overlay' ? overlayLength(x as VideoOverlay, f((x as VideoOverlay).src)) : audioLength(x as VideoAudio, f((x as VideoAudio).src));
  if (t <= from + MIN_PART || t >= from + len - MIN_PART) return r;
  return trimItemTo(r, f, p.kind, x, edge, t);
}

/** The times the playhead jumps between with ↑ and ↓: the start, each cut between clips, and the end. */
export function cutTimes(spans: ClipSpan[], length: number): number[] {
  const all = [0, ...spans.flatMap((s) => [s.start, s.end]), length].sort((a, b) => a - b);
  return all.filter((t, i) => i === 0 || t - all[i - 1] > 1e-3);
}

/** The cut after (`dir` 1) or before (-1) the time `t`; null when there is none. */
export function neighbourCut(cuts: number[], t: number, dir: 1 | -1): number | null {
  if (dir > 0) return cuts.find((c) => c > t + 1e-3) ?? null;
  for (let i = cuts.length - 1; i >= 0; i--) if (cuts[i] < t - 1e-3) return cuts[i];
  return null;
}

/**
 * A thing of `len` seconds that starts at `start`, pulled so that its start or its end (whichever is nearer something)
 * lies on one of `times`, within `px` pixels at `pps` pixels a second; `to` is the time it lined up with.
 */
export function snapSpan(start: number, len: number, times: number[], pps: number, px = 8): { start: number; to: number | null } {
  const a = snap(start, times, pps, px);
  const b = snap(start + len, times, pps, px);
  if (a.to === null && b.to === null) return { start, to: null };
  const da = a.to === null ? Infinity : Math.abs(a.t - start);
  const db = b.to === null ? Infinity : Math.abs(b.t - (start + len));
  return da <= db ? { start: a.t, to: a.to } : { start: b.t - len, to: b.to };
}
