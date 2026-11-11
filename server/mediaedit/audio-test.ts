// Script tests for the sound editor's server: the recipe (checked and made to fit), the edits people make (delete with
// and without closing up, a gap, copy and paste, speed, trim, pauses shortened, clips moved and trimmed, words on a
// track and filler words), the ffmpeg command it becomes and the allow list that guards it, what ffmpeg's measuring
// says, real edits of short sounds made here (their length to the sample, a video's sound keeping its length, effects,
// tracks mixed, each kind of file), the routes (a sound's facts, its bytes for the browser, sounds kept, a job's life),
// every place a result goes (a kept sound, the Library, a Library sound's file, a file over or beside the original),
// and edit_audio writing its file.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/mediaedit/audio-test.ts
//   DATA_DIR=/tmp/hydor-sound/test-audio node dist/dev/audio-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import {
  changeSpeed,
  cleanEnv,
  clipEnd,
  clipGainAt,
  copyRange,
  deleteRange,
  envAdd,
  envGainAt,
  envMove,
  envRemove,
  envSlice,
  insertGap,
  isFiller,
  moveClip,
  normalizeSoundRecipe,
  pasteAt,
  rippleTracks,
  roomResponse,
  shortenPauses,
  silencesIn,
  soundClock,
  soundLength,
  trimClip,
  trimTo,
  wordsOnTrack,
  type SoundRecipe,
} from '../../shared/mediaedit-audio.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { hasFfmpeg } from '../media/frames.ts';
import { media } from '../media/index.ts';
import { getMedia } from '../media/store.ts';
import { readTimedWords } from '../voice/whisper.ts';
import { audioGraphText, checkAudioChain, checkSoundPlan, envExpression, gainFor, planSound, readLoudness, type SoundCaps } from './audio-plan.ts';
import { keptSoundFile } from './audio-store.ts';
import { soundEdit } from './audio.ts';
import { editAudioTool, readSilences } from './audio-tool.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

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
const near = (a: number | undefined, b: number, by = 0.01) => a !== undefined && Math.abs(a - b) <= by;
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-sound-test-')));

// ---- the recipe -----------------------------------------------------------------------------------------------------

const one = (len: number, extra: Partial<SoundRecipe> = {}): SoundRecipe => ({ tracks: [{ id: 'a', clips: [{ id: 'c1', src: '', at: 0, from: 0, to: len }] }], ...extra });
const lengths = (src: string) => (src === '' ? 10 : src === 'b.mp3' ? 4 : undefined);
{
  const r = normalizeSoundRecipe(
    {
      tracks: [
        {
          id: 'a',
          volume: 0.01,
          pan: 3,
          clips: [
            { id: 'x', src: '', at: 2, from: 0, to: 50, speed: 1, gain: 0.01, fadeIn: 99 },
            { id: 'y', src: '', at: 11, from: 1, to: 3 },
            { id: 'z', src: '', at: 0, from: 5, to: 5 },
          ],
        },
        { id: 'b', clips: [{ src: 'b.mp3', at: 1, from: 0, to: 9, speed: 9 }] },
      ],
      effects: [{ type: 'gain', p: { db: 99 } }, { type: 'nope' }, { type: 'eq', track: 'a', p: { lowCut: 3, highCut: 300 } }, { type: 'reverb', track: 'missing' }],
    },
    { length: lengths },
  );
  const [a, b] = r.tracks;
  ok(a.clips.length === 2 && a.clips[0].to === 10 && !a.clips[0].speed && !a.clips[0].gain && a.clips[0].fadeIn === 5, `clips inside their sound, what changes nothing left out: ${JSON.stringify(a.clips[0])}`);
  ok(a.clips[1]?.at === 12 && a.clips[1]?.from === 2, `a clip over the one before loses its start: ${JSON.stringify(a.clips[1])}`);
  ok(a.volume === undefined && a.pan === 1, 'track volume and pan in range');
  ok(b.clips[0].speed === 4 && b.clips[0].to === 4, `another sound's clip at most its length, speed at most 4×: ${JSON.stringify(b.clips[0])}`);
  ok(r.effects?.length === 2 && r.effects[0].type === 'eq' && r.effects[0].p?.lowCut === 20 && r.effects[0].p?.highCut === 1000 && r.effects[1].p?.db === 24, `effects checked, a track's first: ${JSON.stringify(r.effects)}`);
  throws(() => normalizeSoundRecipe({ tracks: [{ id: 'a', clips: [] }] }, { length: lengths }), /Nothing would be heard/, 'nothing left');
  throws(() => normalizeSoundRecipe(one(3), { length: lengths, video: true }), /keeps the video’s length/, 'a video’s sound needs its length');
  ok(normalizeSoundRecipe({ ...one(3), length: 10 }, { length: lengths, video: true }).length === 10, 'a video’s sound keeps its length');
  throws(() => normalizeSoundRecipe({ ...one(7200), effects: [{ type: 'reverse' }] }, { length: () => 7200 }), /at most 20 minutes/, 'reverse at most 20 minutes');
  ok(soundClock(65.25) === '1:05.250' && soundClock(3725.5, 1) === '1:02:05.5', `the clock: ${soundClock(65.25)} ${soundClock(3725.5, 1)}`);
}

// ---- the edits ----------------------------------------------------------------------------------------------------------

{
  const r: SoundRecipe = { tracks: [{ id: 'a', clips: [{ id: 'c1', src: '', at: 0, from: 0, to: 10, fadeIn: 1, fadeOut: 1 }] }, { id: 'b', clips: [{ id: 'm', src: 'b.mp3', at: 6, from: 0, to: 4 }] }], effects: [{ id: 'e1', type: 'gain', track: 'a', range: [5, 8] }, { id: 'e2', type: 'gain', range: [7, 9] }] };
  const d = deleteRange(r, ['a'], 2, 4, true);
  const a = d.recipe.tracks[0].clips;
  ok(a.length === 2 && a[0].to === 2 && a[0].fadeIn === 1 && !a[0].fadeOut && a[1].at === 2 && a[1].from === 4 && a[1].fadeOut === 1, `a deletion closes up, fades kept at the clip's ends: ${JSON.stringify(a)}`);
  ok(d.recipe.tracks[1].clips[0].at === 6, 'another track stays');
  ok(JSON.stringify(d.recipe.effects?.[0].range) === '[3,6]' && JSON.stringify(d.recipe.effects?.[1].range) === '[7,9]', `the track's effect moves with it, the whole sound's stays: ${JSON.stringify(d.recipe.effects)}`);
  ok(d.map(9) === 9, 'the timeline stays when not every track is edited');
  const all = deleteRange(r, ['a', 'b'], 2, 4, true);
  ok(all.map(9) === 7 && JSON.stringify(all.recipe.effects?.[1].range) === '[5,7]' && all.recipe.tracks[1].clips[0].at === 4, `every track: all of it moves: ${JSON.stringify(all.recipe.effects)}`);
  const s = deleteRange(r, ['a'], 2, 4, false);
  ok(s.recipe.tracks[0].clips[1].at === 4 && soundLength(s.recipe) === 10, 'for a video, a deletion leaves silence');
  const g = insertGap(r, ['a'], 3, 2);
  ok(g.recipe.tracks[0].clips[1].at === 5 && clipEnd(g.recipe.tracks[0].clips[1]) === 12 && JSON.stringify(g.recipe.effects?.[0].range) === '[7,10]', `a gap moves what follows: ${JSON.stringify(g.recipe.tracks[0].clips)}`);
  const c = copyRange(r, ['a'], 1, 3, 'one.wav');
  ok(c.length === 2 && c.tracks[0].clips[0].at === 0 && c.tracks[0].clips[0].from === 1, 'a copy starts at 0');
  const p = pasteAt(r, ['b'], 0, c, true, 'other.wav');
  ok(p.recipe.tracks[1].clips[0].src === 'one.wav' && p.recipe.tracks[1].clips[1].at === 8, `pasted into another sound's editor, it names the sound it came from: ${JSON.stringify(p.recipe.tracks[1].clips)}`);
  const p2 = pasteAt({ ...r, length: 10 }, ['a'], 9, c, false, 'one.wav');
  ok(p2.recipe.tracks[0].clips.some((x) => x.src === '' && x.at === 9 && Math.abs(x.to - x.from - 1) < 1e-9), 'over what is there, cut at the end, for a video');
  const sp = changeSpeed(r, ['a'], 0, 10, 2);
  ok(sp.recipe.tracks[0].clips[0].speed === 2 && clipEnd(sp.recipe.tracks[0].clips[0]) === 5, 'twice as fast: half as long');
  const tr = trimTo(r, 2, 8, true);
  ok(soundLength(tr.recipe) === 6 && tr.recipe.tracks[0].clips[0].from === 2 && tr.recipe.tracks[1].clips[0].at === 4, `trimmed, it starts at 0: ${JSON.stringify(tr.recipe.tracks)}`);
  const sil = silencesIn([0.5, 0.001, 0.001, 0.001, 0.5, 0.001], 10, { threshold: -40, min: 0.25 });
  ok(JSON.stringify(sil) === '[[0.1,0.4]]', `silences found: ${JSON.stringify(sil)}`);
  const sh = shortenPauses(one(10), ['a'], [[2, 5], [7, 7.3]], { longer: 0.5, keep: 0.4, ripple: true });
  ok(sh.count === 1 && near(sh.removed, 2.6) && near(soundLength(sh.recipe), 7.4), `a long pause shortened: ${sh.removed}`);
  const mv = moveClip(r, 'b', 'm', 'a', 20);
  ok(mv && mv.tracks[0].clips.some((x) => x.id === 'm' && x.at === 20), 'a clip moved to another track');
  ok(moveClip(r, 'b', 'm', 'a', 4) === null || moveClip(r, 'b', 'm', 'a', 4)!.tracks[0].clips.find((x) => x.id === 'm')!.at >= 10, 'never over another clip');
  const tc = trimClip(r, 'a', 'c1', 'end', 7, 10);
  ok(tc.tracks[0].clips[0].to === 7, 'a clip’s end dragged');
  const words = wordsOnTrack(deleteRange(one(10), ['a'], 2, 4, true).recipe.tracks[0], () => [
    { w: 'Hello', a: 0.5, b: 1 },
    { w: 'um,', a: 2.5, b: 2.8 },
    { w: 'world', a: 5, b: 5.5 },
  ]);
  ok(words.length === 2 && words[1].a === 3 && isFiller('Um,') && isFiller('εεε') && !isFiller('umbrella'), `words follow the edit, filler words known: ${JSON.stringify(words)}`);
  const room = roomResponse(1, 48000);
  ok(room[0].length > 40000 && Math.abs(room[0].reduce((n, x) => n + x * x, 0) - 1) < 1e-3 && room[0][100] === roomResponse(1, 48000)[0][100], 'a room’s response: the same each time, its energy 1');
}

// ---- a clip's volume line, and tracks kept in step -----------------------------------------------------------------------

{
  const line = [
    { t: 0, v: 1 },
    { t: 2, v: 0 },
    { t: 4, v: 2 },
  ];
  ok(envGainAt(line, 0) === 1 && envGainAt(line, 1) === 0.5 && envGainAt(line, 2) === 0 && envGainAt(line, 3) === 1 && envGainAt(line, 9) === 2 && envGainAt(undefined, 3) === 1, 'a volume line: straight lines between points, the ends kept beyond them');
  ok(envGainAt([{ t: 1, v: 0.5 }], 0) === 0.5 && envGainAt([{ t: 1, v: 0.5 }], 5) === 0.5, 'one point is a steady volume');
  // Cleaned: in order, in range, closer than a millisecond merged, nothing to hear left out.
  const c = cleanEnv([{ t: 3, v: 9 }, { t: -1, v: 0.5 }, { t: 3.0004, v: 1 }, { t: 'x', v: 1 }, null], 3.5);
  ok(JSON.stringify(c) === '[{"t":0,"v":0.5},{"t":3,"v":1}]', `a line cleaned: ${JSON.stringify(c)}`);
  ok(cleanEnv([{ t: 0, v: 1 }, { t: 2, v: 1 }], 3) === undefined && cleanEnv('x', 3) === undefined, 'a line that changes nothing is no line');
  ok(cleanEnv(Array.from({ length: 200 }, (_, i) => ({ t: i / 100, v: i % 2 ? 0.5 : 1 })), 5)!.length === 64, 'at most 64 points');
  // Cut, the line goes with the sound: split at 1, each part has its own line meeting at the same volume.
  const r: SoundRecipe = { tracks: [{ id: 'a', clips: [{ id: 'c', src: '', at: 10, from: 0, to: 4, env: line }] }] };
  const parts = deleteRange(r, ['a'], 11, 11.5, false).recipe.tracks[0].clips;
  const [p1, p2] = parts;
  ok(parts.length === 2 && JSON.stringify(p1.env) === '[{"t":0,"v":1},{"t":1,"v":0.5}]' && Math.abs(p2.env![0].v - envGainAt(line, 1.5)) < 1e-9 && p2.env!.length === 3 && p2.env![1].t === 0.5, `a split carries the line: ${JSON.stringify(parts)}`);
  ok(Math.abs(clipGainAt(p2, 0.5) - envGainAt(line, 2)) < 1e-9, 'a part plays the volume the whole did there');
  // A faster clip has a shorter line; a trimmed clip's line follows its sound.
  const sp = changeSpeed(r, ['a'], 10, 14, 2).recipe.tracks[0].clips[0];
  ok(sp.speed === 2 && JSON.stringify(sp.env!.map((q) => q.t)) === '[0,1,2]', `twice as fast: the line twice as short: ${JSON.stringify(sp.env)}`);
  const tcl = trimClip(r, 'a', 'c', 'start', 11, 10).tracks[0].clips[0];
  ok(tcl.at === 11 && tcl.from === 1 && tcl.env![0].t === 0 && tcl.env![0].v === 0.5, `a clip's start dragged: ${JSON.stringify(tcl.env)}`);
  ok(envSlice(line, 0, 4)!.length === 3 && envSlice([{ t: 0, v: 1 }], 0, 4) === undefined, 'a whole slice is the line; a plain line has none');
  // Points added, moved between their neighbours, removed.
  const a = envAdd(line, 1, 4);
  ok(a.env.length === 4 && a.env[a.at].t === 1 && a.env[a.at].v === 0.5, `a point added on the line keeps its volume: ${JSON.stringify(a)}`);
  const m = envMove(a.env, a.at, 3, 3, 4);
  ok(m[a.at].t < 2 && m[a.at].v === 3 && envMove(a.env, 1, 1, 9, 4)[1].v === 4 && envMove(a.env, 0, -5, 0.2, 4)[0].t === 0, `a point stays between its neighbours: ${JSON.stringify(m)}`);
  ok(envRemove([{ t: 1, v: 0.5 }], 0) === undefined && envRemove(line, 1)!.length === 2, 'a point taken out');
  // Recipes: a volume line and smooth fades are kept (cleaned); a clip's fades need fades.
  const n = normalizeSoundRecipe({ tracks: [{ id: 'a', clips: [{ id: 'x', src: '', at: 0, from: 0, to: 4, env: [{ t: 0, v: 1 }, { t: 9, v: 0.2 }], fadeSmooth: true }, { id: 'y', src: '', at: 5, from: 0, to: 2, fadeSmooth: true, env: [{ t: 0, v: 1 }] }] }] }, { length: () => 10 });
  ok(JSON.stringify(n.tracks[0].clips[0].env) === '[{"t":0,"v":1},{"t":4,"v":0.2}]' && n.tracks[0].clips[0].fadeSmooth === undefined && n.tracks[0].clips[1].env === undefined, `a recipe's lines cleaned to the clip: ${JSON.stringify(n.tracks[0].clips)}`);
  // The expression ffmpeg gets: only numbers, if and lt.
  const x = envExpression(line);
  ok(x === 'if(lt(t,0),1,if(lt(t,2),1+(-0.5)*t,if(lt(t,4),(-2)+1*t,2)))', `the volume line as an expression: ${x}`);
  ok(/^[0-9a-z.,()+*-]+$/.test(x) && !/[a-su-z]{2}/.test(x.replace(/if|lt/g, '')), `an expression of numbers, if and lt only: ${x}`);
  // Keeping the tracks in step: a deletion on one track closes the time on all, the markers' map moves with it.
  const two: SoundRecipe = { tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 0, from: 0, to: 10 }] }, { id: 'b', clips: [{ id: '2', src: 'b.mp3', at: 6, from: 0, to: 4 }] }] };
  ok(JSON.stringify(rippleTracks(two, ['a'], true)) === '["a","b"]' && JSON.stringify(rippleTracks(two, ['a'], false)) === '["a"]', 'the tracks a ripple is made on');
  const inStep = deleteRange(two, rippleTracks(two, ['a'], true), 2, 4, true);
  ok(inStep.recipe.tracks[1].clips[0].at === 4 && inStep.map(6) === 4 && soundLength(inStep.recipe) === 8, 'a deletion on one track moves every track and the markers');
  const alone = deleteRange(two, ['a'], 2, 4, true);
  ok(alone.recipe.tracks[1].clips[0].at === 6 && alone.map(6) === 6, 'without it, the other tracks stay');
  const cb = copyRange(two, ['a'], 0, 1, '');
  const pin = pasteAt(two, ['a'], 3, cb, true, '', true);
  ok(pin.recipe.tracks[1].clips[0].at === 7 && pin.map(6) === 7 && pasteAt(two, ['a'], 3, cb, true, '').recipe.tracks[1].clips[0].at === 6, 'a paste opens its time on every track when in step');
}

// ---- the plan and its checks ---------------------------------------------------------------------------------------

const CAPS: SoundCaps = { rubberband: false, afirPlain: 'gtype', limiterLatency: true, encoders: { mp3: true, aac: true, opus: true, vorbis: true, flac: true } };
{
  const src = { file: '/s/in.wav', duration: 10, rate: 44100, channels: 1 };
  const plan = planSound({
    recipe: {
      tracks: [
        {
          id: 'a',
          clips: [
            { id: '1', src: '', at: 0, from: 0, to: 2 },
            { id: '2', src: '', at: 3, from: 5, to: 7, speed: 2 },
            { id: '3', src: '', at: 4, from: 1, to: 2 },
          ],
        },
      ],
      effects: [{ id: 'e', type: 'eq', p: { bass: 3 }, range: [1, 2] }],
    },
    sources: new Map([['', src]]),
    out: { format: 'mp3' },
    dir: '/j',
    output: '/j/out.mp3',
    caps: CAPS,
  });
  ok(plan.inputs.length === 2, `the sound read again where the track goes back in it: ${plan.inputs.length}`);
  ok(/anullsrc=r=44100:cl=stereo,atrim=end_sample=44100/.test(plan.graph) && /atempo=tempo=2/.test(plan.graph) && /lowshelf=f=100:t=s:w=1:g=3/.test(plan.graph), `gaps, speed and the effect on its range: ${plan.graph.slice(0, 300)}`);
  ok(/pan=stereo\|c0=1\*c0\|c1=1\*c0/.test(plan.graph) && plan.channels === 1, 'a mono sound made stereo inside, mono out');
  // A clip's volume line and smooth fades, in the command.
  {
    const env = [{ t: 0, v: 1 }, { t: 1, v: 0.25 }, { t: 2, v: 1 }];
    const p2 = planSound({
      recipe: { tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 0, from: 0, to: 3, env, fadeIn: 1, fadeSmooth: true }] }] },
      sources: new Map([['', src]]),
      out: { format: 'wav' },
      dir: '/j',
      output: '/j/out.wav',
      caps: CAPS,
    });
    ok(/volume=volume='if\(lt\(t,0\),1,if\(lt\(t,1\),/.test(p2.graph) && /:eval=frame/.test(p2.graph) && /afade=t=in:st=0:d=1:curve=hsin/.test(p2.graph), `a volume line and a smooth fade in the plan: ${p2.graph.slice(0, 400)}`);
    throws(() => checkAudioChain({ ins: ['0:a'], filters: [{ name: 'afade', env: [{ t: 0, v: 1 }] }], outs: ['o'] }), /volume line/, 'a volume line only on volume');
    throws(() => checkAudioChain({ ins: ['0:a'], filters: [{ name: 'volume', env: [{ t: 1, v: 1 }, { t: 0, v: 1 }] }], outs: ['o'] }), /volume line/, 'a volume line in order');
  }
  checkSoundPlan(plan);
  throws(() => checkSoundPlan({ ...plan, args: [...plan.args.slice(0, -1), 'file:/etc/passwd'] }), /writes somewhere/, 'writes only its output');
  throws(() => checkAudioChain({ ins: ['0:a'], filters: [{ name: 'amovie', args: [['filename', 'x']] }], outs: ['o'] }), /may not use: amovie/, 'no filter that reads a file');
  throws(() => audioGraphText([{ ins: ['0:a'], filters: [{ name: 'volume', args: [['volume', "1'[x]"]] }], outs: ['o'] }]), /has a value/, 'no value that closes a quote');
  throws(() => audioGraphText([{ ins: ['0:a'], filters: [{ name: 'pan', pos: 'stereo|c0=c0,amovie' }], outs: ['o'] }]), /has a value/, 'pan only as channels');
  const m = planSound({ recipe: { tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 0, from: 0, to: 2 }] }], effects: [{ id: 'n', type: 'normalize' }] }, sources: new Map([['', src]]), out: { format: 'wav' }, dir: '/j', output: '/j/o.wav', caps: CAPS, measure: 'n' });
  ok(/ebur128=peak=sample\+true/.test(m.graph) && m.output === '-', 'a pass that measures');
  checkSoundPlan(m);
  const said = readLoudness('[Parsed_ebur128_0 @ 0x] Summary:\n\n  Integrated loudness:\n    I:         -27.8 LUFS\n\n  Sample peak:\n    Peak:      -24.1 dBFS\n\n  True peak:\n    Peak:      -23.9 dBFS\n');
  ok(said.lufs === -27.8 && said.peak === -24.1 && said.truePeak === -23.9, `ebur128's summary read: ${JSON.stringify(said)}`);
  ok(near(gainFor({ id: 'n', type: 'normalize', p: { peak: -1 } }, said).gain, 23.1) && gainFor({ id: 'l', type: 'loudness', p: { lufs: -16 } }, said).limit === false, 'the gains measured');
  ok(gainFor({ id: 'l', type: 'loudness', p: { lufs: -10 } }, { lufs: -20, truePeak: -3 }).limit, 'a limiter where the peaks would go over −1 dB');
  ok(JSON.stringify(readSilences('[silencedetect] silence_start: 1.5\n[silencedetect] silence_end: 3.25 | silence_duration: 1.75\nsilence_start: 9')) === '[[1.5,3.25]]', 'silencedetect read');
  const w = readTimedWords(JSON.stringify({ transcription: [{ offsets: { from: 0, to: 300 }, text: ' Hello' }, { offsets: { from: 300, to: 320 }, text: ',' }, { offsets: { from: 400, to: 700 }, text: ' um' }, { offsets: { from: 800, to: 900 }, text: ' [BLANK_AUDIO]' }] }));
  ok(w.length === 2 && w[0].w === 'Hello,' && w[1].a === 0.4, `whisper's words read: ${JSON.stringify(w)}`);
}

// ---- real edits, routes and jobs ---------------------------------------------------------------------------------------

const ff = await hasFfmpeg();
if (!ff) console.log('(no ffmpeg here: the real edits, the jobs and edit_audio are not tested)');
const env = { ...process.env, CUDA_VISIBLE_DEVICES: '' };
const run = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { env });
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels,duration_ts', '-of', 'json', f], { encoding: 'utf8', env }));
/** How loud a part of a file is: its loudest sample, in dB. */
function peakDb(f: string, from = 0, to = 1e9): number {
  const r = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostdin -v info -ss ${from} -t ${Math.max(0.01, to - from)} -i "${f}" -af volumedetect -f null - 2>&1 | grep max_volume || true`], { env, encoding: 'utf8' });
  const m = /max_volume:\s*(-?[\d.]+|-inf)/.exec(r);
  return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : NaN;
}

if (ff) {
  const tone = path.join(tmp, 'tone.wav');
  const voice = path.join(tmp, 'voice.mp3');
  const clip = path.join(tmp, 'clip.mp4');
  run(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4:sample_rate=48000', '-af', 'volume=-6dB', '-ac', '2', tone]);
  run(['-f', 'lavfi', '-i', 'sine=frequency=300:duration=2:sample_rate=44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', voice]);
  run(['-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=3', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);

  const db = openDb(path.join(tmp, 'test.db'));
  const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
    try {
      done(null, String(b).trim() ? JSON.parse(String(b)) : {});
    } catch (e) {
      done(e as Error, undefined);
    }
  });
  app.addContentTypeParser('application/octet-stream', (_r, payload, done) => done(null, payload));
  app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
  const deps = { app, db, sessions: { adapterByRun: () => null }, models: { agentModels: () => [], ensure: async () => null }, broadcast() {}, toSubscribers() {}, publicBase: () => 'https://hydor.example' } as unknown as Deps;
  media.routes!(deps);
  soundEdit.routes!(deps);
  await app.ready();
  const req = (method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json' } });
  const finished = async (id: string) => {
    let j: any;
    const end = Date.now() + 120_000;
    while (Date.now() < end) {
      j = (await req('GET', `/api/mediaedit/audio/${id}`)).json();
      if (['done', 'failed', 'stopped'].includes(j.status)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return j;
  };
  const edit = async (recipe: SoundRecipe, out: object, to: object, src = tone) => {
    const r = await req('POST', '/api/mediaedit/audio', { src, recipe, out, to });
    if (r.statusCode !== 200) return { status: 'refused', error: r.json().error };
    return finished(r.json().job);
  };
  const samples = (f: string) => Number(probe(f).streams[0].duration_ts);

  const info = (await req('GET', `/api/mediaedit/audio/info?src=${encodeURIComponent(tone)}`)).json();
  ok(info.ffmpeg && near(info.duration, 4) && info.rate === 48000 && info.channels === 2 && info.format === 'wav', `a sound's facts: ${JSON.stringify(info)}`);
  const vi = (await req('GET', `/api/mediaedit/audio/info?src=${encodeURIComponent(clip)}`)).json();
  ok(vi.video === true && vi.channels === 1, `a video's sound: ${JSON.stringify(vi)}`);
  const srcOrig = await req('GET', `/api/mediaedit/audio/source?src=${encodeURIComponent(voice)}`);
  ok(srcOrig.statusCode === 200 && srcOrig.headers['content-type'] === 'audio/mpeg' && srcOrig.rawPayload.length === fs.statSync(voice).size, 'the browser reads an MP3 as it is');
  const srcVid = await req('GET', `/api/mediaedit/audio/source?src=${encodeURIComponent(clip)}`);
  ok(srcVid.statusCode === 200 && srcVid.headers['content-type'] === 'audio/mp4' && srcVid.rawPayload.length > 1000, 'a video’s sound taken out of it for the browser');

  // A deletion closing up, to the sample; a video's sound keeping its length, silent where it was deleted.
  const del = deleteRange(one(4), ['a'], 1, 2, true).recipe;
  let j = await edit(del, { format: 'wav' }, { file: tone, as: 'copy' });
  ok(j.status === 'done' && samples(j.path) === 3 * 48000 && /tone \(edited\)\.wav$/.test(j.path), `a deletion: ${JSON.stringify(j)} ${j.path && samples(j.path)}`);
  j = await edit({ ...deleteRange(one(3), ['a'], 1, 2, false).recipe, length: 3 }, { format: 'wav' }, { sound: true }, clip);
  const kept = j.src ? keptSoundFile(j.src) : null;
  ok(j.status === 'done' && /^naget-sound:[a-f0-9]{40}$/.test(j.src) && kept && near(Number(probe(kept).format.duration), 3, 0.03), `a video's sound keeps its length: ${JSON.stringify(j)}`);
  if (kept) ok(peakDb(kept, 1.1, 1.9) < -80 && peakDb(kept, 0.1, 0.9) > -40, 'silent where it was deleted');
  const got = await req('GET', `/api/mediaedit/audio/sounds/${j.src?.slice(12)}`);
  ok(got.statusCode === 200 && got.rawPayload.length > 1000, 'a kept sound read back');

  // Effects, each made, its length kept.
  const fx = (type: string, p?: object, range?: [number, number]) => ({ ...one(4), effects: [{ id: 'e', type, ...(p ? { p } : {}), ...(range ? { range } : {}) }] }) as SoundRecipe;
  for (const [type, p, range] of [
    ['gain', { db: -6 }],
    ['fadeIn', { seconds: 1, curve: 1 }],
    ['fadeOut', undefined, [2, 4]],
    ['denoise', { amount: 14 }],
    ['eq', { bass: 4, mid: -3, treble: 2, lowCut: 80, highCut: 8000 }],
    ['highpass', { hz: 200 }],
    ['lowpass', { hz: 2000 }],
    ['compressor', undefined],
    ['limiter', { ceiling: -3 }],
    ['pitch', { semitones: 3 }, [1, 3]],
    ['reverse', undefined, [1, 2]],
    ['echo', { delay: 200, decay: 0.5 }],
    ['reverb', { room: 2, mix: 0.3 }],
    ['mono', undefined],
  ] as [string, object | undefined, [number, number] | undefined][]) {
    j = await edit(fx(type, p, range), { format: 'wav' }, { file: tone, as: 'copy' });
    ok(j.status === 'done' && samples(j.path) === 4 * 48000, `${type}: ${j.error ?? ''} ${j.path ? samples(j.path) : ''}`);
  }
  j = await edit(fx('gain', { db: -6 }), { format: 'wav' }, { file: tone, as: 'copy' });
  ok(near(peakDb(j.path), peakDb(tone) - 6, 0.3), `6 dB quieter: ${peakDb(j.path)} from ${peakDb(tone)}`);
  j = await edit(fx('normalize', { peak: -1 }), { format: 'wav' }, { file: tone, as: 'copy' });
  ok(near(peakDb(j.path), -1, 0.3), `normalized to −1 dB: ${peakDb(j.path)}`);
  j = await edit(fx('loudness', { lufs: -16 }), { format: 'wav' }, { file: tone, as: 'copy' });
  const lu = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostdin -i "${j.path}" -af ebur128=framelog=quiet -f null - 2>&1 | grep -A1 'Integrated loudness' | tail -1`], { env, encoding: 'utf8' });
  ok(near(Number(/I:\s*(-?[\d.]+)/.exec(lu)?.[1]), -16, 1), `loudness −16 LUFS: ${lu.trim()}`);

  // A volume line, heard: a clip dipping to silence in the middle.
  const dip: SoundRecipe = { tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 0, from: 0, to: 4, env: [{ t: 0, v: 1 }, { t: 2, v: 0 }, { t: 4, v: 1 }] }] }] };
  j = await edit(dip, { format: 'wav' }, { file: tone, as: 'copy' });
  ok(j.status === 'done' && samples(j.path) === 4 * 48000 && peakDb(j.path, 0, 0.1) > peakDb(tone) - 1.5 && peakDb(j.path, 1.95, 2.05) < peakDb(tone) - 25 && peakDb(j.path, 3.9, 4) > peakDb(tone) - 1.5, `a volume line: ${j.error ?? ''} ${peakDb(j.path, 0, 0.1)} ${peakDb(j.path, 1.95, 2.05)} ${peakDb(j.path, 3.9, 4)}`);
  // At half speed the line stretches with the clip.
  j = await edit({ tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 0, from: 0, to: 2, speed: 0.5, env: [{ t: 0, v: 1 }, { t: 2, v: 0 }, { t: 4, v: 1 }] }] }] }, { format: 'wav' }, { file: tone, as: 'copy' });
  ok(j.status === 'done' && peakDb(j.path, 1.95, 2.05) < peakDb(tone) - 25, `a volume line on a slowed clip: ${j.error ?? ''} ${peakDb(j.path, 1.95, 2.05)}`);
  // Two tracks, at their volume and pan, as long as the longest.
  const mixed: SoundRecipe = { tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 0, from: 0, to: 2 }] }, { id: 'b', volume: -6, pan: -0.5, clips: [{ id: '2', src: voice, at: 1.5, from: 0, to: 2, fadeIn: 0.5 }] }] };
  j = await edit(mixed, { format: 'flac' }, { file: tone, as: 'copy' });
  ok(j.status === 'done' && near(Number(probe(j.path).format.duration), 3.5, 0.01) && probe(j.path).streams[0].codec_name === 'flac', `two tracks mixed: ${JSON.stringify(j)}`);
  // Every kind of file.
  for (const [format, codec] of [
    ['mp3', 'mp3'],
    ['m4a', 'aac'],
    ['ogg', 'opus'],
    ['wav', 'pcm_s24le'],
  ] as const) {
    j = await edit(one(2), { format, bits: 24, kbps: 128, channels: 1 }, { file: tone, as: 'copy' });
    const pr = j.path ? probe(j.path) : null;
    ok(j.status === 'done' && pr?.streams[0].codec_name === codec && pr.streams[0].channels === 1, `${format}: ${JSON.stringify(j)} ${JSON.stringify(pr?.streams[0])}`);
  }
  // Written over a file: the same kind, the old one to the Trash.
  const over = path.join(tmp, 'over.mp3');
  fs.copyFileSync(voice, over);
  j = await edit(one(1), { format: 'wav' }, { file: over, as: 'replace' }, over);
  ok(j.status === 'done' && j.path === over && probe(over).streams[0].codec_name === 'mp3' && near(Number(probe(over).format.duration), 1, 0.06), `written over, it stays an MP3: ${JSON.stringify(j)}`);
  // The Library: a new sound, then written over (its title kept).
  j = await edit(one(2), { format: 'mp3' }, { library: true, title: 'Tone' });
  const item = j.media ? getMedia(db, j.media) : null;
  ok(j.status === 'done' && item?.kind === 'audio' && near(item.duration, 2, 0.08), `a new Library sound: ${JSON.stringify(j)}`);
  if (item) {
    j = await edit(one(1), { format: 'mp3' }, { media: item.id, as: 'replace' }, `media:${item.id}`);
    const again = getMedia(db, item.id);
    ok(j.status === 'done' && again?.title === item.title && near(again?.duration, 1, 0.08) && (again?.peaks?.length ?? 0) > 0, `a Library sound written over: ${JSON.stringify(again)}`);
  }
  // A recording kept, then mixed in by its kept name.
  const up = await app.inject({ method: 'POST', url: '/api/mediaedit/audio/sounds?name=Take%201', payload: fs.readFileSync(voice), headers: { 'content-type': 'application/octet-stream' } });
  const rec = up.json();
  ok(up.statusCode === 200 && /^naget-sound:/.test(rec.src) && near(rec.duration, 2, 0.08) && rec.name === 'Take 1', `a recording kept: ${up.body}`);
  j = await edit({ tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 0, from: 0, to: 1 }] }, { id: 'r', clips: [{ id: '2', src: rec.src, at: 0.5, from: 0, to: 1 }] }] }, { format: 'm4a' }, { sound: true });
  ok(j.status === 'done' && /^naget-sound:/.test(j.src), `a kept recording mixed in: ${JSON.stringify(j)}`);
  // A job stopped.
  const long = path.join(tmp, 'long.wav');
  run(['-f', 'lavfi', '-i', 'anoisesrc=d=600:r=48000', long]);
  const r0 = await req('POST', '/api/mediaedit/audio', { src: long, recipe: { tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 0, from: 0, to: 600 }] }], effects: [{ id: 'd', type: 'denoise' }, { id: 'r', type: 'reverb' }] }, out: { format: 'flac' }, to: { file: long, as: 'copy' } });
  await new Promise((r) => setTimeout(r, 400));
  await req('DELETE', `/api/mediaedit/audio/${r0.json().job}`);
  j = await finished(r0.json().job);
  ok(j.status === 'stopped', `a job stopped: ${j.status}`);
  const bad = await req('POST', '/api/mediaedit/audio', { src: tone, recipe: one(1), out: { format: 'wav' }, to: { file: path.join(tmp, 'x.aac'), as: 'replace' } });
  ok(bad.statusCode === 400, `not written over a kind it does not write: ${bad.body}`);

  // edit_audio: a file of the session, trimmed, louder, music under it, into audio/.
  const cwd = path.join(tmp, 'session');
  fs.mkdirSync(cwd, { recursive: true });
  fs.copyFileSync(tone, path.join(cwd, 'take.wav'));
  fs.copyFileSync(voice, path.join(cwd, 'bed.mp3'));
  const tool = editAudioTool();
  const ctx = { deps, cwd, key: 's1', runId: 'r1', signal: undefined } as unknown as RunCtx;
  const said = (await tool.run({ path: 'take.wav', trim: [0.5, 3.5], loudness: 'podcast', eq: 'clearer voice', mix: [{ path: 'bed.mp3', at: 1, volume: -12, fade_out: 0.5 }], format: 'mp3' }, ctx)) as string;
  const line = typeof said === 'string' ? said.split('\n')[1] : '';
  ok(typeof said === 'string' && /^\/.+\/audio\/take-edited\.mp3 \(3(\.\d+)? s, \d+ KB\)$/.test(line) && /Loudness: Podcast/.test(said), `edit_audio: ${JSON.stringify(said)}`);
  const none = (await tool.run({ path: 'take.wav', cuts: [[0, 4]] }, ctx)) as { isError?: boolean; text?: string };
  ok(none.isError && /Nothing of the sound/.test(none.text ?? ''), 'edit_audio: nothing left');
  await app.close();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
