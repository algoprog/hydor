// Script tests for agents' edits appearing live: reading a tool call's JSON while it is still being written
// (shared/partial-json.ts), the version being written over the one open (shared/page-drafts.ts and its builders),
// the small changes agents make without sending a whole document (shared/doc-edits.ts), and the server's drafts of
// save_doc, save_slides, save_sheet and save_latex (drafts.ts): sent to the session and to the page's editor, told
// once the save is kept or failed. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/live-test.ts
//   DATA_DIR=/tmp/hydor-live-test node dist/dev/live-test.js
import { blockText, normalizeDoc, type Doc } from '../../shared/docs.ts';
import { applyDocEdits } from '../../shared/doc-edits.ts';
import { draftDoc, tidyEnd } from '../../shared/draft-doc.ts';
import { applyDeckEdits } from '../../shared/deck-edits.ts';
import { draftDeck } from '../../shared/draft-deck.ts';
import { DraftMemo, alike } from '../../shared/page-drafts.ts';
import { normalizeDeck, type Deck } from '../../shared/slides.ts';
import { applyBookEdits } from '../../shared/sheet-edits.ts';
import { draftBook } from '../../shared/draft-book.ts';
import { normalizeBook } from '../../shared/sheets.ts';
import { normalizeTex } from '../../shared/latex.ts';
import { draftTex, linesOver } from '../../shared/draft-tex.ts';
import { applyTexEdits } from '../../shared/tex-edits.ts';
import { readPartial } from '../../shared/partial-json.ts';
import type { Deps } from '../features/types.ts';
import { draftsOf, draftsOfPage, endDrafts, feedDraft, settleDraft } from './drafts.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- made-up documents -------------------------------------------------------------------------------------
const para = (i: number, words = 40) => Array.from({ length: words }, (_, k) => ['the', 'team', 'shipped', 'faster', 'while', 'tickets', 'fell', 'across', 'regions', 'this', 'quarter'][(i * 7 + k * 3) % 11]).join(' ') + '.';
function report(sections: number, changed: (s: number) => boolean = () => false): string {
  const out = ['# Quarterly report {.title}', ''];
  for (let s = 1; s <= sections; s++) {
    out.push(`## ${s}\\. Section ${s}`, '', changed(s) ? `Rewritten: ${para(s + 100)}` : para(s), '', para(s + 50), '');
    if (s % 3 === 0) out.push(`- ${para(s, 6)}`, `- ${para(s + 1, 6)}`, '');
  }
  return out.join('\n');
}
const textOf = (d: Doc) => d.blocks.map(blockText).join('\n');

// ---- partial JSON ------------------------------------------------------------------------------------------
{
  const input = { id: '0123456789', title: 'Plan "B"', markdown: 'Line one\nLine two — ✓ 😀 \\ done', n: 42, flag: true, list: [1, { a: 'x', b: [null, false] }, 'end'], empty: {} };
  const json = JSON.stringify(input);
  let threw = false;
  let grew = true;
  let prevLen = -1;
  for (let i = 0; i <= json.length; i++) {
    try {
      const p = readPartial(json.slice(0, i));
      const md = (p.value as { markdown?: string } | undefined)?.markdown;
      if (typeof md === 'string') {
        if (md.length < prevLen && !(i < json.length && json[i - 1] === '\\')) grew = false;
        prevLen = md.length;
      }
    } catch {
      threw = true;
    }
  }
  ok(!threw, 'every start of a JSON text reads without throwing');
  ok(grew, 'a string being written only grows');
  const whole = readPartial(json);
  ok(eq(whole.value, input) && whole.open === null, 'a whole text reads as JSON.parse reads it, nothing open');
  const cut = readPartial('{"title":"Pl');
  ok(eq(cut.value, { title: 'Pl' }) && eq(cut.open, ['title']) && cut.inString, 'a string cut short is there as far as it came, and the text stopped in it');
  ok(eq(readPartial('{"n":12').value, {}) && eq(readPartial('{"n":12').open, ['n']), 'a number that may go on is left out');
  ok(eq(readPartial('{"n":12,').value, { n: 12 }), 'and is in once something follows it');
  ok(eq(readPartial('{"ok":tr').value, {}), 'a word cut short is left out');
  ok(eq(readPartial('{"a":"x\\').value, { a: 'x' }) && eq(readPartial('{"a":"x\\u00e').value, { a: 'x' }), 'an escape cut short is left out');
  ok(eq(readPartial('{"a":"\\ud83d').value, { a: '' }), 'half of a character written as two escapes waits for its other half');
  ok(eq(readPartial('{"ti').value, {}) && eq(readPartial('{"title"').value, {}) && eq(readPartial('{"title":').value, {}), 'a key without its value yet is left out');
  const deep = readPartial('{"slides":[{"title":"One"},{"title":"Tw');
  ok(eq(deep.value, { slides: [{ title: 'One' }, { title: 'Tw' }] }) && eq(deep.open, ['slides', 1, 'title']), 'what is open is closed: the path says where the text stopped');
  const after = readPartial('{"slides":[{"title":"One"}');
  ok(eq(after.open, ['slides']) && !after.inString, 'after a whole element, the list is what is open');
  ok(readPartial('').value === undefined && readPartial('  ').value === undefined, 'nothing yet reads as nothing');
}

// ---- documents: the version being written ---------------------------------------------------------------------
{
  const base = normalizeDoc({ markdown: report(12) });
  const target = normalizeDoc({ markdown: report(12, (s) => s % 4 === 0) });
  const json = JSON.stringify({ id: '0123456789', title: 'Report', markdown: report(12, (s) => s % 4 === 0) });
  const memo = new DraftMemo();
  let prev: Doc | null = null;
  let reused = 0;
  let draws = 0;
  let longest = base.blocks.length;
  let marks = 0;
  let neverBlank = true;
  for (let cut = 40; cut < json.length; cut += 97) {
    const d = draftDoc(base, readPartial(json.slice(0, cut)), memo);
    if (!d) continue;
    draws++;
    if (d.mark) marks++;
    longest = Math.max(longest, d.model.blocks.length);
    // A long document written again never shows as a blank page filling up: its old rest is there.
    if (d.model.blocks.length < base.blocks.length - 3) neverBlank = false;
    if (prev) {
      const s = new Set(prev.blocks);
      reused += d.model.blocks.filter((b) => s.has(b)).length / d.model.blocks.length;
    }
    prev = d.model;
  }
  ok(neverBlank, 'a document written again shows its old rest after what has come so far');
  ok(draws > 10 && reused / (draws - 1) > 0.9, 'what did not change between two draws is the same object (an editor draws only the rest)');
  ok(marks > draws * 0.8, 'while its words come, the mark says where');
  ok(longest <= base.blocks.length + 4, 'a changed paragraph takes the place of the one it rewrites, rather than pushing the rest down');
  const end = draftDoc(base, readPartial(json), memo)!;
  ok(textOf(end.model) === textOf(target) && end.mark === null, 'written whole, it is the document the call says, nothing of the old one after it');
  const untouched = draftDoc(base, readPartial(json.slice(0, 120)), new DraftMemo())!;
  ok(
    untouched.model.blocks.slice(3).every((b, i) => b === base.blocks[i + 3]),
    'the blocks not reached yet are the open version’s own',
  );
  const fresh = draftDoc(null, readPartial('{"title":"Letter","markdown":"# Dear Sam\\n\\nThank you for'), new DraftMemo())!;
  ok(fresh.model.blocks.length === 2 && blockText(fresh.model.blocks[1]) === 'Thank you for' && fresh.mark?.kind === 'doc' && fresh.mark.at === 13, 'a new document grows from its first words, the mark at their end');
  ok(draftDoc(base, readPartial('{"id":"0123456789","title":"Rep'), new DraftMemo())!.model.blocks === base.blocks, 'before its words come, the open version shows as it is');
  ok(draftDoc(null, readPartial('{"title":"x"'), new DraftMemo()) === null, 'a new one with nothing written yet shows nothing');
  ok(tidyEnd('Words with **bold') === 'Words with **bold**' && tidyEnd('A line {.cen') === 'A line' && tidyEnd('```\ncode **x') === '```\ncode **x', 'the end being written is tidied: marks closed, attributes not shown, code left as it is');
  ok(alike('the team shipped faster', 'the team shipped faster while tickets fell') && !alike('pricing for next year', 'the team shipped faster while tickets fell'), 'a paragraph changed is told from another one');
  // A draft of small changes: the section being written shows in place.
  const edits = JSON.stringify({ id: '0123456789', edits: [{ section: '4. Section 4', markdown: '## 4. Section four\n\nNew words for the fourth section, still coming' }] });
  const ed = draftDoc(base, readPartial(edits.slice(0, -12)), new DraftMemo())!;
  ok(textOf(ed.model).includes('New words for the fourth section') && !textOf(ed.model).includes('Section 4\n') && ed.mark?.kind === 'doc', 'a section being written again shows in its place, with the mark');
  ok(textOf(ed.model).includes('Section 5') && textOf(ed.model).includes('Section 3'), 'and the rest of the document as it is');
}

// ---- documents: small changes ------------------------------------------------------------------------------------
{
  const base = normalizeDoc({ markdown: report(5) });
  const md = (edits: unknown[]) => applyDocEdits(base, edits)!.markdown;
  const throws = (edits: unknown[], what: RegExp) => {
    try {
      applyDocEdits(base, edits);
      return false;
    } catch (e) {
      return what.test((e as Error).message);
    }
  };
  ok(md([{ find: 'Quarterly report', replace: 'Year report' }]).startsWith('Year report'), 'find and replace changes the words once');
  ok(throws([{ find: 'Section', replace: 'Part' }], /times: give more of the words around it/), 'words found more than once are not guessed at');
  ok(!md([{ find: 'Section', replace: 'Part', all: true }]).includes('Section'), 'all: true changes every one');
  ok(throws([{ find: 'nowhere to be found', replace: 'x' }], /not in the document/), 'words not there say so');
  const sec = md([{ section: '2. Section 2', markdown: '## 2. Section two\n\nShort.' }]);
  ok(sec.includes('## 2\\. Section two') || sec.includes('## 2. Section two'), 'a section is written again, its heading too');
  ok(sec.includes('Short.') && !sec.includes(para(2)) && sec.includes(para(3)), 'only that section changes, up to the next heading of its level');
  ok(!md([{ section: 'section 3', markdown: '' }]).includes('Section 3'), 'a section sent empty is taken out (its words matched in any case, its number’s escape left out)');
  const after = md([{ after: '1. Section 1', markdown: '## Pricing\n\nNew prices.' }]);
  ok(after.indexOf('## Pricing') > after.indexOf(para(51)) && after.indexOf('## Pricing') < after.indexOf('Section 2'), 'after a section: at its end, before the next heading');
  const before = md([{ before: '1. Section 1', markdown: 'Intro.' }]);
  ok(before.indexOf('Intro.') < before.indexOf('Section 1'), 'before a section: before its heading');
  ok(md([{ append: '## The end\n\nThanks.' }]).endsWith('## The end\n\nThanks.'), 'append adds at the end');
  ok(throws([{ section: 'No such heading', markdown: 'x' }], /no heading “No such heading”.*its headings: “1\. section 1”/), 'a heading not there lists the headings there are');
  const both = md([{ append: 'A.' }, { find: 'A.', replace: 'B.' }]);
  ok(both.endsWith('B.'), 'edits are made in order, each on what the one before left');
}

// ---- decks: the version being written, and changes to some slides -------------------------------------------------
{
  const words = (i: number) => para(i, 6);
  const raw = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ layout: 'content', title: `Slide ${i + 1 + from}`, text: [words(i), words(i + 1)] }));
  const base = normalizeDeck({ theme: 'midnight', slides: raw(12) });
  const back = JSON.parse(JSON.stringify(base));
  back.slides[2].els[0].paras = [{ runs: [{ t: 'Slide three, rewritten' }] }];
  back.slides.push(...raw(2, 12));
  const json = JSON.stringify({ id: '0123456789', title: 'Deck', ...back });
  const memo = new DraftMemo();
  let fewest = Infinity;
  let reused = 0;
  let draws = 0;
  let prev: Deck | null = null;
  let marked = 0;
  for (let cut = 60; cut < json.length; cut += 211) {
    const d = draftDeck(base, readPartial(json.slice(0, cut)), memo);
    if (!d) continue;
    draws++;
    fewest = Math.min(fewest, d.model.slides.length);
    if (d.mark) marked++;
    if (prev) {
      const was = new Set(prev.slides);
      reused += d.model.slides.filter((x) => was.has(x)).length / d.model.slides.length;
    }
    prev = d.model;
  }
  ok(fewest >= base.slides.length, 'a deck written again never shows fewer slides than it had: the old rest follows');
  ok(draws > 10 && reused / (draws - 1) > 0.85, 'slides that did not change between two draws are the same objects');
  ok(marked > draws * 0.7, 'the slide being written is marked');
  const end = draftDeck(base, readPartial(json), memo)!;
  ok(end.model.slides.length === 14 && end.model.slides.filter((x, i) => x === base.slides[i]).length === 11, 'written whole: the slides the call says, the unchanged ones the version’s own');
  ok(end.model.theme === base.theme, 'the theme the same object while it holds the same (no slide is drawn again for it)');
  const mid = draftDeck(base, readPartial(json.slice(0, json.indexOf('Slide three, rewritten') + 10)), new DraftMemo())!;
  ok(mid.mark?.kind === 'slides' && mid.mark.slide === 2 && mid.model.slides.length === 12, 'the slide being written is marked in its place, the rest after it');
  const fresh = draftDeck(null, readPartial('{"title":"New","slides":[{"layout":"title","title":"Hello"},{"layout":"content","title":"Agen'), new DraftMemo())!;
  ok(fresh.model.slides.length === 2 && fresh.mark?.kind === 'slides' && fresh.mark.slide === 1 && !!fresh.mark.el, 'a new deck grows slide by slide, the part being written marked');
  ok(draftDeck(null, readPartial('{"title":"New","slides":['), new DraftMemo()) === null, 'a new deck with no slide yet shows nothing');
  // Changes to some slides.
  const e = applyDeckEdits(base, {
    change: [{ slide: 2, layout: 'content', title: 'Two again' }],
    add: [
      { after: 3, layout: 'title', title: 'Between' },
      { layout: 'end', title: 'Last' },
    ],
    remove: [12, base.slides[4].id],
  });
  const ids = (e.slides as { id?: string }[]).map((x) => x.id);
  ok(e.slides.length === 12 && ids[1] === base.slides[1].id && (e.slides[1] as { title?: string }).title === 'Two again', 'a slide changed in place keeps its id (its comments stay with it)');
  ok(e.at.get('add:0') === 3 && e.at.get('add:1') === 11 && !ids.includes(base.slides[11].id) && !ids.includes(base.slides[4].id), 'new slides go after the one named or at the end; removed ones go (by number or id)');
  const thrown = (v: Record<string, unknown>) => {
    try {
      applyDeckEdits(base, v);
      return '';
    } catch (err) {
      return (err as Error).message;
    }
  };
  ok(/there is no slide 40 \(the deck has 12/.test(thrown({ change: [{ slide: 40, title: 'x' }] })) && /no slide with the id nope/.test(thrown({ remove: ['nope'] })), 'a slide that is not there says so');
  const ej = JSON.stringify({ id: '0123456789', change: [{ slide: 5, layout: 'content', title: 'Slide five, being written again' }] });
  const de = draftDeck(base, readPartial(ej.slice(0, -10)), new DraftMemo())!;
  ok(de.model.slides.length === 12 && de.model.slides[4].id === base.slides[4].id && de.mark?.kind === 'slides' && de.mark.slide === 4, 'a slide being changed shows in its place as far as it has come');
  ok(de.model.slides.filter((x, i) => x === base.slides[i]).length === 11, 'and the others are the version’s own');
}

// ---- spreadsheets: the version being written, and changes to some cells ------------------------------------------
{
  const rowsOf = (n: number, k: number) => Array.from({ length: n }, (_, i) => [`Line ${i + 1}`, (i * 7 + k) % 100, (i * 3 + k) % 50, `=B${i + 2}+C${i + 2}`]);
  const raw = (k: number) => ({ name: 'Budget', header: true, rows: [['Item', 'A', 'B', 'Total'], ...rowsOf(30, k)], formats: { 'B:D': 'currency' } });
  const base = normalizeBook({ sheets: [raw(1), { name: 'Notes', rows: [['Keep me']] }] });
  const json = JSON.stringify({ id: '0123456789', title: 'Budget', sheets: [raw(2), { name: 'Notes', rows: [['Keep me']] }] });
  const memo = new DraftMemo();
  const cut = json.indexOf('"Line 12"') + 4;
  const mid = draftBook(base, readPartial(json.slice(0, cut)), memo)!;
  const sh = mid.model.sheets[0];
  ok(mid.mark?.kind === 'sheet' && mid.mark.cell === 'A13' && mid.mark.sheet === base.sheets[0].id, 'the cell being written is marked, on its sheet (the same sheet, by its name)');
  ok(sh.cells.B12?.v === (10 * 7 + 2) % 100 && sh.cells.B20?.v === base.sheets[0].cells.B20?.v, 'cells written so far are the call’s, those not reached yet the version’s');
  ok(sh.cells.B12?.s?.fmt === 'currency', 'a cell written over keeps its look until the call says how its cells look');
  ok(mid.model.sheets.length === 2 && mid.model.sheets[1] === base.sheets[1], 'the sheets not reached yet are the version’s own');
  const typing = JSON.stringify({
    id: '0123456789',
    sheets: [
      {
        name: 'Budget',
        rows: [
          ['Item', 'A', 'B', 'Total'],
          ['Line 1', 1, 2, '=B2+C'],
        ],
      },
    ],
  }).slice(0, -6);
  const t = draftBook(base, readPartial(typing), new DraftMemo())!;
  ok(t.model.sheets[0].cells.D2?.v === '=B2+C', 'a formula still being typed shows as its words, not as an error');
  const end = draftBook(base, readPartial(json), memo)!;
  const want = normalizeBook(JSON.parse(json));
  ok(JSON.stringify(end.model.sheets[0].cells) === JSON.stringify(want.sheets[0].cells) && end.model.sheets[1] === base.sheets[1], 'written whole: the cells the call says; an unchanged sheet is the version’s own');
  ok(draftBook(null, readPartial('{"title":"New","sheets":[{"name":"S","rows":[[1,2],[3'), new DraftMemo())!.model.sheets[0].cells.B1?.v === 2, 'a new spreadsheet grows row by row');
  // Changes to some cells.
  const e = applyBookEdits(base, [{ sheet: 'budget', cells: { B3: 999, C3: null } }, { cells: { A40: 'Added' } }, { sheet: 'Totals', rows: [['Sum', '=SUM(Budget!D2:D31)']] }]);
  const after = normalizeBook({ sheets: e.sheets });
  ok(after.sheets[0].cells.B3?.v === 999 && !after.sheets[0].cells.C3 && after.sheets[0].cells.A40?.v === 'Added', 'an update goes on top of its sheet (named in any case, or the first): null empties a cell, two updates of one sheet both count');
  ok(after.sheets[0].cells.B4?.v === base.sheets[0].cells.B4?.v && after.sheets[0].cells.B4?.s?.fmt === 'currency' && after.sheets[0].id === base.sheets[0].id, 'what it does not give stays as it was (values, looks, its id)');
  ok(after.sheets.length === 3 && after.sheets[2].name === 'Totals' && e.sheets[1] === base.sheets[1], 'a sheet named that is not there is added; the others are the version’s own');
  const uj = JSON.stringify({
    id: '0123456789',
    update: [
      {
        sheet: 'Budget',
        start: 'B5',
        rows: [
          [71, 72],
          [81, 82],
        ],
      },
    ],
  });
  const ud = draftBook(base, readPartial(uj.slice(0, uj.indexOf('81') + 2) + ','), new DraftMemo())!;
  ok(
    ud.model.sheets[0].cells.B5?.v === 71 && ud.model.sheets[0].cells.B6?.v === 81 && ud.model.sheets[0].cells.B10?.v === base.sheets[0].cells.B10?.v && ud.mark?.kind === 'sheet',
    'an update being written shows on top of its sheet, the rest as it was',
  );
}

// ---- LaTeX: the version being written, and small changes ---------------------------------------------------------
{
  const paper = (k: number, n = 8) =>
    ['\\documentclass{article}', '\\begin{document}', ...Array.from({ length: n }, (_, i) => [`\\section{Part ${i + 1}}`, '', para(i + k), '', `\\begin{equation} x_${i} = ${i + k} \\end{equation}`, '']).flat(), '\\end{document}'].join('\n');
  const base = normalizeTex({ main: paper(1), files: [{ name: 'refs.bib', text: '@book{k, title = {T}}' }] });
  const json = JSON.stringify({ id: '0123456789', source: paper(2) });
  let fewest = Infinity;
  let marked = 0;
  let draws = 0;
  for (let cut = 30; cut < json.length; cut += 157) {
    const d = draftTex(base, readPartial(json.slice(0, cut)), new DraftMemo());
    if (!d) continue;
    draws++;
    fewest = Math.min(fewest, d.model.main.split('\n').length);
    if (d.mark?.kind === 'tex' && d.mark.file === 'main.tex') marked++;
  }
  ok(fewest >= base.main.split('\n').length - 1, 'a source written again keeps its length while it comes: the old rest after what has come');
  ok(marked > draws * 0.8, 'the place the words have come to is marked');
  const end = draftTex(base, readPartial(json), new DraftMemo())!;
  ok(end.model.main === paper(2) && end.model.files[0].text === base.files[0].text && end.mark === null, 'written whole: the source the call says, its other files as they were');
  ok(draftTex(null, readPartial('{"path":"/x/paper.tex","comments":[{"id":"c1","reply":"Do'), new DraftMemo()) === null, 'a call that answers a file’s comments shows no document');
  const { text, at } = linesOver('one\ntwo is a longer line\nthree', 'one\ntwo is', true);
  ok(text === 'one\ntwo is a longer line\nthree' && at === 'one\ntwo is'.length, 'a line written again as it was stays whole, the mark moving through it');
  // Small changes.
  const files = new Map([
    ['main.tex', paper(1)],
    ['refs.bib', '@book{k}'],
  ]);
  const run = (edits: unknown[]) => applyTexEdits(files, edits).files.get('main.tex')!;
  const thrown = (edits: unknown[]) => {
    try {
      applyTexEdits(files, edits);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  };
  ok(run([{ section: 'Part 2', text: '\\section{Part 2}\nShort now.' }]).includes('\\section{Part 2}\nShort now.\n\n\\section{Part 3}'), 'a section written again, up to the next one of its level');
  ok(!run([{ section: 'part 3', text: '' }]).includes('Part 3'), 'a section sent empty is taken out (its title in any case)');
  ok(/Thanks\.\n\n\\end\{document\}$/.test(run([{ append: 'Thanks.' }])), 'append goes before \\end{document}');
  const af = run([{ after: 'Part 1', text: '\\section{Between}' }]);
  ok(af.indexOf('Between') > af.indexOf('Part 1') && af.indexOf('Between') < af.indexOf('Part 2'), 'after a section: at its end, before the next');
  ok(applyTexEdits(files, [{ file: 'refs.bib', find: '@book{k}', replace: '@book{k, year = {2026}}' }]).files.get('refs.bib') === '@book{k, year = {2026}}', 'an edit in another file of it');
  ok(/no section “Nope” in main\.tex/.test(thrown([{ before: 'Nope', text: 'x' }])) && /no file other\.tex/.test(thrown([{ file: 'other.tex', append: 'x' }])), 'what is not there says so');
  const ej = JSON.stringify({ id: '0123456789', edits: [{ section: 'Part 4', text: '\\section{Part 4}\nBeing written again, these words' }] });
  const de = draftTex(base, readPartial(ej.slice(0, -10)), new DraftMemo())!;
  ok(de.model.main.includes('Being written again') && de.model.main.includes('Part 5') && de.mark?.kind === 'tex', 'a change being written shows in place, with the mark');
}

// ---- the server's drafts of a save -------------------------------------------------------------------------------
{
  const sent: { key: string; data: any }[] = [];
  const deps = { toSubscribers: (key: string, e: { data: unknown }) => void sent.push({ key, data: e.data }) } as unknown as Deps;
  const name = 'mcp__hydor__save_doc';
  const input = { id: 'abcdef0123', title: 'Report', markdown: report(3) };
  const call = JSON.stringify(input);
  feedDraft(deps, 'claude:s1', { id: 'c1', name, at: 'start' });
  for (let i = 0; i < call.length; i += 50) feedDraft(deps, 'claude:s1', { id: 'c1', name, at: 'delta', delta: call.slice(i, i + 50) });
  await new Promise((r) => setTimeout(r, 200));
  const toSession = sent.filter((x) => x.key === 'claude:s1');
  const toPage = sent.filter((x) => x.key === 'page:abcdef0123');
  const whole = (list: typeof sent) => list.reduce((acc, x) => (x.data.from === 0 ? x.data.text : acc.slice(0, x.data.from) + x.data.text), '');
  ok(toSession.length >= 1 && toSession.length < 8, 'a save being written goes to its session in a few pieces');
  ok(whole(toSession) === call, 'the pieces are the call itself, as it came');
  ok(toPage.length === toSession.length && whole(toPage) === call, 'and to the editor that has the page open');
  ok(
    toSession.every((x, i) => i === 0 || x.data.draft.seq > toSession[i - 1].data.draft.seq),
    'each piece counts up: a window hearing it twice takes it once',
  );
  ok(draftsOf('claude:s1')[0]?.pageId === 'abcdef0123' && draftsOfPage('abcdef0123')[0]?.text === call, 'an editor opened mid-way gets it whole');
  feedDraft(deps, 'claude:s1', { id: 'c1', name, at: 'end', input });
  ok(sent.at(-1)!.data.draft.done && !sent.at(-1)!.data.draft.saved, 'written whole, it waits for its save');
  settleDraft(deps, 'claude:s1', 'save_doc', 'abcdef0123', { saved: { pageId: 'abcdef0123', version: 4 } });
  ok(eq(sent.at(-1)!.data.draft.saved, { pageId: 'abcdef0123', version: 4 }) && sent.at(-1)!.key === 'page:abcdef0123', 'once kept, it says the version that takes its place');
  // A new one, failed; another, stopped by the turn's end.
  feedDraft(deps, 'claude:s1', { id: 'c2', name: 'mcp__hydor__save_slides', at: 'start' });
  feedDraft(deps, 'claude:s1', { id: 'c2', name: 'mcp__hydor__save_slides', at: 'delta', delta: '{"title":"Deck","slides":[{"layout":"title","title":"Hi"}]}' });
  feedDraft(deps, 'claude:s1', { id: 'c2', name: 'mcp__hydor__save_slides', at: 'end', input: { title: 'Deck', slides: [{ layout: 'title', title: 'Hi' }] } });
  settleDraft(deps, 'claude:s1', 'save_slides', null, { failed: true });
  ok(draftsOf('claude:s1').find((d) => d.id === 'c2')?.failed, 'a save that failed says so: the page stays as it was');
  feedDraft(deps, 'claude:s1', { id: 'c3', name: 'mcp__hydor__save_sheet', at: 'start' });
  feedDraft(deps, 'claude:s1', { id: 'c3', name: 'mcp__hydor__save_sheet', at: 'delta', delta: '{"title":"Budget","sheets":[{"name":"A","rows":[[1,2' });
  endDrafts(deps, 'claude:s1');
  const c3 = draftsOf('claude:s1').find((d) => d.id === 'c3');
  ok(c3?.done && c3.failed, 'a call the turn stopped saved nothing');
  ok(!draftsOf('claude:s1').find((d) => d.id === 'c1')?.failed, 'one already kept stays kept');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
