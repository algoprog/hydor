// Script tests for what documents gained beside their words: footnotes, citations and a bibliography (APA, MLA,
// Chicago, IEEE), numbered captions and cross-references, bookmarks and links to places in the document, page setup
// (landscape, columns, a page colour, a watermark) and paragraph styles of their own; kept as the model keeps them,
// written and read as Markdown (what agents get and send back), drawn on the document's own page, and through Word
// (.docx) out and back in. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/doc-features-test.ts
//   DATA_DIR=/tmp/hydor-test-doc-features node dist/dev/doc-features-test.js
import { bibRuns, citeWords, sourceFromBibtex, sourceKey, yearSuffixes } from '../../shared/doc-cite.ts';
import { docRefs } from '../../shared/doc-refs.ts';
import { blockHtml, citeItems, docMarkdown, docText, normalizeDoc, notesHtml, paperOf, runsText, styleOf, columnMm, type Doc, type Run, type Source } from '../../shared/docs.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string, extra?: unknown) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 700)}` : ''}`);
  }
};

const again = (d: Doc) => normalizeDoc(JSON.parse(docText(d)));
const viaMd = (d: Doc, comments = true) => normalizeDoc({ markdown: docMarkdown(d, { comments }), sources: d.sources, cite: d.cite });
const text = (runs: Run[]) => runs.map((r) => r.t).join('');

// ---- footnotes ------------------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({ markdown: 'Water boils[^a] at sea level.[^b] And again[^a].\n\n[^a]: At 100 °C.\n[^b]: Lower up a mountain,\n    as **air** is thinner.\n' });
  const p = d.blocks[0];
  ok(p.type === 'p' && p.runs.filter((r) => r.fn).length === 3, 'footnote marks are runs of their own', p);
  ok(d.notes?.length === 2 && d.notes[0].id === 'a' && text(d.notes[0].runs) === 'At 100 °C.', 'their words come from the definitions', d.notes);
  ok(d.notes?.[1] && text(d.notes[1].runs) === 'Lower up a mountain, as air is thinner.' && d.notes[1].runs.some((r) => r.b), 'a definition goes on on indented lines, with its looks', d.notes?.[1]);
  ok(!d.blocks.some((b) => b.type === 'p' && runsText(b.runs).startsWith('[^')), 'definitions are no paragraphs');
  const r = docRefs(d);
  ok(r.note('a') === 1 && r.note('b') === 2, 'numbered as their marks come');
  const md = docMarkdown(d);
  ok(md.includes('boils[^1] at') && md.includes('[^1]: At 100 °C.') && md.includes('[^2]: Lower'), 'Markdown writes them as [^1]', md);
  const back = viaMd(d);
  ok(back.notes?.length === 2 && back.blocks[0].type === 'p' && back.blocks[0].runs.filter((x) => x.fn).length === 3, 'and reads them back', back.notes);
  ok(JSON.stringify(again(d).notes) === JSON.stringify(d.notes), 'the kept text keeps them');
  const html = blockHtml(d.blocks[0], '', { src: (x) => x, refs: r });
  ok(/<span class="nd-x nd-fn"[^>]*data-k="fn"[^>]*><sup><a href="#nd-fn-a">1<\/a><\/sup><\/span>/.test(html), 'drawn as their numbers', html);
  ok(notesHtml(d, r, { view: true }).includes('id="nd-fn-b"'), 'and listed with them');
  // A note no mark is for goes; a mark whose note is gone goes too.
  const odd = normalizeDoc({ blocks: [{ p: [{ t: 'x' }, { t: 'k1', fn: true }, { t: 'k9', fn: true }] }], notes: [{ id: 'k1', text: 'one' }, { id: 'k2', text: 'two' }] });
  ok(odd.notes?.length === 1 && odd.blocks[0].type === 'p' && odd.blocks[0].runs.filter((x) => x.fn).length === 1, 'notes without marks and marks without notes go', odd);
}

// ---- citations and the bibliography ------------------------------------------------------------------------------
{
  const sources: Source[] = [
    { id: 'vaswani2017', kind: 'conference', title: 'Attention is all you need', authors: [{ family: 'Vaswani', given: 'Ashish' }, { family: 'Shazeer', given: 'Noam' }, { family: 'Parmar', given: 'Niki' }], year: '2017', in: 'Advances in Neural Information Processing Systems', pages: '5998-6008' },
    { id: 'knuth1984', kind: 'book', title: 'The TeXbook', authors: [{ family: 'Knuth', given: 'Donald E.' }], year: '1984', publisher: 'Addison-Wesley' },
    { id: 'lecun2015', kind: 'article', title: 'Deep learning', authors: [{ family: 'LeCun', given: 'Yann' }, { family: 'Bengio', given: 'Yoshua' }], year: '2015', in: 'Nature', volume: '521', issue: '7553', pages: '436–444', doi: '10.1038/nature14539' },
  ];
  const d = normalizeDoc({ markdown: 'As shown [@lecun2015, p. 437], and before [@knuth1984; @vaswani2017].\n\n# References\n\n[BIBLIOGRAPHY]\n', sources });
  const p = d.blocks[0];
  ok(p.type === 'p' && p.runs.filter((r) => r.cite).map((r) => r.t).join('|') === 'lecun2015, p. 437|knuth1984; vaswani2017', 'citations are runs of their own', p);
  ok(d.blocks.some((b) => b.type === 'bib'), '[BIBLIOGRAPHY] is a bibliography');
  ok(d.sources?.length === 3, 'sources are kept');
  const cites = (doc: Doc) => (doc.blocks[0].type === 'p' ? doc.blocks[0].runs.filter((r) => r.cite).map((r) => docRefs(doc).text(r)) : []);
  ok(cites(d).join(' / ') === '(LeCun & Bengio, 2015, p. 437) / (Knuth, 1984; Vaswani et al., 2017)', 'APA', cites(d));
  ok(cites({ ...d, cite: 'mla' }).join(' / ') === '(LeCun and Bengio 437) / (Knuth; Vaswani et al.)', 'MLA', cites({ ...d, cite: 'mla' }));
  ok(cites({ ...d, cite: 'chicago' }).join(' / ') === '(LeCun and Bengio 2015, 437) / (Knuth 1984; Vaswani, Shazeer, and Parmar 2017)', 'Chicago', cites({ ...d, cite: 'chicago' }));
  ok(cites({ ...d, cite: 'ieee' }).join(' / ') === '[1, p. 437] / [2], [3]', 'IEEE numbers them as first cited', cites({ ...d, cite: 'ieee' }));
  const bib = (doc: Doc) => docRefs(doc).bib().map(text);
  ok(bib(d)[0].startsWith('Knuth, D. E. (1984). The TeXbook. Addison-Wesley.') && bib(d)[1].startsWith('LeCun, Y., & Bengio, Y. (2015). Deep learning. Nature, 521(7553), 436–444. https://doi.org/10.1038/nature14539'), 'APA entries, by author', bib(d));
  ok(docRefs(d).bib()[0].some((r) => r.i && r.t === 'The TeXbook'), "a book's title is in italics");
  ok(bib({ ...d, cite: 'ieee' })[0].startsWith('[1] Y. LeCun and Y. Bengio, “Deep learning,” Nature, vol. 521, no. 7553, pp. 436–444, 2015'), 'IEEE entries, by number', bib({ ...d, cite: 'ieee' }));
  ok(bib({ ...d, cite: 'mla' })[1].startsWith('LeCun, Yann, and Yoshua Bengio. “Deep Learning.”') || bib({ ...d, cite: 'mla' })[1].startsWith('LeCun, Yann, and Yoshua Bengio. “Deep learning.”'), 'MLA entries', bib({ ...d, cite: 'mla' }));
  ok(bib({ ...d, cite: 'chicago' })[2].startsWith('Vaswani, Ashish, Noam Shazeer, and Niki Parmar. 2017. “Attention is all you need.” In Advances'), 'Chicago entries', bib({ ...d, cite: 'chicago' }));
  // Two sources by the same author in the same year get letters.
  const twin: Source[] = [
    { id: 'a1', kind: 'article', title: 'Beta', authors: [{ family: 'Smith', given: 'J.' }], year: '2020' },
    { id: 'a2', kind: 'article', title: 'Alpha', authors: [{ family: 'Smith', given: 'J.' }], year: '2020' },
  ];
  const suf = yearSuffixes('apa', twin);
  ok(suf.get('a2') === 'a' && suf.get('a1') === 'b', '2020a and 2020b, by title');
  ok(citeWords('apa', [{ key: 'a1' }], { src: new Map(twin.map((s) => [s.id, s])), num: new Map(), suffix: suf }) === '(Smith, 2020b)', 'cited with its letter');
  ok(text(bibRuns('apa', twin[0], { suffix: 'b' })).includes('(2020b)'), 'listed with it');
  // Markdown for an agent keeps the keys; for a file, the words.
  const md = docMarkdown(d, { comments: true });
  ok(md.includes('[@lecun2015, p. 437]') && md.includes('[@knuth1984; @vaswani2017]') && md.includes('[BIBLIOGRAPHY]'), 'Markdown keeps citations as [@key]', md);
  const file = docMarkdown(d, { tocLinks: true, refs: docRefs(d) });
  ok(file.includes('(LeCun & Bengio, 2015, p. 437)') && file.includes('Knuth, D. E. (1984)'), 'a Markdown file has them as they read', file);
  ok(JSON.stringify(viaMd(d).blocks[0]) === JSON.stringify({ ...d.blocks[0], id: viaMd(d).blocks[0].id }), 'and they read back');
  const again2 = again({ ...d, cite: 'ieee' });
  ok(again2.cite === 'ieee' && again2.sources?.length === 3, 'the style and sources are kept');
  // From BibTeX, as Insert → Citation finds them.
  const s = sourceFromBibtex('@article{lecun2015deep,\n  author = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},\n  title = {Deep learning},\n  journal = {Nature},\n  volume = {521},\n  number = {7553},\n  pages = {436--444},\n  year = {2015},\n  doi = {10.1038/nature14539}\n}');
  ok(s?.id === 'lecun2015deep' && s.kind === 'article' && s.authors?.length === 3 && s.authors[2].family === 'Hinton' && s.pages === '436–444' && s.doi === '10.1038/nature14539', 'a source from BibTeX', s);
  const ax = sourceFromBibtex('@misc{vaswani2017attention,\n  author = {Vaswani, Ashish and Shazeer, Noam},\n  title = {Attention Is All You Need},\n  year = {2017},\n  howpublished = {arXiv:1706.03762},\n  eprint = {1706.03762},\n  archiveprefix = {arXiv},\n  url = {https://arxiv.org/abs/1706.03762}\n}');
  ok(ax?.in === 'arXiv:1706.03762' && ax.kind === 'other', 'an arXiv paper', ax);
  ok(sourceKey({ authors: [{ family: 'Müller' }], year: '2021', title: 'The art of tests' }, ['muller2021art']) === 'muller2021art2', 'keys as people make them, unique');
  ok(citeItems('a; @b, pp. 3-4; ;c d').length === 2, 'citation items checked');
}

// ---- numbered captions, cross-references, bookmarks and links ---------------------------------------------------------
{
  const d = normalizeDoc({
    markdown: [
      '# Results {#res}',
      '',
      'See <ref to="fig1"/>, <ref to="tab1"/>, <ref to="eq1"/> and <ref to="res"/>; also [the method](#m1).',
      '',
      '![A plot](https://example.com/a.png "Growth"){#fig1 label=Figure}',
      '',
      'Table: Prices {#tab1 label=Table}',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '$$',
      'E = mc^2',
      '$$ {#eq1 label=Equation}',
      '',
      'The method is here. {#m1 bookmark="Method"}',
      '',
      '![Another](https://example.com/b.png "More"){label=Figure}',
    ].join('\n'),
  });
  const ids = d.blocks.map((b) => `${b.type}:${b.id}`);
  ok(ids.includes('p:res') && ids.includes('image:fig1') && ids.includes('table:tab1') && ids.includes('math:eq1') && ids.includes('p:m1'), '{#id} gives blocks their ids', ids);
  const t = d.blocks.find((b) => b.type === 'table');
  ok(t?.type === 'table' && t.caption === 'Prices' && t.label === 'Table', "a table's caption from its Table: line", t);
  const r = docRefs(d);
  const p = d.blocks[1];
  const words = p.type === 'p' ? p.runs.filter((x) => x.xref).map((x) => r.text(x)) : [];
  ok(words.join('|') === 'Figure 1|Table 1|Equation 1|Results', 'cross-references say what they point to', words);
  ok(r.label(d.blocks[d.blocks.length - 1].id) === 'Figure 2', 'figures counted by themselves');
  ok(p.type === 'p' && p.runs.some((x) => x.link === '#m1'), 'a link to a place in the document');
  const m1 = d.blocks.find((b) => b.id === 'm1');
  ok(m1?.type === 'p' && m1.bm === 'Method', 'a bookmark', m1);
  const md = docMarkdown(d, { comments: true });
  ok(md.includes('<ref to="fig1"/>') && md.includes('{#fig1 label=Figure}') && md.includes('Table: Prices {#tab1 label=Table}') && md.includes('$$ {#eq1 label=Equation}') && md.includes('bookmark=Method'), 'Markdown for an agent keeps them', md);
  const back = viaMd(d);
  ok(['res', 'fig1', 'tab1', 'eq1', 'm1'].every((id) => back.blocks.some((b) => b.id === id)) && back.blocks.length === d.blocks.length, 'and reads them back, what they point to with its id', back.blocks.map((b) => b.id));
  const file = docMarkdown(d, { tocLinks: true, refs: r });
  ok(file.includes('See Figure 1, Table 1, Equation 1 and Results') && file.includes('"Figure 1: Growth"') && file.includes('Table: Table 1: Prices') && file.includes('\\tag{1}'), 'a Markdown file says them in words', file);
  const fig = blockHtml(d.blocks[2], '', { src: (x) => x, refs: r });
  ok(fig.includes('<figcaption>Figure 1: Growth</figcaption>') && fig.includes('id="nd-fig1"'), "a picture's numbered caption", fig);
  const tab = blockHtml(t!, '', { src: (x) => x, refs: r, edit: true });
  ok(tab.includes('<caption class="nd-cap" contenteditable="false">Table 1: Prices</caption>'), "a table's caption over it", tab);
  const eq = blockHtml(d.blocks.find((b) => b.type === 'math')!, '', { src: (x) => x, refs: r });
  ok(eq.includes('<span class="nd-eqn">(1)</span>'), "an equation's number", eq);
  const link = blockHtml(p, '', { src: (x) => x, refs: r });
  ok(link.includes('href="#nd-m1"') && link.includes('<a href="#nd-fig1">Figure 1</a>'), 'links and cross-references lead to their blocks', link);
}

// ---- page setup and styles ------------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({ markdown: 'Hi', page: { size: 'a4', margin: 20, orient: 'landscape', cols: 2, color: '#fef7e0' }, watermark: 'DRAFT', styles: { h1: { font: 'Georgia', size: 24, color: '#1a73e8', b: false, after: 6 }, normal: { line: 1.5 }, bogus: { size: 9 } } });
  ok(d.page.orient === 'landscape' && d.page.cols === 2 && d.page.color === '#fef7e0', 'landscape, two columns and a page colour', d.page);
  ok(d.mark?.text === 'DRAFT', 'a watermark');
  ok(d.styles?.h1?.font === 'Georgia' && d.styles.h1.size === 24 && d.styles.h1.b === false && d.styles.h1.sa === 6 && !('bogus' in (d.styles ?? {})), 'styles checked', d.styles);
  const p = paperOf(d.page);
  ok(p.w === 297 && p.h === 210, 'the paper on its side');
  ok(Math.abs(columnMm(d.page) - (297 - 40 - 12.7) / 2) < 0.01, "a column's width");
  const h1 = styleOf(d, 'h1');
  ok(Math.abs(h1.k - 24 / 11) < 0.01 && h1.bold === false && h1.font === 'Georgia' && Math.abs(h1.after - 6 / 24) < 0.01, "a heading's own look", h1);
  ok(Math.abs(styleOf(d, 'normal').lh - 1.725) < 0.001, "normal text's lines");
  const kept = again(d);
  ok(JSON.stringify([kept.page, kept.mark, kept.styles]) === JSON.stringify([d.page, d.mark, d.styles]), 'kept as they are');
  ok(!('styles' in normalizeDoc({ markdown: 'x' })) && !('mark' in normalizeDoc({ markdown: 'x' })), 'none unless set');
  const pic = normalizeDoc({ markdown: 'x', watermark: { src: 'https://example.com/logo.png' } });
  ok(pic.mark?.src === 'https://example.com/logo.png', 'a picture watermark');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
