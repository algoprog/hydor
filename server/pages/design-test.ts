// Script tests for designs (shared/design.ts): the sizes, every template at every size it is offered for (whole HTML,
// numbers that are numbers, fonts the designs load, inside its artboard), a design page's own stylesheet and script
// (once, however often it is saved), resizing's maths, curved words, brand kits, the requests and how_to_make's answer;
// and, where this computer has a Chromium, the design editor in a real browser (picking, moving with the mouse and
// snapping to the middle, the inspector's commands, grouping, undo, a resized copy, the HTML it gives back) and the
// files a design downloads as (PNG at 2×, see-through, JPG, a PDF of its own size). Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/design-test.ts
//   DATA_DIR=/tmp/hydor-test-design node dist/dev/design-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { curveGeom, DESIGN_SIZES, designBoards, designSize, fitBox, isDesignHtml, paletteFrom, contrast, sizeFrom, withDesignKit } from '../../shared/design.ts';
import { DESIGN_FONTS, fontsHref, fontByName } from '../../shared/design-fonts.ts';
import { DESIGN_TEMPLATES, templateBoard, templatePage, templatesFor } from '../../shared/design-templates.ts';
import { brandForAgent, cleanBrand } from '../../shared/design-brand.ts';
import { composeAsk } from '../../shared/content-asks.ts';
import { contentType } from '../../shared/content-types.ts';
import { openDb } from '../db.ts';
import { canCapture, closeCapture, withTab } from '../capture/index.ts';
import { DESIGN_EDITOR_SRC } from './design-editor.ts';
import { exportDesign } from './design-export.ts';
import { initBrand, readBrand, saveBrand } from './design-routes.ts';
import { HOW_TO_MAKE } from './content-types.ts';
import { pageVideoSources } from './page-videos.ts';
import { initAssets } from './assets.ts';
import { videoAddress } from './videos.ts';
import type { RunCtx } from '../features/types.ts';
import Fastify from 'fastify';
import { cleanWords, designWriteRoutes, readColours, setDesignHelperForTests } from '../write/design.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- sizes ---------------------------------------------------------------------------------------------------------
{
  ok(DESIGN_SIZES.length >= 20 && new Set(DESIGN_SIZES.map((s) => s.id)).size === DESIGN_SIZES.length, 'twenty sizes or more, each of its own id');
  const a4 = designSize('poster-a4')!;
  ok(a4.w === 794 && a4.h === 1123 && a4.unit === 'mm', `an A4 poster is 794 × 1123 pixels (${a4.w} × ${a4.h})`);
  ok(designSize('business-card')!.w === 336 && designSize('story')!.h === 1920 && designSize('youtube-thumbnail')!.w === 1280, 'a business card, a story and a thumbnail, at their sizes');
  ok(sizeFrom('1200x800')?.w === 1200 && sizeFrom('210 × 297 mm')?.h === 1123 && sizeFrom('5x7in')?.w === 480 && sizeFrom('instagram-post')?.id === 'instagram-post', 'sizes named in pixels, millimetres, inches or by name');
  ok(sizeFrom('5x5') === null && sizeFrom('90000x10') === null, 'sizes too small or too large are refused');
  ok(!!designSize('youtube-banner')!.safe, 'a YouTube banner says where its words are safe');
}

// ---- templates: whole, numbers that are numbers, their fonts, inside their artboard ---------------------------------------
{
  let n = 0;
  for (const s of DESIGN_SIZES) {
    const list = templatesFor(s);
    ok(list.length >= 2, `${s.id}: two templates or more (${list.length})`);
    if (s.id === 'logo') ok(list.every((t) => t.best?.includes('logo')), 'a logo is offered logo templates only');
    if (s.safe) ok(list.every((t) => t.safe), `${s.id}: only templates that keep to its safe middle`);
    for (const t of list) {
      n++;
      const b = templateBoard(t, s);
      const where = `${t.id} at ${s.id}`;
      ok(!/NaN|undefined|Infinity|\[object/.test(b.html + b.bg), `${where}: no number that is not one`);
      ok((b.html.match(/<div\b/g) ?? []).length === (b.html.match(/<\/div>/g) ?? []).length, `${where}: every element closed`);
      for (const m of b.html.matchAll(/font-family:'([^']+)'/g)) ok(!!fontByName(m[1]), `${where}: ${m[1]} is a font the designs load`);
      // Elements start inside the artboard (a bleed off its edges is allowed, a fifth of its size at most).
      for (const m of b.html.matchAll(/style="left:(-?[\d.]+)px;top:(-?[\d.]+)px/g)) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        ok(x > -s.w * 0.45 && x < s.w && y > -s.h * 0.55 && y < s.h, `${where}: an element starts on the artboard (${x}, ${y})`);
      }
      for (const m of b.html.matchAll(/font-size:([\d.]+)px/g)) ok(Number(m[1]) >= 4, `${where}: words 4 pixels high or more (${m[1]})`);
    }
  }
  ok(n >= 150, `templates at every size they are offered for (${n})`);
  const page = templatePage(DESIGN_TEMPLATES[0], designSize('instagram-post')!, { title: 'A <test> & more' });
  ok(isDesignHtml(page) && designBoards(page)[0]?.w === 1080 && designBoards(page)[0]?.h === 1080, 'a design page: one artboard of its size');
  ok(page.includes('<title>A &#60;test&#62; &#38; more</title>') && page.includes('class="n-design-page"') && page.includes('data-size="instagram-post"'), 'its title written safely, its body a design’s, its size named');
  ok(page.includes('id="n-fonts"') && page.includes('fonts.googleapis.com/css2?'), 'it loads its fonts');
  const twice = withDesignKit(withDesignKit(page));
  ok((twice.match(/id="n-design-base"/g) ?? []).length === 1 && (twice.match(/id="n-design-fit"/g) ?? []).length === 1, 'its stylesheet and script are there once, however often it is kept');
  const agent = withDesignKit('<!doctype html><html><body><section class="n-artboard" style="width:500px;height:500px"><div class="n-el n-text" style="left:10px;top:10px">Hi</div></section></body></html>');
  ok(/<head>[\s\S]*n-design-base[\s\S]*<\/head>/.test(agent) && agent.includes('<body class="n-design-page">'), 'an agent’s design gets its head and its body’s class');
  ok(withDesignKit('<!doctype html><p>A page</p>') === '<!doctype html><p>A page</p>', 'a page that is no design is left as it is');
  ok(fontsHref(['Anton', 'Inter', 'Bebas Neue']) === 'https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Inter:wght@400;500;600;700;800;900&display=swap', 'the fonts’ link asks only for weights each has');
  ok(DESIGN_FONTS.every((f) => f.w.includes(400)), 'every font has its regular weight');
}

// ---- resizing (Magic resize), curves, colours ----------------------------------------------------------------------
{
  const from = { w: 1080, h: 1080 };
  const to = { w: 1080, h: 1920 };
  const bg = fitBox({ x: 0, y: 0, w: 1080, h: 1080 }, from, to);
  ok(bg.x === 0 && bg.y === 0 && bg.w === 1080 && bg.h === 1920, 'a background fills the new artboard');
  const band = fitBox({ x: 0, y: 400, w: 1080, h: 200 }, from, to);
  ok(band.w === 1080 && band.x === 0 && band.h === 200, 'a band across stays across, its thickness as it was');
  const corner = fitBox({ x: 40, y: 40, w: 200, h: 100 }, from, { w: 1920, h: 1080 });
  ok(corner.x === 40 && corner.y === 40 && corner.w === 200 && corner.h === 100, 'an element in a corner’s margins keeps its margins, its size kept');
  const mid = fitBox({ x: 440, y: 440, w: 200, h: 200 }, from, { w: 540, h: 540 });
  ok(mid.w === 100 && mid.h === 100 && mid.x === 220 && mid.y === 220 && mid.k === 0.5, 'smaller: scaled, its middle where it was, its words halved');
  const big = fitBox({ x: 100, y: 100, w: 880, h: 880 }, from, { w: 1584, h: 396 });
  ok(big.h <= 396 && big.w <= 1584 && big.y >= 0 && big.x >= 0 && Math.abs(big.w / big.h - 1) < 0.01, 'into a banner: it fits inside, its shape kept');
  const c = curveGeom(400, 40, 100);
  ok(/^M0,/.test(c.d) && / A200,200 0 0 1 400,/.test(c.d) && c.h > 200, 'words bent into a half circle follow an arc as wide as their box');
  ok(curveGeom(400, 40, -50).d.includes(' 0 0 0 '), 'bent down, the arc turns the other way');
  const p = paletteFrom(['#0b3954', '#bfd7ea', '#ff5a5f', '#087e8b'])!;
  ok(p.bg === '#bfd7ea' && contrast(p.ink, p.bg) >= 4.5 && p.accent === '#ff5a5f', 'a palette from colours: the lightest behind, words that read on it, the most colourful the accent');
}

// ---- brand kits, requests, how_to_make ---------------------------------------------------------------------------------
{
  const k = cleanBrand({ colours: ['#FF0000', 'red', '#00ff00', '#ff0000'], fonts: ['Anton', 'Comic Sans'], logos: [{ src: 'naget-asset:abcdef0123456789', name: 'Logo' }, { src: 'http://x/y.png' }], name: '  The   Bakery ' });
  ok(k.colours.join() === '#ff0000,#00ff00' && k.fonts.join() === 'Anton,' && k.logos.length === 1 && k.name === 'The Bakery', 'a brand kit keeps colours, fonts the designs have, and logos the app keeps');
  ok(/brand kit: its name "The Bakery", colours #ff0000, #00ff00 \(the main one first\), the heading font Anton, 1 logo/.test(brandForAgent(k)), 'agents are told the brand kit');
  ok(brandForAgent(cleanBrand({})) === '', 'no brand kit, nothing said');
  const ask = composeAsk(contentType('design.event-poster')!, 'our street party', { size: { label: 'Poster (A3)', w: 1123, h: 1587 } });
  ok(ask.startsWith('Make me a design and keep it in my Library: an event poster') && ask.includes('a Poster (A3), 1123×1587 pixels') && ask.includes('how_to_make “design”'), 'a design asked for: its kind, its size, and how to write it');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-design-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  initAssets(db);
  initBrand(db);
  ok(readBrand(db) === null, 'no brand kit at first');
  saveBrand(db, { colours: ['#123456'], fonts: ['Bebas Neue', 'Inter'], logos: [] });
  ok(readBrand(db)?.fonts.join() === 'Bebas Neue,Inter', 'a brand kit is kept');
  const ctx = { deps: { db } } as unknown as RunCtx;
  const how = String(await HOW_TO_MAKE.run({ what: 'design' }, ctx));
  ok(how.includes('n-artboard') && how.includes('Poster (A4) 794×1123') && how.includes('the heading font Bebas Neue') && how.includes('New designs'), 'how_to_make "design": the format, the sizes, the brand kit, the kinds');
  const poster = String(await HOW_TO_MAKE.run({ what: 'event poster' }, ctx));
  ok(poster.startsWith('Event poster (a new design;') && poster.includes('n-artboard'), 'a design kind: its ask, then how to write a design');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });

  const sha = 'a'.repeat(40);
  const url = videoAddress(sha);
  ok(pageVideoSources(`<video src="${url}"></video><video src="/pg/video/${sha}/${'0'.repeat(32)}"></video>`).join() === `naget-video:${sha}`, 'a page keeps the videos it shows at their signed addresses (and only those)');
}

// ---- writing a design's words, and colours from a mood (the helper model, a stand-in here) ---------------------------------
{
  ok(cleanWords('Here is a heading:\n"Summer Sale!"', 'heading') === 'Summer Sale!' && cleanWords('Big news\nmore', 'heading') === 'Big news', 'the words alone, a heading on one line');
  ok(readColours('{"colours": ["#FFF8E7", "#2B2118", "#e4572e", "#e4572e", "nope"]}').join() === '#fff8e7,#2b2118,#e4572e' && readColours('try #112233 and #445566').length === 2, 'colours read from the answer, each once');
  const app = Fastify();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-design-write-'));
  const db = openDb(path.join(dir, 'w.db'));
  const asked: string[] = [];
  setDesignHelperForTests(async (q) => (asked.push(q.prompt), q.system.includes('palette') ? '{"colours":["#fdf6ec","#3b2f2f","#c8553d","#588157","#e9d8a6"]}' : '“Fresh bread, every morning”'));
  designWriteRoutes(app, db, () => new AbortController().signal);
  await app.ready();
  const w = (await app.inject({ method: 'POST', url: '/api/write/design-words', payload: { about: 'a bakery opening', role: 'heading', design: 'Opening day' } })).json();
  ok(w.text === 'Fresh bread, every morning' && w.model === 'the test helper' && /heading of a design called “Opening day”/.test(asked[0]), 'words written for a heading');
  const c = (await app.inject({ method: 'POST', url: '/api/write/palette', payload: { mood: 'warm and earthy' } })).json();
  ok(c.colours?.length === 5 && c.colours[0] === '#fdf6ec', 'a palette from a mood');
  ok((await app.inject({ method: 'POST', url: '/api/write/palette', payload: {} })).statusCode === 400, 'no mood, no palette');
  setDesignHelperForTests(null);
  await app.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- the design editor in a browser, and the files a design makes ------------------------------------------------------
if (!canCapture()) console.log('(no browser here: the design editor and the downloads are not tried)');
else {
  const size = designSize('instagram-post')!;
  const page = templatePage(DESIGN_TEMPLATES.find((t) => t.id === 'quote')!, size, { title: 'Quote' });
  const recorder = `<script data-n-own>window.__msgs=[];addEventListener('message',function(e){var d=e.data;if(d&&typeof d.type==='string'&&d.type.indexOf('wa-ed')===0)window.__msgs.push(d)});</script>`;
  const editing = page.replace('<head>', `<head>${recorder}<script data-n-own>(${DESIGN_EDITOR_SRC})(${JSON.stringify({ n: 'test', theme: 'light', doctype: '<!doctype html>', labels: {} })})</script>`).replace(/<script id="n-design-fit">/, '<script id="n-design-fit" type="text/x-naget-held" data-n-type="">');
  await withTab({ html: editing, width: 1100, height: 900, settleMs: 300 }, async (tab) => {
    const js = <T>(code: string) => tab.evaluate<T>(`(() => { ${code} })()`);
    const cmd = async (c: string, arg?: unknown) => {
      await js(`window.postMessage({ type: 'wa-ed', n: 'test', cmd: ${JSON.stringify(c)}, arg: ${JSON.stringify(arg ?? null)} }, '*');`);
      await sleep(80);
    };
    const last = (type: string) => js<any>(`const l = window.__msgs.filter(function(m){return m.type===${JSON.stringify(type)}}); return l[l.length - 1] || null;`);
    const html = async () => {
      const id = Math.floor(Math.random() * 1e9);
      await js(`window.postMessage({ type: 'wa-ed', n: 'test', cmd: 'html', id: ${id} }, '*');`);
      for (let i = 0; i < 40; i++) {
        const h = await js<string | null>(`const m = window.__msgs.find(function(m){return m.type==='wa-ed-html'&&m.id===${id}}); return m ? m.html : null;`);
        if (h !== null) return h;
        await sleep(25);
      }
      throw new Error('no html');
    };
    for (let i = 0; i < 40 && !(await last('wa-ed-ready')); i++) await sleep(50);
    ok(!!(await last('wa-ed-ready')), 'the design editor is ready');
    const boards = await last('wa-ed-design');
    ok(!!boards, 'it says what it holds');
    const kids = () => js<number>('return document.querySelector(".n-artboard").children.length');
    const n0 = await kids();
    const quotePath = await js<number[]>('const el = document.querySelectorAll(".n-text")[1]; const out = []; let x = el; while (x && x !== document.documentElement) { out.unshift([...x.parentElement.children].indexOf(x)); x = x.parentElement; } return out;');
    await cmd('select', { path: quotePath });
    const sel = (await last('wa-ed-sel'))?.sel;
    ok(sel?.kind === 'el' && sel.el?.type === 'text' && /predict the future/.test(sel.el.words ?? ''), 'a picked text says its words');
    await cmd('geom', { x: 12, y: 34 });
    ok((await js<string>('return document.querySelectorAll(".n-text")[1].style.left')) === '12px', 'its place set from the inspector');
    await cmd('dup');
    ok((await kids()) === n0 + 1, 'duplicated');
    await cmd('undo');
    ok((await kids()) === n0 && !(await last('wa-ed-state'))?.dirty === false, 'undone');
    await cmd('align', 'center');
    const centred = await js<number>('const e = document.querySelectorAll(".n-text")[1]; return Math.round(parseFloat(e.style.left) + e.offsetWidth / 2);');
    ok(Math.abs(centred - 540) <= 1, `lined up in the middle of the page (${centred})`);
    await cmd('order', 'back');
    ok(await js<boolean>('return document.querySelector(".n-artboard").firstElementChild === document.querySelectorAll(".n-text")[0] || document.querySelector(".n-artboard").firstElementChild.classList.contains("n-text")'), 'sent to the back');
    await cmd('selectAll');
    await cmd('group');
    ok(await js<boolean>('return !!document.querySelector(".n-artboard > .n-group") && document.querySelector(".n-artboard").children.length === 1'), 'everything grouped');
    await cmd('ungroup');
    ok((await kids()) === n0 && !(await js<boolean>('return !!document.querySelector(".n-group")')), 'ungrouped, each where it was');
    await cmd('select', { path: quotePath });
    await cmd('style', { props: { color: '#ff0000' } });
    ok((await js<string>('return document.querySelectorAll(".n-text")[1].style.color')) === 'rgb(255, 0, 0)', 'a look set on what is picked');
    await cmd('curve', { amount: 60 });
    ok(await js<boolean>('return !!document.querySelector(".n-curve svg textPath")'), 'words curved');
    await cmd('curve', { amount: 0 });
    ok(await js<boolean>('return !document.querySelector(".n-curve") && [...document.querySelectorAll(".n-text")].some((e) => /predict the future/.test(e.textContent))'), 'and straight again, the same words');
    // Dragged with the mouse: it snaps with its middle to the page's.
    await cmd('deselect');
    const r = await js<{ x: number; y: number; w: number; h: number; z: number }>('const e = document.querySelectorAll(".n-text")[1]; const b = e.getBoundingClientRect(); const a = document.querySelector(".n-artboard").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, z: a.width / 1080 };');
    const ax = await js<number>('const a = document.querySelector(".n-artboard").getBoundingClientRect(); return a.left + a.width / 2;');
    const s = tab.s;
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 6; i++) await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + i * 10, y: r.y + i * 6, buttons: 1 });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + 2, y: r.y + 60, buttons: 1 });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ax + 2, y: r.y + 60, button: 'left', clickCount: 1 });
    await sleep(150);
    const moved = await js<number>('const e = document.querySelectorAll(".n-text")[1]; return Math.round((parseFloat(e.style.left) + e.offsetWidth / 2) * 10) / 10;');
    ok(Math.abs(moved - 540) < 0.2, `dragged near the middle, it snaps to it (${moved})`);
    // A copy at another size, worked out from what shows.
    const id = 'r1';
    await cmd('resizedCopy', { id, w: 1080, h: 1920, size: 'story' });
    await sleep(150);
    const copy = (await js<any>(`return window.__msgs.find(function(m){return m.type==='wa-ed-design'&&m.what==='resized'&&m.id==='${id}'}) || null;`))?.html as string | undefined;
    ok(!!copy && designBoards(copy)[0]?.h === 1920 && copy.includes('data-size="story"'), 'a resized copy, at the new size');
    // What it gives back: the page, without the editor.
    const out = await html();
    ok(isDesignHtml(out) && !/data-n-own|contenteditable|n-ed-design|n-design-ui|class="n-editing"/.test(out), 'the HTML it gives back has nothing of the editor’s');
    ok(/<script id="n-design-fit">/.test(out) && !out.includes('x-naget-held'), 'the design’s own script is given back as it was');
    ok(out.includes('color: rgb(255, 0, 0)') || out.includes('color:#ff0000') || out.includes('color: #ff0000'), 'with the changes made');
  });

  // The files: a PNG at twice its size, see-through, a JPG, a PDF of its own size.
  const name = (t: string, ext: string) => `${t}.${ext}`;
  const card = templatePage(DESIGN_TEMPLATES.find((t) => t.id === 'card-classic')!, designSize('business-card')!, { title: 'Card' });
  const png = await exportDesign(card, { title: 'Card', format: 'png', scale: 2, name });
  ok(png.data.readUInt32BE(16) === 672 && png.data.readUInt32BE(20) === 384 && png.type === 'image/png', `a PNG at 2×: 672 × 384 (${png.data.readUInt32BE(16)} × ${png.data.readUInt32BE(20)})`);
  const clear = await exportDesign(card, { title: 'Card', format: 'png', scale: 1, transparent: true, name });
  ok(clear.data[25] === 6, 'see-through: a PNG with its alpha');
  const jpg = await exportDesign(card, { title: 'Card', format: 'jpg', scale: 1, name });
  ok(jpg.data[0] === 0xff && jpg.data[1] === 0xd8 && jpg.name === 'Card.jpg', 'a JPG');
  const pdf = await exportDesign(card, { title: 'Card', format: 'pdf', name });
  const box = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdf.data.toString('latin1'));
  ok(!!box && Math.abs(Number(box[1]) - 252) < 2 && Math.abs(Number(box[2]) - 144) < 2, `a PDF the card’s own size: 3.5 × 2 in (${box?.[1]} × ${box?.[2]} pt)`);
  const two = templatePage(null, size, { title: 'Two' }).replace('</section>', '</section><section class="n-artboard" data-w="500" data-h="300" style="width:500px;height:300px;background:#123"></section>');
  const zip = await exportDesign(two, { title: 'Two', format: 'png', scale: 1, name });
  ok(zip.type === 'application/zip' && zip.data.includes(Buffer.from('page-02.png')), 'two artboards: a picture of each, in a zip');
  const one = await exportDesign(two, { title: 'Two', format: 'png', scale: 1, board: 1, name });
  ok(one.data.readUInt32BE(16) === 500 && one.data.readUInt32BE(20) === 300, 'one of them alone, at its own size');
  await closeCapture();
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
