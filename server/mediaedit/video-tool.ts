// edit_video: an agent's edits of videos (files of its session, or a deck's naget-video:…), made on this computer with
// ffmpeg as the video editor makes them (video.ts): one video trimmed, cut, sped up, cropped (a box, or a shape such as
// 9:16), turned and mirrored; or several clips (videos and pictures, each with its own trim, speed, sound and a slow
// zoom and pan for a picture) joined by transitions in an output of one shape; colour (exposure, white balance,
// contrast, saturation, highlights, shadows, vibrance, a look) and effects (vignette, sharpen, denoise, grain); fades;
// overlays (a logo, a watermark, a video in a corner, a green screen keyed out); titles and captions, or captions made
// from what is said (with an .srt beside the video); music and a voice-over, with the voices cleaned up, the music
// lowered under speech and the loudness evened out; or a GIF of it, or one frame as a picture. The file goes in the
// session's folder (videos/, or images/ for a GIF or a frame), listed as generate_video and generate_image list theirs,
// so the conversation shows it the same way. It is made on the graphics card when there is one that works. It waits up
// to about nine minutes, then hands back the job to wait for again.
import fs from 'node:fs';
import path from 'node:path';
import {
  CAPTION_STYLES,
  clipSpans,
  cropToShape,
  keptParts,
  MAX_TEXTS,
  motionPreset,
  shownRect,
  videoClock,
  VIDEO_OUT_SHAPES,
  VIDEO_TRANSITIONS,
  captionsSrt,
  type VideoClip,
  type VideoMotionId,
  type VideoOut,
  type VideoRecipe,
  type VideoText,
  type VideoTurn,
} from '../../shared/mediaedit-video.ts';
import { VIDEO_LOOKS } from '../../shared/video-grade.ts';
import type { RunTool } from '../features/types.ts';
import { captionsOf, factsOf, prepare, sourceOf, startVideoEdit, videoJob, waitForJob, type Prepared } from './video.ts';

/** How long one call waits: under Codex's ten minutes for a tool call. */
const WAIT_MS = 540_000;

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const pairOf = (v: unknown): [number, number] | undefined => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(Number(x))) ? [Number(v[0]), Number(v[1])] : undefined);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});

/** What each job of an agent's did, in a few words, for its answer, and an .srt to write beside it (kept two hours). */
const done = new Map<string, { said: string; srt?: string }>();

/** What was done, in a few words ("3 clips joined by cross dissolves, 9:16, colour, 12 captions"). */
function summary(r: VideoRecipe, a: Record<string, any>): string {
  const bits: string[] = [];
  const clips = r.clips ?? [];
  if (Array.isArray(a.clips) && a.clips.length) {
    const kinds = [...new Set(clips.map((c) => c.transition?.kind).filter(Boolean))];
    bits.push(`${clips.length} clip${clips.length === 1 ? '' : 's'}${kinds.length ? ` joined by ${kinds.map((k) => VIDEO_TRANSITIONS.find((t) => t.id === k)?.label.toLowerCase()).join(' and ')}` : ''}`);
  } else {
    const c = clips[0];
    if (pairOf(a.trim)) bits.push(`kept ${videoClock(pairOf(a.trim)![0])} to ${videoClock(pairOf(a.trim)![1])}`);
    if (clips.length > 1) bits.push(`${clips.length - 1} part${clips.length === 2 ? '' : 's'} cut`);
    if (typeof a.aspect === 'string' && a.aspect) bits.push(`cropped to ${a.aspect}`);
    else if (c?.crop) bits.push(`cropped to ${c.crop.w}×${c.crop.h}`);
    if (c?.rotate) bits.push(`turned ${c.rotate}°`);
    if (c?.flipH || c?.flipV) bits.push('mirrored');
    if (c?.speed) bits.push(`${c.speed}× speed`);
  }
  if (r.shape) bits.push(r.shape);
  if (clips.some((c) => c.grade)) bits.push('colour changed');
  if (r.fadeIn || r.fadeOut) bits.push('faded');
  if (clips[0]?.mute && clips.every((c) => c.mute)) bits.push('no sound');
  if (r.overlays?.length) bits.push(`${r.overlays.length} overlay${r.overlays.length === 1 ? '' : 's'}`);
  if (r.audio?.some((m) => m.track === 'music')) bits.push('music under it');
  if (r.audio?.some((m) => m.track === 'voice')) bits.push('a voice-over');
  const caps = (r.texts ?? []).filter((t) => t.caption).length;
  if (caps) bits.push(`${caps} caption${caps === 1 ? '' : 's'}`);
  const words = (r.texts ?? []).length - caps;
  if (words) bits.push(`${words} text${words === 1 ? '' : 's'} over it`);
  if (r.fixes?.voice) bits.push('voices cleaned up');
  if (r.fixes?.duck) bits.push('music lowered under speech');
  if (r.fixes?.loudness) bits.push(`loudness evened out (${r.fixes.loudness === 'web' ? 'for the web' : 'for broadcast'})`);
  return bits.join(', ');
}

/** The answer for a job that ended: its file (listed as the conversation's cards read them), or why there is none. */
function answer(id: string): string | { isError: true; text: string } {
  const v = videoJob(id);
  if (!v) return { isError: true, text: `No such edit (job ${id}): it ended over an hour ago, or the app started again since. Call edit_video again.` };
  if (v.status === 'failed') return { isError: true, text: `The video was not edited: ${v.error ?? 'ffmpeg failed'}` };
  if (v.status === 'stopped') return { isError: true, text: 'The edit was stopped before it was done: nothing was saved.' };
  if (v.status !== 'done' || !v.path) {
    const pct = v.progress ? `, ${Math.round(v.progress * 100)}% done` : '';
    return `The video is still being edited (job ${id}${pct}); the app keeps at it. Call edit_video with job: "${id}" to wait for it again; the user sees it once you do.`;
  }
  const picture = v.format === 'jpg' || v.format === 'png' || v.format === 'gif';
  const bits = [v.w && v.h ? `${v.w}×${v.h}` : '', v.format !== 'jpg' && v.format !== 'png' && v.seconds ? `${v.seconds} s` : '', v.bytes ? size(v.bytes) : ''].filter(Boolean).join(', ');
  const d = done.get(id);
  let srt = '';
  if (d?.srt && !picture) {
    const file = v.path.replace(/\.[^.]+$/, '.srt');
    try {
      if (!fs.existsSync(file)) fs.writeFileSync(file, d.srt);
      srt = `The captions are also beside it as ${path.basename(file)}.`;
    } catch {}
  }
  const how = v.made?.gpu ? `Made on the graphics card (${v.made.by}).` : v.note ? `${v.note}.` : '';
  return [
    `${v.format === 'gif' ? 'Made a GIF of the video' : picture ? 'Took a frame of the video as a picture' : 'Edited the video'}${d?.said ? ` (${d.said})` : ''}:`,
    `${v.path} (${bits})`,
    ...(srt || how ? [[srt, how].filter(Boolean).join(' ')] : []),
    picture
      ? 'The user sees it in your reply, a tap away from full size and from keeping it in their Library: don’t repeat it or its path. To look at it yourself, open the file. In a deck, a document or a page it goes as a picture: its path as an image part’s src in save_slides, a picture in save_doc, an img in save_page.'
      : 'The user sees it in your reply, where they can play it, download it and keep it in their Library: don’t repeat it or its path. You cannot watch it: to check how it looks, take a frame of it (edit_video, frame: a moment) and open that. In a deck, give this file as a video part’s src in save_slides.',
  ].join('\n');
}

const COLOR_KEYS = ['exposure', 'temperature', 'tint', 'contrast', 'brightness', 'saturation', 'highlights', 'shadows', 'vibrance', 'vignette', 'sharpen', 'denoise', 'grain'] as const;

/** A grade from an agent's colour words (and the first edit's brightness, contrast and saturation). */
function gradeOf(c: Record<string, any>, legacy: Record<string, any> = {}): Record<string, unknown> | undefined {
  const g: Record<string, unknown> = {};
  for (const k of COLOR_KEYS) if (num(c[k]) !== undefined) g[k] = num(c[k]);
  for (const k of ['brightness', 'contrast', 'saturation'] as const) if (g[k] === undefined && num(legacy[k]) !== undefined) g[k] = num(legacy[k]);
  if (typeof c.look === 'string') {
    g.look = c.look;
    if (num(c.look_strength) !== undefined) g.lookStrength = num(c.look_strength);
  }
  return Object.keys(g).length ? g : undefined;
}

const COLOR_SCHEMA = {
  type: 'object',
  description: 'Colour, as a colourist sets it (each -1 to 1, 0 as it is; the effects 0 to 1).',
  properties: {
    exposure: { type: 'number', description: '-1 two stops darker, 1 two stops brighter.' },
    temperature: { type: 'number', description: '-1 cooler (bluer), 1 warmer (more orange).' },
    tint: { type: 'number', description: '-1 greener, 1 more magenta.' },
    contrast: { type: 'number' },
    saturation: { type: 'number', description: '-1 black and white, 1 twice as colourful.' },
    highlights: { type: 'number' },
    shadows: { type: 'number' },
    vibrance: { type: 'number', description: 'More colour where there is little; skin stays as it is.' },
    look: { type: 'string', enum: VIDEO_LOOKS.map((l) => l.id), description: 'A ready-made look: cinematic (teal and orange), warm, cool, bw (black and white), vintage, bleach (bleach bypass), faded (faded film), vivid, noir, golden (golden hour), matte, night (day for night).' },
    look_strength: { type: 'number', minimum: 0, maximum: 1, description: 'How much of the look (1 all of it).' },
    vignette: { type: 'number', minimum: 0, maximum: 1, description: 'Darker corners.' },
    sharpen: { type: 'number', minimum: 0, maximum: 1 },
    denoise: { type: 'number', minimum: 0, maximum: 1, description: 'Less grain and noise (a dark, noisy phone video).' },
    grain: { type: 'number', minimum: 0, maximum: 1, description: 'Film grain.' },
  },
};

export function editVideoTool(): RunTool {
  return {
    name: 'edit_video',
    annotations: { readOnlyHint: false, openWorldHint: false },
    description: [
      'Edit videos on this computer with ffmpeg: free, and nothing leaves the computer (made on the graphics card when there is one). Use it for a video the user gave or one you made (generate_video), for a deck, a document, a page or to share.',
      'One video (path): keep a part (trim), take parts out (cuts), play it faster or slower (speed, the sound kept in tune), crop it (crop, or aspect for a shape such as 9:16 cut from its middle), turn it, mirror it.',
      'Several clips (clips): videos and pictures one after another, each with its own trim, speed, sound, and for a picture its seconds and a slow zoom and pan; joined by cuts or transitions (cross dissolve, fade through black or white, wipes, slides, circle, zoom), in an output of one shape (shape: 16:9, 9:16, 1:1, 4:5), each clip fitted or filling it.',
      'And: colour (exposure, white balance, contrast, saturation, highlights, shadows, vibrance, a look such as cinematic or black and white; vignette, sharpen, denoise, grain), fades in and out, overlays (a logo or watermark, a video in a corner, a green screen keyed out), titles and captions, captions made from what is said (captions: true, needs speech recognition on this computer; an .srt is saved beside it), music and a voice-over (a sound file each, such as generate_audio made), the voices cleaned up, the music lowered under speech, the loudness evened out; H.264, H.265 or AV1, frames a second and quality.',
      'format: gif makes a GIF (at most a minute, small); frame takes one moment as a picture instead (JPEG, or format: png).',
      'trim and cuts are seconds of the source; texts’ from and to, overlays’ and sounds’ start, music_start and frame are seconds of the edited video.',
      'The file is saved in the session’s folder (videos/, or images/ for a GIF or a frame) and shown to the user in your reply. It takes about as long as the video plays, or less; it waits up to about nine minutes, then gives you a job id to wait for it again (job).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The video: a file of the session (MP4, MOV or WebM), or a deck’s video (naget-video:…). With clips, the first clip’s is used when this is left out.' },
        trim: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'One video: the part to keep, [start, end] in seconds of it.' },
        cuts: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, description: 'One video: parts to take out, [[start, end], …] in seconds of it.' },
        crop: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
          required: ['x', 'y', 'w', 'h'],
          description: 'One video: the part of the picture to keep, in pixels of the original (before turning).',
        },
        aspect: { type: 'string', description: 'One video: a shape to crop to from the middle, as it shows once turned: "16:9", "9:16", "1:1", "4:5".' },
        rotate: { type: 'integer', enum: [90, 180, 270], description: 'One video: turn it clockwise, in degrees.' },
        flip: { type: 'string', enum: ['horizontal', 'vertical', 'both'], description: 'One video: mirror it left to right (horizontal), upside down (vertical), or both.' },
        speed: { type: 'number', minimum: 0.25, maximum: 4, description: 'One video: how fast it plays: 0.5 half speed, 2 twice as fast.' },
        clips: {
          type: 'array',
          maxItems: 100,
          description: 'Several clips, in order: videos and pictures.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'A video (MP4, MOV, WebM) or a picture (PNG, JPEG, WebP) of the session, or naget-video:… / naget-asset:….' },
              trim: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'A video: the part kept, [start, end] in seconds of it.' },
              seconds: { type: 'number', minimum: 0.2, maximum: 600, description: 'A picture: how long it shows (4 when left out).' },
              zoom: { type: 'string', enum: ['in', 'out', 'left', 'right', 'up', 'down', 'none'], description: 'A picture: a slow zoom or pan over it.' },
              fit: { type: 'string', enum: ['fit', 'fill'], description: 'In the output’s shape: fitted inside (bars where shapes differ), or filling it (edges cut off).' },
              speed: { type: 'number', minimum: 0.25, maximum: 4 },
              keep_pitch: { type: 'boolean', description: 'false: its sound’s pitch goes up and down with the speed (true when left out).' },
              reverse: { type: 'boolean', description: 'Play it backwards (at most about 13 seconds at 1080p).' },
              stabilize: { type: 'boolean', description: 'Steady a shaky video.' },
              volume: { type: 'number', minimum: 0, maximum: 2 },
              mute: { type: 'boolean' },
              sound: { type: 'string', description: 'A sound file to use in place of its own sound, with the same timing.' },
              color: COLOR_SCHEMA,
              transition: {
                type: 'object',
                properties: { kind: { type: 'string', enum: VIDEO_TRANSITIONS.map((t) => t.id) }, seconds: { type: 'number', minimum: 0.1, maximum: 5 } },
                required: ['kind'],
                description: 'How it goes into the next clip (a cut when left out).',
              },
            },
            required: ['path'],
          },
        },
        transition: {
          type: 'object',
          properties: { kind: { type: 'string', enum: VIDEO_TRANSITIONS.map((t) => t.id) }, seconds: { type: 'number', minimum: 0.1, maximum: 5 } },
          required: ['kind'],
          description: 'Clips: the transition between every two clips that has none of its own (dissolve: cross dissolve; black, white: fade through them).',
        },
        shape: { type: 'string', enum: VIDEO_OUT_SHAPES, description: 'The output’s shape (the first clip’s when left out); each clip fitted or filling it.' },
        fit: { type: 'string', enum: ['fit', 'fill'], description: 'How every clip sits in the shape, unless it says otherwise.' },
        color: COLOR_SCHEMA,
        brightness: { type: 'number', minimum: -1, maximum: 1, description: '-1 darker to 1 brighter (0 as it is).' },
        contrast: { type: 'number', minimum: -1, maximum: 1, description: '-1 flatter to 1 punchier.' },
        saturation: { type: 'number', minimum: -1, maximum: 1, description: '-1 black and white to 1 more colourful.' },
        fade_in: { type: 'number', minimum: 0, maximum: 10, description: 'Seconds at the start coming in from black and silence.' },
        fade_out: { type: 'number', minimum: 0, maximum: 10, description: 'Seconds at the end going out to black and silence.' },
        mute: { type: 'boolean', description: 'Take the clips’ own sound out (music, if given, stays).' },
        volume: { type: 'number', minimum: 0, maximum: 2, description: 'The clips’ own sound: 0.5 half as loud, 2 twice.' },
        overlays: {
          type: 'array',
          maxItems: 20,
          description: 'Pictures or videos over it: a logo, a watermark, a video in a corner, a green screen.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'A picture (a PNG with see-through parts suits a logo) or a video.' },
              start: { type: 'number', description: 'When it shows, in seconds of the edited video (0 when left out).' },
              seconds: { type: 'number', description: 'A picture: for how long (to the end when left out).' },
              x: { type: 'number', description: 'Where its middle is across, a share of the width (0.5 the middle; 0.88 near the right).' },
              y: { type: 'number', description: 'And down (0.12 near the top).' },
              width: { type: 'number', description: 'Its width, a share of the video’s (0.15 a small logo).' },
              opacity: { type: 'number', minimum: 0, maximum: 1 },
              key_color: { type: 'string', description: 'A colour to take out (a green screen: "#00ff00"; blue: "#0000ff").' },
              similarity: { type: 'number', minimum: 0.01, maximum: 0.8, description: 'How near a colour must be to the key to go (0.3 when left out).' },
              fade_in: { type: 'number' },
              fade_out: { type: 'number' },
            },
            required: ['path'],
          },
        },
        texts: {
          type: 'array',
          maxItems: MAX_TEXTS,
          description: 'Titles and captions over it.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'The words (a new line with \\n).' },
              from: { type: 'number', description: 'When it shows, in seconds of the edited video (default: the start).' },
              to: { type: 'number', description: 'When it goes (default: the end).' },
              x: { type: 'number', minimum: 0, maximum: 1, description: 'Where its middle is across, a share of the width (0.5 the middle).' },
              y: { type: 'number', minimum: 0, maximum: 1, description: 'And down, a share of the height (0.5 the middle, 0.85 a caption near the bottom; the default).' },
              size: { type: 'number', minimum: 0.02, maximum: 0.3, description: 'Its letters’ height, a share of the picture’s height (0.07 a caption, the default; 0.12 a title).' },
              color: { type: 'string', description: 'Its colour, "#ffffff" (the default).' },
              background: { type: 'string', description: 'A box behind it: "#000000", or "#000000a0" to see through it a little.' },
              outline: { type: 'string', description: 'An edge around its letters: "#000000".' },
              bold: { type: 'boolean' },
            },
            required: ['text'],
          },
        },
        captions: { type: 'boolean', description: 'Make captions from what is said (speech recognition on this computer: Settings → Voice); an .srt file is saved beside the video too.' },
        caption_style: { type: 'string', enum: CAPTION_STYLES.map((s) => s.id), description: 'classic (white on a dark box, the default), bold (yellow), outline (white with a black edge), big (in the middle), light (dark on light).' },
        language: { type: 'string', description: 'The language spoken, for captions ("en", "de"; told by ear when left out).' },
        music: { type: 'string', description: 'A sound file to put under it (MP3, WAV, M4A, OGG, FLAC…), such as one generate_audio made.' },
        music_volume: { type: 'number', minimum: 0, maximum: 2, description: 'How loud the music is (1 as it is).' },
        music_start: { type: 'number', minimum: 0, description: 'When the music starts, in seconds of the edited video.' },
        music_fade: { type: 'number', minimum: 0, maximum: 10, description: 'Seconds the music fades in at its start and out at its end.' },
        voiceover: { type: 'string', description: 'A voice-over (a sound file), on a track of its own.' },
        voiceover_start: { type: 'number', minimum: 0, description: 'When the voice-over starts, in seconds of the edited video.' },
        voice_cleanup: { type: 'number', minimum: 0, maximum: 1, description: 'Clean up the voices (the clips’ own sound and the voice-over): noise and rumble taken out; 0.5 a good start.' },
        duck_music: { type: 'number', minimum: 0, maximum: 1, description: 'Lower the music while someone speaks (0.6 a good start).' },
        loudness: { type: 'string', enum: ['web', 'broadcast'], description: 'Even out the loudness: for the web and phones (-14 LUFS), or for broadcast (-23).' },
        format: { type: 'string', enum: ['mp4', 'mov', 'webm', 'gif', 'jpg', 'png'], description: 'mp4 (the default), mov, webm, gif; jpg or png with frame.' },
        codec: { type: 'string', enum: ['h264', 'h265', 'av1'], description: 'MP4’s codec: h264 plays everywhere (the default); h265 and av1 make smaller files, not every player plays them.' },
        fps: { type: 'number', enum: [24, 25, 30, 50, 60], description: 'Frames a second (the first video’s own when left out).' },
        quality: { type: 'string', enum: ['small', 'standard', 'high'], description: 'A smaller file, standard, or high quality.' },
        processor_only: { type: 'boolean', description: 'Make it on the processor even when a graphics card could.' },
        frame: { type: 'number', minimum: 0, description: 'Take this moment as a picture instead, in seconds of the edited video.' },
        size: { type: 'integer', minimum: 120, description: 'Its shorter side at most this many pixels (2160, 1080, 720, 480).' },
        name: { type: 'string', description: 'A short file name, without extension (default: the video’s, and “edited”).' },
        job: { type: 'string', description: 'A job id an earlier call gave while it was still being edited: waits for it instead.' },
      },
    },
    async run(a, ctx) {
      const until = Date.now() + WAIT_MS;
      if (typeof a.job === 'string' && a.job.trim()) {
        const id = a.job.trim();
        if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('job: the id an earlier call gave.');
        if (!videoJob(id)) return answer(id);
        await waitForJob(id, until - Date.now(), ctx.signal);
        return answer(id);
      }
      const many = Array.isArray(a.clips) && a.clips.length > 0;
      const main = typeof a.path === 'string' && a.path.trim() ? a.path.trim() : many ? String(obj(a.clips[0]).path ?? '') : '';
      if (!main) throw new Error('path: the video to edit (or clips).');
      try {
        const db = ctx.deps.db;
        const r: Record<string, any> = {};
        const grade = gradeOf(obj(a.color), a);
        const defaultFit = a.fit === 'fill' ? 'fill' : undefined;
        let first: string;
        if (many) {
          const named = a.clips.slice(0, 100).map(obj);
          if (named.some((c: Record<string, any>) => typeof c.path !== 'string' || !c.path.trim())) return { isError: true, text: 'clips: each needs its path (a video or a picture).' };
          first = named[0].path.trim();
          const t0 = obj(a.transition);
          r.clips = await Promise.all(
            named.map(async (c: Record<string, any>, i: number) => {
              const src = await sourceOf(db, c.path, { cwd: ctx.cwd, kinds: ['video', 'picture'] });
              const t = obj(c.transition).kind ? obj(c.transition) : t0;
              const clip: Record<string, any> = {
                src: c.path.trim(),
                ...(pairOf(c.trim) ? { trim: pairOf(c.trim) } : {}),
                ...(num(c.speed) !== undefined ? { speed: num(c.speed) } : {}),
                ...(c.keep_pitch === false ? { keepPitch: false } : {}),
                ...(c.reverse === true ? { reverse: true } : {}),
                ...(c.stabilize === true ? { stabilize: true } : {}),
                ...(num(c.volume) !== undefined ? { volume: num(c.volume) } : num(a.volume) !== undefined ? { volume: num(a.volume) } : {}),
                ...(c.mute === true || a.mute === true ? { mute: true } : {}),
                ...(typeof c.sound === 'string' && c.sound.trim() ? { sound: c.sound.trim() } : {}),
                ...((c.fit === 'fill' || (c.fit !== 'fit' && defaultFit)) ? { fit: 'fill' } : {}),
                ...(gradeOf(obj(c.color)) ?? grade ? { grade: gradeOf(obj(c.color)) ?? grade } : {}),
                ...(t.kind && i < named.length - 1 ? { transition: { kind: t.kind, length: num(t.seconds) ?? 1 } } : {}),
              };
              if (src.kind === 'picture') {
                clip.length = num(c.seconds) ?? 4;
                const m = typeof c.zoom === 'string' ? motionPreset(c.zoom as VideoMotionId) : undefined;
                if (m) clip.motion = m;
              }
              return clip;
            }),
          );
        } else {
          // One video: the parts it keeps, each a clip with what was done to the whole.
          first = main;
          const source = await sourceOf(db, main, { cwd: ctx.cwd });
          const facts = await factsOf(source.file);
          const parts = keptParts({ trim: pairOf(a.trim), cuts: Array.isArray(a.cuts) ? a.cuts.map(pairOf).filter((x: unknown): x is [number, number] => !!x) : [] }, facts.duration);
          if (!parts.length) return { isError: true, text: `Nothing of the video would be left: keep a part of it (trim and cuts are seconds of the original, which is ${Math.round(facts.duration * 10) / 10} s long).` };
          const turn = ((((Math.round((num(a.rotate) ?? 0) / 90) * 90) % 360) + 360) % 360) as VideoTurn;
          const look: Partial<VideoClip> = {};
          if (turn) look.rotate = turn;
          if (a.flip === 'horizontal' || a.flip === 'both') look.flipH = true;
          if (a.flip === 'vertical' || a.flip === 'both') look.flipV = true;
          // An agent's crop is in the video as it was given: the recipe's is in the upright frame (turned, mirrored).
          if (a.crop && typeof a.crop === 'object' && [a.crop.x, a.crop.y, a.crop.w, a.crop.h].every((x) => Number.isFinite(Number(x)))) look.crop = shownRect({ x: Number(a.crop.x), y: Number(a.crop.y), w: Number(a.crop.w), h: Number(a.crop.h) }, facts.width, facts.height, look);
          else if (typeof a.aspect === 'string' && a.aspect.trim()) {
            const c = cropToShape(a.aspect, facts.width, facts.height, turn);
            if (!c) return { isError: true, text: `aspect: a shape such as "16:9", "9:16", "1:1" or "4:5", not "${a.aspect}".` };
            look.crop = c;
          }
          r.clips = parts.map((p) => ({
            ...(p[0] > 0.001 || p[1] < facts.duration - 0.001 ? { trim: p } : {}),
            ...(num(a.speed) !== undefined ? { speed: num(a.speed) } : {}),
            ...look,
            ...(a.mute === true ? { mute: true } : num(a.volume) !== undefined ? { volume: num(a.volume) } : {}),
            ...(grade ? { grade } : {}),
            ...(defaultFit ? { fit: 'fill' } : {}),
          }));
        }
        if (typeof a.shape === 'string') r.shape = a.shape;
        if (num(a.fade_in) !== undefined) r.fadeIn = num(a.fade_in);
        if (num(a.fade_out) !== undefined) r.fadeOut = num(a.fade_out);
        if (Array.isArray(a.overlays))
          r.overlays = a.overlays.slice(0, 20).map((x: unknown) => {
            const o = obj(x);
            return {
              src: String(o.path ?? ''),
              start: num(o.start) ?? 0,
              ...(num(o.seconds) !== undefined ? { length: num(o.seconds) } : { length: 3600 }),
              x: num(o.x) ?? 0.5,
              y: num(o.y) ?? 0.5,
              w: num(o.width) ?? 0.3,
              ...(num(o.opacity) !== undefined ? { opacity: num(o.opacity) } : {}),
              ...(typeof o.key_color === 'string' ? { key: { color: o.key_color, similarity: num(o.similarity) ?? 0.3, blend: 0.1 } } : {}),
              ...(num(o.fade_in) !== undefined ? { fadeIn: num(o.fade_in) } : {}),
              ...(num(o.fade_out) !== undefined ? { fadeOut: num(o.fade_out) } : {}),
            };
          });
        const audio: Record<string, unknown>[] = [];
        const fade = num(a.music_fade);
        if (typeof a.music === 'string' && a.music.trim())
          audio.push({ src: a.music.trim(), track: 'music', start: num(a.music_start) ?? 0, ...(num(a.music_volume) !== undefined ? { volume: num(a.music_volume) } : {}), ...(fade ? { fadeIn: fade, fadeOut: fade } : {}) });
        if (typeof a.voiceover === 'string' && a.voiceover.trim()) audio.push({ src: a.voiceover.trim(), track: 'voice', start: num(a.voiceover_start) ?? 0 });
        if (audio.length) r.audio = audio;
        r.fixes = { voice: num(a.voice_cleanup), duck: num(a.duck_music), loudness: a.loudness };
        const texts: Partial<VideoText>[] = Array.isArray(a.texts) ? a.texts.slice(0, MAX_TEXTS).map((t: Record<string, any>) => ({ ...obj(t), text: String(t?.text ?? '') })) : [];
        r.texts = texts;
        const frame = num(a.frame);
        const format: VideoOut = ['mp4', 'mov', 'webm', 'gif', 'jpg', 'png'].includes(a.format) ? a.format : frame !== undefined ? 'jpg' : 'mp4';
        const picture = format === 'jpg' || format === 'png';
        if (picture && frame === undefined) return { isError: true, text: 'frame: the moment to take as a picture, in seconds of the edited video.' };
        const folder = path.join(ctx.cwd, picture || format === 'gif' ? 'images' : 'videos');
        const stem = (await sourceOf(db, first, { cwd: ctx.cwd, kinds: ['video', 'picture'] }).then((s) => s.name).catch(() => 'video')) || 'video';
        const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : picture ? `${stem} frame` : `${stem} edited`;
        const ask = {
          src: main,
          recipe: r as VideoRecipe,
          format,
          ...(picture ? { frame } : {}),
          ...(num(a.size) ? { size: num(a.size) } : {}),
          ...(num(a.fps) ? { fps: num(a.fps) } : {}),
          ...(a.codec === 'h265' || a.codec === 'av1' ? { codec: a.codec } : {}),
          ...(a.quality === 'small' || a.quality === 'high' ? { quality: a.quality } : {}),
          ...(a.processor_only === true ? { encoder: 'cpu' as const } : {}),
        };
        let prep: Prepared = await prepare(ctx.deps, { ...ask, src: many && !a.path ? (r.clips[0].src as string) : main }, { cwd: ctx.cwd, to: { into: folder, name } });
        let srt: string | undefined;
        if (a.captions === true && !picture && format !== 'gif') {
          const said = await captionsOf(await prepare(ctx.deps, { ...ask, src: prep.source.path ?? prep.source.kept ?? main }, { cwd: ctx.cwd, forCaptions: true }), typeof a.language === 'string' ? a.language : '', ctx.signal);
          if (!said.length) return { isError: true, text: 'No speech was heard in it, so there are no captions to make. Leave captions out, or give texts yourself.' };
          const style = CAPTION_STYLES.find((s) => s.id === a.caption_style)?.set ?? CAPTION_STYLES[0].set;
          const caps = said.map((s) => ({ text: s.text, from: s.from, to: s.to, x: 0.5, ...style, caption: true }));
          r.texts = [...texts, ...caps];
          srt = captionsSrt(said);
          prep = await prepare(ctx.deps, { ...ask, src: prep.source.path ?? prep.source.kept ?? main, recipe: r as VideoRecipe }, { cwd: ctx.cwd, to: { into: folder, name } });
        }
        const job = startVideoEdit(prep);
        const said = [picture ? `at ${videoClock(frame!)}` : '', summary(prep.recipe, a)].filter(Boolean).join(', ');
        done.set(job.job, { said, ...(srt ? { srt } : {}) });
        setTimeout(() => done.delete(job.job), 2 * 3600_000).unref?.();
        await waitForJob(job.job, until - Date.now(), ctx.signal);
        return answer(job.job);
      } catch (e) {
        return { isError: true, text: String((e as Error).message ?? e) };
      }
    },
  };
}

/** The timeline's length of an edit an agent asked for (tests). */
export const editedSeconds = (p: Prepared) => clipSpans(p.recipe.clips ?? [], p.factsOf).length;
