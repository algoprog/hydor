// The documents word-check.ts compares with what Office makes of them: between them, everything the documents editor
// has (headings, fonts and sizes, spacing, lists of every kind, checklists, callouts, quotes, code, tables with merged
// and filled cells and widths, pictures with captions, equations, a table of contents, headers and footers with page
// numbers, comments, suggested changes, page breaks, a long table over pages, Chinese and Greek), as an agent or the
// editor gives them (shared/docs.ts normalizeDoc checks them as it does those).
import fs from 'node:fs';
import path from 'node:path';

export interface Sample {
  name: string;
  title: string;
  model: Record<string, unknown>;
}

// The demo's pictures, from the checkout (the check runs from its top folder).
const media = (f: string) => `data:image/jpeg;base64,${fs.readFileSync(path.resolve('scripts/guide-shots/media', f)).toString('base64')}`;

/** Words that read like a paragraph, the same each time (seeded). */
function words(seed: number, n: number): string {
  const list =
    'the garden club met on a wet spring evening to plan beds for beans peas and squash along the south fence while the committee weighed costs of soil compost timber tools and water against what members could pay this season and what the town might give'.split(
      ' ',
    );
  let s = seed;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push(list[s % list.length]);
  }
  const t = out.join(' ');
  return `${t[0].toUpperCase()}${t.slice(1)}.`;
}

const now = Date.UTC(2026, 9, 20, 9, 30);

export function samples(): Sample[] {
  const boat = media('boat.jpg');
  const tram = media('tram.jpg');
  return [
    {
      name: 'word-basics',
      title: 'Basics',
      model: {
        font: 'Inter',
        size: 11,
        page: { size: 'a4', margin: 25.4 },
        header: { text: 'Garden club · Spring report', align: 'right' },
        footer: { text: 'Page {page} of {pages}', align: 'center' },
        blocks: [
          { title: 'A spring report' },
          { subtitle: 'Prepared for the garden club, April' },
          { h1: 'Heading one' },
          { p: words(1, 70) },
          { p: words(2, 45) },
          { h2: 'Heading two' },
          {
            p: [
              { t: 'Bold ', b: true },
              { t: 'italic ', i: true },
              { t: 'underlined ', u: true },
              { t: 'struck', s: true },
              { t: ' and ' },
              { t: 'inline code', code: true },
              { t: ', ' },
              { t: 'red words', color: '#c5221f' },
              { t: ', ' },
              { t: 'highlighted', hl: '#fef08a' },
              { t: ', ' },
              { t: 'larger', size: 15 },
              { t: ', ' },
              { t: 'smaller', size: 8 },
              { t: ', x' },
              { t: '2', sup: true },
              { t: ' and H' },
              { t: '2', sub: true },
              { t: 'O, a ' },
              { t: 'link to the club', link: 'https://example.com/club' },
              { t: '. ' + words(3, 30) },
            ],
          },
          { h3: 'Heading three' },
          { p: words(4, 40), align: 'justify' },
          { p: 'Centred words on a line of their own.', align: 'center' },
          { p: 'Words on the right.', align: 'right' },
          { h4: 'Heading four' },
          { p: words(5, 30), indent: 1 },
          { p: words(6, 30), indent: 2 },
          { p: words(7, 40), lh: 2 },
          { p: words(8, 40), lh: 1, sb: 12, sa: 12 },
          { quote: words(9, 35) },
          { callout: words(10, 30) },
          { callout: 'A warning in red.', icon: '⚠️', tint: '#fce8e6' },
          { code: 'def plant(bed, seeds):\n    for s in seeds:\n        bed.sow(s, depth=2)\n    return bed' },
          { hr: true },
          { p: words(11, 50) },
          { pagebreak: true },
          { h1: 'After a page break' },
          { p: words(12, 60) },
          { p: words(13, 60) },
        ],
      },
    },
    {
      name: 'word-lists',
      title: 'Lists',
      model: {
        font: 'Arial',
        size: 11,
        page: { size: 'letter', margin: 12.7 },
        blocks: [
          { h1: 'Lists of every kind' },
          { p: 'Bullets, five levels deep:' },
          { bullets: ['First level', ['Second level', ['Third level', ['Fourth level', ['Fifth level']]]], 'First level again, ' + words(20, 40)] },
          { p: 'Numbers, five levels deep:' },
          { numbers: ['One', ['One a', 'One b', ['One b i', 'One b ii', ['Deeper', ['Deepest']]]], 'Two', 'Three, ' + words(21, 40)] },
          { p: 'A list starts again after a paragraph:' },
          { numbers: ['Again one', 'Again two'] },
          { p: 'A checklist:' },
          { checks: ['Order the seeds', '[x] Mend the fence', ['[x] Buy nails', 'Borrow a saw'], 'Water the beds, ' + words(22, 30)] },
          { h2: 'Mixed' },
          { bullet: 'A bullet' },
          { number: 'Then a number' },
          { check: 'Then a box' },
          { p: words(23, 50) },
        ],
      },
    },
    {
      name: 'word-tables',
      title: 'Tables',
      model: {
        font: 'Roboto',
        size: 10.5,
        page: { size: 'a4', margin: 20 },
        footer: { text: '{page}', align: 'right' },
        blocks: [
          { h1: 'Tables' },
          { p: 'A table with a header, widths, filled and merged cells:' },
          {
            type: 'table',
            head: true,
            cols: [3, 1, 1, 2],
            rows: [
              ['Item', 'Qty', 'Cost', 'Notes'],
              [{ text: 'Raised beds', rs: 2 }, '4', { text: '300', align: 'right' }, { text: 'Cedar, two sizes', fill: '#e6f4ea' }],
              ['', '2', { text: '120', align: 'right' }, 'Smaller ones'],
              [{ text: 'Soil and compost, delivered in two loads', cs: 2 }, '', { text: '410', align: 'right' }, { text: 'Middle', va: 'middle', fill: '#fef7e0' }],
              [{ text: 'Total', align: 'right' }, '', { text: '830', align: 'right', fill: '#e8f0fe' }, { text: 'Bottom', va: 'bottom' }],
            ],
          },
          { p: 'Two tables one after the other:' },
          {
            table: [
              ['A', 'B'],
              ['1', '2'],
            ],
          },
          {
            table: [
              ['C', 'D'],
              ['3', '4'],
            ],
          },
          { p: 'A long table over pages, its header row on each:' },
          {
            type: 'table',
            head: true,
            cols: [1, 4, 1],
            rows: [['Week', 'What to do', 'Hours'], ...Array.from({ length: 70 }, (_, i) => [String(i + 1), words(30 + i, 6 + (i % 5) * 4), String(2 + (i % 7))])],
          },
          { p: words(24, 40) },
        ],
      },
    },
    {
      name: 'word-pictures',
      title: 'Pictures and equations',
      model: {
        font: 'Lora',
        size: 12,
        page: { size: 'a4', margin: 25.4 },
        header: { text: 'Pictures and equations' },
        footer: { text: 'Page {page}', align: 'center' },
        titlePage: true,
        blocks: [
          { title: 'Pictures and equations' },
          { toc: true },
          { h1: 'Pictures' },
          { image: boat, w: 0.6, caption: 'A boat at the jetty, centred at 60%', alt: 'A boat' },
          { p: words(40, 40) },
          { image: tram, w: 0.35, align: 'left', caption: 'A tram on the left, 35%' },
          { image: tram, w: 0.35, align: 'right', caption: 'And on the right' },
          { image: boat, w: 1, caption: 'The whole width' },
          { h1: 'Equations' },
          { h2: 'On lines of their own' },
          { math: 'E = mc^2' },
          { math: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
          { math: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}' },
          { math: '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}' },
          { h2: 'Among the words' },
          { p: [{ t: 'The area of a circle is ' }, { t: '\\pi r^2', math: true }, { t: ' and its edge ' }, { t: '2\\pi r', math: true }, { t: '. ' + words(41, 30) }] },
          { h3: 'A third level' },
          { p: words(42, 50) },
        ],
      },
    },
    {
      name: 'word-review',
      title: 'Comments and suggestions',
      model: {
        font: 'Inter',
        size: 11,
        blocks: [
          { h1: 'Comments and suggested changes' },
          {
            p: [
              { t: 'The club ' },
              { t: 'should buy', cm: ['c1'] },
              { t: ' four raised beds this spring, ' },
              { t: 'big', del: 's1' },
              { t: 'small', ins: 's1' },
              { t: ' ones near the gate. ' },
              { t: 'Water', fmt: 's2', was: {}, b: true },
              { t: ' comes from the tap by the shed.' },
            ],
          },
          { p: [{ t: 'A comment that was resolved sits on ' }, { t: 'these words', cm: ['c2'] }, { t: '. ' + words(50, 30) }] },
          { p: 'A paragraph suggested to be added.', ins: 's3' },
          { p: 'A paragraph suggested to be taken out.', del: 's4' },
          {
            table: [
              ['Bed', 'Crop'],
              ['1', 'Beans'],
            ],
            ins: 's3',
          },
          { p: words(51, 40) },
        ],
        comments: [
          { id: 'c1', by: 'user', author: 'Maria Lopez', text: 'Can we afford four?', at: now, replies: [{ by: 'agent', text: 'Yes, with the grant.', at: now + 60000 }] },
          { id: 'c2', by: 'agent', text: 'Done.', at: now + 120000, resolved: true },
        ],
        suggestions: [
          { id: 's1', by: 'user', author: 'Jun Park', at: now },
          { id: 's2', by: 'agent', at: now + 1000 },
          { id: 's3', by: 'user', at: now + 2000 },
          { id: 's4', by: 'user', author: 'Jun Park', at: now + 3000 },
        ],
      },
    },
    {
      name: 'word-languages',
      title: 'Languages',
      model: {
        font: 'Open Sans',
        size: 11,
        blocks: [
          { h1: 'Ελληνικά και 中文' },
          {
            p: 'Η λέσχη κηπουρικής συναντήθηκε ένα βροχερό ανοιξιάτικο βράδυ για να σχεδιάσει παρτέρια για φασόλια, μπιζέλια και κολοκύθες κατά μήκος του νότιου φράχτη, ενώ η επιτροπή ζύγιζε το κόστος του χώματος, του κομπόστ, της ξυλείας και του νερού.',
          },
          { bullets: ['Φασόλια', 'Μπιζέλια', 'Κολοκύθες'] },
          { p: '园艺俱乐部在一个下雨的春天晚上开会，计划沿着南边的篱笆种植豆类、豌豆和南瓜，同时委员会权衡了土壤、堆肥、木材、工具和水的费用，以及会员本季能支付多少，镇上可能提供多少。' },
          { numbers: ['订购种子', '修理篱笆', '浇水'] },
          { p: 'Mixed: the club (λέσχη, 俱乐部) met in April.' },
          {
            table: [
              ['Λαχανικό', '蔬菜', 'Vegetable'],
              ['Φασόλια', '豆', 'Beans'],
            ],
          },
          { h2: 'Office fonts' },
          {
            p: [
              { t: 'Arial, ', font: 'Arial' },
              { t: 'Georgia, ', font: 'Georgia' },
              { t: 'Times New Roman, ', font: 'Times New Roman' },
              { t: 'Courier New.', font: 'Courier New' },
            ],
          },
          { p: [{ t: 'Serif fonts: ' }, { t: 'Merriweather ', font: 'Merriweather' }, { t: 'Playfair Display ', font: 'Playfair Display' }, { t: 'Source Serif 4.', font: 'Source Serif 4' }] },
          {
            p: [
              { t: 'Bold italic Inter: ', font: 'Inter' },
              { t: 'the four faces', font: 'Inter', b: true, i: true },
              { t: ' and mono ', font: 'Inter' },
              { t: 'JetBrains Mono', font: 'JetBrains Mono' },
            ],
          },
        ],
      },
    },
    {
      name: 'word-long',
      title: 'A long document',
      model: {
        font: 'Merriweather',
        size: 10,
        page: { size: 'a4', margin: 38.1 },
        footer: { text: '{page} / {pages}', align: 'right' },
        blocks: Array.from({ length: 12 }, (_, s) => [
          { [s % 3 === 0 ? 'h1' : 'h2']: `Section ${s + 1}` },
          ...Array.from({ length: 3 + (s % 4) }, (_, k) => ({ p: words(100 + s * 10 + k, 40 + ((s + k) % 5) * 25) })),
          ...(s % 2 ? [{ bullets: [words(200 + s, 12), words(300 + s, 20), words(400 + s, 8)] }] : []),
        ]).flat(),
      },
    },
  ];
}
