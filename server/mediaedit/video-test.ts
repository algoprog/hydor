// Script tests for the video editor's server: the recipe (normalising, the edited video's time, shapes and turns), the
// ffmpeg command it becomes (cuts with their sound, speed kept in tune, crop, turn, colour, words drawn here or laid on
// as the editor drew them, fades, music; a GIF, a frame) and the allow list that guards it, what ffmpeg says of a file
// read without ffprobe, real edits of short clips made here (their length, size and a pixel or two, read back), a job's
// life (in line, progress, stopped, its result kept), every place a result goes (a deck's video and still, a deck's
// picture, the Library, a Library item's file, a file over or beside the original), edit_video writing its files, and
// ffmpeg found in the picture tools' Python, or nowhere.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/mediaedit/video-test.ts
//   DATA_DIR=/tmp/hydor-test-video node dist/dev/video-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { cropToShape, editedLength, editedSize, keptParts, normalizeVideoRecipe, originalRect, shownRect, toEdited, toOriginal, type VideoRecipe } from '../../shared/mediaedit-video.ts';
import { config } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { ffmpegTools, forgetFfmpeg, hasFfmpeg, probe, readFfmpegInfo } from '../media/frames.ts';
import { media } from '../media/index.ts';
import { getMedia } from '../media/store.ts';
import { getAsset, initAssets } from '../pages/assets.ts';
import { getVideo } from '../pages/videos.ts';
import { checkChain, checkPlan, colourMath, graphText, planVideo, scaledSize, tempos, type PlanInput } from './video-plan.ts';
import { pngSize, videoEdit } from './video.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

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

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-video-test-')));

// ---- the recipe ---------------------------------------------------------------------------------------------------

{
  const v = { duration: 10, width: 1920, height: 1080 };
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
      music: { src: ' /tmp/song.mp3 ', start: 50, volume: 0.5 },
      texts: [{ text: '  Hello\r\nthere ', from: 3, to: 2 }, { text: 'Title', from: 1, to: 4, x: 2, y: -1, size: 9, color: '#FFF', background: '#00000080', bold: true }, { text: '' }],
    },
    v,
  );
  ok(JSON.stringify(r.trim) === '[1,9]', 'the trim kept');
  ok(
    JSON.stringify(r.cuts) ===
      JSON.stringify([
        [2, 3.5],
        [5, 6],
      ]),
    `cuts in order, overlapping ones merged, ones outside the trim dropped: ${JSON.stringify(r.cuts)}`,
  );
  ok(r.speed === 2 && r.rotate === 270 && r.brightness === 0.3 && r.contrast === undefined && r.volume === undefined, 'speed, a turn the other way round, colour; what changes nothing left out');
  ok(r.crop && r.crop.x === 0 && r.crop.w === 1000 && r.crop.h === 300 && r.crop.y === 1000, `the crop inside the upright frame (1080 × 1920, turned), its sides even: ${JSON.stringify(r.crop)}`);
  const len = editedLength(r, 10);
  ok(near(len, (8 - 1.5 - 1) / 2, 0.001), `the edited length: ${len}`);
  ok(r.fadeIn === Math.floor((len / 2) * 100) / 100, `a fade no longer than half of it: ${r.fadeIn}`);
  ok(r.music?.src === '/tmp/song.mp3' && r.music.volume === 0.5 && near(r.music.start, len - 0.05, 0.001), `the music starting inside it: ${JSON.stringify(r.music)}`);
  ok(
    r.texts?.length === 1 && r.texts[0].text === 'Title' && r.texts[0].x === 1 && r.texts[0].y === 0 && r.texts[0].size === 0.3 && r.texts[0].color === '#ffffff' && r.texts[0].background === '#00000080' && r.texts[0].bold,
    `texts made to fit (a backwards one and an empty one left out): ${JSON.stringify(r.texts)}`,
  );
  throws(() => normalizeVideoRecipe({ trim: [2, 4], cuts: [[1, 5]] }, v), /Nothing of the video/, 'all of it cut');
  ok(JSON.stringify(normalizeVideoRecipe({ trim: [0, 10], crop: { x: 0, y: 0, w: 1920, h: 1080 }, rotate: 360 }, v)) === '{}', 'an edit that changes nothing is empty');

  const parts = keptParts({ trim: [1, 9], cuts: [[3, 4]] }, 10);
  ok(
    JSON.stringify(parts) ===
      JSON.stringify([
        [1, 3],
        [4, 9],
      ]),
    'the parts kept',
  );
  ok(toEdited(2, parts) === 1 && toEdited(3.5, parts) === 2 && toEdited(5, parts, 2) === 1.5 && toEdited(0, parts) === 0, 'a moment of the original in the edited video (a cut one: where the next part starts)');
  ok(toOriginal(1, parts) === 2 && toOriginal(2.5, parts) === 4.5 && toOriginal(1.5, parts, 2) === 5 && toOriginal(99, parts) === 9, 'and back');

  // Shapes and turns.
  ok(JSON.stringify(cropToShape('16:9', 1920, 1080)) === JSON.stringify({ x: 0, y: 0, w: 1920, h: 1080 }), 'its own shape is all of it');
  const tall = cropToShape('9:16', 1920, 1080)!;
  ok(tall.h === 1080 && tall.w === 606 && tall.x === 656 && tall.y === 0, `9:16 from the middle: ${JSON.stringify(tall)}`);
  const turned = cropToShape('9:16', 1920, 1080, 90)!;
  ok(turned.w === 1080 && turned.h === 1920 && turned.x === 0 && turned.y === 0, `a wide video turned a quarter is already tall: ${JSON.stringify(turned)}`);
  ok(cropToShape('free', 100, 100) === null, 'free is no shape');
  const c = { x: 100, y: 50, w: 400, h: 200 };
  for (const t of [{}, { rotate: 90 as const }, { rotate: 180 as const }, { rotate: 270 as const, flipH: true }, { rotate: 90 as const, flipV: true, flipH: true }]) {
    const back = originalRect(shownRect(c, 1920, 1080, t), 1920, 1080, t);
    ok(JSON.stringify(back) === JSON.stringify(c), `a part of the picture, shown turned and back (${JSON.stringify(t)}): ${JSON.stringify(back)}`);
  }
  ok(JSON.stringify(shownRect(c, 1920, 1080, { rotate: 90 })) === JSON.stringify({ x: 830, y: 100, w: 200, h: 400 }), 'a quarter turn clockwise');
  ok(JSON.stringify(editedSize({ crop: c, rotate: 90 }, 1920, 1080)) === JSON.stringify({ w: 400, h: 200 }) && JSON.stringify(editedSize({ rotate: 90 }, 1920, 1080)) === JSON.stringify({ w: 1080, h: 1920 }), 'the edited picture’s size');
}

// ---- the command --------------------------------------------------------------------------------------------------

const ENC = { h264: 'libx264', vp9: 'libvpx-vp9', opus: true };
const base = (recipe: VideoRecipe, more: Partial<PlanInput> = {}): PlanInput => ({ recipe, video: { duration: 10, width: 640, height: 360, audio: true, fps: 25 }, input: '/v/in.mp4', output: '/v/out.mp4', format: 'mp4', encoders: ENC, ...more });

{
  const p = planVideo(
    base({
      trim: [1, 9],
      cuts: [[3, 4]],
      speed: 2,
      volume: 0.5,
    }),
  );
  ok(p.args.join(' ').includes('-ss 1 -t 8.001 -i file:/v/in.mp4'), `read from the first part kept to the last: ${p.args.join(' ')}`);
  ok(p.graph.includes('split=outputs=2') && p.graph.includes('trim=start=0:end=2') && p.graph.includes('trim=start=3:end=8') && p.graph.includes('atrim=start=3:end=8'), `each part cut out, picture and sound: ${p.graph}`);
  ok(p.graph.includes('concat=n=2:v=1:a=1') && p.graph.includes('setpts=expr=PTS/2') && p.graph.includes('atempo=tempo=2') && p.graph.includes('volume=volume=0.5'), 'joined, twice as fast with its sound in tune, quieter');
  ok(p.seconds === 3.5 && p.audio && p.w === 640 && p.h === 360, 'its length and size');
  ok(p.args.includes('libx264') && p.args.includes('aac') && p.args.includes('+faststart') && p.args.slice(-3).join(' ') === '-f mp4 file:/v/out.mp4', 'H.264 and AAC in an MP4 that plays as it loads');
  checkPlan(p);
  ok(true, 'it reads only its input and writes only its output');

  const q = planVideo(
    base(
      {
        crop: { x: 0, y: 100, w: 360, h: 202 },
        rotate: 90,
        flipH: true,
        contrast: 0.5,
        saturation: -1,
        fadeIn: 0.5,
        fadeOut: 1,
        mute: true,
        music: { src: 'x', volume: 0.8, start: 2 },
        texts: [
          { text: 'A', from: 1, to: 3, x: 0.5, y: 0.5, size: 0.1, color: '#ffffff' },
          { text: 'B\nC', from: 2, to: 9, x: 0.25, y: 0.85, size: 0.05, color: '#ff0000', background: '#000000' },
        ],
      },
      {
        music: '/v/song.mp3',
        texts: [
          { png: '/v/job/drawn0.png', w: 100, h: 40 },
          { font: 'font1.ttf', lines: ['B', 'C'] },
        ],
      },
    ),
  );
  ok(q.graph.startsWith('[0:V]transpose=dir=clock,hflip,crop=w=360:h=202:x=0:y=100,colorchannelmixer='), `turned, mirrored, cropped, coloured: ${q.graph.slice(0, 120)}`);
  ok(q.w === 360 && q.h === 202, 'its size');
  ok(q.graph.includes("[p0][1:v]overlay=x=130:y=81:enable='between(t,1,3)'[p1]"), `the editor's drawing laid on, centred where it goes, while it shows: ${q.graph}`);
  ok(
    q.graph.includes('drawtext=fontfile=font1.ttf:textfile=text1-0.txt:expansion=none:fontsize=10') && q.graph.includes('text1-1.txt') && q.graph.includes('boxcolor=0x000000@1') && q.files['text1-1.txt'] === 'C',
    'words drawn here, a line at a time, from files of the job’s folder',
  );
  ok(q.graph.includes('fade=t=in:st=0:d=0.5') && q.graph.includes('fade=t=out:st=9:d=1') && q.graph.includes('afade=t=out:st=9:d=1'), 'faded in and out, picture and sound');
  ok(!q.graph.includes('[0:a]') && q.graph.includes('[2:a]atrim=start=0:end=8') && q.graph.includes('adelay=delays=2000:all=1') && q.audio, `no sound of its own, the music in from 2 s: ${q.graph}`);
  ok(q.inputs.join(',') === '/v/in.mp4,/v/job/drawn0.png,/v/song.mp3', 'its inputs: the video, the drawing, the music');
  const m = colourMath({ contrast: 0.5, saturation: -1 })!;
  ok(near(m.m[0], 0.213 * 1.3, 0.001) && near(m.add, -0.15, 0.001), 'colour as the browser’s contrast() and saturate() make it');

  const mixed = planVideo(base({ music: { src: 'x' } }, { music: '/v/song.mp3' }));
  ok(mixed.graph.includes('amix=inputs=2:duration=first:dropout_transition=0:normalize=0'), 'music mixed under its own sound, neither made quieter');

  const gif = planVideo(base({ trim: [0, 4], speed: 0.5 }, { format: 'gif', output: '/v/out.gif' }));
  ok(
    gif.graph.includes('palettegen') && gif.graph.includes('paletteuse=dither=bayer') && gif.graph.includes('fps=fps=15') && gif.graph.includes('scale=w=480:h=270:flags=lanczos') && gif.args.includes('-an') && !gif.graph.includes('[0:a]'),
    `a GIF: its own colours, 15 frames a second, 480 wide, no sound: ${gif.graph}`,
  );
  ok(gif.seconds === 8, 'slower is longer');

  const frame = planVideo(
    base({ crop: { x: 0, y: 0, w: 320, h: 360 }, texts: [{ text: 'A', from: 4, to: 6, x: 0.5, y: 0.5, size: 0.1, color: '#ffffff' }] }, { format: 'jpg', frame: 5, output: '/v/f.jpg', size: 180, texts: [{ png: '/v/d.png', w: 10, h: 10 }] }),
  );
  ok(frame.args.join(' ').includes('-ss 5 -i file:/v/in.mp4') && frame.args.includes('-frames:v') && !frame.args.includes('-progress'), 'a frame: read at its moment, one picture');
  ok(frame.graph.includes('overlay=x=155:y=175[p1]') && !frame.graph.includes('enable'), 'the words showing at that moment, without times');
  ok(frame.w === 180 && frame.h === 202, `made smaller on its shorter side: ${frame.w}×${frame.h}`);

  const webm = planVideo(base({}, { format: 'webm', output: '/v/o.webm' }));
  ok(webm.args.includes('libvpx-vp9') && webm.args.includes('libopus') && webm.args.slice(-2)[0] === 'webm', 'WebM: VP9 and Opus');
  throws(() => planVideo(base({}, { format: 'webm', encoders: { h264: 'libx264' } })), /cannot make WebM/, 'no WebM without its encoder');
  ok(planVideo(base({}, { container: 'mov', output: '/v/o.mov' })).args.slice(-2)[0] === 'mov', 'a .mov written over stays a .mov');
  ok(planVideo(base({}, { video: { duration: 10, width: 641, height: 361, audio: false } })).graph.startsWith('[0:V]crop=w=640:h=360:x=0:y=0'), 'odd sides made even');
  ok(JSON.stringify(tempos(0.25)) === '[0.5,0.5]' && JSON.stringify(tempos(4)) === '[2,2]' && JSON.stringify(tempos(3)) === '[2,1.5]' && tempos(1).length === 0, 'speeds as atempo takes them');
  ok(JSON.stringify(scaledSize(1920, 1080, { gif: true })) === '{"w":480,"h":270}' && JSON.stringify(scaledSize(1080, 1920, { size: 720 })) === '{"w":720,"h":1280}', 'sizes made smaller');

  // The allow list.
  throws(() => checkChain({ ins: ['0:v'], filters: [{ name: 'movie', args: [['filename', 'x']] }], outs: ['o'] }), /may not use: movie/, 'a filter that reads files is refused');
  throws(() => checkChain({ ins: ['0:v'], filters: [{ name: 'drawtext', args: [['textfile', '/etc/passwd']] }], outs: ['o'] }), /only the job's own files/, 'a file outside the job’s folder is refused');
  throws(() => checkChain({ ins: ['0:v'], filters: [{ name: 'drawtext', args: [['text', "a'[x];movie=y"]] }], outs: ['o'] }), /value the plan may not use/, 'a value that would close its quote is refused');
  throws(() => checkChain({ ins: ['0:v];[1'], filters: [{ name: 'null' }], outs: ['o'] }), /label/, 'a label that would start another chain is refused');
  ok(graphText([{ ins: ['0:v'], filters: [{ name: 'null' }], outs: ['o'] }]) === '[0:v]null[o]', 'a graph as ffmpeg reads it');
  const sneaky = { ...p, args: [...p.args.slice(0, -1), '-i', 'file:/etc/passwd', p.args[p.args.length - 1]] };
  throws(() => checkPlan(sneaky), /reads something/, 'a command reading what it was not given is refused');
}

// ---- what ffmpeg says of a file, without ffprobe ----------------------------------------------------------------

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
  ok(i.width === 1920 && i.height === 1080 && i.duration === 63.5 && i.fps === 29.97 && i.rotation === 270 && i.audio && i.video, `read from ffmpeg's words, past a cover picture: ${JSON.stringify(i)}`);
  const silent = readFfmpegInfo('  Duration: N/A, bitrate: N/A\n  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv), 640x360, SAR 1:1 DAR 16:9, 25 fps, 25 tbr, 1k tbn\n      displaymatrix: rotation of 90.00 degrees')!;
  ok(silent.duration === undefined && !silent.audio && silent.width === 640 && silent.rotation === 90, `no length, no sound: ${JSON.stringify(silent)}`);
  ok(readFfmpegInfo('No such file or directory') === null, 'nothing read');
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
await app.ready();
const req = (method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json' } });
const until = async (cond: () => boolean | Promise<boolean>, ms = 60_000) => {
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
  // Three seconds of a moving picture at 25 frames a second, with a tone; a longer one; a picture of a red box; a song.
  const clip = path.join(tmp, 'clip.mp4');
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=25:duration=3',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    clip,
  ]);
  const long = path.join(tmp, 'long.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=40', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', long]);
  const song = path.join(tmp, 'song.mp3');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', '-c:a', 'libmp3lame', song]);
  const redPng = path.join(tmp, 'red.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=60x20', '-frames:v', '1', redPng]);
  const red = fs.readFileSync(redPng);
  ok(JSON.stringify(pngSize(red)) === '{"w":60,"h":20}', 'a PNG’s size from its header');

  const info = (await req('GET', `/api/mediaedit/video/info?src=${encodeURIComponent(clip)}`)).json();
  ok(info.ffmpeg && near(info.duration, 3, 0.1) && info.width === 320 && info.height === 180 && info.audio && info.fps === 25, `what the editor learns of it: ${JSON.stringify(info)}`);
  const strip = await req('GET', `/api/mediaedit/video/strip?src=${encodeURIComponent(clip)}&n=6&h=48`);
  ok(strip.statusCode === 200 && strip.headers['content-type'] === 'image/jpeg' && strip.rawPayload.length > 1000, 'six frames side by side for the timeline');
  fs.writeFileSync(path.join(tmp, 'strip.jpg'), strip.rawPayload);
  const sp = ffprobe(path.join(tmp, 'strip.jpg')).streams[0];
  ok(sp.height === 48 && Math.abs(sp.width - 6 * 86) <= 6, `as tall as asked, six frames wide: ${sp.width}×${sp.height}`);
  ok((await req('GET', `/api/mediaedit/video/info?src=${encodeURIComponent(path.join(tmp, 'test.db'))}`)).statusCode === 400, 'not a video: refused');

  // Trim, a square crop and words drawn here (as an agent's are): two seconds, 180 pixels square, a copy beside it.
  {
    const r = await req('POST', '/api/mediaedit/video', {
      src: clip,
      recipe: { trim: [0.5, 2.5], crop: { x: 70, y: 0, w: 180, h: 180 }, texts: [{ text: 'Hello', from: 0, to: 3, x: 0.5, y: 0.5, size: 0.2, color: '#ffffff', background: '#000000' }] },
      to: { file: clip, as: 'copy' },
    });
    ok(r.statusCode === 200 && ['queued', 'running'].includes(r.json().status) && /^[a-f0-9]{16}$/.test(r.json().job), `a job: ${r.body}`);
    const j = await finished(r.json().job);
    ok(j.status === 'done' && j.path === path.join(tmp, 'clip (edited).mp4') && j.w === 180 && j.h === 180 && j.seconds === 2 && j.bytes > 1000, `made beside it: ${JSON.stringify(j)}`);
    const pr = ffprobe(j.path);
    const v = pr.streams.find((s: any) => s.codec_type === 'video');
    ok(
      v.codec_name === 'h264' && v.width === 180 && v.height === 180 && pr.streams.some((s: any) => s.codec_type === 'audio' && s.codec_name === 'aac') && near(Number(pr.format.duration), 2, 0.12),
      `H.264 and AAC, 2 s, 180×180: ${JSON.stringify(pr)}`,
    );
    const plain = await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: { trim: [0.5, 2.5], crop: { x: 70, y: 0, w: 180, h: 180 } }, to: { file: clip, as: 'copy' } })).json().job);
    const [lit, bare] = [frameRgb(j.path, 1), frameRgb(plain.path, 1)];
    const inside = apart(lit, bare, 180, 50, 75, 130, 105);
    const outside = apart(lit, bare, 180, 0, 0, 30, 30);
    ok(inside > 40 && outside < 10, `the words drawn in its middle, nowhere else: ${Math.round(inside)} there, ${Math.round(outside)} in a corner`);
    const again = await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: { trim: [0, 1] }, to: { file: clip, as: 'copy' } })).json().job);
    ok(plain.path === path.join(tmp, 'clip (edited) copy.mp4') && again.path === path.join(tmp, 'clip (edited) copy 2.mp4'), `each copy beside it gets a name of its own: ${again.path}`);
  }

  // A part cut, twice as fast, the editor's drawing laid on, music under it, faded out; and its frame as a picture.
  {
    const r = await req('POST', '/api/mediaedit/video', {
      src: clip,
      recipe: { cuts: [[1, 2]], speed: 2, fadeOut: 0.3, music: { src: song, volume: 0.5 }, texts: [{ text: 'Red', from: 0, to: 3, x: 0.25, y: 0.25, size: 0.1, color: '#ffffff' }] },
      drawn: [`data:image/png;base64,${red.toString('base64')}`],
      to: { file: clip, as: 'copy' },
    });
    const j = await finished(r.json().job);
    ok(j.status === 'done' && j.seconds === 1, `done: ${JSON.stringify(j)}`);
    ok(near(Number(ffprobe(j.path).format.duration), 1, 0.12), 'two seconds kept, played twice as fast: one second');
    ok(isRed(pixel(j.path, 0.2, 80, 45)), `the drawing where the editor put it: ${pixel(j.path, 0.2, 80, 45)}`);
    const f = await finished(
      (
        await req('POST', '/api/mediaedit/video', {
          src: clip,
          recipe: { rotate: 90, texts: [{ text: 'Red', from: 0, to: 3, x: 0.5, y: 0.5, size: 0.1, color: '#ffffff' }] },
          drawn: [`data:image/png;base64,${red.toString('base64')}`],
          format: 'png',
          frame: 1.5,
          to: { file: clip, as: 'copy' },
        })
      ).json().job,
    );
    const fp = ffprobe(f.path).streams[0];
    ok(f.status === 'done' && f.path.endsWith('clip (at 1.5 s).png') && fp.width === 180 && fp.height === 320 && isRed(pixel(f.path, 0, 90, 160)), `a frame, turned, as a PNG beside it, the drawing on it: ${f.path} ${fp.width}×${fp.height}`);
  }

  // Where results go: a deck's video and its still, a deck's picture, the Library, a Library item's file, a file over.
  {
    const deck = await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: { trim: [0, 2], fadeIn: 0.5 }, to: { video: true } })).json().job);
    ok(deck.status === 'done' && /^naget-video:[a-f0-9]{40}$/.test(deck.src) && /^naget-asset:[a-f0-9]{40}$/.test(deck.poster) && deck.w === 320 && deck.h === 180, `a deck's video and its still: ${JSON.stringify(deck)}`);
    ok(!!getVideo(db, deck.src.slice('naget-video:'.length)) && getAsset(db, deck.poster.slice('naget-asset:'.length))?.mime === 'image/jpeg', 'both kept');
    const edited = await finished((await req('POST', '/api/mediaedit/video', { src: deck.src, recipe: { trim: [0, 1] }, to: { video: true } })).json().job);
    ok(edited.status === 'done' && edited.src !== deck.src && near(edited.seconds, 1, 0.01), 'a deck’s video edited in turn');
    const gif = await finished((await req('POST', '/api/mediaedit/video', { src: deck.src, recipe: {}, format: 'gif', to: { asset: true } })).json().job);
    ok(gif.status === 'done' && getAsset(db, gif.src.slice('naget-asset:'.length))?.mime === 'image/gif', `a GIF as a deck's picture: ${JSON.stringify(gif)}`);
    ok((await req('POST', '/api/mediaedit/video', { src: deck.src, recipe: {}, format: 'gif', to: { video: true } })).statusCode === 400, 'a GIF is no deck’s video');

    const kept = (await req('POST', '/api/media', { path: clip })).json().item;
    ok(kept?.kind === 'video', 'a video in the Library');
    events.length = 0;
    const copy = await finished((await req('POST', '/api/mediaedit/video', { src: `media:${kept.id}`, recipe: { trim: [0, 1] }, to: { media: kept.id, as: 'copy' } })).json().job);
    const item = getMedia(db, copy.media)!;
    ok(copy.status === 'done' && item && item.id !== kept.id && item.kind === 'video' && near(item.duration, 1, 0.12) && fs.existsSync(item.file), `a copy beside it in the Library: ${JSON.stringify(copy)}`);
    ok(fs.existsSync(path.join(config.dataDir, 'media', `${item.id}.still.jpg`)), 'with its still');
    const frameItem = await finished((await req('POST', '/api/mediaedit/video', { src: `/api/media/${kept.id}/file`, recipe: {}, frame: 1, to: { library: true, session: 'claude:abc' } })).json().job);
    const fi = getMedia(db, frameItem.media)!;
    ok(frameItem.status === 'done' && fi.kind === 'image' && fi.mime === 'image/jpeg' && fi.sessionKey === 'claude:abc', 'a frame as a new picture in the Library, from its session');
    const before = getMedia(db, kept.id)!;
    const replaced = await finished((await req('POST', '/api/mediaedit/video', { src: `media:${kept.id}`, recipe: { trim: [0, 2], crop: { x: 0, y: 0, w: 160, h: 180 } }, to: { media: kept.id, as: 'replace' } })).json().job);
    const after = getMedia(db, kept.id)!;
    ok(
      replaced.status === 'done' && replaced.media === kept.id && after.width === 160 && near(after.duration, 2, 0.12) && after.bytes !== before.bytes && after.title === before.title && after.updatedAt > before.updatedAt,
      `the item's file replaced, its title kept: ${JSON.stringify(after)}`,
    );
    ok(
      events.some((e) => e.id === 'media' && e.data?.item?.id === kept.id && e.data.item.width === 160),
      'the pages hear of it',
    );
    ok((await req('POST', '/api/mediaedit/video', { src: `media:${kept.id}`, recipe: {}, format: 'gif', to: { media: kept.id, as: 'replace' } })).statusCode === 400, 'a GIF is not put over a video');

    const mine = path.join(tmp, 'mine.mov');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-c', 'copy', '-f', 'mov', mine]);
    const over = await finished((await req('POST', '/api/mediaedit/video', { src: mine, recipe: { trim: [0, 1.5] }, format: 'webm', to: { file: mine, as: 'replace' } })).json().job);
    ok(
      over.status === 'done' && over.path === mine && near(Number(ffprobe(mine).format.duration), 1.5, 0.12) && /mov/.test(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name', '-of', 'csv=p=0', mine], { encoding: 'utf8' })),
      'written over, still a .mov',
    );
    const trash = path.join(config.dataDir, 'trash');
    ok(fs.existsSync(trash) && fs.readdirSync(trash).some((n) => n.endsWith('-mine.mov')), 'the old one in the Trash');
  }

  // A job's life: in line behind two, progress, stopped, its result kept.
  {
    const ask = { src: long, recipe: { speed: 0.5 }, to: { file: long, as: 'copy' } };
    const a = (await req('POST', '/api/mediaedit/video', ask)).json();
    const b = (await req('POST', '/api/mediaedit/video', ask)).json();
    const c = (await req('POST', '/api/mediaedit/video', ask)).json();
    ok((await jobOf(c.job)).status === 'queued', 'a third waits its turn');
    const stoppedC = (await req('DELETE', `/api/mediaedit/video/${c.job}`)).json();
    ok(stoppedC.status === 'stopped', 'one in line stopped at once');
    ok(await until(async () => ((await jobOf(a.job)).progress ?? 0) > 0.01, 30_000), `progress told as it is made: ${(await jobOf(a.job)).progress}`);
    const stoppedA = await (async () => (await req('DELETE', `/api/mediaedit/video/${a.job}`)).json())();
    ok(stoppedA.job === a.job, 'one being made asked to stop');
    const ja = await finished(a.job);
    ok(ja.status === 'stopped' && !ja.path, 'stopped, nothing saved');
    await req('DELETE', `/api/mediaedit/video/${b.job}`);
    await finished(b.job);
    ok(!fs.readdirSync(tmp).some((n) => n.startsWith('long (edited)')), 'no file left of them');
    ok(fs.readdirSync(path.join(config.dataDir, 'mediaedit', 'tmp')).length === 0, 'their folders gone');
    ok((await req('GET', '/api/mediaedit/video/0123456789abcdef')).statusCode === 404 && (await req('GET', '/api/mediaedit/video/x')).statusCode === 400, 'an unknown job');
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
    await bad({ src: clip, recipe: { music: { src: clip } }, to: { video: true } }, /not a sound/, 'a video is not music');
    await bad({ src: clip, recipe: {}, to: { asset: true } }, /deck’s video/, 'a video is no picture');
    const own = path.join(config.dataDir, 'media', 'x.mp4');
    await bad({ src: clip, recipe: {}, to: { file: own, as: 'copy' } }, /app’s own data/, 'nothing written into the app’s own data');
  }

  // edit_video: an agent's edits, its files listed as the conversation's cards read them.
  {
    const cwd = path.join(tmp, 'session');
    fs.mkdirSync(cwd);
    fs.copyFileSync(clip, path.join(cwd, 'take.mp4'));
    const ctx = { runId: 'run1', key: 'claude:a1', agent: 'claude', cwd, deps } as RunCtx;
    const tool = videoEdit.tools!(ctx).find((t) => t.name === 'edit_video')!;
    ok(!!tool && /free/.test(tool.description) && /nine minutes/.test(tool.description), 'edit_video is there, saying what it costs and how long it waits');
    const run = async (args: Record<string, unknown>) => {
      const r = await tool.run(args, ctx);
      return typeof r === 'string' ? { text: r, isError: false } : { text: r.text, isError: !!r.isError };
    };
    const one = await run({ path: 'take.mp4', trim: [0.5, 2.5], aspect: '9:16', texts: [{ text: 'Hi', from: 0.5, to: 1.5, y: 0.5, size: 0.2 }], fade_in: 0.2, name: 'Phone cut' });
    const line = one.text.split('\n')[1] ?? '';
    const m = /^(\/.+?\.mp4) \((\d+)×(\d+), ([\d.]+) s, [\d.]+ (?:KB|MB)\)$/.exec(line);
    ok(!one.isError && m && m[1] === path.join(cwd, 'videos', 'phone-cut.mp4') && m[2] === '100' && m[3] === '180' && m[4] === '2', `a tall cut in videos/, listed as generate_video lists its own: ${one.text}`);
    ok(!/\bwith /.test(one.text) && /cropped to 9:16/.test(one.text), `its answer says what was done: ${one.text}`);
    const text = pixel(m![1], 1, 50, 90);
    const plain = pixel(m![1], 1.8, 50, 90);
    ok(text.join() !== plain.join(), 'the words shown at their time of the edited video, gone after');
    const turned = await run({ path: 'take.mp4', crop: { x: 0, y: 0, w: 160, h: 180 }, rotate: 90, trim: [0, 0.5], name: 'left half turned' });
    ok(!turned.isError && /left-half-turned\.mp4 \(180×160, /.test(turned.text), `an agent's crop in the video as given, then turned: ${turned.text.split('\n')[1]}`);
    const fr = await run({ path: 'take.mp4', speed: 2, frame: 1 });
    ok(!fr.isError && /^\/.+images\/take-frame\.jpg \(320×180, \d+ KB\)$/.test(fr.text.split('\n')[1]), `a frame of the edited video in images/: ${fr.text}`);
    const gif = await run({ path: path.join(cwd, 'take.mp4'), format: 'gif', size: 120 });
    ok(!gif.isError && /images\/take-edited\.gif \(214×120, [\d.]+ s, \d+ KB\)/.test(gif.text), `a GIF in images/: ${gif.text}`);
    const deckSrc = (await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: {}, to: { video: true } })).json().job)).src;
    const fromDeck = await run({ path: deckSrc, mute: true, music: path.join(tmp, 'song.mp3'), music_start: 1 });
    ok(!fromDeck.isError && /videos\/video-edited\.mp4/.test(fromDeck.text), `a deck's video edited, music under it: ${fromDeck.text}`);
    ok((await run({ path: 'nothing.mp4' })).isError && (await run({ path: 'take.mp4', trim: [5, 6] })).isError && (await run({ path: 'take.mp4', format: 'jpg' })).isError, 'what cannot be done says why');
    const late = await run({ job: '0123456789abcdef' });
    ok(late.isError && /No such edit/.test(late.text), 'an unknown job');
  }

  // ffmpeg in the picture tools' Python only (no ffprobe there): sizes and lengths read from what it says.
  {
    const py = process.env.HYDOR_TEST_PICTURES_PYTHON ?? '/tmp/hydor-mr-f2-iio/venv/bin/python';
    if (fs.existsSync(py)) {
      process.env.HYDOR_FFMPEG = '/nonexistent/ffmpeg';
      process.env.HYDOR_PICTURES_PYTHON = py;
      forgetFfmpeg();
      const t = await ffmpegTools();
      ok(t?.portable && !t.ffprobe && /imageio_ffmpeg/.test(t.ffmpeg), `the picture tools' portable ffmpeg: ${t?.ffmpeg}`);
      const p = await probe(clip);
      ok(p?.width === 320 && p.height === 180 && near(p.duration, 3, 0.1) && p.audio && p.video, `its size and length from ffmpeg's words: ${JSON.stringify(p)}`);
      const j = await finished((await req('POST', '/api/mediaedit/video', { src: clip, recipe: { trim: [0, 1], texts: [{ text: 'Γειά 你好', from: 0, to: 1 }] }, to: { file: clip, as: 'copy' } })).json().job);
      ok(j.status === 'done' && near(Number(ffprobe(j.path).format.duration), 1, 0.12), `an edit made by it, Greek and Chinese words drawn: ${JSON.stringify(j)}`);
    } else console.log('(no picture tools’ Python here: the portable ffmpeg is not tested)');
    process.env.HYDOR_FFMPEG = '/nonexistent/ffmpeg';
    process.env.HYDOR_PICTURES_PYTHON = '/nonexistent/python';
    forgetFfmpeg();
    const none = (await req('GET', `/api/mediaedit/video/info?src=${encodeURIComponent(clip)}`)).json();
    ok(none.ffmpeg === false && /set up the picture tools in Settings → Images, video and audio, or install ffmpeg/.test(none.why), `no ffmpeg anywhere: ${JSON.stringify(none)}`);
    const r = await req('POST', '/api/mediaedit/video', { src: clip, recipe: {}, to: { video: true } });
    ok(r.statusCode === 400 && /Video editing needs ffmpeg/.test(r.json().error), 'an edit says how to get it');
    delete process.env.HYDOR_FFMPEG;
    delete process.env.HYDOR_PICTURES_PYTHON;
    forgetFfmpeg();
  }
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
