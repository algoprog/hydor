// Script tests for the slides editor's model and files: groups (made, fitted, turned, undone, as PowerPoint groups),
// icons (checked lines, named by an agent), equations, videos, pictures' crop and colours, merged table cells, the
// footer and slide numbers, guides, Morph (which parts two slides share, and PowerPoint's Morph), decks made before
// these that still read the same, and what agents are told and given. Through the routes and the save tool, with a
// stand-in for the session manager. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/slides-editor-test.ts
//   DATA_DIR=/tmp/hydor-test-slides-editor node dist/dev/slides-editor-test.js
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { Zip } from '../documents/zip.ts';
import { extractText } from '../documents/extract.ts';
import { canCapture } from '../capture/index.ts';
import { deckSources, deckText, deckVideos, fitGroup, footerOn, groupOf, isDeckText, normalizeDeck, reconnect, scaleEls, turnedBox, ungroupEls, videoSrc, type Deck, type El, type GroupEl } from '../../shared/slides.ts';
import { slidesRuntime } from '../../shared/slides-runtime.ts';
import { pptxFile, type Picture } from './pptx.ts';
import { deckFaces, faceKey } from './pptx-fonts.ts';
import { deckPage, lucideIcon, RUNTIME_SRC } from './slides.ts';
import { pages } from './index.ts';
import { sweepAssets } from './assets.ts';
import { getVideo } from './videos.ts';
import { findInDeck, replaceAllInDeck, replaceHit } from '../../web/src/features/pages/slides/find.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-slides-editor-test-')));
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
// Raw bodies stay streams, as the server has them (uploads in pieces).
app.addContentTypeParser('application/octet-stream', (_r, payload, done) => done(null, payload));
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = {
  app,
  db,
  sessions: { deliverOrQueue: async () => {} },
  broadcast: () => {},
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
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
const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;
/** Where a part's centre is on the slide, through the groups around it. */
const centreOn = (path: GroupEl[], e: El) => {
  let x = e.x + e.w / 2;
  let y = e.y + e.h / 2;
  for (let i = path.length - 1; i >= 0; i--) {
    const g = path[i];
    const a = ((g.rot ?? 0) * Math.PI) / 180;
    const lx = x - g.w / 2;
    const ly = y - g.h / 2;
    x = g.x + g.w / 2 + lx * Math.cos(a) - ly * Math.sin(a);
    y = g.y + g.h / 2 + lx * Math.sin(a) + ly * Math.cos(a);
  }
  return { x, y };
};
const slideXml = (pptx: Buffer, n: number) => new Zip(pptx).read(`ppt/slides/slide${n}.xml`)?.toString('utf8') ?? '';
const dot: Picture = { data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAAASUVORK5CYII=', 'base64'), ext: 'png', w: 400, h: 200 };

// ---- groups --------------------------------------------------------------------------------------------------
{
  const d = normalizeDeck({
    slides: [
      {
        els: [
          {
            type: 'group',
            name: 'Badge',
            els: [
              { type: 'shape', shape: 'ellipse', x: 300, y: 200, w: 100, h: 100 },
              { type: 'text', x: 420, y: 220, w: 200, h: 60, text: 'Fast' },
            ],
          },
          {
            type: 'group',
            x: 600,
            y: 400,
            rot: 30,
            els: [
              { type: 'shape', x: 10, y: 20, w: 50, h: 50 },
              { type: 'line', x: 0, y: 0, w: 80, h: 40 },
            ],
          },
        ],
      },
    ],
  });
  const [g1, g2] = d.slides[0].els as GroupEl[];
  ok(g1.type === 'group' && g1.x === 300 && g1.y === 200 && g1.w === 320 && g1.h === 100, 'a group given its parts on the slide goes round them');
  ok(g1.els[0].x === 0 && g1.els[0].y === 0 && g1.els[1].x === 120 && g1.els[1].y === 20, 'its parts are placed from its corner');
  ok(g1.name === 'Badge' && g2.rot === 30, 'a group keeps its name and turn');
  ok(Math.min(...g2.els.map((e) => turnedBox(e).x)) === 0 && Math.min(...g2.els.map((e) => turnedBox(e).y)) === 0, 'a placed group is fitted to its parts');
  ok(JSON.stringify(normalizeDeck(d)) === JSON.stringify(d), 'a deck with groups is kept as it is when checked again');
  // Fitting a turned group moves nothing on the slide.
  const turned: GroupEl = { id: 'g', type: 'group', x: 100, y: 100, w: 300, h: 200, rot: 40, els: [{ id: 'a', type: 'shape', shape: 'rect', x: 50, y: 30, w: 100, h: 80, paras: [], size: 20 } as El] };
  const before = centreOn([turned], turned.els[0]);
  const fitted = fitGroup(turned);
  const after = centreOn([fitted], fitted.els[0]);
  ok(fitted.els[0].x === 0 && fitted.els[0].y === 0 && near(before.x, after.x, 0.05) && near(before.y, after.y, 0.05), 'a turned group fitted to its parts leaves them where they show');
  // Grouped and ungrouped: back where they were, turned with the group.
  const parts: El[] = [{ id: 'p1', type: 'shape', shape: 'rect', x: 100, y: 120, w: 200, h: 100, rot: 10, paras: [], size: 20 } as El, { id: 'p2', type: 'line', x: 400, y: 300, w: 120, h: -60, width: 3 } as El];
  const grp = groupOf(parts, 'grp');
  const back = ungroupEls(grp);
  ok(
    back.every((e, i) => near(e.x, parts[i].x) && near(e.y, parts[i].y) && near(e.w, parts[i].w) && near(e.h, parts[i].h)),
    'parts grouped then ungrouped are back where they were',
  );
  const spun = { ...grp, rot: 90 };
  const where = spun.els.map((e) => centreOn([spun], e));
  const out = ungroupEls(spun);
  ok(
    out.every((e, i) => near(e.x + e.w / 2, where[i].x) && near(e.y + e.h / 2, where[i].y)),
    'ungrouping a turned group leaves its parts where they show',
  );
  ok(out[0].rot === 100, 'and turns each part with it');
  ok(
    ungroupEls({ ...grp, opacity: 0.5 }).every((e) => e.opacity === 0.5),
    'a see-through group leaves its parts as see-through',
  );
  const big = scaleEls(grp.els, 2, 0.5);
  ok(big[0].w === parts[0].w * 2 && big[0].h === parts[0].h * 0.5 && big[0].type === 'shape' && (big[0] as { size: number }).size === 20, 'a group sized sizes its parts, not their words');
  // Groups in groups, and how deep they may go.
  const deep = normalizeDeck({ slides: [{ els: [{ type: 'group', els: [{ type: 'group', els: [{ type: 'group', els: [{ type: 'group', els: [{ type: 'group', els: [{ type: 'text', text: 'deep' }] }] }] }] }] }] }] });
  let depth = 0;
  let at: El | undefined = deep.slides[0].els[0];
  while (at && at.type === 'group') {
    depth++;
    at = at.els[0];
  }
  ok(depth === 4 && at?.type === 'text', 'groups go four deep at most; deeper, their parts join the group around them');
  const many = normalizeDeck({ slides: [{ els: Array.from({ length: 150 }, () => ({ type: 'group', els: Array.from({ length: 150 }, () => ({ type: 'text', text: 'x' })) })) }] });
  const count = (els: El[]): number => els.reduce((a, e) => a + 1 + (e.type === 'group' ? count(e.els) : 0), 0);
  ok(count(many.slides[0].els) <= 450, 'a slide holds a bounded number of parts, groups and all');
  // Animations stay with the slide's own parts: a group, not what is in it.
  const anim = normalizeDeck({ slides: [{ els: [{ id: 'gg', type: 'group', els: [{ id: 'in1', type: 'text', text: 'a' }], anim: 'fade' }], anims: [{ el: 'in1', fx: 'fly' }] }] });
  ok(anim.slides[0].anims?.length === 1 && anim.slides[0].anims[0].el === 'gg', 'a group is animated as one; its parts are not on their own');
}

// ---- icons, equations, videos ---------------------------------------------------------------------------------
{
  const d = normalizeDeck({
    slides: [
      {
        els: [
          {
            type: 'icon',
            icon: 'Star',
            paths: [
              ['path', { d: 'M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z', onclick: 'alert(1)' }],
              ['script', { src: 'x.js' }],
              ['path', { d: 'M0 0 url(javascript:alert(1))' }],
              ['circle', { cx: 12, cy: 12, r: '3' }],
              ['rect', { x: 1, y: 1 }],
            ],
            color: 'c2',
            lineW: 3,
          },
          { type: 'icon', icon: 'nothing', paths: [] },
          { type: 'equation', tex: 'E = mc^2', align: 'left', color: 'accent' },
          { type: 'math', tex: '   ' },
          { type: 'video', src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', autoplay: true, muted: true },
          { type: 'video', src: 'https://vimeo.com/76979871', start: 12 },
          { type: 'video', src: 'https://example.com/clip.mp4' },
        ],
      },
    ],
  });
  const els = d.slides[0].els;
  const icon = els[0];
  ok(icon.type === 'icon' && icon.icon === 'star' && icon.paths.length === 2 && icon.paths[0][0] === 'path' && icon.paths[1][0] === 'circle', 'an icon keeps its lines that are SVG lines, and nothing else');
  ok(
    icon.type === 'icon' && !('onclick' in icon.paths[0][1]) && icon.paths[1][1].r === 3 && icon.w === 120 && icon.h === 120 && icon.color === 'c2' && icon.lineW === 3,
    'only drawing attributes, numbers as numbers; square by default; its colour and line width',
  );
  ok(!els.some((e) => e.type === 'icon' && e.icon === 'nothing'), 'an icon without lines is left out');
  const math = els.find((e) => e.type === 'math');
  ok(math?.type === 'math' && math.tex === 'E = mc^2' && math.align === 'left' && math.color === 'accent', 'an equation keeps its LaTeX, colour and alignment');
  ok(els.filter((e) => e.type === 'math').length === 1, 'an empty equation is left out');
  const videos = els.filter((e) => e.type === 'video');
  ok(
    videos.length === 2 && videos[0].type === 'video' && videos[0].src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' && videos[0].start === 90 && videos[0].autoplay && videos[0].muted,
    'a YouTube address becomes its player, starting where it said',
  );
  ok(videos[1].type === 'video' && videos[1].src === 'https://player.vimeo.com/video/76979871' && videos[1].start === 12, 'a Vimeo address becomes its player');
  ok(
    videoSrc('https://youtu.be/dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' && videoSrc('javascript:alert(1)') === null && videoSrc('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ') === null,
    'only YouTube and Vimeo addresses are videos',
  );
  ok(deckSources(d).length === 0 && deckSources(d, true).includes('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'), 'a video’s YouTube still is fetched for exports, not kept with the deck');
  ok(JSON.stringify(normalizeDeck(d)) === JSON.stringify(d), 'a deck with icons, equations and videos is kept as it is when checked again');
  // Lucide's icons by name, where this install has them.
  const rocket = lucideIcon('rocket');
  ok(!!rocket && rocket.length > 1 && rocket.every((n) => n[0] === 'path'), 'an icon’s lines come from Lucide by its name');
  ok(!!lucideIcon('ArrowRight') && JSON.stringify(lucideIcon('arrow-right')) === JSON.stringify(lucideIcon('ArrowRight')), 'in kebab-case or as React names it');
  ok(!!lucideIcon('home'), 'and by the other names Lucide gives it');
  ok(lucideIcon('../../etc/passwd') === null && lucideIcon('no-such-icon-here') === null, 'a name that is not an icon’s has none');
}

// ---- pictures, tables, the footer, guides, Morph's keys -----------------------------------------------------
{
  const d = normalizeDeck({
    footer: { num: true, text: 'Acme · Confidential', date: 'today', skipTitle: true, junk: 1 },
    guides: { x: [640, 640, 100.4, 'x', 99999], y: [360] },
    slides: [
      { layout: 'title', title: 'Hi' },
      {
        nofooter: true,
        transition: 'morph',
        els: [
          { type: 'image', src: 'https://example.com/a.png', crop: { l: 0.7, r: 0.7, t: 0.1, b: -2 }, adjust: { bright: 250, contrast: -20, sat: 100, gray: true, blur: 0 } },
          { type: 'image', src: 'https://example.com/b.png', crop: { l: 0, t: 0, r: 0, b: 0 }, adjust: { sat: 100 } },
          {
            type: 'table',
            rows: [
              ['a', 'b', 'c'],
              ['d', 'e', 'f'],
              ['g', 'h', 'i'],
            ],
            merges: [
              { r: 0, c: 0, rs: 1, cs: 2 },
              { r: 0, c: 1, rs: 2, cs: 1 },
              { r: 1, c: 1, rs: 2, cs: 2 },
              { r: 2, c: 0, rs: 5, cs: 1 },
              { r: 9, c: 9, rs: 2, cs: 2 },
            ],
            fills: { '1,1': 'accent', '9,9': 'red', '0,2': 'nope' },
          },
          { id: 'abc', type: 'text', text: 'k', key: 'xyz' },
          { id: 'def', type: 'text', text: 'k', key: 'def' },
        ],
      },
      { layout: 'content', title: 'Plain' },
    ],
  });
  const [img, img2, table, keyed, self] = d.slides[1].els;
  ok(img.type === 'image' && img.crop?.l === 0.475 && img.crop.r === 0.475 && img.crop.t === 0.1 && img.crop.b === 0, 'a crop stays within the picture, the two sides together at most 95%');
  ok(img.type === 'image' && img.adjust?.bright === 100 && img.adjust.contrast === -20 && img.adjust.gray && img.adjust.sat === undefined && img.adjust.blur === undefined, 'a picture’s colours are kept in bounds, what is unchanged left out');
  ok(img2.type === 'image' && !img2.crop && !img2.adjust, 'a crop of nothing and colours as they are are not kept');
  ok(
    table.type === 'table' &&
      JSON.stringify(table.merges) ===
        JSON.stringify(
          [
            { r: 0, c: 0, rs: 1, cs: 2 },
            { r: 1, c: 1, rs: 2, cs: 2 },
            { r: 2, c: 0, rs: 1, cs: 1 },
          ].filter((m) => m.rs * m.cs > 1),
        ),
    'merged cells within the table, none over another',
  );
  ok(table.type === 'table' && JSON.stringify(table.fills) === '{"1,1":"accent"}', 'cells’ fills within the table, colours only');
  ok(keyed.key === 'xyz' && self.key === undefined, 'a part keeps the key its copies share (not its own id again)');
  ok(d.slides[1].transition?.fx === 'morph' && d.slides[1].transition.dur === 1000, 'Morph is a transition, a second long unless it says');
  ok(JSON.stringify(d.footer) === JSON.stringify({ num: true, text: 'Acme · Confidential', date: 'today', skipTitle: true }) && d.slides[1].nofooter === true, 'the footer is kept as said, and a slide may leave it off');
  ok(JSON.stringify(d.guides) === JSON.stringify({ x: [100, 640], y: [360] }), 'guides are whole pixels, once each, on or near the slide');
  ok(!footerOn(d, 0) && !footerOn(d, 1) && footerOn(d, 2), 'the footer shows where it should: not on the title slide, nor where it was left off');
  const text = deckText(d);
  ok(isDeckText(text) && text.startsWith('{"v":1,"ratio":"16:9","theme":') && text.includes('"footer":{') && text.includes('"guides":{'), 'the kept text has the footer and the guides, and still reads as a deck');
  ok(JSON.stringify(normalizeDeck(JSON.parse(text))) === JSON.stringify(d), 'and reads back as the same deck');
  ok(!normalizeDeck({ footer: { skipTitle: true }, slides: [{}] }).footer, 'a footer that shows nothing is not kept');
}

// ---- decks made before these features --------------------------------------------------------------------------
{
  const old = {
    v: 1,
    ratio: '16:9',
    theme: 'midnight',
    slides: [
      { layout: 'content', title: 'Before', text: '- one\n- two', notes: 'Hi', transition: { fx: 'push', dir: 'left' } },
      {
        els: [
          { type: 'image', src: 'https://example.com/a.png', fit: 'contain' },
          { type: 'table', rows: [['a', 'b']] },
          { type: 'line', x: 0, y: 0, w: 100, h: 0, end: 'arrow' },
        ],
        anims: [],
      },
    ],
  };
  const d = normalizeDeck(old);
  const again = normalizeDeck(JSON.parse(deckText(d)));
  ok(JSON.stringify(again) === JSON.stringify(d), 'a deck made before reads back the same');
  const t = deckText(d);
  ok(!/"(footer|guides|crop|adjust|merges|fills|key|nofooter)"/.test(t), 'and gains none of the new fields');
}

// ---- Morph: which parts two slides share -----------------------------------------------------------------------
{
  const RT = slidesRuntime({ document: {} } as unknown as Window, {});
  const d = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'circle', type: 'shape', shape: 'ellipse', x: 100, y: 100, w: 100, h: 100 },
          { id: 'title1', type: 'text', text: 'Revenue', x: 80, y: 40, w: 600, h: 80 },
          { id: 'logo1', type: 'image', src: 'https://example.com/logo.png', name: 'Logo' },
          { id: 'gone', type: 'text', text: 'Only here' },
        ],
      },
      {
        transition: 'morph',
        els: [
          { id: 'circle2', key: 'circle', type: 'shape', shape: 'ellipse', x: 900, y: 400, w: 200, h: 200, fill: 'c3' },
          { id: 'title2', type: 'text', text: 'Revenue', x: 80, y: 600, w: 300, h: 60 },
          { id: 'logo2', type: 'image', src: 'https://example.com/other.png', name: 'Logo' },
          { id: 'new', type: 'text', text: 'Only there' },
        ],
      },
    ],
  });
  const pairs = RT.morphPairs(d.slides[0], d.slides[1]).map(([a, b]) => `${a.id}>${b.id}`);
  ok(pairs.includes('circle>circle2'), 'Morph pairs a part with its copy (by its key)');
  ok(pairs.includes('logo1>logo2'), 'by its name');
  ok(pairs.includes('title1>title2'), 'by its words');
  ok(pairs.length === 3 && !pairs.some((p) => p.includes('gone') || p.includes('new')), 'and leaves the rest to fade');
  // The grid of slides (in the slideshow, the presenter's view, a deck's page) numbers its thumbnails, and only them.
  ok(!RT.css.includes('.ns-thumb span{') && RT.css.includes('.ns-thumb>span{'), 'a thumbnail’s number does not restyle the words and equations of the slide in it');
  ok(RT.css.includes('.ns-print.ns-onscreen{display:block}') && RUNTIME_SRC.includes('ns-onscreen'), 'a page made to be printed shows its slides on the screen too, fitted and loaded before it prints');
}

// ---- the PowerPoint file -----------------------------------------------------------------------------------------
{
  const d: Deck = normalizeDeck({
    theme: 'paper',
    footer: { num: true, text: 'Acme', date: 'today', skipTitle: true },
    slides: [
      { layout: 'title', title: 'Hello' },
      {
        els: [
          {
            id: 'grp',
            type: 'group',
            x: 100,
            y: 100,
            rot: 15,
            opacity: 0.5,
            els: [
              { type: 'shape', shape: 'rect', x: 0, y: 0, w: 200, h: 100, text: 'Inside a group' },
              { type: 'text', x: 220, y: 0, w: 200, h: 100, text: 'Also inside', role: 'title' },
            ],
            anim: 'fade',
          },
          { id: 'ic', type: 'icon', icon: 'star', paths: [['path', { d: 'M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z' }]], x: 600, y: 100, color: 'c2' },
          { id: 'eq1', type: 'math', tex: '\\frac{a}{b}', x: 600, y: 300, w: 300, h: 100 },
          { id: 'eq2', type: 'math', tex: 'x^2 + y^2 = z^2', x: 600, y: 420, w: 300, h: 100 },
          { id: 'vid', type: 'video', src: 'https://youtu.be/dQw4w9WgXcQ', x: 100, y: 400, w: 320, h: 180 },
          { id: 'pic', type: 'image', src: 'naget-asset:0123456789abcdef', x: 900, y: 100, w: 200, h: 100, crop: { l: 0.1, t: 0.2, r: 0.3, b: 0 }, adjust: { bright: 20, contrast: -10, gray: true, blur: 4 } },
          {
            id: 'tbl',
            type: 'table',
            x: 100,
            y: 600,
            w: 600,
            h: 100,
            rows: [
              ['a', 'b', 'c'],
              ['d', 'e', 'f'],
            ],
            merges: [{ r: 0, c: 0, rs: 2, cs: 2 }],
            fills: { '1,2': '#ff0000' },
          },
        ],
      },
      { transition: 'morph', els: [{ id: 'ic2', key: 'ic', type: 'icon', icon: 'star', paths: [['path', { d: 'M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z' }]], x: 100, y: 500, w: 300, h: 300 }] },
    ],
  });
  const pictures = (src: string) => (src === 'naget-asset:0123456789abcdef' || src.startsWith('https://i.ytimg.com/') ? dot : null);
  const bare = pptxFile(d, { title: 'T', picture: pictures });
  const s1 = slideXml(bare, 1);
  const s2 = slideXml(bare, 2);
  const s3 = slideXml(bare, 3);
  ok(!s1.includes('type="slidenum"') && s2.includes('type="slidenum"') && s2.includes('type="datetime4"') && s2.includes('>Acme<'), 'the footer and slide number are fields on each slide but the title slide');
  ok(/<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="Group \d+"\/>/.test(s2) && s2.includes('<a:chOff x="0" y="0"/>') && s2.includes(`rot="${15 * 60000}"`), 'a group is a PowerPoint group, turned');
  ok(s2.includes('Inside a group') && !/<p:grpSp>.*<p:ph type="title"\/>/.test(s2), 'its parts are in it (no title placeholder inside a group)');
  ok(/<a:alpha val="50000"\/>/.test(s2), 'a see-through group’s parts are see-through');
  ok(s2.includes('svgBlip') && /media\/image\d+\.svg/.test(new Zip(bare).read('ppt/slides/_rels/slide2.xml.rels')?.toString() ?? ''), 'an icon goes as SVG with a picture beside it');
  const svg = new Zip(bare).read('ppt/media/image2.svg')?.toString() ?? new Zip(bare).read('ppt/media/image1.svg')?.toString() ?? '';
  ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && svg.includes(`stroke="#${'16A394'}"`) && svg.includes('<path d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z"/>'), 'in the theme’s colour, its own lines');
  ok((new Zip(bare).read('[Content_Types].xml')?.toString() ?? '').includes('Extension="svg"'), 'the file says what SVG is');
  ok(s2.includes('\\frac{a}{b}') && s2.includes('Cambria Math'), 'an equation without its picture goes as its LaTeX');
  ok(s2.includes('https://www.youtube.com/watch?v=dQw4w9WgXcQ') || (new Zip(bare).read('ppt/slides/_rels/slide2.xml.rels')?.toString() ?? '').includes('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'a video is its still linked to it');
  ok(s2.includes('<a:srcRect l="10000" t="20000" r="30000" b="0"/>'), 'a cropped picture is cropped in PowerPoint');
  ok(s2.includes('<a:grayscl/>') && s2.includes('<a:lum bright="20000" contrast="-10000"/>') && s2.includes('<a:blur rad='), 'its colours as PowerPoint’s picture effects');
  ok(s2.includes('gridSpan="2" rowSpan="2"') && s2.includes('hMerge="1"') && s2.includes('vMerge="1"') && s2.includes('FF0000'), 'merged cells are merged, a cell’s fill is its own');
  ok(s3.includes('<p159:morph option="byObject"/>') && s3.includes('<mc:Fallback><p:transition') && s3.includes('<p:fade/>'), 'Morph is PowerPoint’s Morph, a fade where it has none');
  ok(s2.includes('name="!!ic"') && s3.includes('name="!!ic"'), 'a part and its copy are named alike for Morph');
  ok(s2.includes(`spid="${/<p:cNvPr id="(\d+)" name="Group/.exec(s2)?.[1]}"`), 'a group’s animation is the group’s');
  const png: Picture = { ...dot, w: 600, h: 200 };
  const made = pptxFile(d, {
    title: 'T',
    picture: pictures,
    renders: new Map([
      ['math:eq1', png],
      ['icon:ic', dot],
    ]),
  });
  const m2 = slideXml(made, 2);
  ok(!m2.includes('\\frac{a}{b}</a:t>') && m2.includes('descr="\\frac{a}{b}"') && m2.includes('x^2 + y^2 = z^2'), 'an equation with its picture goes as that picture, its LaTeX as its description');
  const file = path.join(tmp, 'deck.pptx');
  fs.writeFileSync(file, bare);
  const read = (await extractText(file))?.text ?? '';
  ok(read.includes('Inside a group') && read.includes('Also inside'), 'the PowerPoint file reads back with the words in its groups');
}

// ---- videos from a device ------------------------------------------------------------------------------------------
{
  // A small MP4's start (its "ftyp" box), then bytes: what the store checks a video by.
  const film = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(12), Buffer.alloc(3000, 7)]);
  const piece = (id: string, offset: number, total: number, body: Buffer) =>
    app.inject({ method: 'POST', url: `/api/pages/videos?upload=${id}&offset=${offset}&total=${total}`, payload: body, headers: { 'content-type': 'application/octet-stream', host: 'app.test' } });
  const first = await piece('testupload1', 0, film.length, film.subarray(0, 1000));
  ok(first.statusCode === 200 && first.json().received === 1000, 'a video comes in pieces: each says how much has come');
  ok((await piece('testupload1', 500, film.length, film.subarray(500, 1000))).statusCode === 409, 'a piece out of step is refused');
  await piece('testupload1', 0, film.length, film.subarray(0, 1000));
  const last = await piece('testupload1', 1000, film.length, film.subarray(1000));
  const src = String(last.json().src ?? '');
  ok(last.statusCode === 200 && /^naget-video:[a-f0-9]{40}$/.test(src) && last.json().mime === 'video/mp4' && last.json().bytes === film.length, 'the last piece gives the kept video’s source');
  const sha = src.slice('naget-video:'.length);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');
  ok((await piece('testupload2', 0, png.length, png)).statusCode === 415, 'a file that is no video is refused');
  ok((await piece('testupload3', 0, 300 * 1024 * 1024, film)).statusCode === 413, 'a video over 200 MB is refused');
  // Served with ranges, as a player seeks.
  const ranged = await app.inject({ method: 'GET', url: `/api/pages/videos/${sha}`, headers: { range: 'bytes=10-19', host: 'app.test' } });
  ok(ranged.statusCode === 206 && ranged.headers['content-range'] === `bytes 10-19/${film.length}` && ranged.rawPayload.equals(film.subarray(10, 20)) && ranged.headers['content-type'] === 'video/mp4', 'a kept video is served a part at a time');
  // In a deck: kept while a version shows it; its page plays it from a signed address that needs no sign-in.
  const deck = normalizeDeck({ slides: [{ els: [{ id: 'clip', type: 'video', src, x: 100, y: 100, w: 640, h: 360, muted: true, loop: true, start: 2 }, { type: 'video', src: '/home/someone/clip.mp4' }] }] });
  const vids = deck.slides[0].els.filter((e) => e.type === 'video');
  ok(vids.length === 1 && vids[0].type === 'video' && vids[0].src === src && deckVideos(deck)[0] === src, 'a deck keeps a kept video, and nothing else that is not a video’s address');
  const made = (await req('POST', '/api/pages', { kind: 'slides', title: 'Film', model: deck })).json().page.id as string;
  const page = deckPage(db, (await req('GET', `/api/pages/${made}`)).json().model as Deck, 'Film');
  const signed = /"src":"(\/pg\/video\/[a-f0-9]{40}\/[A-Za-z0-9_-]{32})"/.exec(page)?.[1] ?? '';
  ok(!!signed && !page.includes('"src":"naget-video:'), 'its page plays it from a signed address of this server');
  ok((await app.inject({ method: 'GET', url: signed, headers: { host: 'app.test' } })).statusCode === 200 && (await app.inject({ method: 'GET', url: `${signed.slice(0, -4)}AAAA`, headers: { host: 'app.test' } })).statusCode === 404, 'which works signed, and only signed');
  db.prepare('update page_videos set created_at = 1').run();
  sweepAssets(db);
  ok(!!getVideo(db, sha), 'a video a deck shows stays');
  // The deck's files: PowerPoint gets the video itself, the web page has it inside.
  const pptx = (await req('GET', `/api/pages/${made}/export?format=pptx`)).rawPayload;
  const z = new Zip(pptx);
  const s1 = slideXml(pptx, 1);
  const rels = z.read('ppt/slides/_rels/slide1.xml.rels')?.toString() ?? '';
  ok(z.read('ppt/media/media1.mp4')?.equals(film) === true && /Extension="mp4" ContentType="video\/mp4"/.test(z.read('[Content_Types].xml')?.toString() ?? ''), 'the video goes into the PowerPoint file as it is');
  ok(/relationships\/video" Target="\.\.\/media\/media1\.mp4"/.test(rels) && /2007\/relationships\/media" Target="\.\.\/media\/media1\.mp4"/.test(rels), 'linked and embedded, as PowerPoint links its videos');
  ok(s1.includes('<a:videoFile r:link=') && s1.includes('<p14:media') && s1.includes('<p14:trim st="2000"/>') && s1.includes('action="ppaction://media"'), 'as PowerPoint’s own video, from where it starts');
  ok(/<p:video><p:cMediaNode vol="80000" mute="1"><p:cTn id="\d+" repeatCount="indefinite"/.test(s1), 'played on a click, without sound and again and again as the deck says');
  const html = (await req('GET', `/api/pages/${made}/export?format=html`)).body;
  ok(html.includes(`data:video/mp4;base64,${film.toString('base64').slice(0, 40)}`), 'the web page (a file on its own) has the video inside it');
  // The PowerPoint file opened again as a deck: its video kept by the app once more, as the same video.
  const opened = await req('POST', '/api/pages/import', { name: 'Film.pptx', data: pptx.toString('base64') });
  const reopened = opened.statusCode === 200 ? ((await req('GET', `/api/pages/${opened.json().page.id}`)).json() as { page: { kind: string }; model: Deck }) : null;
  const vid = reopened?.model.slides[0].els.find((e) => e.type === 'video');
  ok(reopened?.page.kind === 'slides' && vid?.type === 'video' && vid.src === src && vid.muted !== true && vid.start === 2, 'a PowerPoint file opens as a deck, its video kept by the app (the same one)');
  // Gone again, so only the decks below show the video.
  if (opened.statusCode === 200) await app.inject({ method: 'DELETE', url: `/api/pages/${opened.json().page.id}`, headers: { host: 'app.test' } });
  const old = await req('POST', '/api/pages/import', { name: 'Old.ppt', data: Buffer.from('not a deck').toString('base64') });
  ok(old.statusCode === 415 && /\.pptx/.test(old.json().error), 'a PowerPoint 97–2003 file is refused with how to open it');
  const broken = await req('POST', '/api/pages/import', { name: 'Broken.pptx', data: Buffer.from('not a zip at all').toString('base64') });
  ok(broken.statusCode === 422, 'a file that is no PowerPoint file says it could not be read');
  // An agent's video file, kept with its deck.
  fs.writeFileSync(path.join(tmp, 'clip.mp4'), film);
  const fromAgent = await run('save_slides', { title: 'Agent film', slides: [{ els: [{ type: 'video', src: 'clip.mp4' }, { type: 'video', src: 'missing.mp4' }] }] });
  const agentDeck = (await req('GET', `/api/pages/${idOf(fromAgent.text)}`)).json().model as Deck;
  ok(agentDeck.slides[0].els.length === 1 && agentDeck.slides[0].els[0].type === 'video' && agentDeck.slides[0].els[0].src === src, 'an agent’s video file is kept with its deck');
  ok(!!fromAgent.text?.includes('missing.mp4') && fromAgent.text.includes('left out'), 'one that is not there is said to be left out');
  ok((await run('get_page', { id: idOf(fromAgent.text) })).text?.includes('naget-video:') === true, 'get_page gives the kept video by its source');
  // A video nothing shows any more goes a day after.
  await req('POST', `/api/pages/${made}/versions`, { model: { slides: [{ layout: 'title', title: 'No film' }] } });
  await req('POST', `/api/pages/${idOf(fromAgent.text)}/versions`, { model: { slides: [{ layout: 'title', title: 'No film' }] } });
  for (const p of [made, idOf(fromAgent.text)]) db.prepare('delete from page_asset_refs where page_id = ? and version = 1').run(p);
  db.prepare('update page_videos set created_at = 1').run();
  sweepAssets(db);
  ok(!getVideo(db, sha), 'a video nothing shows goes after a day');
}

// ---- comments on slides ------------------------------------------------------------------------------------------
{
  const d = normalizeDeck({
    slides: [
      {
        id: 's1',
        els: [{ id: 'box', type: 'shape', text: 'Hub', x: 100, y: 100, w: 200, h: 100, fill: 'accent', color: 'accentFg' }],
        comments: [
          { id: 'c1', by: 'user', text: 'Bigger, please', at: 1700000000000, el: 'box', replies: [{ by: 'agent', text: 'Done', at: 1700000001000 }] },
          { id: 'c2', text: 'On the slide', x: 9000, y: 30 },
          { id: 'c3', text: 'On a part that is not here', el: 'nope' },
          { id: 'c4', text: '   ' },
          { id: 'c5', text: '<script>alert(1)</script>', by: 'robot', resolved: true },
        ],
      },
      { id: 's2', els: [], comments: [{ id: 'c1', text: 'Same id on another slide' }] },
    ],
  });
  const [c1, c2, c3, c5] = d.slides[0].comments ?? [];
  ok(c1.el === 'box' && c1.replies?.[0].by === 'agent' && c1.replies[0].text === 'Done', 'a comment is on a part of its slide, with its replies');
  ok(c2.el === undefined && c2.x === 1280 && c2.y === 30 && c3.el === undefined, 'or on the slide, its mark on the slide; a part not there leaves it on the slide');
  ok(d.slides[0].comments?.length === 4 && c5.by === 'user' && c5.resolved === true && c5.text === '<script>alert(1)</script>', 'an empty one is left out; words stay words, its writer the user or an agent');
  ok(d.slides[1].comments?.[0].id !== 'c1', 'a comment’s id is the deck’s once');
  ok(JSON.stringify(normalizeDeck(JSON.parse(deckText(d)))) === JSON.stringify(d), 'a deck with comments reads back the same');
  // Agents answer, resolve and add; the user's stay as they were.
  const made = idOf((await run('save_slides', { title: 'Reviewed', slides: d.slides })).text);
  const kept = (await req('GET', `/api/pages/${made}`)).json().model as Deck;
  ok(!kept.slides[0].comments?.length, 'an agent’s own list of comments in a new deck is not taken');
  await req('POST', `/api/pages/${made}/versions`, { model: d });
  const got = (await run('get_page', { id: made })).text ?? '';
  ok(got.includes('Comments (4 open, 1 resolved)') && got.includes('c1 (open) on slide 1 [s1], on its part box') && got.includes('“Bigger, please”') && got.includes('reply by an agent'), 'get_page lists the comments, each on its slide and part');
  const sent = (await req('GET', `/api/pages/${made}`)).json().model as Deck;
  const answered = await run('save_slides', {
    id: made,
    title: 'Reviewed',
    // The deck sent back with a slide's comments changed by hand: not taken.
    slides: [{ ...sent.slides[0], comments: [] }, sent.slides[1]],
    comments: [
      { id: 'c1', reply: 'Made it twice as large', resolve: true },
      { id: 'c2', delete: true },
      { slide: 2, text: 'Is this slide needed?' },
      { slide: 's1', el: 'box', text: 'The colour is new' },
      { slide: 1, el: 'ghost', text: 'Nowhere' },
      { id: 'zzz', reply: 'Nothing to answer' },
      { text: 'No slide' },
    ],
  });
  const after = (await req('GET', `/api/pages/${made}`)).json().model as Deck;
  const a1 = after.slides[0].comments ?? [];
  ok(a1.find((c) => c.id === 'c1')?.resolved === true && a1.find((c) => c.id === 'c1')?.replies?.at(-1)?.text === 'Made it twice as large' && !a1.some((c) => c.id === 'c2'), 'an agent replies, resolves and deletes comments by their ids');
  ok(a1.some((c) => c.by === 'agent' && c.el === 'box' && c.text === 'The colour is new') && after.slides[1].comments?.some((c) => c.by === 'agent' && c.text === 'Is this slide needed?'), 'and adds its own, on a slide or a part of it');
  ok(a1.some((c) => c.text === 'Nowhere' && !c.el) && a1.some((c) => c.id === 'c3'), 'one on a part that is not there is on its slide; the others stay as they were');
  ok(!!answered.text?.includes('no comment zzz') && answered.text.includes('needs its slide') && answered.text.includes('has no part ghost'), 'what could not be done is said');
  // In PowerPoint: the open ones, as its comments, replies threaded.
  const z = new Zip(pptxFile(after, { title: 'T', picture: () => null }));
  const authors = z.read('ppt/commentAuthors.xml')?.toString() ?? '';
  const cm = z.read('ppt/comments/comment1.xml')?.toString() ?? '';
  ok(/<p:cmAuthor id="0" name="You" initials="Y" lastIdx="\d+"/.test(authors) && authors.includes('name="Agent"'), 'PowerPoint’s comments: by You or the Agent');
  ok(cm.includes('<p:text>The colour is new</p:text>') && cm.includes('&lt;script&gt;') === false && !cm.includes('Made it twice as large'), 'the open ones, not the resolved');
  ok((z.read('ppt/slides/_rels/slide1.xml.rels')?.toString() ?? '').includes('relationships/comments') && (z.read('[Content_Types].xml')?.toString() ?? '').includes('presentationml.comments+xml'), 'each slide’s comments linked as PowerPoint links them');
  const threaded = normalizeDeck({ slides: [{ els: [], comments: [{ id: 'q', text: 'Why?', replies: [{ by: 'agent', text: 'Because' }] }] }] });
  const cq = new Zip(pptxFile(threaded, { title: 'T', picture: () => null })).read('ppt/comments/comment1.xml')?.toString() ?? '';
  ok(/<p:cm authorId="1"[^>]*><p:pos [^>]*\/><p:text>Because<\/p:text><p:extLst><p:ext uri="\{C676402C-5697-4E1C-873F-D02D1690AC5C\}"><p15:threadingInfo [^>]*><p15:parentCm authorId="0" idx="1"\/>/.test(cq), 'a reply is threaded to its comment');
}

// ---- connectors -------------------------------------------------------------------------------------------------
{
  const d = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'a', type: 'shape', shape: 'rect', x: 100, y: 100, w: 200, h: 100 },
          { id: 'b', type: 'shape', shape: 'ellipse', x: 600, y: 300, w: 200, h: 100 },
          { id: 'c', type: 'shape', shape: 'rect', x: 100, y: 500, w: 200, h: 100 },
          { id: 'j1', type: 'connector', from: 'a', to: 'b', end: 'arrow' },
          { id: 'j2', type: 'line', from: { el: 'a', at: 'b' }, to: { el: 'c', at: 't' }, route: 'elbow' },
          { id: 'j3', type: 'line', from: 'ghost', to: 'j1', x: 10, y: 10, w: 50, h: 0 },
          { id: 'j4', type: 'line', from: { el: 'a', at: 'b' }, to: { el: 'b', at: 'l' }, route: 'elbow' },
        ],
      },
    ],
  });
  const els = d.slides[0].els;
  const j1 = els.find((e) => e.id === 'j1') as Extract<El, { type: 'line' }>;
  const j2 = els.find((e) => e.id === 'j2') as Extract<El, { type: 'line' }>;
  const j3 = els.find((e) => e.id === 'j3') as Extract<El, { type: 'line' }>;
  ok(j1.from?.at === 'r' && j1.to?.at === 'l' && j1.x === 300 && j1.y === 150 && j1.w === 300 && j1.h === 200, 'a connector between two parts sticks to the sides that face each other, its ends where they are');
  ok(j2.route === 'elbow' && j2.x === 200 && j2.y === 200 && j2.w === 0 && j2.h === 300, 'an elbow connector keeps the sides it was given');
  ok(!j3.from && !j3.to && j3.x === 10 && j3.w === 50, 'an end on no part (or on a line) is free');
  // A part moved takes its connectors along.
  const moved = { ...d.slides[0], els: d.slides[0].els.map((e) => (e.id === 'b' ? { ...e, x: 700, y: 0, rot: 90 } : e)) };
  const again = reconnect(moved).els.find((e) => e.id === 'j1') as Extract<El, { type: 'line' }>;
  ok(near(again.x + again.w, 800) && near(again.y + again.h, -50), 'a part moved and turned takes the end stuck to it along');
  ok(JSON.stringify(normalizeDeck(JSON.parse(deckText(d)))) === JSON.stringify(d), 'a deck with connectors reads back the same');
  // In PowerPoint: connectors stuck to the shapes, as its own.
  const x = slideXml(pptxFile(d, { title: 'T', picture: () => null }), 1);
  const idOf2 = (name: string) => new RegExp(`<p:cNvPr id="(\\d+)" name="${name}"`).exec(x)?.[1];
  const a = /<p:cNvPr id="(\d+)" name="Shape 1"\/>/.exec(x)?.[1];
  const b = /<p:cNvPr id="(\d+)" name="Shape 2"\/>/.exec(x)?.[1];
  const c = /<p:cNvPr id="(\d+)" name="Shape 3"\/>/.exec(x)?.[1];
  ok(!!idOf2('Connector \\d+') && x.includes(`<a:stCxn id="${a}" idx="3"/><a:endCxn id="${b}" idx="2"/>`) && x.includes('prst="straightConnector1"'), 'a straight connector is stuck to the right of a rectangle and the left of an oval');
  ok(x.includes(`<a:stCxn id="${a}" idx="2"/><a:endCxn id="${c}" idx="0"/>`) && /<a:xfrm rot="5400000"[^>]*><a:off [^>]*\/><a:ext cx="2857500" cy="0"\/><\/a:xfrm><a:prstGeom prst="bentConnector3">/.test(x), 'an elbow from a bottom to a top is PowerPoint’s elbow turned a quarter');
  ok(/<a:xfrm rot="5400000"[^>]*><a:off [^>]*\/><a:ext [^>]*\/><\/a:xfrm><a:prstGeom prst="bentConnector2">/.test(x), 'one from a bottom to a side bends once');
  // An agent's connector.
  const saved = await run('save_slides', { title: 'Flow', slides: [{ els: [{ id: 'p', type: 'shape', x: 100, y: 300, w: 200, h: 100, text: 'Plan' }, { id: 'q', type: 'shape', x: 700, y: 300, w: 200, h: 100, text: 'Do' }, { type: 'connector', from: 'p', to: 'q', end: 'arrow', route: 'elbow' }] }] });
  const flow = (await req('GET', `/api/pages/${idOf(saved.text)}`)).json().model as Deck;
  const fl = flow.slides[0].els.find((e) => e.type === 'line') as Extract<El, { type: 'line' }>;
  ok(fl.from?.el === 'p' && fl.to?.el === 'q' && fl.x === 300 && fl.y === 350 && fl.w === 400 && fl.route === 'elbow', 'an agent joins two parts with a connector by their ids');
}

// ---- find and replace in charts and equations -----------------------------------------------------------------
{
  const d = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'ch', type: 'chart', title: 'Sales North', labels: ['North', 'South'], series: [{ name: 'North shops', values: [1, 2] }] },
          { id: 'eq', type: 'math', tex: '\\frac{north}{2}' },
        ],
      },
    ],
  });
  const o = { matchCase: false, wholeWord: false, regex: false };
  const hits = findInDeck(d, 'north', o);
  ok(
    hits.length === 4 && hits.some((h) => h.where === 'chart' && h.field === 'title') && hits.some((h) => h.field === 'label' && h.n === 0) && hits.some((h) => h.field === 'series' && h.n === 0) && hits.some((h) => h.where === 'tex' && h.id === 'eq'),
    'Find sees a chart’s title, labels and series’ names, and an equation’s LaTeX',
  );
  const one = replaceHit(d, hits.find((h) => h.field === 'label')!, 'north', 'Nord', o);
  const ch1 = one.slides[0].els[0] as Extract<El, { type: 'chart' }>;
  ok(ch1.labels[0] === 'Nord' && ch1.title === 'Sales North', 'Replace changes the one match, in a chart’s label');
  const all = replaceAllInDeck(d, 'north', 'Nord', o);
  const ch2 = all.deck.slides[0].els[0] as Extract<El, { type: 'chart' }>;
  const eq2 = all.deck.slides[0].els[1] as Extract<El, { type: 'math' }>;
  ok(all.count === 4 && ch2.title === 'Sales Nord' && ch2.labels[0] === 'Nord' && ch2.series[0].name === 'Nord shops' && eq2.tex === '\\frac{Nord}{2}', 'Replace all changes them everywhere, the LaTeX too');
}

// ---- the deck's own page, and agents ------------------------------------------------------------------------------
{
  const withMath = normalizeDeck({ slides: [{ els: [{ type: 'math', tex: 'a^2' }, { type: 'math', tex: '\\mathbb{R}^n' }] }] });
  const page = deckPage(db, withMath, 'Maths');
  ok(!/https?:\/\/[^"'\s]*katex/i.test(page) && !page.includes('katex.min.js'), 'a deck’s page loads no KaTeX from the web');
  ok(page.includes('id="n-math"') && page.includes('class=\\"katex') && page.indexOf('id="n-math"') < page.indexOf('.boot('), 'its equations come drawn by the server’s own KaTeX, before its slides are drawn');
  ok(
    /@font-face\{[^}]*font-family:KaTeX_Main[^}]*url\(data:font\/woff2;base64,/.test(page) && /@font-face\{[^}]*font-family:KaTeX_AMS[^}]*url\(data:font\/woff2;base64,/.test(page) && !/@font-face\{[^}]*KaTeX_Fraktur/.test(page),
    'with the fonts they use inside it, and only those',
  );
  ok(!deckPage(db, normalizeDeck({ slides: [{ layout: 'title', title: 'x' }] }), 'Plain').includes('id="n-math"'), 'a deck without them has none');

  const made = await run('save_slides', {
    title: 'Icons',
    footer: { num: true, text: 'Q3' },
    guides: { x: [640] },
    slides: [
      {
        els: [
          { type: 'icon', icon: 'rocket', x: 100, y: 100 },
          { type: 'icon', icon: 'not-an-icon-at-all' },
          {
            type: 'group',
            els: [
              { type: 'text', text: 'A', x: 10, y: 10, w: 100, h: 40 },
              { type: 'math', tex: '\\sqrt{2}', x: 200, y: 10 },
            ],
          },
        ],
      },
      { transition: 'morph', els: [{ type: 'video', src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }] },
    ],
  });
  const id = idOf(made.text);
  ok(id && made.text?.includes('not-an-icon-at-all') && made.text.includes('left out'), 'an icon by a name Lucide has not is said to be left out');
  const deck = (await req('GET', `/api/pages/${id}`)).json().model as Deck;
  const els = deck.slides[0].els;
  ok(els[0].type === 'icon' && els[0].paths.length > 1 && els.length === 2, 'an agent’s icon by name gets its lines');
  ok(deck.footer?.num && deck.footer.text === 'Q3' && deck.guides?.x?.[0] === 640, 'save_slides keeps the footer and the guides');
  ok(els[1].type === 'group' && els[1].els[1].type === 'math', 'and groups with equations in them');
  const got = (await run('get_page', { id })).text ?? '';
  ok(got.includes('its number') && got.includes('"Q3"') && got.includes('group of 2') && got.includes('"paths"'), 'get_page tells of the footer, the groups and the icons’ lines');
  const help = String(tools.save_slides.description);
  ok(
    ['icon {icon:', 'math {tex:', 'video {src:', 'group {els:', 'crop:', 'adjust:', 'merges:', 'morph', 'footer {num:', 'guides {x:', 'key', 'POST /api/pages/import'].every((w) => help.includes(w)),
    'save_slides tells agents of the new parts and settings',
  );
  const schema = tools.save_slides.inputSchema as { properties: Record<string, unknown> };
  ok(!!schema.properties.footer && !!schema.properties.guides, 'and its schema takes the footer and the guides');
  const pptx = await req('GET', `/api/pages/${id}/export?format=pptx`);
  ok(pptx.statusCode === 200 && slideXml(pptx.rawPayload, 1).includes('svgBlip'), 'the deck exports as PowerPoint, its icons in it');
  {
    // The faces its words show in, kept as if fetched before (KaTeX's, under their names): the file carries them
    // compressed, and the export says so.
    const faces = deckFaces(normalizeDeck((await req('GET', `/api/pages/${id}`)).json().model));
    const dir = path.join(process.env.DATA_DIR!, 'pages', 'fonts', 'ttf');
    fs.mkdirSync(dir, { recursive: true });
    const kept = faces.map((f) => path.join(dir, `${crypto.createHash('sha256').update(faceKey(f)).digest('hex').slice(0, 24)}.ttf`));
    faces.forEach((f, i) => fs.writeFileSync(kept[i], fs.readFileSync(path.join(process.cwd(), 'node_modules/katex/dist/fonts', f.bold ? 'KaTeX_Main-Bold.ttf' : 'KaTeX_Main-Regular.ttf'))));
    const withFonts = await req('GET', `/api/pages/${id}/export?format=pptx`);
    const note = String(withFonts.headers['x-export-note'] ?? '');
    ok(
      faces.length > 0 && note.startsWith('Fonts inside it: ') && note.endsWith(', compressed as PowerPoint keeps them.') && new Zip(withFonts.rawPayload).names().filter((n) => n.startsWith('ppt/fonts/')).length === faces.length,
      `a PowerPoint file says which fonts went inside it, and that they are compressed: ${note}`,
    );
    ok((await run('export_page', { id, format: 'pptx' })).text?.includes(note), 'and export_page says the same');
    for (const k of kept) fs.rmSync(k, { force: true });
  }
  if (canCapture()) {
    const z = new Zip(pptx.rawPayload);
    const rels = z.read('ppt/slides/_rels/slide1.xml.rels')?.toString() ?? '';
    const pngs = [...rels.matchAll(/media\/(image\d+\.png)/g)].map((m) => z.read(`ppt/media/${m[1]}`)?.length ?? 0);
    ok(
      pngs.some((n) => n > 500),
      'with a browser here, an icon’s PNG beside its SVG is a picture of it',
    );
    const x1 = slideXml(pptx.rawPayload, 1);
    ok(x1.includes('descr="\\sqrt{2}"') && !x1.includes('<a:t>\\sqrt{2}</a:t>'), 'with a browser here, an equation goes into PowerPoint as its picture, drawn by the server’s KaTeX');
    // The slides as pictures.
    const one = await req('GET', `/api/pages/${id}/export?format=png&slide=2`);
    const png = one.rawPayload;
    ok(one.statusCode === 200 && one.headers['content-type'] === 'image/png' && png.readUInt32BE(0) === 0x89504e47 && png.readUInt32BE(16) === 2560 && png.readUInt32BE(20) === 1440, 'a slide exports as a picture, twice its size');
    const all = await req('GET', `/api/pages/${id}/export?format=png`);
    const zip = new Zip(all.rawPayload);
    ok(all.statusCode === 200 && /zip/.test(String(all.headers['content-type'])) && !!zip.read('slide-01.png') && !!zip.read('slide-02.png') && !zip.read('slide-03.png'), 'every slide exports as pictures, in a zip');
    ok((await req('GET', `/api/pages/${id}/export?format=png&slide=9`)).statusCode === 404, 'a slide that is not there has no picture');
  } else ok((await req('GET', `/api/pages/${id}/export?format=png`)).statusCode === 503, 'without a browser, pictures of slides say what they need');
  const plain = idOf((await run('save_page', { title: 'Not a deck', html: '<!doctype html><p>x</p>' })).text);
  ok((await req('GET', `/api/pages/${plain}/export?format=png`)).statusCode === 400, 'only slides export as pictures');

  // A video's still, fetched on the server (YouTube's or Vimeo's) and kept as a picture.
  ok((await req('POST', '/api/pages/video-still', { url: 'https://example.com/clip.mp4' })).statusCode === 400, 'the still of a video is fetched only for YouTube and Vimeo addresses');
  const still = await req('POST', '/api/pages/video-still', { url: 'https://vimeo.com/76979871' });
  if (still.statusCode === 200) {
    const src = String(still.json().src);
    ok(/^naget-asset:[a-f0-9]{16,64}$/.test(src) && (await req('GET', `/api/pages/assets/${src.slice(12)}`)).statusCode === 200, 'a Vimeo video’s still is kept as a picture');
  } else console.log(`(Vimeo could not be reached here: ${still.statusCode})`);

  // A shape an agent adds with words has them in its middle (as PowerPoint's do); one it sends back keeps its look.
  const shapes = idOf(
    (await run('save_slides', { title: 'Shapes', slides: [{ els: [{ type: 'shape', shape: 'ellipse', text: 'Hub' }, { type: 'shape', text: 'Left', align: 'left', valign: 'top' }, { type: 'shape', shape: 'rect' }] }] })).text,
  );
  const sd = (await req('GET', `/api/pages/${shapes}`)).json().model as Deck;
  const [hub, left, bare] = sd.slides[0].els as Extract<El, { type: 'shape' }>[];
  ok(hub.align === 'center' && hub.valign === 'middle', 'a shape an agent adds with words has them in its middle');
  ok(left.align === 'left' && left.valign === 'top' && bare.align === undefined, 'unless it says where; a shape without words gains nothing');
  await run('save_slides', { id: shapes, title: 'Shapes', slides: [{ ...sd.slides[0], els: [{ ...hub, align: undefined, valign: undefined }, left, bare] }] });
  const sd2 = (await req('GET', `/api/pages/${shapes}`)).json().model as Deck;
  ok(sd2.slides[0].els[0].type === 'shape' && sd2.slides[0].els[0].align === undefined, 'a shape sent back by its id keeps its look (an older one’s words stay where they were)');

  // Words made smaller to fit, as the printed page fits them, go into PowerPoint (the page must lay its slides out to tell).
  if (canCapture()) {
    const long = idOf((await run('save_slides', { title: 'Long', slides: [{ els: [{ id: 'crowd', type: 'text', x: 80, y: 80, w: 300, h: 80, size: 40, fit: 'shrink', text: 'Far too many words for so small a box, which has to make them smaller to fit' }] }] })).text);
    const px = await req('GET', `/api/pages/${long}/export?format=pptx`);
    ok(/<a:normAutofit fontScale="\d+"\/>/.test(slideXml(px.rawPayload, 1)), 'with a browser here, words made smaller to fit go into PowerPoint that much smaller');
  }
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
