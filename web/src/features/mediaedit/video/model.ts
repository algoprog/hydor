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
} from '@shared/mediaedit-video';

/** What the editor keeps a step of undo for: the recipe, and the markers on the timeline. */
export interface Edit {
  recipe: VideoRecipe;
  markers: number[];
  /** A slide's video: the moment its still is taken at (seconds of the timeline). */
  stillAt?: number;
}

/** What is picked: a clip of the main track, an overlay, words, a sound, or the transition after a clip. */
export type Picked = { kind: 'clip' | 'overlay' | 'text' | 'audio' | 'transition'; id: string } | null;

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
  return { ...c, trim: x <= 0.001 && y >= d - 0.001 ? undefined : [ms(x), ms(y)] };
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
  const item: VideoAudio = { id: videoId(), src: c.sound ?? c.src ?? mainSrc, name: c.name ?? 'Sound', track: 'voice', start: ms(span.start), trim: c.trim ?? [0, ms(facts.duration)], ...(c.volume !== undefined ? { volume: c.volume } : {}) };
  return { ...setClip(r, id, (x) => ({ ...x, mute: true, volume: undefined, sound: undefined })), audio: [...(r.audio ?? []), item] };
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
  return { ...r, audio: r.audio!.flatMap((y) => (y.id === id ? [{ ...x, trim: [p, ms(p + u)] as [number, number], fadeOut: undefined }, { ...x, id: videoId(), start: ms(t), trim: [ms(p + u), q] as [number, number], fadeIn: undefined }] : [y])) };
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
export function snapTimes(r: VideoRecipe, f: VideoFactsOf, o: { playhead: number; markers: number[]; inOut: [number | null, number | null]; except?: string }): number[] {
  const out = [0, o.playhead, ...o.markers, ...o.inOut.filter((x): x is number => x !== null)];
  const { spans } = spansOf(r, f);
  (r.clips ?? []).forEach((c, i) => c.id !== o.except && out.push(spans[i].start, spans[i].end));
  for (const x of r.overlays ?? []) if (x.id !== o.except) out.push(x.start, x.start + overlayLength(x, f(x.src)));
  for (const x of r.audio ?? []) if (x.id !== o.except) out.push(x.start, x.start + audioLength(x, f(x.src)));
  for (const x of r.texts ?? []) if (x.id !== o.except) out.push(x.from, x.to);
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
  if (p.kind === 'clip' || p.kind === 'transition') return r.clips?.find((c) => c.id === p.id) ?? null;
  if (p.kind === 'overlay') return r.overlays?.find((o) => o.id === p.id) ?? null;
  if (p.kind === 'audio') return r.audio?.find((a) => a.id === p.id) ?? null;
  return r.texts?.find((t) => t.id === p.id) ?? null;
}

/** A clip's length on the timeline, for what is shown of it. */
export const lengthOf = (c: VideoClip, f: VideoFactsOf) => clipLength(c, f(c.src));
