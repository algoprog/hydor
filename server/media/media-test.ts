// Script tests for images and videos through OpenRouter and the Library's media: the models' settings and
// prices as OpenRouter lists them, the form each tool shows before it makes anything (and what it does with the
// answer, a closed form, or nobody to answer), generate_image through the images API, generate_video's job
// (sent, followed, downloaded; a call that stops waiting and one that picks the video up), and the Library:
// keeping a file (copied in, a still, a video's frames on one picture), its title and description written by
// the captioning model or from its prompt, editing, the files served in parts, deleting. OpenRouter is a
// stand-in (fetch), ffmpeg makes the test video. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/media/media-test.ts
//   DATA_DIR=/tmp/naget-test-media node dist/dev/media-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { images } from '../images/index.ts';
import { paramsOf } from '../images/openrouter.ts';
import { imageForm, videoCost, videoDefaults, videoForm, videoMismatch } from '../images/settings.ts';
import { perSecondFor, skusOf, timing, videoModel } from '../images/video.ts';
import { loadConfig, saveConfig } from '../models/config.ts';
import { readCaption, titleFrom } from './caption.ts';
import { frameGrid, hasFfmpeg, probe } from './frames.ts';
import { media } from './index.ts';

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

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'naget-media-test-')));
const ff = await hasFfmpeg();
const clip = path.join(tmp, 'clip.mp4');
if (ff) execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-shortest', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);
else console.log('(no ffmpeg here: the frames and stills are not tested)');
// A 2×2 PNG, made by hand.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

// ---- a stand-in for OpenRouter ---------------------------------------------------------------------------

const VIDEO_MODELS = [
  {
    id: 'google/veo-3.1-lite',
    name: 'Google: Veo 3.1 Lite',
    created: 1790000000,
    supported_durations: [8, 4, 6],
    supported_resolutions: ['1080p', '720p'],
    supported_aspect_ratios: ['16:9', '9:16'],
    supported_frame_images: ['first_frame', 'last_frame'],
    generate_audio: true,
    seed: true,
    pricing_skus: { duration_seconds_with_audio: '0.08', duration_seconds_without_audio: '0.05', duration_seconds_with_audio_720p: '0.05', duration_seconds_without_audio_720p: '0.03' },
  },
  {
    id: 'x-ai/grok-imagine-video-1.5-lite',
    name: 'xAI: Grok Imagine Video 1.5 Lite',
    created: 1791000000,
    supported_durations: Array.from({ length: 15 }, (_, i) => i + 1),
    supported_resolutions: ['480p', '720p', '1080p'],
    supported_aspect_ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'],
    supported_frame_images: ['first_frame'],
    pricing_skus: { cents_per_image_input: '1', cents_per_video_output_second_480p: '2', cents_per_video_output_second_720p: '3', cents_per_video_output_second_1080p: '14' },
  },
  { id: 'bytedance/seedance-2.0-fast', name: 'ByteDance: Seedance 2.0 Fast', supported_durations: [4, 5, 6, 7, 8, 9, 10, 11, 12], supported_resolutions: ['480p', '720p'], supported_aspect_ratios: ['16:9'], generate_audio: true, pricing_skus: { video_tokens: '0.0000042', video_tokens_with_video_input: '0.000002475' } },
  { id: 'runway/aleph-2', name: 'Runway: Aleph 2.0', supported_aspect_ratios: ['16:9'], pricing_skus: { cents_per_second_output: '28', minimum_cents_per_generation: '56' } },
];
const IMAGE_MODELS = [
  { id: 'google/gemini-3.1-flash-image', name: 'Google: Gemini 3.1 Flash Image', created: 1790000000, architecture: { input_modalities: ['image', 'text'], output_modalities: ['image', 'text'] }, pricing: { image_output: '0.00006' } },
  { id: 'recraft/recraft-v4', name: 'Recraft: Recraft V4', created: 1780000000, architecture: { input_modalities: ['text'], output_modalities: ['image'] }, pricing: { image_output: '0.0000096' } },
];
const IMAGE_API = [
  {
    id: 'google/gemini-3.1-flash-image',
    supported_parameters: {
      resolution: { type: 'enum', values: ['512', '1K', '2K', '4K'] },
      aspect_ratio: { type: 'enum', values: ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'] },
      n: { type: 'range', min: 1, max: 1 },
      input_references: { type: 'range', min: 0, max: 14 },
    },
  },
  { id: 'recraft/recraft-v4', supported_parameters: { aspect_ratio: { type: 'enum', values: ['1:1', '16:9', 'auto'] }, n: { type: 'range', min: 1, max: 6 }, background: { type: 'enum', values: ['auto', 'transparent', 'opaque'] }, input_references: { type: 'range', min: 0, max: 0 } } },
];
const CATALOG = [...IMAGE_MODELS, { id: 'google/gemini-3.5-flash-lite', name: 'Google: Gemini 3.5 Flash Lite', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, pricing: { prompt: '0.0000001', completion: '0.0000004' }, supported_parameters: [] }];

const calls: { path: string; body?: any; auth?: string }[] = [];
let polls = 0;
let videoStatus: 'completed' | 'failed' | 'slow' = 'completed';
let captionReply = '```json\n{"title": "Colour bars with a tone", "description": "Test bars in bright colours, with a counter running in the corner."}\n```';
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
  const u = new URL(url);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  calls.push({ path: u.pathname + u.search, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? (init?.headers as Record<string, string> | undefined)?.authorization });
  const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/models') return json({ data: u.searchParams.get('output_modalities') === 'image' ? IMAGE_MODELS : CATALOG });
  if (p === '/images/models') return json({ data: IMAGE_API });
  if (p === '/videos/models') return json({ data: VIDEO_MODELS });
  if (p === '/images') return json({ created: 1, data: [{ b64_json: PNG.toString('base64'), media_type: 'image/png' }], usage: { cost: 0.024 } });
  if (p === '/videos') return json({ id: `gen-vid-1793648434-${String(calls.length).padStart(20, 'a')}`, polling_url: 'x', status: 'pending' }, 202);
  const job = /^\/videos\/([^/]+)$/.exec(p)?.[1];
  if (job) {
    polls++;
    if (videoStatus === 'slow' || polls % 2 === 1) return json({ id: job, status: 'in_progress' });
    if (videoStatus === 'failed') return json({ id: job, status: 'failed', error: 'Content policy violation' });
    return json({ id: job, status: 'completed', unsigned_urls: [`https://openrouter.ai/api/v1/videos/${job}/content?index=0`], usage: { cost: 0.4 } });
  }
  if (/^\/videos\/[^/]+\/content$/.test(p)) return new Response(ff ? fs.readFileSync(clip) : Buffer.from('not a video'), { headers: { 'content-type': 'video/mp4' } });
  if (p === '/chat/completions') {
    const sse = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: captionReply } }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.0004 } })}\n\ndata: [DONE]\n\n`;
    return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
  }
  return json({ error: { message: `No route ${p}` } }, 404);
}) as typeof fetch;

timing.pollMs = 20;

// ---- the app around it --------------------------------------------------------------------------------------

const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
// As the app's server reads JSON: an empty body is an empty object.
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
/** The cards shown, and how the stand-in user answers them. */
const cards: any[] = [];
let answer: (card: any) => { decision: string; form?: Record<string, string> } | null = (card) => ({ decision: 'accept', form: Object.fromEntries(card.form.fields.map((f: any) => [f.id, f.default ?? ''])) });
const adapter = {
  ask: async (card: any, o: { check?: (a: any) => string | null }) => {
    cards.push(card);
    const a = answer(card);
    if (a && o.check?.(a)) throw new Error(`The form refused the answer: ${o.check(a)}`);
    return a;
  },
};
let present = true;
const deps = {
  app,
  db,
  sessions: { adapterByRun: () => (present ? adapter : null) },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (e: { t: string }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
images.routes!(deps);
media.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tool = (name: string) => images.tools!(ctx).find((t) => t.name === name)!;
const run = async (name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> => {
  try {
    const r = await tool(name).run(args, ctx);
    return typeof r === 'string' ? { text: r } : r;
  } catch (e) {
    return { text: String((e as Error).message), isError: true };
  }
};
const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
const until = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return cond();
};

// ---- models, settings and prices ----------------------------------------------------------------------------

{
  const veo = videoModel(VIDEO_MODELS[0]);
  ok(veo.durations.join() === '4,6,8' && veo.resolutions.join() === '720p,1080p', 'lengths and resolutions come in order');
  ok(veo.audio && veo.frames.includes('last_frame') && !veo.videoIn, 'what Veo makes');
  ok(perSecondFor(veo, '720p', true) === 0.05 && perSecondFor(veo, '1080p', false) === 0.05 && perSecondFor(veo, '1080p', true) === 0.08 && perSecondFor(veo, '720p', false) === 0.03, `Veo's prices by resolution and sound: ${perSecondFor(veo, '720p', true)}`);
  ok(veo.perSecond === 0.03 && veo.perSecondMax === 0.08, 'its cheapest and dearest second');
  const grok = videoModel(VIDEO_MODELS[1]);
  ok(perSecondFor(grok, '480p') === 0.02 && perSecondFor(grok, '1080p') === 0.14, 'cents a second, by resolution');
  ok(!skusOf(videoModel(VIDEO_MODELS[1]).skus ?? {}).some((s) => s.usd === 0.01), 'a picture given is not a price a second');
  const seed = videoModel(VIDEO_MODELS[2]);
  ok(Math.abs((perSecondFor(seed, '720p') ?? 0) - 0.0000042 * ((1280 * 720 * 24) / 1024)) < 1e-6, 'video tokens a second');
  const aleph = videoModel(VIDEO_MODELS[3]);
  ok(aleph.videoIn && aleph.perSecond === 0.28, 'an editing model works on a video, and costs by the second');

  const d = videoDefaults(veo);
  ok(d.duration === 6 && d.resolution === '720p' && d.aspect === '16:9' && d.audio === true, `the defaults: ${JSON.stringify(d)}`);
  const f = videoForm(veo, d);
  ok(f.duration.oneOf.map((x: any) => x.title).join() === '4 seconds,6 seconds,8 seconds' && f.duration.default === 6, 'a few lengths are choices');
  ok(f.aspect.oneOf.length === 2 && f.resolution && f.audio.type === 'boolean', 'shape, resolution and sound');
  const g = videoForm(grok, videoDefaults(grok));
  ok(g.duration.type === 'integer' && g.duration.minimum === 1 && g.duration.maximum === 15, 'many lengths in a row are a number');
  ok(!('audio' in g), 'no sound to ask about where the model makes none');
  ok(videoMismatch(veo, { duration: 5 })?.includes('4, 6, 8'), 'a length the model does not make');
  ok(Math.abs((videoCost(veo, { duration: 8, resolution: '1080p', audio: true }) ?? 0) - 0.64) < 1e-9, 'what a video costs');

  const params = paramsOf(IMAGE_API[0].supported_parameters);
  ok(params.find((p) => p.id === 'resolution')?.values?.length === 4 && params.find((p) => p.id === 'n')?.max === 1, 'image settings read');
  const im = imageForm({ id: 'g', label: 'G', textOut: true, edits: true, params }, {});
  ok(im.aspect.oneOf.length <= 10 && !im.aspect.oneOf.some((x: any) => x.const === '1:8'), 'odd shapes stay off the form');
  ok(!('count' in im), 'no count where the model makes one');
  const rc = imageForm({ id: 'r', label: 'R', textOut: false, edits: false, params: paramsOf(IMAGE_API[1].supported_parameters) }, {});
  ok(rc.count.maximum === 4 && rc.transparent.type === 'boolean' && rc.aspect.oneOf.some((x: any) => x.const === 'auto'), 'how many, a transparent background, auto shape');
}

// ---- generate_image ------------------------------------------------------------------------------------

{
  const none = await run('generate_image', { prompt: 'a red boat' });
  ok(none.isError && /no OpenRouter key/.test(none.text), 'no key: says where to add one');
  const c = loadConfig();
  c.openrouter.apiKey = 'sk-or-test';
  saveConfig(c);

  cards.length = 0;
  calls.length = 0;
  answer = (card) => ({ decision: 'accept', form: { ...Object.fromEntries(card.form.fields.map((f: any) => [f.id, f.default ?? ''])), aspect: 'Wide (16:9)', size: '2K' } });
  const r = await run('generate_image', { prompt: 'A red paper boat on a calm pond' });
  ok(!r.isError && /^Made an image with google\/gemini-3\.1-flash-image \(\$0\.024\), 16:9, 2K:/.test(r.text), `made, with what the user picked: ${r.text.split('\n')[0]}`);
  ok(cards.length === 1 && cards[0].form.fields.some((f: any) => f.id === 'aspect') && /Gemini 3\.1 Flash Image/.test(cards[0].detail) && /about \$0\.077 an image/.test(cards[0].detail), 'the form shows the model and its price');
  const sent = calls.find((x) => x.path === '/api/v1/images');
  ok(sent?.body.aspect_ratio === '16:9' && sent.body.resolution === '2K' && sent.body.model === 'google/gemini-3.1-flash-image' && sent.auth === 'Bearer sk-or-test', 'the images API is asked with the settings');
  const file = /^(\/\S+\.png) \(2×2/m.exec(r.text)?.[1];
  ok(file && fs.existsSync(file) && file.startsWith(path.join(tmp, 'images')), 'saved in the session folder');

  cards.length = 0;
  const again = await run('generate_image', { prompt: 'Now a blue one' });
  ok(!again.isError && !cards.length && /16:9, 2K/.test(again.text), 'the next image in the session uses the same settings, without the form');
  const forced = await run('generate_image', { prompt: 'A green one', ask: true });
  ok(!forced.isError && cards.length === 1, 'ask: true shows it again');

  cards.length = 0;
  answer = () => ({ decision: 'decline' });
  const closed = await run('generate_image', { prompt: 'A logo', model: 'recraft/recraft-v4' });
  ok(!closed.isError && /closed the form: no image was made/.test(closed.text), 'closing the form makes nothing');
  ok(cards[0]?.form.fields.some((f: any) => f.id === 'transparent'), 'the form is the model’s own');

  cards.length = 0;
  const quiet = await run('generate_image', { prompt: 'A logo', model: 'recraft/recraft-v4', ask: false, transparent: true });
  ok(!quiet.isError && !cards.length && /transparent background/.test(quiet.text), 'ask: false makes it at once');
  ok(calls.filter((x) => x.path === '/api/v1/images').pop()?.body.background === 'transparent', 'a transparent background is asked for');
  const wrong = await run('generate_image', { prompt: 'A logo', model: 'recraft/recraft-v4', ask: false, aspect_ratio: '9:16' });
  ok(wrong.isError && /does not take the shape 9:16/.test(wrong.text), 'a shape the model does not take');
  const opaque = await run('generate_image', { prompt: 'A logo', ask: false, transparent: true });
  ok(opaque.isError && /does not make transparent backgrounds/.test(opaque.text), 'a transparent background the model cannot make');
  await run('generate_image', { prompt: 'Three cats', ask: false, count: 3 });
  ok(calls.filter((x) => x.path === '/api/v1/images').pop()?.body.n === undefined, 'no more images at once than the model makes');
  const edits = await run('generate_image', { prompt: 'Make it blue', model: 'recraft/recraft-v4', images: [file], ask: false });
  ok(edits.isError && /does not take pictures/.test(edits.text), 'a model that does not edit');
  const nope = await run('generate_image', { prompt: 'x', model: 'nobody/nothing' });
  ok(nope.isError && /no image model nobody\/nothing/.test(nope.text), 'a model OpenRouter does not have');

  present = false;
  cards.length = 0;
  const alone = await run('generate_image', { prompt: 'A cat', model: 'recraft/recraft-v4' });
  ok(!alone.isError && !cards.length, 'nobody to answer: made with the defaults');
  present = true;
  answer = (card) => ({ decision: 'accept', form: Object.fromEntries(card.form.fields.map((f: any) => [f.id, f.default ?? ''])) });
}

// ---- generate_video ------------------------------------------------------------------------------------

{
  cards.length = 0;
  calls.length = 0;
  answer = (card) => ({ decision: 'accept', form: { ...Object.fromEntries(card.form.fields.map((f: any) => [f.id, f.default ?? ''])), duration: '8 seconds', audio: 'No' } });
  const r = await run('generate_video', { prompt: 'A red paper boat drifting on a pond, slow push-in', aspect_ratio: '9:16' });
  ok(!r.isError && /^Made a video with google\/veo-3\.1-lite \(\$0\.40\), 8 s, 9:16, 720p, no sound:/.test(r.text), `made: ${r.text.split('\n')[0]}`);
  ok(cards.length === 1 && /about \$0\.30/.test(cards[0].detail) && /\$0\.03 to \$0\.08 a second/.test(cards[0].detail), `the form says what it costs: ${cards[0]?.detail}`);
  ok(cards[0].form.fields.find((f: any) => f.id === 'aspect')?.default === 'Tall (9:16)', 'what the agent gave is filled in');
  const sent = calls.find((x) => x.path === '/api/v1/videos')?.body;
  ok(sent && sent.duration === 8 && sent.aspect_ratio === '9:16' && sent.resolution === '720p' && sent.generate_audio === false, `the job asks for what the user picked: ${JSON.stringify(sent)}`);
  const file = /^(\/\S+\.mp4) \(/m.exec(r.text)?.[1];
  ok(file && fs.existsSync(file) && file.startsWith(path.join(tmp, 'videos')), 'downloaded into the session folder');
  if (ff) ok(/\(640×360, 3 s, /.test(r.text), `its size and length: ${r.text.split('\n')[1]}`);

  const frames = await run('generate_video', { prompt: 'It sails off', first_frame: path.join(tmp, 'images', fs.readdirSync(path.join(tmp, 'images'))[0]), ask: false });
  const fsent = calls.filter((x) => x.path === '/api/v1/videos').pop()?.body;
  ok(!frames.isError && fsent.frame_images?.[0]?.frame_type === 'first_frame' && /^data:image\/png;base64,/.test(fsent.frame_images[0].image_url.url), 'a picture to start on goes as the first frame');
  const noLast = await run('generate_video', { prompt: 'x', model: 'x-ai/grok-imagine-video-1.5-lite', last_frame: file?.replace(/\.mp4$/, '.png'), ask: false });
  ok(noLast.isError, 'a frame the model does not take');
  const edit = await run('generate_video', { prompt: 'Make it night', model: 'runway/aleph-2', ask: false });
  ok(edit.isError && /changes a video it is given/.test(edit.text), 'an editing model needs a video');
  const tooLong = await run('generate_video', { prompt: 'x', duration: 5, ask: false });
  ok(tooLong.isError && /4, 6, 8 seconds/.test(tooLong.text), 'a length the model does not make');

  videoStatus = 'failed';
  const bad = await run('generate_video', { prompt: 'Something it refuses', ask: false });
  ok(bad.isError && /Content policy violation/.test(bad.text), 'a failed job says why');

  // A call that stops waiting, and the next one that picks the video up.
  videoStatus = 'slow';
  const signal = new AbortController();
  const slowCtx = { ...ctx, signal: signal.signal };
  setTimeout(() => signal.abort(), 300);
  const slow = await tool('generate_video').run({ prompt: 'A long one', ask: false }, slowCtx as RunCtx);
  const text = typeof slow === 'string' ? slow : slow.text;
  const job = /job: "([^"]+)"/.exec(text)?.[1];
  ok(job && /still being made/.test(text), 'a call that stops waiting gives the job');
  videoStatus = 'completed';
  const picked = await run('generate_video', { job });
  ok(!picked.isError && /^Made a video/.test(picked.text), 'the job is picked up');
}

// ---- the Library -----------------------------------------------------------------------------------------

{
  ok(titleFrom({ kind: 'image', prompt: 'a red paper boat on a calm pond, flat illustration with soft light' }) === 'A red paper boat on a calm pond', 'a title from the prompt');
  ok(titleFrom({ kind: 'video', name: 'red-paper_boat.mp4' }) === 'Red paper boat', 'a title from the file’s name');
  ok(readCaption('Sure! ```json\n{"title": "“Boat.”", "description": " A boat.  "}```')?.title === 'Boat', 'a caption read out of an answer');
  ok(readCaption('no json here') === null, 'no caption in an answer');

  const s = await req('GET', '/api/media/settings');
  ok(s.json().captions.provider === 'auto' && /Gemini 3\.5 Flash Lite, through OpenRouter/.test(s.json().captions.using?.label), `the app's choice: ${JSON.stringify(s.json().captions)}`);
  const list = await req('GET', '/api/media/caption-models?provider=openrouter');
  ok(list.json().models.some((m: any) => m.id === 'google/gemini-3.5-flash-lite') && !list.json().models.some((m: any) => m.id === 'recraft/recraft-v4'), 'OpenRouter’s models that see images');
  ok((await req('GET', '/api/media/caption-models?provider=claude')).json().models.map((m: any) => m.id).join() === 'haiku,sonnet,opus', 'Claude’s models');
  ok((await req('PUT', '/api/media/settings', { captions: { provider: 'nope' } })).statusCode === 400, 'a provider that is not');

  const vids = fs.readdirSync(path.join(tmp, 'videos'));
  const video = path.join(tmp, 'videos', vids[0]);
  events.length = 0;
  const kept = await req('POST', '/api/media', { path: video, prompt: 'A red paper boat drifting on a pond, slow push-in', model: 'google/veo-3.1-lite', sessionKey: 'claude:s1' });
  const item = kept.json().item;
  ok(kept.statusCode === 200 && item.kind === 'video' && item.caption === 'pending' && item.title === 'A red paper boat drifting on a pond', `kept, its title from the prompt for now: ${item?.title}`);
  if (ff) ok(item.width === 640 && item.height === 360 && Math.round(item.duration) === 3, 'its size and length');
  ok(fs.existsSync(item.file) && item.file !== video, 'copied into the Library');
  ok(await until(() => events.some((e) => e.id === 'media' && e.data.item?.caption === 'done')), 'its title and description are written');
  const done = (await req('GET', `/api/media/${item.id}`)).json().item;
  ok(done.title === 'Colour bars with a tone' && /counter/.test(done.description) && done.captionBy === 'Gemini 3.5 Flash Lite, through OpenRouter', `written by the model: ${done.title}`);
  const chat = calls.filter((x) => x.path === '/api/v1/chat/completions').pop()?.body;
  ok(chat?.model === 'google/gemini-3.5-flash-lite' && /10 frames of a 3-second video/.test(JSON.stringify(chat.messages)) && /image_url/.test(JSON.stringify(chat.messages)), 'the model sees the frames, told what they are');
  if (ff) {
    const st = await req('GET', `/api/media/${item.id}/still`);
    ok(st.statusCode === 200 && st.headers['content-type'] === 'image/jpeg', 'a still to show it by');
    const fr = await req('GET', `/api/media/${item.id}/frames`);
    ok(fr.statusCode === 200 && fr.rawPayload.length > 1000, 'its frames on one picture');
    const p = await probe(path.join(os.tmpdir(), 'x-none.jpg'));
    ok(p === null, 'nothing to probe');
    const grid = path.join(tmp, 'grid.jpg');
    const layout = await frameGrid(clip, grid, { duration: 3, width: 640, height: 360 });
    const gp = await probe(grid);
    ok(layout?.cols === 2 && layout.rows === 5 && gp && gp.height! > gp.width!, `a wide video's frames: two across (${gp?.width}×${gp?.height})`);
    const tall = await frameGrid(clip, grid, { duration: 3, width: 360, height: 640 });
    ok(tall?.cols === 5 && tall.rows === 2, 'a tall one’s: five across');
  }
  const part = await req('GET', `/api/media/${item.id}/file`, undefined, { range: 'bytes=0-99' });
  ok(part.statusCode === 206 && part.rawPayload.length === 100 && /^bytes 0-99\//.test(String(part.headers['content-range'])), 'the file in parts, for a video player');
  const dl = await req('GET', `/api/media/${item.id}/file?download=1`);
  ok(/attachment; filename\*=UTF-8''colour-bars-with-a-tone\.mp4/.test(String(dl.headers['content-disposition'])), 'downloaded under its title');

  const twice = await req('POST', '/api/media', { path: video });
  ok(twice.json().existed === true && twice.json().item.id === item.id, 'kept once');

  const edited = await req('PATCH', `/api/media/${item.id}`, { title: 'My boat', description: 'Mine.' });
  ok(edited.json().item.title === 'My boat' && edited.json().item.caption === 'edited', 'the user’s own title');
  ok((await req('PATCH', `/api/media/${item.id}`, { title: '  ' })).statusCode === 400, 'a title is needed');

  // Without a model to write them: from the prompt, and why.
  await req('PUT', '/api/media/settings', { captions: { provider: 'ollama' } });
  const pic = path.join(tmp, 'images', fs.readdirSync(path.join(tmp, 'images'))[0]);
  events.length = 0;
  const p2 = (await req('POST', '/api/media', { path: pic, prompt: 'A red paper boat on a calm pond' })).json().item;
  ok(p2.kind === 'image' && p2.width === 2 && p2.height === 2, 'a picture, its size from its header');
  ok(await until(() => events.some((e) => e.id === 'media' && e.data.item?.caption === 'failed')), 'no model: the caption fails');
  const p2b = (await req('GET', `/api/media/${p2.id}`)).json().item;
  ok(p2b.title === 'A red paper boat on a calm pond' && p2b.description === 'A red paper boat on a calm pond' && /No model with Ollama sees images/.test(p2b.captionError), `from the prompt, and why: ${p2b.captionError}`);

  await req('PUT', '/api/media/settings', { captions: { provider: 'openrouter', model: 'google/gemini-3.5-flash-lite' } });
  captionReply = '{"title": "A tiny boat", "description": "A small red boat."}';
  events.length = 0;
  await req('POST', `/api/media/${p2.id}/caption`);
  ok(await until(() => events.some((e) => e.id === 'media' && e.data.item?.caption === 'done')), 'written again');
  ok((await req('GET', `/api/media/${p2.id}`)).json().item.title === 'A tiny boat', 'with the model picked');

  ok((await req('POST', '/api/media', { path: path.join(tmp, 'test.db') })).statusCode === 400, 'only pictures and videos');
  ok((await req('POST', '/api/media', { path: path.join(tmp, 'nothing.png') })).statusCode === 404, 'a file that is not there');
  const all = (await req('GET', '/api/media')).json().items;
  ok(all.length === 2 && all[0].id === p2.id, 'newest first');
  const gone = await req('DELETE', `/api/media/${item.id}`);
  ok(gone.statusCode === 200 && !fs.existsSync(item.file) && (await req('GET', `/api/media/${item.id}`)).statusCode === 404, 'deleted, file and all');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
