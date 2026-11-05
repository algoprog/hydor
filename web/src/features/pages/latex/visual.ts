// Visual mode for the LaTeX editor, as Overleaf's Visual Editor: the same CodeMirror source, shown as a document while
// you type. Sections read as headings; \textbf, \textit, \emph and \underline as bold, italic and underlined words;
// maths is drawn with KaTeX (with the document's own macros); itemize and enumerate items show their bullets and
// numbers; \includegraphics shows the picture; \cite, \ref and \label are small chips and a footnote is folded into a
// mark that shows its words when pointed at; comments are quiet, and figures and tables are framed with their caption.
// Whatever the cursor is in (or touches) shows as its source again, so it is edited as it is: Visual only changes how
// the text looks, never the text. The preamble stays as code, quietly. A file over MAX_VISUAL characters shows as code.
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { tr } from '../../../i18n/runtime';
import { texHtml, texHtmlNow } from '../common/katex';
import { braced, katexOf, labelsIn, texSpans, VERBATIM_ENVS, type MathSpan } from './scan';

/** The longest file Visual mode draws (longer ones show as code). */
export const MAX_VISUAL = 600_000;

export interface VisualHooks {
  /** The document's macros, for KaTeX. */
  macros: () => Record<string, string>;
  /** The address of a picture of the document, by the name \includegraphics gives it (with or without its extension). */
  picture: (name: string) => string | null;
}

// ---- widgets ------------------------------------------------------------------------------------------------------

const htmlCache = new Map<string, string>();
const cacheKey = (tex: string, display: boolean, macros: string) => `${display ? 'D' : 'i'}\u0000${macros}\u0000${tex}`;

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
    readonly macros: Record<string, string>,
    readonly macrosKey: string,
    readonly labels: string[],
  ) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display && o.macrosKey === this.macrosKey && o.labels.join() === this.labels.join();
  }
  toDOM(view: EditorView) {
    const el = document.createElement('span');
    el.className = this.display ? 'cm-tex-math cm-tex-display' : 'cm-tex-math';
    const body = document.createElement('span');
    body.className = 'cm-tex-math-body';
    el.append(body);
    for (const l of this.labels) {
      const chip = document.createElement('span');
      chip.className = 'cm-tex-chip cm-tex-chip-label cm-tex-eqlabel';
      chip.textContent = l;
      el.append(chip);
    }
    const key = cacheKey(this.tex, this.display, this.macrosKey);
    const hit = htmlCache.get(key) ?? texHtmlNow(this.tex, this.display, this.macros);
    if (hit !== null) {
      htmlCache.set(key, hit);
      body.innerHTML = hit;
    } else {
      body.textContent = this.tex;
      void texHtml(this.tex, this.display, this.macros).then((html) => {
        htmlCache.set(key, html);
        if (htmlCache.size > 3000) htmlCache.delete(htmlCache.keys().next().value!);
        body.innerHTML = html;
        view.requestMeasure();
      });
    }
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class ChipWidget extends WidgetType {
  constructor(
    readonly kind: 'cite' | 'ref' | 'label' | 'picture-missing',
    readonly text: string,
  ) {
    super();
  }
  eq(o: ChipWidget) {
    return o.kind === this.kind && o.text === this.text;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-tex-chip cm-tex-chip-${this.kind}`;
    el.textContent = this.kind === 'cite' ? `[${this.text}]` : this.kind === 'ref' ? `→ ${this.text}` : this.kind === 'label' ? `# ${this.text}` : `${tr('Picture')}: ${this.text}`;
    el.title = this.kind === 'cite' ? `${tr('Citation')}: ${this.text}` : this.kind === 'ref' ? `${tr('Cross-reference')}: ${this.text}` : this.kind === 'label' ? `${tr('Label')}: ${this.text}` : tr('No picture of the document has this name');
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class NoteWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(o: NoteWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const el = document.createElement('sup');
    el.className = 'cm-tex-note';
    el.textContent = '✱';
    el.title = `${tr('Footnote')}: ${this.text}`;
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class PictureWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly name: string,
  ) {
    super();
  }
  eq(o: PictureWidget) {
    return o.url === this.url;
  }
  toDOM(view: EditorView) {
    const el = document.createElement('span');
    el.className = 'cm-tex-picture';
    const img = document.createElement('img');
    img.alt = this.name;
    img.title = this.name;
    img.src = this.url;
    img.onload = () => view.requestMeasure();
    el.append(img);
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class TextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly cls: string,
  ) {
    super();
  }
  eq(o: TextWidget) {
    return o.text === this.text && o.cls === this.cls;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = this.cls;
    el.textContent = this.text;
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

// ---- reading the file ----------------------------------------------------------------------------------------------

/**
 * Markup that is hidden or drawn while the cursor is elsewhere, shown as source when the cursor touches [from, to]
 * (or, `strict`, when it is inside: for markup around words that stay, so typing beside bold words keeps them so).
 */
interface Piece {
  from: number;
  to: number;
  deco: Range<Decoration>[];
  strict?: boolean;
}

interface Parsed {
  pieces: Piece[];
  /** Decorations that stay wherever the cursor is (a heading's size, a frame, a comment's quiet). */
  always: Range<Decoration>[];
}

const HEADINGS: Record<string, number> = { title: 0, part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5, subparagraph: 5, frametitle: 3 };
const FORMATS: Record<string, string> = {
  textbf: 'cm-tex-b',
  bf: 'cm-tex-b',
  textit: 'cm-tex-i',
  textsl: 'cm-tex-i',
  emph: 'cm-tex-i',
  underline: 'cm-tex-u',
  uline: 'cm-tex-u',
  texttt: 'cm-tex-tt',
  textsc: 'cm-tex-sc',
  textsuperscript: 'cm-tex-sup',
  textsubscript: 'cm-tex-sub',
  author: 'cm-tex-author',
};
const CITES = /^(cite|citep|citet|citealp|citealt|citeauthor|citeyear|parencite|textcite|autocite|footcite|nocite|Cite|Citep|Citet)$/;
const REFS = /^(ref|eqref|pageref|autoref|cref|Cref|vref|nameref)$/;
const FLOATS = new Set(['figure', 'figure*', 'table', 'table*', 'wrapfigure', 'wraptable', 'sidewaysfigure', 'sidewaystable', 'algorithm']);
const LISTS = new Set(['itemize', 'enumerate', 'description']);
/** Environments whose \begin takes arguments (a table's columns, a box's width): quiet with it. */
const ENV_ARGS: Record<string, number> = {
  tabular: 1,
  'tabular*': 2,
  tabularx: 2,
  tabulary: 2,
  array: 1,
  longtable: 1,
  minipage: 1,
  column: 1,
  wrapfigure: 2,
  wraptable: 2,
  multicols: 1,
  subfigure: 1,
  block: 1,
  alertblock: 1,
  exampleblock: 1,
  frame: 0,
  thebibliography: 1,
};
const BULLETS = ['•', '–', '∗', '·'];
const roman = (n: number) => ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'][n] ?? String(n);
const numberLabel = (depth: number, n: number) => (depth === 0 ? `${n}.` : depth === 1 ? `(${String.fromCharCode(96 + Math.min(n, 26))})` : depth === 2 ? `${roman(n)}.` : `${String.fromCharCode(64 + Math.min(n, 26))}.`);

const hide = Decoration.replace({});
const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string, style?: string) => Decoration.line({ class: cls, attributes: style ? { style } : undefined });

/** After s[i]: spaces, then optional [arguments], skipped. */
function skipOpt(s: string, i: number): number {
  let j = i;
  for (;;) {
    while (s[j] === ' ' || s[j] === '\t') j++;
    if (s[j] !== '[') return j;
    let depth = 0;
    let k = j;
    for (; k < s.length && k < j + 2000; k++) {
      if (s[k] === '[') depth++;
      else if (s[k] === ']' && --depth === 0) break;
      else if (s[k] === '\n' && s[k + 1] === '\n') return j;
    }
    if (s[k] !== ']') return j;
    j = k + 1;
  }
}

/** A footnote's words, plain: for its mark's tooltip. */
const plain = (t: string) =>
  t
    .replace(/\\[A-Za-z@]+\*?\s*(\[[^\]]*\])?/g, '')
    .replace(/[{}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function parse(state: EditorState, hooks: VisualHooks): Parsed {
  const s = state.doc.toString();
  const doc = state.doc;
  const pieces: Piece[] = [];
  const always: Range<Decoration>[] = [];
  const spans = state.field(texSpans);
  let macros: Record<string, string> = {};
  try {
    macros = hooks.macros();
  } catch {}
  const macrosKey = JSON.stringify(macros);
  const lineAt = (pos: number) => doc.lineAt(pos);
  // The preamble (before \begin{document}) stays code.
  const begin = /\\begin\s*\{document\}/.exec(s);
  const body = begin ? begin.index + begin[0].length : 0;
  if (begin) {
    const last = lineAt(begin.index).number;
    for (let n = 1; n < last; n++) always.push(line('cm-tex-pre').range(doc.line(n).from));
    always.push(mark('cm-tex-quiet').range(begin.index, body));
  }

  // Open environments: lists (for bullets and numbers) and floats (for their frame).
  const stack: { env: string; line: number; n: number; depth: number }[] = [];
  /** How many lists of a kind are open: a numbered list inside a bulleted one still counts 1, 2, 3. */
  const depthOf = (env: string) => stack.filter((x) => x.env === env).length;
  /** Lines in a list get its indent (those starting with \item hang their bullet). */
  const listLines = new Map<number, number>();
  const itemLines = new Set<number>();
  let si = spans.findIndex((m) => m.from >= body);
  if (si < 0) si = spans.length;

  const mathPiece = (m: MathSpan) => {
    const a = lineAt(m.from);
    const b = lineAt(m.to);
    // On lines of its own: the whole lines go for the formula, drawn as a display.
    const whole = m.display && !s.slice(a.from, m.from).trim() && !s.slice(m.to, b.to).replace(/%.*$/, '').trim();
    const from = whole ? a.from : m.from;
    const to = whole ? b.to : m.to;
    pieces.push({ from: m.from, to: m.to, deco: [Decoration.replace({ widget: new MathWidget(katexOf(s, m), m.display, macros, macrosKey, labelsIn(s, m)) }).range(from, to)] });
    always.push(mark('cm-tex-markup').range(m.from, m.to));
  };

  let i = body;
  const n = s.length;
  while (i < n) {
    // Maths: drawn whole.
    while (si < spans.length && spans[si].to <= i) si++;
    const nextMath = si < spans.length ? spans[si].from : n;
    let j = i;
    while (j < nextMath && s[j] !== '\\' && s[j] !== '%' && s[j] !== '~') j++;
    if (j >= nextMath && nextMath < n) {
      mathPiece(spans[si]);
      i = spans[si].to;
      si++;
      continue;
    }
    if (j >= n) break;
    i = j;
    if (s[i] === '~') {
      // A space that does not break: shown as the space it is.
      pieces.push({ from: i, to: i + 1, deco: [Decoration.replace({ widget: new TextWidget(' ', 'cm-tex-nbsp') }).range(i, i + 1)] });
      i++;
      continue;
    }
    if (s[i] === '%') {
      const e = s.indexOf('\n', i);
      const end = e < 0 ? n : e;
      always.push(mark('cm-tex-comment').range(i, end));
      i = end;
      continue;
    }
    // A command.
    const m = /^\\([A-Za-z@]+)(\*?)/.exec(s.slice(i, i + 40));
    if (!m) {
      i += 2;
      continue;
    }
    const name = m[1];
    const after = i + m[0].length;
    if (name === 'begin' || name === 'end') {
      const g = braced(s, skipOpt(s, after));
      if (!g) {
        i = after;
        continue;
      }
      const env = g.text.trim();
      let tagEnd = name === 'begin' ? skipOpt(s, g.end) : g.end;
      for (let k = 0; name === 'begin' && k < (ENV_ARGS[env] ?? 0); k++) {
        const a = braced(s, skipOpt(s, tagEnd));
        if (!a) break;
        tagEnd = a.end;
      }
      const ln = lineAt(i);
      if (name === 'begin') {
        if (VERBATIM_ENVS.has(env)) {
          const close = s.indexOf(`\\end{${env}}`, tagEnd);
          i = close < 0 ? n : close + env.length + 6;
          continue;
        }
        stack.push({ env, line: ln.number, n: 0, depth: depthOf(env) });
        if (FLOATS.has(env)) {
          // The float's first line: its kind in place of its markup.
          const label = env.startsWith('table') || env === 'wraptable' || env === 'sidewaystable' ? tr('Table') : env === 'algorithm' ? tr('Algorithm') : tr('Figure');
          pieces.push({ from: i, to: tagEnd, deco: [Decoration.replace({ widget: new TextWidget(label, 'cm-tex-float-label') }).range(i, tagEnd)] });
        } else always.push(mark('cm-tex-quiet').range(i, tagEnd));
      } else {
        // The environment it closes (the nearest of its name).
        let k = stack.length - 1;
        while (k >= 0 && stack[k].env !== env) k--;
        if (k >= 0) {
          const open = stack[k];
          stack.length = k;
          if (FLOATS.has(env)) {
            for (let l = open.line; l <= ln.number; l++) always.push(line(`cm-tex-frame${l === open.line ? ' cm-tex-frame-top' : ''}${l === ln.number ? ' cm-tex-frame-bottom' : ''}`).range(doc.line(l).from));
            pieces.push({ from: i, to: g.end, deco: [hide.range(i, g.end)] });
          } else always.push(mark('cm-tex-quiet').range(i, g.end));
        } else always.push(mark('cm-tex-quiet').range(i, g.end));
      }
      i = tagEnd;
      continue;
    }
    if (name === 'item') {
      const list = [...stack].reverse().find((x) => LISTS.has(x.env));
      const ln = lineAt(i);
      const opt = /^[ \t]*\[([^\]\n]*)\]/.exec(s.slice(after, after + 400));
      let end = opt ? after + opt[0].length : after;
      if (s[end] === ' ') end++;
      if (list) {
        list.n++;
        const depth = list.depth;
        const label = opt ? opt[1].trim() : list.env === 'enumerate' ? numberLabel(depth, list.n) : list.env === 'description' ? '' : BULLETS[depth % BULLETS.length];
        const atStart = !s.slice(ln.from, i).trim();
        const from = atStart ? ln.from : i;
        pieces.push({ from: i, to: end, strict: true, deco: [Decoration.replace({ widget: new TextWidget(label, opt || list.env === 'description' ? 'cm-tex-item cm-tex-item-term' : 'cm-tex-item') }).range(from, end)] });
        always.push(mark('cm-tex-markup').range(i, end));
        if (atStart) itemLines.add(ln.number);
      }
      i = end;
      continue;
    }
    if (name in HEADINGS || name in FORMATS || name === 'caption' || name === 'href' || name === 'url') {
      let open = skipOpt(s, after);
      let pre: { from: number; to: number } | null = null;
      if (name === 'href') {
        // \href{address}{words}: the words, as a link.
        const url = braced(s, open);
        if (!url) {
          i = after;
          continue;
        }
        pre = { from: i, to: url.end };
        open = url.end;
      }
      const g = braced(s, open);
      if (!g) {
        i = after;
        continue;
      }
      const contentFrom = open + 1;
      const contentTo = g.end - 1;
      const cls = name in HEADINGS ? null : name === 'caption' ? 'cm-tex-caption' : name === 'href' || name === 'url' ? 'cm-tex-link' : FORMATS[name];
      const deco: Range<Decoration>[] = [hide.range(pre ? pre.from : i, contentFrom), hide.range(contentTo, g.end)];
      pieces.push({ from: i, to: g.end, deco, strict: true });
      // Shown again (the cursor in it), the markup reads as code beside the words.
      always.push(mark('cm-tex-markup').range(pre ? pre.from : i, contentFrom), mark('cm-tex-markup').range(contentTo, g.end));
      if (name in HEADINGS) {
        const ln = lineAt(i);
        if (!s.slice(ln.from, i).trim()) always.push(line(`cm-tex-h cm-tex-h${HEADINGS[name]}`).range(ln.from));
        else always.push(mark(`cm-tex-h${HEADINGS[name]}`).range(contentFrom, contentTo));
      } else if (cls && contentTo > contentFrom) always.push(mark(cls).range(contentFrom, contentTo));
      // What it holds is read too: a heading's maths, bold words in a caption.
      i = name === 'url' ? g.end : contentFrom;
      continue;
    }
    if (CITES.test(name) || REFS.test(name) || name === 'label') {
      const g = braced(s, skipOpt(s, after));
      if (!g) {
        i = after;
        continue;
      }
      const kind = name === 'label' ? 'label' : CITES.test(name) ? 'cite' : 'ref';
      const text = g.text.replace(/\s+/g, '');
      pieces.push({ from: i, to: g.end, deco: [Decoration.replace({ widget: new ChipWidget(kind, text) }).range(i, g.end)] });
      always.push(mark('cm-tex-markup').range(i, g.end));
      i = g.end;
      continue;
    }
    if (name === 'footnote') {
      const g = braced(s, skipOpt(s, after));
      if (!g) {
        i = after;
        continue;
      }
      pieces.push({ from: i, to: g.end, deco: [Decoration.replace({ widget: new NoteWidget(plain(g.text).slice(0, 400)) }).range(i, g.end)] });
      i = g.end;
      continue;
    }
    if (name === 'includegraphics') {
      const g = braced(s, skipOpt(s, after));
      if (!g) {
        i = after;
        continue;
      }
      const file = g.text.trim();
      const url = hooks.picture(file);
      pieces.push({ from: i, to: g.end, deco: [Decoration.replace({ widget: url ? new PictureWidget(url, file) : new ChipWidget('picture-missing', file) }).range(i, g.end)] });
      i = g.end;
      continue;
    }
    if (name === 'centering' || name === 'maketitle' || name === 'tableofcontents' || name === 'noindent' || name === 'newpage' || name === 'clearpage' || name === 'medskip' || name === 'bigskip' || name === 'smallskip') {
      always.push(mark('cm-tex-quiet').range(i, after));
      i = after;
      continue;
    }
    always.push(mark('cm-tex-cmd').range(i, after));
    i = after;
  }

  // Lines inside lists: indented by how deep they are.
  if (itemLines.size) {
    // Work out each line's list depth from where the lists begin and end.
    const depthAt: { line: number; d: number }[] = [];
    let d = 0;
    for (const x of s.slice(body).matchAll(/\\(begin|end)\s*\{(itemize|enumerate|description)\}/g)) {
      const ln = lineAt(body + x.index!).number;
      d += x[1] === 'begin' ? 1 : -1;
      depthAt.push({ line: ln, d: Math.max(0, d) });
    }
    let k = 0;
    let cur = 0;
    const lastLine = doc.lines;
    const start = depthAt[0]?.line ?? lastLine + 1;
    for (let l = start; l <= lastLine; l++) {
      while (k < depthAt.length && depthAt[k].line < l) cur = depthAt[k++].d;
      const opening = k < depthAt.length && depthAt[k].line === l;
      if (cur > 0 && !opening) listLines.set(l, cur);
      if (k >= depthAt.length && cur === 0) break;
    }
    for (const [l, depth] of listLines) {
      const pad = depth * 1.5;
      always.push(line(itemLines.has(l) ? 'cm-tex-li cm-tex-li-item' : 'cm-tex-li', itemLines.has(l) ? `padding-left: ${pad}em; text-indent: -1.2em` : `padding-left: ${pad}em`).range(doc.line(l).from));
    }
  }
  return { pieces, always };
}

/** The decorations for a parse, leaving out what the selection touches. */
function decorate(p: Parsed, state: EditorState): DecorationSet {
  const sel = state.selection.ranges;
  const out: Range<Decoration>[] = [...p.always];
  for (const x of p.pieces) {
    if (sel.some((r) => (x.strict ? r.from < x.to && r.to > x.from : r.from <= x.to && r.to >= x.from))) continue;
    out.push(...x.deco);
  }
  return Decoration.set(out, true);
}

const theme = EditorView.theme({
  '&.cm-tex-visual .cm-content': { fontFamily: "'Charter', 'Iowan Old Style', 'Source Serif 4', 'Noto Serif', Georgia, 'DejaVu Serif', serif", fontSize: '15px', lineHeight: '1.7', maxWidth: '50rem', margin: '0 auto' },
  '&.cm-tex-visual .cm-scroller': { fontFamily: 'inherit' },
  '.cm-tex-pre': { fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', opacity: '0.62' },
  '.cm-tex-h': { fontWeight: '650', letterSpacing: '-0.01em', color: 'var(--fg)' },
  '.cm-tex-h0': { fontSize: '1.65em', fontWeight: '700', paddingTop: '0.4em' },
  '.cm-tex-h1': { fontSize: '1.5em', paddingTop: '0.4em' },
  '.cm-tex-h2': { fontSize: '1.3em', paddingTop: '0.35em' },
  '.cm-tex-h3': { fontSize: '1.13em', paddingTop: '0.25em' },
  '.cm-tex-h4, .cm-tex-h5': { fontSize: '1.02em' },
  '.cm-tex-b': { fontWeight: '700', color: 'var(--fg)' },
  '.cm-tex-i': { fontStyle: 'italic' },
  '.cm-tex-u': { textDecoration: 'underline', textUnderlineOffset: '3px' },
  '.cm-tex-tt': { fontFamily: 'var(--font-mono)', fontSize: '0.92em' },
  '.cm-tex-sc': { fontVariant: 'small-caps' },
  '.cm-tex-sup': { verticalAlign: 'super', fontSize: '0.75em' },
  '.cm-tex-sub': { verticalAlign: 'sub', fontSize: '0.75em' },
  '.cm-tex-author': { color: 'var(--fg-2)', fontStyle: 'italic' },
  '.cm-tex-link': { color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '3px' },
  '.cm-tex-caption': { fontStyle: 'italic', color: 'var(--fg-2)', fontSize: '0.94em' },
  '.cm-tex-comment, .cm-tex-comment *': { color: 'var(--fg-3) !important', fontStyle: 'italic', fontSize: '0.88em', opacity: '0.85' },
  '.cm-tex-quiet, .cm-tex-quiet *': { fontFamily: 'var(--font-mono)', fontSize: '0.78em', color: 'var(--fg-3) !important', opacity: '0.8' },
  '.cm-tex-cmd, .cm-tex-cmd *, .cm-tex-markup, .cm-tex-markup *': { fontFamily: 'var(--font-mono)', fontSize: '0.86em' },
  '.cm-tex-math': { padding: '0 1px', cursor: 'text' },
  '.cm-tex-display': { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '4px 0', boxSizing: 'border-box' },
  '.cm-tex-display .katex-display': { margin: '0' },
  '.cm-tex-math .katex': { fontSize: '1.08em' },
  '.cm-tex-eqlabel': { marginLeft: 'auto' },
  '.cm-tex-chip': {
    display: 'inline-block',
    padding: '0 5px',
    margin: '0 1px',
    borderRadius: '5px',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.78em',
    lineHeight: '1.5',
    verticalAlign: '1px',
    background: 'var(--bg-2)',
    color: 'var(--fg-2)',
    border: '1px solid var(--line)',
    cursor: 'text',
    whiteSpace: 'nowrap',
  },
  '.cm-tex-chip-cite': { color: 'var(--accent)' },
  '.cm-tex-chip-picture-missing': { color: 'var(--warn)' },
  '.cm-tex-note': { color: 'var(--accent)', fontSize: '0.72em', padding: '0 2px', cursor: 'help' },
  '.cm-tex-picture': { display: 'inline-block', padding: '4px 0', maxWidth: '100%', verticalAlign: 'middle' },
  '.cm-tex-picture img': { display: 'block', maxWidth: 'min(100%, 520px)', maxHeight: '260px', borderRadius: '6px', background: '#fff' },
  '.cm-tex-item': { display: 'inline-block', minWidth: '1.2em', textIndent: '0', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' },
  '.cm-tex-item-term': { fontWeight: '700', color: 'var(--fg)', marginRight: '0.35em', minWidth: '0' },
  '.cm-tex-frame': { borderLeft: '1px solid var(--line-2)', borderRight: '1px solid var(--line-2)', background: 'color-mix(in srgb, var(--bg-2) 45%, transparent)', paddingLeft: '12px !important', paddingRight: '12px !important' },
  '.cm-tex-frame-top': { borderTop: '1px solid var(--line-2)', borderTopLeftRadius: '10px', borderTopRightRadius: '10px', paddingTop: '4px' },
  '.cm-tex-frame-bottom': { borderBottom: '1px solid var(--line-2)', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px', paddingBottom: '4px' },
  '.cm-tex-float-label': { fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-3)' },
});

/** Visual mode: on, it shows the source as a document (see the top of this file). */
export function visualMode(hooks: VisualHooks): Extension {
  const field = StateField.define<{ parsed: Parsed | null; deco: DecorationSet }>({
    create(state) {
      if (state.doc.length > MAX_VISUAL) return { parsed: null, deco: Decoration.none };
      const parsed = parse(state, hooks);
      return { parsed, deco: decorate(parsed, state) };
    },
    update(v, tr) {
      if (tr.state.doc.length > MAX_VISUAL) return { parsed: null, deco: Decoration.none };
      if (tr.docChanged || !v.parsed) {
        const parsed = parse(tr.state, hooks);
        return { parsed, deco: decorate(parsed, tr.state) };
      }
      if (tr.selection) return { parsed: v.parsed, deco: decorate(v.parsed, tr.state) };
      return v;
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });
  return [texSpans, field, theme, EditorView.editorAttributes.of({ class: 'cm-tex-visual' })];
}
