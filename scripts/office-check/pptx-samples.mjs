// Sample slide decks for checking the PowerPoint files the slides editor exports (pptx-check.mjs): between them they
// use everything a deck can have — every layout and theme, text in every format, bullets and numbers, line and
// paragraph spacing, words made smaller to fit, every shape, turns and flips, groups, pictures cropped and with their
// colours changed, tables with merged and coloured cells, every kind of chart, icons, equations, a video, connectors,
// comments, the footer and slide numbers, speaker notes, animations and transitions, and Chinese and Greek words.
// Each deck is what an agent or the editor sends (the app checks it as it keeps it); pictures are made here.
import zlib from 'node:zlib';

/** A PNG of `w`×`h` pixels from `px(x, y)` → [r, g, b, a]. */
export function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * A picture that shows how it was cropped, flipped and recoloured: four coloured quarters, a light band across, and a
 * dark corner mark at the top left.
 */
export function testPicture(w = 480, h = 320) {
  const data = png(w, h, (x, y) => {
    if (x < w * 0.18 && y < h * 0.22) return [20, 20, 30, 255];
    if (Math.abs(y - h / 2) < h * 0.06) return [245, 245, 235, 255];
    const left = x < w / 2;
    const top = y < h / 2;
    const base = top ? (left ? [220, 70, 60] : [60, 160, 90]) : left ? [50, 100, 210] : [240, 190, 50];
    const k = 0.75 + 0.25 * ((x + y) / (w + h));
    return [Math.round(base[0] * k), Math.round(base[1] * k), Math.round(base[2] * k), 255];
  });
  return `data:image/png;base64,${data.toString('base64')}`;
}

/** A sky-like gradient for a slide's background picture. */
export function skyPicture(w = 640, h = 360) {
  const data = png(w, h, (x, y) => {
    const t = y / h;
    const s = x / w;
    return [Math.round(40 + 120 * t + 30 * s), Math.round(80 + 90 * t), Math.round(160 + 60 * (1 - t)), 255];
  });
  return `data:image/png;base64,${data.toString('base64')}`;
}

// Icons as a deck keeps them: SVG elements on a 24×24 grid (drawn here, simple ones).
const ICONS = {
  check: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M7 12.5l3.2 3.2L17 9' }],
  ],
  star: [['polygon', { points: '12 2 15 9 22 9.3 16.5 14 18.5 21.5 12 17.3 5.5 21.5 7.5 14 2 9.3 9 9' }]],
  chart: [
    ['path', { d: 'M3 3v18h18' }],
    ['rect', { x: 7, y: 12, width: 3, height: 6 }],
    ['rect', { x: 12, y: 8, width: 3, height: 10 }],
    ['rect', { x: 17, y: 5, width: 3, height: 13 }],
  ],
  people: [
    ['circle', { cx: 9, cy: 8, r: 3.5 }],
    ['path', { d: 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6' }],
    ['circle', { cx: 17, cy: 9, r: 2.5 }],
    ['path', { d: 'M16 14.2c3.1 0 5.5 2.1 5.5 5.3' }],
  ],
};

const lorem = 'Every slide says one thing, in words a person reads at a glance from the back of the room.';
const longText =
  'A box with more words than it can hold makes them smaller until they fit, as PowerPoint does when its text is set to shrink on overflow. These words keep going so that the box has to shrink them, line after line, until the last of them fits above its bottom edge.';

/** The decks: { name, title, model }. */
export function samples() {
  const pic = testPicture();
  const sky = skyPicture();
  const decks = [];

  // Every layout, with the footer on all but the title slide.
  decks.push({
    name: 'layouts',
    title: 'PowerPoint check: layouts',
    model: {
      theme: 'paper',
      footer: { num: true, text: 'Hydor · office check', date: 'today', skipTitle: true },
      slides: [
        { layout: 'title', title: 'Quarterly review', subtitle: 'What we did, what we learned, what comes next', notes: 'Welcome everyone.\nThis is the speaker notes text.' },
        { layout: 'content', title: 'What we learned', text: '- Customers want fewer steps\n- Most of them start on a phone\n  - and finish on a computer\n- Support time fell by a third\n1. Measure first\n2. Then change one thing' },
        { layout: 'two', title: 'Before and after', leftTitle: 'Before', rightTitle: 'After', left: ['Four screens to sign up', 'Email only', 'A week to answer'], right: ['One screen', 'Email, phone or a passkey', 'Answers within a day'] },
        { layout: 'section', title: 'Part two', subtitle: 'Where the growth came from' },
        { layout: 'image-right', title: 'A picture beside the words', text: '- The picture fills its half\n- Cropped to cover it\n- Words on the left', image: pic },
        { layout: 'image', title: 'A picture on its own', image: pic, caption: 'Fitted inside its box, with a caption under it' },
        {
          layout: 'stats',
          title: 'Big numbers',
          stats: [
            { value: '42%', label: 'more sign-ups' },
            { value: '3.1×', label: 'faster answers' },
            { value: '12k', label: 'new teams' },
          ],
        },
        {
          layout: 'cards',
          title: 'Three cards',
          cards: [
            { title: 'Plan', text: 'Decide what matters most this quarter.' },
            { title: 'Build', text: 'Make the smallest thing that shows it works.' },
            { title: 'Learn', text: 'Watch how people use it, then change it.' },
          ],
        },
        {
          layout: 'steps',
          title: 'Four steps',
          steps: [
            { title: 'Ask', text: 'Talk to ten customers.' },
            { title: 'Sketch', text: 'Draw the flow on paper.' },
            { title: 'Try', text: 'Ship it to a few teams.' },
            { title: 'Grow', text: 'Open it to everyone.' },
          ],
        },
        { layout: 'quote', quote: 'Simple things should be simple, complex things should be possible.', by: 'Alan Kay' },
        {
          layout: 'chart',
          title: 'Sign-ups by quarter',
          chart: {
            kind: 'column',
            labels: ['Q1', 'Q2', 'Q3', 'Q4'],
            series: [
              { name: '2025', values: [12, 18, 15, 24] },
              { name: '2026', values: [16, 22, 27, 31] },
            ],
            values: true,
          },
        },
        {
          layout: 'table',
          title: 'Plans',
          table: [
            ['Plan', 'Price', 'Seats'],
            ['Free', '$0', '3'],
            ['Team', '$12', '25'],
            ['Business', '$30', 'Unlimited'],
          ],
        },
        { layout: 'title-only', title: 'A title alone', extra: [{ type: 'text', x: 80, y: 220, w: 700, h: 120, text: 'A text box added by hand under it.', size: 30 }] },
        { layout: 'end', title: 'Thank you', subtitle: 'Questions?' },
        { layout: 'blank', extra: [{ type: 'text', x: 340, y: 300, w: 600, h: 120, text: 'A blank slide with one box', size: 36, align: 'center', valign: 'middle' }] },
      ],
    },
  });

  // Each theme: its fonts and colours on a title slide and a slide of bullets.
  for (const theme of ['paper', 'midnight', 'ember', 'forest', 'ocean', 'noir', 'blossom', 'slate']) {
    decks.push({
      name: `theme-${theme}`,
      title: `PowerPoint check: theme ${theme}`,
      model: {
        theme,
        slides: [
          { layout: 'title', title: `The ${theme} theme`, subtitle: 'Its heading font above, its body font here' },
          { layout: 'content', title: 'Bullets in its body font', text: `- **Bold words** and *italic words*\n- A longer line that wraps onto a second line inside its box, to show the line height\n  - A second level\n1. Numbered\n2. And again` },
          {
            layout: 'cards',
            title: 'Cards in its colours',
            cards: [
              { title: 'One', text: lorem },
              { title: 'Two', text: 'Short words.' },
              { title: 'Three', text: 'A card with a little more to say than the others.' },
            ],
          },
        ],
      },
    });
  }

  // Text: every format, lists, spacing, fitting, and other scripts.
  decks.push({
    name: 'text',
    title: 'PowerPoint check: text',
    model: {
      theme: 'paper',
      slides: [
        {
          els: [
            { type: 'text', role: 'title', x: 60, y: 30, w: 1160, h: 80, size: 44, bold: true, text: 'Every way a word can look' },
            {
              type: 'text',
              x: 60,
              y: 130,
              w: 560,
              h: 540,
              size: 26,
              line: 'muted',
              paras: [
                { runs: [{ t: 'Plain, ' }, { t: 'bold', b: true }, { t: ', ' }, { t: 'italic', i: true }, { t: ', ' }, { t: 'underlined', u: true }, { t: ' and ' }, { t: 'struck', s: true }, { t: '.' }] },
                { runs: [{ t: 'Coloured ', color: 'accent' }, { t: 'red ', color: '#d62828' }, { t: 'highlighted', hl: '#ffe066' }, { t: ' and ' }, { t: 'a link', link: 'https://example.com' }, { t: '.' }] },
                { runs: [{ t: 'Sizes: ' }, { t: 'small ', size: 18 }, { t: 'large ', size: 40 }, { t: 'normal.' }] },
                { runs: [{ t: 'Fonts: ' }, { t: 'Georgia, ', font: 'Georgia' }, { t: 'Courier New, ', font: 'Courier New' }, { t: 'Playfair Display', font: 'Playfair Display' }, { t: '.' }] },
                { runs: [{ t: 'E = mc' }, { t: '2', sup: true }, { t: ' and H' }, { t: '2', sub: true }, { t: 'O' }] },
                { runs: [{ t: 'Centred', b: true }], align: 'center' },
                { runs: [{ t: 'To the right' }], align: 'right' },
                { runs: [{ t: 'Justified: ' + lorem + ' ' + lorem }], align: 'justify' },
              ],
            },
            {
              type: 'text',
              x: 660,
              y: 130,
              w: 560,
              h: 540,
              size: 24,
              gap: 10,
              line: 'muted',
              text: '- First level bullet\n  - Second level\n    - Third level\n      - Fourth level\n        - Fifth level\n1. Numbered one\n2. Numbered two\n  1. Inner a\n  2. Inner b\n    1. Deeper i\n3. Numbered three\nA paragraph with no bullet after them.',
            },
          ],
        },
        {
          els: [
            { type: 'text', role: 'title', x: 60, y: 30, w: 1160, h: 80, size: 44, bold: true, text: 'Line and paragraph spacing' },
            ...[1, 1.5, 2].map((lh, i) => ({ type: 'text', x: 60 + i * 390, y: 140, w: 360, h: 300, size: 24, lh, line: 'muted', text: `Line height ${lh}. ${lorem}` })),
            ...[0, 12, 30].map((gap, i) => ({ type: 'text', x: 60 + i * 390, y: 460, w: 360, h: 230, size: 22, gap, line: 'muted', text: `Space after ${gap} px\nSecond paragraph\nThird paragraph` })),
          ],
        },
        {
          els: [
            { type: 'text', role: 'title', x: 60, y: 30, w: 1160, h: 80, size: 44, bold: true, text: 'Boxes: insets, anchors, letter spacing' },
            ...['top', 'middle', 'bottom'].map((valign, i) => ({ type: 'text', x: 60 + i * 260, y: 140, w: 240, h: 240, size: 24, valign, fill: 'soft', line: 'accent', text: `Anchored ${valign}` })),
            ...[0, 10, 36].map((pad, i) => ({ type: 'text', x: 60 + i * 260, y: 410, w: 240, h: 130, size: 22, pad, fill: 'soft', text: `Inset ${pad} px on every side of the words` })),
            { type: 'text', x: 860, y: 140, w: 360, h: 120, size: 28, ls: 0.12, text: 'Letters spaced wide', fill: 'soft' },
            { type: 'text', x: 860, y: 280, w: 360, h: 120, size: 28, ls: -0.04, text: 'Letters set tight together', fill: 'soft' },
            { type: 'text', x: 860, y: 420, w: 360, h: 120, size: 22, role: 'caption', text: 'A caption, in the muted colour' },
            { type: 'text', x: 60, y: 570, w: 1160, h: 120, size: 72, role: 'big', bold: true, color: 'accent', align: 'center', valign: 'middle', text: '98.6%' },
          ],
        },
        {
          els: [
            { type: 'text', role: 'title', x: 60, y: 30, w: 1160, h: 80, size: 44, bold: true, text: 'Words made smaller to fit their boxes' },
            { type: 'text', x: 60, y: 140, w: 360, h: 200, size: 30, fit: 'shrink', line: 'accent', text: longText },
            { type: 'text', x: 460, y: 140, w: 360, h: 200, size: 30, fit: 'shrink', line: 'accent', text: '- A list that shrinks\n- With many bullets\n- More than fit\n- In its box\n- Still more\n- And the last' },
            { type: 'text', x: 860, y: 140, w: 360, h: 200, size: 30, fit: 'none', line: 'accent', text: 'This box does not shrink its words, so they run out of it at the bottom edge.' },
            { type: 'text', role: 'title', x: 60, y: 420, w: 560, h: 90, size: 46, bold: true, fit: 'shrink', valign: 'bottom', line: 'muted', text: 'A title far too long for the box it is given here' },
            { type: 'shape', shape: 'round', x: 660, y: 420, w: 560, h: 240, fill: 'accent', color: 'accentFg', size: 30, align: 'center', valign: 'middle', fit: 'shrink', text: longText },
          ],
        },
        {
          els: [
            { type: 'text', role: 'title', x: 60, y: 30, w: 1160, h: 90, size: 46, bold: true, text: '季度回顾 · Τριμηνιαία ανασκόπηση' },
            { type: 'text', x: 60, y: 150, w: 560, h: 520, size: 26, gap: 10, text: '- 客户希望步骤更少\n- 大多数人从手机开始\n- 支持时间减少了三分之一\n中文与 English 混排的一行文字，看看换行是否一致。' },
            {
              type: 'text',
              x: 660,
              y: 150,
              w: 560,
              h: 520,
              size: 26,
              gap: 10,
              text: '- Οι πελάτες θέλουν λιγότερα βήματα\n- Οι περισσότεροι ξεκινούν από το κινητό\n- Ο χρόνος υποστήριξης μειώθηκε κατά ένα τρίτο\nΗ γρήγορη καφέ αλεπού πηδά πάνω από τον τεμπέλη σκύλο.',
            },
          ],
        },
      ],
    },
  });

  // Shapes: every kind, outlines, gradients, shadows, turns; lines and connectors.
  const kinds = ['rect', 'round', 'ellipse', 'triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'arrow', 'larrow', 'uarrow', 'darrow', 'chevron', 'parallelogram', 'trapezoid', 'plus', 'heart', 'callout'];
  decks.push({
    name: 'shapes',
    title: 'PowerPoint check: shapes',
    model: {
      theme: 'slate',
      slides: [
        {
          els: kinds.map((shape, i) => ({ type: 'shape', shape, x: 60 + (i % 5) * 236, y: 40 + Math.floor(i / 5) * 170, w: 200, h: 140, fill: `c${(i % 6) + 1}`, color: '#ffffff', size: 18, text: shape, align: 'center', valign: 'middle' })),
        },
        {
          els: [
            { type: 'shape', shape: 'rect', x: 60, y: 60, w: 240, h: 160, fill: 'soft', line: 'accent', lineW: 2, text: 'Solid 2 px', color: 'fg', size: 22, align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'rect', x: 340, y: 60, w: 240, h: 160, fill: 'soft', line: 'accent', lineW: 6, dash: 'dash', text: 'Dashed 6 px', color: 'fg', size: 22, align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'ellipse', x: 620, y: 60, w: 240, h: 160, fill: 'soft', line: 'c4', lineW: 4, dash: 'dot', text: 'Dotted', color: 'fg', size: 22, align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'round', x: 900, y: 60, w: 300, h: 160, radius: 40, fill: 'accent', fill2: 'c2', angle: 90, text: 'Gradient across', size: 22, align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'rect', x: 60, y: 280, w: 240, h: 160, fill: 'accent', fill2: 'c3', angle: 180, text: 'Gradient down', size: 22, align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'round', x: 340, y: 280, w: 240, h: 160, fill: 'bg', shadow: true, text: 'Shadow', color: 'fg', size: 22, align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'rect', x: 620, y: 280, w: 240, h: 160, fill: 'accent', opacity: 0.5, text: 'Half see-through', size: 22, align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'arrow', x: 900, y: 300, w: 300, h: 120, fill: 'c2', rot: 30, text: 'Turned 30°', size: 22, align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'triangle', x: 80, y: 500, w: 200, h: 160, fill: 'c4', rot: 180 },
            { type: 'text', x: 340, y: 500, w: 240, h: 160, rot: 90, fill: 'soft', size: 22, text: 'A text box turned a quarter', align: 'center', valign: 'middle' },
            { type: 'shape', shape: 'star', x: 640, y: 490, w: 200, h: 190, fill: 'c3', line: 'fg', lineW: 3, rot: -15 },
            { type: 'shape', shape: 'round', x: 900, y: 500, w: 300, h: 160, radius: 8, fill: 'transparent', line: 'fg', lineW: 2, text: 'Outline only', color: 'fg', size: 22, align: 'center', valign: 'middle' },
          ],
        },
        {
          els: [
            { type: 'line', x: 60, y: 80, w: 300, h: 0, width: 2 },
            { type: 'line', x: 60, y: 140, w: 300, h: 0, width: 6, color: 'accent', end: 'arrow' },
            { type: 'line', x: 60, y: 200, w: 300, h: 0, width: 4, color: 'c4', start: 'arrow', end: 'arrow', dash: 'dash' },
            { type: 'line', x: 60, y: 260, w: 300, h: 0, width: 4, color: 'c2', start: 'dot', end: 'dot', dash: 'dot' },
            { type: 'line', x: 420, y: 60, w: 200, h: 220, width: 3, color: 'accent', end: 'arrow' },
            { type: 'line', x: 860, y: 60, w: -200, h: 220, width: 3, color: 'c3', end: 'arrow' },
            { id: 'na', type: 'shape', shape: 'rect', x: 60, y: 360, w: 200, h: 100, fill: 'c1', text: 'Start', size: 22, align: 'center', valign: 'middle' },
            { id: 'nb', type: 'shape', shape: 'ellipse', x: 500, y: 520, w: 200, h: 120, fill: 'c2', text: 'Middle', size: 22, align: 'center', valign: 'middle' },
            { id: 'nc', type: 'shape', shape: 'round', x: 960, y: 360, w: 220, h: 100, fill: 'c5', text: 'End', size: 22, align: 'center', valign: 'middle' },
            { id: 'nd', type: 'shape', shape: 'diamond', x: 960, y: 540, w: 220, h: 140, fill: 'c3', text: 'Choice', size: 22, align: 'center', valign: 'middle' },
            { type: 'connector', from: 'na', to: 'nb', end: 'arrow', width: 3, color: 'fg' },
            { type: 'connector', from: { el: 'na', at: 'r' }, to: { el: 'nc', at: 'l' }, route: 'elbow', end: 'arrow', width: 3, color: 'accent' },
            { type: 'connector', from: { el: 'nb', at: 'r' }, to: { el: 'nd', at: 'l' }, route: 'elbow', end: 'arrow', width: 3, color: 'c4' },
            { type: 'connector', from: { el: 'nc', at: 'b' }, to: { el: 'nd', at: 't' }, end: 'arrow', width: 3, color: 'c2', dash: 'dash' },
          ],
        },
      ],
    },
  });

  // Pictures, icons, equations, a video, backgrounds.
  decks.push({
    name: 'media',
    title: 'PowerPoint check: pictures and media',
    model: {
      theme: 'ocean',
      slides: [
        {
          els: [
            { type: 'image', src: pic, x: 40, y: 40, w: 280, h: 280, fit: 'cover', alt: 'Cover' },
            { type: 'image', src: pic, x: 340, y: 40, w: 280, h: 280, fit: 'contain', alt: 'Contain', line: 'fg', lineW: 1 },
            { type: 'image', src: pic, x: 640, y: 40, w: 280, h: 280, fit: 'fill', alt: 'Fill' },
            { type: 'image', src: pic, x: 940, y: 40, w: 300, h: 200, crop: { l: 0.1, t: 0.2, r: 0.3, b: 0 }, alt: 'Cropped' },
            { type: 'image', src: pic, x: 40, y: 380, w: 280, h: 190, flipH: true, alt: 'Flipped across' },
            { type: 'image', src: pic, x: 340, y: 380, w: 280, h: 190, flipV: true, alt: 'Flipped down' },
            { type: 'image', src: pic, x: 640, y: 380, w: 280, h: 190, radius: 30, line: 'accent', lineW: 6, shadow: true, alt: 'Rounded' },
            { type: 'image', src: pic, x: 960, y: 380, w: 260, h: 180, rot: 20, opacity: 0.6, alt: 'Turned' },
          ],
        },
        {
          els: [
            { type: 'image', src: pic, x: 40, y: 60, w: 360, h: 240, adjust: { bright: 40 } },
            { type: 'image', src: pic, x: 460, y: 60, w: 360, h: 240, adjust: { contrast: 50 } },
            { type: 'image', src: pic, x: 880, y: 60, w: 360, h: 240, adjust: { sat: 0 } },
            { type: 'image', src: pic, x: 40, y: 380, w: 360, h: 240, adjust: { gray: true } },
            { type: 'image', src: pic, x: 460, y: 380, w: 360, h: 240, adjust: { sat: 200, bright: -20 } },
            { type: 'image', src: pic, x: 880, y: 380, w: 360, h: 240, adjust: { blur: 6 } },
          ],
        },
        {
          els: [
            { type: 'icon', icon: 'check', paths: ICONS.check, x: 60, y: 60, w: 120, h: 120, color: 'accent' },
            { type: 'icon', icon: 'star', paths: ICONS.star, x: 220, y: 60, w: 120, h: 120, color: 'c3', lineW: 1.5 },
            { type: 'icon', icon: 'chart', paths: ICONS.chart, x: 380, y: 60, w: 120, h: 120, color: 'c4', lineW: 3 },
            { type: 'icon', icon: 'people', paths: ICONS.people, x: 540, y: 60, w: 160, h: 120, color: 'fg', rot: 15 },
            { type: 'math', tex: 'E = mc^2', x: 60, y: 240, w: 500, h: 110 },
            { type: 'math', tex: '\\int_0^1 x^2\\,dx = \\frac{1}{3}', x: 60, y: 370, w: 500, h: 140, color: 'accent' },
            { type: 'math', tex: '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}', x: 60, y: 530, w: 500, h: 150, align: 'left' },
            { type: 'video', src: 'https://youtu.be/dQw4w9WgXcQ', x: 640, y: 260, w: 580, h: 326 },
          ],
        },
        { bg: { image: sky, dim: 0.35 }, els: [{ type: 'text', role: 'title', x: 100, y: 260, w: 1080, h: 200, size: 64, bold: true, color: '#ffffff', align: 'center', valign: 'middle', text: 'A picture behind the words, darkened' }] },
        { bg: { color: 'accent', to: 'c5', angle: 135 }, els: [{ type: 'text', role: 'title', x: 100, y: 260, w: 1080, h: 200, size: 64, bold: true, color: '#ffffff', align: 'center', valign: 'middle', text: 'A gradient background' }] },
      ],
    },
  });

  // Tables and charts.
  decks.push({
    name: 'data',
    title: 'PowerPoint check: tables and charts',
    model: {
      theme: 'forest',
      slides: [
        {
          els: [
            {
              type: 'table',
              x: 60,
              y: 60,
              w: 1160,
              h: 340,
              size: 22,
              head: true,
              band: true,
              cols: [2, 1, 1, 1],
              aligns: ['left', 'right', 'right', 'center'],
              rows: [
                ['Region', 'Q1', 'Q2', 'Trend'],
                ['North', '1,204', '1,410', '↑'],
                ['South', '980', '1,050', '↑'],
                ['East and West together', '2,310', '2,200', '↓'],
                ['Total', '4,494', '4,660', ''],
              ],
              merges: [{ r: 4, c: 2, rs: 1, cs: 2 }],
              fills: { '3,3': '#fde2e1', '4,0': 'soft' },
            },
            {
              type: 'table',
              x: 60,
              y: 440,
              w: 700,
              h: 240,
              size: 20,
              head: false,
              band: false,
              line: 'accent',
              font: 'Georgia',
              rows: [
                ['Merged down', 'b', 'c'],
                ['', 'e', 'f'],
                ['g', 'Merged across', ''],
              ],
              merges: [
                { r: 0, c: 0, rs: 2, cs: 1 },
                { r: 2, c: 1, rs: 1, cs: 2 },
              ],
            },
          ],
        },
        {
          els: [
            {
              type: 'chart',
              kind: 'column',
              x: 40,
              y: 40,
              w: 590,
              h: 320,
              title: 'Columns',
              labels: ['Q1', 'Q2', 'Q3', 'Q4'],
              series: [
                { name: 'North', values: [12, 18, 15, 24] },
                { name: 'South', values: [8, 11, 14, 9] },
              ],
              legend: true,
              grid: true,
              values: true,
              size: 16,
            },
            {
              type: 'chart',
              kind: 'bar',
              x: 650,
              y: 40,
              w: 590,
              h: 320,
              title: 'Bars, stacked',
              labels: ['Mon', 'Tue', 'Wed'],
              series: [
                { name: 'Calls', values: [5, 7, 3] },
                { name: 'Emails', values: [9, 4, 6] },
              ],
              legend: true,
              stacked: true,
              size: 16,
            },
            {
              type: 'chart',
              kind: 'line',
              x: 40,
              y: 380,
              w: 590,
              h: 320,
              title: 'Lines',
              labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
              series: [
                { name: 'Visits', values: [120, 180, 150, 210, 260] },
                { name: 'Sign-ups', values: [20, 35, 30, 55, 60] },
              ],
              legend: true,
              grid: true,
              size: 16,
            },
            {
              type: 'chart',
              kind: 'area',
              x: 650,
              y: 380,
              w: 590,
              h: 320,
              title: 'Areas, stacked',
              labels: ['A', 'B', 'C', 'D'],
              series: [
                { name: 'One', values: [3, 5, 4, 6] },
                { name: 'Two', values: [2, 2, 3, 4] },
              ],
              legend: true,
              stacked: true,
              grid: true,
              size: 16,
            },
          ],
        },
        {
          els: [
            { type: 'chart', kind: 'pie', x: 60, y: 60, w: 540, h: 600, title: 'A pie', labels: ['Phones', 'Computers', 'Tablets'], series: [{ name: 'Visits', values: [55, 35, 10] }], legend: true, values: true, size: 18 },
            { type: 'chart', kind: 'doughnut', x: 680, y: 60, w: 540, h: 600, title: 'A doughnut', labels: ['Free', 'Team', 'Business', 'Other'], series: [{ name: 'Plans', values: [40, 30, 20, 10] }], legend: true, size: 18 },
          ],
        },
      ],
    },
  });

  // Groups, comments, notes, animations, transitions and the footer, on a dark theme.
  decks.push({
    name: 'structure',
    title: 'PowerPoint check: groups, comments and motion',
    model: {
      theme: 'midnight',
      footer: { num: true, text: 'Midnight footer' },
      slides: [
        {
          notes: 'Groups: the parts move as one.',
          els: [
            { type: 'text', role: 'title', x: 60, y: 30, w: 1160, h: 80, size: 44, bold: true, text: 'Groups' },
            {
              type: 'group',
              name: 'Badge',
              els: [
                { type: 'shape', shape: 'ellipse', x: 80, y: 160, w: 160, h: 160, fill: 'accent' },
                { type: 'text', x: 260, y: 200, w: 300, h: 80, size: 32, text: 'Grouped words' },
              ],
            },
            {
              type: 'group',
              x: 700,
              y: 160,
              rot: 20,
              els: [
                { type: 'shape', shape: 'rect', x: 0, y: 0, w: 240, h: 140, fill: 'c2', text: 'Turned group', size: 22, align: 'center', valign: 'middle', color: '#0f1625' },
                { type: 'line', x: 0, y: 170, w: 240, h: 0, width: 4, color: 'c3' },
                {
                  type: 'group',
                  x: 260,
                  y: 0,
                  els: [
                    { type: 'shape', shape: 'star', x: 0, y: 0, w: 100, h: 100, fill: 'c3' },
                    { type: 'shape', shape: 'heart', x: 0, y: 110, w: 100, h: 90, fill: 'c4' },
                  ],
                },
              ],
            },
            {
              type: 'group',
              opacity: 0.5,
              els: [
                { type: 'shape', shape: 'rect', x: 80, y: 420, w: 300, h: 200, fill: 'c5', text: 'Half see-through group', size: 22, align: 'center', valign: 'middle' },
                { type: 'image', src: pic, x: 400, y: 420, w: 300, h: 200 },
              ],
            },
          ],
          comments: [{ by: 'user', text: 'Make the badge larger?', el: undefined, x: 600, y: 100, replies: [{ by: 'agent', text: 'Made it twice as large.' }] }],
        },
        {
          transition: { fx: 'push', dir: 'left' },
          notes: 'Animations come in one after another.',
          els: [
            { id: 'h1', type: 'text', role: 'title', x: 60, y: 30, w: 1160, h: 80, size: 44, bold: true, text: 'Things that move' },
            { id: 'b1', type: 'text', x: 60, y: 140, w: 600, h: 400, size: 28, gap: 10, text: '- Comes in first\n- Then this\n- And this last' },
            { id: 'p1', type: 'shape', shape: 'round', x: 760, y: 160, w: 400, h: 240, fill: 'accent', color: '#0f1625', text: 'Flies in', size: 32, align: 'center', valign: 'middle' },
          ],
          anims: [
            { el: 'b1', type: 'in', fx: 'float', dir: 'up', on: 'click', dur: 450, delay: 0, byPara: true },
            { el: 'p1', type: 'in', fx: 'fly', dir: 'right', on: 'after', dur: 600, delay: 0 },
            { el: 'p1', type: 'em', fx: 'pulse', on: 'click', dur: 500, delay: 0 },
          ],
          comments: [{ by: 'user', text: 'Is this too much motion?', el: 'p1' }],
        },
        {
          transition: { fx: 'morph', dur: 1200 },
          els: [
            { id: 'h2', key: 'h1', type: 'text', role: 'title', x: 60, y: 560, w: 1160, h: 80, size: 44, bold: true, text: 'Things that move' },
            { id: 'p2', key: 'p1', type: 'shape', shape: 'round', x: 120, y: 120, w: 600, h: 360, fill: 'c2', color: '#0f1625', text: 'Morphed', size: 40, align: 'center', valign: 'middle' },
          ],
        },
        { transition: { fx: 'fade', auto: 5 }, nofooter: true, els: [{ type: 'text', x: 200, y: 300, w: 880, h: 120, size: 40, align: 'center', valign: 'middle', text: 'No footer on this slide; it goes on by itself' }] },
      ],
    },
  });

  // A 4:3 deck.
  decks.push({
    name: 'square',
    title: 'PowerPoint check: 4 by 3',
    model: {
      ratio: '4:3',
      theme: 'ember',
      footer: { num: true },
      slides: [
        { layout: 'title', title: 'A 4:3 deck', subtitle: 'Taller slides' },
        { layout: 'content', title: 'Bullets on a taller slide', text: '- One\n- Two\n- Three' },
      ],
    },
  });

  return decks;
}
