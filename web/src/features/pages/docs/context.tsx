// The documents editor's right-click menu, as Google Docs and Word have one: what it offers depends on what is under the
// pointer. On words: cut, copy, paste, a link, a comment, writing with AI, a paragraph's style and clearing the
// formatting, and with words picked also bold, italic and underline, their case, the format painter, rewriting them with
// AI and asking the agent about them. On a link, opening, copying, changing or taking it off; in a table, its rows,
// columns, cells and header; on a picture, its alignment, caption, description, editing, another picture in its place and
// changing it with AI; on words that carry a comment, answering it or resolving it; on a suggestion, accepting or
// rejecting it; on a footnote, citation, cross-reference or equation, changing or taking it out. An older version, which
// nothing changes, offers only copy, select all and find. Every row is an action the menus (menu.tsx) have, built from
// the same lists, so a right-click gives it the words, keys and ticks the menu bar does; this file only says what is
// offered where. (The editor, DocEditor.tsx, opens it from the engine's right-click, menu key or long press.)
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Captions,
  Check,
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  ExternalLink,
  FileText,
  Heading,
  ImageMinus,
  Italic,
  Link2,
  MessageSquarePlus,
  PaintRoller,
  Pencil,
  RefreshCw,
  Reply,
  RotateCcw,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Underline,
  Unlink,
  Wand,
  WandSparkles,
  X,
} from 'lucide-react';
import { PARA_STYLES, STYLES, type Doc } from '@shared/docs';
import { REWRITE_LABELS, type RewriteHow } from '@shared/write';
import type { Comment } from '@shared/comments';
import { isMine } from '../common/Comments';
import type { ImageBlock } from '@shared/docs';
import type { MenuEntry } from '../common/menus';
import type { AtomClick, ContextHit, DocEngine } from './engine';
import { caseEntries, styleEntries, tableEntries, type DocMenuCtx } from './menu';

/** What the right-click menu needs beyond what the menus do: what was hit, and the editor's own boxes, panels and dialogs. */
export interface DocContextCtx extends DocMenuCtx {
  hit: ContextHit;
  /** The browser's spell check is on: the menu says where its suggestions are (Shift+right-click). */
  spellHint: boolean;
  /** The comments of the document (those on the words under the pointer are answered here). */
  threads: Comment[];
  openLink: (url: string) => void;
  copyLink: (url: string) => void;
  /** Ask the agent about the words picked, or the picture picked (where an agent can be asked). */
  askWords?: () => void;
  askPicture?: () => void;
  replacePicture: (id: string) => void;
  editPicture: (id: string) => void;
  changePicture: (id: string, mode: 'change' | 'cutout' | 'erase') => void;
  /** A picture's caption or description, written in its box. */
  pictureText: (id: string, what: 'caption' | 'alt') => void;
  /** Answer, resolve, change or delete a comment; Resolve with AI where an agent can be asked. */
  comment_: { reply: (id: string) => void; resolve: (id: string, on: boolean) => void; edit: (id: string) => void; remove: (id: string) => void; ai?: (id: string) => void };
  /** The box of a thing among the words (a footnote, a citation…). */
  atom: (a: AtomClick) => void;
  /** The words picked rewritten with AI in this way. */
  rewrite: (how: RewriteHow) => void;
}

const QUICK_REWRITES: RewriteHow[] = ['shorter', 'longer', 'simpler', 'formal', 'friendly', 'fix'];

/** The rows of the right-click menu for what is under the pointer. */
export function docContext(c: DocContextCtx): MenuEntry[] {
  const { engine: e, st, hit } = c;
  if (c.readOnly) return [{ label: 'Copy', icon: <Copy size={15} />, keys: 'Ctrl+C', disabled: st.collapsed, run: () => c.copy(false) }, { label: 'Select all', keys: 'Ctrl+A', run: () => document.execCommand('selectAll') }, '-', { label: 'Find', icon: <Search size={15} />, keys: 'Ctrl+F', run: () => c.find(false) }];
  const clip = (cutOk: boolean, both = true): MenuEntry[] => [
    { label: 'Cut', icon: <Scissors size={15} />, keys: 'Ctrl+X', disabled: !cutOk, run: () => c.copy(true) },
    { label: 'Copy', icon: <Copy size={15} />, keys: 'Ctrl+C', disabled: !cutOk, run: () => c.copy(false) },
    { label: 'Paste', icon: <ClipboardPaste size={15} />, keys: 'Ctrl+V', run: () => c.paste(false) },
    both && { label: 'Paste without formatting', icon: <ClipboardPaste size={15} />, keys: 'Ctrl+Shift+V', also: 'plain text', run: () => c.paste(true) },
  ];

  // A picture: its alignment, caption, description, editing, another in its place, changing it with AI.
  if (hit.kind === 'image') {
    const img = (st.picked ?? e.doc.blocks.find((b) => b.id === hit.id)) as ImageBlock | undefined;
    if (!img || img.type !== 'image') return [];
    return [
      { label: 'Cut', icon: <Scissors size={15} />, keys: 'Ctrl+X', run: () => c.copy(true) },
      { label: 'Copy', icon: <Copy size={15} />, keys: 'Ctrl+C', run: () => c.copy(false) },
      { label: 'Delete', icon: <Trash2 size={15} />, keys: 'Delete', danger: true, run: () => e.removePicked() },
      '-',
      { label: 'Align left', icon: <AlignLeft size={15} />, checked: img.align === 'left', run: () => e.image(img.id, { align: 'left' }) },
      { label: 'Centre', icon: <AlignCenter size={15} />, checked: !img.align || img.align === 'center', run: () => e.image(img.id, { align: undefined }) },
      { label: 'Align right', icon: <AlignRight size={15} />, checked: img.align === 'right', run: () => e.image(img.id, { align: 'right' }) },
      '-',
      { label: 'Caption', icon: <Captions size={15} />, checked: !!img.caption, run: () => c.pictureText(img.id, 'caption') },
      { label: 'Description (alt text)', icon: <FileText size={15} />, checked: !!img.alt, also: 'alt text accessibility', run: () => c.pictureText(img.id, 'alt') },
      '-',
      !!img.src && { label: 'Edit picture', icon: <SlidersHorizontal size={15} />, run: () => c.editPicture(img.id) },
      { label: 'Replace picture', icon: <RefreshCw size={15} />, also: 'another picture', run: () => c.replacePicture(img.id) },
      {
        label: 'Change with AI',
        icon: <Wand size={15} />,
        also: 'edit picture ai remove background erase',
        items: [
          { label: 'Change with AI', icon: <WandSparkles size={15} />, run: () => c.changePicture(img.id, 'change') },
          { label: 'Remove the background', icon: <ImageMinus size={15} />, run: () => c.changePicture(img.id, 'cutout') },
          { label: 'Erase part of it', icon: <Eraser size={15} />, run: () => c.changePicture(img.id, 'erase') },
        ],
      },
      !!c.askPicture && { label: 'Ask the agent about it', icon: <Sparkles size={15} className="text-accent" />, run: c.askPicture },
    ];
  }

  // A line across, a page break or a table of contents.
  if (hit.kind === 'block') return [{ label: 'Cut', icon: <Scissors size={15} />, keys: 'Ctrl+X', run: () => c.copy(true) }, { label: 'Copy', icon: <Copy size={15} />, keys: 'Ctrl+C', run: () => c.copy(false) }, { label: 'Delete', icon: <Trash2 size={15} />, keys: 'Delete', danger: true, run: () => e.removePicked() }];

  // A thing among the words, a caption or a callout's emoji: changed in its box, or (but the last two) taken out.
  if (hit.kind === 'math') return [{ label: 'Edit', icon: <Pencil size={15} />, run: () => c.atom({ kind: 'math', id: hit.id }) }, '-', { label: 'Cut', icon: <Scissors size={15} />, keys: 'Ctrl+X', run: () => c.copy(true) }, { label: 'Copy', icon: <Copy size={15} />, keys: 'Ctrl+C', run: () => c.copy(false) }, { label: 'Delete', icon: <Trash2 size={15} />, keys: 'Delete', danger: true, run: () => e.setMath(hit.id, '') }];
  if (hit.kind === 'mark' || hit.kind === 'mathRun')
    return [{ label: 'Edit', icon: <Pencil size={15} />, run: () => c.atom(hit) }, { label: 'Delete', icon: <Trash2 size={15} />, danger: true, run: () => (hit.kind === 'mark' ? e.setAtom(hit.at, null) : e.setMathRun(hit.at, '')) }];
  if (hit.kind === 'caption') return [{ label: 'Edit', icon: <Pencil size={15} />, run: () => c.atom(hit) }];
  if (hit.kind === 'icon') return [{ label: 'Another emoji', icon: <Pencil size={15} />, run: () => c.atom(hit) }];

  // Words: what the caret is in (a link, a comment, a suggestion, a table), what is picked, the paragraph's style.
  const words = !st.collapsed && !!st.text.trim();
  const inTable = st.block?.type === 'table';
  const open = c.threads.find((x) => st.cm.includes(x.id) && !x.resolved) ?? c.threads.find((x) => st.cm.includes(x.id));
  const cm = c.comment_;
  const sg = st.sg[0];
  const link: MenuEntry[] = st.link
    ? [
        { label: 'Open link', icon: <ExternalLink size={15} />, run: () => c.openLink(st.link!) },
        { label: 'Copy link', icon: <Link2 size={15} />, run: () => c.copyLink(st.link!) },
        { label: 'Edit link', icon: <Link2 size={15} />, keys: 'Ctrl+K', run: c.link },
        { label: 'Remove link', icon: <Unlink size={15} />, run: () => e.link(null) },
      ]
    : [{ label: 'Link', icon: <Link2 size={15} />, keys: 'Ctrl+K', run: c.link }];
  const comment: MenuEntry[] = open
    ? [
        { label: 'Reply', icon: <Reply size={15} />, run: () => cm.reply(open.id) },
        { label: open.resolved ? 'Reopen' : 'Resolve', icon: open.resolved ? <RotateCcw size={15} /> : <Check size={15} />, run: () => cm.resolve(open.id, !open.resolved) },
        { label: 'Edit the comment', icon: <Pencil size={15} />, disabled: !isMine(open) || !!open.author, run: () => cm.edit(open.id) },
        !!cm.ai && !open.resolved && { label: 'Resolve with AI', icon: <Sparkles size={15} className="text-accent" />, run: () => cm.ai!(open.id) },
        { label: 'Delete the comment', icon: <Trash2 size={15} />, danger: true, run: () => cm.remove(open.id) },
      ]
    : [];
  const suggestion: MenuEntry[] = sg
    ? [
        { label: 'Accept the suggestion', icon: <Check size={15} />, run: () => e.resolve(sg, true) },
        { label: 'Reject the suggestion', icon: <X size={15} />, run: () => e.resolve(sg, false) },
      ]
    : [];
  const rewrite: MenuEntry = { label: 'Rewrite with AI', icon: <WandSparkles size={15} />, also: 'ai shorter longer simpler formal friendlier fix spelling grammar', items: QUICK_REWRITES.map((how) => ({ label: REWRITE_LABELS[how], run: () => c.rewrite(how) })) };
  const writing: MenuEntry[] = [
    { label: 'Comment', icon: <MessageSquarePlus size={15} />, keys: 'Ctrl+Alt+M', disabled: !words, run: c.comment },
    !!c.ai && { label: 'Write with AI', icon: <WandSparkles size={15} />, keys: 'Ctrl+J', disabled: c.ai.busy, run: c.ai.write },
  ];
  const textOnWords: MenuEntry[] = [
    { label: 'Bold', icon: <Bold size={15} />, keys: 'Ctrl+B', checked: st.on.b, run: () => e.toggle('b') },
    { label: 'Italic', icon: <Italic size={15} />, keys: 'Ctrl+I', checked: st.on.i, run: () => e.toggle('i') },
    { label: 'Underline', icon: <Underline size={15} />, keys: 'Ctrl+U', checked: st.on.u, run: () => e.toggle('u') },
    { label: 'Change case', icon: <Type size={15} />, also: 'uppercase lowercase title sentence capital', items: caseEntries(e) },
    { label: 'Format painter', icon: <PaintRoller size={15} />, checked: !!e.paint, also: 'copy formatting', run: c.painter },
  ];
  const style: MenuEntry[] = [
    { label: 'Paragraph styles', icon: <Heading size={15} />, items: styleEntries(c, false) },
    { label: 'Clear the formatting', icon: <Eraser size={15} />, keys: 'Ctrl+\\', run: () => e.clear() },
  ];
  const spell: MenuEntry = c.spellHint && !inTable ? { label: 'Spelling suggestions: Shift+right-click', disabled: true } : null;
  const ask: MenuEntry = words && c.askWords ? { label: 'Ask the agent about it', icon: <Sparkles size={15} className="text-accent" />, run: c.askWords } : null;

  // In a table: the clipboard, the table's own rows, columns and cells, and the rest of the words' actions in one list.
  if (inTable) {
    const rest: MenuEntry[] = [{ label: 'Select all', keys: 'Ctrl+A', run: () => document.execCommand('selectAll') }, ...link, ...comment, ...suggestion, ...writing, ...(words ? [...textOnWords, rewrite, ask] : []), ...style, spell];
    return [...clip(words, false), '-', ...tableEntries(c), '-', { label: 'Text', icon: <Type size={15} />, items: rest }];
  }
  return [
    ...clip(words),
    { label: 'Select all', keys: 'Ctrl+A', run: () => document.execCommand('selectAll') },
    '-',
    ...link,
    ...(comment.length ? ['-' as const, ...comment] : []),
    ...(suggestion.length ? ['-' as const, ...suggestion] : []),
    '-',
    ...writing,
    ...(words ? ['-' as const, ...textOnWords, rewrite, ask] : []),
    '-',
    ...style,
    spell ? '-' : null,
    spell,
  ];
}

/**
 * What the handle by a block (⋮⋮, a click that is not a drag) offers for it: turn it into another paragraph style,
 * duplicate it, delete it, move it up or down, comment on its words, and for a heading, copy a link to it (which pasted
 * over words picked in this document makes a link to the heading).
 */
export function blockContext(o: { engine: DocEngine; doc: Doc; id: string; comment: () => void; copyLink: (url: string) => void }): MenuEntry[] {
  const { engine: e, doc, id } = o;
  const i = doc.blocks.findIndex((b) => b.id === id);
  const b = doc.blocks[i];
  if (!b) return [];
  const text = b.type === 'p' || b.type === 'li';
  const style = b.type === 'p' ? (b.style ?? 'normal') : null;
  const heading = b.type === 'p' && /^h[1-4]$/.test(b.style ?? '');
  const words = text && b.runs.some((r) => r.t.trim());
  return [
    text && { label: 'Turn into', icon: <Heading size={15} />, also: 'paragraph style heading title normal text', items: PARA_STYLES.map((k) => ({ label: STYLES[k].label, checked: style === k, run: () => e.styleBlock(id, k) })) },
    { label: 'Duplicate', icon: <CopyPlus size={15} />, run: () => e.duplicateBlock(id) },
    { label: 'Delete', icon: <Trash2 size={15} />, danger: true, run: () => e.deleteBlock(id) },
    '-',
    { label: 'Move up', icon: <ArrowUp size={15} />, disabled: i === 0, run: () => e.moveBlockBy(id, -1) },
    { label: 'Move down', icon: <ArrowDown size={15} />, disabled: i === doc.blocks.length - 1, run: () => e.moveBlockBy(id, 1) },
    text && '-',
    text && { label: 'Comment', icon: <MessageSquarePlus size={15} />, keys: 'Ctrl+Alt+M', disabled: !words, run: () => e.selectBlockWords(id) && o.comment() },
    heading && { label: 'Copy link to this heading', icon: <Link2 size={15} />, also: 'anchor url', run: () => o.copyLink(`${location.origin}${location.pathname}#nd-${id}`) },
  ];
}
