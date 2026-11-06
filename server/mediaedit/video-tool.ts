// edit_video: an agent's quick edits to a video (a file of its session, or a deck's naget-video:…), made on this
// computer with ffmpeg as the video editor makes them (video.ts): the part kept and parts cut, its speed, a crop (a box,
// or a shape such as 9:16), a turn and a mirror, colour, fades, its sound and music under it, titles and captions; or a
// GIF of it, or one frame as a picture. The file goes in the session's folder (videos/, or images/ for a GIF or a frame),
// listed as generate_video and generate_image list theirs, so the conversation shows it the same way. It waits up to
// about nine minutes, then hands back the job to wait for again.
import path from 'node:path';
import { cropToShape, editedLength, keptParts, MAX_TEXTS, toOriginal, videoClock, type VideoOut, type VideoRecipe } from '../../shared/mediaedit-video.ts';
import type { RunTool } from '../features/types.ts';
import { prepare, startVideoEdit, videoJob, waitForJob, factsOf, sourceOf } from './video.ts';

/** How long one call waits: under Codex's ten minutes for a tool call. */
const WAIT_MS = 540_000;

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const pairOf = (v: unknown): [number, number] | undefined => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(Number(x))) ? [Number(v[0]), Number(v[1])] : undefined);

/** What each job of an agent's did, in a few words, for its answer (kept two hours). */
const done = new Map<string, string>();

/** What was done, in a few words ("kept 2–10 s, 2 parts cut, 9:16, twice as fast"). */
function summary(r: VideoRecipe, a: Record<string, any>): string {
  const bits: string[] = [];
  if (r.trim) bits.push(`kept ${videoClock(r.trim[0])} to ${videoClock(r.trim[1])}`);
  if (r.cuts?.length) bits.push(`${r.cuts.length} part${r.cuts.length === 1 ? '' : 's'} cut`);
  if (typeof a.aspect === 'string' && a.aspect) bits.push(`cropped to ${a.aspect}`);
  else if (r.crop) bits.push(`cropped to ${r.crop.w}×${r.crop.h}`);
  if (r.rotate) bits.push(`turned ${r.rotate}°`);
  if (r.flipH || r.flipV) bits.push('mirrored');
  if (r.speed) bits.push(`${r.speed}× speed`);
  if (r.brightness || r.contrast || r.saturation) bits.push('colour changed');
  if (r.fadeIn || r.fadeOut) bits.push('faded');
  if (r.mute) bits.push('no sound');
  else if (r.volume !== undefined) bits.push(`sound at ${Math.round(r.volume * 100)}%`);
  if (r.music) bits.push('music under it');
  if (r.texts?.length) bits.push(`${r.texts.length} text${r.texts.length === 1 ? '' : 's'} over it`);
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
  return [
    `${v.format === 'gif' ? 'Made a GIF of the video' : picture ? 'Took a frame of the video as a picture' : 'Edited the video'}${done.get(id) ? ` (${done.get(id)})` : ''}:`,
    `${v.path} (${bits})`,
    picture
      ? 'The user sees it in your reply, a tap away from full size and from keeping it in their Library: don’t repeat it or its path. To look at it yourself, open the file. In a deck, a document or a page it goes as a picture: its path as an image part’s src in save_slides, a picture in save_doc, an img in save_page.'
      : 'The user sees it in your reply, where they can play it, download it and keep it in their Library: don’t repeat it or its path. You cannot watch it: to check how it looks, take a frame of it (edit_video, frame: a moment) and open that. In a deck, give this file as a video part’s src in save_slides.',
  ].join('\n');
}

export function editVideoTool(): RunTool {
  return {
    name: 'edit_video',
    annotations: { readOnlyHint: false, openWorldHint: false },
    description: [
      'Edit a video on this computer with ffmpeg: free, and nothing leaves the computer. Use it for quick edits to a video the user gave or one you made (generate_video), for a deck, a document, a page or to share:',
      'keep a part of it (trim), take parts out (cuts), play it faster or slower (speed, the sound kept in tune), crop it (crop, or aspect for a shape such as 9:16 for phones, cut from its middle), turn it, mirror it, change its brightness, contrast and saturation, fade it in and out (picture and sound), make it quieter, louder or silent, put music under it (a sound file, such as one generate_audio made), and put titles or captions over it.',
      'format: gif makes a GIF of it (at most a minute, small); frame takes one moment of it as a picture instead (JPEG, or format: png).',
      'trim and cuts are seconds of the original video; texts’ from and to, music_start and frame are seconds of the edited video (after the trim, the cuts and the speed).',
      'The file is saved in the session’s folder (videos/, or images/ for a GIF or a frame) and shown to the user in your reply. It takes about as long as the video plays, or less; it waits up to about nine minutes, then gives you a job id to wait for it again (job).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The video: a file of the session (MP4, MOV or WebM), or a deck’s video (naget-video:…).' },
        trim: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'The part to keep: [start, end] in seconds of the original.' },
        cuts: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, description: 'Parts to take out: [[start, end], …] in seconds of the original.' },
        crop: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
          required: ['x', 'y', 'w', 'h'],
          description: 'The part of the picture to keep, in pixels of the original (before turning).',
        },
        aspect: { type: 'string', description: 'Or a shape to crop to from the middle, as it shows once turned: "16:9", "9:16", "1:1", "4:5".' },
        rotate: { type: 'integer', enum: [90, 180, 270], description: 'Turn it clockwise, in degrees.' },
        flip: { type: 'string', enum: ['horizontal', 'vertical', 'both'], description: 'Mirror it left to right (horizontal), upside down (vertical), or both.' },
        speed: { type: 'number', minimum: 0.25, maximum: 4, description: 'How fast it plays: 0.5 half speed, 2 twice as fast.' },
        brightness: { type: 'number', minimum: -1, maximum: 1, description: '-1 darker to 1 brighter (0 as it is).' },
        contrast: { type: 'number', minimum: -1, maximum: 1, description: '-1 flatter to 1 punchier.' },
        saturation: { type: 'number', minimum: -1, maximum: 1, description: '-1 black and white to 1 more colourful.' },
        fade_in: { type: 'number', minimum: 0, maximum: 10, description: 'Seconds at the start coming in from black and silence.' },
        fade_out: { type: 'number', minimum: 0, maximum: 10, description: 'Seconds at the end going out to black and silence.' },
        mute: { type: 'boolean', description: 'Take its own sound out (music, if given, stays).' },
        volume: { type: 'number', minimum: 0, maximum: 2, description: 'Its own sound: 0.5 half as loud, 2 twice.' },
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
              bold: { type: 'boolean' },
            },
            required: ['text'],
          },
        },
        music: { type: 'string', description: 'A sound file to put under it (MP3, WAV, M4A, OGG, FLAC…), such as one generate_audio made.' },
        music_volume: { type: 'number', minimum: 0, maximum: 2, description: 'How loud the music is (1 as it is).' },
        music_start: { type: 'number', minimum: 0, description: 'When the music starts, in seconds of the edited video.' },
        format: { type: 'string', enum: ['mp4', 'webm', 'gif', 'jpg', 'png'], description: 'mp4 (the default), webm, gif; jpg or png with frame.' },
        frame: { type: 'number', minimum: 0, description: 'Take this moment as a picture instead, in seconds of the edited video.' },
        size: { type: 'integer', minimum: 120, description: 'Make it smaller: its shorter side at most this many pixels (1080, 720, 480).' },
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
      if (typeof a.path !== 'string' || !a.path.trim()) throw new Error('path: the video to edit.');
      try {
        const source = await sourceOf(ctx.deps.db, a.path, { cwd: ctx.cwd });
        const facts = await factsOf(source.file);
        // The trim, the cuts and the speed first: the other times are of the edited video, worked out from them.
        const r: Record<string, any> = {};
        if (pairOf(a.trim)) r.trim = pairOf(a.trim);
        if (Array.isArray(a.cuts)) r.cuts = a.cuts.map(pairOf).filter(Boolean);
        if (num(a.speed) !== undefined) r.speed = num(a.speed);
        const parts = keptParts(r, facts.duration);
        if (!parts.length) return { isError: true, text: 'Nothing of the video would be left: keep a part of it (trim and cuts are seconds of the original, which is ' + `${Math.round(facts.duration * 10) / 10} s long).` };
        const speed = Math.min(4, Math.max(0.25, num(a.speed) ?? 1));
        const length = editedLength({ ...r, speed }, facts.duration);
        const orig = (s: number) => toOriginal(Math.max(0, Math.min(length, s)), parts, speed);
        const rotate = num(a.rotate);
        if (rotate !== undefined) r.rotate = rotate;
        if (a.flip === 'horizontal' || a.flip === 'both') r.flipH = true;
        if (a.flip === 'vertical' || a.flip === 'both') r.flipV = true;
        if (a.crop && typeof a.crop === 'object') r.crop = a.crop;
        else if (typeof a.aspect === 'string' && a.aspect.trim()) {
          const c = cropToShape(a.aspect, facts.width, facts.height, ((((Math.round((rotate ?? 0) / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270);
          if (!c) return { isError: true, text: `aspect: a shape such as "16:9", "9:16", "1:1" or "4:5", not "${a.aspect}".` };
          r.crop = c;
        }
        for (const k of ['brightness', 'contrast', 'saturation', 'volume'] as const) if (num(a[k]) !== undefined) r[k] = num(a[k]);
        if (num(a.fade_in) !== undefined) r.fadeIn = num(a.fade_in);
        if (num(a.fade_out) !== undefined) r.fadeOut = num(a.fade_out);
        if (a.mute === true) r.mute = true;
        if (typeof a.music === 'string' && a.music.trim()) r.music = { src: a.music.trim(), volume: num(a.music_volume), start: num(a.music_start) };
        if (Array.isArray(a.texts))
          r.texts = a.texts.slice(0, MAX_TEXTS).map((t: Record<string, any>) => ({
            ...t,
            text: String(t?.text ?? ''),
            from: orig(num(t?.from) ?? 0),
            to: orig(num(t?.to) ?? length),
          }));
        const frame = num(a.frame);
        const format: VideoOut = ['mp4', 'webm', 'gif', 'jpg', 'png'].includes(a.format) ? a.format : frame !== undefined ? 'jpg' : 'mp4';
        const picture = format === 'jpg' || format === 'png';
        if (picture && frame === undefined) return { isError: true, text: 'frame: the moment to take as a picture, in seconds of the edited video.' };
        const folder = path.join(ctx.cwd, picture || format === 'gif' ? 'images' : 'videos');
        const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : picture ? `${source.name} frame` : `${source.name} edited`;
        const prep = await prepare(ctx.deps, { src: a.path, recipe: r as VideoRecipe, format, ...(picture ? { frame: orig(frame!) } : {}), ...(num(a.size) ? { size: num(a.size) } : {}) }, { cwd: ctx.cwd, to: { into: folder, name } });
        const job = startVideoEdit(prep);
        const said = [picture ? `at ${videoClock(frame!)}` : '', summary(prep.recipe, a)].filter(Boolean).join(', ');
        if (said) {
          done.set(job.job, said);
          setTimeout(() => done.delete(job.job), 2 * 3600_000).unref?.();
        }
        await waitForJob(job.job, until - Date.now(), ctx.signal);
        return answer(job.job);
      } catch (e) {
        return { isError: true, text: String((e as Error).message ?? e) };
      }
    },
  };
}
