// A video's edit, as the video editor keeps it and edit_video asks for it: the parts kept (a trim, cuts), how fast it
// plays, the part of the picture kept (a crop), its turn and mirroring, its colour, fades, its sound and music, and
// words over it. The server makes it with ffmpeg (server/mediaedit/video.ts); the editor shows the same in the browser
// while it is being made. Times are seconds of the original video, so a cut or a title stays with the picture it was put
// on when other parts are cut; the edited video's own time (after the cuts and the speed) is worked out from them.

/** Turned clockwise, in degrees. */
export type VideoTurn = 0 | 90 | 180 | 270;

/** A title or caption over the video. */
export interface VideoText {
  text: string;
  /** When it shows, in seconds of the original video. */
  from: number;
  to: number;
  /** Where its middle is: a share of the edited picture's width and height (0.5, 0.5 is the middle). */
  x: number;
  y: number;
  /** How tall its letters are: a share of the edited picture's height (0.07 a caption, 0.12 a title). */
  size: number;
  /** Its colour, "#rrggbb". */
  color: string;
  /** A box behind it, "#rrggbb" or "#rrggbbaa" (with how solid it is); none when left out. */
  background?: string;
  bold?: boolean;
}

/** Music under the video: a sound of the Library's ("media:<id>") or a sound file's path. */
export interface VideoMusic {
  src: string;
  /** Its name, to show. */
  name?: string;
  /** How loud, 0 to 2 (1 as it is). */
  volume?: number;
  /** Where in the edited video it starts, in seconds. */
  start?: number;
}

export interface VideoCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A video's edit. Every part is left out when it changes nothing. */
export interface VideoRecipe {
  /** The part kept, in seconds of the original. */
  trim?: [number, number];
  /** Parts taken out, in seconds of the original. */
  cuts?: [number, number][];
  /** How fast it plays, 0.25 to 4. */
  speed?: number;
  /** The part of the picture kept, in pixels of the original (before it is turned). */
  crop?: VideoCrop;
  rotate?: VideoTurn;
  /** Mirrored left to right, and upside down (as it shows, turned). */
  flipH?: boolean;
  flipV?: boolean;
  /** -1 to 1 (0 as it is). */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** Seconds at the start of the edited video coming in from black and silence, and at its end going back to them. */
  fadeIn?: number;
  fadeOut?: number;
  /** The video's own sound: how loud, 0 to 2 (1 as it is), or none at all. */
  volume?: number;
  mute?: boolean;
  music?: VideoMusic;
  texts?: VideoText[];
}

/** What an edit makes: a video (MP4 with H.264 and AAC, or WebM), a GIF, or a picture of one frame. */
export type VideoOut = 'mp4' | 'webm' | 'gif' | 'jpg' | 'png';

/**
 * Where the result goes: kept as a deck's video ("naget-video:<sha>", with its first frame as a kept picture), as a
 * deck's picture ("naget-asset:<sha>": a frame, a GIF), a Library item's file replaced or a new item beside it, a new
 * item in the Library (from a session's video: that session's), or a file written over (the old one to the Trash) or a
 * copy beside it.
 */
export type VideoSaveTo = { video: true } | { asset: true } | { media: string; as: 'replace' | 'copy' } | { library: true; session?: string } | { file: string; as: 'replace' | 'copy' };

/** POST /api/mediaedit/video. */
export interface VideoEditAsk {
  /** The video: "naget-video:<sha>", a Library item ("media:<id>" or its /api/media/<id>/file), or a file's path. */
  src: string;
  recipe: VideoRecipe;
  /** What to make (mp4 when left out). */
  format?: VideoOut;
  /** A picture of this moment instead, in seconds of the original (format jpg or png). */
  frame?: number;
  /** The edited picture's shorter side at most, in pixels (1080, 720, 480): a smaller, lighter file. */
  size?: number;
  to: VideoSaveTo;
  /** The editor's texts as it draws them: a PNG (a data: address) for each of the recipe's texts, in its order, at the edited picture's size. */
  drawn?: string[];
}

/** An edit being made, and then what it made (GET /api/mediaedit/video/:job). */
export interface VideoEditJob {
  job: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'stopped';
  /** How far it is, 0 to 1. */
  progress?: number;
  format: VideoOut;
  /** Done: a kept video or picture ("naget-video:…", "naget-asset:…"), and a video's first frame (a kept picture). */
  src?: string;
  poster?: string;
  /** Done: the Library item it went to, by id, or the file it was written to. */
  media?: string;
  path?: string;
  w?: number;
  h?: number;
  seconds?: number;
  bytes?: number;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

/** What the editor learns of a video before editing it (GET /api/mediaedit/video/info). */
export interface VideoFacts {
  /** ffmpeg is here (this computer's or the picture tools' own); without it, why, in words a person can act on. */
  ffmpeg: boolean;
  why?: string;
  duration?: number;
  /** As it shows (a phone's video turned upright). */
  width?: number;
  height?: number;
  audio?: boolean;
  fps?: number;
}

export const VIDEO_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** The shapes the editor crops to ('free': any). */
export const VIDEO_SHAPES = ['free', '16:9', '9:16', '1:1', '4:5'] as const;
export type VideoShape = (typeof VIDEO_SHAPES)[number];

/** The shortest part kept, in seconds (shorter ones are left out), and the most texts an edit carries. */
export const MIN_PART = 0.05;
export const MAX_TEXTS = 30;
/** The longest GIF made, in seconds of the edited video: longer ones are files too large to share. */
export const MAX_GIF_SECONDS = 60;

const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
/** Seconds to the thousandth. */
const ms = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** A colour as the recipe keeps it ("#rrggbb", "#rrggbbaa"), from "#rgb" too; undefined for anything else. */
export function hexColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  let s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX.test(s) ? s : undefined;
}

/** A shape's width over its height ("16:9" → 1.78); NaN for 'free' or anything else. */
export function shapeRatio(shape: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(shape.trim());
  return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : NaN;
}

/** The size of the picture `w`×`h` turned by `rotate`. */
export const turnedSize = (w: number, h: number, rotate?: VideoTurn) => (rotate === 90 || rotate === 270 ? { w: h, h: w } : { w, h });

/** The edited picture's size: its crop's (or the whole picture's), turned. */
export function editedSize(r: Pick<VideoRecipe, 'crop' | 'rotate'>, w: number, h: number): { w: number; h: number } {
  const c = r.crop ?? { x: 0, y: 0, w, h };
  return turnedSize(c.w, c.h, r.rotate);
}

type Turning = Pick<VideoRecipe, 'rotate' | 'flipH' | 'flipV'>;

/** A point of the original picture (`w`×`h`), where it shows once turned and mirrored. */
export function shownPoint(x: number, y: number, w: number, h: number, t: Turning): [number, number] {
  let [px, py] = t.rotate === 90 ? [h - y, x] : t.rotate === 180 ? [w - x, h - y] : t.rotate === 270 ? [y, w - x] : [x, y];
  const s = turnedSize(w, h, t.rotate);
  if (t.flipH) px = s.w - px;
  if (t.flipV) py = s.h - py;
  return [px, py];
}

/** A point as it shows (turned and mirrored), back in the original picture (`w`×`h`). */
export function originalPoint(px: number, py: number, w: number, h: number, t: Turning): [number, number] {
  const s = turnedSize(w, h, t.rotate);
  if (t.flipH) px = s.w - px;
  if (t.flipV) py = s.h - py;
  return t.rotate === 90 ? [py, h - px] : t.rotate === 180 ? [w - px, h - py] : t.rotate === 270 ? [w - py, px] : [px, py];
}

const box = (a: [number, number], b: [number, number]): VideoCrop => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });

/** A part of the original picture, where it shows once turned and mirrored. */
export const shownRect = (c: VideoCrop, w: number, h: number, t: Turning) => box(shownPoint(c.x, c.y, w, h, t), shownPoint(c.x + c.w, c.y + c.h, w, h, t));
/** A part of the picture as it shows, in the original's pixels. */
export const originalRect = (c: VideoCrop, w: number, h: number, t: Turning) => box(originalPoint(c.x, c.y, w, h, t), originalPoint(c.x + c.w, c.y + c.h, w, h, t));

/** The largest part of the picture in its middle that has this shape once turned ("9:16"), in the original's pixels; null for 'free'. */
export function cropToShape(shape: string, w: number, h: number, rotate?: VideoTurn): VideoCrop | null {
  const ratio = shapeRatio(shape);
  if (!Number.isFinite(ratio)) return null;
  // The shape as the original stands: turned sideways, it is the other way round.
  const want = rotate === 90 || rotate === 270 ? 1 / ratio : ratio;
  let cw = w;
  let ch = w / want;
  if (ch > h) [cw, ch] = [h * want, h];
  cw = Math.min(w, even(cw));
  ch = Math.min(h, even(ch));
  return { x: Math.floor((w - cw) / 4) * 2, y: Math.floor((h - ch) / 4) * 2, w: cw, h: ch };
}

/** The parts of the original kept, in order: the trim less the cuts, each at least MIN_PART long. */
export function keptParts(r: Pick<VideoRecipe, 'trim' | 'cuts'>, duration: number): [number, number][] {
  const [a, b] = r.trim ?? [0, duration];
  let parts: [number, number][] = [[Math.max(0, a), Math.min(duration, b)]];
  for (const [s, e] of r.cuts ?? []) parts = parts.flatMap(([x, y]): [number, number][] => (e <= x || s >= y ? [[x, y]] : [...(s > x ? [[x, s] as [number, number]] : []), ...(e < y ? [[e, y] as [number, number]] : [])]));
  return parts.filter(([x, y]) => y - x >= MIN_PART);
}

/** How long the edited video is, in seconds. */
export function editedLength(r: Pick<VideoRecipe, 'trim' | 'cuts' | 'speed'>, duration: number): number {
  return keptParts(r, duration).reduce((n, [x, y]) => n + y - x, 0) / (r.speed ?? 1);
}

/** A moment of the original, in the edited video's time (a moment cut out: where the next part kept begins). */
export function toEdited(t: number, parts: [number, number][], speed = 1): number {
  let had = 0;
  for (const [x, y] of parts) {
    if (t < x) return had / speed;
    if (t <= y) return (had + t - x) / speed;
    had += y - x;
  }
  return had / speed;
}

/** A moment of the edited video, in the original's time. */
export function toOriginal(e: number, parts: [number, number][], speed = 1): number {
  let left = Math.max(0, e * speed);
  for (const [x, y] of parts) {
    if (left <= y - x) return x + left;
    left -= y - x;
  }
  return parts.length ? parts[parts.length - 1][1] : 0;
}

/** Whether a moment of the original is kept (in the trim and in no cut). */
export const isKept = (t: number, parts: [number, number][]) => parts.some(([x, y]) => t >= x && t < y);

export interface VideoSize {
  duration: number;
  width: number;
  height: number;
}

/**
 * An edit as it can be made of this video: every value in its range, times inside the video, cuts in order and merged,
 * the crop inside the picture with even sides (as H.264 needs), and whatever changes nothing left out. Throws when
 * nothing of the video would be left.
 */
export function normalizeVideoRecipe(raw: unknown, v: VideoSize): VideoRecipe {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out: VideoRecipe = {};
  const d = v.duration;
  const pair = (p: unknown): [number, number] | null => {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const a = num(p[0], 0, d);
    const b = num(p[1], 0, d);
    return a === undefined || b === undefined || b - a < MIN_PART ? null : [ms(a), ms(b)];
  };
  const trim = pair(r.trim);
  if (trim && (trim[0] > 0.001 || trim[1] < d - 0.001)) out.trim = trim;
  const [a, b] = out.trim ?? [0, d];
  const cuts = (Array.isArray(r.cuts) ? r.cuts : [])
    .map(pair)
    .filter((c: [number, number] | null): c is [number, number] => !!c)
    .map(([s, e]: [number, number]) => [Math.max(s, a), Math.min(e, b)] as [number, number])
    .filter(([s, e]: [number, number]) => e - s >= MIN_PART / 2)
    .sort((x: [number, number], y: [number, number]) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c[0] <= last[1] + 0.001) last[1] = Math.max(last[1], c[1]);
    else merged.push([c[0], c[1]]);
  }
  if (merged.length) out.cuts = merged.slice(0, 200);
  if (!keptParts(out, d).length) throw new Error('Nothing of the video would be left: keep a part of it');
  const speed = num(r.speed, 0.25, 4);
  if (speed !== undefined && Math.abs(speed - 1) > 0.001) out.speed = r2(speed);
  const rot = Number(r.rotate);
  const turn = (((Math.round(rot / 90) * 90) % 360) + 360) % 360;
  if (Number.isFinite(rot) && turn) out.rotate = turn as VideoTurn;
  if (r.flipH === true) out.flipH = true;
  if (r.flipV === true) out.flipV = true;
  if (r.crop && typeof r.crop === 'object' && v.width >= 16 && v.height >= 16) {
    // Its size as asked (even, as H.264 needs), moved inside the picture where it reaches past an edge.
    const w = Math.min(even(v.width), even(num(r.crop.w, 16, v.width) ?? v.width));
    const h = Math.min(even(v.height), even(num(r.crop.h, 16, v.height) ?? v.height));
    const x = Math.max(0, Math.min(v.width - w, Math.round(num(r.crop.x, 0, v.width) ?? 0)));
    const y = Math.max(0, Math.min(v.height - h, Math.round(num(r.crop.y, 0, v.height) ?? 0)));
    if (x > 0 || y > 0 || w < even(v.width) || h < even(v.height)) out.crop = { x, y, w, h };
  }
  for (const k of ['brightness', 'contrast', 'saturation'] as const) {
    const n = num(r[k], -1, 1);
    if (n !== undefined && Math.abs(n) >= 0.005) out[k] = r2(n);
  }
  const length = editedLength(out, d);
  for (const k of ['fadeIn', 'fadeOut'] as const) {
    // To the hundredth, rounded down: never longer than half of it.
    const n = num(r[k], 0, Math.min(10, length / 2));
    if (n !== undefined && n >= 0.05) out[k] = Math.floor(n * 100) / 100;
  }
  if (r.mute === true) out.mute = true;
  const vol = num(r.volume, 0, 2);
  if (!out.mute && vol !== undefined && Math.abs(vol - 1) > 0.005) out.volume = r2(vol);
  if (r.music && typeof r.music === 'object' && typeof r.music.src === 'string' && r.music.src.trim()) {
    const m: VideoMusic = { src: r.music.src.trim().slice(0, 4096) };
    if (typeof r.music.name === 'string' && r.music.name.trim()) m.name = r.music.name.trim().slice(0, 200);
    const mv = num(r.music.volume, 0, 2);
    if (mv !== undefined && Math.abs(mv - 1) > 0.005) m.volume = r2(mv);
    const st = num(r.music.start, 0, Math.max(0, length - MIN_PART));
    if (st !== undefined && st >= 0.01) m.start = ms(st);
    out.music = m;
  }
  const texts: VideoText[] = [];
  for (const t of Array.isArray(r.texts) ? r.texts : []) {
    if (!t || typeof t !== 'object' || typeof t.text !== 'string') continue;
    const text = t.text
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 300);
    if (!text) continue;
    const from = num(t.from, 0, d) ?? 0;
    const to = num(t.to, 0, d) ?? d;
    if (to - from < MIN_PART) continue;
    const bg = hexColor(t.background);
    texts.push({
      text,
      from: ms(from),
      to: ms(to),
      x: Math.round((num(t.x, 0, 1) ?? 0.5) * 1000) / 1000,
      y: Math.round((num(t.y, 0, 1) ?? 0.85) * 1000) / 1000,
      size: Math.round((num(t.size, 0.02, 0.3) ?? 0.07) * 1000) / 1000,
      color: hexColor(t.color)?.slice(0, 7) ?? '#ffffff',
      ...(bg ? { background: bg } : {}),
      ...(t.bold === true ? { bold: true } : {}),
    });
    if (texts.length >= MAX_TEXTS) break;
  }
  if (texts.length) out.texts = texts;
  return out;
}

/** Whether an edit changes anything at all. */
export const changesVideo = (r: VideoRecipe) => Object.keys(r).length > 0;

/** "1:05.3" for 65.3 seconds; tenths only under ten minutes. */
export function videoClock(s: number): string {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return m >= 10 ? `${m}:${String(Math.floor(sec)).padStart(2, '0')}` : `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}
