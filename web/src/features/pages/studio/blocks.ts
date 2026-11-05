// What the visual editor adds to a page (Add), and the words it shows inside the page's frame. The frame
// is apart from the app, so the app's translations don't reach it: the words go there already translated.
// The blocks use the page kit's classes and colours (with their own colours to fall back on, for a page
// saved as a file), and fill the width they get.
import { tr } from '../../../i18n/runtime';

export type BlockKind = 'basic' | 'layout' | 'section';

export interface Block {
  id: string;
  kind: BlockKind;
  label: string;
  /** Its markup. */
  html: string;
  /** Its words are written at once. */
  edit?: boolean;
}

const SOFT = 'var(--n-soft,#f5f3ee)';
const LINE = 'var(--n-line,#e2ddd2)';
const MUTED = 'var(--n-muted,#675f52)';
const PICTURE =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 800 400%22%3E%3Crect width=%22800%22 height=%22400%22 fill=%22%23ece8df%22/%3E%3Cpath d=%22M330 250l60-70 50 55 35-40 75 90H330z%22 fill=%22%23c9c1b1%22/%3E%3Ccircle cx=%22370%22 cy=%22165%22 r=%2222%22 fill=%22%23c9c1b1%22/%3E%3C/svg%3E';
const grid = (min: number, inner: string, style = '') => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,${min}px),1fr));gap:16px;${style}">${inner}</div>`;
const tile = (inner: string) => `<div style="padding:20px;border:1px solid ${LINE};border-radius:14px">${inner}</div>`;
const plan = (name: string, price: string, main: boolean) =>
  `<div style="display:flex;flex-direction:column;gap:10px;padding:22px;border:${main ? '2px solid var(--n-accent,#8a6100)' : `1px solid ${LINE}`};border-radius:16px"><h3 style="margin:0">${name}</h3><div style="font-size:32px;font-weight:700;line-height:1">${price}<span style="font-size:14px;font-weight:400;color:${MUTED}"> a month</span></div><ul style="margin:0;padding-left:18px;color:${MUTED}"><li>One thing it has</li><li>Another thing</li></ul><a class="n-btn${main ? ' n-primary' : ''}" href="#" style="margin-top:auto">Choose ${name}</a></div>`;
const question = (q: string, a: string) =>
  `<details style="border:1px solid ${LINE};border-radius:12px;padding:12px 16px;margin:8px 0"><summary style="cursor:pointer;font-weight:600">${q}</summary><p style="margin:8px 0 0;color:${MUTED}">${a}</p></details>`;

export const BLOCKS: Block[] = [
  { id: 'heading', kind: 'basic', label: 'Heading', html: '<h2>A new heading</h2>', edit: true },
  { id: 'text', kind: 'basic', label: 'Text', html: '<p>Write something here.</p>', edit: true },
  { id: 'button', kind: 'basic', label: 'Button', html: '<a class="n-btn n-primary" href="#">A button</a>', edit: true },
  { id: 'link', kind: 'basic', label: 'Link', html: '<p><a href="https://example.com">A link</a></p>', edit: true },
  { id: 'image', kind: 'basic', label: 'Picture', html: `<img src="${PICTURE}" alt="" style="display:block;width:100%;height:auto;border-radius:12px">` },
  { id: 'list', kind: 'basic', label: 'List', html: '<ul><li>First thing</li><li>Second thing</li><li>Third thing</li></ul>' },
  { id: 'todo', kind: 'basic', label: 'To-do list', html: '<ul class="n-todo"><li><input type="checkbox"><span>Something to do</span></li><li><input type="checkbox"><span>Something else</span></li></ul>', edit: true },
  { id: 'callout', kind: 'basic', label: 'Callout', html: '<div class="n-callout"><span class="n-callout-icon">💡</span><div class="n-callout-text">Something to keep in mind.</div></div>', edit: true },
  {
    id: 'quote',
    kind: 'basic',
    label: 'Quote',
    html: '<blockquote style="margin:16px 0;padding:4px 16px;border-left:3px solid currentColor;opacity:.85">Something worth quoting.</blockquote>',
    edit: true,
  },
  { id: 'divider', kind: 'basic', label: 'Divider', html: `<hr style="border:0;border-top:1px solid ${LINE};margin:24px 0">` },
  { id: 'space', kind: 'basic', label: 'Empty space', html: '<div style="height:32px"></div>' },

  {
    id: 'section',
    kind: 'layout',
    label: 'Section',
    html: `<section style="padding:32px 24px;border-radius:16px;background:${SOFT};margin:16px 0"><h2 style="margin-top:0">A section</h2><p style="margin-bottom:0">What it is about.</p></section>`,
  },
  { id: 'columns', kind: 'layout', label: 'Two columns', html: grid(240, '<div><h3>On the left</h3><p>Some words.</p></div><div><h3>On the right</h3><p>Some words.</p></div>', 'margin:16px 0') },
  {
    id: 'columns3',
    kind: 'layout',
    label: 'Three columns',
    html: grid(180, '<div><h3>First</h3><p>Some words.</p></div><div><h3>Second</h3><p>Some words.</p></div><div><h3>Third</h3><p>Some words.</p></div>', 'margin:16px 0'),
  },
  { id: 'card', kind: 'layout', label: 'Card', html: '<div class="n-card" style="margin:16px 0"><div class="n-body"><h3>A card</h3><p>A few words about it.</p></div></div>' },
  {
    id: 'cards',
    kind: 'layout',
    label: 'Cards',
    html: `<div class="n-grid">${['First', 'Second', 'Third'].map((t) => `<div class="n-card"><img src="${PICTURE}" alt=""><div class="n-body"><h3>${t}</h3><p>A few words about it.</p></div></div>`).join('')}</div>`,
  },
  {
    id: 'table',
    kind: 'layout',
    label: 'Table',
    html: '<div class="n-scroll"><table class="n-compare"><thead><tr><th></th><th>First</th><th>Second</th></tr></thead><tbody><tr><th>Price</th><td>—</td><td>—</td></tr><tr><th>Size</th><td>—</td><td>—</td></tr></tbody></table></div>',
  },
  {
    id: 'stats',
    kind: 'layout',
    label: 'Numbers',
    html: grid(
      140,
      ['128', '42%', '3.5×']
        .map(
          (n) =>
            `<div style="padding:16px;border-radius:12px;background:${SOFT}"><div style="font-size:28px;font-weight:700;line-height:1.1">${n}</div><div style="color:${MUTED};font-size:13px">What it counts</div></div>`,
        )
        .join(''),
      'margin:16px 0;gap:12px',
    ),
  },
  { id: 'foldout', kind: 'layout', label: 'Fold-out', html: question('A question', 'The answer, shown when it is opened.') },
  { id: 'toc', kind: 'layout', label: 'Table of contents', html: '<nav class="n-toc"></nav>' },
  { id: 'field', kind: 'layout', label: 'Field', html: '<label class="n-field">Your name<input type="text" placeholder="Type here"></label>' },

  {
    id: 'hero',
    kind: 'section',
    label: 'Introduction',
    html: `<section style="padding:56px 24px;text-align:center;border-radius:20px;background:${SOFT};margin:16px 0"><h1 style="font-size:clamp(28px,5vw,48px);line-height:1.1;margin:0 0 12px">A big, clear promise</h1><p style="font-size:18px;color:${MUTED};max-width:640px;margin:0 auto 24px">A line or two on what this is and who it is for.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="n-btn n-primary" href="#">Get started</a><a class="n-btn" href="#">Learn more</a></div></section>`,
  },
  {
    id: 'features',
    kind: 'section',
    label: 'Features',
    html: `<section style="margin:32px 0"><h2 style="text-align:center">What you get</h2>${grid(
      200,
      [
        ['⚡', 'Fast'],
        ['🔒', 'Safe'],
        ['💬', 'Friendly'],
      ]
        .map(([i, t]) => tile(`<div style="font-size:26px">${i}</div><h3 style="margin:8px 0 4px">${t}</h3><p style="margin:0;color:${MUTED}">A line on why it matters.</p>`))
        .join(''),
      'margin-top:16px',
    )}</section>`,
  },
  {
    id: 'pricing',
    kind: 'section',
    label: 'Prices',
    html: `<section style="margin:32px 0"><h2 style="text-align:center">Plans</h2>${grid(200, plan('Starter', '€0', false) + plan('Pro', '€12', true) + plan('Team', '€30', false), 'margin-top:16px')}</section>`,
  },
  {
    id: 'steps',
    kind: 'section',
    label: 'Steps',
    html: `<section style="margin:32px 0"><h2>How it works</h2>${grid(
      180,
      ['Sign up', 'Set it up', 'Enjoy it']
        .map(
          (t, i) =>
            `<div><div style="display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--n-accent,#8a6100);color:var(--n-accent-fg,#fff);font-weight:700">${i + 1}</div><h3 style="margin:10px 0 4px">${t}</h3><p style="margin:0;color:${MUTED}">A line on this step.</p></div>`,
        )
        .join(''),
      'margin-top:12px',
    )}</section>`,
  },
  {
    id: 'faq',
    kind: 'section',
    label: 'Questions',
    html: `<section style="margin:32px 0"><h2>Questions</h2>${question('What is it?', 'A short, plain answer.')}${question('Who is it for?', 'A short, plain answer.')}${question('How much does it cost?', 'A short, plain answer.')}</section>`,
  },
  {
    id: 'testimonial',
    kind: 'section',
    label: 'Praise',
    html: `<figure style="margin:32px 0;padding:28px;border-radius:18px;background:${SOFT};text-align:center"><blockquote style="margin:0;font-size:20px;line-height:1.45">“Something kind someone said about it.”</blockquote><figcaption style="margin-top:12px;color:${MUTED}">A name, what they do</figcaption></figure>`,
  },
  {
    id: 'cta',
    kind: 'section',
    label: 'Call to act',
    html: `<section style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;padding:28px;border-radius:18px;background:var(--n-accent,#8a6100);color:var(--n-accent-fg,#fff);margin:32px 0"><div><h2 style="margin:0 0 4px;color:inherit">Ready to start?</h2><p style="margin:0;opacity:.85">One line that makes it easy to say yes.</p></div><a class="n-btn" href="#">Let’s go</a></section>`,
  },
  {
    id: 'contact',
    kind: 'section',
    label: 'Contact form',
    html: '<form style="display:grid;gap:4px;margin:32px 0"><h2 style="margin:0 0 8px">Get in touch</h2><label class="n-field">Name<input type="text" name="name"></label><label class="n-field">Email<input type="email" name="email"></label><label class="n-field">Message<textarea name="message" rows="4"></textarea></label><button class="n-btn n-primary" type="submit" style="justify-self:start">Send</button></form>',
  },
  {
    id: 'footer',
    kind: 'section',
    label: 'Footer',
    html: `<footer style="display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between;align-items:center;padding:24px 0;margin-top:32px;border-top:1px solid ${LINE};color:${MUTED};font-size:14px"><span>© ${new Date().getFullYear()} Your name</span><nav style="display:flex;gap:16px"><a href="#">About</a><a href="#">Contact</a></nav></footer>`,
  },
];

/** The words of the editor's bars and its names for parts, in the app's language. */
export function editorLabels(): Record<string, string> {
  const words: Record<string, string> = {
    page: 'Page',
    h1: 'Heading 1',
    h2: 'Heading 2',
    h3: 'Heading 3',
    h4: 'Heading 4',
    h5: 'Heading 5',
    h6: 'Heading 6',
    text: 'Text',
    link: 'Link',
    button: 'Button',
    image: 'Picture',
    drawing: 'Drawing',
    video: 'Video',
    audio: 'Sound',
    list: 'List',
    item: 'List item',
    table: 'Table',
    row: 'Row',
    cell: 'Cell',
    divider: 'Divider',
    quote: 'Quote',
    form: 'Form',
    field: 'Field',
    label: 'Label',
    header: 'Top bar',
    footer: 'Footer',
    menu: 'Menu',
    section: 'Section',
    main: 'Main part',
    aside: 'Side part',
    figure: 'Figure',
    caption: 'Caption',
    code: 'Code',
    embed: 'Embedded page',
    details: 'Fold-out',
    summary: 'Fold-out title',
    card: 'Card',
    option: 'Option',
    box: 'Block',
    parentTip: 'Pick the part around it (Esc)',
    editTip: 'Change the words (click again)',
    upTip: 'Move up',
    downTip: 'Move down',
    dupTip: 'Duplicate (Ctrl+D)',
    delTip: 'Delete (Delete)',
    boldTip: 'Bold (Ctrl+B)',
    italicTip: 'Italic (Ctrl+I)',
    underlineTip: 'Underline (Ctrl+U)',
    strikeTip: 'Strike through',
    linkTip: 'Make it a link (Ctrl+K)',
    unlinkTip: 'Not a link',
    clearTip: 'Plain words',
    doneTip: 'Done (Esc)',
    addLinkTip: 'Add the link',
    // Writing as in Notion: the kinds of block, the list "/" opens, the block menu, hints in empty blocks.
    sBullet: 'Bulleted list',
    sNumber: 'Numbered list',
    sTodo: 'To-do list',
    sToggle: 'Toggle list',
    sCallout: 'Callout',
    sCode: 'Code',
    sCols2: 'Two columns',
    sCols3: 'Three columns',
    sToc: 'Table of contents',
    sMath: 'Maths',
    sEmoji: 'Emoji',
    columns: 'Columns',
    cover: 'Cover',
    icon: 'Icon',
    blocks: 'Blocks',
    noBlocks: 'No block by that name',
    turnInto: 'Turn into',
    turnTip: 'Turn into (Ctrl+/)',
    colour: 'Colour',
    textColour: 'Text colour',
    background: 'Background',
    highlight: 'Highlight',
    colourTip: 'Colour and highlight',
    codeTip: 'Code (Ctrl+E)',
    cDefault: 'No colour',
    cGrey: 'Grey',
    cBrown: 'Brown',
    cOrange: 'Orange',
    cYellow: 'Yellow',
    cGreen: 'Green',
    cBlue: 'Blue',
    cPurple: 'Purple',
    cPink: 'Pink',
    cRed: 'Red',
    duplicate: 'Duplicate',
    copy: 'Copy',
    delete: 'Delete',
    askAgent: 'Ask the agent',
    nBlocks: '{n} blocks',
    addBelow: 'Add a block below (Alt: above)',
    addBelowShort: 'Add a block below',
    addEnd: 'Add a block at the end',
    gripTip: 'Drag to move it, click for its menu',
    addIcon: 'Add an icon',
    addCover: 'Add a cover',
    changeCover: 'Change cover',
    removeCover: 'Remove',
    phText: 'Type ‘/’ for commands',
    phTodo: 'To-do',
    phList: 'List',
    phQuote: 'Quote',
    phToggle: 'Toggle',
    tocEmpty: 'The headings of the page show here',
    btnWords: 'A button',
    cardTitle: 'A card',
    cardWords: 'A few words about it.',
  };
  return Object.fromEntries(Object.entries(words).map(([k, v]) => [k, tr(v)]));
}
