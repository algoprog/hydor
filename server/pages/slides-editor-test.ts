// Script tests for the slides editor's model and files: groups (made, fitted, turned, undone, as PowerPoint groups),
// icons (checked lines, named by an agent), equations, videos, pictures' crop and colours, merged table cells, the
// footer and slide numbers, guides, Morph (which parts two slides share, and PowerPoint's Morph), decks made before
// these that still read the same, and what agents are told and given. Through the routes and the save tool, with a
// stand-in for the session manager. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/slides-editor-test.ts
//   DATA_DIR=/tmp/hydor-test-slides-editor node dist/dev/slides-editor-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { Zip } from '../documents/zip.ts';
import { extractText } from '../documents/extract.ts';
import { canCapture } from '../capture/index.ts';
import { deckSources, deckText, fitGroup, footerOn, groupOf, isDeckText, normalizeDeck, scaleEls, turnedBox, ungroupEls, videoSrc, type Deck, type El, type GroupEl } from '../../shared/slides.ts';
import { slidesRuntime } from '../../shared/slides-runtime.ts';
import { pptxFile, type Picture } from './pptx.ts';
import { deckPage, KATEX_VERSION, lucideIcon } from './slides.ts';
import { pages } from './index.ts';

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

// ---- the deck's own page, and agents ------------------------------------------------------------------------------
{
  const withMath = normalizeDeck({ slides: [{ els: [{ type: 'math', tex: 'a^2' }] }] });
  const page = deckPage(db, withMath, 'Maths');
  ok(page.includes(`katex@${KATEX_VERSION}/dist/katex.min.js`) && page.indexOf('katex.min.js') < page.indexOf('id="n-deck"'), 'a deck with equations loads KaTeX before its slides are drawn');
  ok(!deckPage(db, normalizeDeck({ slides: [{ layout: 'title', title: 'x' }] }), 'Plain').includes('katex.min.js'), 'a deck without them does not');
  const katexPkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'node_modules/katex/package.json'), 'utf8')).version;
  ok(katexPkg === KATEX_VERSION, 'the page’s KaTeX is the app’s own version');

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
    ['icon {icon:', 'math {tex:', 'video {src:', 'group {els:', 'crop:', 'adjust:', 'merges:', 'morph', 'footer {num:', 'guides {x:', 'key'].every((w) => help.includes(w)),
    'save_slides tells agents of the new parts and settings',
  );
  const schema = tools.save_slides.inputSchema as { properties: Record<string, unknown> };
  ok(!!schema.properties.footer && !!schema.properties.guides, 'and its schema takes the footer and the guides');
  const pptx = await req('GET', `/api/pages/${id}/export?format=pptx`);
  ok(pptx.statusCode === 200 && slideXml(pptx.rawPayload, 1).includes('svgBlip'), 'the deck exports as PowerPoint, its icons in it');
  if (canCapture()) {
    const z = new Zip(pptx.rawPayload);
    const rels = z.read('ppt/slides/_rels/slide1.xml.rels')?.toString() ?? '';
    const pngs = [...rels.matchAll(/media\/(image\d+\.png)/g)].map((m) => z.read(`ppt/media/${m[1]}`)?.length ?? 0);
    ok(pngs.some((n) => n > 500), 'with a browser here, an icon’s PNG beside its SVG is a picture of it');
    const x1 = slideXml(pptx.rawPayload, 1);
    console.log(x1.includes('descr="\\sqrt{2}"') && !x1.includes('<a:t>\\sqrt{2}</a:t>') ? '(the equation went as a picture)' : '(the equation went as its LaTeX: KaTeX could not load here)');
  }
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
