// Script tests for the video editor's server: the recipe (a timeline: clips, transitions, overlays, sounds, words,
// tracks and sound fixes; the first one-video recipes read as clips), its time (spans, the clips at a moment, a part of
// it), the colour (one function, its table, looks, wheels and curves), the ffmpeg command an edit becomes (clips joined
// by cuts and transitions, pictures still or zooming, colour tables, effects, overlays keyed and faded, words, music and
// a voice-over with the voices cleaned up, the music lowered under speech and the loudness evened out, a part of the
// timeline, a frame, a GIF, the voices alone for captions) and the allow list that guards it, the graphics card (which
// one is found, how each is asked for quality, one that fails an edit made again on the processor at once; all with a
// make-believe card, never a real one), what ffmpeg says of a file read without ffprobe, real edits made here (two
// clips with a transition, a picture zooming, an overlay keyed, music lowered; their length, size and a pixel or two,
// read back), a job's life, every place a result goes, captions from a stand-in whisper.cpp, edit_video writing its
// files, and ffmpeg found in the picture tools' Python, or nowhere.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/mediaedit/video-test.ts
//   CUDA_VISIBLE_DEVICES= HYDOR_VIDEO_GPU= DATA_DIR=/tmp/hydor-test-video node dist/dev/video-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import {
  captionsSrt,
  clipsAt,
  clipSpans,
  cropToShape,
  editedSize,
  keptParts,
  motionPreset,
  normalizeVideoRecipe,
  originalRect,
  outputSize,
  shownRect,
  sourceAt,
  timecode,
  toEdited,
  toOriginal,
  viewAt,
  windowRecipe,
  type VideoFactsOf,
  type VideoRecipe,
  type VideoSize,
} from '../../shared/mediaedit-video.ts';
import { cubeText, curveFunction, gradeFunction, gradeLut, lutAt, normalizeGrade, wheelPush } from '../../shared/video-grade.ts';
import { config } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { ffmpegTools, forgetFfmpeg, hasFfmpeg, probe, readFfmpegInfo } from '../media/frames.ts';
import { media } from '../media/index.ts';
import { getMedia } from '../media/store.ts';
import { getAsset, initAssets } from '../pages/assets.ts';
import { getVideo } from '../pages/videos.ts';
import { voice } from '../voice/index.ts';
import { readTimed } from '../voice/whisper.ts';
import { encoderArgs, gpuEncoder, gpuState, hwOrder, setGpuProbe, type GpuProbe } from './video-gpu.ts';
import { checkChain, checkPlan, graphText, planVideo, REVERSE_BYTES, scaledSize, tempos, type PlanInput } from './video-plan.ts';
import { pngSize, videoEdit } from './video.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
// Never a real graphics card: the tests' own make-believe one, and nothing else.
process.env.CUDA_VISIBLE_DEVICES = '';
process.env.HYDOR_VIDEO_GPU = 'off';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const throws = (f: () => unknown, re: RegExp, what: string) => {
  try {
    f();
    ok(false, `${what} (it did not throw)`);
  } catch (e) {
    ok(re.test(String((e as Error).message)), `${what}: ${(e as Error).message}`);
  }
};
const near = (a: number | undefined, b: number, by = 0.15) => a !== undefined && Math.abs(a - b) <= by;
const J = (x: unknown) => JSON.stringify(x);

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-video-test-')));

// ---- the recipe: a timeline -------------------------------------------------------------------------------------

const MAIN: VideoSize = { duration: 10, width: 1920, height: 1080, audio: true, fps: 25 };
const PIC: VideoSize = { duration: 0, width: 800, height: 600, picture: true };
const SONG: VideoSize = { duration: 6, width: 0, height: 0, audio: true };
const B: VideoSize = { duration: 4, width: 1280, height: 720, audio: true, fps: 30 };
const facts: VideoFactsOf = (src) => (src === undefined ? MAIN : src === 'pic.png' ? PIC : src === 'song.mp3' ? SONG : src === 'b.mp4' ? B : undefined);

{
  // The first recipes: one video's trim, cuts, speed and the rest, read as the clips it keeps.
  const r = normalizeVideoRecipe(
    {
      trim: [1, 9],
      cuts: [
        [5, 6],
        [2, 3],
        [2.5, 3.5],
        [0, 0.5],
      ],
      speed: 2,
      crop: { x: -50, y: 1000, w: 1001, h: 301 },
      rotate: -90,
      brightness: 0.3,
      contrast: 0,
      fadeIn: 99,
      volume: 1,
      music: { src: 'song.mp3', start: 50, volume: 0.5 },
      texts: [{ text: '  Hello\r\nthere ', from: 3, to: 2 }, { text: 'Title', from: 1, to: 4, x: 2, y: -1, size: 9, color: '#FFF', background: '#00000080', bold: true }, { text: '' }],
    },
    facts,
  );
  ok(
    J(r.clips?.map((c) => c.trim)) ===
      J([
        [1, 2],
        [3.5, 5],
        [6, 9],
      ]),
    `the parts kept, a clip each: ${J(r.clips?.map((c) => c.trim))}`,
  );
  const c0 = r.clips![0];
  ok(c0.speed === 2 && c0.rotate === 270 && c0.grade?.brightness === 0.3 && c0.grade.contrast === undefined && c0.volume === undefined, `speed, turn and colour on each: ${J(c0)}`);
  ok(c0.crop && c0.crop.x === 0 && c0.crop.w === 1000 && c0.crop.h === 300 && c0.crop.y === 1000, `the crop inside the upright frame (1080 × 1920, turned), its sides even: ${J(c0.crop)}`);
  const len = clipSpans(r.clips!, facts).length;
  ok(near(len, (1 + 1.5 + 3) / 2, 0.001), `the timeline's length: ${len}`);
  ok(r.fadeIn === Math.floor((len / 2) * 100) / 100, `a fade no longer than half of it: ${r.fadeIn}`);
  ok(r.audio?.length === 1 && r.audio[0].track === 'music' && r.audio[0].volume === 0.5 && near(r.audio[0].start, len - 0.1, 0.001), `the music a sound on the timeline: ${J(r.audio)}`);
  ok(r.texts?.length === 1 && r.texts[0].text === 'Title' && near(r.texts[0].from, 0, 0.001) && near(r.texts[0].to, toEdited(4, keptParts({ trim: [1, 9], cuts: [[2, 3.5], [5, 6]] }, 10), 2), 0.001) && r.texts[0].x === 1 && r.texts[0].size === 0.3, `words in the timeline's time: ${J(r.texts)}`);
  throws(() => normalizeVideoRecipe({ trim: [2, 4], cuts: [[1, 5]] }, MAIN), /Nothing of the video/, 'all of it cut');
  ok(J(normalizeVideoRecipe({ trim: [0, 10], crop: { x: 0, y: 0, w: 1920, h: 1080 }, rotate: 360 }, MAIN)) === '{"clips":[{}]}', 'an edit that changes nothing is one clip of all of it');

  // A timeline: a video, a picture zooming, another video; transitions no longer than half the shorter clip.
  const t = normalizeVideoRecipe(
    {
      clips: [
        { id: 'a', trim: [2, 6], transition: { kind: 'dissolve', length: 9 } },
        { id: 'b', src: 'pic.png', length: 3, motion: motionPreset('in', 1), transition: { kind: 'nope', length: 1 }, trim: [0, 1], speed: 3 },
        { id: 'c', src: 'b.mp4', speed: 2, reverse: true, fit: 'fill', transition: { kind: 'wipeleft', length: 1 } },
        { src: 'gone.mp4' },
      ],
      overlays: [{ src: 'pic.png', start: 1, length: 99, x: 0.9, y: 0.1, w: 0.2, opacity: 0.5, key: { color: '#0F0' } }],
      audio: [{ src: 'song.mp3', track: 'voice', start: 5, trim: [1, 6], fadeIn: 9 }],
      texts: [{ text: 'Late', from: 20, to: 30 }, { text: 'Cap', from: 1, to: 2, caption: true, outline: '#000' }],
      shape: '9:16',
      tracks: { a2: { mute: true, volume: 0.5, pan: -2 }, v2: { hidden: true, solo: true } },
      fixes: { voice: 0.5, loudness: 'web', duck: 2 },
    },
    facts,
  );
  const [ca, cb, cc] = t.clips!;
  ok(t.clips?.length === 3, 'a clip whose source is not known is left out');
  ok(ca.transition?.length === 1.5 && !cb.transition && !cc.transition, `transitions at most half the shorter clip; an unknown kind and the last clip's none: ${J(t.clips?.map((c) => c.transition))}`);
  ok(cb.picture && cb.length === 3 && !cb.trim && !cb.speed && cb.motion?.to.zoom === 1.6, `a picture: its length and zoom, no trim or speed: ${J(cb)}`);
  ok(cc.speed === 2 && cc.reverse && cc.fit === 'fill', 'a video sped up, backwards, filling the shape');
  const { spans, length } = clipSpans(t.clips!, facts);
  ok(J(spans.map((s) => [s.start, s.length])) === J([[0, 4], [2.5, 3], [5.5, 2]]) && length === 7.5, `where each clip is: ${J(spans)}`);
  ok(J(clipsAt(spans, 3)) === '[0,1]' && J(clipsAt(spans, 4.5)) === '[1]' && J(clipsAt(spans, 99)) === '[2]', 'the clips showing at a moment');
  ok(sourceAt(ca, MAIN, 1) === 3 && sourceAt(cc, B, 0.5) === 3 && sourceAt(cb, PIC, 2) === 0, 'a clip’s moment in its source: forwards, backwards and fast, a picture');
  ok(t.overlays?.[0].length === 6.5 && t.overlays[0].opacity === 0.5 && t.overlays[0].key?.color === '#00ff00' && t.overlays[0].key.similarity === 0.3, `an overlay to the end at most, keyed: ${J(t.overlays)}`);
  ok(t.audio?.[0].track === 'voice' && J(t.audio[0].trim) === '[1,3.5]' && t.audio[0].fadeIn === 1.25, `a voice-over cut at the end of the timeline, its fade at most half of it: ${J(t.audio)}`);
  ok(t.texts?.length === 1 && t.texts[0].caption && t.texts[0].outline === '#000000', `words after the end left out; a caption's outline: ${J(t.texts)}`);
  ok(J(t.tracks) === J({ v2: { hidden: true }, a2: { mute: true, volume: 0.5, pan: -1 } }) && J(t.fixes) === J({ voice: 0.5, loudness: 'web', duck: 1 }), `tracks and fixes: ${J(t.tracks)} ${J(t.fixes)}`);
  ok(J(outputSize(t, facts)) === J({ w: 1080, h: 1920 }) && J(outputSize(t, facts, { size: 720 })) === J({ w: 720, h: 1280 }) && J(outputSize({ clips: [{ src: 'pic.png' }] }, facts)) === J({ w: 800, h: 600 }), 'the output’s size: its shape, the first clip’s short side, made smaller');
  ok(viewAt(cb.motion, 1.5, 3).zoom === 1.3 && viewAt(undefined, 1, 3).zoom === 1, 'a zoom half way');

  // A part of the timeline (In to Out, a frame): the clips at its ends cut, the rest moved.
  const w = windowRecipe(t, facts, 3, 3.5);
  ok(w.recipe.clips?.length === 2 && J(w.recipe.clips[0].trim) === '[4.45,6]' && w.recipe.clips[1].length === 1.55 && near(w.offset, 0.55, 0.001) && w.length === 0.5, `from inside a transition: both clips, cut as far as it still fits: ${J(w.recipe.clips)} ${w.offset}`);
  const w2 = windowRecipe(t, facts, 1, 2);
  ok(w2.recipe.clips?.length === 1 && J(w2.recipe.clips[0].trim) === '[3,4]' && w2.offset === 0 && J(w2.recipe.overlays?.map((o) => o.start)) === '[0]', `one clip's middle: ${J(w2.recipe)}`);
  ok(J(normalizeVideoRecipe(t, facts)) === J(t), 'a timeline read again is the same');

  // Shapes and turns.
  ok(J(cropToShape('16:9', 1920, 1080)) === J({ x: 0, y: 0, w: 1920, h: 1080 }), 'its own shape is all of it');
  const tall = cropToShape('9:16', 1920, 1080)!;
  ok(tall.h === 1080 && tall.w === 606 && tall.x === 656 && tall.y === 0, `9:16 from the middle: ${J(tall)}`);
  const c = { x: 100, y: 50, w: 400, h: 200 };
  for (const tt of [{}, { rotate: 90 as const }, { rotate: 180 as const }, { rotate: 270 as const, flipH: true }, { rotate: 90 as const, flipV: true, flipH: true }]) ok(J(originalRect(shownRect(c, 1920, 1080, tt), 1920, 1080, tt)) === J(c), `a part of the picture shown turned and back (${J(tt)})`);
  ok(J(editedSize({ crop: c, rotate: 90 }, 1920, 1080)) === J({ w: 400, h: 200 }) && J(editedSize({ rotate: 90 }, 1920, 1080)) === J({ w: 1080, h: 1920 }), 'a clip’s picture size');
  const parts = keptParts({ trim: [1, 9], cuts: [[3, 4]] }, 10);
  ok(toEdited(2, parts) === 1 && toOriginal(2.5, parts) === 4.5, 'the first recipes’ time, there and back');
  ok(timecode(65.5, 25) === '00:01:05:12' && timecode(3600, 30) === '01:00:00:00', 'timecodes');
  ok(captionsSrt([{ from: 1.2, to: 3.9, text: 'Hi' }, { from: 0, to: 1, text: 'First' }]) === '1\n00:00:00,000 --> 00:00:01,000\nFirst\n\n2\n00:00:01,200 --> 00:00:03,900\nHi\n', 'captions as an .srt file');
}

// ---- colour --------------------------------------------------------------------------------------------------------

{
  const id = gradeFunction({});
  ok(J(id(0.2, 0.5, 0.9).map((x) => Math.round(x * 1000) / 1000)) === J([0.2, 0.5, 0.9]), 'no grade changes nothing');
  const lut = gradeLut({}, 5);
  ok(lut.length === 5 * 5 * 5 * 3 && lut[3] === 0.25 && lut[5 * 3 + 1] === 0.25 && lut[25 * 3 + 2] === 0.25, 'the table: red fastest, then green, then blue');
  const bright = gradeFunction({ brightness: 0.5, contrast: 0.5, saturation: -1 });
  const [r, g, b] = bright(0.2, 0.5, 0.9);
  ok(Math.abs(r - g) < 1e-9 && Math.abs(g - b) < 1e-9, 'no saturation is grey');
  const b1 = gradeFunction({ brightness: 0.5 })(0.4, 0.4, 0.4)[0];
  ok(near(b1, 0.4 * 1.3, 1e-6), 'brightness as the browser’s brightness() makes it');
  const warm = gradeFunction({ temperature: 1 })(0.5, 0.5, 0.5);
  ok(warm[0] > 0.55 && warm[2] < 0.45, `warmer is redder and less blue: ${J(warm)}`);
  const push = wheelPush({ x: 1, y: 0 });
  ok(push[0] === 1 && Math.abs(0.2126 * push[0] + 0.7152 * push[1] + 0.0722 * push[2]) < 1e-9, `a wheel pushed to red: red up, the brightness kept: ${J(push)}`);
  const lifted = gradeFunction({ lift: { x: 0, y: 0, level: 1 } })(0, 0, 0);
  ok(near(lifted[0], 0.25, 1e-6), 'lift raises black');
  const curve = curveFunction([
    [0, 0],
    [0.5, 0.7],
    [1, 1],
  ]);
  ok(curve(0) === 0 && curve(1) === 1 && near(curve(0.5), 0.7, 1e-9) && curve(0.25) > 0.25 && curve(0.75) < 0.9, 'a curve through its points');
  const flat = curveFunction([
    [0, 0],
    [0.4, 0.5],
    [0.6, 0.5],
    [1, 1],
  ]);
  ok([0.45, 0.5, 0.55].every((x) => flat(x) <= 0.5 + 1e-9 && flat(x) >= 0.5 - 1e-9), 'a flat part stays flat (no overshoot)');
  const look = { look: 'bw' as const, lookStrength: 0.5 };
  const half = gradeFunction(look)(1, 0, 0);
  const all = gradeFunction({ look: 'bw' })(1, 0, 0);
  ok(Math.abs(all[0] - all[1]) < 1e-6 && half[0] > half[1] + 0.2, 'a look, all of it and half of it');
  const gl = gradeLut({ temperature: 0.4, contrast: 0.3, curves: { master: [[0.5, 0.6]] } });
  const f = gradeFunction({ temperature: 0.4, contrast: 0.3, curves: { master: [[0.5, 0.6]] } });
  const atPoint = lutAt(gl, 33, 8 / 32, 16 / 32, 24 / 32);
  const exact = f(8 / 32, 16 / 32, 24 / 32);
  ok(atPoint.every((x, i) => Math.abs(x - exact[i]) < 1e-5), 'the table is the function at its points');
  const between = lutAt(gl, 33, 0.3, 0.41, 0.77);
  const want = f(0.3, 0.41, 0.77);
  ok(between.every((x, i) => Math.abs(x - want[i]) < 0.01), `and near it between them: ${J(between)} ${J(want)}`);
  ok(cubeText(gradeLut({}, 2), 2).split('\n').filter((l) => /^[\d.]+ [\d.]+ [\d.]+$/.test(l)).length === 8 && /LUT_3D_SIZE 2/.test(cubeText(gradeLut({}, 2), 2)), 'a .cube file');
  ok(J(normalizeGrade({ exposure: 3, tint: 0.001, lift: { x: 2, y: 0, level: 0 }, curves: { r: [[0.5, 0.5]] }, look: 'nope', grain: -1, vignette: 0.4 })) === J({ exposure: 1, lift: { x: 1, y: 0, level: 0 }, vignette: 0.4 }), 'a grade made to fit, what changes nothing left out');
}

// ---- the command --------------------------------------------------------------------------------------------------

const ENC = { h264: 'libx264', h265: 'libx265', av1: 'libsvtav1', vp9: 'libvpx-vp9', opus: true };
const plan = (recipe: VideoRecipe, more: Partial<PlanInput> = {}) => {
  const r = normalizeVideoRecipe(recipe, facts);
  const fileOf = (s?: string) => (s === undefined ? '/v/in.mp4' : `/v/${s}`);
  return planVideo({
    recipe: r,
    factsOf: facts,
    clipFiles: r.clips!.map((c) => ({ file: fileOf(c.src), ...(c.sound ? { sound: fileOf(c.sound) } : {}) })),
    overlayFiles: (r.overlays ?? []).map((o) => fileOf(o.src)),
    audioFiles: (r.audio ?? []).map((a) => fileOf(a.src)),
    output: '/v/out.mp4',
    format: 'mp4',
    encoders: ENC,
    ...more,
  });
};

{
  // One video's parts joined by cuts, twice as fast, its sound in tune and quieter.
  const p = plan({ trim: [1, 9], cuts: [[3, 4]], speed: 2, volume: 0.5 });
  const all = p.args.join(' ');
  ok(all.includes('-ss 1 -t 2.05 -protocol_whitelist file -i file:/v/in.mp4') && all.includes('-ss 4 -t 5.05'), `each part read from its own start: ${all.slice(0, 400)}`);
  ok(p.graph.includes('concat=n=2:v=1:a=1') && p.graph.includes('setpts=expr=PTS/2') && p.graph.includes('atempo=tempo=2') && p.graph.includes('volume=volume=0.5'), `joined, twice as fast, in tune, quieter: ${p.graph}`);
  ok(p.seconds === 3.5 && p.audio && p.w === 1920 && p.h === 1080 && p.encoder === 'libx264', 'its length, size and encoder');
  ok(p.args.includes('-crf') && p.args.includes('aac') && p.args.includes('+faststart') && p.args.slice(-3).join(' ') === '-f mp4 file:/v/out.mp4', 'H.264 and AAC in an MP4 that plays as it loads');
  checkPlan(p);
  ok(true, 'it reads only its inputs and writes only its output');

  // Clips joined by a transition; a picture zooming; one backwards and filling; colour as a table.
  const t = plan(
    {
      clips: [
        { trim: [2, 6], transition: { kind: 'dissolve', length: 1 }, grade: { temperature: 0.5, vignette: 0.5, grain: 0.3, sharpen: 0.5, denoise: 0.5 } },
        { src: 'pic.png', length: 3, motion: motionPreset('in', 0.5), transition: { kind: 'black', length: 0.5 } },
        { src: 'b.mp4', trim: [0, 2], speed: 2, reverse: true, fit: 'fill', keepPitch: false },
      ],
      shape: '1:1',
    },
    { size: 720 },
  );
  ok(t.graph.includes('xfade=transition=fade:duration=1:offset=3') && t.graph.includes('xfade=transition=fadeblack:duration=0.5:offset=5.5'), `transitions where the clips overlap: ${t.graph}`);
  ok(t.graph.includes('acrossfade=d=1:c1=tri:c2=tri') && t.seconds === 6.5, 'their sound crossfaded; the length less the overlaps');
  ok(/lut3d=file=grade0\.cube:interp=trilinear/.test(t.graph) && /^TITLE/.test(t.files['grade0.cube']) && t.files['grade0.cube'].split('\n').length > 35000, 'the colour as a table of its own');
  ok(t.graph.includes('hqdn3d=') && t.graph.includes('unsharp=lx=5') && t.graph.includes('vignette=angle=0.45') && t.graph.includes('noise=c0s=8:c0f=t+u'), 'denoised, sharpened, a vignette and grain');
  ok(/zoompan=z='?\(1\+0\.3\*on\/74\)'?/.test(t.graph) && t.graph.includes('s=720x540'), `a picture zooming in, fitted: ${t.graph.match(/zoompan[^;]*/)?.[0]}`);
  ok(t.graph.includes('reverse') && t.graph.includes('areverse') && t.graph.includes('asetrate=r=96000') && t.graph.includes('crop=w=720:h=720'), 'backwards, its pitch with its speed, filling the square');
  ok(t.w === 720 && t.h === 720, 'a square, 720');

  // Overlays, words, music lowered under speech, a voice-over cleaned up, the loudness evened out.
  const o = plan(
    {
      clips: [{ trim: [0, 6] }],
      overlays: [{ src: 'b.mp4', start: 1, trim: [0, 2], x: 0.8, y: 0.2, w: 0.25, key: { color: '#00ff00', similarity: 0.3, blend: 0.1 }, opacity: 0.8, fadeIn: 0.5 }],
      audio: [
        { src: 'song.mp3', track: 'music', start: 0.5, volume: 0.6, fadeOut: 1 },
        { src: 'song.mp3', track: 'voice', start: 2, trim: [0, 2] },
      ],
      texts: [{ text: 'A', from: 1, to: 3, x: 0.5, y: 0.5, size: 0.1, color: '#ffffff' }],
      fixes: { voice: 0.5, duck: 0.5, loudness: 'web' },
      tracks: { a2: { pan: 0.5 } },
    },
    { texts: [{ png: '/v/job/drawn0.png', w: 100, h: 40 }] },
  );
  ok(o.graph.includes('colorkey=color=0x00ff00:similarity=0.3:blend=0.1') && o.graph.includes('colorchannelmixer=aa=0.8') && o.graph.includes('setpts=expr=PTS-STARTPTS+1/TB') && o.graph.includes('overlay=x=1296:y=81:eof_action=pass'), `an overlay keyed, see-through, in at its time and place: ${o.graph}`);
  ok(o.graph.includes("overlay=x=910:y=520:enable='between(t,1,3)'"), 'the editor’s drawing of the words, while they show');
  ok(o.graph.includes('adelay=delays=500:all=1') && o.graph.includes('afade=t=out:st=4.5:d=1') && o.graph.includes('stereotools=balance_out=0.5'), 'the music placed, faded and to the right');
  ok(o.graph.includes('sidechaincompress=threshold=0.03:ratio=7') && o.graph.includes('afftdn=nr=15') && o.graph.includes('highpass=f=80'), 'the music lowered under the voices, the voices cleaned up');
  ok(o.graph.includes('loudnorm=i=-14:tp=-1.5:lra=11,aresample=osr=48000'), 'the loudness evened out for the web');
  ok(o.inputs.length === 5, `its inputs: ${o.inputs.join(', ')}`);

  // A part of it, one frame, a GIF, the voices alone, WebM, H.265 and AV1.
  const part = plan({ clips: [{ trim: [0, 8] }] }, { range: [2, 5] });
  ok(part.args.join(' ').includes('-ss 2 -t 3.05') && part.seconds === 3, `In to Out: only that part read: ${part.args.join(' ').slice(0, 200)}`);
  const frame = plan({ clips: [{ trim: [0, 8] }], texts: [{ text: 'A', from: 4, to: 6, x: 0.5, y: 0.5, size: 0.1, color: '#ffffff' }] }, { format: 'jpg', frame: 5, output: '/v/f.jpg', size: 180, texts: [{ png: '/v/d.png', w: 10, h: 10 }] });
  ok(frame.args.includes('-frames:v') && !frame.args.includes('-progress') && frame.args.join(' ').includes('-ss 5 -t 0.15') && frame.w === 320 && frame.h === 180 && frame.graph.includes("enable='between(t,0,0.1)'"), `a frame: only its moment read, the words there: ${frame.args.join(' ').slice(0, 300)}`);
  const gif = plan({ clips: [{ trim: [0, 4], speed: 0.5 }] }, { format: 'gif', output: '/v/out.gif' });
  ok(gif.graph.includes('palettegen') && gif.graph.includes('fps=fps=15') && gif.w === 480 && gif.h === 270 && gif.args.includes('-an') && !gif.graph.includes(':a]'), `a GIF: its own colours, 15 frames a second, 480 wide, no sound`);
  const wav = plan({ clips: [{ trim: [0, 4] }], audio: [{ src: 'song.mp3', track: 'music', start: 0 }, { src: 'song.mp3', track: 'voice', start: 1 }] }, { format: 'wav', output: '/v/v.wav' });
  ok(!wav.graph.includes(':V]') && wav.graph.includes('sample_rates=16000:channel_layouts=mono') && wav.inputs.length === 2 && wav.args.includes('pcm_s16le'), `the voices alone for captions, no music, no picture: ${wav.graph}`);
  const webm = plan({ clips: [{}] }, { format: 'webm', output: '/v/o.webm' });
  ok(webm.args.includes('libvpx-vp9') && webm.args.includes('libopus') && webm.args.slice(-2)[0] === 'webm', 'WebM: VP9 and Opus');
  throws(() => plan({ clips: [{}] }, { format: 'webm', encoders: { h264: 'libx264' } }), /cannot make WebM/, 'no WebM without its encoder');
  const hevc = plan({ clips: [{}] }, { codec: 'h265', quality: 'high' });
  ok(hevc.args.join(' ').includes('-c:v libx265 -preset medium -crf 22 -tag:v hvc1') && hevc.args.includes('256k'), 'H.265, high quality, tagged for Apple');
  ok(plan({ clips: [{}] }, { codec: 'av1', quality: 'small' }).args.join(' ').includes('-c:v libsvtav1 -preset 10 -crf 42'), 'AV1, a smaller file');
  throws(() => plan({ clips: [{}] }, { codec: 'av1', encoders: { h264: 'libx264' } }), /cannot make AV1/, 'no AV1 without its encoder');
  ok(plan({ clips: [{}] }, { container: 'mov', output: '/v/o.mov' }).args.slice(-2)[0] === 'mov', 'a .mov written over stays a .mov');
  ok(plan({ clips: [{}] }, { fps: 60 }).graph.includes('fps=fps=60'), 'frames a second as asked');
  throws(() => plan({ clips: [{ reverse: true, speed: 0.25 }] }, {}), /backwards is kept whole in memory/, 'a long clip backwards is refused, saying how long it may be');
  ok(REVERSE_BYTES > 0 && J(tempos(0.25)) === '[0.5,0.5]' && J(tempos(3)) === '[2,1.5]' && tempos(1).length === 0, 'speeds as atempo takes them');
  ok(J(scaledSize(1920, 1080, { gif: true })) === '{"w":480,"h":270}' && J(scaledSize(1080, 1920, { size: 720 })) === '{"w":720,"h":1280}', 'sizes made smaller');

  // The graphics card: its decoding, its encoder and its last step.
  const nv = plan({ clips: [{ trim: [0, 2] }, { src: 'pic.png', length: 1 }], overlays: [{ src: 'b.mp4', start: 0, x: 0.5, y: 0.5, w: 0.3 }] }, { hw: { api: 'nvenc', encoder: 'h264_nvenc' } });
  const nvArgs = nv.args.join(' ');
  ok(nvArgs.includes('-hwaccel cuda -ss 0 -t 2.05 -protocol_whitelist file -i file:/v/in.mp4') && nvArgs.includes('-protocol_whitelist file -i file:/v/pic.png') && !/-hwaccel cuda -protocol_whitelist file -i file:\/v\/pic/.test(nvArgs), 'NVIDIA decodes the videos, not the pictures');
  ok(nvArgs.includes('-c:v h264_nvenc -preset p5 -tune hq -rc vbr -cq 23 -b:v 0 -spatial-aq 1') && nv.encoder === 'h264_nvenc', 'NVENC at good quality');
  const va = plan({ clips: [{}] }, { hw: { api: 'vaapi', encoder: 'hevc_vaapi', device: '/dev/dri/renderD128' }, codec: 'h265' });
  ok(va.args.slice(0, 14).join(' ').includes('-init_hw_device vaapi=va:/dev/dri/renderD128 -filter_hw_device va') && va.graph.endsWith('format=pix_fmts=nv12,hwupload[vout]') && va.args.join(' ').includes('-c:v hevc_vaapi -qp 26'), 'VA-API: frames uploaded to the card at the end');
  ok(!plan({ clips: [{}] }, { hw: { api: 'nvenc', encoder: 'h264_nvenc' }, format: 'webm', output: '/v/o.webm' }).args.includes('-hwaccel'), 'WebM is made on the processor');

  // The allow list.
  throws(() => checkChain({ ins: ['0:v'], filters: [{ name: 'movie', args: [['filename', 'x']] }], outs: ['o'] }), /may not use: movie/, 'a filter that reads files is refused');
  throws(() => checkChain({ ins: ['0:v'], filters: [{ name: 'deshake', args: [['filename', 'x.log']] }], outs: ['o'] }), /option the plan may not use: deshake filename/, 'an option that writes a file is refused');
  throws(() => checkChain({ ins: ['0:v'], filters: [{ name: 'lut3d', args: [['file', '/etc/passwd']] }], outs: ['o'] }), /only the job's own files/, 'a table outside the job’s folder is refused');
  throws(() => checkChain({ ins: ['0:v'], filters: [{ name: 'drawtext', args: [['textfile', '/etc/passwd']] }], outs: ['o'] }), /only the job's own files/, 'a file outside the job’s folder is refused');
  throws(() => checkChain({ ins: ['0:v'], filters: [{ name: 'drawtext', args: [['x', "a'[x];movie=y"]] }], outs: ['o'] }), /value the plan may not use/, 'a value that would close its quote is refused');
  throws(() => checkChain({ ins: ['0:v];[1'], filters: [{ name: 'null' }], outs: ['o'] }), /label/, 'a label that would start another chain is refused');
  ok(graphText([{ ins: ['0:v'], filters: [{ name: 'null' }], outs: ['o'] }]) === '[0:v]null[o]', 'a graph as ffmpeg reads it');
  const sneaky = { ...p, args: [...p.args.slice(0, -1), '-i', 'file:/etc/passwd', p.args[p.args.length - 1]] };
  throws(() => checkPlan(sneaky), /reads something/, 'a command reading what it was not given is refused');
}

// ---- the graphics card, make-believe ----------------------------------------------------------------------------------

const tried: string[] = [];
const card = (o: { encoders: string[]; works: string[]; nodes?: string[] }): GpuProbe => ({
  encoders: async () => new Set(o.encoders),
  renderNodes: () => o.nodes ?? [],
  test: async (_bin, api, enc, device) => (tried.push(`${api}:${enc}${device ? `@${device}` : ''}`), o.works.includes(enc)),
  name: async (api) => (api === 'nvenc' ? 'NVIDIA GeForce RTX 4090' : 'Intel graphics'),
});

{
  ok(J(hwOrder('linux')) === '["nvenc","vaapi","qsv"]' && J(hwOrder('darwin')) === '["videotoolbox"]' && hwOrder('win32')[0] === 'nvenc', 'which ways are tried, the best first');
  const db0 = openDb(path.join(tmp, 'gpu.db'));
  delete process.env.HYDOR_VIDEO_GPU;
  setGpuProbe(card({ encoders: ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc', 'h264_vaapi'], works: ['h264_nvenc', 'hevc_nvenc'] }));
  ok(gpuState(db0).checked === false, 'not tried until a video is made');
  const g = await gpuEncoder(db0, 'ffmpeg', 'h264');
  ok(g?.api === 'nvenc' && g.encoder === 'h264_nvenc' && g.label === 'NVIDIA GeForce RTX 4090 · NVENC', `NVIDIA found and named: ${J(g)}`);
  ok(J(tried) === J(['nvenc:h264_nvenc', 'nvenc:hevc_nvenc', 'nvenc:av1_nvenc']), `each of its encoders tried once: ${J(tried)}`);
  ok((await gpuEncoder(db0, 'ffmpeg', 'av1')) === null && tried.length === 3, 'one that failed its test is not used; nothing tried again');
  tried.length = 0;
  setGpuProbe(card({ encoders: ['h264_nvenc', 'h264_vaapi', 'hevc_vaapi'], works: ['h264_vaapi', 'hevc_vaapi'], nodes: ['/dev/dri/renderD128'] }));
  const va = await gpuEncoder(db0, 'ffmpeg', 'h265');
  ok(va?.api === 'vaapi' && va.encoder === 'hevc_vaapi' && va.device === '/dev/dri/renderD128' && J(tried) === J(['nvenc:h264_nvenc', 'vaapi:h264_vaapi@/dev/dri/renderD128', 'vaapi:hevc_vaapi@/dev/dri/renderD128']), `NVIDIA failing, VA-API next on its render node: ${J(tried)}`);
  setGpuProbe(card({ encoders: ['h264_vaapi'], works: ['h264_vaapi'], nodes: [] }));
  ok((await gpuEncoder(db0, 'ffmpeg', 'h264')) === null && gpuState(db0).found === null, 'VA-API without a render node: none');
  setGpuProbe(card({ encoders: ['h264_nvenc'], works: ['h264_nvenc'] }));
  db0.prepare("insert into kv(k, v) values ('videoGpu', '{\"mode\":\"off\"}')").run();
  ok((await gpuEncoder(db0, 'ffmpeg', 'h264')) === null && gpuState(db0).mode === 'off' && gpuState(db0).checked === false, 'off: the processor, the card not even tried');
  db0.prepare("update kv set v = '{\"mode\":\"auto\"}' where k = 'videoGpu'").run();
  process.env.HYDOR_VIDEO_GPU = 'off';
  ok((await gpuEncoder(db0, 'ffmpeg', 'h264')) === null && gpuState(db0).forcedOff, 'HYDOR_VIDEO_GPU=off turns it off for good');
  delete process.env.HYDOR_VIDEO_GPU;
  ok(J(encoderArgs('hevc_nvenc', { quality: 'small', codec: 'h265', w: 1920, h: 1080, fps: 30 })) === J(['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '30', '-b:v', '0', '-spatial-aq', '1', '-aq-strength', '8', '-tag:v', 'hvc1']), 'NVENC H.265, a smaller file');
  ok(encoderArgs('h264_videotoolbox', { quality: 'standard', codec: 'h264', w: 1920, h: 1080, fps: 30 }).join(' ') === '-b:v 6221k', 'VideoToolbox by a bitrate for its size');
  ok(encoderArgs('h264_qsv', { quality: 'high', codec: 'h264', w: 1280, h: 720, fps: 30 }).join(' ') === '-preset medium -global_quality 20', 'Quick Sync at high quality');
  ok(encoderArgs('h264_amf', { quality: 'standard', codec: 'h264', w: 1280, h: 720, fps: 30 }).join(' ').startsWith('-quality quality -rc cqp -qp_i 24'), 'AMF at constant quality');
  setGpuProbe(null);
  process.env.HYDOR_VIDEO_GPU = 'off';
}

// ---- what ffmpeg says of a file, without ffprobe; what whisper.cpp says, with times -------------------------------------

{
  const said = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'file:rot.mp4':
  Duration: 00:01:03.50, start: 0.000000, bitrate: 308 kb/s
  Stream #0:0[0x1](und): Video: mjpeg (Baseline), yuvj420p(pc), 300x300 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)
  Stream #0:1[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 228 kb/s, 29.97 fps, 29.97 tbr, 12800 tbn (default)
    Side data:
      Display Matrix: rotation of -90.00 degrees
  Stream #0:2[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
At least one output file must be specified`;
  const i = readFfmpegInfo(said)!;
  ok(i.width === 1920 && i.height === 1080 && i.duration === 63.5 && i.fps === 29.97 && i.rotation === 270 && i.audio && i.video, `read from ffmpeg's words, past a cover picture: ${J(i)}`);
  ok(readFfmpegInfo('No such file or directory') === null, 'nothing read');
  const t = readTimed('[00:00:00.000 --> 00:00:01.500]   Hello there.\nnoise\n[00:01:02.250 --> 00:01:04.000]  [BLANK_AUDIO]\n[00:01:04.000 --> 00:01:05.500]  Second line');
  ok(J(t) === J([{ from: 0, to: 1.5, text: 'Hello there.' }, { from: 64, to: 65.5, text: 'Second line' }]), `whisper's lines with times, its marks for silence left out: ${J(t)}`);
}

// ---- the app around it, and real edits --------------------------------------------------------------------------

const ff = await hasFfmpeg();
if (!ff) console.log('(no ffmpeg here: the real edits, the jobs and edit_video are not tested)');

const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const events: { t: string; id?: string; data?: any }[] = [];
const deps = {
  app,
  db,
  sessions: { adapterByRun: () => null },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (e: { t: string }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://hydor.example',
} as unknown as Deps;
media.routes!(deps);
videoEdit.routes!(deps);
voice.routes!(deps);
await app.ready();
const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json' } });
const until = async (cond: () => boolean | Promise<boolean>, ms = 90_000) => {
  const end = Date.now() + ms;
  while (!(await cond()) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return cond();
};
const jobOf = async (id: string) => (await req('GET', `/api/mediaedit/video/${id}`)).json();
const finished = async (id: string) => {
  let j: any;
  await until(async () => ['done', 'failed', 'stopped'].includes((j = await jobOf(id)).status));
  return j;
};
const ffprobe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', f], { encoding: 'utf8' }));
/** The colour of one pixel of a video at a moment (or of a picture). */
const pixel = (f: string, t: number, x: number, y: number) => [...execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
const isRed = (p: number[]) => p[0] > 180 && p[1] < 90 && p[2] < 90;
const isBlue = (p: number[]) => p[2] > 160 && p[0] < 90 && p[1] < 90;
/** A frame of a video at a moment, as red, green and blue bytes. */
const frameRgb = (f: string, t: number) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
/** How far apart two frames of width `w` are in a part of them, on average (0 to 255). */
const apart = (a: Buffer, b: Buffer, w: number, x0: number, y0: number, x1: number, y1: number) => {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(a[(y * w + x) * 3 + c] - b[(y * w + x) * 3 + c]);
        n++;
      }
  return sum / n;
};

if (ff) {
  const mk = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
  // Three seconds of a moving picture with a tone; a red and a blue clip; a longer one; a picture; a song; a green screen.
  const clip = path.join(tmp, 'clip.mp4');
  mk(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
  const redClip = path.join(tmp, 'red.mp4');
  mk(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=25:d=2', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', redClip]);
  const blueClip = path.join(tmp, 'blue.mp4');
  mk(['-f', 'lavfi', '-i', 'color=c=blue:s=640x480:r=30:d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', blueClip]);
  const long = path.join(tmp, 'long.mp4');
  mk(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=40', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', long]);
  const song = path.join(tmp, 'song.mp3');
  mk(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', '-c:a', 'libmp3lame', song]);
  const redPng = path.join(tmp, 'red.png');
  mk(['-f', 'lavfi', '-i', 'color=c=red:s=60x20', '-frames:v', '1', redPng]);
  const photo = path.join(tmp, 'photo.png');
  mk(['-f', 'lavfi', '-i', 'testsrc2=size=400x300', '-frames:v', '1', photo]);
  const green = path.join(tmp, 'green.png');
  mk(['-f', 'lavfi', '-i', 'color=c=0x00ff00:s=100x100', '-vf', 'drawbox=x=30:y=30:w=40:h=40:color=white:t=fill', '-frames:v', '1', green]);
  const red = fs.readFileSync(redPng);
  ok(J(pngSize(red)) === '{"w":60,"h":20}', 'a PNG’s size from its header');

  const info = (await req('GET', `/api/mediaedit/video/info?src=${encodeURIComponent(clip)}`)).json();
  ok(info.ffmpeg && near(info.duration, 3, 0.1) && info.width === 320 && info.height === 180 && info.audio && info.fps === 25, `what the editor learns of a video: ${J(info)}`);
  const pinfo = (await req('GET', `/api/mediaedit/video/info?src=${encodeURIComponent(photo)}`)).json();
  const sinfo = (await req('GET', `/api/mediaedit/video/info?src=${encodeURIComponent(song)}`)).json();
  ok(pinfo.picture && pinfo.width === 400 && pinfo.height === 300 && sinfo.sound && near(sinfo.duration, 6, 0.1), `of a picture and a sound: ${J(pinfo)} ${J(sinfo)}`);
  const strip = await req('GET', `/api/mediaedit/video/strip?src=${encodeURIComponent(clip)}&n=6&h=48&from=1&to=2`);
  ok(strip.statusCode === 200 && strip.headers['content-type'] === 'image/jpeg' && strip.rawPayload.length > 1000, 'six frames of a part side by side for the timeline');
  const peaks = (await req('GET', `/api/mediaedit/video/peaks?src=${encodeURIComponent(clip)}&n=50`)).json();
  ok(peaks.peaks?.length === 50 && Math.max(...peaks.peaks) === 1, 'the shape of its sound, for the timeline');
  ok((await req('GET', `/api/mediaedit/video/info?src=${encodeURIComponent(path.join(tmp, 'test.db'))}`)).statusCode === 400, 'not a video, a picture or a sound: refused');
  const enc = (await req('GET', '/api/mediaedit/video/encoders')).json();
  ok(enc.ffmpeg && enc.h264 && enc.webm && enc.gpu.forcedOff, `what this ffmpeg can make: ${J(enc)}`);
  const up = await app.inject({ method: 'POST', url: '/api/mediaedit/video/sound', payload: fs.readFileSync(song), headers: { 'content-type': 'application/octet-stream' } });
  const kept = up.json();
  ok(/^naget-sound:[a-f0-9]{40}$/.test(kept.src) && near(kept.duration, 6, 0.2), `a sound from this device kept: ${up.body}`);
  const back = await req('GET', `/api/mediaedit/video/sound/${kept.src.slice('naget-sound:'.length)}`);
  ok(back.statusCode === 200 && back.rawPayload.length === fs.statSync(song).size, 'and played back');

  // Two clips joined by a cross dissolve, a picture zooming in after a fade through black, a square: real, on the processor.
  {
    const r = await req('POST', '/api/mediaedit/video', {
      src: redClip,
      recipe: {
        clips: [{ transition: { kind: 'dissolve', length: 1 } }, { src: blueClip, transition: { kind: 'black', length: 0.5 } }, { src: photo, length: 1.5, motion: motionPreset('in', 1), fit: 'fill' }],
        shape: '1:1',
        audio: [{ src: kept.src, track: 'music', start: 0.5, volume: 0.5 }],
        fixes: { duck: 0.6, loudness: 'web' },
      },
      encoder: 'cpu',
      to: { file: redClip, as: 'copy' },
    });
    const j = await finished(r.json().job);
    const len = 2 + 2 - 1 + 1.5 - 0.5;
    ok(j.status === 'done' && j.w === 180 && j.h === 180 && near(j.seconds, len, 0.01) && j.made?.gpu === false, `made: ${J(j)}`);
    const pr = ffprobe(j.path);
    ok(near(Number(pr.format.duration), len, 0.15) && pr.streams.some((s: any) => s.codec_type === 'audio'), `its length: the clips less their overlaps (${pr.format.duration})`);
    ok(isRed(pixel(j.path, 0.3, 90, 90)) && isBlue(pixel(j.path, 2.2, 90, 90)), 'red first, then blue');
    const mid = pixel(j.path, 1.5, 90, 90);
    ok(mid[0] > 50 && mid[2] > 50, `half way through the dissolve, both: ${mid}`);
    const dark = pixel(j.path, 2.75, 90, 90);
    ok(dark[0] + dark[1] + dark[2] < 120, `through black between blue and the picture: ${dark}`);
  }

  // An overlay keyed out of a green screen, see-through words of the editor's, colour, In to Out.
  {
    const r = await req('POST', '/api/mediaedit/video', {
      src: clip,
      recipe: {
        clips: [{ grade: { saturation: -1 } }],
        overlays: [{ src: green, start: 0, length: 3, x: 0.5, y: 0.5, w: 0.5, key: { color: '#00ff00', similarity: 0.3, blend: 0.05 } }],
      },
      range: [1, 2.5],
      to: { file: clip, as: 'copy' },
    });
    const j = await finished(r.json().job);
    ok(j.status === 'done' && near(j.seconds, 1.5, 0.01) && near(Number(ffprobe(j.path).format.duration), 1.5, 0.12), `only In to Out: ${J(j)}`);
    const centre = pixel(j.path, 0.5, 160, 90);
    const keyed = pixel(j.path, 0.5, 100, 60);
    ok(centre.every((x) => x > 200), `the overlay's white square in the middle: ${centre}`);
    ok(Math.abs(keyed[0] - keyed[1]) < 30 && Math.abs(keyed[1] - keyed[2]) < 30, `its green taken out: the grey video under it shows (${keyed})`);
  }

  // The graphics card failing an edit (a make-believe one, an encoder no ffmpeg has): made again on the processor at once.
  {
    setGpuProbe({ encoders: async () => new Set(['h264_mf']), renderNodes: () => [], test: async () => true, name: async () => 'Test card', platform: 'win32' });
    delete process.env.HYDOR_VIDEO_GPU;
    const r = await req('POST', '/api/mediaedit/video', { src: clip, recipe: { clips: [{ trim: [0, 1] }] }, to: { file: clip, as: 'copy' } });
    // The make-believe card's encoder does not exist in this ffmpeg as "h264_mf" under Linux: it fails, the processor makes it.
    const j = await finished(r.json().job);
    ok(j.status === 'done' && j.made?.gpu === false && /could not make it, so the processor did/.test(j.note ?? ''), `the processor made it after the card failed: ${J(j)}`);
    ok(near(Number(ffprobe(j.path).format.duration), 1, 0.12), 'and it is right');
    ok(gpuState(db).broken?.includes('h264_mf'), 'that encoder is not used again until the app starts again');
    const again = await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: { clips: [{ trim: [0, 1] }] }, to: { file: clip, as: 'copy' } })).json().job);
    ok(again.status === 'done' && again.made?.gpu === false && !again.note, 'the next one goes to the processor straight away');
    setGpuProbe(null);
    process.env.HYDOR_VIDEO_GPU = 'off';
  }

  // The first recipes still made as they were: trim, a square crop and words drawn here.
  {
    const r = await req('POST', '/api/mediaedit/video', {
      src: clip,
      recipe: { trim: [0.5, 2.5], crop: { x: 70, y: 0, w: 180, h: 180 }, texts: [{ text: 'Hello', from: 0, to: 3, x: 0.5, y: 0.5, size: 0.2, color: '#ffffff', background: '#000000' }] },
      to: { file: clip, as: 'copy' },
    });
    const j = await finished(r.json().job);
    ok(j.status === 'done' && j.w === 180 && j.h === 180 && j.seconds === 2 && j.bytes > 1000, `made beside it: ${J(j)}`);
    const pr = ffprobe(j.path);
    const v = pr.streams.find((s: any) => s.codec_type === 'video');
    ok(v.codec_name === 'h264' && v.width === 180 && pr.streams.some((s: any) => s.codec_type === 'audio' && s.codec_name === 'aac') && near(Number(pr.format.duration), 2, 0.12), 'H.264 and AAC, 2 s, 180×180');
    const plain = await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: { trim: [0.5, 2.5], crop: { x: 70, y: 0, w: 180, h: 180 } }, to: { file: clip, as: 'copy' } })).json().job);
    const [lit, bare] = [frameRgb(j.path, 1), frameRgb(plain.path, 1)];
    ok(apart(lit, bare, 180, 50, 75, 130, 105) > 40 && apart(lit, bare, 180, 0, 0, 30, 30) < 10, 'the words drawn in its middle, nowhere else');
  }

  // A part cut, twice as fast, the editor's drawing laid on, music under it; a frame as a picture.
  {
    const r = await req('POST', '/api/mediaedit/video', {
      src: clip,
      recipe: { cuts: [[1, 2]], speed: 2, fadeOut: 0.3, music: { src: song, volume: 0.5 }, texts: [{ text: 'Red', from: 0, to: 3, x: 0.25, y: 0.25, size: 0.1, color: '#ffffff' }] },
      drawn: [`data:image/png;base64,${red.toString('base64')}`],
      to: { file: clip, as: 'copy' },
    });
    const j = await finished(r.json().job);
    ok(j.status === 'done' && j.seconds === 1 && near(Number(ffprobe(j.path).format.duration), 1, 0.12), `two seconds kept, twice as fast: ${J(j)}`);
    ok(isRed(pixel(j.path, 0.2, 80, 45)), `the drawing where the editor put it: ${pixel(j.path, 0.2, 80, 45)}`);
    const f = await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: { rotate: 90, texts: [{ text: 'Red', from: 0, to: 3, x: 0.5, y: 0.5, size: 0.1, color: '#ffffff' }] }, drawn: [`data:image/png;base64,${red.toString('base64')}`], format: 'png', frame: 1.5, to: { file: clip, as: 'copy' } })).json().job);
    const fp = ffprobe(f.path).streams[0];
    ok(f.status === 'done' && f.path.endsWith('clip (at 1.5 s).png') && fp.width === 180 && fp.height === 320 && isRed(pixel(f.path, 0, 90, 160)), `a frame, turned, as a PNG beside it, the drawing on it: ${f.path} ${fp.width}×${fp.height}`);
  }

  // Where results go: a deck's video and its still, a deck's picture, the Library, a Library item's file, a file over.
  {
    const deck = await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: { trim: [0, 2], fadeIn: 0.5 }, to: { video: true } })).json().job);
    ok(deck.status === 'done' && /^naget-video:[a-f0-9]{40}$/.test(deck.src) && /^naget-asset:[a-f0-9]{40}$/.test(deck.poster) && deck.w === 320 && deck.h === 180, `a deck's video and its still: ${J(deck)}`);
    ok(!!getVideo(db, deck.src.slice('naget-video:'.length)) && getAsset(db, deck.poster.slice('naget-asset:'.length))?.mime === 'image/jpeg', 'both kept');
    const gif = await finished((await req('POST', '/api/mediaedit/video', { src: deck.src, recipe: {}, format: 'gif', to: { asset: true } })).json().job);
    ok(gif.status === 'done' && getAsset(db, gif.src.slice('naget-asset:'.length))?.mime === 'image/gif', 'a GIF as a deck’s picture');
    ok((await req('POST', '/api/mediaedit/video', { src: deck.src, recipe: {}, format: 'gif', to: { video: true } })).statusCode === 400, 'a GIF is no deck’s video');
    const item = (await req('POST', '/api/media', { path: clip })).json().item;
    ok(item?.kind === 'video', 'a video in the Library');
    events.length = 0;
    const copy = await finished((await req('POST', '/api/mediaedit/video', { src: `media:${item.id}`, recipe: { clips: [{ trim: [0, 1] }, { src: `media:${item.id}`, trim: [2, 3] }] }, to: { media: item.id, as: 'copy' } })).json().job);
    const ci = getMedia(db, copy.media)!;
    ok(copy.status === 'done' && ci.id !== item.id && near(ci.duration, 2, 0.15) && fs.existsSync(ci.file), `a copy of two parts beside it in the Library: ${J(copy)}`);
    const before = getMedia(db, item.id)!;
    const replaced = await finished((await req('POST', '/api/mediaedit/video', { src: `media:${item.id}`, recipe: { trim: [0, 2], crop: { x: 0, y: 0, w: 160, h: 180 } }, to: { media: item.id, as: 'replace' } })).json().job);
    const after = getMedia(db, item.id)!;
    ok(replaced.status === 'done' && after.width === 160 && near(after.duration, 2, 0.12) && after.title === before.title, 'the item’s file replaced, its title kept');
    ok(events.some((e) => e.id === 'media' && e.data?.item?.id === item.id), 'the pages hear of it');
    const mine = path.join(tmp, 'mine.mov');
    mk(['-i', clip, '-c', 'copy', '-f', 'mov', mine]);
    const over = await finished((await req('POST', '/api/mediaedit/video', { src: mine, recipe: { trim: [0, 1.5] }, format: 'webm', to: { file: mine, as: 'replace' } })).json().job);
    ok(over.status === 'done' && over.path === mine && /mov/.test(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name', '-of', 'csv=p=0', mine], { encoding: 'utf8' })), 'written over, still a .mov');
    ok(fs.readdirSync(path.join(config.dataDir, 'trash')).some((n) => n.endsWith('-mine.mov')), 'the old one in the Trash');
  }

  // A job's life: in line behind two, progress, stopped, its result kept.
  {
    const ask = { src: long, recipe: { speed: 0.5 }, to: { file: long, as: 'copy' } };
    const a = (await req('POST', '/api/mediaedit/video', ask)).json();
    const b = (await req('POST', '/api/mediaedit/video', ask)).json();
    const c = (await req('POST', '/api/mediaedit/video', ask)).json();
    ok((await jobOf(c.job)).status === 'queued', 'a third waits its turn');
    ok((await req('DELETE', `/api/mediaedit/video/${c.job}`)).json().status === 'stopped', 'one in line stopped at once');
    ok(await until(async () => ((await jobOf(a.job)).progress ?? 0) > 0.01, 30_000), 'progress told as it is made');
    await req('DELETE', `/api/mediaedit/video/${a.job}`);
    ok((await finished(a.job)).status === 'stopped', 'one being made stopped, nothing saved');
    await req('DELETE', `/api/mediaedit/video/${b.job}`);
    await finished(b.job);
    ok(!fs.readdirSync(tmp).some((n) => n.startsWith('long (edited)')) && fs.readdirSync(path.join(config.dataDir, 'mediaedit', 'tmp')).length === 0, 'no file left of them, their folders gone');
  }

  // What is refused, in words a person can act on.
  {
    const bad = async (body: unknown, re: RegExp, what: string) => {
      const r = await req('POST', '/api/mediaedit/video', body);
      ok(r.statusCode >= 400 && r.statusCode < 500 && re.test(r.json().error), `${what}: ${r.statusCode} ${r.json().error}`);
    };
    await bad({ src: clip, recipe: {}, format: 'jpg', to: { asset: true } }, /frame: the moment/, 'a picture without its moment');
    await bad({ src: clip, recipe: { trim: [1, 2], cuts: [[0, 3]] }, to: { video: true } }, /Nothing of the video/, 'nothing left');
    await bad({ src: clip, recipe: {}, to: { somewhere: true } }, /to: where it goes/, 'nowhere to go');
    await bad({ src: song, recipe: {}, to: { video: true } }, /not a video/, 'a sound is not a video');
    await bad({ src: clip, recipe: { music: { src: redPng } }, to: { video: true } }, /not a sound/, 'a picture is not music');
    await bad({ src: clip, recipe: { clips: [{ src: song }] }, to: { video: true } }, /not a video .* or a picture/, 'a sound is not a clip');
    await bad({ src: clip, recipe: {}, to: { asset: true } }, /deck’s video/, 'a video is no picture');
    await bad({ src: clip, recipe: {}, to: { file: path.join(config.dataDir, 'media', 'x.mp4'), as: 'copy' } }, /app’s own data/, 'nothing written into the app’s own data');
    await bad({ src: clip, recipe: {}, range: [1, 1.01], to: { video: true } }, /too short/, 'In and Out too close');
  }

  // Captions: what is said, from a stand-in whisper.cpp on the PATH.
  {
    const off = await req('POST', '/api/mediaedit/video/captions', { src: clip, recipe: {} });
    ok(off.statusCode === 409 && /Settings → Voice/.test(off.json().error), `without speech recognition, it says where to turn it on: ${off.body}`);
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, 'whisper-cli'),
      '#!/bin/sh\nfor a in "$@"; do case "$a" in --help|-h) echo "usage: whisper-cli --model FILE"; exit 0;; *.wav) test -s "$a" || exit 3;; esac; done\necho "[00:00:00.200 --> 00:00:01.400]  Hello there."\necho "[00:00:01.500 --> 00:00:02.800]  Captions made here."\n',
      { mode: 0o755 },
    );
    process.env.PATH = `${bin}:${process.env.PATH}`;
    fs.mkdirSync(path.join(config.dataDir, 'voice', 'models'), { recursive: true });
    fs.writeFileSync(path.join(config.dataDir, 'voice', 'models', 'ggml-base.bin'), 'model');
    const on = await req('PUT', '/api/voice', { engine: 'local' });
    ok(on.json().ready, `speech recognition on, with the stand-in: ${on.body}`);
    const r = await req('POST', '/api/mediaedit/video/captions', { src: clip, recipe: { clips: [{ trim: [0, 2.5] }] } });
    const c = r.json();
    ok(r.statusCode === 200 && c.captions?.length === 2 && c.captions[1].text === 'Captions made here.' && near(c.captions[1].to, 2.5, 0.001) && /^1\n00:00:00,200 --> 00:00:01,400\nHello there\.\n/.test(c.srt), `captions with their times, cut to the timeline, and as .srt: ${r.body}`);
  }

  // edit_video: an agent's edits, its files listed as the conversation's cards read them.
  {
    const cwd = path.join(tmp, 'session');
    fs.mkdirSync(cwd);
    fs.copyFileSync(clip, path.join(cwd, 'take.mp4'));
    fs.copyFileSync(photo, path.join(cwd, 'photo.png'));
    fs.copyFileSync(redClip, path.join(cwd, 'red.mp4'));
    const ctx = { runId: 'run1', key: 'claude:a1', agent: 'claude', cwd, deps } as RunCtx;
    const tool = videoEdit.tools!(ctx).find((t) => t.name === 'edit_video')!;
    ok(!!tool && /free/.test(tool.description) && /nine minutes/.test(tool.description) && /graphics card/.test(tool.description), 'edit_video is there, saying what it costs, how long it waits and where it is made');
    const run = async (args: Record<string, unknown>) => {
      const r = await tool.run(args, ctx);
      return typeof r === 'string' ? { text: r, isError: false } : { text: r.text, isError: !!r.isError };
    };
    const one = await run({ path: 'take.mp4', trim: [0.5, 2.5], aspect: '9:16', texts: [{ text: 'Hi', from: 0.5, to: 1.5, y: 0.5, size: 0.2 }], fade_in: 0.2, name: 'Phone cut' });
    const m = /^(\/.+?\.mp4) \((\d+)×(\d+), ([\d.]+) s, [\d.]+ (?:KB|MB)\)$/.exec(one.text.split('\n')[1] ?? '');
    ok(!one.isError && m && m[1] === path.join(cwd, 'videos', 'phone-cut.mp4') && m[2] === '100' && m[3] === '180' && m[4] === '2', `a tall cut in videos/: ${one.text}`);
    ok(/cropped to 9:16/.test(one.text) && pixel(m![1], 1, 50, 90).join() !== pixel(m![1], 1.8, 50, 90).join(), 'its answer says what was done; the words at their time');
    const turned = await run({ path: 'take.mp4', crop: { x: 0, y: 0, w: 160, h: 180 }, rotate: 90, trim: [0, 0.5], name: 'left half turned' });
    ok(!turned.isError && /left-half-turned\.mp4 \(180×160, /.test(turned.text), `an agent's crop in the video as given, then turned: ${turned.text.split('\n')[1]}`);
    const fr = await run({ path: 'take.mp4', speed: 2, frame: 1 });
    ok(!fr.isError && /^\/.+images\/take-frame\.jpg \(320×180, \d+ KB\)$/.test(fr.text.split('\n')[1]), `a frame of the edited video in images/: ${fr.text}`);
    const reel = await run({
      clips: [{ path: 'red.mp4' }, { path: 'photo.png', seconds: 1.5, zoom: 'in' }, { path: 'take.mp4', trim: [0, 1.5] }],
      transition: { kind: 'dissolve', seconds: 0.5 },
      shape: '9:16',
      fit: 'fill',
      color: { look: 'warm', vignette: 0.3 },
      overlays: [{ path: 'photo.png', x: 0.8, y: 0.12, width: 0.2, opacity: 0.8 }],
      captions: true,
      caption_style: 'bold',
      voice_cleanup: 0.5,
      loudness: 'web',
      size: 360,
      name: 'Reel',
    });
    const rm = /^(\/.+?\.mp4) \((\d+)×(\d+), ([\d.]+) s/.exec(reel.text.split('\n')[1] ?? '');
    ok(!reel.isError && rm && rm[2] === '180' && rm[3] === '320' && rm[4] === '4', `several clips joined by dissolves, 9:16, a look, an overlay, captions: ${reel.text}`);
    ok(/3 clips joined by cross dissolve/.test(reel.text) && /2 captions/.test(reel.text) && fs.existsSync(path.join(cwd, 'videos', 'reel.srt')) && /reel\.srt/.test(reel.text), 'its answer says so, and the .srt is beside it');
    const gif = await run({ path: path.join(cwd, 'take.mp4'), format: 'gif', size: 120 });
    ok(!gif.isError && /images\/take-edited\.gif \(212×120, [\d.]+ s, \d+ KB\)/.test(gif.text), `a GIF in images/: ${gif.text}`);
    ok((await run({ path: 'nothing.mp4' })).isError && (await run({ path: 'take.mp4', trim: [5, 6] })).isError && (await run({ path: 'take.mp4', format: 'jpg' })).isError, 'what cannot be done says why');
    ok((await run({ job: '0123456789abcdef' })).isError, 'an unknown job');
  }

  // ffmpeg nowhere: what the editor is told.
  {
    process.env.HYDOR_FFMPEG = '/nonexistent/ffmpeg';
    process.env.HYDOR_PICTURES_PYTHON = '/nonexistent/python';
    forgetFfmpeg();
    const none = (await req('GET', `/api/mediaedit/video/info?src=${encodeURIComponent(clip)}`)).json();
    ok(none.ffmpeg === false && /set up the picture tools in Settings → Images, video and audio, or install ffmpeg/.test(none.why), `no ffmpeg anywhere: ${J(none)}`);
    const r = await req('POST', '/api/mediaedit/video', { src: clip, recipe: {}, to: { video: true } });
    ok(r.statusCode === 400 && /Video editing needs ffmpeg/.test(r.json().error), 'an edit says how to get it');
    delete process.env.HYDOR_FFMPEG;
    delete process.env.HYDOR_PICTURES_PYTHON;
    forgetFfmpeg();
    ok(!!(await ffmpegTools()) && !!(await probe(clip)), 'found again');
  }
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
