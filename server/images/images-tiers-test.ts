// Script tests for pictures and drawings in two tiers: which tier a picture or a drawing needs (tierFor,
// drawingTierFor) and which model each tier uses (the settings round trip, GET /api/images/tiers); drawings cleaned
// (cleanSvg against scripts, links out, styles that load, entities, loops of <use>, and a drawing's own CSS put on
// its shapes); a change put together where its mask is white (blend.ts); POST /api/images/make, /edit and /svg
// against a stand-in for OpenRouter (the words a model is asked, the nearest shape, several pictures from a model
// that makes one at a time, see-through backgrounds from a model that makes them or cut out on this computer,
// refusals, a mask sent and the answer put in); the agents' generate_image (detail) and make_svg; and with no
// OpenRouter key, the key asked for on a card (nobody there to ask, skipped, given). The model that writes drawings
// is a helper model pointed at the stand-in. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/images/images-tiers-test.ts
//   DATA_DIR=/tmp/hydor-test-tiers node dist/dev/images-tiers-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { drawingTierFor, tierFor } from '../../shared/image-tier.ts';
import type { LocalToolsState } from '../../shared/images.ts';
import { QUICK_PICKS } from '../../shared/model-picks.ts';
import { keyGiven, keySkipped, OPENROUTER_REQUEST } from '../connections/openrouter-key.ts';
import { latestRequest, vaultTables } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { loadConfig, saveConfig, writeAgentModels } from '../models/config.ts';
import { getAsset, initAssets, putAsset } from '../pages/assets.ts';
import { readPng, writePng, type Rgba } from '../signatures/png.ts';
import { featherOf, putTogether, resample, soften, weights } from './blend.ts';
import { cloudTools, setLocalTools } from './hooks.ts';
import { images } from './index.ts';
import { changeWords, nearestAspect, worded } from './make.ts';
import { cleanDrawing, cleanSvg, svgIn } from './svg-clean.ts';

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

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-tiers-test-')));
{
  const c = loadConfig();
  delete c.openrouter.apiKey;
  saveConfig(c);
}

// ---- pictures to work with ------------------------------------------------------------------------------------

/** A w×h picture, each pixel `f(x, y)` as [r, g, b, a]. */
function picture(w: number, h: number, f: (x: number, y: number) => number[]): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
const pixel = (img: Rgba, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const same = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);
const RED = [220, 30, 40, 255];
// Every pixel of the original its own colour, so a pixel taken from anywhere else shows.
const ORIG = picture(64, 48, (x, y) => [x * 3, y * 5, (x * y) % 251, 255]);
const ORIG_PNG = writePng(ORIG);
const RED_SAME = writePng(picture(64, 48, () => RED));
const RED_BIG = writePng(picture(128, 96, () => RED));
const RED_WIDE = writePng(picture(96, 48, () => RED));
/** White on the right half: change only there. */
const MASK = writePng(picture(64, 48, (x) => (x >= 32 ? [255, 255, 255, 255] : [0, 0, 0, 255])));
const MASK_SMALL = writePng(picture(32, 24, (x) => (x >= 16 ? [255, 255, 255, 255] : [0, 0, 0, 255])));
const MASK_SQUARE = writePng(picture(50, 50, () => [255, 255, 255, 255]));
const CLEAR = writePng(picture(8, 8, (x) => [10, 200, 10, x < 4 ? 0 : 255]));
// A JPEG's header (64×48), enough for the app to know it as one.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 48, 0, 64, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 0xff, 0xd9]);
const dataUrl = (b: Buffer, mime = 'image/png') => `data:${mime};base64,${b.toString('base64')}`;

// ---- a stand-in for OpenRouter -----------------------------------------------------------------------------

const arch = (inputs: string[]) => ({ input_modalities: inputs, output_modalities: ['image'] });
const CATALOG = [
  { id: 'bytedance-seed/seedream-5-0-pro', name: 'ByteDance Seed: Seedream 5.0 Pro', created: 1790000000, architecture: arch(['text', 'image']), pricing: { image_output: '0.0000107784431137725' } },
  { id: 'bytedance-seed/seedream-5-0-flash', name: 'ByteDance Seed: Seedream 5.0 Flash', created: 1790000001, architecture: arch(['text', 'image']), pricing: { image_output: '0.00000431137724550898' } },
  { id: 'recraft/recraft-v4.1-flash', name: 'Recraft: Recraft V4.1 Flash', created: 1790000002, architecture: arch(['text']), pricing: { image_output: '0.00000167664670658683' } },
  { id: 'recraft/recraft-v4.1', name: 'Recraft: Recraft V4.1', created: 1790000003, architecture: arch(['text', 'image']), pricing: { image_output: '0.00000838323353293413' } },
  { id: 'openai/gpt-image-1-mini', name: 'OpenAI: GPT Image 1 Mini', created: 1780000000, architecture: arch(['text', 'image']), pricing: { image_output: '0.000008' } },
  { id: 'openai/gpt-image-2.6-flare', name: 'OpenAI: GPT Image 2.6 Flare', created: 1795000000, architecture: arch(['text', 'image']), pricing: { image_output: '0.00003' } },
  { id: 'recraft/recraft-v4.1-vector', name: 'Recraft: Recraft V4.1 Vector', created: 1790000004, architecture: arch(['text', 'image']), pricing: { image_output: '0.0000191616766467066' } },
];
const enumOf = (values: string[]) => ({ type: 'enum', values });
const range = (min: number, max: number) => ({ type: 'range', min, max });
const SEEDREAM_SHAPES = ['1:1', '1:2', '2:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '9:21', '21:9', 'auto'];
const RECRAFT_SHAPES = ['1:1', '4:3', '3:4', '16:9', '9:16', 'auto'];
const GPT = { aspect_ratio: enumOf(['1:1', '3:2', '2:3', 'auto']), quality: enumOf(['auto', 'low', 'medium', 'high']), background: enumOf(['auto', 'transparent', 'opaque']), n: range(1, 10), input_references: range(0, 16) };
const IMAGE_API = [
  { id: 'bytedance-seed/seedream-5-0-pro', supported_parameters: { resolution: enumOf(['1K', '2K']), aspect_ratio: enumOf(SEEDREAM_SHAPES), n: range(1, 1), input_references: range(0, 14) } },
  { id: 'bytedance-seed/seedream-5-0-flash', supported_parameters: { resolution: enumOf(['1K', '2K']), aspect_ratio: enumOf(SEEDREAM_SHAPES), n: range(1, 1), input_references: range(0, 14) } },
  { id: 'recraft/recraft-v4.1-flash', supported_parameters: { aspect_ratio: enumOf(RECRAFT_SHAPES), n: range(1, 6) } },
  { id: 'recraft/recraft-v4.1', supported_parameters: { aspect_ratio: enumOf(RECRAFT_SHAPES), n: range(1, 6), input_references: range(0, 1) } },
  { id: 'openai/gpt-image-1-mini', supported_parameters: GPT },
  { id: 'openai/gpt-image-2.6-flare', supported_parameters: { ...GPT, aspect_ratio: enumOf(['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', 'auto']), output_format: enumOf(['png', 'jpeg', 'webp', 'gif']) } },
  { id: 'recraft/recraft-v4.1-vector', supported_parameters: { aspect_ratio: enumOf(RECRAFT_SHAPES), output_format: enumOf(['svg']), n: range(1, 6), input_references: range(0, 1) } },
];
const VIDEO_MODELS = [
  { id: 'bytedance/seedance-2.5', name: 'ByteDance: Seedance 2.5', supported_durations: [4, 5, 6], supported_resolutions: ['480p', '720p'], supported_aspect_ratios: ['16:9'], generate_audio: true, pricing_skus: { cents_per_second_output: '12' } },
];

/** A drawing as Recraft's vector model might send it: with a script for the cleaner to take out. */
const VECTOR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><script>alert(1)</script><path d="M0 0L1024 1024" fill="#123456" onload="x()"/><image href="https://evil.example/x.png"/></svg>';
/** What the writer answers: Markdown around the drawing, an onclick and a foreignObject in it. */
let writerAnswers: string[] = [];
const WRITTEN = 'Here it is:\n```svg\n<svg viewBox="0 0 512 512"><rect width="512" height="512" fill="#1f6feb" onclick="steal()"/><foreignObject><p>hi</p></foreignObject><circle cx="256" cy="256" r="100" fill="#fff"/></svg>\n```';

/** What the images API answers next: a picture, a refusal, nothing. */
let answer: 'png' | 'red-same' | 'red-big' | 'red-wide' | 'clear' | 'refuse' | 'empty' = 'png';
const calls: { path: string; body?: any; auth?: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
  const u = new URL(url);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  const p = u.pathname.replace(/^\/api\/v1/, '');
  calls.push({ path: p, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
  const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
  if (p === '/models') return json({ data: u.searchParams.get('output_modalities') === 'image' ? CATALOG : [] });
  if (p === '/images/models') return json({ data: IMAGE_API });
  if (p === '/videos/models') return json({ data: VIDEO_MODELS });
  if (p === '/images') {
    if (/vector/.test(body.model)) return json({ data: [{ b64_json: Buffer.from(VECTOR_SVG).toString('base64'), media_type: 'image/svg+xml' }], usage: { cost: 0.08 } });
    if (answer === 'refuse') return json({ error: { message: 'Your request was rejected by the safety system.' } }, 400);
    if (answer === 'empty') return json({ data: [] });
    const pic = { png: ORIG_PNG, 'red-same': RED_SAME, 'red-big': RED_BIG, 'red-wide': RED_WIDE, clear: CLEAR }[answer];
    const n = Math.max(1, Number(body.n) || 1);
    return json({ created: 1, data: Array.from({ length: n }, () => ({ b64_json: pic.toString('base64'), media_type: 'image/png' })), usage: { cost: 0.02 * n } });
  }
  if (p === '/chat/completions') {
    const text = writerAnswers.shift() ?? WRITTEN;
    const sse = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 200, cost: 0.001 } })}\n\ndata: [DONE]\n\n`;
    return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
  }
  return json({ error: { message: `No route ${p}` } }, 404);
}) as typeof fetch;

// The picture tools on this computer, standing in: a cutout makes a PNG with see-through parts.
let localReady = false;
let cutouts = 0;
const LOCAL: LocalToolsState = { ready: true, installing: false, canInstall: true, sizeMb: 120, downloaded: ['cutout'], loaded: [], device: 'cpu' };
setLocalTools({
  state: () => ({ ...LOCAL, ready: localReady }),
  ready: () => localReady,
  cutout: async () => {
    cutouts++;
    return CLEAR;
  },
  erase: async () => {
    throw new Error('not here');
  },
  runPython: async () => {
    throw new Error('not here');
  },
});

// ---- the app around it --------------------------------------------------------------------------------------

const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
vaultTables(db);
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
const cards: any[] = [];
let decide: (card: any) => { decision: string; form?: Record<string, string> } | null = (card) => ({ decision: 'accept', form: Object.fromEntries(card.form.fields.map((f: any) => [f.id, f.default ?? ''])) });
const adapter = {
  ask: async (card: any) => {
    cards.push(card);
    return decide(card);
  },
};
/** Someone is there to answer cards (false: a scheduled task's run). */
let present = true;
const deps = {
  app,
  db,
  sessions: { adapterByRun: () => (present ? adapter : null) },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast() {},
  toSubscribers() {},
  publicBase: () => 'https://hydor.example',
} as unknown as Deps;
images.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:t1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tool = (name: string) => images.tools!(ctx).find((t) => t.name === name);
const runIn = async (c: RunCtx, name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> => {
  try {
    const r = await images.tools!(c)
      .find((t) => t.name === name)!
      .run(args, c);
    return typeof r === 'string' ? { text: r } : r;
  } catch (e) {
    return { text: String((e as Error).message), isError: true };
  }
};
const run = (name: string, args: Record<string, unknown>) => runIn(ctx, name, args);
const until = async (cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return cond();
};
const req = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const lastImages = () => calls.filter((c) => c.path === '/images').pop()?.body;
const asset = (src: string) => getAsset(db, src.replace(/^naget-asset:/, ''));
const setKey = (k?: string) => {
  const c = loadConfig();
  if (k) c.openrouter.apiKey = k;
  else delete c.openrouter.apiKey;
  saveConfig(c);
};

// ---- which tier ---------------------------------------------------------------------------------------------

{
  ok(tierFor('quick', { prompt: 'A crowded street at night, people with umbrellas' }) === 'quick' && tierFor('best', { prompt: 'a dot' }) === 'best', 'a tier asked for is the one used');
  ok(tierFor('auto', { prompt: 'Soft blue gradient', kind: 'background' }) === 'quick' && tierFor(undefined, { prompt: 'paper', kind: 'texture' }) === 'quick', 'backgrounds and textures are Quick');
  ok(tierFor('auto', { prompt: 'a lighthouse', kind: 'icon' }) === 'quick' && tierFor('auto', { prompt: 'Make it night', edit: true }) === 'best', 'an icon is Quick; a change is Best');
  ok(
    tierFor('auto', { prompt: 'x', refs: 1 }) === 'best' && tierFor('auto', { prompt: 'a cat', kind: 'photo' }) === 'best' && tierFor('auto', { prompt: 'The menu with the words "Soup of the day"' }) === 'best',
    'pictures to follow, photos and words in a picture are Best',
  );
  ok(tierFor('auto', { prompt: 'A red apple' }) === 'quick' && tierFor('auto', { prompt: 'A watercolour of an old harbour town at dawn with fishing boats, gulls and the hills behind it' }) === 'best', 'a short simple ask is Quick, a long one Best');
  ok(tierFor('auto', { prompt: 'A diagram of the water cycle', kind: 'icon' }) === 'quick' && tierFor('auto', { prompt: 'A sign that says "OPEN"', kind: 'icon' }) === 'best', 'an icon stays Quick unless it has quoted words');
  ok(drawingTierFor('auto', { prompt: 'a rocket', kind: 'icon' }) === 'quick' && drawingTierFor('auto', { prompt: 'a fox', kind: 'illustration' }) === 'best', 'an icon is written, an illustration drawn');
  ok(
    drawingTierFor(undefined, { prompt: 'A detailed scene of a forest' }) === 'best' && drawingTierFor(undefined, { prompt: 'three arrows in a circle' }) === 'quick' && drawingTierFor('quick', { prompt: 'x', kind: 'illustration' }) === 'quick',
    'by its words, or as asked',
  );
}

// ---- drawings cleaned -------------------------------------------------------------------------------------------

{
  const c = (s: string) => cleanSvg(s) ?? '';
  const bare = (s: string) =>
    c(s)
      .replace(/ id="h[0-9a-f]{6}-/g, ' id="')
      .replace(/#h[0-9a-f]{6}-/g, '#');
  const ATTACKS: [string, string][] = [
    ['<svg onload="alert(1)"><rect width="1" height="1"/></svg>', 'onload on the drawing'],
    ['<svg><script>alert(1)</script><script type="text/ecmascript"><![CDATA[alert(1)]]></script><rect width="1" height="1"/></svg>', 'scripts'],
    ['<svg><rect width="1" height="1" onclick="alert(1)" ONMOUSEOVER="alert(1)" OnFocus="alert(1)"/></svg>', 'handlers in any case'],
    ['<svg><a href="javascript:alert(1)"><rect width="1" height="1"/></a><a xlink:href="&#106;avascript:alert(1)"><circle r="1"/></a></svg>', 'links, also with an entity'],
    ['<svg><foreignObject><iframe src="https://evil.example"></iframe><div onclick="alert(1)">x</div></foreignObject><rect width="1" height="1"/></svg>', 'foreignObject'],
    ['<svg><image href="https://evil.example/x.png"/><image xlink:href="data:image/svg+xml;base64,PHN2Zy8+"/><rect width="1" height="1"/></svg>', 'pictures from elsewhere'],
    ['<svg><use href="https://evil.example/s.svg#a"/><use xlink:href="data:image/svg+xml,&lt;svg/&gt;#a"/><rect width="1" height="1"/></svg>', '<use> of anything but its own ids'],
    ['<svg><rect width="1" height="1" fill="url(https://evil.example/x)" stroke="url(&quot;javascript:alert(1)&quot;)" filter="url(data:x)"/></svg>', 'url() out'],
    ['<svg><rect width="1" height="1" style="fill:url(https://evil.example/a);behavior:url(x.htc);background:url(x)"/></svg>', 'url() in style'],
    ['<svg><style>@import url(https://evil.example/a.css);rect{fill:url(//evil.example/b)}@font-face{font-family:x;src:url(https://evil.example/f.woff)}</style><rect width="1" height="1"/></svg>', '@import, @font-face'],
    ['<svg><rect width="1" height="1" style="fill:\\75 rl(https://evil.example/a)"/></svg>', 'CSS escapes'],
    ['<svg><rect width="1" height="1" fill="expression(alert(1))" style="width:expression(alert(1))"/></svg>', 'expression()'],
    ['<svg><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="onload" to="alert(1)"/><animateTransform/><rect width="1" height="1"/></svg>', 'animations'],
    ['<!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><svg><text>&x;</text><rect width="1" height="1"/></svg>', 'entities from a DOCTYPE'],
    ['<?xml-stylesheet href="https://evil.example/s.css"?><svg xml:base="https://evil.example/"><rect width="1" height="1"/></svg>', 'stylesheets and xml:base'],
    ['<svg xmlns:h="http://www.w3.org/1999/xhtml"><h:script>alert(1)</h:script><h:img src="x" onerror="alert(1)"/><rect width="1" height="1"/></svg>', 'elements of another namespace'],
    ['<svg><filter id="f"><feImage href="https://evil.example/x.png"/></filter><rect width="1" height="1" filter="url(#f)"/></svg>', 'feImage'],
    ['<svg><rect width="1" height="1" fill=\'red" onload="alert(1)\'/></svg>', 'an attribute that breaks out of its quotes'],
    ['<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;</text><rect width="1" height="1"/></svg>', 'markup written as text'],
    ['<SVG><SCRIPT>alert(1)</SCRIPT><Rect Width="1" Height="1" OnClick="x"/></SVG>', 'upper case'],
    ['<svg><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"/><object data="x"/><embed src="x"/><rect width="1" height="1"/></svg>', 'iframes, objects, embeds'],
    ['<svg><rect width="1" height="1" fill="var(--x)" stroke="attr(x)" style="fill:env(x)"/></svg>', 'var(), attr(), env()'],
  ];
  for (const [s, what] of ATTACKS) {
    const out = c(s);
    ok(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && /<rect width="1" height="1"\/>|<rect width="1" height="1" /.test(out), `${what}: the shape kept (${out.slice(0, 200)})`);
    const rest = out.replace(' xmlns="http://www.w3.org/2000/svg"', '').replace(/<text>[^<]*<\/text>/g, '');
    ok(
      !/script|onload|onclick|onmouseover|onfocus|onerror|javascript|https?:|data:|expression|behavior|@import|foreignObject|<image|<a[ >]|<use|<animate|<set|<iframe|<object|<embed|xml:base|url\((?!#h[0-9a-f]{6}-)|var\(|env\(|attr\(|\\|<!|&[a-z]+;/i.test(
        rest,
      ),
      `${what}: nothing of it left: ${out}`,
    );
  }
  ok(c('<svg><text>&lt;script&gt;</text></svg>').includes('<text>&lt;script&gt;</text>'), 'markup written as text stays text');
  ok(c('<!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><svg><text>a&x;b</text></svg>').includes('<text>ab</text>'), 'an entity of its own DOCTYPE is left out');
  ok(cleanSvg('<svg><script>alert(1)</script></svg>') === null && cleanSvg('<svg><foreignObject><div/></foreignObject></svg>') === null && cleanSvg('not a drawing') === null && cleanSvg('') === null, 'nothing to draw left: null');

  // Entities that grow without end, and nesting without end.
  const laughs = `<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">]><svg><text>&lol3;</text><rect width="1" height="1"/></svg>`;
  const t0 = Date.now();
  ok(!c(laughs).includes('lol') && Date.now() - t0 < 1000, 'entities are never expanded');
  ok(cleanSvg(`<svg>${'<g>'.repeat(5000)}<rect width="1" height="1"/>${'</g>'.repeat(5000)}</svg>`) === null, 'nested too deep: refused');
  ok(cleanSvg(`<svg>${'<rect width="1" height="1"/>'.repeat(210_000)}</svg>`) === null, 'too many elements: refused');
  ok(cleanSvg(`<svg><rect width="1" height="1"/>${' '.repeat(9 * 1024 * 1024)}</svg>`) === null, 'too large: refused');

  // <use>: its own ids alone, no loops, and no repeating without end.
  const loop = c('<svg><use href="#a"/><g id="a"><use href="#a"/><use href="#b"/><rect width="1" height="1"/></g><g id="b"><use href="#a"/></g></svg>');
  ok((loop.match(/<use /g) ?? []).length === 2 && /<g id="h[0-9a-f]{6}-a"><use xlink:href="#h[0-9a-f]{6}-b"\/><rect/.test(loop), `a <use> that leads back to itself goes: ${loop}`);
  const levels = ['<rect id="l0" width="1" height="1"/>'];
  for (let i = 1; i <= 10; i++) levels.push(`<g id="l${i}">${Array.from({ length: 10 }, () => `<use href="#l${i - 1}"/>`).join('')}</g>`);
  const bomb = c(`<svg><defs>${levels.join('')}</defs><use href="#l10"/></svg>`);
  ok(bomb && !bomb.includes('<use'), 'a <use> that would draw ten billion shapes: every <use> goes');
  ok(c('<svg><use href="#nowhere"/><rect width="1" height="1"/></svg>').indexOf('<use') < 0, 'a <use> of an id that is not there goes');

  // The drawing's own CSS, put on its shapes.
  const styled = bare(
    '<svg viewBox="0 0 10 10"><style>/* Illustrator */ .st0{fill:#FF0000;stroke:#00F} rect{stroke-width:2} #a{opacity:.5} .st1.big{fill:green} path:hover{fill:pink} g rect{fill:gray} @media print{.st0{fill:blue}}</style><rect id="a" class="st0" style="fill:#0f0;transform:rotate(45deg)" width="5" height="5"/><circle class="st0 big st1" r="2"/><path class="st0" fill="black" style="fill:#abc !important" d="M0 0"/></svg>',
  );
  ok(/<rect id="a" width="5" height="5" stroke-width="2" fill="#0f0" stroke="#00F" opacity=".5" style="transform:rotate\(45deg\)"\/>/.test(styled), `a class's rules, its own style over them, CSS-only properties kept in style: ${styled}`);
  ok(/<circle r="2" fill="green" stroke="#00F"\/>/.test(styled), 'two classes over one');
  ok(/<path fill="#abc" d="M0 0" stroke="#00F"\/>/.test(styled) && !styled.includes('<style') && !styled.includes('class='), `its own !important over all, no <style> or class left: ${styled}`);

  // Ids: given a prefix of the drawing's own, references with them; the same drawing always the same ids.
  const grad = c(
    '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><clipPath id="c"><rect width="5" height="5"/></clipPath><marker id="m"><path d="M0 0L1 1"/></marker></defs><rect width="10" height="10" fill="url(#g)" clip-path="url(\'#c\')" marker-end="url(#m)"/></svg>',
  );
  const prefix = /id="(h[0-9a-f]{6}-)g"/.exec(grad)?.[1];
  ok(prefix && grad.includes(`fill="url(#${prefix}g)"`) && grad.includes(`clip-path="url(#${prefix}c)"`) && grad.includes(`marker-end="url(#${prefix}m)"`), `gradients, clips and markers by their prefixed ids: ${grad}`);
  ok(cleanSvg(grad) === grad && c(grad.replace(prefix!, 'h000000-')) === grad, 'cleaned again: the same drawing, whatever prefix it had');
  ok(cleanSvg('<svg><rect id="x" width="1" height="1"/><circle id="x" r="1"/></svg>')!.split('-x"').length === 2, 'an id twice: the first keeps it');

  // Sizes: from width and height, else the viewBox; small ones shown larger, at their shape.
  ok(JSON.stringify(cleanDrawing('<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>')).includes('"w":512,"h":512'), 'an icon’s 24×24 grid shown at 512');
  const wide = cleanDrawing('<svg width="1200px" height="600" ><rect width="1" height="1"/></svg>')!;
  ok(wide.w === 1200 && wide.h === 600 && wide.svg.includes('viewBox="0 0 1200 600"'), `its own size, and a viewBox from it: ${wide.svg}`);
  const none = cleanDrawing('<svg width="100%"><rect width="1" height="1"/></svg>')!;
  ok(none.w === 300 && none.h === 150 && none.svg.includes('viewBox="0 0 300 150"'), `no size at all: a browser's 300×150: ${none.svg}`);
  ok(cleanDrawing('<svg viewBox="0 0 10000 5000"><rect width="1" height="1"/></svg>')!.w === 2048, 'a very large one shown smaller');

  // What models write around a drawing, and what they write in it.
  ok(svgIn('Sure!\n```svg\n<svg viewBox="0 0 1 1"><rect/></svg>\n```\nEnjoy') === '<svg viewBox="0 0 1 1"><rect/></svg>' && svgIn('no drawing') === null && svgIn('<svg viewBox="0 0 1 1"><rect') === null, 'the SVG in an answer');
  const words = c('<svg><text x="1" y="2" font-family="sans-serif" text-anchor="middle">Café &amp; crème &nbsp;&unknown; &#169; &#x1F600;</text></svg>');
  ok(words.includes('>Café &amp; crème \u00a0 © 😀</text>') && words.includes('font-family="sans-serif"'), `words, their entities read: ${words}`);
  ok(c('<svg><g><rect width="1" height="1"><circle r="2"></svg>').includes('<g><rect width="1" height="1"><circle r="2"/></rect></g>'), 'unclosed tags closed');
  ok(
    c('<svg><svg:rect width="1" height="1"/><metadata><rdf:RDF/></metadata><sodipodi:namedview/></svg>').includes('<rect width="1" height="1"/>') && !c('<svg><metadata>x</metadata><rect width="1" height="1"/></svg>').includes('metadata'),
    'svg: prefixes read, editors’ notes left out',
  );
  ok(c('<svg><filter id="t"><feTurbulence baseFrequency="0.02" numOctaves="200"/></filter><rect width="1" height="1" filter="url(#t)"/></svg>').includes('numOctaves="8"'), 'a filter kept from running for ever');
}

// ---- a change put in only where its mask is white ----------------------------------------------------------------------

{
  const together = putTogether(ORIG_PNG, RED_SAME, MASK);
  const img = together ? readPng(together) : null;
  const r = featherOf(64, 48);
  ok(img && img.width === 64 && img.height === 48, 'the original’s size');
  let keptLeft = true;
  let changedRight = true;
  let blended = false;
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 64; x++) {
      const p = pixel(img!, x, y);
      if (x < 32 - 2 * r) keptLeft &&= same(p, pixel(ORIG, x, y));
      else if (x >= 32 + 2 * r) changedRight &&= same(p, RED);
      else if (!same(p, pixel(ORIG, x, y)) && !same(p, RED)) blended = true;
    }
  ok(keptLeft && changedRight, 'the original’s own pixels away from the mask, the answer’s inside it');
  ok(blended, 'the edge softened between them');
  const big = putTogether(ORIG_PNG, RED_BIG, MASK_SMALL);
  ok(big && same(pixel(readPng(big), 60, 20), RED) && same(pixel(readPng(big), 3, 20), pixel(ORIG, 3, 20)), 'an answer and a mask of other sizes but the same shape, fitted first');
  ok(putTogether(ORIG_PNG, RED_WIDE, MASK) === null && putTogether(JPEG, RED_SAME, MASK) === null && putTogether(ORIG_PNG, RED_SAME, MASK_SQUARE) === null, 'another shape, or not a PNG: left to the editor');
  const up = resample(
    picture(2, 1, (x) => (x ? [255, 255, 255, 255] : [0, 0, 0, 255])),
    8,
    1,
  );
  ok(pixel(up, 0, 0)[0] === 0 && pixel(up, 7, 0)[0] === 255 && pixel(up, 3, 0)[0] > 0 && pixel(up, 3, 0)[0] < 255, 'made larger smoothly, not in blocks');
  const w = soften(weights(readPng(MASK), 64, 48), 64, 48, 4);
  ok(w[10 * 64 + 5] === 0 && w[10 * 64 + 60] === 1 && w[10 * 64 + 31] > 0.2 && w[10 * 64 + 31] < 0.8, 'the mask’s weights, softened at the edge alone');
  ok(
    weights(readPng(writePng(picture(2, 2, () => [255, 255, 255, 0]))), 2, 2).every((x) => x === 0),
    'see-through in a mask counts as black',
  );
}

// ---- what a model is asked ------------------------------------------------------------------------------------------

{
  ok(nearestAspect('16:9', SEEDREAM_SHAPES) === '16:9' && nearestAspect('1200x628', RECRAFT_SHAPES) === '16:9' && nearestAspect('4:3', ['1:1', '3:2', '2:3', 'auto']) === '3:2', 'the nearest shape a model makes');
  ok(nearestAspect(0.75, ['1:1', '3:2', '2:3']) === '2:3' && nearestAspect(undefined, SEEDREAM_SHAPES) === undefined && nearestAspect('16:9', ['auto']) === undefined, 'a ratio, nothing wanted, nothing to pick');
  const bg = worded({ prompt: 'Soft waves at dusk', kind: 'background', style: 'watercolour', colors: ['#112233', '#ffeedd'] });
  ok(bg.startsWith('Soft waves at dusk\nA background: no words') && /nothing important near the edges/.test(bg) && bg.includes('Style: watercolour.') && bg.includes('Colours: #112233, #ffeedd.'), `a background's words: ${bg}`);
  ok(
    /one simple subject, centred/.test(worded({ prompt: 'a key', kind: 'icon' })) && /seamless, tileable/.test(worded({ prompt: 'linen', kind: 'texture' })) && /labels spelled correctly/.test(worded({ prompt: 'x', kind: 'diagram' })),
    'an icon, a texture, a diagram',
  );
  ok(/transparent background/.test(worded({ prompt: 'x', background: 'transparent' })) && /plain, flat background of one solid colour/.test(worded({ prompt: 'x', background: 'plain' })), 'a see-through background, or a plain one to cut out');
  ok(
    /^Change the first picture: make the sky pink\nThe second picture is a mask/.test(changeWords('make the sky pink', { mask: 'sent' })) &&
      /exactly as it is/.test(changeWords('x', { mask: 'kept' })) &&
      /unless the words say otherwise/.test(changeWords('x')),
    'a change, with its mask or without',
  );
}

// ---- the settings and the tiers ------------------------------------------------------------------------------------

{
  const s = (await req('GET', '/api/images/settings')).json();
  ok(
    s.enabled && s.model === '' && s.quick === '' && s.using === 'bytedance-seed/seedream-5-0-pro' && s.usingQuick === 'bytedance-seed/seedream-5-0-flash' && s.usingQuickInfo?.label === 'Seedream 5.0 Flash' && s.keySet === false,
    `the app's choices: ${JSON.stringify({ ...s, usingInfo: !!s.usingInfo, usingQuickInfo: !!s.usingQuickInfo })}`,
  );
  const put = (await req('PUT', '/api/images/settings', { quick: 'recraft/recraft-v4.1-flash', model: 'not a model id!' })).json();
  ok(put.quick === 'recraft/recraft-v4.1-flash' && put.usingQuick === 'recraft/recraft-v4.1-flash' && put.model === '' && put.using === 'bytedance-seed/seedream-5-0-pro', 'the Quick model picked; a wrong id is passed by');
  ok((await req('PUT', '/api/images/settings', { enabled: false })).json().quick === 'recraft/recraft-v4.1-flash' && !tool('make_svg') && !tool('generate_image'), 'turning images off keeps the picks, and takes the tools away');
  await req('PUT', '/api/images/settings', { enabled: true, quick: '' });
  ok(tool('make_svg') && tool('generate_image'), 'on again: both tools');
  const picks = (await req('GET', '/api/images/models?sort=picks&for=quick')).json().models.map((m: any) => m.id);
  ok(
    picks.slice(0, 3).join() ===
      QUICK_PICKS.filter((p) => CATALOG.some((m) => m.id === p.id))
        .slice(0, 3)
        .map((p) => p.id)
        .join(),
    `Quick's suggestions first: ${picks.join()}`,
  );

  const t = (await req('GET', '/api/images/tiers')).json();
  ok(
    t.keySet === false && t.quick.id === 'bytedance-seed/seedream-5-0-flash' && Math.abs(t.quick.perImage - 0.01766) < 0.0001 && t.best.id === 'bytedance-seed/seedream-5-0-pro' && Math.abs(t.best.perImage - 0.04415) < 0.0001,
    `the tiers and their prices: ${JSON.stringify(t)}`,
  );
  ok(
    t.quick.seeThrough?.id === 'openai/gpt-image-1-mini' && t.best.seeThrough?.id === 'openai/gpt-image-2.6-flare' && !t.quick.seeThrough.cutout && t.transparent.id === 'openai/gpt-image-2.6-flare',
    'see-through backgrounds from a model that makes them',
  );
  ok(t.vector.id === 'recraft/recraft-v4.1-vector' && Math.abs(t.vector.perImage - 0.0785) < 0.001 && t.writer === 'Claude' && t.video.id === 'bytedance/seedance-2.5' && t.video.perSecond === 0.12, 'the vector model, the writer, the video model');
  ok(t.local.ready === false && t.local.canInstall === true, 'the picture tools as they are');
  localReady = true;
  const t2 = (await req('GET', '/api/images/tiers')).json();
  ok(t2.quick.seeThrough?.id === 'bytedance-seed/seedream-5-0-flash' && t2.quick.seeThrough.cutout === true && t2.local.ready === true, 'with the picture tools ready: the tier’s own model, cut out here');
  localReady = false;
}

// ---- POST /api/images/make ----------------------------------------------------------------------------------------

{
  const none = await req('POST', '/api/images/make', { prompt: 'A lighthouse icon', kind: 'icon' });
  ok(none.statusCode === 400 && none.json().error === 'Add an OpenRouter key in Settings → Models', `no key: ${none.body}`);
  setKey('sk-or-test');
  ok(
    (await req('POST', '/api/images/make', { prompt: '' })).statusCode === 400 &&
      (await req('POST', '/api/images/make', { prompt: 'x', kind: 'poster' })).statusCode === 400 &&
      (await req('POST', '/api/images/make', { prompt: 'x', colors: ['red'] })).statusCode === 400,
    'what it takes is checked',
  );

  calls.length = 0;
  const icon = await req('POST', '/api/images/make', { prompt: 'A lighthouse', kind: 'icon', aspect: '1200x628', count: 3, colors: ['#1F6FEB'] });
  const a = icon.json();
  const sent = calls.filter((c) => c.path === '/images');
  ok(icon.statusCode === 200 && a.tier === 'quick' && a.model === 'bytedance-seed/seedream-5-0-flash' && a.pictures.length === 3, `an icon, Quick, three of them: ${icon.body.slice(0, 300)}`);
  ok(
    sent.length === 3 && sent.every((c) => c.body.n === undefined && c.body.aspect_ratio === '2:1' && c.body.resolution === '1K'),
    `a model that makes one at a time asked three times, at the nearest shape: ${JSON.stringify(sent[0]?.body).slice(0, 200)}`,
  );
  ok(/^A lighthouse\nAn icon: one simple subject/.test(sent[0].body.prompt) && sent[0].body.prompt.includes('Colours: #1f6feb.'), `the words it was asked: ${sent[0].body.prompt}`);
  ok(Math.abs(a.cost - 0.06) < 1e-9 && a.pictures.every((p: any) => p.w === 64 && p.h === 48 && p.mime === 'image/png' && /^naget-asset:[0-9a-f]{40}$/.test(p.src) && asset(p.src)), 'kept, their sizes read, what they cost together');

  calls.length = 0;
  const scene = (await req('POST', '/api/images/make', { prompt: 'A crowded harbour market at dawn, people haggling over fish', tier: 'auto' })).json();
  ok(scene.tier === 'best' && scene.model === 'bytedance-seed/seedream-5-0-pro' && lastImages().prompt === 'A crowded harbour market at dawn, people haggling over fish', 'a scene is Best, asked in its own words');

  // Pictures to follow: kept ones, data: addresses; the Quick model takes none, so the Best one makes it.
  await req('PUT', '/api/images/settings', { quick: 'recraft/recraft-v4.1-flash' });
  const followed = await req('POST', '/api/images/make', { prompt: 'In this style', tier: 'quick', refs: [icon.json().pictures[0].src, dataUrl(ORIG_PNG)] });
  ok(
    followed.statusCode === 200 && followed.json().model === 'bytedance-seed/seedream-5-0-pro' && lastImages().input_references.length === 2 && /^data:image\/png;base64,/.test(lastImages().input_references[0].image_url.url),
    `a Quick model that takes no pictures hands them to Best: ${followed.body.slice(0, 200)}`,
  );
  await req('PUT', '/api/images/settings', { quick: '' });
  ok((await req('POST', '/api/images/make', { prompt: 'x', refs: ['naget-asset:0123456789abcdef0123'] })).statusCode === 404, 'a picture no longer kept');
  ok((await req('POST', '/api/images/make', { prompt: 'x', refs: [dataUrl(Buffer.from('<svg viewBox="0 0 1 1"/>'), 'image/svg+xml')] })).statusCode === 415, 'a drawing is no picture to follow');
  ok(
    (await req('POST', '/api/images/make', { prompt: 'x', refs: ['a', 'b', 'c', 'd', 'e'] })).statusCode === 400 && (await req('POST', '/api/images/make', { prompt: 'x', refs: ['file:///etc/passwd'] })).statusCode === 400,
    'too many, or not a picture’s address',
  );

  // See-through backgrounds.
  calls.length = 0;
  const logo = (await req('POST', '/api/images/make', { prompt: 'A fox head', kind: 'icon', transparent: true })).json();
  ok(
    logo.model === 'openai/gpt-image-1-mini' && lastImages().background === 'transparent' && lastImages().output_format === 'png' && lastImages().quality === 'medium' && /transparent background/.test(lastImages().prompt) && !logo.cutout,
    `Quick's see-through model: ${JSON.stringify(logo).slice(0, 200)}`,
  );
  ok(lastImages().aspect_ratio === '1:1', 'its own shapes');
  localReady = true;
  cutouts = 0;
  const cut = (await req('POST', '/api/images/make', { prompt: 'A fox head', kind: 'icon', transparent: true })).json();
  ok(
    cut.model === 'bytedance-seed/seedream-5-0-flash' && cut.cutout === true && cutouts === 1 && lastImages().background === undefined && /plain, flat background/.test(lastImages().prompt),
    'with the picture tools: the tier’s model on a plain background, cut out here',
  );
  ok(cut.pictures[0].w === 8 && asset(cut.pictures[0].src)?.data.equals(CLEAR), 'the cutout is what is kept');
  localReady = false;

  // Refusals, nothing made.
  answer = 'refuse';
  const refused = await req('POST', '/api/images/make', { prompt: 'A red apple' });
  ok(refused.statusCode === 422 && /^Seedream 5\.0 Flash would not make it: Your request was rejected/.test(refused.json().error), `a refusal in its words: ${refused.body}`);
  answer = 'empty';
  const empty = await req('POST', '/api/images/make', { prompt: 'A red apple' });
  ok(empty.statusCode === 502 && /answered without a picture/.test(empty.json().error), 'no picture in the answer');
  answer = 'png';
}

// ---- POST /api/images/edit --------------------------------------------------------------------------------------

{
  const orig = (await req('POST', '/api/images/make', { prompt: 'x', model: 'bytedance-seed/seedream-5-0-pro' })).json().pictures[0].src;
  calls.length = 0;
  const plain = await req('POST', '/api/images/edit', { src: orig, prompt: 'Make it night' });
  const pa = plain.json();
  ok(plain.statusCode === 200 && pa.how === 'cloud' && pa.model === 'bytedance-seed/seedream-5-0-pro' && pa.whole === undefined && asset(pa.src), `a change, Best by default: ${plain.body.slice(0, 200)}`);
  ok(/^Change this picture: Make it night\nKeep everything else as it is/.test(lastImages().prompt) && lastImages().input_references.length === 1 && lastImages().aspect_ratio === '4:3', 'the picture sent, at its own shape');

  answer = 'red-same';
  calls.length = 0;
  const masked = await req('POST', '/api/images/edit', { src: orig, prompt: 'A red wall here', mask: dataUrl(MASK) });
  const ma = masked.json();
  ok(masked.statusCode === 200 && !ma.whole && ma.w === 64 && ma.h === 48, `with a mask: put together here: ${masked.body.slice(0, 200)}`);
  ok(lastImages().input_references.length === 2 && /The second picture is a mask/.test(lastImages().prompt), 'the mask sent beside the picture');
  const kept = readPng(asset(ma.src)!.data);
  ok(same(pixel(kept, 2, 10), pixel(ORIG, 2, 10)) && same(pixel(kept, 62, 10), RED), 'the original where the mask is black, the answer where it is white');

  answer = 'red-wide';
  const wide = (await req('POST', '/api/images/edit', { src: orig, prompt: 'A red wall here', mask: dataUrl(MASK) })).json();
  ok(wide.whole === true && wide.w === 96 && readPng(asset(wide.src)!.data).width === 96, 'an answer of another shape: whole, for the editor to put in');
  const jpeg = (await req('POST', '/api/images/edit', { src: dataUrl(JPEG, 'image/jpeg'), prompt: 'x', mask: dataUrl(MASK) })).json();
  ok(jpeg.whole === true, 'a JPEG original: whole');
  ok(
    (await req('POST', '/api/images/edit', { src: orig, prompt: 'x', mask: dataUrl(MASK_SQUARE) })).statusCode === 400 && (await req('POST', '/api/images/edit', { src: orig, prompt: 'x', mask: dataUrl(JPEG, 'image/jpeg') })).statusCode === 400,
    'a mask of another shape, or not a PNG',
  );

  // A model that takes one picture: no mask sent, the answer put in all the same.
  answer = 'red-same';
  const one = (await req('POST', '/api/images/edit', { src: orig, prompt: 'A red wall here', mask: dataUrl(MASK), model: 'recraft/recraft-v4.1' })).json();
  ok(one.model === 'recraft/recraft-v4.1' && lastImages().input_references.length === 1 && /Change only what the words ask for/.test(lastImages().prompt) && !one.whole, 'a model that takes one picture: the picture alone, put together here');
  ok((await req('POST', '/api/images/edit', { src: orig, prompt: 'x', model: 'recraft/recraft-v4.1-flash' })).statusCode === 400, 'a model that takes no pictures');

  // A see-through answer (the picture tools' cutout through OpenRouter): a model that makes one, PNG.
  answer = 'clear';
  localReady = true;
  cutouts = 0;
  const clear = (await req('POST', '/api/images/edit', { src: orig, prompt: 'Keep the subject exactly as it is, take away everything behind it', transparent: true })).json();
  ok(clear.model === 'openai/gpt-image-2.6-flare' && lastImages().background === 'transparent' && cutouts === 0, `a change with a see-through background goes to a model that makes one: ${JSON.stringify(clear).slice(0, 200)}`);
  localReady = false;
  answer = 'png';

  // What the picture tools and plots use.
  const cloud = cloudTools();
  ok(cloud && typeof cloud.edit === 'function' && cloud.cleanSvg('<svg><script/><rect width="1" height="1"/></svg>')?.includes('<rect'), 'the cloud tools are there for the others');
  const viaHook = await cloud!.edit(db, { src: dataUrl(ORIG_PNG), prompt: 'Brighter' });
  ok(viaHook.how === 'cloud' && viaHook.src.startsWith('naget-asset:'), 'a change through the hook');
}

// ---- POST /api/images/svg ---------------------------------------------------------------------------------------

{
  // The writer: a helper model on the stand-in.
  writeAgentModels([{ id: 'or/writer', label: 'Test Writer', provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-test', model: 'test/writer', tools: 'native' }]);
  setHelperModel(db, 'or/writer');
  calls.length = 0;
  const q = await req('POST', '/api/images/svg', { prompt: 'A blue tile with a white dot', kind: 'icon', aspect: '16:9', colors: ['#1F6FEB', '#FFFFFF'] });
  const qa = q.json();
  ok(q.statusCode === 200 && qa.tier === 'quick' && qa.model === 'Test Writer' && qa.mime === 'image/svg+xml' && !/onclick|foreignObject|```/.test(qa.svg) && qa.svg.includes('<circle'), `written as SVG, cleaned: ${q.body.slice(0, 400)}`);
  ok(qa.w === 512 && qa.h === 512 && asset(qa.src)?.data.toString() === qa.svg && asset(qa.src)?.mime === 'image/svg+xml', 'kept as a picture, its size from it');
  const asked = calls.find((c) => c.path === '/chat/completions')?.body;
  const sys = asked?.messages?.[0]?.content ?? '';
  const user = asked?.messages?.[1]?.content ?? '';
  ok(/You draw with SVG code/.test(sys) && /no <image>, <a>, <script>/.test(sys) && user.includes('viewBox: 0 0 960 540') && user.includes('Colours: #1f6feb, #ffffff') && /An icon: one simple symbol/.test(user), `what the writer is asked: ${user}`);

  writerAnswers = ['I cannot draw that.', WRITTEN];
  calls.length = 0;
  const again = await req('POST', '/api/images/svg', { prompt: 'A dot', kind: 'shape' });
  ok(
    again.statusCode === 200 && calls.filter((c) => c.path === '/chat/completions').length === 2 && /Your last answer had no SVG/.test(calls.filter((c) => c.path === '/chat/completions')[1].body.messages[1].content),
    'asked once more when the first answer had no drawing',
  );
  writerAnswers = ['Nope.', '<svg><script>alert(1)</script></svg>'];
  const nothing = await req('POST', '/api/images/svg', { prompt: 'A dot', kind: 'shape' });
  ok(nothing.statusCode === 502 && /nothing in it that could be kept/.test(nothing.json().error), 'twice without a drawing: says so');
  writerAnswers = [];

  calls.length = 0;
  const best = await req('POST', '/api/images/svg', { prompt: 'A fox in a forest', kind: 'illustration', aspect: '16:9', colors: ['#ff8800'] });
  const ba = best.json();
  ok(
    best.statusCode === 200 && ba.tier === 'best' && ba.model === 'recraft/recraft-v4.1-vector' && ba.cost === 0.08 && ba.w === 1024 && !/script|onload|<image/.test(ba.svg) && ba.svg.includes('fill="#123456"'),
    `drawn by the vector model, cleaned: ${best.body.slice(0, 300)}`,
  );
  ok(lastImages().output_format === 'svg' && lastImages().aspect_ratio === '16:9' && /A flat vector illustration/.test(lastImages().prompt) && lastImages().prompt.includes('Colours: #ff8800.'), 'asked for SVG, at its shape');
  setKey();
  const noKey = await req('POST', '/api/images/svg', { prompt: 'A fox', tier: 'best' });
  ok(noKey.statusCode === 400 && noKey.json().error === 'Add an OpenRouter key in Settings → Models', 'Best needs a key');
  ok((await req('POST', '/api/images/svg', { prompt: 'A dot', tier: 'quick' })).statusCode === 200, 'Quick needs none');
  setKey('sk-or-test');
}

// ---- the agents' tools ---------------------------------------------------------------------------------------------

{
  calls.length = 0;
  cards.length = 0;
  const simple = await run('generate_image', { prompt: 'A plain beige paper texture', detail: 'simple', ask: false });
  ok(!simple.isError && /^Made an image with bytedance-seed\/seedream-5-0-flash \(\$0\.02\), 1:1, 1K:/.test(simple.text) && /Quick model, for simple pictures/.test(simple.text), `detail: simple is Quick: ${simple.text}`);
  const complex = await run('generate_image', { prompt: 'A plain beige paper texture', detail: 'complex', ask: false });
  ok(!complex.isError && /^Made an image with bytedance-seed\/seedream-5-0-pro/.test(complex.text) && !/Quick model/.test(complex.text), 'detail: complex is Best');
  const auto = await run('generate_image', { prompt: 'A portrait of a fisherman mending nets, photorealistic', ask: false });
  ok(/seedream-5-0-pro/.test(auto.text), 'left out: by the prompt');

  // See-through: another model makes it, saying so on the form and in the answer; or cut out here.
  cards.length = 0;
  const clear = await run('generate_image', { prompt: 'A fox logo', transparent: true });
  ok(
    !clear.isError && /with openai\/gpt-image-2\.6-flare/.test(clear.text) && /transparent background/.test(clear.text) && /Seedream 5\.0 Pro cannot make this, so GPT Image 2\.6 Flare made it\./.test(clear.text),
    `the see-through model: ${clear.text}`,
  );
  ok(
    cards.length === 1 && /Seedream 5\.0 Pro cannot make this, so it is made with GPT Image 2\.6 Flare\./.test(cards[0].detail) && cards[0].form.fields.some((f: any) => f.id === 'transparent'),
    'the form says which model makes it, and has its own settings',
  );
  ok(lastImages().background === 'transparent' && lastImages().model === 'openai/gpt-image-2.6-flare', 'asked of it');
  localReady = true;
  cutouts = 0;
  cards.length = 0;
  const cut = await run('generate_image', { prompt: 'A fox logo', transparent: true, aspect_ratio: '1:1', resolution: '1K' });
  ok(!cut.isError && /with bytedance-seed\/seedream-5-0-pro/.test(cut.text) && /transparent background/.test(cut.text) && /taken out on this computer/.test(cut.text) && cutouts === 1, `cut out on this computer: ${cut.text}`);
  ok(/plain, flat background/.test(lastImages().prompt) && lastImages().background === undefined, 'made on a plain background');
  ok(fs.readFileSync(/^(\/\S+\.png) /m.exec(cut.text)![1]).equals(CLEAR), 'the cutout is what is saved');
  localReady = false;
  const opaque = await run('generate_image', { prompt: 'A fox logo', transparent: true, model: 'bytedance-seed/seedream-5-0-pro', ask: false });
  ok(opaque.isError && /does not make transparent backgrounds/.test(opaque.text), 'a model asked for that cannot, and nothing to cut it out: says so');

  // A deck's, document's or page's own picture to work from, as get_page shows it (naget-asset:…).
  const kept = `naget-asset:${putAsset(db, CLEAR)}`;
  const fromDeck = await run('generate_image', { prompt: 'The same fox, in winter', images: [kept], ask: false });
  const sent = lastImages()?.input_references ?? [];
  ok(!fromDeck.isError && sent.length === 1 && sent[0].image_url.url === `data:image/png;base64,${CLEAR.toString('base64')}`, `a kept picture is sent as it is kept: ${fromDeck.text.slice(0, 200)}`);
  const gone = await run('generate_image', { prompt: 'The same fox', images: ['naget-asset:00000000000000000000'], ask: false });
  ok(gone.isError && /is not a picture this app keeps/.test(gone.text), `one the app does not keep is said so: ${gone.text}`);

  // make_svg: written, or drawn after the form with its price.
  calls.length = 0;
  const icon = await run('make_svg', { prompt: 'A rocket', kind: 'icon', colors: ['#ff0000'], name: 'Rocket icon' });
  const file = /^(\/\S+\.svg) \((\d+)×(\d+), /m.exec(icon.text);
  ok(!icon.isError && /^Made a drawing with Test Writer:/.test(icon.text) && file && file[1] === path.join(tmp, 'images', 'rocket-icon.svg'), `written, saved in images/: ${icon.text}`);
  const saved = fs.readFileSync(file![1], 'utf8');
  ok(saved.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && !/onclick|foreignObject/.test(saved) && file![2] === '512', 'cleaned before it is saved');
  ok(/detail: "complex"/.test(icon.text) && !calls.some((c) => c.path === '/images'), 'no picture model asked');

  cards.length = 0;
  decide = () => ({ decision: 'decline' });
  const declined = await run('make_svg', { prompt: 'A fox in a forest', kind: 'illustration' });
  ok(
    !declined.isError &&
      /closed the form: no drawing was made/.test(declined.text) &&
      cards.length === 1 &&
      cards[0].title === 'Your drawing' &&
      /Recraft V4\.1 Vector\*\* \(Recraft\), through OpenRouter: about \$0\.078 a drawing\./.test(cards[0].detail),
    `the form with its price: ${cards[0]?.detail}`,
  );
  ok(cards[0].form.fields.map((f: any) => f.id).join() === 'aspect', 'the shape alone to pick');
  decide = (card) => ({ decision: 'accept', form: { ...Object.fromEntries(card.form.fields.map((f: any) => [f.id, f.default ?? ''])), aspect: 'Wide (16:9)' } });
  cards.length = 0;
  calls.length = 0;
  const drawn = await run('make_svg', { prompt: 'A fox in a forest', kind: 'illustration' });
  ok(!drawn.isError && /^Made a drawing with recraft\/recraft-v4\.1-vector \(\$0\.08\), 16:9:/.test(drawn.text) && cards.length === 1 && lastImages().aspect_ratio === '16:9', `drawn after the form: ${drawn.text}`);
  cards.length = 0;
  const next = await run('make_svg', { prompt: 'A deer', detail: 'complex' });
  ok(!next.isError && !cards.length && lastImages().aspect_ratio === '16:9', 'the next one without the form, at the shape picked');
  ok((await run('make_svg', { prompt: 'x', colors: ['blue'] })).isError && (await run('make_svg', { prompt: 'x', kind: 'poster' })).isError, 'what it takes is checked');
}

// ---- no OpenRouter key: asked for on a card --------------------------------------------------------------------

{
  setKey();
  calls.length = 0;
  cards.length = 0;
  // Nobody there to answer a card (a scheduled task's run): told where to add one, nothing made, no error.
  present = false;
  const nobody = await run('generate_image', { prompt: 'A red apple' });
  ok(!nobody.isError && /^Seedream 5\.0 Flash runs through OpenRouter, and no OpenRouter key is set\./.test(nobody.text) && !calls.some((c) => c.path === '/images') && !cards.length, `nobody to ask: ${nobody.text}`);
  const alone = await run('make_svg', { prompt: 'A fox', detail: 'complex' });
  ok(!alone.isError && /^Recraft V4\.1 Vector runs through OpenRouter, and no OpenRouter key is set/.test(alone.text) && /detail: "simple" needs no key/.test(alone.text), `a detailed drawing: the simple one needs no key: ${alone.text}`);
  const auto = await run('make_svg', { prompt: 'A fox in a forest', kind: 'illustration' });
  ok(!auto.isError && /^Made a drawing with Test Writer:/.test(auto.text) && auto.text.includes('No OpenRouter key was given, so it was written as SVG rather than drawn by Recraft V4.1 Vector.'), `left to it, written instead: ${auto.text}`);
  ok(!latestRequest(db, ctx.key, OPENROUTER_REQUEST), 'no card for a run nobody watches');
  present = true;

  // Someone there: a card asks for the key before any form; skipped, nothing is made and the session is not asked again.
  const sk = { ...ctx, key: 'claude:skip', runId: 'run-skip' } as RunCtx;
  const pending = runIn(sk, 'generate_image', { prompt: 'A red apple' });
  ok(await until(() => latestRequest(db, 'claude:skip', OPENROUTER_REQUEST)?.state === 'pending'), 'a card asks for the key');
  const card = latestRequest(db, 'claude:skip', OPENROUTER_REQUEST);
  ok(card?.why === 'Pictures are made by Seedream 5.0 Flash through OpenRouter, about $0.018 each. You pay OpenRouter for what is made.' && !cards.length, `what it is for and what it costs, the form not yet: ${card?.why}`);
  keySkipped('claude:skip');
  const skipped = await pending;
  ok(!skipped.isError && /^The user chose not to add an OpenRouter key, so Seedream 5\.0 Flash did not run: nothing was made/.test(skipped.text) && !calls.some((c) => c.path === '/images') && !cards.length, `skipped: ${skipped.text}`);
  const video = await runIn(sk, 'generate_video', { prompt: 'Waves on a beach' });
  ok(!video.isError && /chose earlier in this session not to add an OpenRouter key, so Seedance 2\.5 did not run/.test(video.text), `not asked again in that session: ${video.text}`);
  const written = await runIn(sk, 'make_svg', { prompt: 'A fox in a forest', kind: 'illustration' });
  ok(/^Made a drawing with Test Writer:/.test(written.text) && /No OpenRouter key was given/.test(written.text), 'a drawing left to it is written instead');
  const sound = await runIn(sk, 'generate_audio', { kind: 'music', prompt: 'A jingle' });
  ok(!sound.isError && /did not run/.test(sound.text), 'sound neither');

  // Given on the card: it goes on with that key, and the form comes after it.
  const gv = { ...ctx, key: 'claude:give', runId: 'run-give' } as RunCtx;
  const waiting = runIn(gv, 'generate_image', { prompt: 'A red apple', ask: true });
  ok((await until(() => latestRequest(db, 'claude:give', OPENROUTER_REQUEST)?.state === 'pending')) && !cards.length, 'no form before the key');
  keyGiven('claude:give', 'sk-or-given');
  const made = await waiting;
  ok(
    !made.isError && /^Made an image with bytedance-seed\/seedream-5-0-flash/.test(made.text) && cards.length === 1 && calls.filter((c) => c.path === '/images').pop()?.auth === 'Bearer sk-or-given',
    `made with the key given, after its form: ${made.text.split('\n')[0]}`,
  );
  const gd = { ...ctx, key: 'claude:give-drawing', runId: 'run-give-drawing' } as RunCtx;
  cards.length = 0;
  const drawing = runIn(gd, 'make_svg', { prompt: 'A heron', detail: 'complex', ask: false });
  ok(await until(() => latestRequest(db, 'claude:give-drawing', OPENROUTER_REQUEST)?.state === 'pending'), 'a detailed drawing asks too');
  ok(/^Detailed drawings are drawn by Recraft V4\.1 Vector through OpenRouter, about \$0\.078 each\./.test(latestRequest(db, 'claude:give-drawing', OPENROUTER_REQUEST)?.why ?? ''), 'what it is for and what it costs');
  keyGiven('claude:give-drawing', 'sk-or-given');
  const d = await drawing;
  ok(!d.isError && /^Made a drawing with recraft\/recraft-v4\.1-vector/.test(d.text) && calls.filter((c) => c.path === '/images').pop()?.auth === 'Bearer sk-or-given', `drawn with the key given: ${d.text.split('\n')[0]}`);
  setKey('sk-or-test');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
