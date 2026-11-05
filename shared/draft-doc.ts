// A document while an agent's save_doc call streams in (page-drafts.ts says what drafts are for). The markdown (or
// blocks) written so far is read as blocks; with the version open now, the blocks written so far are matched with
// its blocks (the same words: the same block, kept as it is drawn; changed words between two of those: the block
// they stand in for), and the old blocks from where the two meet follow, so a long document written again stays in
// place, and only what changes moves. The block still being written goes in place of the old one it is writing again
// (shown as the old one while its words so far are the old one's), or before it when it is new. A call that makes
// small changes (edits: find and replace, a section, after a heading, at the end) shows them made as they come.
import { DOC_DEFAULTS, mdBlocks, normalizeBlocks, normalizeDoc, runsText, type Block, type Doc, type Run } from './docs.ts';
import { applyDocEdits } from './doc-edits.ts';
import { within, type PartialJson } from './partial-json.ts';
import { alike, inOrder, writingIn, type DraftMemo, type Drafted } from './page-drafts.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** A block's id stays out of what it holds. */
const contentKey = (b: Block) => {
  const { id: _id, ...rest } = b;
  return JSON.stringify(rest);
};
const oldKeys = new WeakMap<Doc, string[]>();
const keysOf = (d: Doc) => {
  let k = oldKeys.get(d);
  if (!k) oldKeys.set(d, (k = d.blocks.map(contentKey)));
  return k;
};

const textOf = (b: Block) => (b.type === 'p' || b.type === 'li' ? runsText(b.runs) : b.type === 'table' ? b.rows.map((r) => r.map((c) => runsText(c.runs)).join(' ')).join(' ') : b.type === 'image' ? (b.caption ?? '') : '');
const styleOf = (b: Block) => (b.type === 'p' ? (b.style ?? 'normal') : b.type === 'li' ? b.list : '');
const sameKind = (a: Block, b: Block) => a.type === b.type && styleOf(a) === styleOf(b);
/** A block with enough words to be matched far from where it was (an empty line or a rule matches only nearby). */
const strong = (b: Block) => textOf(b).trim().length >= 24 || b.type === 'table' || b.type === 'image' || b.type === 'math';

/**
 * The end of markdown still being written, tidied for showing: attributes not closed yet ({.cen…) left out, and
 * marks opened on its last line (**, *, `, ~~, ==) closed, so the words show as they will look.
 */
export function tidyEnd(md: string): string {
  const cut = md.lastIndexOf('\n');
  let line = md.slice(cut + 1);
  const head = md.slice(0, cut + 1);
  line = line.replace(/\s\{[^}\n]*$/, '');
  // Inside a code block every mark is plain text.
  if ((head.match(/^```/gm) ?? []).length % 2) return head + line;
  const count = (re: RegExp) => (line.match(re) ?? []).length;
  if (count(/`/g) % 2) line += '`';
  else {
    if (count(/\*\*/g) % 2) line += '**';
    if (count(/(?<!\*)\*(?!\*)/g) % 2 && !/^\s*\*\s/.test(line)) line += '*';
    if (count(/~~/g) % 2) line += '~~';
    if (count(/==/g) % 2) line += '==';
  }
  return head + line;
}

/** The document's own settings: those the call gives (once written whole), else the version's. */
function shell(base: Doc | null, v: Obj, p: PartialJson): Doc {
  const given = (k: string) => k in v && !writingIn(p.open, k);
  try {
    return normalizeDoc({
      markdown: '',
      page: given('page') ? v.page : base?.page,
      font: given('font') ? v.font : base?.font,
      size: given('size') ? v.size : base?.size,
      header: given('header') ? v.header : base?.header,
      footer: given('footer') ? v.footer : base?.footer,
      titlePage: given('titlePage') ? v.titlePage : base?.titlePage,
    });
  } catch {
    return { v: 1, page: { ...DOC_DEFAULTS.page }, font: DOC_DEFAULTS.font, size: DOC_DEFAULTS.size, blocks: [] };
  }
}

/** The id the block being written has while it is new (one at a time). */
const OPEN = 'nd-draft-open';

/**
 * The blocks written so far (`blocks`, the last of them still being written when `writing`) shown over the version
 * open now (`old`): matched, then the old rest from where they meet. The mark is where the words are arriving.
 */
export function overOld(old: Block[], keys: string[], blocks: Block[], writing: boolean, memo: DraftMemo): { blocks: Block[]; mark: { block: string; at: number } | null } {
  const done = writing ? blocks.slice(0, -1) : blocks;
  const open = writing ? (blocks[blocks.length - 1] ?? null) : null;
  // The same blocks, in order (a short one only nearby, one far ahead only where the next block confirms it).
  const match = inOrder(keys, done.map(contentKey), done.map(strong));
  // Changed blocks between two of those stand in for the old ones there, one for one while their kinds agree; after
  // the last one, only while their words are alike too (more may be new, and the old ones still to come).
  let j = 0;
  while (j < done.length) {
    if (match[j] >= 0) {
      j++;
      continue;
    }
    const from = j;
    while (j < done.length && match[j] < 0) j++;
    const lo = from > 0 ? match[from - 1] + 1 : 0;
    const closed = j < done.length;
    const hi = closed ? match[j] : old.length;
    for (let a = from, b = lo; a < j && b < hi; a++, b++) {
      if (!sameKind(old[b], done[a]) || (!closed && !alike(textOf(old[b]), textOf(done[a])))) break;
      match[a] = b;
    }
  }
  let k = 0;
  for (const m of match) if (m >= 0) k = Math.max(k, m + 1);
  const out: Block[] = done.map((b, a) => {
    const m = match[a];
    if (m < 0) return memo.same(b, `new:${contentKey(b)}`);
    if (contentKey(b) === keys[m]) return old[m];
    return memo.same({ ...b, id: old[m].id } as Block);
  });
  let mark: { block: string; at: number } | null = null;
  if (open) {
    const was = old[k];
    const words = textOf(open);
    const isText = open.type === 'p' || open.type === 'li';
    if (was && sameKind(was, open) && isText && textOf(was).startsWith(words) && contentKey({ ...open, runs: [] } as Block) === contentKey({ ...was, runs: [] } as Block)) {
      // Written again as it was, so far: the old block stays as it is, the mark moving through its words.
      out.push(was);
      mark = { block: was.id, at: words.length };
      k++;
    } else if (was && sameKind(was, open) && (words.length < 12 || alike(textOf(was), words))) {
      // Being changed: it stands in for the old one.
      out.push({ ...open, id: was.id } as Block);
      mark = { block: was.id, at: isText ? words.length : -1 };
      k++;
    } else {
      out.push({ ...open, id: OPEN } as Block);
      mark = { block: OPEN, at: isText ? words.length : -1 };
    }
  }
  // Written whole: the old rest is gone (the call says the whole document). Still coming: the old rest follows.
  if (writing) for (let i = k; i < old.length; i++) out.push(old[i]);
  return { blocks: out, mark };
}

/**
 * The document a save_doc call (as far as it has come, `p`) is writing, over the version open now (`base`, none for
 * a new document): null while it says nothing of the document yet.
 */
export function draftDoc(base: Doc | null, p: PartialJson, memo: DraftMemo): Drafted<Doc> | null {
  const v = isObj(p.value) ? p.value : {};
  const top = shell(base, v, p);
  const keep = (blocks: Block[], mark: Drafted<Doc>['mark']): Drafted<Doc> => {
    memo.turn();
    const doc: Doc = { ...top, blocks: blocks.length ? blocks : [{ id: OPEN, type: 'p', runs: [] }] };
    if (base?.comments) doc.comments = base.comments;
    if (base?.suggestions) doc.suggestions = base.suggestions;
    return { model: doc, mark };
  };
  // Small changes to the version open (save_doc's edits): made on its Markdown as far as they have come.
  if (base && Array.isArray(v.edits)) {
    const done = applyDocEdits(base, v.edits as unknown[], { partial: within(p.open, ['edits']) ? p.open!.slice(1) : null });
    if (!done) return keep(base.blocks, null);
    let blocks: Block[];
    try {
      blocks = normalizeBlocks(mdBlocks(done.markdown));
    } catch {
      return keep(base.blocks, null);
    }
    const r = overOld(base.blocks, keysOf(base), blocks, false, memo);
    if (done.at < 0) return keep(r.blocks, null);
    // The block the change being written has come to: the last of those its Markdown so far makes.
    const upTo = normalizeBlocks(mdBlocks(tidyEnd(done.markdown.slice(0, done.at))));
    const i = Math.min(upTo.length, r.blocks.length) - 1;
    // A block being written that is not one of the version's keeps one id from draw to draw (an editor redraws it in place).
    if (i >= 0 && !base.blocks.includes(r.blocks[i])) r.blocks[i] = { ...r.blocks[i], id: OPEN } as Block;
    const b = i >= 0 ? r.blocks[i] : null;
    const words = i >= 0 && (upTo[i].type === 'p' || upTo[i].type === 'li') ? runsText((upTo[i] as { runs: Run[] }).runs).length : -1;
    return keep(r.blocks, b ? { kind: 'doc', block: b.id, at: words } : null);
  }
  const field = typeof v.markdown === 'string' ? 'markdown' : Array.isArray(v.blocks) ? 'blocks' : null;
  if (!field) return base ? keep(base.blocks, null) : null;
  const writing = writingIn(p.open, field);
  let blocks: Block[];
  try {
    blocks = field === 'markdown' ? normalizeBlocks(mdBlocks(writing ? tidyEnd(v.markdown as string) : (v.markdown as string))) : normalizeBlocks(v.blocks as unknown[]);
  } catch {
    blocks = [];
  }
  if (!base) {
    const shown = blocks.map((b, i) => (writing && i === blocks.length - 1 ? ({ ...b, id: OPEN } as Block) : memo.same(b, `new:${contentKey(b)}`)));
    const open = writing ? shown[shown.length - 1] : undefined;
    return keep(shown, open ? { kind: 'doc', block: OPEN, at: open.type === 'p' || open.type === 'li' ? runsText(open.runs).length : -1 } : null);
  }
  const r = overOld(base.blocks, keysOf(base), blocks, writing, memo);
  return keep(r.blocks, r.mark ? { kind: 'doc', ...r.mark } : null);
}
