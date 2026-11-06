// Script tests for presenting and recording slides: a slide's narration in the model (checked as it comes in, kept and
// swept with the deck, an agent's sound file taken in), the sounds' store and its routes, narration made with AI (its
// cost first, the voice model's request, no key), the narrated slideshow's timing and the coach's counting (words a
// minute, filler words, reading the slide out, the report and its timings) as pure functions, the phone remote's
// routes and what each page hears, a narration in the PowerPoint file; and, where the browser pictures are taken with
// is here, the runtime's narrated slideshow, rehearsed timings and the app's buttons among its controls in a real page.
// OpenRouter is a stand-in (fetch); ffmpeg, where it is here, makes the test sounds and the M4As.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/slides-show/slides-show-test.ts
//   DATA_DIR=/tmp/hydor-test-slides-show node dist/dev/slides-show-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { Zip } from '../documents/zip.ts';
import { canCapture, closeCapture, setCaptureDb, withTab } from '../capture/index.ts';
import { hasFfmpeg } from '../media/frames.ts';
import { pcmToWav } from '../images/audio.ts';
import { loadConfig, saveConfig } from '../models/config.ts';
import { deckOutline, deckSounds, deckText, normalizeDeck, type Deck } from '../../shared/slides.ts';
import {
  cleanRemoteCmd,
  cleanRemoteState,
  coachReport,
  fillersIn,
  narrationClicks,
  narrationTotal,
  narrationWords,
  paceHint,
  perMinute,
  readShare,
  rehearsedTimings,
  rollingPace,
  speechUnits,
  spokenWords,
  withTimings,
} from '../../shared/slides-show.ts';
import { initAssets, noteRefs } from '../pages/assets.ts';
import { getSound, keepNarrations, putSound, soundType, sweepSounds } from '../pages/sounds.ts';
import { pptxFile } from '../pages/pptx.ts';
import { RUNTIME_SRC } from '../pages/slides.ts';
import { slidesShow } from './index.ts';
import { forgetShows } from './remote.ts';

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
const near = (a: number, b: number, by = 0.05) => Math.abs(a - b) <= by;

fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-slides-show-test-')));
const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
setCaptureDb(db);
const ff = await hasFfmpeg();
if (!ff) console.log('(no ffmpeg here: recordings are kept as they come, and lengths come from WAV headers)');

// A second of a 440 Hz tone, 16-bit mono at 24 kHz, as a WAV; an MP3 of two seconds where ffmpeg is here.
const PCM = Buffer.alloc(48_000);
for (let i = 0; i < 24_000; i++) PCM.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 24_000) * 12_000), i * 2);
const WAV = pcmToWav(PCM);
let MP3: Buffer | null = null;
if (ff) {
  const f = path.join(tmp, 'tone.mp3');
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-c:a', 'libmp3lame', '-b:a', '64k', f]);
    MP3 = fs.readFileSync(f);
  } catch {
    console.log('(this ffmpeg makes no MP3: the voice model answers with a WAV)');
  }
}

// ---- the narration in the model ----------------------------------------------------------------------------------

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
{
  const d = normalizeDeck({
    slides: [
      { notes: 'Say hello.', narration: { src: `naget-audio:${SHA}`, seconds: 12.345, text: '  Hello everyone.  ', ai: true } },
      { narration: `naget-audio:${OTHER}` },
      { narration: { src: 'audio/intro.mp3', seconds: 4 } },
      { narration: { src: 'naget-video:' + SHA } },
      { narration: { src: `naget-audio:${SHA}`, seconds: 99999 } },
    ],
  });
  const [a, b, c, v, long] = d.slides;
  ok(a.narration?.src === `naget-audio:${SHA}` && a.narration.seconds === 12.35 && a.narration.text === 'Hello everyone.' && a.narration.ai === true, 'a narration keeps its kept sound, its length (to a hundredth), its words and that AI made it');
  ok(b.narration?.src === `naget-audio:${OTHER}` && b.narration.seconds === 0 && b.narration.text === undefined, 'a kept sound alone is a narration, its length not known yet');
  ok(!c.narration && !v.narration, 'a sound that is not kept (a file, or a video) is left out without an agent’s file to take in');
  ok(long.narration?.seconds === 3600, 'a narration’s length is at most an hour');
  ok(deckSounds(d).join() === [`naget-audio:${SHA}`, `naget-audio:${OTHER}`, `naget-audio:${SHA}`].join(), 'the deck’s sounds are its slides’ narrations');
  ok(/1\. .*narration \(12 s\)/.test(deckOutline(d)), 'the outline an agent reads says which slides have a narration');
  const again = normalizeDeck(JSON.parse(deckText(d)));
  ok(JSON.stringify(again.slides[0].narration) === JSON.stringify(a.narration), 'the kept text keeps the narration as it was');
  const pending = normalizeDeck({ slides: [{ narration: { file: 'audio/intro.mp3', text: 'Hi' } }] }, { audio: (s) => (s.length < 100 ? s : null) });
  ok(pending.slides[0].narration?.src === 'audio/intro.mp3' && pending.slides[0].narration.text === 'Hi', 'an agent’s file (file or src) stays as written until it is taken in');
  const pptx = normalizeDeck({ format: 'pptx', slides: [{ narration: `naget-audio:${SHA}` }] });
  ok(pptx.slides[0].narration?.src === `naget-audio:${SHA}`, 'a PowerPoint compatible deck keeps its narrations (PowerPoint has slides’ sounds)');
}

// ---- rehearsed timings in the model --------------------------------------------------------------------------------
{
  const d = normalizeDeck({ slides: [{ transition: { auto: 4, steps: [1, 2.5, '4'] } }, { transition: { steps: [3, 1] } }, { transition: { fx: 'none', steps: [] } }] });
  ok(JSON.stringify(d.slides[0].transition) === JSON.stringify({ fx: 'none', auto: 4, steps: [1, 2.5, 4] }), 'a rehearsal’s click times are kept, in order, with the slide’s own time');
  ok(!d.slides[1].transition && !d.slides[2].transition, 'click times out of order (or none) are left out, and with them a transition of nothing');
  const t = withTimings(d, new Map([[1, { auto: 3, steps: [] }]]));
  ok(t.slides[1].transition?.auto === 3 && !t.slides[1].transition?.steps && t.slides[0] === d.slides[0], 'timings change only the slides rehearsed');
}

// ---- the sounds' store ---------------------------------------------------------------------------------------------
{
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('....webm....', 'latin1'), Buffer.alloc(40)]);
  const types = [
    WAV,
    Buffer.concat([Buffer.from('ID3\u0004', 'latin1'), Buffer.alloc(20)]),
    Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(20)]),
    webm,
    Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ', 'latin1'), Buffer.alloc(8)]),
    Buffer.concat([Buffer.from('fLaC', 'latin1'), Buffer.alloc(20)]),
  ].map((b) => soundType(b)?.ext);
  ok(types.join() === 'wav,mp3,ogg,webm,m4a,flac', `sounds are known by their first bytes (${types.join()})`);
  ok(soundType(Buffer.from('<html><body>not a sound</body></html>')) === null && soundType(Buffer.alloc(4)) === null, 'what is not a sound is not one');
  const a = await putSound(db, WAV);
  ok(a.src.startsWith('naget-audio:') && near(a.seconds, 1, 0.12), `a WAV is kept, its length read (${a.seconds} s)`);
  ok(ff ? a.mime === 'audio/mp4' && getSound(db, a.src.slice(12))?.ext === 'm4a' : a.mime === 'audio/wav', ff ? 'a WAV is made an M4A where ffmpeg is here' : 'a WAV is kept as it is without ffmpeg');
  const b = await putSound(db, WAV);
  ok(b.src === a.src, 'the same sound is kept once');
  let refused = '';
  try {
    await putSound(db, Buffer.from('not a sound at all, just words'));
  } catch (e) {
    refused = (e as Error).message;
  }
  ok(/not a sound/.test(refused), `what is not a sound is refused in words a person can act on (${refused})`);
  // Swept: a sound a deck's version plays stays; one nothing plays goes a day after it came.
  const lone = await putSound(db, pcmToWav(PCM.subarray(0, 24_000)));
  noteRefs(db, 'deck000001', 1, [a.src]);
  db.prepare('update page_sounds set created_at = ?').run(Date.now() - 2 * 86_400_000);
  sweepSounds(db);
  ok(!!getSound(db, a.src.slice(12)) && !getSound(db, lone.src.slice(12)), 'a sound a deck plays stays when swept; one nothing plays goes');
  // An agent's sound file, taken in for the deck it saves.
  fs.writeFileSync(path.join(tmp, 'intro.wav'), WAV);
  const notes: string[] = [];
  const d = normalizeDeck({ slides: [{ narration: { file: 'intro.wav', text: 'Welcome' } }, { narration: { file: 'missing.mp3' } }, { narration: { file: 'intro.wav' } }] }, { audio: (s) => s });
  const kept = await keepNarrations(db, d, tmp, notes);
  ok(kept.slides[0].narration?.src === a.src && near(kept.slides[0].narration.seconds, 1, 0.12) && kept.slides[0].narration.text === 'Welcome', 'an agent’s sound file is kept with the deck, its length measured, its words kept');
  ok(!kept.slides[1].narration && notes.length === 1 && /missing\.mp3.*left out: no such file/.test(notes[0]), `a file that is not there is left out, and the agent is told (${notes[0]})`);
  ok(kept.slides[2].narration?.src === a.src, 'the same file on two slides is kept once');
}

// ---- the narrated slideshow's timing and a narration's words ---------------------------------------------------
{
  ok(narrationClicks(10, 3).join() === '2.5,5,7.5', 'a build’s clicks come at even shares of the narration (the k-th of n at k/(n+1))');
  ok(narrationClicks(10, 0).length === 0 && narrationClicks(0, 3).length === 0, 'no clicks, or no length: nothing to time');
  ok(narrationClicks(9, 2).join() === '3,6', 'two clicks over nine seconds: at three and six');
  const d = normalizeDeck({ slides: [{ narration: { src: `naget-audio:${SHA}`, seconds: 10 } }, { narration: { src: `naget-audio:${SHA}`, seconds: 5 }, hidden: true }, {}, { narration: { src: `naget-audio:${SHA}`, seconds: 2.5 } }] });
  ok(JSON.stringify(narrationTotal(d)) === JSON.stringify({ slides: 3, narrated: 2, seconds: 12.5 }), 'a narrated slideshow: the slides shown, those narrated, and how long they talk');
  ok(spokenWords('- First point\n- **Bold** second\n1. [A link](https://x.example)\n\nDone!') === 'First point. Bold second. A link. Done!', 'notes read aloud: no bullets’ marks, no stars, links as their words, a full stop after each line');
  const s = normalizeDeck({ slides: [{ layout: 'content', title: 'Our plan', text: '- Grow\n- Hire' }] }).slides[0];
  ok(narrationWords(s) === 'Our plan. Grow. Hire.', `a slide without notes is read from its words, its title first (${narrationWords(s)})`);
  ok(narrationWords({ ...s, notes: 'Today: the plan.' }) === 'Today: the plan.', 'a slide with notes is read from its notes');
}

// ---- the coach's counting ----------------------------------------------------------------------------------------
{
  ok(speechUnits('Hello there, it’s a fine day.') === 6 && speechUnits('今天天气很好') === 6 && speechUnits('AI 模型 works') === 4, 'words are counted between spaces, each Chinese character one');
  ok(perMinute(150, 60_000) === 150 && perMinute(75, 30_000) === 150 && perMinute(10, 0) === 0, 'words a minute');
  const said = [
    { t: 1000, units: 20 },
    { t: 20_000, units: 30 },
    { t: 40_000, units: 30 },
  ];
  ok(rollingPace(said, 40_000, 30_000, 0) === 120 && rollingPace(said, 8000, 30_000, 0) === null, 'the pace is the last half minute’s, once there is enough to tell');
  ok(
    paceHint(190, 'en-US') === 'fast' && paceHint(80, 'en') === 'slow' && paceHint(140, 'en') === null && paceHint(250, 'zh-CN') === null && paceHint(null, 'en') === null,
    'a word on the pace only when it is well out of the comfortable range (the language’s own)',
  );
  const en = fillersIn(['um so we basically did this', 'so like the numbers kind of grew, you know', 'it is a kind of tree and I like it', 'do you know the answer right', 'we tested it, right'], 'en-US');
  ok(en.um === 1 && en.basically === 1 && en.so === 2 && en.like === 1 && en['kind of'] === 1 && en['you know'] === 1 && en.right === 2, `English fillers, only where they fill (${JSON.stringify(en)})`);
  const el = fillersIn(['εε λοιπόν, δηλαδή ας πούμε αυτό'], 'el-GR');
  ok(el['εε'] === 1 && el['λοιπόν'] === 1 && el['δηλαδή'] === 1 && el['ας πούμε'] === 1, `Greek fillers (${JSON.stringify(el)})`);
  const zh = fillersIn(['嗯那个我们其实做了很多，嗯'], 'zh-CN');
  ok(zh['嗯'] === 2 && zh['那个'] === 1 && zh['其实'] === 1, `Chinese fillers, found within the words (${JSON.stringify(zh)})`);
  ok(Object.keys(fillersIn(['um uh'], 'xx')).length === 2, 'a language without a list of its own uses English’s');
  const slide = 'Revenue grew forty percent in the third quarter thanks to new customers in Europe';
  ok(readShare('so revenue grew forty percent in the third quarter thanks to new customers in europe', slide) === 1, 'reading the slide out word for word counts all of it');
  ok(readShare('we did well this quarter, mostly from new European clients', slide) < 0.2, 'saying it in other words counts little');
  ok(readShare('anything', 'Too short') === 0, 'a slide of a few words is never "read out"');
}
{
  const deck = normalizeDeck({ slides: [{ layout: 'title', title: 'Hi' }, { layout: 'content', title: 'Plan', text: 'Revenue grew forty percent in the third quarter thanks to new customers' }, { layout: 'end' }, { layout: 'end' }] });
  const r = coachReport(
    [
      { i: 0, ms: 4000, steps: [], said: ['um hello everyone'] },
      { i: 1, ms: 100_000, steps: [5000, 9000], said: ['revenue grew forty percent in the third quarter thanks to new customers', 'basically'] },
      { i: 2, ms: 20_000, steps: [], said: [] },
      { i: 1, ms: 20_000, steps: [2000], said: ['so yes'] },
      { i: 3, ms: 16_000, steps: [], said: [] },
    ],
    deck,
    { lang: 'en-US', targetMinutes: 2 },
  );
  ok(r.total === 160_000 && r.target === 120_000 && r.slides.length === 4, 'the report: the whole time, the time aimed for, each slide once');
  const s1 = r.slides.find((s) => s.i === 1)!;
  ok(s1.ms === 120_000 && s1.steps.join() === '5000,9000' && s1.said.length === 3, 'a slide shown twice counts once, its times added');
  ok(s1.flag === 'lingered' && r.slides[0].flag === 'rushed' && !r.slides.find((s) => s.i === 2)!.flag, 'slides well under their share of the time are rushed, well over it lingered on');
  ok(r.reading.join() === '1' && r.fillers.length === 3 && r.fillers.reduce((n, f) => n + f[1], 0) === 3, 'it says which slides were read out, and each filler said');
  const t = rehearsedTimings(r);
  ok(
    JSON.stringify(t.get(1)) === JSON.stringify({ auto: 111, steps: [5, 9] }) && t.get(0)?.auto === 4 && JSON.stringify(t.get(3)) === JSON.stringify({ auto: 16, steps: [] }),
    'its timings: each click when it came, and the slide going on as long after the last as it stayed',
  );
  const timed = withTimings(deck, t);
  ok(
    timed.slides[1].transition?.auto === 111 && timed.slides[1].transition.steps?.join() === '5,9' && normalizeDeck(timed).slides[1].transition?.steps?.length === 2,
    'Use these timings: each slide goes on by itself, its clicks timed, and the deck keeps them',
  );
  const none = coachReport([{ i: 0, ms: 3000, steps: [], said: [] }], deck, { lang: 'en' });
  ok(none.target === undefined && none.perMinute === 0 && !none.slides[0].flag, 'without a time aimed for, and without words heard, nothing is flagged');
}

// ---- the phone remote's commands and state ----------------------------------------------------------------------
{
  ok(JSON.stringify(cleanRemoteCmd({ do: 'go', n: 3 })) === '{"do":"go","n":3}' && JSON.stringify(cleanRemoteCmd({ do: 'next', n: 3 })) === '{"do":"next"}', 'commands are checked; only go takes a number');
  ok(cleanRemoteCmd({ do: 'go', n: 0 }) === null && cleanRemoteCmd({ do: 'go', n: 2.5 }) === null && cleanRemoteCmd({ do: 'explode' }) === null && cleanRemoteCmd('next') === null, 'anything else is refused');
  const st = cleanRemoteState({ i: 2, step: 1, steps: 3, pos: 3, count: 9, blank: 'black', started: 1_700_000_000_000, extra: 'x' });
  ok(JSON.stringify(st) === '{"i":2,"step":1,"steps":3,"pos":3,"count":9,"blank":"black","started":1700000000000}', 'a slideshow’s state is checked, and only what it is kept');
  ok(cleanRemoteState({ i: -1, step: 0, steps: 0, pos: 1, count: 1, started: 1 }) === null && cleanRemoteState({ i: 0, step: 0, steps: 0, pos: 1, count: 1 }) === null, 'a state out of range, or without its start, is refused');
}

// ---- the routes ----------------------------------------------------------------------------------------------------

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
const heard: { key: string; data: any }[] = [];
const deps = { app, db, broadcast() {}, toSubscribers: (key: string, e: { data: unknown }) => void heard.push({ key, data: e.data }), publicBase: () => 'https://hydor.example' } as unknown as Deps;
slidesShow.routes!(deps);
await app.ready();
const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json' } });

{
  // A narration recorded: its bytes as the browser made them, and the length it counted.
  const r = await app.inject({ method: 'POST', url: '/api/slides/sounds?seconds=1.04', payload: WAV, headers: { 'content-type': 'application/octet-stream' } });
  const j = r.json();
  ok(r.statusCode === 200 && /^naget-audio:[a-f0-9]{40}$/.test(j.src) && near(j.seconds, 1, 0.12), `POST /api/slides/sounds keeps a recording (${r.statusCode} ${JSON.stringify(j).slice(0, 120)})`);
  const g = await app.inject({ method: 'GET', url: `/api/slides/sounds/${j.src.slice(12)}`, headers: { range: 'bytes=0-9' } });
  ok(g.statusCode === 206 && g.rawPayload.length === 10 && /^audio\//.test(String(g.headers['content-type'])), 'GET /api/slides/sounds/:sha serves it, a part at a time when asked');
  const bad = await app.inject({ method: 'POST', url: '/api/slides/sounds', payload: Buffer.from('hello, not a sound'), headers: { 'content-type': 'application/octet-stream' } });
  ok(bad.statusCode === 415, `what is not a sound is refused (${bad.statusCode})`);
  const none = await app.inject({ method: 'GET', url: `/api/slides/sounds/${'c'.repeat(40)}` });
  ok(none.statusCode === 404, 'a sound not kept is not found');
}

// ---- narration made with AI, against a stand-in OpenRouter ------------------------------------------------------

const SPEECH = [
  { id: 'elevenlabs/eleven-v3', name: 'ElevenLabs: Eleven v3', created: 1791386272, description: 'Eleven v3 is a text-to-speech model from ElevenLabs.', pricing: { prompt: '0.00008', completion: '0' }, supported_voices: ['george', 'sarah', 'adam'] },
  {
    id: 'bytedance-seed/seed-audio-1-0',
    name: 'ByteDance Seed: Seed Audio 1.0',
    created: 1790372476,
    description: 'It produces speech and other audio from a natural-language text prompt that can describe the desired voice.',
    pricing: { prompt: '0', completion: '0.0025' },
    supported_voices: null,
  },
];
const asked: any[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
  const u = new URL(url);
  const p = u.pathname.replace(/^\/api\/v1/, '');
  const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
  if (p === '/models') return json({ data: u.searchParams.get('output_modalities') === 'speech' ? SPEECH : [] });
  if (p === '/audio/speech') {
    const body = JSON.parse(String(init?.body));
    asked.push(body);
    return MP3 && body.response_format === 'mp3' ? new Response(new Uint8Array(MP3), { headers: { 'content-type': 'audio/mpeg' } }) : new Response(new Uint8Array(PCM), { headers: { 'content-type': 'audio/pcm' } });
  }
  return json({ error: { message: `No route ${p}` } }, 404);
}) as typeof fetch;
{
  const c = loadConfig();
  delete c.openrouter.apiKey;
  saveConfig(c);
  kvSet(db, 'audio', JSON.stringify({ speech: 'elevenlabs/eleven-v3' }));
  const texts = ['Welcome to the plan for the year ahead.', 'Revenue grew forty percent.'];
  const e = (await req('POST', '/api/slides/narration/estimate', { texts })).json();
  const chars = texts.join('').length;
  ok(e.model === 'elevenlabs/eleven-v3' && e.label === 'Eleven v3' && e.voices.join() === 'george,sarah,adam' && e.voice && !e.described, `the estimate names the voice model of the settings and its voices (${e.model}, ${e.voices})`);
  ok(near(e.cost, 0.00008 * chars, 1e-9) && near(e.seconds, chars / 15, 0.2) && e.each.length === 2 && e.keySet === false, `its cost and length, before anything is made, and that no key is set (${e.cost}, ${e.seconds} s)`);
  const nokey = await req('POST', '/api/slides/narration', { text: texts[0] });
  ok(nokey.statusCode === 400 && /Add an OpenRouter key in Settings → Models/.test(nokey.json().error), 'without a key nothing is made, in the words the editors show');
  const c2 = loadConfig();
  c2.openrouter.apiKey = 'sk-or-test';
  saveConfig(c2);
  const made = await req('POST', '/api/slides/narration', { text: texts[0], voice: 'SARAH' });
  const m = made.json();
  const sent = asked.pop();
  ok(made.statusCode === 200 && /^naget-audio:/.test(m.src) && m.text === texts[0] && m.voice === 'sarah' && m.seconds > 0, `a narration is made and kept, its words and voice said (${made.statusCode} ${JSON.stringify(m).slice(0, 160)})`);
  ok(sent?.model === 'elevenlabs/eleven-v3' && sent.input === texts[0] && sent.voice === 'sarah', 'the voice model is asked to read the words, in the voice picked (by its id, whatever its case)');
  ok(!!getSound(db, m.src.slice(12)), 'its sound is in the store');
  const empty = await req('POST', '/api/slides/narration', { text: '   ' });
  ok(empty.statusCode === 400 && /Nothing to read/.test(empty.json().error), 'nothing to read is refused');
  // A voice model that takes a description of the voice: told how to read, and how long it may be.
  kvSet(db, 'audio', JSON.stringify({ speech: 'bytedance-seed/seed-audio-1-0' }));
  const d = (await req('POST', '/api/slides/narration/estimate', { texts: [texts[0], 'x'.repeat(2400)] })).json();
  ok(d.described && d.voices.length === 0 && d.each[1].tooLong === true && !d.each[0].tooLong && d.maxSeconds === 120, 'a model that takes a description has no voices by name, and words longer than it makes are said to be');
  await req('POST', '/api/slides/narration', { text: texts[0], how: 'An excited sports commentator' });
  ok(asked.pop()?.input === `An excited sports commentator: "${texts[0]}"`, 'it is sent the words in quotes after how to read them');
  await req('POST', '/api/slides/narration', { text: texts[1] });
  ok(asked.pop()?.input === `A clear, warm narrator, at an easy, even pace: "${texts[1]}"`, 'without a manner, it reads as a clear, warm narrator');
  const long = await req('POST', '/api/slides/narration', { text: 'x'.repeat(2400) });
  ok(long.statusCode === 400 && /at most 2 minutes at once/.test(long.json().error), `words longer than it makes are refused before any is spent (${long.json().error})`);
}
globalThis.fetch = realFetch;

// ---- the phone remote's routes ------------------------------------------------------------------------------------
{
  forgetShows();
  const deck = normalizeDeck({
    slides: [
      { layout: 'title', title: 'One' },
      { layout: 'title', title: 'Two', notes: 'Say two' },
    ],
  });
  ok((await req('POST', '/api/slides/shows', { page: 'nope', deck })).statusCode === 400, 'a slideshow needs the page it is of');
  ok((await req('POST', '/api/slides/shows', { page: '0123456789', deck: { slides: 'none' } })).statusCode === 400, 'and a deck');
  const made = await req('POST', '/api/slides/shows', { page: '0123456789', title: 'Q3', deck });
  const id = made.json().id as string;
  ok(made.statusCode === 200 && /^[A-Za-z0-9_-]{16}$/.test(id), 'a window showing a slideshow gets an id for its remote');
  const ch = `page:show:${id}`;
  heard.length = 0;
  const got = await req('GET', `/api/slides/shows/${id}`);
  const g = got.json();
  ok(got.statusCode === 200 && g.title === 'Q3' && g.page === '0123456789' && g.deck.slides[1].notes === 'Say two' && g.state === null && g.live === true, 'the phone reads the deck as shown, its title and where it is');
  ok(heard.length === 1 && heard[0].key === ch && heard[0].data.phone === true, 'the window hears that a phone opened its remote, on the slideshow’s own channel');
  ok((await req('PUT', `/api/slides/shows/${id}`, { state: { i: 1 } })).statusCode === 400, 'a state that is not one is refused');
  const state = { i: 1, step: 0, steps: 0, pos: 2, count: 2, blank: null, started: Date.now() - 60_000 };
  ok((await req('PUT', `/api/slides/shows/${id}`, { state })).statusCode === 200 && heard.at(-1)?.key === ch && heard.at(-1)?.data.state.pos === 2, 'where the slideshow is goes to the phone');
  ok((await req('GET', `/api/slides/shows/${id}`)).json().state.i === 1, 'and is kept for a phone that opens it later');
  ok((await req('POST', `/api/slides/shows/${id}/do`, { do: 'go', n: 0 })).statusCode === 400, 'a command that is not one is refused');
  const did = await req('POST', `/api/slides/shows/${id}/do`, { do: 'black' });
  ok(did.statusCode === 200 && did.json().live === true && heard.at(-1)?.data.cmd.do === 'black' && heard.at(-1)?.key === ch, 'a command goes to the window showing the slideshow');
  ok((await req('GET', '/api/slides/shows/unknownshow123')).statusCode === 404, 'a slideshow not started is not found');
  ok((await req('DELETE', `/api/slides/shows/${id}`)).statusCode === 200 && heard.at(-1)?.data.ended === true, 'when the slideshow ends, the phone hears so');
  const after = await req('GET', `/api/slides/shows/${id}`);
  ok(after.statusCode === 404 && /has ended/.test(after.json().error), 'and its remote is gone');
  ok((await req('POST', `/api/slides/shows/${id}/do`, { do: 'next' })).statusCode === 404, 'commands to it are refused');
}

// ---- the narration in PowerPoint --------------------------------------------------------------------------------
{
  const sound = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ', 'latin1'), Buffer.alloc(200, 7)]);
  const deck = normalizeDeck({
    slides: [
      { id: 's1', els: [{ id: 't', type: 'text', x: 100, y: 100, w: 600, h: 100, text: 'Hello' }], anims: [{ el: 't', fx: 'fade', on: 'click' }], narration: { src: `naget-audio:${SHA}`, seconds: 3 } },
      { id: 's2', layout: 'title', title: 'Two', narration: { src: `naget-audio:${SHA}`, seconds: 2 } },
      { id: 's3', layout: 'title', title: 'Three', narration: { src: `naget-audio:${OTHER}`, seconds: 2 } },
      { id: 's4', layout: 'title', title: 'Four' },
    ],
  });
  const notes: string[] = [];
  const file = pptxFile(deck, {
    title: 'Narrated',
    picture: () => null,
    sound: (src) => (src.endsWith(SHA) ? { data: sound, ext: 'm4a', mime: 'audio/mp4', seconds: 2.4 } : { data: Buffer.from('webm'), ext: 'webm', mime: 'audio/webm', seconds: 2 }),
    note: (t) => notes.push(t),
  });
  const z = new Zip(file);
  const s1 = z.read('ppt/slides/slide1.xml')?.toString('utf8') ?? '';
  const s2 = z.read('ppt/slides/slide2.xml')?.toString('utf8') ?? '';
  const s3 = z.read('ppt/slides/slide3.xml')?.toString('utf8') ?? '';
  const s4 = z.read('ppt/slides/slide4.xml')?.toString('utf8') ?? '';
  const rels = z.read('ppt/slides/_rels/slide1.xml.rels')?.toString('utf8') ?? '';
  const types = z.read('[Content_Types].xml')?.toString('utf8') ?? '';
  ok(!!z.read('ppt/media/media1.m4a') && z.read('ppt/media/media1.m4a')!.equals(sound) && !z.read('ppt/media/media2.m4a'), 'the narration’s sound goes inside the file, once for the slides that share it');
  ok(
    /<a:audioFile r:link="rId\d+"\/>/.test(s1) && /<p14:media [^>]*r:embed="rId\d+"\/>/.test(s1) && /relationships\/audio" Target="\.\.\/media\/media1\.m4a"/.test(rels) && /2007\/relationships\/media" Target="\.\.\/media\/media1\.m4a"/.test(rels),
    'it is the slide’s sound, linked and embedded as PowerPoint keeps one',
  );
  ok(
    /<p:audio isNarration="1"><p:cMediaNode vol="80000" showWhenStopped="0">/.test(s1) && /presetClass="mediacall"[^>]*nodeType="afterEffect"/.test(s1) && /cmd="playFrom\(0\.0\)"/.test(s1) && /dur="2400"/.test(s1),
    'PowerPoint plays it as the slide comes, as its narration, hidden in the show',
  );
  const order = s1.indexOf('mediacall') < s1.indexOf('presetClass="entr"');
  ok(order && /evt="onBegin"/.test(s1), 'on a slide whose build waits for clicks it starts before the first click');
  ok(/presetClass="mediacall"[^>]*nodeType="afterEffect"/.test(s2) && /advTm="2900"/.test(s2) && !/advTm/.test(s1), 'a slide with no clicks goes on by itself as its narration ends; one that waits for clicks does not');
  ok(!/audioFile/.test(s3) && !/audioFile|<p:timing>/.test(s4) && notes.some((n) => /narration of slide 3 is left out/.test(n)), `a sound PowerPoint does not play is left out, and the export says so (${notes.join(' ')})`);
  ok(/Extension="m4a" ContentType="audio\/mp4"/.test(types) && /Extension="mp3"/.test(types), 'the file says what its sounds are');
}

// ---- in a real page: the narrated slideshow, rehearsed timings, the app's buttons -------------------------------
if (canCapture()) {
  const deck = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'a', type: 'text', x: 100, y: 100, w: 400, h: 80, text: 'One' },
          { id: 'b', type: 'text', x: 100, y: 300, w: 400, h: 80, text: 'Two' },
        ],
        anims: [
          { el: 'a', fx: 'appear', on: 'click' },
          { el: 'b', fx: 'appear', on: 'click' },
        ],
        narration: { src: `naget-audio:${SHA}`, seconds: 1.8 },
      },
      { els: [{ id: 'c', type: 'text', x: 100, y: 100, w: 400, h: 80, text: 'Three' }], anims: [{ el: 'c', fx: 'appear', on: 'click' }], transition: { auto: 0.4, steps: [0.5] } },
      { els: [] },
    ],
  });
  // A stand-in for the browser's sound: it "plays" for its length (1.8 s here) in steps, as an <audio> does.
  const fake = `class FakeAudio { constructor() { this.currentTime = 0; this.duration = NaN; this.paused = true; window.__made++; } set src(v) { window.__srcs.push(v); this.duration = 1.8; } get src() { return ''; } removeAttribute() {} load() {}
    play() { this.paused = false; clearInterval(this.t); this.t = setInterval(() => { this.currentTime = Math.min(this.duration, this.currentTime + 0.05); this.ontimeupdate && this.ontimeupdate(); if (this.currentTime >= this.duration) { clearInterval(this.t); this.onended && this.onended(); } }, 50); return Promise.resolve(); }
    pause() { this.paused = true; clearInterval(this.t); } }`;
  const page = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="h" style="position:fixed;inset:0"></div><script>
window.__moves = []; window.__srcs = []; window.__made = 0; window.__cam = 0; window.__voice = [];
window.Audio = ${fake};
const rt = (${RUNTIME_SRC})(window, {}, {});
const t0 = performance.now();
window.__show = rt.show(document.getElementById('h'), ${JSON.stringify(deck).replace(/</g, '\\u003c')}, { mode: 'full', keys: true,
  narrate: { sound: (sha) => 'sound:' + sha, onVoice: (v) => v && window.__voice.push(Math.round(v.at * 10) / 10) },
  onMove: (i, s) => window.__moves.push([i, s, Math.round(performance.now() - t0)]),
  extras: [{ id: 'camera', icon: 'camera', label: 'Your camera (V)', key: 'v', run: () => window.__cam++ }] });
</script></body></html>`;
  const r = await withTab({ html: page, width: 1280, height: 720, settleMs: 100 }, async (tab) => {
    const ev = <T>(js: string) => tab.evaluate<T>(js);
    await ev('new Promise((ok) => setTimeout(() => ok(true), 4200))');
    const moves = await ev<[number, number, number][]>('window.__moves');
    const srcs = await ev<string[]>('window.__srcs');
    const btn = await ev<string | null>('(document.querySelector(".ns-bar button[aria-label=\\"Your camera (V)\\"]") || {}).title || null');
    await ev('(window.dispatchEvent(new KeyboardEvent("keydown", { key: "v" })), true)');
    await ev('(window.__show.extra("camera", true), true)');
    const on = await ev<boolean>('document.querySelector(".ns-bar button[aria-label=\\"Your camera (V)\\"]").classList.contains("ns-on")');
    const cam = await ev<number>('window.__cam');
    return { moves, srcs, btn, on, cam };
  });
  const at = (i: number, s: number) => r.moves.find((m) => m[0] === i && m[1] === s)?.[2];
  ok(r.srcs.length === 1 && r.srcs[0] === `sound:${SHA}`, `the narrated slide's narration plays, from where the app says (${r.srcs})`);
  const c1 = at(0, 1);
  const c2 = at(0, 2);
  const next = at(1, 0);
  ok(c1 !== undefined && c1 > 450 && c1 < 1000 && c2 !== undefined && c2 > 1050 && c2 < 1600, `its build's clicks come at a third and two thirds of it (${c1} ms, ${c2} ms of 1800)`);
  ok(next !== undefined && next > 1700 && next < 2400, `the slideshow goes on when it ends (${next} ms)`);
  const step = at(1, 1);
  const third = at(2, 0);
  ok(step !== undefined && next !== undefined && step - next > 350 && step - next < 900, `a rehearsed click comes by itself when it did (${step && next ? step - next : '?'} ms after its slide, 500 rehearsed)`);
  ok(third !== undefined && step !== undefined && third - step > 300 && third - step < 900, `then the slide goes on after its own time (${third && step ? third - step : '?'} ms, 400 rehearsed)`);
  ok(r.btn === 'Your camera (V)' && r.cam === 1 && r.on, 'the app’s button is among the controls, its key does it, and it shows on');
} else console.log('(no browser here: the runtime’s narrated slideshow was not tried in a page)');

await app.close();
closeCapture();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
