// The LaTeX editor's AI, outside any session (server/write/latex.ts): Rewrite the words picked (Shorter, Clearer, More
// academic, Fix grammar, Translate to, Say how), their commands, maths, keys and comments kept, checked, and shown as a
// change to accept (a tracked change by AI while Track changes is on); Write with AI at the cursor (Ctrl+K, Insert →
// Write with AI): what is described written as LaTeX, the packages it needs said first, shown before it goes in; LaTeX
// from a picture (pasted, dropped or chosen: a figure, or its LaTeX read by a model that sees pictures, its cost said);
// an error's Explain and Fix beside it under the source; Find a citation for this (papers that back the words picked,
// each with its abstract; Cite adds its BibTeX and the \cite); and Proofread (the words, never commands or maths: a list
// to accept one by one, or all of it as tracked changes by AI). One card docked over the source shows what AI made, to
// accept or leave; the citations are a dialog and the proofreading a panel beside the source.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookMarked, Check, ChevronRight, ImageUp, Languages, PencilLine, ScanText, SpellCheck, Sparkles, Square, WandSparkles, X } from 'lucide-react';
import { proseParagraphs, TEX_AI_MAX, TEX_REWRITE_LABELS, type TexAiBy, type TexCiteAnswer, type TexCitePaper, type TexErrorAnswer, type TexPictureReader, type TexRewriteAnswer, type TexRewriteHow, type TexWritten } from '@shared/latex-ai';
import { parseBibEntry, bibInfo, type TexReference } from '@shared/latex-bib';
import { diffWords } from '@shared/latex-diff';
import { TEX_MAIN, type TexCompiled, type TexDoc, type TexHeading, type TexIssue } from '@shared/latex';
import { cleanLang, WRITE_LANGS } from '@shared/write';
import { Button, cx, Dialog, IconButton, inputCls, MenuBack, MenuItem, MenuSep, Popover, Throbber } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { toast, toastError } from '../../../lib/store';
import { money } from '../../images/studio/logic';
import { useTexHtml } from '../common/katex';
import type { MenuEntry } from '../common/menus';
import { aiCite, aiError, aiPicture, aiPictureReader, aiProofread, aiRewrite, aiWrite, chooseFiles, findReferences } from './api';
import type { Code } from './code';
import type { RowTool } from './ToolRow';

/** What the editor lends its AI. */
export interface AiHost {
  readOnly: boolean;
  /** The .tex file in view, or the last one (what is written goes there). */
  target: () => string;
  codeOf: (name: string) => Code | null;
  withCode: (name: string, f: (c: Code) => void) => void;
  editFile: (name: string, f: (text: string) => string) => void;
  live: () => TexDoc | null;
  tracking: boolean;
  canTrack: boolean;
  /** Something is picked in the file in view. */
  picked: boolean;
  heading: TexHeading | null;
  label: (name: string) => string;
  macros: () => Record<string, string>;
  result: () => TexCompiled | null;
  /** A reference added to the bibliography: its key ('' when it could not be read). */
  addReference: (e: TexReference, cite: boolean) => string;
  /** The tracked changes beside the source. */
  showChanges: () => void;
  /** Pictures into figures/, a figure for each where the cursor is. */
  asFigures: (files: File[]) => Promise<void>;
}

type Card =
  | { kind: 'rewrite'; how: TexRewriteHow; asking?: 'lang' | 'ask'; lang?: string; ask?: string; file: string; from: number; to: number; before: string; busy: boolean; got?: TexRewriteAnswer; error?: string }
  | { kind: 'write'; ask: string; file: string; at: number; math: boolean; busy: boolean; picture?: string; reader?: TexPictureReader | null; got?: TexWritten; error?: string }
  | { kind: 'fix'; issue: TexIssue; file: string; busy: boolean; got?: TexErrorAnswer; before?: string; error?: string };

interface Correction {
  id: number;
  at: number;
  was: string;
  now: string;
  why: string;
  before: string;
  after: string;
  state: 'open' | 'done' | 'gone';
}
interface Proof {
  file: string;
  items: Correction[];
  busy: { done: number; of: number } | null;
  error?: string;
  by?: TexAiBy;
}
interface Cite {
  claim: string;
  file: string;
  from: number;
  to: number;
  busy: boolean;
  got?: TexCiteAnswer;
  error?: string;
  cited: string[];
}

const keyOf = (x: TexIssue) => `${x.file ?? ''}:${x.line ?? 0}:${x.message}`;

/** The word changes from `a` to `b`, in `a`'s places (each one change, so Track changes marks each word). */
export function wordEdits(a: string, b: string): { from: number; to: number; insert: string }[] {
  const out: { from: number; to: number; insert: string }[] = [];
  let shift = 0;
  for (const h of diffWords(a, b)) {
    const from = h.at + shift;
    out.push({ from, to: from + h.del.length, insert: h.ins });
    shift += h.del.length - h.ins.length;
  }
  return out;
}

/** The place of `s` in `text` nearest `near`, or -1. */
function nearest(text: string, s: string, near: number): number {
  if (!s) return -1;
  let best = -1;
  for (let at = text.indexOf(s); at >= 0; at = text.indexOf(s, at + 1)) if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at;
  return best;
}

/** \usepackage lines put in a main file's preamble (after its last package, before hyperref), those it loads left out. */
export function withPackageLines(main: string, list: string[]): string {
  const begin = main.search(/^[ \t]*\\begin\s*\{document\}/m);
  if (begin < 0 || !list.length) return main;
  const head = main.slice(0, begin);
  const loads = (n: string) => new RegExp(`\\\\(?:usepackage|RequirePackage)\\s*(?:\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${n.replace(/[-]/g, '\\-')}\\b`).test(head);
  const add = list.filter((l) => !/\{([^}]*)\}\s*$/.exec(l)![1].split(',').every((n) => loads(n.trim())));
  if (!add.length) return main;
  const lines = main.split('\n');
  const end = main.slice(0, begin).split('\n').length - 1;
  let at = -1;
  for (let i = 0; i < end; i++) if (/^\s*\\usepackage/.test(lines[i])) at = i;
  let put = at >= 0 ? at + 1 : lines.findIndex((l, i) => i < end && /^\s*\\documentclass/.test(l)) + 1;
  if (at >= 0 && /\{hyperref\}/.test(lines[at])) put = at;
  lines.splice(Math.max(put, 0), 0, ...add);
  return lines.join('\n');
}

/** A picture made no larger than 1600 pixels across (what a model reads well), as a data address. */
async function shrink(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('That file is not a picture this browser can show'));
      i.src = url;
    });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Who made it and what it cost, in a line. */
const byLine = (b?: TexAiBy) => (b?.model ? `${tr('By')} ${b.model}${b.cost ? ` · ${money(b.cost)}` : ''}` : '');

/** The new words over the old, word by word: taken out struck through, put in marked. */
function WordDiff({ a, b }: { a: string; b: string }) {
  const hunks = diffWords(a, b);
  const out: ReactNode[] = [];
  let pos = 0;
  hunks.forEach((h, i) => {
    if (h.at > pos) out.push(b.slice(pos, h.at));
    if (h.del) out.push(<del key={`d${i}`} className="rounded-sm bg-err/12 text-err decoration-err/70">{h.del}</del>);
    if (h.ins) out.push(<ins key={`i${i}`} className="rounded-sm bg-ok/15 text-ok no-underline">{h.ins}</ins>);
    pos = h.at + h.ins.length;
  });
  if (pos < b.length) out.push(b.slice(pos));
  return (
    <div translate="no" className="font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-fg-2">
      {out}
    </div>
  );
}

/** Maths written as LaTeX drawn (an equation's environment, \[…\] or $…$), else nothing. */
function MathOf({ latex, macros }: { latex: string; macros: () => Record<string, string> }) {
  const env = /^\s*\\begin\{(equation|align|gather|multline|flalign|eqnarray|displaymath)\*?\}([\s\S]*)\\end\{\1\*?\}\s*$/.exec(latex);
  const disp = /^\s*\\\[([\s\S]*)\\\]\s*$/.exec(latex) ?? /^\s*\$\$([\s\S]*)\$\$\s*$/.exec(latex) ?? /^\s*\$([^$]+)\$\s*$/.exec(latex);
  let tex = env ? env[2] : disp ? disp[1] : '';
  if (env && /align|eqnarray|flalign/.test(env[1])) tex = `\\begin{aligned}${tex}\\end{aligned}`;
  tex = tex.replace(/\\label\s*\{[^{}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '');
  let mac: Record<string, string> = {};
  try {
    mac = macros();
  } catch {}
  const html = useTexHtml(tex, true, mac);
  if (!tex.trim() || !html) return null;
  return <div className="overflow-x-auto rounded-lg bg-bg-2 px-3 py-2 text-fg" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function useLatexAi(host: AiHost) {
  const [card, setCard] = useState<Card | null>(null);
  const [help, setHelp] = useState<Record<string, { busy?: boolean; text?: string; error?: string }>>({});
  const [proof, setProof] = useState<Proof | null>(null);
  const [cite, setCite] = useState<Cite | null>(null);
  const [chooser, setChooser] = useState<{ files: File[]; url: string } | null>(null);
  const [reader, setReader] = useState<TexPictureReader | null>(null);
  const [rewriteMenu, setRewriteMenu] = useState<'main' | 'langs' | 'lang' | 'ask' | null>(null);
  const [words, setWords] = useState('');
  const rewriteAnchor = useRef<HTMLButtonElement>(null);
  const stop = useRef<AbortController | null>(null);
  const hostRef = useRef(host);
  hostRef.current = host;
  const h = () => hostRef.current;
  // Each of the card, the citations and proofreading has its own: starting one stops only what it replaces.
  const stopCite = useRef<AbortController | null>(null);
  const stopProof = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      for (const s of [stop, stopCite, stopProof]) s.current?.abort();
    },
    [],
  );
  const fresh = (which = stop) => {
    which.current?.abort();
    which.current = new AbortController();
    return which.current.signal;
  };
  const failed = (e: unknown) => ((e as Error)?.name === 'AbortError' ? null : (e as Error)?.message || String(e));
  const askReader = () => {
    if (!reader)
      void aiPictureReader().then(setReader, () => setReader({ why: tr('Who reads pictures here could not be asked.') }));
  };

  // ---- rewrite ----------------------------------------------------------------------------------------------------
  const rewrite = (how: TexRewriteHow, extra: { lang?: string; ask?: string } = {}) => {
    setRewriteMenu(null);
    setWords('');
    const x = h();
    const file = x.target();
    const c = x.codeOf(file);
    if (!c || x.readOnly) return;
    const p = c.picked();
    if (p.empty || !p.text.trim()) return toast('Pick the words to rewrite first');
    if (p.text.length > TEX_AI_MAX) return toast(`That is over ${TEX_AI_MAX} characters: pick less to rewrite at once`);
    const base = { kind: 'rewrite' as const, how, file, from: p.from, to: p.to, before: p.text, ...extra };
    if ((how === 'translate' && !extra.lang) || (how === 'ask' && !extra.ask)) return setCard({ ...base, busy: false, asking: how === 'translate' ? 'lang' : 'ask' });
    const text = c.text();
    const ps = text.lastIndexOf('\n\n', p.from);
    const pe = text.indexOf('\n\n', p.to);
    const para = text.slice(ps < 0 ? 0 : ps + 2, pe < 0 ? text.length : pe).replace(/\s+/g, ' ').trim();
    const context = [x.heading ? `the section “${x.heading.title}” of a LaTeX document` : 'a LaTeX document', para.length > p.text.length + 20 ? `in the paragraph “${para.slice(0, 500)}”` : ''].filter(Boolean).join(', ');
    setCard({ ...base, busy: true });
    void aiRewrite({ text: p.text, how, ...extra, context }, fresh()).then(
      (got) => setCard((k) => (k?.kind === 'rewrite' && k.from === base.from ? { ...k, busy: false, got } : k)),
      (e) => {
        const why = failed(e);
        setCard((k) => (k?.kind === 'rewrite' ? (why ? { ...k, busy: false, error: why } : null) : k));
      },
    );
  };
  const acceptRewrite = (k: Extract<Card, { kind: 'rewrite' }>) => {
    const got = k.got;
    if (!got || got.problems.length) return;
    h().withCode(k.file, (c) => {
      const text = c.text();
      const from = text.slice(k.from, k.to) === k.before ? k.from : nearest(text, k.before, k.from);
      if (from < 0) return toast('The words changed meanwhile, so the rewrite was left out');
      c.edit(
        wordEdits(k.before, got.text).map((e) => ({ from: from + e.from, to: from + e.to, insert: e.insert })),
        { by: 'ai', select: [from, from + k.before.length] },
      );
      c.focus();
      setCard(null);
    });
  };

  // ---- write with AI, and LaTeX from a picture ----------------------------------------------------------------------
  const preamble = () => {
    const main = h().live()?.main ?? '';
    const b = main.search(/\\begin\s*\{document\}/);
    return (b < 0 ? main : main.slice(0, b)).slice(0, 8000);
  };
  const openWrite = () => {
    const x = h();
    if (x.readOnly) return;
    const file = x.target();
    const c = x.codeOf(file);
    if (!c) return x.withCode(file, () => openWrite());
    stop.current?.abort();
    setCard({ kind: 'write', ask: '', file, at: c.cursor(), math: c.inMath(), busy: false });
  };
  const write = (ask: string) => {
    const k = card;
    if (k?.kind !== 'write' || !ask.trim()) return;
    const c = h().codeOf(k.file);
    const text = c?.text() ?? '';
    setCard({ ...k, ask, busy: true, got: undefined, error: undefined });
    void aiWrite({ ask, before: text.slice(Math.max(0, k.at - 2500), k.at), after: text.slice(k.at, k.at + 800), preamble: preamble(), math: k.math }, fresh()).then(
      (got) => setCard((x) => (x?.kind === 'write' ? { ...x, busy: false, got } : x)),
      (e) => {
        const why = failed(e);
        setCard((x) => (x?.kind === 'write' ? { ...x, busy: false, error: why ?? undefined } : x));
      },
    );
  };
  const readPicture = async (file: File) => {
    const x = h();
    if (x.readOnly) return;
    askReader();
    const name = x.target();
    const c = x.codeOf(name);
    let url: string;
    try {
      url = await shrink(file);
    } catch (e) {
      return toastError(e);
    }
    const at = c?.cursor() ?? 0;
    setCard({ kind: 'write', ask: '', file: name, at, math: !!c?.inMath(), busy: true, picture: url });
    void aiPicture({ data: url, preamble: preamble() }, fresh()).then(
      (got) => setCard((k) => (k?.kind === 'write' && k.picture === url ? { ...k, busy: false, got } : k)),
      (e) => {
        const why = failed(e);
        setCard((k) => (k?.kind === 'write' && k.picture === url ? { ...k, busy: false, error: why ?? undefined } : k));
      },
    );
  };
  const insertWritten = (k: Extract<Card, { kind: 'write' }>) => {
    const got = k.got;
    if (!got) return;
    const x = h();
    if (got.packages.length) x.editFile(TEX_MAIN, (t) => withPackageLines(t, got.packages));
    x.withCode(k.file, (c) => {
      const text = c.text();
      const at = Math.min(k.at, text.length);
      let ins = got.latex;
      // On lines of its own, unless it goes in a line's maths or words.
      const inline = k.math || (!ins.includes('\n') && !/^\\begin|^\\\[/.test(ins));
      if (!inline) {
        if (at > 0 && text[at - 1] !== '\n') ins = `\n${ins}`;
        if (at < text.length && text[at] !== '\n') ins = `${ins}\n`;
      }
      c.edit([{ from: at, to: at, insert: ins }], { by: 'ai', select: [at, at] });
      c.focus();
      setCard(null);
      toast(got.packages.length ? tr(`Put in, with ${got.packages.length === 1 ? 'a package' : `${got.packages.length} packages`} in the preamble`) : tr('Put in'), 'ok');
    });
  };
  /** Pictures pasted or dropped on the source: what they become is asked (one at a time). */
  const pictures = (files: File[]) => {
    const pics = files.filter((f) => f.type.startsWith('image/'));
    if (!pics.length || h().readOnly) return false;
    askReader();
    setChooser({ files: pics, url: URL.createObjectURL(pics[0]) });
    return true;
  };
  const chooseLatex = async () => {
    const [f] = await chooseFiles('image/png,image/jpeg,image/webp,image/gif', false);
    if (f) void readPicture(f);
  };
  useEffect(() => () => void (chooser && URL.revokeObjectURL(chooser.url)), [chooser]);

  // ---- an error explained or fixed --------------------------------------------------------------------------------
  const around = (x: TexIssue) => {
    const file = x.file ?? TEX_MAIN;
    const c = h().codeOf(file);
    const d = h().live();
    const text = c?.text() ?? (file === TEX_MAIN ? d?.main : d?.files.find((f) => f.name === file)?.text) ?? '';
    const all = text.split('\n');
    const line = Math.max(1, Math.min(x.line ?? 1, all.length));
    const first = Math.max(1, line - 12);
    const lines = all.slice(first - 1, Math.min(all.length, line + 12)).map((t, i) => ({ n: first + i, text: t }));
    const log = h().result()?.log ?? '';
    const i = log.indexOf(x.message.slice(0, 40));
    return { file, text, lines, log: i >= 0 ? log.slice(Math.max(0, i - 400), i + 1200) : '' };
  };
  const explain = (x: TexIssue, warning: boolean) => {
    const key = keyOf(x);
    if (help[key]?.text) return setHelp((m) => ({ ...m, [key]: { ...m[key], text: undefined } }));
    const a = around(x);
    setHelp((m) => ({ ...m, [key]: { busy: true } }));
    void aiError({ how: 'explain', message: x.message, hint: x.hint, warning, file: x.file ? h().label(x.file) : undefined, line: x.line, lines: a.lines, log: a.log }).then(
      (r) => setHelp((m) => ({ ...m, [key]: { text: r.text } })),
      (e) => setHelp((m) => ({ ...m, [key]: { error: failed(e) ?? undefined } })),
    );
  };
  const fix = (x: TexIssue) => {
    if (h().readOnly) return;
    const a = around(x);
    setCard({ kind: 'fix', issue: x, file: a.file, busy: true });
    void aiError({ how: 'fix', message: x.message, hint: x.hint, file: h().label(a.file), line: x.line, lines: a.lines, log: a.log }, fresh()).then(
      (got) => {
        const before = got.fix ? a.text.split('\n').slice(got.fix.from - 1, got.fix.to).join('\n') : undefined;
        setCard((k) => (k?.kind === 'fix' && k.issue === x ? { ...k, busy: false, got, before } : k));
      },
      (e) => {
        const why = failed(e);
        setCard((k) => (k?.kind === 'fix' && k.issue === x ? (why ? { ...k, busy: false, error: why } : null) : k));
      },
    );
  };
  const acceptFix = (k: Extract<Card, { kind: 'fix' }>) => {
    const f = k.got?.fix;
    if (!f || k.before === undefined) return;
    h().withCode(k.file, (c) => {
      const text = c.text();
      const lines = text.split('\n');
      let from = 0;
      for (let i = 0; i < f.from - 1 && i < lines.length; i++) from += lines[i].length + 1;
      const to = from + k.before!.length;
      if (text.slice(from, to) !== k.before) return toast('Those lines changed meanwhile, so the fix was left out');
      c.edit(wordEdits(k.before!, f.text).map((e) => ({ from: from + e.from, to: from + e.to, insert: e.insert })), { by: 'ai', select: [from, to] });
      c.focus();
      setCard(null);
    });
  };

  // ---- papers for a claim ------------------------------------------------------------------------------------------
  const openCite = () => {
    const x = h();
    const file = x.target();
    const c = x.codeOf(file);
    const p = c?.picked();
    if (!c || !p || p.empty || p.text.trim().length < 8) return toast('Pick the claim to find papers for first');
    const text = c.text();
    const ps = text.lastIndexOf('\n\n', p.from);
    const pe = text.indexOf('\n\n', p.to);
    const context = text.slice(ps < 0 ? 0 : ps + 2, pe < 0 ? text.length : pe).slice(0, 1200);
    const claim = p.text.slice(0, 1500);
    setCite({ claim, file, from: p.from, to: p.to, busy: true, cited: [] });
    void aiCite({ claim, context }, fresh(stopCite)).then(
      (got) => setCite((k) => (k && k.claim === claim ? { ...k, busy: false, got } : k)),
      (e) => {
        const why = failed(e);
        setCite((k) => (k && k.claim === claim ? { ...k, busy: false, error: why ?? undefined } : k));
      },
    );
  };
  const citePaper = async (p: TexCitePaper, cite: boolean) => {
    const at = citeRef.current;
    if (!at) return;
    // doi.org's or arXiv's own entry when it can be had; else the one made from the paper's record.
    let ref: TexReference | null = null;
    try {
      const q = p.doi ?? (p.arxiv ? `arXiv:${p.arxiv}` : '');
      if (q) ref = (await findReferences(q)).entries[0] ?? null;
    } catch {}
    if (!ref) {
      const e = parseBibEntry(p.bibtex);
      if (!e) return toast('That entry could not be read');
      ref = { ...bibInfo(e), bibtex: p.bibtex };
    }
    const key = h().addReference(ref, false);
    if (!key) return;
    setCite((c) => (c ? { ...c, cited: [...c.cited, p.title] } : c));
    if (!cite) return;
    h().withCode(at.file, (c) => {
      const text = c.text();
      const from = text.slice(at.from, at.to) === at.claim ? at.from : nearest(text, at.claim, at.from);
      if (from < 0) return toast(tr(`Added ${key}: the words picked changed, so cite it where it goes`));
      let pos = from + at.claim.length;
      while (pos > from && /\s/.test(text[pos - 1])) pos--;
      if (/[.,;:]/.test(text[pos - 1] ?? '')) pos--;
      // Cited here a moment ago: one \cite with both keys.
      const prev = /\\cite[a-z]*\{([^{}]*)\}$/.exec(text.slice(Math.max(0, pos - 300), pos));
      if (prev) c.edit([{ from: pos - 1, to: pos - 1, insert: `,${key}` }]);
      else c.edit([{ from: pos, to: pos, insert: `${pos > 0 && !/[\s~{]/.test(text[pos - 1]) ? '~' : ''}\\cite{${key}}` }]);
      c.focus();
    });
  };
  const citeRef = useRef(cite);
  citeRef.current = cite;

  // ---- proofreading -------------------------------------------------------------------------------------------------
  const proofread = async () => {
    const x = h();
    if (x.readOnly) return;
    const file = x.target();
    const c = x.codeOf(file);
    if (!c) return;
    const text = c.text();
    const p = c.picked();
    const paras = proseParagraphs(text, p.empty ? 0 : p.from, p.empty ? text.length : p.to);
    if (!paras.length) return toast('There are no words to proofread here');
    // Parts of at most 6,000 characters, a paragraph never split (one longer goes alone, cut).
    const parts: { id: number; text: string; from: number }[][] = [];
    let cur: { id: number; text: string; from: number }[] = [];
    let size = 0;
    paras.forEach((q, i) => {
      const t = q.text.slice(0, 6000);
      if (cur.length && size + t.length > 6000) {
        parts.push(cur);
        cur = [];
        size = 0;
      }
      cur.push({ id: i, text: t, from: q.from });
      size += t.length;
    });
    if (cur.length) parts.push(cur);
    if (parts.length > 40) return toast('That is too much to proofread at once: pick a part of it');
    const signal = fresh(stopProof);
    setProof({ file, items: [], busy: { done: 0, of: parts.length } });
    let n = 0;
    for (let i = 0; i < parts.length; i++) {
      try {
        const r = await aiProofread({ paragraphs: parts[i].map((q) => ({ id: q.id, text: q.text })) }, signal);
        const items = r.corrections.map((k): Correction => {
          const q = parts[i].find((y) => y.id === k.id)!;
          const at = q.from + k.from;
          return { id: n++, at, was: k.was, now: k.now, why: k.why, before: text.slice(Math.max(0, at - 24), at), after: text.slice(at + k.was.length, at + k.was.length + 24), state: 'open' };
        });
        setProof((pr) => (pr && pr.file === file ? { ...pr, items: [...pr.items, ...items], busy: { done: i + 1, of: parts.length }, by: { model: r.model, cost: (pr.by?.cost ?? 0) + (r.cost ?? 0) || undefined } } : pr));
      } catch (e) {
        const why = failed(e);
        setProof((pr) => (pr && pr.file === file ? { ...pr, busy: null, error: why ?? undefined } : pr));
        return;
      }
    }
    setProof((pr) => (pr && pr.file === file ? { ...pr, busy: null } : pr));
  };
  /** Where a correction is now (the text may have changed since): its place, or -1. */
  const locate = (text: string, k: Correction) => {
    const whole = nearest(text, k.before + k.was + k.after, k.at - k.before.length);
    if (whole >= 0) return whole + k.before.length;
    const at = nearest(text, k.was, k.at);
    return at >= 0 && Math.abs(at - k.at) < 400 ? at : -1;
  };
  const accept = (ids: number[] | null, force = false) => {
    const pr = proof;
    if (!pr) return;
    h().withCode(pr.file, (c) => {
      const text = c.text();
      const open = pr.items.filter((k) => k.state === 'open' && (!ids || ids.includes(k.id)));
      const edits: { from: number; to: number; insert: string }[] = [];
      const gone: number[] = [];
      for (const k of open) {
        const at = locate(text, k);
        if (at < 0 || edits.some((e) => e.from < at + k.was.length && at < Math.max(e.to, e.from + 1))) gone.push(k.id);
        else edits.push({ from: at, to: at + k.was.length, insert: k.now });
      }
      if (edits.length) c.edit(edits, { by: 'ai', force });
      setProof((p) => (p ? { ...p, items: p.items.map((k) => (open.some((o) => o.id === k.id) ? { ...k, state: gone.includes(k.id) ? 'gone' : 'done' } : k)) } : p));
      if (gone.length) toast(tr(`${gone.length} of them were no longer there to correct`));
      if (force && edits.length) h().showChanges();
    });
  };
  const pickCorrection = (k: Correction) => {
    const pr = proof;
    if (!pr) return;
    h().withCode(pr.file, (c) => {
      const at = locate(c.text(), k);
      if (at >= 0) c.select(at, at + k.was.length);
    });
  };

  // ---- what the editor shows -----------------------------------------------------------------------------------------
  const ro = host.readOnly;
  const rewriteItems: MenuEntry[] = [
    ...(['shorter', 'clearer', 'academic', 'fix'] as TexRewriteHow[]).map((how) => ({ label: TEX_REWRITE_LABELS[how], also: 'ai rewrite', run: () => rewrite(how) })),
    '-',
    { label: TEX_REWRITE_LABELS.translate, icon: <Languages size={14} />, also: 'ai rewrite language', items: [...WRITE_LANGS.map((l) => ({ label: l, also: 'translate language', run: () => rewrite('translate', { lang: l }) })), '-', { label: 'Another language', also: 'translate language', run: () => rewrite('translate') }] },
    { label: TEX_REWRITE_LABELS.ask, icon: <PencilLine size={14} />, also: 'ai rewrite', run: () => rewrite('ask') },
  ];
  const editItems: MenuEntry[] = ro ? [] : [{ label: 'Rewrite with AI', icon: <WandSparkles size={14} />, disabled: !host.picked, also: 'ai rewrite shorter clearer academic grammar translate', items: rewriteItems }];
  const insertItems: MenuEntry[] = ro
    ? []
    : [
        { label: 'Write with AI', icon: <Sparkles size={14} />, keys: 'Ctrl+K', also: 'ai generate equation table algorithm tikz figure paragraph', run: openWrite },
        { label: 'LaTeX from a picture', icon: <ScanText size={14} />, also: 'ai ocr screenshot photo handwriting equation table image', run: () => void chooseLatex() },
        { label: 'Find a citation for this', icon: <BookMarked size={14} />, disabled: !host.picked, also: 'ai cite paper reference claim openalex arxiv', run: openCite },
      ];
  const toolsItems: MenuEntry[] = ro ? [] : [{ label: 'Proofread with AI', icon: <SpellCheck size={14} />, also: 'ai grammar spelling proofreading', run: () => void proofread() }];

  const toolbar: RowTool | false = !ro &&
    host.picked && {
      id: 'rewrite',
      rank: 3.5,
      group: 'ask',
      node: (
        <Button ref={rewriteAnchor} size="sm" variant="ghost" icon={card?.kind === 'rewrite' && card.busy ? <Throbber size={13} /> : <WandSparkles size={14} />} onClick={() => setRewriteMenu(rewriteMenu ? null : 'main')} className={cx('shrink-0', rewriteMenu && 'bg-bg-2')}>
          Rewrite
        </Button>
      ),
      small: (
        <IconButton ref={rewriteAnchor} label="Rewrite with AI" size="sm" active={!!rewriteMenu} onClick={() => setRewriteMenu(rewriteMenu ? null : 'main')}>
          <WandSparkles size={15} />
        </IconButton>
      ),
    };

  const lang = cleanLang(words);
  const rewritePopover = (
    <Popover anchor={rewriteAnchor} open={!!rewriteMenu} onClose={() => setRewriteMenu(null)} width={240} title="Rewrite with AI">
      {rewriteMenu === 'main' && (
        <>
          {(['shorter', 'clearer', 'academic', 'fix'] as TexRewriteHow[]).map((how) => (
            <MenuItem key={how} onClick={() => rewrite(how)}>
              {TEX_REWRITE_LABELS[how]}
            </MenuItem>
          ))}
          <MenuSep />
          <MenuItem icon={<Languages size={14} />} submenu onClick={() => setRewriteMenu('langs')}>
            {TEX_REWRITE_LABELS.translate}
          </MenuItem>
          <MenuItem icon={<PencilLine size={14} />} submenu onClick={() => setRewriteMenu('ask')}>
            {TEX_REWRITE_LABELS.ask}
          </MenuItem>
        </>
      )}
      {rewriteMenu === 'langs' && (
        <>
          <MenuBack onClick={() => setRewriteMenu('main')}>{TEX_REWRITE_LABELS.translate}</MenuBack>
          {WRITE_LANGS.map((l) => (
            <MenuItem key={l} onClick={() => rewrite('translate', { lang: l })}>
              {l}
            </MenuItem>
          ))}
          <MenuSep />
          <MenuItem icon={<ChevronRight size={14} />} onClick={() => setRewriteMenu('lang')}>
            Another language
          </MenuItem>
        </>
      )}
      {(rewriteMenu === 'lang' || rewriteMenu === 'ask') && (
        <>
          <MenuBack onClick={() => setRewriteMenu(rewriteMenu === 'lang' ? 'langs' : 'main')}>{rewriteMenu === 'lang' ? 'Another language' : TEX_REWRITE_LABELS.ask}</MenuBack>
          <form
            className="space-y-2 px-1.5 pt-1 pb-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (rewriteMenu === 'lang' && lang) rewrite('translate', { lang });
              else if (rewriteMenu === 'ask' && words.trim()) rewrite('ask', { ask: words.trim() });
            }}
          >
            <input autoFocus value={words} onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={rewriteMenu === 'lang' ? 'Swahili, Hebrew, Thai…' : 'Tighter, for a methods section'} aria-label={rewriteMenu === 'lang' ? 'The language' : 'How to rewrite it'} className={inputCls} />
            <div className="flex justify-end">
              <Button size="sm" variant="primary" type="submit" disabled={rewriteMenu === 'lang' ? !lang : !words.trim()}>
                {rewriteMenu === 'lang' ? 'Translate' : 'Rewrite'}
              </Button>
            </div>
          </form>
        </>
      )}
    </Popover>
  );

  const close = () => {
    stop.current?.abort();
    setCard(null);
  };
  const cardNode = card && (
    <AiCardView
      card={card}
      macros={host.macros}
      label={host.label}
      tracking={host.tracking}
      reader={reader}
      onClose={close}
      onWrite={write}
      onAsk={(how, extra) => rewrite(how, extra)}
      onAcceptRewrite={acceptRewrite}
      onInsert={insertWritten}
      onAcceptFix={acceptFix}
      onAgain={() => {
        if (card.kind === 'rewrite') rewrite(card.how, { lang: card.lang, ask: card.ask });
        else if (card.kind === 'fix') fix(card.issue);
        else if (card.picture) {
          setCard({ ...card, busy: true, got: undefined, error: undefined });
          void aiPicture({ data: card.picture, preamble: preamble() }, fresh()).then(
            (got) => setCard((k) => (k?.kind === 'write' ? { ...k, busy: false, got } : k)),
            (e) => setCard((k) => (k?.kind === 'write' ? { ...k, busy: false, error: failed(e) ?? undefined } : k)),
          );
        } else write(card.ask);
      }}
    />
  );

  const side = (className?: string) =>
    proof && (
      <ProofPanel
      className={className}
      proof={proof}
      label={host.label}
      canTrack={host.canTrack}
      onClose={() => {
        stopProof.current?.abort();
        setProof(null);
      }}
      onStop={() => stopProof.current?.abort()}
      onAccept={(id) => accept([id])}
      onDismiss={(id) => setProof((p) => (p ? { ...p, items: p.items.map((k) => (k.id === id ? { ...k, state: 'done' } : k)) } : p))}
      onAll={(force) => accept(null, force)}
      onPick={pickCorrection}
    />
  );

  const dialogs = (
    <>
      {rewritePopover}
      <Dialog
        open={!!chooser}
        onClose={() => setChooser(null)}
        title="A picture: what should it become?"
        width={460}
        footer={
          <Button variant="ghost" onClick={() => setChooser(null)}>
            Cancel
          </Button>
        }
      >
        {chooser && (
          <div className="space-y-3">
            <div className="flex h-32 items-center justify-center rounded-lg bg-bg-2 p-2">
              <img src={chooser.url} alt="" className="max-h-full max-w-full object-contain" />
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => {
                const f = chooser.files;
                setChooser(null);
                void h().asFigures(f);
              }}
              className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:border-line-2 hover:bg-bg-2"
            >
              <ImageUp size={18} className="mt-0.5 shrink-0 text-fg-2" />
              <span>
                <span className="block text-[13.5px] font-medium text-fg">{chooser.files.length > 1 ? tr(`${chooser.files.length} figures`) : 'A figure'}</span>
                <span className="block text-[12.5px] text-fg-3">Saved in the project under figures/, with a figure where the cursor is</span>
              </span>
            </button>
            <button
              type="button"
              disabled={!!reader?.why}
              onClick={() => {
                const f = chooser.files[0];
                setChooser(null);
                void readPicture(f);
              }}
              className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left transition-colors enabled:hover:border-line-2 enabled:hover:bg-bg-2 disabled:opacity-55"
            >
              <ScanText size={18} className="mt-0.5 shrink-0 text-accent" />
              <span>
                <span className="block text-[13.5px] font-medium text-fg">Its LaTeX</span>
                <span className="block text-[12.5px] text-fg-3">An equation, a table or text read from the picture, shown before it goes in</span>
                <span className="mt-1 block text-[12px] text-fg-3">{reader ? (reader.why ?? `${tr('Read by')} ${reader.label}${reader.cost ? ` · ${tr('about')} ${money(reader.cost)}` : ''}`) : ''}</span>
              </span>
            </button>
          </div>
        )}
      </Dialog>
      {cite && <CiteDialog cite={cite} onClose={() => (stopCite.current?.abort(), setCite(null))} onCite={(p, c) => void citePaper(p, c)} />}
    </>
  );

  return {
    editItems,
    insertItems,
    toolsItems,
    toolbar,
    card: cardNode,
    side,
    dialogs,
    openWrite,
    pictures,
    problems: { help: (x: TexIssue) => help[keyOf(x)], explain, fix, busyFix: card?.kind === 'fix' && card.busy ? keyOf(card.issue) : null },
    proofOpen: !!proof,
  };
}

// ---- the card -----------------------------------------------------------------------------------------------------------

function AiCardView({
  card,
  macros,
  label,
  tracking,
  reader,
  onClose,
  onWrite,
  onAsk,
  onAcceptRewrite,
  onInsert,
  onAcceptFix,
  onAgain,
}: {
  card: Card;
  macros: () => Record<string, string>;
  label: (n: string) => string;
  tracking: boolean;
  reader: TexPictureReader | null;
  onClose: () => void;
  onWrite: (ask: string) => void;
  onAsk: (how: TexRewriteHow, extra: { lang?: string; ask?: string }) => void;
  onAcceptRewrite: (k: Extract<Card, { kind: 'rewrite' }>) => void;
  onInsert: (k: Extract<Card, { kind: 'write' }>) => void;
  onAcceptFix: (k: Extract<Card, { kind: 'fix' }>) => void;
  onAgain: () => void;
}) {
  const [ask, setAsk] = useState(card.kind === 'write' ? card.ask : '');
  const title =
    card.kind === 'rewrite'
      ? `${tr('Rewrite')}: ${card.how === 'translate' && card.lang ? `${tr('Translate to')} ${card.lang}` : tr(TEX_REWRITE_LABELS[card.how])}`
      : card.kind === 'fix'
        ? tr('Fix with AI')
        : card.picture
          ? tr('LaTeX from a picture')
          : tr('Write with AI');
  const busyWords = card.kind === 'rewrite' ? 'Rewriting the words picked…' : card.kind === 'fix' ? 'Working out a fix…' : card.picture ? 'Reading the picture…' : 'Writing it…';
  const got = card.kind === 'write' ? card.got : null;
  const footer = (() => {
    if (card.busy) return null;
    if (card.kind === 'rewrite' && card.got)
      return card.got.problems.length ? (
        <Button size="sm" variant="secondary" onClick={onAgain}>
          Try again
        </Button>
      ) : (
        <>
          <Button size="sm" variant="ghost" onClick={onAgain}>
            Try again
          </Button>
          <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => onAcceptRewrite(card)}>
            Accept
          </Button>
        </>
      );
    if (card.kind === 'write' && got)
      return (
        <>
          <Button size="sm" variant="ghost" onClick={onAgain}>
            Try again
          </Button>
          <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => onInsert(card)}>
            Insert
          </Button>
        </>
      );
    if (card.kind === 'fix' && card.got?.fix)
      return (
        <>
          <Button size="sm" variant="ghost" onClick={onAgain}>
            Try again
          </Button>
          <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => onAcceptFix(card)}>
            Accept
          </Button>
        </>
      );
    if (card.error)
      return (
        <Button size="sm" variant="secondary" onClick={onAgain}>
          Try again
        </Button>
      );
    return null;
  })();
  const by = card.kind === 'write' ? card.got : card.got;
  return (
    <div role="dialog" aria-label={title} className="absolute inset-x-3 bottom-3 z-30 flex max-h-[min(60%,520px)] flex-col overflow-hidden rounded-xl border border-line bg-elevated shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        {card.kind === 'write' && card.picture ? <ScanText size={15} className="text-accent" /> : <Sparkles size={15} className="text-accent" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{title}</span>
        {card.kind !== 'write' && <span className="truncate text-[11.5px] text-fg-3" translate="no">{label(card.file)}</span>}
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-2.5 text-[13px]">
        {card.kind === 'write' && !card.picture && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onWrite(ask);
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') onClose();
              }}
              placeholder={tr('Describe what goes here: an equation, a table, an algorithm, a TikZ figure, a paragraph…')}
              aria-label="What to write"
              className={cx(inputCls, 'flex-1')}
            />
            <Button size="sm" variant="primary" type="submit" disabled={!ask.trim() || card.busy} className="h-9">
              Write
            </Button>
          </form>
        )}
        {card.kind === 'write' && !card.picture && !card.busy && !got && !card.error && (
          <div className="flex flex-wrap gap-1.5">
            {['The equation of the softmax', 'A results table: 3 models, accuracy and F1', 'An algorithm for beam search', 'A TikZ diagram of an encoder and a decoder'].map((x) => (
              <button key={x} type="button" onClick={() => (setAsk(tr(x)), onWrite(tr(x)))} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg">
                {x}
              </button>
            ))}
          </div>
        )}
        {card.kind === 'write' && card.picture && (
          <div className="flex items-start gap-3">
            <img src={card.picture} alt="" className="max-h-24 max-w-[40%] rounded-lg border border-line bg-white object-contain" />
            <p className="text-[12.5px] text-fg-3">{reader?.label ? `${tr('Read by')} ${reader.label}${reader.cost ? ` · ${tr('about')} ${money(reader.cost)}` : ''}` : ''}</p>
          </div>
        )}
        {card.kind === 'rewrite' && card.asking && !card.busy && !card.got && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const l = card.asking === 'lang' ? cleanLang(ask) : null;
              if (card.asking === 'lang' && l) onAsk('translate', { lang: l });
              else if (card.asking === 'ask' && ask.trim()) onAsk('ask', { ask: ask.trim() });
            }}
            className="flex gap-2"
          >
            <input autoFocus value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={card.asking === 'lang' ? tr('Swahili, Hebrew, Thai…') : tr('Tighter, for a methods section')} aria-label={card.asking === 'lang' ? 'The language' : 'How to rewrite it'} className={cx(inputCls, 'flex-1')} />
            <Button size="sm" variant="primary" type="submit" disabled={card.asking === 'lang' ? !cleanLang(ask) : !ask.trim()} className="h-9">
              {card.asking === 'lang' ? 'Translate' : 'Rewrite'}
            </Button>
          </form>
        )}
        {card.busy && (
          <div className="flex items-center gap-2 text-[12.5px] text-fg-2">
            <Throbber size={14} />
            {busyWords}
          </div>
        )}
        {card.error && <p className="text-[12.5px] text-err">{card.error}</p>}
        {card.kind === 'rewrite' && card.got && (
          <>
            {card.got.problems.length > 0 && (
              <div className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-2 text-[12.5px] text-fg-2">
                <p className="font-medium text-fg">Not put in: the rewrite did not keep what must stay.</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {card.got.problems.map((p) => (
                    <li key={p} translate="no">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <WordDiff a={card.before} b={card.got.text} />
            {!card.got.problems.length && tracking && <p className="text-[12px] text-fg-3">Track changes is on: it goes in as changes by AI, to accept or reject.</p>}
          </>
        )}
        {card.kind === 'write' && got && (
          <>
            {got.packages.length > 0 && (
              <p className="text-[12.5px] text-fg-2">
                {tr('Adds to the preamble:')}{' '}
                <span translate="no" className="font-mono text-[12px] text-fg">
                  {got.packages.join(', ')}
                </span>
              </p>
            )}
            <MathOf latex={got.latex} macros={macros} />
            <pre translate="no" className="max-h-64 overflow-auto rounded-lg bg-bg-2 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg">
              {got.latex}
            </pre>
            {got.note && <p className="text-[12px] text-fg-3">{got.note}</p>}
          </>
        )}
        {card.kind === 'fix' && card.got && (
          <>
            <p className="text-[12.5px] text-fg-2">{card.got.text}</p>
            {card.got.fix && card.before !== undefined && (
              <>
                <p className="text-[11.5px] text-fg-3">{card.got.fix.from === card.got.fix.to ? tr(`Line ${card.got.fix.from}`) : tr(`Lines ${card.got.fix.from}–${card.got.fix.to}`)}</p>
                <WordDiff a={card.before} b={card.got.fix.text} />
              </>
            )}
          </>
        )}
      </div>
      {(footer || by?.model) && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-3">{byLine(by ?? undefined)}</span>
          {footer}
        </div>
      )}
    </div>
  );
}

// ---- proofreading's panel -------------------------------------------------------------------------------------------------

function ProofPanel({
  className,
  proof,
  label,
  canTrack,
  onClose,
  onStop,
  onAccept,
  onDismiss,
  onAll,
  onPick,
}: {
  className?: string;
  proof: Proof;
  label: (n: string) => string;
  canTrack: boolean;
  onClose: () => void;
  onStop: () => void;
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
  onAll: (asTracked: boolean) => void;
  onPick: (k: Correction) => void;
}) {
  const open = proof.items.filter((k) => k.state === 'open');
  return (
    <div className={cx("flex min-h-0 shrink-0 flex-col bg-panel", className ?? "w-64 border-l border-line")}>
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line pr-1 pl-3">
        <SpellCheck size={14} className="text-accent" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">
          Proofread · <span translate="no">{label(proof.file)}</span>
        </span>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
      {proof.busy && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 text-[12px] text-fg-2">
          <Throbber size={13} />
          <span className="flex-1">{proof.busy.of > 1 ? tr(`Reading part ${proof.busy.done + 1} of ${proof.busy.of}`) : tr('Reading the words')}</span>
          <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={onStop} className="h-7 px-2 text-[12px]">
            Stop
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
        {proof.error && <p className="px-1 text-[12.5px] text-err">{proof.error}</p>}
        {!proof.busy && !open.length && !proof.error && <p className="px-1 py-2 text-[12.5px] text-fg-3">{proof.items.length ? 'All done.' : 'Nothing to correct.'}</p>}
        {open.map((k) => (
          <div
            key={k.id}
            role="button"
            tabIndex={0}
            onClick={() => onPick(k)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(k))}
            className="cursor-pointer rounded-xl border border-line bg-elevated p-2.5 transition-colors hover:border-line-2"
          >
            <div className="flex items-start gap-1">
              <div translate="no" className="min-w-0 flex-1 font-mono text-[12px] leading-snug break-words">
                <span className="text-err line-through">{k.was || '—'}</span>
                <span className="text-fg-3"> → </span>
                <span className="text-ok">{k.now || tr('(taken out)')}</span>
              </div>
              <IconButton
                label="Accept"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept(k.id);
                }}
              >
                <Check size={14} />
              </IconButton>
              <IconButton
                label="Dismiss"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(k.id);
                }}
              >
                <X size={14} />
              </IconButton>
            </div>
            {k.why && <p className="mt-1 text-[12px] text-fg-3">{k.why}</p>}
          </div>
        ))}
      </div>
      {(open.length > 0 || proof.by?.model) && (
        <div className="shrink-0 space-y-1.5 border-t border-line p-2">
          {open.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => onAll(false)} className="h-7 px-2 text-[12px]">
                {tr(`Accept all ${open.length}`)}
              </Button>
              {canTrack && (
                <Button size="sm" variant="ghost" onClick={() => onAll(true)} className="h-7 px-2 text-[12px]">
                  As tracked changes
                </Button>
              )}
            </div>
          )}
          {proof.by?.model && <p className="truncate px-1 text-[11.5px] text-fg-3">{byLine(proof.by)}</p>}
        </div>
      )}
    </div>
  );
}

// ---- papers for a claim ---------------------------------------------------------------------------------------------------

function CiteDialog({ cite, onClose, onCite }: { cite: Cite; onClose: () => void; onCite: (p: TexCitePaper, cite: boolean) => void }) {
  const [more, setMore] = useState<string | null>(null);
  const papers = cite.got?.papers ?? [];
  return (
    <Dialog
      open
      onClose={onClose}
      title="Papers that back this"
      width={720}
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-3">{cite.got ? [cite.got.queries.length ? `${tr('Searched OpenAlex and arXiv for')} “${cite.got.queries.join('”, “')}”` : '', byLine(cite.got)].filter(Boolean).join(' · ') : ''}</span>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <blockquote translate="no" className="mb-3 border-l-2 border-accent/60 pl-3 text-[13px] leading-relaxed text-fg-2">
        {cite.claim.length > 400 ? `${cite.claim.slice(0, 400)}…` : cite.claim}
      </blockquote>
      {cite.busy && (
        <div className="flex items-center gap-2 py-6 text-[13px] text-fg-2">
          <Throbber size={16} />
          Searching for papers and reading their abstracts…
        </div>
      )}
      {cite.error && <p className="py-4 text-[13px] text-err">{cite.error}</p>}
      {cite.got && !papers.length && <p className="py-4 text-[13px] text-fg-3">No paper found backs it. Say it with other words, or find one by its title with Insert → Reference from the web.</p>}
      {cite.got?.notes?.map((n) => (
        <p key={n} className="text-[12px] text-fg-3">
          {n}
        </p>
      ))}
      <div className="space-y-2.5">
        {papers.map((p) => {
          const done = cite.cited.includes(p.title);
          const id = p.doi ?? p.arxiv ?? p.title;
          return (
            <article key={id} className="rounded-xl border border-line p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 translate="no" className="text-[13.5px] leading-snug font-medium text-fg">
                    {p.title}
                  </h3>
                  <p translate="no" className="mt-0.5 truncate text-[12px] text-fg-3">
                    {[p.authors.length > 3 ? `${p.authors.slice(0, 3).join(', ')} et al.` : p.authors.join(', '), p.year, p.venue].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', p.backs === 'strong' ? 'bg-ok/15 text-ok' : 'bg-bg-3 text-fg-2')}>{p.backs === 'strong' ? 'Backs it' : 'Partly'}</span>
              </div>
              {p.why && <p className="mt-1.5 text-[12.5px] text-fg-2">{p.why}</p>}
              {p.abstract && (
                <p translate="no" className={cx('mt-1.5 text-[12px] leading-relaxed text-fg-3', more !== id && 'line-clamp-3')}>
                  {p.abstract}
                </p>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                {p.abstract && (
                  <button type="button" onClick={() => setMore(more === id ? null : id)} className="text-[12px] text-accent hover:underline">
                    {more === id ? 'Less' : 'The whole abstract'}
                  </button>
                )}
                <span className="flex-1" />
                {done ? (
                  <span className="flex items-center gap-1 text-[12px] text-ok">
                    <Check size={13} /> Added
                  </span>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => onCite(p, false)} className="h-7 px-2 text-[12.5px]">
                      Add
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => onCite(p, true)} className="h-7 px-2.5 text-[12.5px]">
                      Cite
                    </Button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Dialog>
  );
}
