// Script tests for slides in the web format: the model (code, custom code, web pages, quizzes and scores, 3D, pointer
// effects, shining text, frosted glass, moving backgrounds and videos behind slides, the new effects, taps and
// transitions, the progress bar, links to the next and other slides) checked as it comes in, its limits and shorthand;
// PowerPoint compatible decks turning them into PowerPoint's (and saying what changed); the deck's page as one small
// file (the runtime minified, fonts inside a download); /partframe's page; what agents give (custom code from a file of
// their session, a 3D model, a video behind a slide) and are told; the PowerPoint file of a web deck (code as coloured
// words, live parts as pictures, its note); and, where the browser pictures are taken with is here, quizzes answered and
// live parts running in a real page. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/slides-web-test.ts
//   DATA_DIR=/tmp/hydor-test-slides-web node dist/dev/slides-web-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { Zip } from '../documents/zip.ts';
import { canCapture, withTab } from '../capture/index.ts';
import { THREE_BASE } from '../../shared/app-media.ts';
import { deckSources, deckText, deckVideos, everyEl, isDeckText, isWebDeck, normalizeDeck, powerPointNote, richFeatures, SLIDE_LIMITS, toPowerPoint, type Deck, type El } from '../../shared/slides.ts';
import { codeTokens, slidesRuntime, THREE_DEFAULT } from '../../shared/slides-runtime.ts';
import { deckFile, deckPage, PART_FRAME_HTML, RUNTIME_MINIFIED, RUNTIME_SRC } from './slides.ts';
import { getAsset, modelType, putAsset } from './assets.ts';
import { pages } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-slides-web-test-')));
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
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: () => {}, toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
pages.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const req = (method: 'GET' | 'POST', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
const run = async (name: string, args: Record<string, unknown>): Promise<{ text?: string; error?: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
const idOf = (text?: string) => /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
const els = (d: Deck, i = 0) => d.slides[i].els;
const byId = (d: Deck, id: string) => d.slides.flatMap((s) => everyEl(s.els)).find((e) => e.id === id) as El;
const slideXml = (pptx: Buffer, n: number) => new Zip(pptx).read(`ppt/slides/slide${n}.xml`)?.toString('utf8') ?? '';
/** The same values, whatever order their keys came in. */
const same = (a: unknown, b: unknown): boolean => {
  const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAAASUVORK5CYII=', 'base64');

/** A small glTF binary file: one triangle. */
function glb(): Buffer {
  const bin = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const json = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', max: [1, 1, 0], min: [0, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  });
  const jb = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const head = Buffer.alloc(12);
  head.write('glTF', 0, 'latin1');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jb.length + 8 + bin.length, 8);
  const chunk = (type: number, b: Buffer) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(b.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, b]);
  };
  return Buffer.concat([head, chunk(0x4e4f534a, jb), chunk(0x004e4942, bin)]);
}

// ---- the model -------------------------------------------------------------------------------------------------
{
  const d = normalizeDeck({
    progress: true,
    slides: [
      {
        bg: { fx: 'aurora', video: `naget-video:${'a'.repeat(40)}`, dim: 0.3 },
        transition: { fx: 'cube', dir: 'left' },
        els: [
          { id: 'c1', type: 'code', language: 'py', code: 'def f(x):\r\n\treturn x  # same', highlight: [2], numbers: true, look: 'light' },
          { id: 'h1', type: 'custom', html: '<p>hi</p><script>deck.next()</script>', interactive: true, poster: 'https://example.com/p.png' },
          { id: 'e1', type: 'embed', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
          { id: 'e2', type: 'embed', url: 'https://192.168.1.4/admin' },
          { id: 'e3', type: 'embed', url: 'http://example.com/' },
          { id: 'e4', type: 'embed', url: 'https://user:pw@example.com/' },
          { id: 'e5', type: 'iframe', url: 'https://intranet/' },
          { id: 'q1', type: 'quiz', question: 'Capital of France?', options: ['London', '*Paris', 'Rome*'], explain: 'Paris.', hover: 'lift' },
          { id: 'q2', type: 'poll', question: 'Tea or coffee?', choices: ['Tea', 'Coffee'] },
          { id: 'q3', type: 'quiz', question: 'x', choices: ['a', 'b', 'c'], answer: 'B' },
          { id: 's1', type: 'score' },
          { id: 'd1', type: '3d', shape: 'text', text: 'Hi', spin: 900, orbit: true, zoom: 9, material: 'chrome' },
          { id: 'd2', type: 'scene3d', model: 'not-a-model.txt' },
          { id: 't1', type: 'text', text: 'Shine', textFx: 'neon', glass: true, link: '#Next' },
          { id: 'b1', type: 'shape', text: 'Show', link: '#previous' },
          { id: 'a1', type: 'text', text: 'Answer', anim: { fx: 'pop', trigger: 'b1' } },
          { id: 'w1', type: 'text', text: 'Wiggle', anim: 'confetti' },
        ],
        anims: [
          { el: 't1', fx: 'typewriter', by: 'letters', ease: 'spring' },
          { el: 'c1', type: 'em', fx: 'wiggle', loop: true },
          { el: 'c1', type: 'in', fx: 'draw', loop: true },
          { el: 'a1', fx: 'fade', on: 'tap', trigger: 'nowhere' },
          { el: 't1', fx: 'nonsense' },
        ],
      },
      { transition: 'glitch', bg: 'stars', els: [{ type: 'text', text: 'x', link: '#last' }] },
    ],
  });
  const s = d.slides[0];
  const c1 = byId(d, 'c1');
  ok(c1.type === 'code' && c1.lang === 'python' && c1.code === 'def f(x):\n\treturn x  # same' && c1.highlight === '2' && c1.lineNumbers && c1.look === 'light', 'a code part keeps its language (by an alias too), code, lit lines, numbers and look');
  const h1 = byId(d, 'h1');
  ok(h1.type === 'html' && h1.html.includes('<script>deck.next()</script>') && h1.interactive && h1.poster === 'https://example.com/p.png', 'custom code is kept as the words it is, with its poster and whether it takes clicks');
  ok(byId(d, 'e1')?.type === 'embed' && (byId(d, 'e1') as Extract<El, { type: 'embed' }>).url === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'a web page of YouTube becomes its player');
  ok(!byId(d, 'e2') && !byId(d, 'e3') && !byId(d, 'e4') && !byId(d, 'e5'), 'web pages on this network, without https, with a password in them or by a bare name are refused');
  const q1 = byId(d, 'q1') as Extract<El, { type: 'quiz' }>;
  ok(q1.choices.map((c) => `${c.text}${c.correct ? '*' : ''}`).join(',') === 'London,Paris*,Rome*' && q1.multi === true && q1.explain === 'Paris.' && q1.hover === 'lift', 'a quiz’s choices as strings, a * marking the right ones (several make it multi)');
  ok((byId(d, 'q2') as Extract<El, { type: 'quiz' }>).choices.every((c) => !c.correct), 'a poll is a quiz with no right choice');
  ok((byId(d, 'q3') as Extract<El, { type: 'quiz' }>).choices[1].correct && !(byId(d, 'q3') as Extract<El, { type: 'quiz' }>).multi, 'its answer named by its words marks it');
  ok(byId(d, 's1')?.type === 'score', 'a score part');
  const d1 = byId(d, 'd1') as Extract<El, { type: 'scene3d' }>;
  ok(d1.shape === 'text' && d1.text === 'Hi' && d1.spin === 720 && d1.orbit && d1.zoom === 5 && d1.material === undefined, '3D: its shape and words kept, spin and zoom in bounds, an unknown material left out');
  ok((byId(d, 'd2') as Extract<El, { type: 'scene3d' }>).shape === 'cube' && !(byId(d, 'd2') as Extract<El, { type: 'scene3d' }>).model, 'a model that is not one: a cube instead');
  const t1 = byId(d, 't1') as Extract<El, { type: 'text' }>;
  ok(t1.textFx === 'neon' && t1.glass && t1.link === '#next' && (byId(d, 'b1') as El).link === '#prev', 'shining text, frosted glass, and links to the next and the previous slide');
  ok(d.slides[1].els[0].link === '#last', 'and to the last');
  ok(s.bg?.fx === 'aurora' && s.bg.video?.startsWith('naget-video:') && s.bg.dim === 0.3 && d.slides[1].bg?.fx === 'stars', 'moving backgrounds (by name too) and a video behind a slide');
  ok(s.transition?.fx === 'cube' && s.transition.dir === 'left' && s.transition.dur === 900 && d.slides[1].transition?.fx === 'glitch', 'the web format’s transitions');
  const an = s.anims ?? [];
  const type = an.find((a) => a.el === 't1' && a.fx === 'typewriter');
  ok(type?.by === 'letter' && type.ease === 'spring' && type.dur === 1600, 'typewriter letter by letter, its easing, its longer time');
  ok(an.some((a) => a.el === 'c1' && a.type === 'em' && a.fx === 'wiggle' && a.loop) && !an.some((a) => a.fx === 'draw' && a.loop), 'an emphasis keeps going; an entrance does not');
  ok(an.some((a) => a.el === 'a1' && a.on === 'tap' && a.trigger === 'b1' && a.fx === 'pop'), 'a tap on its trigger (from the part’s own anim)');
  ok(an.some((a) => a.el === 'a1' && a.on === 'tap' && a.trigger === 'a1' && a.fx === 'fade'), 'a tap with no such trigger is a tap on the part itself');
  ok(an.some((a) => a.el === 'w1' && a.type === 'em' && a.fx === 'confetti'), 'an emphasis given by name alone is one');
  ok(an.some((a) => a.el === 't1' && a.fx === 'fade' && a.type === 'in'), 'an unknown effect is a fade');
  ok(d.progress === true && isWebDeck(d) && d.format === undefined, 'a deck is in the web format unless it says, with its progress bar');
  const text = deckText(d);
  ok(isDeckText(text) && text.startsWith('{"v":1,"ratio":"16:9","progress":true,') && same(normalizeDeck(JSON.parse(text)), d), 'its text keeps the web format’s things and reads back the same');
  ok(deckSources(d).includes('https://example.com/p.png') && deckVideos(d).includes(`naget-video:${'a'.repeat(40)}`), 'posters are among its pictures, videos behind slides among its videos');

  // Limits and shorthand at the edges.
  const big = normalizeDeck({ slides: [{ els: [{ type: 'html', html: 'x'.repeat(SLIDE_LIMITS.html + 50) }, { type: 'code', code: 'y'.repeat(SLIDE_LIMITS.code + 50) }, { type: 'quiz', question: 'q'.repeat(2000), choices: Array.from({ length: 12 }, (_, i) => `c${i}`) }] }] });
  const [bh, bc, bq] = els(big) as [Extract<El, { type: 'html' }>, Extract<El, { type: 'code' }>, Extract<El, { type: 'quiz' }>];
  ok(bh.html.length === SLIDE_LIMITS.html && bc.code.length === SLIDE_LIMITS.code && bq.question.length === SLIDE_LIMITS.question && bq.choices.length === SLIDE_LIMITS.choices, 'custom code, code, a question and its choices are kept within their limits');
}

// ---- PowerPoint compatible decks ----------------------------------------------------------------------------------
{
  const web = normalizeDeck({
    progress: true,
    slides: [
      {
        bg: { fx: 'waves', video: `naget-video:${'b'.repeat(40)}`, dim: 0.4 },
        transition: 'blinds',
        notes: 'Say hello.',
        els: [
          { id: 'q', type: 'quiz', x: 100, y: 100, w: 800, h: 400, question: 'Largest planet?', choices: ['Earth', '*Jupiter'], explain: 'By far.', layout: 'grid', size: 30 },
          { id: 'sc', type: 'score', text: '{right}/{total} right' },
          { id: 'h', type: 'html', html: '<p>x</p>', poster: 'https://example.com/p.png' },
          { id: 'g', type: 'scene3d', shape: 'knot' },
          { id: 'k', type: 'code', code: 'print(1)', lang: 'python' },
          { id: 'b', type: 'shape', text: 'Go', hover: 'grow', textFx: 'gradient' },
        ],
        anims: [
          { el: 'k', fx: 'typewriter' },
          { el: 'g', type: 'em', fx: 'jello', loop: true, ease: 'bounce' },
          { el: 'h', fx: 'pop', on: 'tap', trigger: 'b' },
          { el: 'b', fx: 'rise', by: 'word' },
        ],
      },
      { els: [{ id: 'q2', type: 'quiz', question: 'Ok?', choices: ['*Yes', 'No'] }] },
    ],
  });
  const list = richFeatures(web);
  const kinds = (k: string) => list.filter((f) => f.kind === k);
  ok(kinds('part').map((f) => f.el).join() === 'q,sc,h,g,q2' && list.every((f) => f.slide >= 0 && f.what), 'richFeatures names each web part by its slide and id, in words');
  ok(kinds('effect').map((f) => `${f.from}>${f.to}`).join() === 'typewriter>appear,jello>shake,pop>zoom,rise>float', 'and each effect with the nearest of PowerPoint’s');
  ok(kinds('tap').length === 1 && kinds('loop').length === 1 && kinds('by').length === 1 && kinds('ease').length === 1, 'taps, repeats, words one by one and easing');
  ok(kinds('transition')[0]?.from === 'blinds' && kinds('transition')[0]?.to === 'wipe' && kinds('bgFx').length === 1 && kinds('bgVideo').length === 1 && kinds('progress')[0]?.slide === 0, 'transitions, moving backgrounds, videos behind slides, the progress bar (the deck’s own)');
  ok(kinds('hover').length === 1 && kinds('textFx').length === 1, 'pointer effects and shining text');
  const p = toPowerPoint(web);
  ok(p.format === 'pptx' && !p.progress && richFeatures(p).length === 0, 'toPowerPoint leaves nothing PowerPoint cannot keep');
  const s = p.slides[0];
  const q = s.els.find((e) => e.id === 'q');
  ok(q?.type === 'group' && q.els.length === 3 && q.els[0].type === 'text' && q.els.slice(1).every((e) => e.type === 'shape') && q.x === 100 && q.y === 100, 'a quiz becomes its question and choices as PowerPoint’s own parts, where it was');
  ok(q?.type === 'group' && q.els[2].x > q.els[1].x && q.els[2].y === q.els[1].y, 'a grid quiz’s choices side by side');
  ok((s.notes ?? '').startsWith('Say hello.') && (s.notes ?? '').includes('the answer is B (Jupiter). By far.'), 'its answer goes in the speaker notes, after the slide’s own');
  const sc = s.els.find((e) => e.id === 'sc');
  ok(sc?.type === 'text' && sc.paras[0].runs[0].t === '?/2 right', 'a score becomes its words, the number of quizzes in');
  ok(s.els.find((e) => e.id === 'h')?.type === 'image' && (s.els.find((e) => e.id === 'h') as Extract<El, { type: 'image' }>).src === 'https://example.com/p.png' && s.els.find((e) => e.id === 'g')?.type === 'image', 'live parts become pictures (their posters), keeping their ids');
  ok(s.els[0].type === 'video' && s.els[0].autoplay && s.els[0].muted && s.els[0].loop && s.els[1].type === 'shape' && s.els[1].opacity === 0.4 && !s.bg?.video && !s.bg?.fx, 'a video behind the slide becomes one at its back (its shade above it); the moving background goes');
  ok(s.transition?.fx === 'wipe' && (s.anims ?? []).every((a) => !a.loop && !a.by && !a.ease && a.on !== 'tap'), 'transitions and effects become PowerPoint’s');
  ok(s.els.find((e) => e.id === 'k')?.type === 'code' && !(s.els.find((e) => e.id === 'b') as El).hover, 'code stays (PowerPoint has it as words); pointer effects go');
  ok(same(toPowerPoint(p).slides, p.slides) && same(normalizeDeck(JSON.parse(deckText(p))), p), 'made PowerPoint’s again, or read back, it stays the same');
  const given = normalizeDeck({ format: 'pptx', progress: true, slides: web.slides });
  ok(given.format === 'pptx' && !given.progress && given.slides[0].els.every((e) => e.type !== 'quiz' && e.type !== 'html'), 'a deck given as "pptx" with web things gets them as PowerPoint’s');
  const note = powerPointNote(list);
  ok(note.startsWith('Made for PowerPoint: 5 parts became pictures or text boxes (a quiz, a quiz score, custom code, 3D)') && note.includes('left out:') && /^[\x20-\x7e]+$/.test(note), `the PowerPoint file’s note, in plain letters: ${note}`);
  ok(powerPointNote([]) === '', 'none when nothing changed');
}

// ---- code's colours ------------------------------------------------------------------------------------------------
{
  const kinds = (code: string, lang: string) => codeTokens(code, lang).map(([k, t]) => `${k}:${t}`);
  ok(kinds('def f(x): # hi', 'python').join('|') === 'k:def|: |f:f|:(x): |c:# hi', 'Python: keywords, functions, comments');
  const js = kinds('const s = `a ${b}`; // c\nlet n = 0x1F;', 'javascript');
  ok(js.includes('k:const') && js.includes('s:`a ${b}`') && js.includes('c:// c') && js.includes('n:0x1F'), 'JavaScript: template strings, comments, numbers');
  ok(kinds('SELECT a FROM t -- why', 'sql').filter((x) => x.startsWith('k:')).length === 2 && kinds('select 1', 'sql')[0] === 'k:select', 'SQL’s keywords in any case');
  const h = kinds('<a href="x" title=\'<b>\'>t</a><!-- c --><style>p{color:#fff}</style>', 'html');
  ok(h.includes('g:<a') && h.includes('a:href') && h.includes('s:"x"') && h.includes("s:'<b>'") && h.includes('c:<!-- c -->') && h.includes('n:#fff') && h.filter((x) => x === 'g:<b').length === 0, 'HTML: tags, attributes, values (a tag inside one is not one), comments, its CSS');
  ok(kinds('{"a": 1, "b": [true]}', 'json').join('|').includes('a:"a"') && kinds('{"a": 1}', 'json').includes('n:1'), 'JSON: keys and numbers');
  ok(kinds('echo $HOME # x', 'bash').includes('a:$HOME') && kinds('x', 'nonesuch').join() === ':x', 'the shell’s names; an unknown language as plain words');
  ok(codeTokens('a'.repeat(50_000), 'python').map(([, t]) => t).join('').length === 40_000, 'it reads so far, and no further');
}

// ---- the deck's page: one small file -------------------------------------------------------------------------------
{
  ok(RUNTIME_MINIFIED && RUNTIME_SRC.length < slidesRuntime.toString().length * 0.8, `the deck's page carries the runtime minified (${RUNTIME_SRC.length} characters for ${slidesRuntime.toString().length})`);
  ok(THREE_DEFAULT === THREE_BASE, 'three.js is pinned once (the runtime’s own address the same as the app’s)');
  const d = normalizeDeck({ theme: 'midnight', slides: [{ layout: 'title', title: 'Hi' }, { els: [{ type: 'code', code: 'x = 1' }] }] });
  const page = deckPage(db, d, 'T');
  ok(page.includes(RUNTIME_SRC) && page.includes(JSON.stringify(THREE_BASE).slice(1, -1)) && /<script type="application\/json" id="n-deck">\{"v":1,"ratio":"16:9","theme":\{[^\n]*\}<\/script>/.test(page), 'its page: the runtime minified, three.js’s address, the deck as tight JSON');
  ok(/family=JetBrains\+Mono/.test(page) && /family=Space\+Grotesk/.test(page) && !page.includes('"Playfair Display"'), 'only the fonts it uses: its theme’s and code’s');
  const plain = deckPage(db, normalizeDeck({ slides: [{ layout: 'title', title: 'x' }] }), 'x');
  ok(Buffer.byteLength(plain) < 130_000, `a small deck’s page is small: ${Buffer.byteLength(plain)} bytes (${zlib.gzipSync(plain).length} gzipped)`);
  // A 3D model goes inside the viewer's page only, as a data: address.
  const sha = putAsset(db, glb(), { model: true });
  ok(getAsset(db, sha)?.mime === 'model/gltf-binary' && modelType(glb()) === 'model/gltf-binary', 'a glTF binary file is kept as a model');
  let threw = '';
  try {
    putAsset(db, PNG, { model: true });
  } catch (e) {
    threw = (e as Error).message;
  }
  ok(threw.includes('not a 3D model'), 'and nothing else is');
  const m = normalizeDeck({ slides: [{ els: [{ type: 'scene3d', model: `naget-asset:${sha}` }] }] });
  ok(deckSources(m).includes(`naget-asset:${sha}`), 'a kept model is among the deck’s sources (kept while a version shows it)');
  ok(deckPage(db, m, 'x').includes('data:model/gltf-binary;base64,') && !deckPage(db, m, 'x', 'print').includes('data:model/gltf-binary'), 'its model is inside the viewer’s page, not the printed one');
  // Fonts inside a download, when they can be had (fetched from Google once, kept).
  const file = await deckFile(db, d, 'T');
  const inside = file.includes('<style id="n-fonts">@font-face');
  const head = file.slice(0, file.indexOf('<body>'));
  ok(inside ? !/<link[^>]+fonts\.googleapis\.com/.test(head) && /url\(data:font\/woff2;base64,/.test(head) : /<link[^>]+fonts\.googleapis\.com/.test(head), inside ? `a downloaded page has its fonts inside it (${Math.round(Buffer.byteLength(file) / 1024)} KB, the page alone ${Math.round(Buffer.byteLength(page) / 1024)} KB)` : 'offline, a downloaded page loads its fonts from Google');
}

// ---- /partframe ------------------------------------------------------------------------------------------------------
{
  const src = fs.readFileSync(path.join(process.env.NAGET_AGENT_ROOT ?? process.cwd(), 'server/index.ts'), 'utf8');
  const route = /app\.get\('\/partframe'[\s\S]{0,400}?\.send\(PART_FRAME_HTML\)/.exec(src)?.[0] ?? '';
  ok(route.includes("'Content-Security-Policy', (req.query as Record<string, string>).offline === '1' ? OFFLINE_PAGE_CSP : PAGE_CSP"), '/partframe is served with the pages’ policy (sandboxed, scripts, no origin), offline in a confidential session');
  ok(PART_FRAME_HTML.includes('.source !== parent') && PART_FRAME_HTML.includes('n-part-ready') && PART_FRAME_HTML.includes('document.write(') && !/innerHTML|eval\(/.test(PART_FRAME_HTML), 'its page takes its page from its parent only, and writes it');
  if (canCapture()) {
    // In a frame as the app makes it: told it is ready, it writes the first page sent, and no other.
    const host = `<!doctype html><html><body><script>window.__got = []; addEventListener('message', (e) => { const d = e.data; if (d && d.type === 'n-part-ready') { const page = (w) => '<p id="x">' + w + '</p><script>parent.postMessage({ ns: "t", v: document.getElementById("x").textContent }, "*")<' + '/script>'; e.source.postMessage({ type: 'n-part-page', html: page('one') }, '*'); setTimeout(() => e.source.postMessage({ type: 'n-part-page', html: page('two') }, '*'), 300); } else if (d && d.ns === 't') window.__got.push(d.v); });</script><iframe sandbox="allow-scripts" srcdoc="${PART_FRAME_HTML.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></body></html>`;
    const got = await withTab({ html: host, width: 600, height: 400, settleMs: 200 }, (tab) => tab.evaluate<string[]>('new Promise((ok) => setTimeout(() => ok(window.__got), 1500))')).catch((e: Error) => [e.message]);
    ok(got.join() === 'one', `in a frame, it writes the first page its parent sends, and only that: ${got.join()}`);
  }
}

// ---- agents ----------------------------------------------------------------------------------------------------------
{
  fs.mkdirSync(path.join(tmp, 'images'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'images', 'plot.html'), '<div id="p"></div><script>window.deck && deck.on("enter", () => {})</script>');
  fs.writeFileSync(path.join(tmp, 'images', 'plot.png'), PNG);
  fs.writeFileSync(path.join(tmp, 'images', 'huge.html'), 'x'.repeat(SLIDE_LIMITS.html + 10));
  fs.writeFileSync(path.join(tmp, 'thing.glb'), glb());
  const made = await run('save_slides', {
    title: 'Web',
    progress: true,
    slides: [
      {
        bg: { fx: 'bokeh' },
        els: [
          { id: 'plot', type: 'html', file: 'images/plot.html', poster: 'images/plot.png', interactive: true },
          { id: 'big', type: 'html', file: 'images/huge.html' },
          { id: 'gone', type: 'html', file: 'images/nowhere.html' },
          { id: 'm', type: 'scene3d', model: 'thing.glb', spin: 20 },
          { id: 'q', type: 'quiz', question: '2 + 2?', choices: ['3', '*4'] },
          { id: 'k', type: 'code', code: 'print("hi")', lang: 'python' },
        ],
      },
      { bg: { video: 'nowhere.mp4' }, els: [{ type: 'text', text: 'x' }] },
    ],
  });
  const id = idOf(made.text);
  ok(!!id, `save_slides makes a web deck: ${made.error ?? ''}`);
  ok((made.text ?? '').includes('huge.html') && (made.text ?? '').includes('over the 200 KB') && (made.text ?? '').includes('nowhere.html'), 'custom code too large, or a file that is not there, is said');
  ok((made.text ?? '').includes('nowhere.mp4'), 'a video behind a slide that is not there is said');
  const deck = (await req('GET', `/api/pages/${id}`)).json().model as Deck;
  const plot = byId(deck, 'plot') as Extract<El, { type: 'html' }>;
  ok(plot.html.includes('deck.on("enter"') && /^naget-asset:/.test(plot.poster ?? ''), 'custom code from a file of the session, its poster kept as a picture');
  ok((byId(deck, 'big') as Extract<El, { type: 'html' }>).html === '' && (byId(deck, 'gone') as Extract<El, { type: 'html' }>).html === '', 'parts whose code could not be had are left empty');
  const model = (byId(deck, 'm') as Extract<El, { type: 'scene3d' }>).model ?? '';
  ok(/^naget-asset:/.test(model) && getAsset(db, model.slice(12))?.mime === 'model/gltf-binary', 'a .glb file of the session is kept as the 3D part’s model');
  ok(deck.progress === true && isWebDeck(deck) && deck.slides[0].bg?.fx === 'bokeh' && !deck.slides[1].bg?.video, 'the progress bar and moving background kept; a missing video behind a slide left out');
  const got = (await run('get_page', { id })).text ?? '';
  ok(got.includes('the web format, a progress bar'), 'get_page says the deck’s format');
  // A .gltf (glTF's text) is kept with the files beside it inside it; one pointing out of its folder is not.
  const tri = glb();
  const binAt = 20 + tri.readUInt32LE(12) + 8;
  fs.mkdirSync(path.join(tmp, 'model'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'model', 'tri.bin'), tri.subarray(binAt));
  const gltf = JSON.parse(tri.subarray(20, 20 + tri.readUInt32LE(12)).toString('utf8'));
  gltf.buffers[0].uri = 'tri.bin';
  fs.writeFileSync(path.join(tmp, 'model', 'tri.gltf'), JSON.stringify(gltf));
  fs.writeFileSync(path.join(tmp, 'model', 'out.gltf'), JSON.stringify({ ...gltf, buffers: [{ byteLength: 36, uri: '../thing.glb' }] }));
  const g = await run('save_slides', { title: 'glTF', slides: [{ els: [{ id: 'in', type: 'scene3d', model: 'model/tri.gltf' }, { id: 'out', type: 'scene3d', model: 'model/out.gltf' }] }] });
  const gd = (await req('GET', `/api/pages/${idOf(g.text)}`)).json().model as Deck;
  const kept = getAsset(db, ((byId(gd, 'in') as Extract<El, { type: 'scene3d' }>).model ?? '').slice(12));
  ok(kept?.mime === 'model/gltf+json' && kept.data.toString('utf8').includes('"uri":"data:application/octet-stream;base64,'), 'a .gltf of the session is kept with its buffer inside it');
  ok(!(byId(gd, 'out') as Extract<El, { type: 'scene3d' }>).model && (g.text ?? '').includes('out.gltf'), 'one whose files are outside its folder is not, and that is said');

  // The deck made PowerPoint compatible stays so when it is sent back whole without saying.
  await run('save_slides', { id, title: 'Web', format: 'pptx', slides: deck.slides });
  const asPptx = (await req('GET', `/api/pages/${id}`)).json().model as Deck;
  ok(asPptx.format === 'pptx' && !asPptx.slides[0].els.some((e) => e.type === 'quiz' || e.type === 'html') && !asPptx.progress, 'format "pptx" makes it PowerPoint compatible');
  await run('save_slides', { id, title: 'Web', slides: asPptx.slides });
  ok(((await req('GET', `/api/pages/${id}`)).json().model as Deck).format === 'pptx', 'and it stays so when sent back without a format');
  ok(((await run('get_page', { id })).text ?? '').includes('PowerPoint compatible, format "pptx"'), 'get_page says so');
  await run('save_slides', { id, title: 'Web', format: 'web', change: [{ slide: 1, els: [{ type: 'text', text: 'back' }] }] });
  ok(isWebDeck((await req('GET', `/api/pages/${id}`)).json().model as Deck), 'format "web" makes it a web deck again');

  // What agents are told.
  const help = String(tools.save_slides.description);
  ok(
    ['the web format unless it has "format": "pptx"', 'quiz {question', 'window.deck', 'deck.next()', 'trigger', 'file: an .html file', 'make_plot', 'scene3d {model', 'textFx', 'hover', 'cube|flip|dissolve|circle|blinds|glitch', 'aurora', 'progress: true', '"#next"'].every((w) => help.includes(w)),
    'save_slides tells agents of the web format, its parts, files, effects and examples',
  );
  const schema = tools.save_slides.inputSchema as { properties: Record<string, { enum?: string[] }> };
  ok(schema.properties.format?.enum?.join() === 'web,pptx' && !!schema.properties.progress, 'and its schema takes the format and the progress bar');
  ok(String(tools.export_page.description).includes('works offline'), 'export_page says a deck’s web page works offline');

  // A web deck as files: its web page (minified, its pictures inside), and PowerPoint (its note).
  const web = idOf(
    (
      await run('save_slides', {
        title: 'Quiz deck',
        slides: [
          {
            els: [
              { id: 'q', type: 'quiz', question: 'Pick', choices: ['*A', 'B'] },
              { id: 'code', type: 'code', code: 'x = 1  # one', lang: 'python', lineNumbers: true, highlight: '1' },
              { id: 'live', type: 'html', html: '<body style="margin:0;background:#c00"><div style="width:100%;height:100vh"></div></body>' },
              { id: 'nx', type: 'text', text: 'Next', link: '#next' },
            ],
          },
          { transition: 'cube', els: [{ type: 'text', text: 'Two' }] },
        ],
      })
    ).text,
  );
  const html = (await run('export_page', { id: web, format: 'html', path: 'deck.html' })).text ?? '';
  const file = fs.readFileSync(path.join(tmp, 'deck.html'), 'utf8');
  ok(html.includes('deck.html') && file.includes(RUNTIME_SRC) && file.includes('id="n-deck"'), 'export_page gives the deck’s web page, the runtime minified inside');
  const px = await req('GET', `/api/pages/${web}/export?format=pptx`);
  const note = String(px.headers['x-export-note'] ?? '');
  ok(px.statusCode === 200 && note.startsWith('Made for PowerPoint: 2 parts became pictures or text boxes (a quiz, custom code)'), `the PowerPoint file says what changed: ${note}`);
  ok(((await run('export_page', { id: web, format: 'pptx' })).text ?? '').includes('Made for PowerPoint'), 'export_page says the same');
  const x1 = slideXml(px.rawPayload, 1);
  ok(x1.includes('typeface="JetBrains Mono"') && x1.includes('<a:t>x = </a:t>') && x1.includes('<a:t># one</a:t>') && /i="1"[^>]*><a:solidFill><a:srgbClr val="8B949E"/.test(x1), 'code goes as words in its monospaced font, coloured, its comment in italics');
  ok(x1.includes('ppaction://hlinkshowjump?jump=nextslide'), 'a link to the next slide is PowerPoint’s own');
  ok(x1.includes('<a:t>Pick</a:t>') && x1.includes('<a:t>A   </a:t>'), 'the quiz as words');
  if (canCapture()) {
    const rels = new Zip(px.rawPayload).read('ppt/slides/_rels/slide1.xml.rels')?.toString() ?? '';
    ok(/media\/image\d+\.png/.test(rels) && x1.includes('descr="Custom code"'), 'with a browser here, custom code goes to PowerPoint as a picture of it running');
  }
}

// ---- in a real page: quizzes answered, live parts running, taps --------------------------------------------------------
if (canCapture()) {
  const d = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'q', type: 'quiz', question: 'Largest planet?', choices: ['Earth', '*Jupiter', 'Mars'], explain: 'By far.' },
          { id: 's', type: 'score', y: 600, h: 80 },
          { id: 'b', type: 'shape', x: 900, y: 600, w: 200, h: 80, text: 'Show' },
          { id: 'a', type: 'text', x: 900, y: 500, w: 200, h: 80, text: '42' },
          { id: 'live', type: 'html', x: 900, y: 80, w: 300, h: 200, html: '<p id="p">waiting</p><script>deck.on("enter", (e) => { document.getElementById("p").textContent = "slide " + deck.slide + " of " + deck.slides; parent.postMessage({ ns: "test", said: document.getElementById("p").textContent }, "*"); })</script>' },
        ],
        anims: [{ el: 'a', fx: 'pop', on: 'tap', trigger: 'b' }],
      },
      { els: [{ id: 'q2', type: 'quiz', question: 'Two?', choices: ['*Yes', 'No'] }] },
    ],
  });
  const raw = deckPage(db, d, 'Quiz');
  const at = raw.lastIndexOf('</body>');
  const page = `${raw.slice(0, at)}<script>window.__said = []; addEventListener("message", (e) => e.data && e.data.ns === "test" && window.__said.push(e.data.said));</script>${raw.slice(at)}`;
  const r = await withTab({ html: page, width: 1280, height: 800, settleMs: 300, blockPrivate: true }, async (tab) => {
    const ev = <T>(js: string) => tab.evaluate<T>(js);
    await ev('new Promise((ok) => setTimeout(() => ok(true), 600))');
    const before = await ev<string>('document.querySelector(".ns-score").textContent');
    const hidden = await ev<boolean>('document.querySelector(".ns-el[data-id=a]").classList.contains("ns-hidden")');
    await ev('(document.querySelectorAll(".ns-qc")[0].click(), true)');
    const marks = await ev<string[]>('Array.from(document.querySelectorAll(".ns-qc")).map((b) => b.className)');
    const said = await ev<string>('document.querySelector(".ns-qf").textContent');
    await ev('(document.querySelectorAll(".ns-qc")[1].click(), true)');
    const after = await ev<string>('Array.from(document.querySelectorAll(".ns-qc")).map((b) => b.className).join("|")');
    const count = await ev<string>('document.querySelector(".ns-count").textContent');
    await ev('(document.querySelector(".ns-el[data-id=b]").click(), true)');
    const shown = await ev<boolean>('!document.querySelector(".ns-el[data-id=a]").classList.contains("ns-hidden")');
    const count2 = await ev<string>('document.querySelector(".ns-count").textContent');
    const live = await ev<string[]>('new Promise((ok) => { const end = Date.now() + 5000; const go = () => (window.__said.length || Date.now() > end ? ok(window.__said) : setTimeout(go, 100)); go(); })');
    const frame = await ev<string>('document.querySelector(".ns-live iframe").getAttribute("sandbox")');
    const score = await ev<string>('document.querySelector(".ns-score").textContent');
    return { before, hidden, marks, said, after, count, shown, count2, live, frame, score };
  });
  ok(r.before === 'You got 0 of 2' && r.hidden, 'a score counts the deck’s quizzes; what a tap brings waits hidden');
  ok(r.marks[0].includes('ns-wrong') && r.marks[1].includes('ns-right') && !r.marks[2].includes('ns-right') && r.said === 'By far.', 'a wrong pick shows wrong, the right one right, and the explanation');
  ok(!r.after.includes('ns-pick') && r.count === '1 / 2' && r.score === 'You got 0 of 2', 'once answered it stays so; a click on it is the quiz’s, not the next slide');
  ok(r.shown && r.count2 === '1 / 2', 'a click on a tap’s trigger runs its effect, not the next slide');
  ok(r.live[0] === 'slide 1 of 2' && r.frame === 'allow-scripts', 'custom code runs in a frame of its own (scripts, no origin), told its slide by window.deck');
} else console.log('(no browser here: the page’s quizzes and live parts were not tried)');

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
