// Script tests for the editors' writing helpers and the slides' checks: the accessibility check (pictures without a
// description, words too small, too little contrast against a colour, a gradient, a card or a dimmed picture, slides
// without a title, a title read after other words, videos that start with their sound, tables without a header row;
// each fix, and every fix at once; none on the slides the layouts and themes make), animating every slide in one click
// (the order things come in, each style's effects in the web format and PowerPoint's, Morph between slides that share
// parts, taps kept, all of it off), and the routes: design ideas held to the slide (its words, pictures, data and live
// parts; nothing made up, nothing left out, ids kept), the words picked rewritten, and a picture described. The writer,
// the helper model and the model that sees pictures are stand-ins. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/write/write-test.ts
//   DATA_DIR=/tmp/hydor-test-write node dist/dev/write-test.js
// LIVE_IDEAS=1 also asks the real writer (Claude, through its CLI) for one slide's ideas; LIVE_REWRITE=1 the real
// helper model for one rewrite.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { checkDeck, checkSlide, contrast, deckCheckText, fixAll, fixIssue, MIN_TEXT, type DeckIssue } from '../../shared/deck-check.ts';
import { animateDeck, animateSlide, isNumber, morphShared } from '../../shared/deck-animate.ts';
import { ANIM_FX, everyEl, LAYOUTS, layoutSlide, normalizeDeck, plainText, RICH_ANIM_FX, RICH_TRANSITIONS, richFeatures, THEMES, TRANSITIONS, type Deck, type El, type Slide, type TextEl } from '../../shared/slides.ts';
import { slidesRuntime } from '../../shared/slides-runtime.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { setCaptionChoice } from '../media/caption.ts';
import { initAssets, putAsset } from '../pages/assets.ts';
import { createPage, initPages } from '../pages/store.ts';
import { holdIdea, modelHelp, waysFor, WAYS } from './ideas.ts';
import { cleanRewrite, readAlt, setWriteForTests, write } from './index.ts';

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

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-write-test-')));
const RT = slidesRuntime({ document: {} } as unknown as Window, {});
const PIC = 'naget-asset:0123456789abcdef0123456789abcdef01234567';
const PIC2 = 'naget-asset:89abcdef0123456789abcdef0123456789abcdef';
const deckOf = (slides: unknown[], o: Record<string, unknown> = {}): Deck => normalizeDeck({ theme: 'paper', slides, ...o });
const kinds = (list: DeckIssue[]) => list.map((x) => x.kind).sort();
const byId = (s: Slide, id: string) => everyEl(s.els).find((e) => e.id === id);

// ---- the accessibility check ----------------------------------------------------------------------------------------

{
  // The layouts, filled in as people fill them, in every theme: nothing to fix (no false alarms).
  const content = {
    title: 'Our plan for the year',
    subtitle: 'What we will do, and how',
    text: '- Grow the team\n- Open two offices\n- Ship the app',
    left: '- One\n- Two',
    right: '- Three\n- Four',
    leftTitle: 'Now',
    rightTitle: 'Next',
    image: PIC,
    caption: 'The new office in Lyon',
    quote: 'Simple things should be simple.',
    by: 'Alan Kay',
    stats: [
      { value: '42%', label: 'More customers' },
      { value: '3.5k', label: 'Orders a week' },
      { value: '$1.2M', label: 'Revenue' },
    ],
    cards: [
      { title: 'Fast', text: 'It answers in a second.' },
      { title: 'Calm', text: 'Nothing jumps at you.' },
      { title: 'Yours', text: 'It runs on your computer.' },
    ],
    steps: [
      { title: 'Plan', text: 'Say what you want.' },
      { title: 'Make', text: 'The agent makes it.' },
      { title: 'Ship', text: 'Share it with the world.' },
    ],
    table: [
      ['Plan', 'Price'],
      ['Basic', '$5'],
      ['Pro', '$20'],
    ],
  };
  const alarms: string[] = [];
  for (const t of THEMES)
    for (const l of LAYOUTS.filter((x) => x.id !== 'blank' && x.id !== 'quote' && x.id !== 'image' && x.id !== 'image-right')) {
      const d = deckOf([layoutSlide(l.id, content)], { theme: t.id });
      for (const x of checkDeck(d)) alarms.push(`${t.id}/${l.id}: ${x.kind} ${x.what}`);
    }
  ok(!alarms.length, `the layouts in every theme have nothing to fix: ${alarms.slice(0, 6).join(' | ')}`);
  // The picture layouts: only the picture's description is asked for, until it has one.
  const pic = deckOf([layoutSlide('image-right', { ...content, caption: undefined })]);
  ok(kinds(checkDeck(pic)).join() === 'alt', `a picture without a description: ${kinds(checkDeck(pic))}`);
  ok(checkDeck(pic)[0].src === PIC && !checkDeck(pic)[0].fix, 'its source, for a description by AI; no fix of its own');
  ok(!checkDeck(deckOf([layoutSlide('image-right', content)])).length, 'with one (the caption), nothing');
  ok(
    kinds(
      checkDeck(
        deckOf([
          {
            els: [
              { type: 'text', role: 'title', text: 'Look', x: 80, y: 40, w: 800, h: 80, size: 44 },
              { type: 'image', src: PIC, alt: 'IMG_2041.JPG', x: 80, y: 160, w: 600, h: 400 },
            ],
          },
        ]),
      ),
    ).join() === 'alt',
    'a file’s name is no description',
  );

  // Words too small, and made 18 px (their own sizes in step).
  const small = deckOf([
    {
      els: [
        { type: 'text', role: 'title', text: 'Title', x: 80, y: 40, w: 800, h: 80, size: 44 },
        { id: 'fine', type: 'text', paras: [{ runs: [{ t: 'Small ', size: 12 }, { t: 'print' }] }], x: 80, y: 200, w: 800, h: 80, size: 15 },
        {
          id: 'tb',
          type: 'table',
          rows: [
            ['A', 'B'],
            ['1', '2'],
          ],
          size: 14,
          x: 80,
          y: 300,
          w: 600,
          h: 120,
        },
      ],
    },
  ]);
  const si = checkDeck(small);
  ok(kinds(si).join() === 'small,small' && si.some((x) => x.el === 'fine' && /12 px/.test(x.what)), `words of 12 and 14 px: ${si.map((x) => x.what)}`);
  const big = fixIssue(
    small,
    si.find((x) => x.el === 'fine')!,
  );
  const fine = byId(big.slides[0], 'fine') as TextEl;
  ok(fine.paras[0].runs[0].size === MIN_TEXT && fine.size === 22.5, `made ${MIN_TEXT} px at the smallest, the rest in step: ${fine.paras[0].runs[0].size}, ${fine.size}`);
  ok(
    (
      byId(
        fixIssue(
          small,
          si.find((x) => x.el === 'tb')!,
        ).slides[0],
        'tb',
      ) as { size: number }
    ).size === MIN_TEXT,
    'a table’s words too',
  );

  // Contrast: light grey on white; words on a card; a gradient's darker end; a dimmed picture.
  const low = deckOf([
    {
      els: [
        { type: 'text', role: 'title', text: 'Title', x: 80, y: 40, w: 800, h: 80, size: 44 },
        { id: 'pale', type: 'text', text: 'Hard to read', color: '#cccccc', x: 80, y: 200, w: 800, h: 80, size: 24 },
      ],
    },
  ]);
  const li = checkDeck(low);
  ok(li.length === 1 && li[0].kind === 'contrast' && /1\.6 to 1; 3 to 1/.test(li[0].what) && li[0].fix, `pale words on white: ${li.map((x) => x.what)}`);
  const lit = fixIssue(low, li[0]);
  ok((byId(lit.slides[0], 'pale') as TextEl).color === 'fg' && !checkDeck(lit).length, 'given the theme’s text colour, which stands out');
  const card = deckOf([
    {
      els: [
        { type: 'text', role: 'title', text: 'Title', x: 80, y: 40, w: 800, h: 80, size: 44 },
        { type: 'shape', shape: 'round', fill: '#1e293b', x: 60, y: 180, w: 600, h: 300 },
        { id: 'on', type: 'text', text: 'Dark on dark', color: '#334155', x: 80, y: 200, w: 500, h: 80, size: 26 },
      ],
    },
  ]);
  ok(kinds(checkDeck(card)).join() === 'contrast', 'words on a card are checked against the card');
  ok(!checkDeck(fixIssue(card, checkDeck(card)[0])).length, 'and given a colour that stands out from it');
  const grad = deckOf([{ bg: { color: '#ffffff', to: '#2f6fec' }, els: [{ type: 'text', role: 'title', text: 'A gradient behind', color: '#2f6fec', x: 80, y: 40, w: 800, h: 80, size: 44 }] }]);
  ok(kinds(checkDeck(grad)).join() === 'contrast', 'a gradient: against the end it is hardest to read on');
  const photo = (dim?: number, color = '#ffffff') => deckOf([{ bg: { image: PIC, ...(dim !== undefined ? { dim } : {}) }, els: [{ id: 't', type: 'text', role: 'title', text: 'Over a photo', color, x: 80, y: 40, w: 800, h: 80, size: 30 }] }]);
  ok(kinds(checkDeck(photo())).join() === 'contrast' && /over the picture/.test(checkDeck(photo())[0].what), 'white words on a picture not dimmed');
  ok(!checkDeck(photo(0.5)).length, 'on one dimmed by half, fine');
  const dark = photo(undefined, 'fg');
  const darkFix = fixIssue(dark, checkDeck(dark)[0]);
  ok(
    (darkFix.slides[0].bg?.dim ?? 0) >= 0.3 && ['bg', 'accentFg', '#ffffff'].includes(String((byId(darkFix.slides[0], 't') as TextEl).color)) && !checkDeck(darkFix).length,
    `dark words on a photo: the picture darkened, the words lit: ${JSON.stringify(darkFix.slides[0].bg)} ${(byId(darkFix.slides[0], 't') as TextEl).color}`,
  );
  ok(Math.abs(contrast([0, 0, 0], [255, 255, 255]) - 21) < 0.01 && Math.abs(contrast([119, 119, 119], [255, 255, 255]) - 4.48) < 0.02, 'contrast as WCAG works it out');

  // Titles: none (with a part that could be it, and without), empty, read after other words.
  const none = deckOf([
    {
      els: [
        { id: 'big', type: 'text', role: 'body', text: 'Why it matters', x: 80, y: 60, w: 900, h: 90, size: 48, bold: true },
        { type: 'text', text: 'Because it does.', x: 80, y: 200, w: 900, h: 80, size: 26 },
      ],
    },
  ]);
  const ni = checkDeck(none);
  ok(ni.length === 1 && ni[0].kind === 'title' && ni[0].el === 'big' && /“Why it matters”/.test(ni[0].what) && ni[0].fix, `no title, one that could be: ${ni.map((x) => x.what)}`);
  const titled = byId(fixIssue(none, ni[0]).slides[0], 'big') as TextEl;
  ok(titled.role === 'title' && titled.color === 'fg' && titled.font === 'body' && titled.lh === 1.2, 'made the title, looking as it did (its colour, font and line height said)');
  ok(!checkDeck(fixIssue(none, ni[0])).length, 'and then nothing to fix');
  const bare = checkDeck(deckOf([{ els: [{ type: 'image', src: PIC, alt: 'A boat', x: 0, y: 0, w: 1280, h: 720 }] }]));
  ok(bare.length === 1 && bare[0].kind === 'title' && !bare[0].fix, 'a picture alone: no title, and nothing to make one of');
  ok(
    checkDeck(deckOf([layoutSlide('content', { text: 'Words' })])).some((x) => x.kind === 'title' && /empty/.test(x.what)),
    'a title box left empty',
  );
  const late = deckOf([
    {
      els: [
        { type: 'text', text: 'First words', x: 80, y: 300, w: 800, h: 80, size: 26 },
        { id: 'tt', type: 'text', role: 'title', text: 'The title', x: 80, y: 40, w: 800, h: 80, size: 44 },
      ],
    },
  ]);
  const lt = checkDeck(late);
  ok(lt.length === 1 && lt[0].kind === 'order' && lt[0].fix, 'a title read after other words');
  const first = fixIssue(late, lt[0]);
  ok(first.slides[0].els[0].id === 'tt' && !checkDeck(first).length, 'moved to be read first');
  const covered = deckOf([
    {
      els: [
        { type: 'text', text: 'First words', x: 80, y: 300, w: 800, h: 80, size: 26 },
        { type: 'shape', shape: 'rect', fill: 'soft', x: 40, y: 20, w: 1000, h: 140 },
        { type: 'text', role: 'title', text: 'The title', x: 80, y: 40, w: 800, h: 80, size: 44 },
      ],
    },
  ]);
  ok(
    checkDeck(covered).some((x) => x.kind === 'order' && !x.fix),
    'not when a part would come over it: Go to only',
  );

  // Videos with their sound, tables without a header; hidden slides left out.
  const av = deckOf([
    {
      els: [
        { type: 'text', role: 'title', text: 'Watch', x: 80, y: 40, w: 800, h: 80, size: 44 },
        { id: 'v', type: 'video', src: 'https://youtu.be/dQw4w9WgXcQ', autoplay: true, x: 80, y: 160, w: 640, h: 360 },
        {
          id: 't2',
          type: 'table',
          rows: [
            ['a', 'b'],
            ['1', '2'],
          ],
          head: false,
          size: 20,
          x: 760,
          y: 160,
          w: 400,
          h: 120,
        },
      ],
    },
    { hidden: true, els: [{ type: 'text', text: 'tiny', size: 8 }] },
  ]);
  ok(kinds(checkDeck(av)).join() === 'autoplay,header', `a video that plays with sound, a table without a header, a hidden slide not looked at: ${kinds(checkDeck(av))}`);
  const all = fixAll(av);
  ok(all.fixed === 2 && !checkDeck(all.deck).length && (byId(all.deck.slides[0], 'v') as { muted?: boolean }).muted && (byId(all.deck.slides[0], 't2') as { head?: boolean }).head, 'every fix at once');
  // In groups too.
  const grouped = deckOf([
    {
      els: [
        { type: 'text', role: 'title', text: 'Group', x: 80, y: 40, w: 800, h: 80, size: 44 },
        {
          type: 'group',
          els: [
            { id: 'gi', type: 'image', src: PIC2, x: 100, y: 200, w: 300, h: 200 },
            { id: 'gt', type: 'text', text: 'Caption', size: 12, x: 100, y: 420, w: 300, h: 40 },
          ],
        },
      ],
    },
  ]);
  ok(kinds(checkDeck(grouped)).join() === 'alt,small' && checkDeck(grouped).some((x) => x.el === 'gi'), 'parts in a group');
  ok(/slide 1 \(“Group”\), part gi: This picture has no description/.test(deckCheckText(grouped)) && deckCheckText(deckOf([layoutSlide('title', { title: 'Fine', subtitle: 'All' })])) === '', 'what agents are told, and nothing when there is nothing');
  ok(checkSlide(av, 5).length === 0, 'a slide that is not there');
}

// ---- animating every slide ------------------------------------------------------------------------------------------

{
  const web = deckOf([
    layoutSlide('title', { title: 'Hydor', subtitle: 'An agent for everything' }),
    layoutSlide('image-right', { title: 'The office', text: '- Bright\n- Quiet\n- Near the station', image: PIC }),
    layoutSlide('stats', {
      title: 'In numbers',
      stats: [
        { value: '42%', label: 'More customers' },
        { value: '3.5k', label: 'Orders' },
      ],
    }),
    layoutSlide('cards', {
      title: 'Why',
      cards: [
        { title: 'Fast', text: 'Quick' },
        { title: 'Calm', text: 'Quiet' },
        { title: 'Yours', text: 'Local' },
      ],
    }),
    {
      els: [
        { id: 'q', type: 'quiz', question: '2 + 2?', choices: ['3', '*4'] },
        { id: 'b', type: 'shape', text: 'Show the answer', x: 80, y: 600, w: 300, h: 60 },
        { id: 'a', type: 'text', text: '42', x: 500, y: 600, w: 200, h: 60 },
      ],
      anims: [{ el: 'a', fx: 'pop', on: 'tap', trigger: 'b' }],
    },
  ]);
  const okFx = (d: Deck, rich: boolean) =>
    d.slides.every((s) => (s.anims ?? []).every((a) => [...ANIM_FX[a.type], ...(rich ? RICH_ANIM_FX[a.type] : [])].includes(a.fx)) && (!s.transition || [...TRANSITIONS, ...(rich ? RICH_TRANSITIONS : [])].includes(s.transition.fx)));
  for (const style of ['subtle', 'lively', 'bold'] as const) {
    const d = animateDeck(web, style);
    ok(okFx(d, true), `${style}: effects and transitions the web format has`);
    ok(
      d.slides.every((s) => RT.steps(s) === 0),
      `${style}: everything plays by itself (no clicks added)`,
    );
    ok(JSON.stringify(normalizeDeck(JSON.parse(JSON.stringify(d))).slides.map((s) => s.anims?.length ?? 0)) === JSON.stringify(d.slides.map((s) => s.anims?.length ?? 0)), `${style}: kept as it is when saved`);
    const ppt = animateDeck(normalizeDeck({ ...web, format: 'pptx' }), style);
    ok(okFx(ppt, false) && !richFeatures(ppt).length, `${style}: only PowerPoint’s in a PowerPoint compatible deck: ${richFeatures(ppt).map((f) => f.what)}`);
  }
  const lively = animateDeck(web, 'lively');
  const s1 = lively.slides[1];
  const order = (s1.anims ?? []).map((a) => (byId(s1, a.el) as El).type + (a.byPara ? '*' : ''));
  const title1 = s1.els.find((e) => e.type === 'text' && e.role === 'title')!;
  ok(s1.anims?.[0].el === title1.id && s1.anims[0].on === 'with' && s1.anims[0].delay === 0, 'the title first, as the slide comes');
  ok(order.join() === 'text,shape,text*,image', `then its bar, its bullets one by one, the picture after: ${order}`);
  ok(s1.anims?.find((a) => a.byPara)?.on === 'after', 'bullets each after the one before');
  ok(s1.transition?.fx === 'push' && !lively.slides[0].transition, 'the style’s transition, none before the first slide');
  const stats = lively.slides[2];
  ok((stats.anims ?? []).filter((a) => a.fx === 'count').length === 2, 'numbers count up');
  const labels = stats.els.filter((e) => e.type === 'text' && plainText(e.paras).length > 4 && e.role !== 'title');
  ok(
    labels.every((l) => (stats.anims ?? []).find((a) => a.el === l.id)?.on === 'with'),
    'their labels with them',
  );
  const cards = lively.slides[3];
  const cardShapes = cards.els.filter((e) => e.type === 'shape' && !plainText(e.paras).trim() && e.w > 100);
  ok(
    cardShapes.every((c) => (cards.anims ?? []).some((a) => a.el === c.id && a.fx === 'pop')),
    'cards pop in',
  );
  const after = (cards.anims ?? []).filter((a) => a.on === 'after');
  ok(after.length === 1, `the row of cards comes after the title together, one after another: ${(cards.anims ?? []).map((a) => `${a.on}+${a.delay}`)}`);
  const quiz = lively.slides[4];
  ok(quiz.anims?.some((a) => a.on === 'tap' && a.el === 'a' && a.trigger === 'b') && !quiz.anims?.some((a) => a.el === 'a' && a.on !== 'tap'), 'an answer shown on a click stays so (and does not also come in)');
  // Morph between slides that share parts: what glides does not come in again.
  const pair = deckOf([layoutSlide('content', { title: 'Our plan', text: '- One' }), layoutSlide('content', { title: 'Our plan', text: '- Two' }), layoutSlide('content', { title: 'Something else', text: '- Three' })]);
  const m = animateDeck(pair, 'subtle');
  const shared = morphShared(pair.slides[0], pair.slides[1]);
  ok(m.slides[1].transition?.fx === 'morph' && m.slides[2].transition?.fx === 'fade', 'Morph where slides share their title, the style’s own where they do not');
  ok([...shared].every((id) => !(m.slides[1].anims ?? []).some((a) => a.el === id)) && shared.size === 1, 'the shared title glides, it does not come in');
  ok(
    [...shared].every((id) => RT.morphPairs(pair.slides[0], pair.slides[1]).some(([, b]) => b.id === id)),
    'as the slideshow pairs them',
  );
  ok(!morphShared(pair.slides[1], pair.slides[2]).size, 'a bar every slide of a layout has is not a part shared');
  // A panel behind the title stays; a slide's own "go on by itself" stays; all of it off.
  const panel = deckOf([
    {
      transition: { fx: 'fade', auto: 5 },
      els: [
        { id: 'p', type: 'shape', shape: 'rect', fill: 'accent', x: 0, y: 0, w: 420, h: 720 },
        { id: 'tt', type: 'text', role: 'title', text: 'Side', color: 'accentFg', x: 40, y: 280, w: 340, h: 120, size: 44 },
        { id: 'tx', type: 'text', text: 'Words to the right', x: 480, y: 280, w: 700, h: 120, size: 26 },
      ],
    },
  ]);
  const pa = animateSlide(panel, 0, 'bold');
  ok(!(pa.anims ?? []).some((a) => a.el === 'p') && pa.anims?.[0].el === 'tt', 'a panel behind the title stays where it is');
  ok(pa.transition?.auto === 5 && pa.transition.fx === 'none', 'the first slide keeps going on by itself after 5 s');
  const off = animateDeck(lively, 'none');
  ok(
    off.slides.every((s) => !s.anims && (!s.transition || s.transition.fx === 'none')),
    'every animation and transition taken off',
  );
  ok(isNumber('42%') && isNumber('$1.2M') && isNumber('3.5k') && isNumber('1,000') && !isNumber('2024') && !isNumber('1') && !isNumber('Q3'), 'numbers to count, not years or a step’s');
}

// ---- the routes -------------------------------------------------------------------------------------------------------

const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
initPages(db);
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
const deps = { app, db, models: { agentModels: () => [], ensure: async () => null }, broadcast() {}, toSubscribers() {}, publicBase: () => 'https://hydor.example' } as unknown as Deps;
write.routes!(deps);
await app.ready();
const req = (url: string, body: unknown) => app.inject({ method: 'POST', url, payload: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

{
  // What the writer is told of slides: save_slides' own words (not the stand-ins for when they are not found).
  const help = modelHelp(true);
  ok(/Slides are 1280×720/.test(help) && /Parts: \{type, x, y, w, h/.test(help) && /Web looks:/.test(help) && /Colours: the theme/.test(help), 'the slide model as save_slides tells agents');
  ok(!modelHelp(false).includes('Web looks:'), 'without the web’s looks for a PowerPoint compatible deck');
}

const slide = {
  id: 's2',
  notes: 'Say it slowly.',
  transition: { fx: 'fade' },
  els: [
    { id: 'title', type: 'text', role: 'title', text: 'Revenue grew 20% in Q3', x: 80, y: 52, w: 1120, h: 100, size: 46 },
    { id: 'body', type: 'text', text: '- New customers in Europe\n- Two big partners\n- Prices held', x: 80, y: 196, w: 540, h: 400, size: 26 },
    { id: 'pic', type: 'image', src: PIC, alt: 'The team', x: 680, y: 0, w: 600, h: 720 },
    { id: 'code1', type: 'html', html: '<b>the deck’s own code</b>'.repeat(20), x: 700, y: 500, w: 200, h: 100 },
  ],
  anims: [
    { id: 'a1', el: 'title', fx: 'fade', on: 'with' },
    { id: 'a2', el: 'body', fx: 'fade', on: 'click', byPara: true },
  ],
  comments: [
    { id: 'c1', by: 'user', text: 'Nice picture', at: 1, el: 'pic' },
    { id: 'c2', by: 'user', text: 'Shorter?', at: 2, el: 'body' },
  ],
};
const deck = deckOf([layoutSlide('title', { title: 'Q3' }), slide]);

// A good idea in each way: the slide's own words, picture and parts, laid out anew.
const good = (way: string) =>
  JSON.stringify({
    name: way === 'split' ? 'Half and half' : '',
    bg: way === 'picture-behind' ? { image: PIC, dim: 0.45 } : null,
    els: [
      ...(way === 'picture-behind' ? [] : [{ id: 'pic', type: 'image', src: PIC, x: 0, y: 0, w: 640, h: 720, crop: { l: 0.3, t: 0, r: 0, b: 0 } }]),
      { id: 'title', type: 'text', role: 'title', text: 'Revenue grew 20% in Q3', x: 700, y: 60, w: 520, h: 140, size: 44 },
      { id: 'card9', type: 'shape', shape: 'round', fill: 'soft', x: 690, y: 220, w: 540, h: 380 },
      { id: 'body', type: 'text', text: '- New customers in Europe\n- Two big partners\n- Prices held', x: 720, y: 240, w: 480, h: 340, size: 14 },
      { id: 'code1', type: 'html', html: '[custom code, 520 characters, kept as it is]', x: 1100, y: 640, w: 160, h: 60 },
      { type: 'icon', icon: 'rocket', x: 2000, y: 60, w: 60, h: 60 },
    ],
  });
const asks: string[] = [];
let script: ((prompt: string) => string) | null = null;
setWriteForTests({
  writer: async (q) => {
    asks.push(q.prompt);
    const way = WAYS.find((w) => q.prompt.includes(w.ask));
    return script ? script(q.prompt) : `Here it is:\n\`\`\`json\n${good(way?.id ?? '')}\n\`\`\``;
  },
});

{
  const ways = waysFor(deck.slides[1], 3, []).map((w) => w.id);
  ok(ways.join() === 'picture-behind,big-number,split', `ways that suit a slide with a picture and a number: ${ways}`);
  ok(
    waysFor(deck.slides[1], 3, ways).every((w) => !ways.includes(w.id)),
    'More ideas: other ways',
  );
  ok(!waysFor(deckOf([layoutSlide('content', { title: 'Words', text: 'Only words here' })]).slides[0], 13, []).some((w) => w.id === 'picture-behind' || w.id === 'split'), 'no picture-led way for a slide of words');

  const r = await req('/api/write/design-ideas', { deck, slide: 1 });
  const j = r.json();
  ok(r.statusCode === 200 && j.ideas.length === 3 && j.ways.join() === ways.join(), `three ideas, a way each: ${r.statusCode} ${r.body.slice(0, 300)}`);
  ok(asks.length === 3 && asks.every((p) => p.includes('"id":"title"') && p.includes('[custom code, 520 characters, kept as it is]') && !p.includes('the deck’s own code')), 'the writer sees the slide, its custom code in a few words');
  ok(
    asks.some((p) => p.includes('Its other slides') && p.includes('1. Q3')),
    'and the deck around it',
  );
  const [behind, , split] = j.ideas as Slide[];
  ok(j.names[2] === 'Half and half' && j.names[0] === 'Picture behind', 'each named: its own name, else its way’s');
  ok(behind.bg?.image === PIC && behind.bg.dim === 0.45 && !behind.els.some((e) => e.type === 'image'), 'the picture behind the words');
  ok(split.id === 's2' && split.notes === 'Say it slowly.' && split.transition?.fx === 'fade', 'the slide keeps its id, notes and transition');
  ok((byId(split, 'code1') as { html: string }).html === slide.els[3].html, 'its custom code put back as it was');
  ok((byId(split, 'pic') as { crop?: unknown }).crop === undefined, 'a picture in a box of another shape fills it, rather than keep a crop that would stretch it');
  ok((byId(split, 'body') as TextEl).size === 18, 'words of 14 px made 18');
  const icon = split.els.find((e) => e.type === 'icon')!;
  ok(icon && icon.x + icon.w <= 1280 && icon.x >= 0, `a part off the slide brought onto it: ${icon?.x}`);
  ok(split.anims?.length === 2 && split.comments?.length === 2 && split.comments.every((c) => c.el), 'the parts it keeps keep their animations and comments');
  ok(behind.comments?.find((c) => c.id === 'c1') && !behind.comments.find((c) => c.id === 'c1')!.el, 'a comment on a part that went is on the slide');
  const others = new Set(deck.slides[0].els.map((e) => e.id));
  ok(split.els.every((e) => !others.has(e.id)) && split.els.some((e) => e.type === 'shape' && e.id !== 'card9' && e.id.length === 8), 'new parts get ids no other part of the deck has');

  // Made up: a number not on the slide; asked again, saying why.
  asks.length = 0;
  let n = 0;
  script = (p) => (n++ === 0 ? good('split').replace('Revenue grew 20% in Q3', 'Revenue grew 35% in Q3') : good('split'));
  const r2 = (await req('/api/write/design-ideas', { deck, slide: 1, count: 1, avoid: ['picture-behind', 'big-number'] })).json();
  ok(
    r2.ideas.length === 1 && /numbers that are not on the slide \(35%?\)/.test(asks[1] ?? '') && asks.length === 2,
    `a made-up number: asked again, saying so: ${asks[1]?.slice(asks[1].indexOf('did not hold'), asks[1].indexOf('did not hold') + 120)}`,
  );
  // Left out: a picture; words; made up: words; a picture that is not the slide's.
  const problem = (raw: string) => {
    const got = holdIdea(deck, 1, JSON.parse(raw));
    return 'problem' in got ? got.problem : '';
  };
  ok(/left out a picture/.test(problem(good('cards').replace(/\{"id":"pic"[^}]*\}\},/, ''))), 'a picture left out');
  ok(/left out words/.test(problem(good('cards').replace('- New customers in Europe\\n- Two big partners\\n- Prices held', 'Good'))), 'words left out');
  ok(/adds words of its own/.test(problem(good('cards').replace('- Prices held', '- Prices held\\n- Brilliant fantastic amazing incredible wonderful staff everywhere'))), 'words of its own');
  const extra = holdIdea(deck, 1, JSON.parse(good('cards').replace('"els":[', `"els":[{"type":"image","src":"${PIC2}","x":0,"y":0,"w":100,"h":100},`)));
  ok('slide' in extra && !everyEl(extra.slide.els).some((e) => e.type === 'image' && e.src === PIC2), 'a picture that is not the slide’s is left out');
  ok(/left out a picture[\s\S]*also had a picture that is not the slide’s/.test(problem(good('cards').replace(`{"id":"pic","type":"image","src":"${PIC}"`, `{"type":"image","src":"${PIC2}"`))), 'one in its picture’s place: said so');
  ok(/left out the slide’s html/.test(problem(good('cards').replace(/\{"id":"code1"[^}]*\},/, ''))), 'its custom code left out');
  ok(problem('{"name":"x","els":[]}') === 'it had no parts.', 'nothing at all');
  // Never JSON, twice: none hold, said in words.
  script = () => 'I would rather not.';
  const r3 = await req('/api/write/design-ideas', { deck, slide: 1, count: 2 });
  ok(r3.statusCode === 502 && /did not keep to the slide/.test(r3.json().error), `none that hold: ${r3.body}`);
  script = null;

  // A saved deck by its id; what is not asked well.
  const page = createPage(db, { title: 'Q3', kind: 'slides', model: deck, by: 'user' });
  ok((await req('/api/write/design-ideas', { deck: page.id, slide: 1, count: 1 })).json().ideas?.length === 1, 'a saved deck, by its id');
  ok((await req('/api/write/design-ideas', { deck: 'nosuchpage', slide: 0 })).statusCode === 404, 'no such deck');
  ok((await req('/api/write/design-ideas', { deck, slide: 7 })).statusCode === 400, 'no such slide');
  ok(/empty/.test((await req('/api/write/design-ideas', { deck: deckOf([{ els: [] }]), slide: 0 })).json().error ?? ''), 'an empty slide');
  ok((await req('/api/write/design-ideas', { deck: { nope: 1 }, slide: 0 })).statusCode === 400, 'not a deck');
}

{
  // Rewriting: what the helper is told, and its answer tidied.
  const told: string[] = [];
  let answer = '';
  setWriteForTests({
    helper: async (q) => {
      told.push(q.prompt);
      return answer;
    },
  });
  answer = 'Sure! Here is a shorter version:\n\n"Sales up 20%.\n\nEurope leads."';
  const r = (await req('/api/write/rewrite', { text: 'Our sales grew by twenty percent.\nEurope led the way.', how: 'shorter', context: 'a slide titled “Q3”' })).json();
  ok(r.text === 'Sales up 20%.\nEurope leads.' && r.model === 'the test helper', `its words alone, a line each: ${JSON.stringify(r)}`);
  ok(/Make it shorter/.test(told[0]) && /a slide titled “Q3”/.test(told[0]) && told[0].endsWith('Our sales grew by twenty percent.\nEurope led the way.'), 'told how, the context, and the words');
  answer = 'Unsere **Umsätze** sind gestiegen.';
  ok((await req('/api/write/rewrite', { text: 'Our **sales** grew.', how: 'translate', lang: 'German' })).json().text === 'Unsere **Umsätze** sind gestiegen.' && /into German/.test(told[1]), 'translated, its bold kept');
  ok(
    cleanRewrite('**Sales** grew', 'sales grew') === 'Sales grew' && cleanRewrite('```\nShort.\n```', 'Long words.') === 'Short.' && cleanRewrite('“Quoted”', '“Quoted words”') === '“Quoted”',
    'marks, fences and quotes it added taken off (its own kept)',
  );
  answer = 'As you asked.';
  ok((await req('/api/write/rewrite', { text: 'Words', how: 'ask', ask: 'Make it rhyme' })).json().text === 'As you asked.' && /as the person asks: Make it rhyme/.test(told[2]), 'in the user’s own words');
  ok((await req('/api/write/rewrite', { text: 'Words', how: 'translate' })).statusCode === 400 && (await req('/api/write/rewrite', { text: 'Words', how: 'translate', lang: '<script>' })).statusCode === 400, 'translating needs a language');
  ok((await req('/api/write/rewrite', { text: 'Words', how: 'ask' })).statusCode === 400, 'Say how needs words');
  ok((await req('/api/write/rewrite', { text: ' ', how: 'shorter' })).statusCode === 400 && (await req('/api/write/rewrite', { text: 'x', how: 'louder' })).statusCode === 400, 'no words; no such way');
  ok((await req('/api/write/rewrite', { text: 'x'.repeat(7000), how: 'fix' })).statusCode === 413, 'too many words at once');
  answer = '';
  ok((await req('/api/write/rewrite', { text: 'Words', how: 'fix' })).statusCode === 502, 'nothing back');
}

{
  // A picture described: by the model that sees pictures, in the slide's words' language.
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c63f8cfc0f01f0005000201' + 'a5a0e1c20000000049454e44ae426082', 'hex');
  const sha = putAsset(db, png);
  const seen: { prompt: string; file: string; there: boolean }[] = [];
  setWriteForTests({
    seer: async (q) => {
      seen.push({ prompt: q.prompt, file: q.file, there: fs.existsSync(q.file) });
      return '{"alt": "Image of a red boat on a calm lake at dawn."}';
    },
  });
  const r = (await req('/api/write/describe', { src: `naget-asset:${sha}`, context: 'Ο χειμώνας μας' })).json();
  ok(r.alt === 'A red boat on a calm lake at dawn.' && r.by === 'the test model', `described: ${JSON.stringify(r)}`);
  ok(seen[0].there && /\.(png|jpg)$/.test(seen[0].file) && /Ο χειμώνας μας/.test(seen[0].prompt) && /language those words are in/.test(seen[0].prompt), 'shown the picture and the slide’s words');
  ok(!fs.existsSync(seen[0].file), 'its copy gone after');
  ok(readAlt('A boat') === 'A boat' && readAlt('"photo of a dog running"') === 'A dog running', 'the description tidied');
  const svg = putAsset(db, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'));
  ok((await req('/api/write/describe', { src: `naget-asset:${svg}` })).statusCode === 415, 'a drawing (SVG) cannot be shown to it');
  ok((await req('/api/write/describe', { src: 'naget-asset:00000000000000000000' })).statusCode === 404 && (await req('/api/write/describe', { src: 'https://example.com/a.png' })).statusCode === 400, 'one not kept; not one of the app’s');
  setWriteForTests({ seer: async () => 'Image could not be processed, so no description was generated.' });
  const blind = await req('/api/write/describe', { src: `naget-asset:${sha}` });
  ok(blind.statusCode === 502 && /could not see the picture/.test(blind.json().error), `a model that says it cannot see it: an error, not a description: ${blind.body}`);
  // No model that sees pictures (Ollama picked, with none added): said so, with where to pick one.
  setWriteForTests({ seer: null });
  setCaptionChoice(db, { provider: 'ollama' });
  const none = await req('/api/write/describe', { src: `naget-asset:${sha}` });
  ok(none.statusCode === 400 && /No model with Ollama sees images/.test(none.json().error), `without a model that sees pictures, said so: ${none.body}`);
}

// ---- live checks, with the real models ---------------------------------------------------------------------------------

if (process.env.LIVE_IDEAS === '1') {
  setWriteForTests({ writer: null });
  const t0 = Date.now();
  const live = await req('/api/write/design-ideas', { deck, slide: 1, count: 3 });
  const j = live.json();
  console.log(`live ideas: ${live.statusCode} in ${Math.round((Date.now() - t0) / 1000)} s by ${j.model ?? '?'}: ${(j.names ?? []).join(', ')} ${j.error ?? ''}`);
  ok(live.statusCode === 200 && j.ideas.length >= 1, 'live ideas');
  if (live.statusCode === 200) fs.writeFileSync('/tmp/hydor-mr-e1-live-ideas.json', JSON.stringify({ deck, ...j }, null, 1));
}
if (process.env.LIVE_REWRITE === '1') {
  setWriteForTests({ helper: null });
  for (const how of ['shorter', 'formal', 'fix'] as const) {
    const t0 = Date.now();
    const live = await req('/api/write/rewrite', { text: 'Our sales grows by twenty percent this quater, mostly thanks to new customers in europe.\nTwo big partners joined us.', how, context: 'a slide titled “Q3 results”' });
    console.log(`live rewrite ${how}: ${live.statusCode} in ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(live.json())}`);
    ok(live.statusCode === 200, `live rewrite ${how}`);
  }
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
