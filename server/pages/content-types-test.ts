// Script tests for the kinds an agent makes from a type (shared/content-types.ts) and the requests made from them
// (shared/content-asks.ts): the catalog (unique ids, each kind's minimum, groups, real Lucide icons that the gallery
// carries, asks long and specific enough, the web format's own kinds only among slides), the requests the gallery and
// New send (a slide after another, a section or a part where it goes, something new with its name, theme, shape,
// folder and language), what "Turn it into" asks, finding a kind by its words, the agents' how_to_make, and that what
// goes to agents stays out of the app's dictionaries. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/content-types-test.ts
//   DATA_DIR=/tmp/hydor-test-content-types node dist/dev/content-types-test.js
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CONTENT_GROUPS, CONTENT_MIN, CONTENT_TYPES, contentType, findTypes, NEW_START, TURN_INTO, typesOf, type ContentKind, type PageKindName } from '../../shared/content-types.ts';
import { composeAsk, turnAsk } from '../../shared/content-asks.ts';
import { TYPE_ICONS } from '../../web/src/features/pages/types/icons.ts';
import { howToMakeStep } from '../../web/src/features/pages/types/step.ts';
import type { RunCtx } from '../features/types.ts';
import { HOW_TO_MAKE } from './content-types.ts';
import { pages } from './index.ts';

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

const KINDS = Object.keys(CONTENT_MIN) as ContentKind[];
const ROOT = process.env.NAGET_AGENT_ROOT ?? process.cwd();

// ---- the catalog ----------------------------------------------------------------------------------------------------

{
  const ids = CONTENT_TYPES.map((t) => t.id);
  ok(new Set(ids).size === ids.length, `every kind has an id of its own (${ids.filter((x, i) => ids.indexOf(x) !== i).join(', ')})`);
  for (const t of CONTENT_TYPES) ok(new RegExp(`^${t.kind}\\.[a-z0-9]+(-[a-z0-9]+)*$`).test(t.id), `${t.id}: its id is its kind and a name`);
  for (const k of KINDS) ok(typesOf(k).length >= CONTENT_MIN[k], `${k}: at least ${CONTENT_MIN[k]} (${typesOf(k).length})`);
  ok(KINDS.length === 7 && KINDS.every((k) => CONTENT_GROUPS[k]?.length), 'seven kinds, each with its groups');
  for (const k of KINDS)
    for (const g of CONTENT_GROUPS[k])
      ok(
        typesOf(k).some((t) => t.group === g.id),
        `${k}: the group “${g.label}” has kinds in it`,
      );
  for (const t of CONTENT_TYPES)
    ok(
      CONTENT_GROUPS[t.kind].some((g) => g.id === t.group),
      `${t.id}: its group is one of its kind’s`,
    );

  // Shown: short, one line, no full stops or trailing dots; unique on its kind's cards.
  for (const k of KINDS) {
    const labels = typesOf(k).map((t) => t.label.toLowerCase());
    ok(new Set(labels).size === labels.length, `${k}: no two cards say the same`);
  }
  for (const t of CONTENT_TYPES) {
    ok(t.label.length <= 32 && !/[.…]$/.test(t.label), `${t.id}: its label is short (${t.label})`);
    ok(t.blurb.length <= 60 && !/[.…]$/.test(t.blurb) && /^[A-Z0-9]/.test(t.blurb), `${t.id}: its blurb is one line (${t.blurb})`);
    ok(!!t.hint && t.hint.length <= 70 && !/[.…]$/.test(t.hint), `${t.id}: its hint says what the words might be (${t.hint})`);
    ok(!t.also || /^[a-z0-9&;' -]+$/.test(t.also), `${t.id}: its other words are plain lower case (${t.also})`);
  }

  // What the agent is asked: specific (long enough, not a novel), a noun in lower case to follow "…: ", a sentence.
  for (const t of CONTENT_TYPES) {
    ok(t.ask.length >= 160 && t.ask.length <= 900, `${t.id}: its ask is specific enough (${t.ask.length} characters)`);
    ok(/^(a|an|the|one|meeting) /.test(t.ask), `${t.id}: its ask starts as a noun in lower case (${t.ask.slice(0, 30)})`);
    ok(/\.$/.test(t.ask) && !/\s{2}|TODO|\.\./.test(t.ask), `${t.id}: its ask is tidy`);
  }
  // Pictures where they help: the kinds that are about pictures say how to make them.
  for (const id of ['slide.title', 'slide.key-point', 'slide.full-picture', 'slide.gallery', 'deck.launch', 'deck.kids-lesson', 'doc.recipe', 'page.landing', 'block.hero'])
    ok(/generate_image|make_svg/.test(contentType(id)?.ask ?? ''), `${id}: says how its pictures are made`);
  ok(/make_plot/.test(contentType('slide.chart')!.ask) && /make_plot/.test(contentType('doc.report')!.ask), 'charts beyond the chart part are made with make_plot');
  // Honest: what must be real is said so.
  for (const id of ['slide.big-number', 'slide.kpis', 'slide.quote', 'slide.testimonials', 'slide.market-size', 'deck.pitch', 'doc.cv', 'doc.research-paper', 'block.testimonials'])
    ok(/never|only|real/i.test(contentType(id)?.ask ?? ''), `${id}: says to invent nothing`);
  ok(/not legal advice/.test(contentType('doc.contract')!.ask), 'a contract draft says it is not legal advice');

  // The web format's own: slides only, each asking for one of its parts or a tap.
  const web = CONTENT_TYPES.filter((t) => t.web);
  ok(web.length >= 4 && web.every((t) => t.kind === 'slide'), `the web format’s own kinds are slides (${web.map((t) => t.id).join(', ')})`);
  for (const t of web) ok(/quiz part|scene3d part|html part|“tap”/.test(t.ask), `${t.id}: asks for the web format’s part`);
  for (const id of ['slide.quiz', 'slide.poll', 'slide.flashcard', 'slide.scene3d']) ok(contentType(id)?.web, `${id} needs the web format`);
  ok(!CONTENT_TYPES.some((t) => !t.web && /quiz part|scene3d part|html part/.test(t.ask) && t.kind === 'slide'), 'no slide for PowerPoint asks for a part of the web format');
}

// ---- icons: real Lucide icons, and the gallery carries each (and no more) ------------------------------------------------

{
  const lucide = path.dirname(createRequire(import.meta.url).resolve('lucide-react/package.json'));
  const pascal = (s: string) => s.replace(/(^|-)([a-z0-9])/g, (_m, _d, c: string) => c.toUpperCase());
  const used = new Set(CONTENT_TYPES.map((t) => t.icon));
  for (const name of used) {
    const file = path.join(lucide, 'dist/esm/icons', `${name}.mjs`);
    const src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    // An old name's file only points at the icon's own: the catalog uses the icon's own name.
    ok(src.includes('__iconData') && src.includes(`name: "${name}"`), `“${name}” is a Lucide icon of its own name`);
    const C = TYPE_ICONS[name] as { displayName?: string } | undefined;
    ok(C && C.displayName === pascal(name), `the gallery has “${name}” as Lucide’s ${pascal(name)} (${C?.displayName})`);
  }
  ok(
    Object.keys(TYPE_ICONS).every((k) => used.has(k)),
    `the gallery carries no icon the catalog does not use (${Object.keys(TYPE_ICONS)
      .filter((k) => !used.has(k))
      .join(', ')})`,
  );
}

// ---- the requests ---------------------------------------------------------------------------------------------------------

{
  const swot = contentType('slide.swot')!;
  const a = composeAsk(swot, '  our bakery: a strong local name, a small kitchen  ', { after: { index: 2, title: 'Pricing' }, webDeck: true });
  ok(a.startsWith(`Add one slide after slide 3 (“Pricing”): ${swot.ask} It is about: our bakery: a strong local name, a small kitchen.`), `a slide goes after the one named, with the words (${a.slice(0, 160)})`);
  ok(/read it with get_page/.test(a) && /the deck’s theme and the look of its other slides/.test(a) && /in its language/.test(a), 'drawn from the deck, in its look and language');
  ok(/save_slides with add, after 3\) and leave the others as they are/.test(a) && !/PowerPoint/.test(a), 'only that slide is added; a web deck needs no word on PowerPoint');
  const end = composeAsk(swot, '', {});
  ok(end.startsWith(`Add one slide at the end of the deck: ${swot.ask} Draw it`) && !/It is about/.test(end) && /save_slides with add\)/.test(end), 'with no slide named it goes at the end; no words, no “It is about”');
  const quizPptx = composeAsk(contentType('slide.quiz')!, '', { webDeck: false });
  ok(/PowerPoint compatible: use only what PowerPoint has \(no quiz, score, html, embed or 3D parts\)/.test(quizPptx) && /animations on a click/.test(quizPptx), 'a quiz for a PowerPoint compatible deck is made as near as PowerPoint allows');
  ok(/PowerPoint compatible: use only what PowerPoint has\./.test(composeAsk(swot, '', { webDeck: false })), 'any slide for such a deck keeps to PowerPoint');
  const longTitle = composeAsk(swot, '', { after: { index: 0, title: 'x'.repeat(300) } });
  ok(longTitle.includes(`(“${'x'.repeat(80)}”)`) && !longTitle.includes('x'.repeat(81)), 'a long title is cut short');
  ok(composeAsk(swot, 'y'.repeat(5000)).includes(`${'y'.repeat(2000)}.`) && !composeAsk(swot, 'y'.repeat(5000)).includes('y'.repeat(2001)), 'the words are kept to 2,000 characters');
  ok(composeAsk(swot, 'Done!').includes('It is about: Done! Draw'), 'words that end a sentence get no second full stop');

  const risks = contentType('section.risks')!;
  const s = composeAsk(risks, '', { at: 'after the section “Plan”' });
  ok(s.startsWith(`Add a section after the section “Plan”: ${risks.ask} Draw it from what the document already says (read it with get_page)`) && /save_doc with edits/.test(s), `a section goes where it is put (${s.slice(0, 80)})`);
  ok(composeAsk(risks, '', {}).startsWith('Add a section where it fits best in the document: '), 'with no place, where it fits best');
  const faq = contentType('block.faq')!;
  const b = composeAsk(faq, 'our cafe', { at: 'after the part picked (`section#menu`)' });
  ok(b.startsWith(`Add a part to the page after the part picked (\`section#menu\`): ${faq.ask} It is about: our cafe.`) && /page’s own look/.test(b) && /save_page and its id/.test(b), 'a part goes in the page, in its look');

  const pitch = contentType('deck.pitch')!;
  const d = composeAsk(pitch, 'Acme Bakery, raising $500k', { title: 'Acme seed round', theme: { id: 'midnight', label: 'Midnight' }, ratio: '16:9', folder: 'Investors/2026', lang: 'Greek' });
  ok(
    d ===
      `${NEW_START.deck}${pitch.ask} It is about: Acme Bakery, raising $500k. Call it “Acme seed round”. Make it in the Midnight theme (the preset “midnight”), with wide 16:9 slides. Keep it in my Library folder “Investors/2026”. Write it in Greek.`,
    `a new deck: as New asks, with its name, theme, shape, folder and language (${d.slice(-220)})`,
  );
  ok(/standard 4:3 slides\.$/.test(composeAsk(pitch, '', { ratio: '4:3' })), 'a standard deck says so');
  ok(!/Write it in/.test(composeAsk(pitch, '', { lang: 'English' })), 'English needs no word on the language');
  ok(
    composeAsk(contentType('doc.cv')!, '').startsWith(NEW_START.doc) && composeAsk(contentType('page.kanban')!, '').startsWith(NEW_START.page) && composeAsk(contentType('sheet.budget')!, '').startsWith(NEW_START.sheet),
    'documents, pages and spreadsheets start as New’s Or describe it does',
  );
  ok(!/theme|slides\./.test(composeAsk(contentType('doc.cv')!, '', { theme: { id: 'ocean', label: 'Ocean' }, ratio: '16:9' })), 'only a deck has a theme and a shape');

  // Words alone, no kind picked (nothing in the gallery is called that).
  ok(composeAsk(null, 'our three offices on a map', { kind: 'slide', after: { index: 0, title: '' } }).startsWith('Add one slide after slide 1: our three offices on a map. Draw it'), 'a slide in the words alone');
  ok(composeAsk(null, 'a tracker of my plants', { kind: 'page' }) === `${NEW_START.page}a tracker of my plants.`, 'a page in the words alone, as New asks');
  ok(composeAsk(null, '   ', { kind: 'slide' }) === '', 'no kind and no words: nothing to ask');
}

// ---- Turn it into ---------------------------------------------------------------------------------------------------------

{
  const NOUNS: Record<PageKindName, string> = { page: 'page', slides: 'deck', doc: 'document', sheet: 'spreadsheet', tex: 'LaTeX document', notebook: 'notebook' };
  for (const from of Object.keys(TURN_INTO) as PageKindName[]) {
    ok(TURN_INTO[from].length >= 2 && !TURN_INTO[from].includes(from as never), `${from}: turns into others, never itself`);
    for (const to of TURN_INTO[from]) {
      const t = turnAsk({ from, to, id: 'abc123def0', title: 'Q3 “report”' });
      ok(t.includes(`my ${NOUNS[from]} “Q3 “report”” (saved page abc123def0)`) && /read it with get_page/.test(t) && t.endsWith(`Leave the ${NOUNS[from]} itself as it is.`), `${from} → ${to}: named by its id, read first, left as it is`);
      ok(to === 'slides' ? /^Make slides from/.test(t) : to === 'doc' ? /^Write a document from/.test(t) : /^Make a page from/.test(t), `${from} → ${to}: makes the other kind`);
      ok(new RegExp(`in the language the ${NOUNS[from]} is in`).test(t), `${from} → ${to}: in its language`);
    }
  }
  ok(/speaker notes written out/.test(turnAsk({ from: 'slides', to: 'doc', id: 'x', title: 'Talk' })), 'a deck written out as a document has its notes in it');
  ok(/a dashboard of its numbers/.test(turnAsk({ from: 'sheet', to: 'page', id: 'x', title: 'Sales' })), 'a spreadsheet as a page is a dashboard');
  ok(/Put it in my Library folder “Reports\/2026”, beside it\./.test(turnAsk({ from: 'doc', to: 'slides', id: 'x', title: 'Q3', folder: 'Reports/2026' })), 'it goes in the folder of what it was made from');
}

// ---- finding a kind by its words ------------------------------------------------------------------------------------------

{
  const first = (q: string, kind?: ContentKind) => findTypes(q, { kind })[0]?.id;
  ok(first('swot slide') === 'slide.swot' && first('SWOT') === 'slide.swot', 'a SWOT slide, by name');
  ok(first('pitch deck') === 'deck.pitch', 'a pitch deck');
  ok(first('cover letter') === 'doc.cover-letter', 'a cover letter, not a cover page');
  ok(first('resume') === 'doc.cv' && first('résumé') === 'doc.cv' && first('curriculum vitae') === 'doc.cv', 'a CV, however it is written');
  ok(first('habit tracker') === 'page.habit-tracker' && first('habit tracker', 'sheet') === 'sheet.habits' && first('habit tracker spreadsheet') === 'sheet.habits', 'a habit tracker: a page, or a spreadsheet when asked');
  ok(first('q&a') === 'slide.qa' && first('2x2') === 'slide.matrix' && first('tam sam som') === 'slide.market-size', 'by the words people use');
  ok(first('pricing table') === 'block.pricing' && first('executive summary', 'section') === 'section.exec-summary', 'parts and sections');
  ok(findTypes('xyzzy plugh').length === 0, 'nothing for words nothing has');
  ok(findTypes('slides').length === typesOf('deck').length && findTypes('').length === 0 && findTypes('', { kind: 'block' }).length === typesOf('block').length, 'a kind named alone: all of it');
  ok(first('四象限', 'slide') === undefined && findTypes('四象限', { kind: 'slide', shown: (t) => (t.id === 'slide.matrix' ? '四象限矩阵' : '') })[0]?.id === 'slide.matrix', 'by what the page shows in its language');
}

// ---- the agents' how_to_make ------------------------------------------------------------------------------------------------

{
  const tool = pages.tools!({} as RunCtx).find((t) => t.name === 'how_to_make');
  ok(tool === HOW_TO_MAKE && tool.annotations?.readOnlyHint, 'agents have how_to_make with the pages’ tools, as a read');
  ok(/by name/.test(HOW_TO_MAKE.description) && /free/.test(HOW_TO_MAKE.description) && /lists every kind/.test(HOW_TO_MAKE.description), 'its description says when to use it and what it costs');
  const run = async (a: Record<string, unknown>) => String(await HOW_TO_MAKE.run(a, {} as RunCtx));
  const swot = await run({ what: 'add a SWOT slide' });
  ok(swot.startsWith('SWOT analysis (a slide added to a deck; strengths, weaknesses, opportunities, threats): a SWOT analysis:') && swot.includes(contentType('slide.swot')!.ask), `the SWOT slide’s ask (${swot.slice(0, 120)})`);
  ok(/Adding it: read the deck with get_page/.test(swot) && /save_slides \(add, after the slide it follows\)/.test(swot), 'and how to add it to the deck');
  const habits = await run({ what: 'habit tracker' });
  ok(habits.startsWith('Habit tracker (a new page;') && /Others close to it: Habit tracker \(a new spreadsheet\)/.test(habits), 'the best first, the others named');
  ok((await run({ what: 'habit tracker', kind: 'sheet' })).startsWith('Habit tracker (a new spreadsheet;'), 'its kind narrows it');
  ok(/It needs the web format\./.test(await run({ what: 'quiz', kind: 'slide' })), 'a slide of the web format says so');
  const all = await run({});
  ok(all.startsWith(`The kinds the app knows how to make (${CONTENT_TYPES.length})`) && KINDS.every((k) => all.includes(`${typesOf(k)[0].label},`)) && /Slides added to a deck: Title slide, Agenda/.test(all), 'with no words: every kind, by kind');
  const blocks = await run({ kind: 'block' });
  ok(/^The kinds the app knows how to make \(\d+\)/.test(blocks) && /Parts added to a page:/.test(blocks) && !/Slides added/.test(blocks), 'with a kind alone: that kind’s list');
  ok(/^No kind the app knows matches “xyzzy”: make it as the user asks/.test(await run({ what: 'xyzzy' })), 'nothing known: make it as asked');
  ok(howToMakeStep({ status: 'done', input: { what: 'SWOT slide' } }).title === 'how to make “SWOT slide”' && howToMakeStep({ status: 'running', input: {} }).verb === 'Reading', 'it reads as a step of the work');
}

// ---- what goes to agents stays out of the dictionaries ------------------------------------------------------------------

{
  const x = fs.readFileSync(path.join(ROOT, 'scripts/i18n-extract.mjs'), 'utf8');
  ok(/QUIET_IN = \{ 'shared\/content-types\.ts': \['ask'\] \}/.test(x), 'the extractor leaves the kinds’ asks out');
  ok(/NO_WORDS = new Set\(\[[^\]]*'shared\/content-asks\.ts'/.test(x), 'and the requests made from them');
  const asks = fs.readFileSync(path.join(ROOT, 'shared/content-asks.ts'), 'utf8');
  ok(!/\b(label|blurb|hint): '/.test(asks), 'the requests’ file holds nothing the pages show');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
