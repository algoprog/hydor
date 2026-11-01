// What the visual editor adds to a page (Add), and the words it shows inside the page's frame. The frame
// is apart from the app, so the app's translations don't reach it: the words go there already translated.
import { tr } from '../../../i18n/runtime';

export interface Block {
  id: string;
  label: string;
  /** Its markup; the page kit's classes give it a look in any page. */
  html: string;
  /** Its words are written at once. */
  edit?: boolean;
}

export const BLOCKS: Block[] = [
  { id: 'heading', label: 'Heading', html: '<h2>A new heading</h2>', edit: true },
  { id: 'text', label: 'Text', html: '<p>Write something here.</p>', edit: true },
  { id: 'button', label: 'Button', html: '<a class="n-btn n-primary" href="#">A button</a>', edit: true },
  { id: 'image', label: 'Picture', html: '<img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 800 400%22%3E%3Crect width=%22800%22 height=%22400%22 fill=%22%23ece8df%22/%3E%3Cpath d=%22M330 250l60-70 50 55 35-40 75 90H330z%22 fill=%22%23c9c1b1%22/%3E%3Ccircle cx=%22370%22 cy=%22165%22 r=%2222%22 fill=%22%23c9c1b1%22/%3E%3C/svg%3E" alt="" style="display:block;width:100%;height:auto;border-radius:12px">' },
  { id: 'list', label: 'List', html: '<ul><li>First thing</li><li>Second thing</li><li>Third thing</li></ul>' },
  { id: 'card', label: 'Card', html: '<div class="n-card" style="margin:14px 0"><div class="n-body"><h3>A card</h3><p>A few words about it.</p></div></div>' },
  { id: 'columns', label: 'Two columns', html: '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:14px 0"><div><h3>On the left</h3><p>Some words.</p></div><div><h3>On the right</h3><p>Some words.</p></div></div>' },
  { id: 'table', label: 'Table', html: '<div class="n-scroll"><table class="n-compare"><thead><tr><th></th><th>First</th><th>Second</th></tr></thead><tbody><tr><th>Price</th><td>—</td><td>—</td></tr><tr><th>Size</th><td>—</td><td>—</td></tr></tbody></table></div>' },
  { id: 'quote', label: 'Quote', html: '<blockquote style="margin:14px 0;padding:4px 16px;border-left:3px solid currentColor;opacity:.8">Something worth quoting.</blockquote>', edit: true },
  { id: 'divider', label: 'Divider', html: '<hr style="border:0;border-top:1px solid #e2ddd2;margin:20px 0">' },
  { id: 'space', label: 'Empty space', html: '<div style="height:32px"></div>' },
  { id: 'section', label: 'Section', html: '<section style="padding:20px;border-radius:14px;background:#f5f3ee;margin:14px 0"><h2>A section</h2><p>What it is about.</p></section>' },
];

/** The words of the editor's bar and its names for parts, in the app's language. */
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
    drag: 'Drag to move it',
    parentTip: 'Pick the part around it (Esc)',
    editTip: 'Change the words (click again)',
    upTip: 'Move up',
    downTip: 'Move down',
    dupTip: 'Duplicate (Ctrl+D)',
    delTip: 'Delete (Delete)',
  };
  return Object.fromEntries(Object.entries(words).map(([k, v]) => [k, tr(v)]));
}
