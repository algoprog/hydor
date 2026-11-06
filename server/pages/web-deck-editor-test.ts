// Script tests for the slides editor's side of the web format: the parts Insert puts on a slide (code, custom code,
// a web page, a quiz, its score, 3D) as the deck keeps them; the ready-made pages a custom code part starts from; a web
// page's address as the editor takes it (https only, an embed code's address, nothing of this computer's network);
// a deck made PowerPoint compatible and back, and what the dialog lists by slide; the lengths new effects and
// transitions start with, as the deck's own; and the menus as each format has them (Insert → Interactive, File →
// PowerPoint compatible and the progress bar, Run on a live part). Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/web-deck-editor-test.ts
//   DATA_DIR=/tmp/hydor-test-web-deck-editor node dist/dev/web-deck-editor-test.js
import { ANIM_FX, newDeck, normalizeDeck, RICH_ANIM_FX, RICH_TRANSITIONS, RICH_TYPES, richFeatures, SLIDE_LIMITS, toPowerPoint, TRANSITIONS, everyEl, type Anim, type Deck, type El, type QuizEl } from '../../shared/slides.ts';
import { codePart, effectDur, embedAddress, embedPart, featuresBySlide, htmlPart, isLive, quizPart, scene3dPart, scorePart, toWebFormat, transitionDur } from '../../web/src/features/pages/slides/ops.ts';
import { STARTERS } from '../../web/src/features/pages/slides/starters.ts';
import { slidesMenus, type MenuArgs } from '../../web/src/features/pages/slides/SlidesMenus.tsx';
import type { MenuAction, MenuEntry } from '../../web/src/features/pages/common/menus.tsx';

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

/** A deck with one slide holding `els`, as the server keeps it. */
const kept = (els: El[], more: Partial<Deck> = {}): Deck => {
  const d = newDeck('Test');
  return normalizeDeck({ ...d, ...more, slides: [{ ...d.slides[0], els: [...d.slides[0].els, ...els] }] });
};
const partOf = (d: Deck, id: string) => everyEl(d.slides[0].els).find((e) => e.id === id);

// ---- the parts Insert puts on a slide, as the deck keeps them ----------------------------------------------------
{
  const d0 = newDeck('Test');
  ok(d0.format === undefined, 'a new deck is a web deck (its format left out)');
  const code = codePart(d0);
  const html = htmlPart(d0);
  const embed = embedPart(d0, 'https://www.openstreetmap.org/export/embed.html?bbox=-0.1,51.5,0,51.52');
  const quiz = quizPart(d0);
  const score = scorePart(d0);
  const s3 = scene3dPart(d0);
  const d = kept([code, html, embed, quiz, score, s3]);
  const c = partOf(d, code.id);
  ok(c?.type === 'code' && c.code === code.code && c.lang === 'python' && c.lineNumbers === true && c.size === code.size, 'Code lands as written: Python, numbered lines');
  const h = partOf(d, html.id);
  ok(h?.type === 'html' && h.html === html.html && h.interactive === true, 'Custom code lands with its page as it is, taking clicks (it has a button)');
  ok(h?.type === 'html' && /var\(--n-accent\)/.test(h.html) && /<button/.test(h.html), 'the custom code it starts with is drawn in the deck’s colours, with a button to press');
  const m = partOf(d, embed.id);
  ok(m?.type === 'embed' && m.url === embed.url && m.interactive === true, 'a web page lands at its address, taking clicks');
  const q = partOf(d, quiz.id) as QuizEl | undefined;
  ok(q?.type === 'quiz' && q.choices.length === 3 && q.choices.filter((x) => x.correct).length === 1 && !q.multi && !!q.explain && q.choices.every((x) => !!x.why), 'a quiz lands with three choices, one right, each with what is said, and what is said after');
  const sc = partOf(d, score.id);
  ok(sc?.type === 'score' && /\{right\}/.test(sc.text ?? '') && /\{total\}/.test(sc.text ?? ''), 'a quiz score lands with words that show the score');
  const t = partOf(d, s3.id);
  ok(t?.type === 'scene3d' && t.shape === 'knot' && (t.spin ?? 0) > 0 && t.orbit === true && t.material === 'glossy', 'a 3D shape lands turning slowly, the pointer able to turn it');
  ok(d.slides[0].els.length === d0.slides[0].els.length + 6, 'none of them is dropped');
  // Words in the user's language: the words given go in.
  const zh = quizPart(d0, (w) => `«${w}»`);
  ok(zh.question.startsWith('«') && zh.choices.every((x) => x.text.startsWith('«')), 'a quiz’s own words come in the editor’s language');
  ok(scorePart(d0, (w) => w.replace('You got', 'Tu as')).text?.startsWith('Tu as'), 'a quiz score’s words too');
  ok(isLive(h) && isLive(m) && isLive(t) && !isLive(q) && !isLive(sc) && !isLive(c), 'custom code, web pages and 3D run in frames; quizzes, scores and code are drawn');
}

// ---- the ready-made pages ---------------------------------------------------------------------------------------
{
  ok(STARTERS.length >= 3 && new Set(STARTERS.map((s) => s.id)).size === STARTERS.length, 'a few ready-made pages, each its own');
  for (const s of STARTERS) {
    ok(s.html.length < SLIDE_LIMITS.html, `${s.id}: under the custom code limit`);
    ok(/var\(--n-|'--n-c/.test(s.html), `${s.id}: drawn in the deck’s colours (its CSS variables)`);
    ok(!/https?:\/\//.test(s.html), `${s.id}: loads nothing from the web, so it runs with no network`);
    ok(!s.interactive || /<button|onclick|addEventListener\('(click|pointer)/i.test(s.html), `${s.id}: takes clicks only when it has something to press`);
    const d = kept([{ ...htmlPart(newDeck('x')), id: 'h1', html: s.html }]);
    const h = partOf(d, 'h1');
    ok(h?.type === 'html' && h.html === s.html, `${s.id}: kept by the deck exactly as it is`);
  }
}

// ---- a web page's address ---------------------------------------------------------------------------------------
{
  ok(embedAddress('example.com/page') === 'https://example.com/page', 'an address without https:// gets it');
  ok(embedAddress('  https://www.openstreetmap.org/export/embed.html  ') === 'https://www.openstreetmap.org/export/embed.html', 'an address is trimmed');
  ok(embedAddress('http://example.com') === null, 'http: is refused');
  ok(embedAddress('javascript:alert(1)') === null && embedAddress('data:text/html,hi') === null, 'scripts and data: are refused');
  ok(embedAddress('https://localhost:8080/') === null && embedAddress('https://192.168.1.20/') === null && embedAddress('https://10.0.0.1/x') === null, 'nothing of this computer or its network');
  ok(embedAddress('https://user:pw@example.com/') === null, 'no address with a name and password in it');
  ok(embedAddress('<iframe width="600" src="https://www.google.com/maps/embed?pb=1&amp;x=2" allowfullscreen></iframe>') === 'https://www.google.com/maps/embed?pb=1&x=2', 'an embed code gives its address');
  ok(embedAddress('//codepen.io/a/embed/b') === 'https://codepen.io/a/embed/b', 'an address without its scheme gets https');
  const yt = embedAddress('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  ok(!!yt && yt.includes('youtube') && yt.includes('/embed/'), 'a YouTube video becomes its player');
  ok(embedAddress('') === null && embedAddress('not an address at all') === null, 'nothing, or words, are no address');
}

// ---- PowerPoint compatible, and back --------------------------------------------------------------------------------
{
  const d0 = newDeck('Test');
  const quiz = quizPart(d0);
  const html = htmlPart(d0);
  const two: Deck = { ...d0, progress: true, slides: [{ ...d0.slides[0], els: [...d0.slides[0].els, quiz] }, { id: 's2', els: [html], transition: { fx: 'cube', dur: 900 }, bg: { fx: 'aurora' } }] };
  const d = normalizeDeck(two);
  const list = richFeatures(d);
  const by = featuresBySlide(list);
  ok(
    by.map((x) => x.slide).join() ===
      [...new Set(list.map((f) => f.slide))]
        .sort((a, b) => a - b)
        .join(),
    'the dialog lists them slide by slide, in order',
  );
  ok(by[0]?.slide === 0 && by[0].items.some((f) => f.kind === 'progress'), 'the deck’s own (the progress bar) come first, as the whole deck');
  ok(by.find((x) => x.slide === 1)?.items.some((f) => f.kind === 'part' && f.el === quiz.id), 'the quiz is listed on its slide');
  const s2 = by.find((x) => x.slide === 2)?.items ?? [];
  ok(s2.some((f) => f.kind === 'part' && f.el === html.id) && s2.some((f) => f.kind === 'transition' && f.from === 'cube' && !!f.to) && s2.some((f) => f.kind === 'bgFx'), 'custom code, the cube transition (with what it becomes) and the moving background on slide 2');
  ok(by.reduce((n, x) => n + x.items.length, 0) === list.length, 'nothing is left off the list');
  const pp = toPowerPoint(d);
  ok(pp.format === 'pptx' && !pp.progress && !pp.slides.some((s) => everyEl(s.els).some((e) => RICH_TYPES.includes(e.type))), 'made compatible, it has only what PowerPoint has');
  ok(!richFeatures(pp).length, 'and nothing left that PowerPoint cannot keep');
  const back = toWebFormat(pp);
  ok(back.format === undefined && back.slides === pp.slides, 'back to the web format: nothing else changes');
  ok(toWebFormat(d) === d, 'a web deck stays as it is');
  ok(normalizeDeck(back).format === undefined, 'the web format is kept as the field left out');
}

// ---- the lengths new effects and transitions start with ---------------------------------------------------------------
{
  const d0 = newDeck('Test');
  const el = d0.slides[0].els[0];
  for (const type of ['in', 'em', 'out'] as const)
    for (const fx of [...ANIM_FX[type], ...RICH_ANIM_FX[type]]) {
      const d = normalizeDeck({ ...d0, slides: [{ ...d0.slides[0], anims: [{ el: el.id, type, fx, on: 'click' } as unknown as Anim] }] });
      const a = d.slides[0].anims?.[0];
      ok(a?.fx === fx && (fx === 'appear' || a.dur === effectDur(fx)), `${type} ${fx}: starts as long as the deck takes it when it does not say`);
    }
  for (const fx of [...TRANSITIONS, ...RICH_TRANSITIONS]) {
    if (fx === 'none') continue;
    const d = normalizeDeck({ ...d0, slides: [{ ...d0.slides[0], transition: { fx } }] });
    ok(d.slides[0].transition?.fx === fx && d.slides[0].transition.dur === transitionDur(fx), `the ${fx} transition starts as long as the deck takes it`);
  }
  // A part may start its own effect when clicked, or another's.
  const d = normalizeDeck({ ...d0, slides: [{ ...d0.slides[0], anims: [{ el: el.id, type: 'em', fx: 'wiggle', on: 'tap', trigger: el.id, dur: 700, delay: 0 }] }] });
  ok(d.slides[0].anims?.[0]?.on === 'tap' && d.slides[0].anims[0].trigger === el.id, 'a part clicked runs its own effect');
}

// ---- the menus, by format -----------------------------------------------------------------------------------------
{
  const noop = () => {};
  const args = (o: Partial<MenuArgs>): MenuArgs =>
    new Proxy({ web: true, progress: false, canSave: false, wide: true, pageLayout: true, picked: [], canUndo: false, canRedo: false, canPaste: false, hasLook: false, painting: false, zoom: 'fit', grid: { show: false, snap: false, size: 40 }, rulers: false, notesOpen: true, gridView: false, hidden: false, text: null, hasGuides: false, running: false, ...o } as MenuArgs, {
      get: (t, k) => (k in t ? (t as unknown as Record<string | symbol, unknown>)[k] : noop),
    });
  const items = (m: MenuEntry[]) => m.filter((x): x is MenuAction => !!x && x !== '-');
  const menu = (a: MenuArgs, label: string) => items(slidesMenus(a).find((m) => m.label === label)?.items ?? []);
  const find = (a: MenuArgs, label: string, item: string) => menu(a, label).find((x) => x.label === item);
  const web = args({});
  const pptx = args({ web: false });
  ok(slidesMenus(web)[0]?.label === 'File', 'File is the first menu');
  ok(find(web, 'File', 'PowerPoint compatible')?.checked === false && find(pptx, 'File', 'PowerPoint compatible')?.checked === true, 'File → PowerPoint compatible is ticked only for a PowerPoint compatible deck');
  ok(!!find(web, 'File', 'Progress bar in the slideshow') && !find(pptx, 'File', 'Progress bar in the slideshow'), 'the progress bar is the web format’s');
  ok(find(args({ progress: true }), 'File', 'Progress bar in the slideshow')?.checked === true, 'ticked when the deck has it');
  const inter = find(web, 'Insert', 'Interactive');
  ok(items(inter?.items ?? []).map((x) => x.label).join() === 'Custom code,Web page,Quiz,Quiz score,3D', 'Insert → Interactive: custom code, a web page, a quiz, its score, 3D');
  ok(!!find(pptx, 'Insert', 'Interactive'), 'a PowerPoint compatible deck still offers them (asking first)');
  ok(!!find(web, 'Insert', 'Code') && !!find(pptx, 'Insert', 'Code'), 'Insert → Code in both formats');
  const quiz = quizPart(newDeck('x'));
  const html = htmlPart(newDeck('x'));
  ok(!find(args({ picked: [quiz] }), 'Format', 'Run it here') && find(args({ picked: [html] }), 'Format', 'Run it here')?.label === 'Run it here', 'Format → Run it here for a live part alone');
  ok(!!find(args({ picked: [html], running: true }), 'Format', 'Stop it'), 'and Stop it while it runs');
  ok(find(args({ readOnly: true }), 'Insert', 'Interactive')?.disabled === true && find(args({ readOnly: true }), 'File', 'PowerPoint compatible')?.disabled === true, 'nothing to change in a version looked at');
  // The AI tools, where the editor has them.
  const pic = menu(web, 'Insert').find((x) => x.label === 'Picture');
  ok(items(pic?.items ?? []).map((x) => x.label).join() === 'From this device,From a web address,Make with AI,Drawing (SVG)', 'Insert → Picture: from this device, a web address, made with AI, a drawing (SVG)');
  ok(!!find(web, 'Insert', 'Plot'), 'Insert → Plot');
  ok(items(find(web, 'Insert', 'Video')?.items ?? []).some((x) => x.label === 'Make with AI'), 'Insert → Video → Make with AI');
  const photo = { id: 'im', type: 'image', src: 'naget-asset:0123456789abcdef', x: 0, y: 0, w: 10, h: 10 } as El;
  ok(['Change with AI', 'Remove the background', 'Erase part of it'].every((l) => !!find(args({ picked: [photo] }), 'Format', l)), 'Format: a picture picked is changed with AI, its background removed, part of it erased');
  ok(!find(args({ picked: [{ ...photo, src: '' } as El] }), 'Format', 'Change with AI'), 'not an empty picture frame');
  const chart = { id: 'ch', type: 'chart', kind: 'column', labels: ['a'], series: [{ name: 's', values: [1] }], size: 18, x: 0, y: 0, w: 10, h: 10 } as El;
  ok(!!find(args({ picked: [chart] }), 'Format', 'Make a plot of this'), 'Format: a chart picked is made a plot');
  const bare = args({ aiPicture: undefined, aiDrawing: undefined, aiPlot: undefined, aiVideo: undefined, aiEdit: undefined, aiPlotChart: undefined });
  ok(!find(bare, 'Insert', 'Plot') && items(bare && (menu(bare, 'Insert').find((x) => x.label === 'Picture')?.items ?? [])).length === 2, 'without the tools (a version looked at), none of them');
  // Every menu fits a small laptop's window (811×667) without scrolling: its rows (34 px), lines (9 px) and its edges under the menu bar.
  for (const m of slidesMenus(web)) {
    const list = m.items.filter(Boolean);
    const h = list.filter((x) => x !== '-').length * 34 + list.filter((x) => x === '-').length * 9 + 8;
    ok(h <= 667 - 48 - 20, `${m.label}: fits on the screen (${h} px)`);
  }
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
