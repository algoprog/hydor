// What the LaTeX editor offers as you type. A backslash offers commands: the common ones (commands.ts), those of the
// packages the document loads, and the document's own (\newcommand, \DeclareMathOperator, \NewDocumentCommand), each
// going in with places to fill (Tab goes to the next). \begin{ offers environments, the document's own too (its
// \newenvironment and \newtheorem ones), and puts in the matching \end{…} with the cursor inside. \usepackage{ offers
// common packages and \documentclass{ the classes, saying which ones this computer lacks. Nothing is offered in a
// comment.
import { snippet, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { TEX_CLASSES, TEX_PACKAGES } from '@shared/latex-catalog';
import { tr } from '../../../i18n/runtime';
import { COMMANDS, COMMON, ENVIRONMENTS } from './commands';
import { braced } from './scan';

export interface DocCommand {
  /** With its backslash: "\R". */
  name: string;
  args: number;
  /** What it stands for, as written. */
  def: string;
  file: string;
}

export interface DocEnv {
  name: string;
  args: number;
  file: string;
  /** For \newtheorem: what it is called ("Lemma"). */
  title?: string;
}

/** What the document loads and defines, for completions. */
export interface DocDefs {
  /** The packages it loads and its class (and what those load). */
  packages: Set<string>;
  commands: DocCommand[];
  environments: DocEnv[];
}

/** Packages that load others the editor knows the commands of. */
const IMPLIES: Record<string, string[]> = {
  mathtools: ['amsmath'],
  beamer: ['amsmath', 'amssymb', 'amsthm', 'graphicx', 'hyperref', 'xcolor'],
  tikzposter: ['tikz', 'xcolor', 'graphicx'],
  pgfplots: ['tikz'],
  moderncv: ['hyperref', 'xcolor', 'graphicx'],
  physics: ['amsmath'],
  biblatex: [],
  cleveref: [],
  tcolorbox: ['xcolor'],
  todonotes: ['xcolor', 'tikz'],
  amsart: ['amsmath', 'amssymb', 'amsthm'],
  amsbook: ['amsmath', 'amssymb', 'amsthm'],
};

/** The packages, class and definitions of a document's TeX files. */
export function docDefs(files: { name: string; text: string }[]): DocDefs {
  const packages = new Set<string>();
  const commands = new Map<string, DocCommand>();
  const environments = new Map<string, DocEnv>();
  for (const f of files) {
    if (!/\.(tex|ltx|sty|cls)$/i.test(f.name)) continue;
    const t = f.text.length > 400_000 ? f.text.slice(0, 400_000) : f.text;
    for (const m of t.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) for (const p of m[1].split(',')) if (p.trim()) packages.add(p.trim());
    const dc = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(t);
    if (dc) packages.add(dc[1].trim());
    for (const m of t.matchAll(/\\(?:re)?(?:new|provide)command\*?\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))\s*(?:\[(\d)\])?(\s*\[[^\]]*\])?\s*\{/g)) {
      const name = m[1] ?? m[2];
      const body = braced(t, m.index! + m[0].length - 1);
      if (!name.includes('@')) commands.set(name, { name, args: Math.max(0, Number(m[3] ?? 0) - (m[4] ? 1 : 0)), def: body ? body.text.slice(0, 160) : '', file: f.name });
    }
    for (const m of t.matchAll(/\\DeclareMathOperator\*?\s*\{\s*(\\[A-Za-z@]+)\s*\}\s*\{([^{}]*)\}/g)) commands.set(m[1], { name: m[1], args: 0, def: `\\operatorname{${m[2]}}`, file: f.name });
    for (const m of t.matchAll(/\\(?:New|Renew|Provide|Declare)DocumentCommand\s*\{?\s*(\\[A-Za-z@]+)\s*\}?\s*\{([^{}]*)\}/g)) commands.set(m[1], { name: m[1], args: (m[2].match(/\bm\b/g) ?? []).length, def: '', file: f.name });
    for (const m of t.matchAll(/\\def\s*(\\[A-Za-z]+)\s*\{/g)) if (!commands.has(m[1])) commands.set(m[1], { name: m[1], args: 0, def: braced(t, m.index! + m[0].length - 1)?.text.slice(0, 160) ?? '', file: f.name });
    for (const m of t.matchAll(/\\(?:re)?newenvironment\s*\{([^}]+)\}\s*(?:\[(\d)\])?/g)) environments.set(m[1].trim(), { name: m[1].trim(), args: Number(m[2] ?? 0), file: f.name });
    for (const m of t.matchAll(/\\newtheorem\*?\s*\{([^}]+)\}\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) environments.set(m[1].trim(), { name: m[1].trim(), args: 0, file: f.name, title: m[2].trim() });
  }
  for (const p of [...packages]) for (const q of IMPLIES[p] ?? []) packages.add(q);
  return { packages, commands: [...commands.values()], environments: [...environments.values()] };
}

/** A template's literal \{ and \} kept as such: CodeMirror's snippets read a lone \{ as a brace. */
const tpl = (t: string) =>
  t
    .split(/(\$\{[^{}]*\})/)
    .map((part, i) => (i % 2 ? part : part.replace(/\\([{}])/g, '\\\\$1')))
    .join('');

/** What a template's arguments look like in the list: {…}{…}. */
const shape = (args: string) => args.replace(/\$\{[^{}]*\}/g, '…').trim();

/** Whether the cursor is in a comment (after a % no backslash escapes). */
function inComment(ctx: CompletionContext): boolean {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  for (let i = 0; i < before.length; i++) if (before[i] === '%' && !/(^|[^\\])(\\\\)*\\$/.test(before.slice(0, i))) return true;
  return false;
}

let baseCache: { key: string; list: Completion[] } | null = null;

/** The common commands, those of `packages` among them. */
function baseCommands(packages: Set<string>): Completion[] {
  const key = [...packages].sort().join(',');
  if (baseCache?.key === key) return baseCache.list;
  const list: Completion[] = [];
  for (const [name, args, what, pkg] of COMMANDS) {
    if (pkg && !packages.has(pkg)) continue;
    const call = name.replace(/\[n\]$/, '');
    list.push({
      label: `\\${name}`,
      detail: shape(args) || undefined,
      info: pkg ? `${tr(what)} (${pkg})` : tr(what),
      type: args ? 'function' : /^[A-Za-z]+$/.test(name) && what.length < 24 ? 'constant' : 'keyword',
      boost: COMMON.has(name) ? 10 : 0,
      apply: args ? snippet(tpl(`\\${call}${args}`)) : `\\${call}`,
    });
  }
  baseCache = { key, list };
  return list;
}

/** Commands, after a backslash. */
export function commandSource(defs: () => DocDefs) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\\[A-Za-z@]*$/);
    if (!m || inComment(ctx)) return null;
    // An escaped backslash (\\) is a line break, not a command.
    if (m.from > 0 && ctx.state.sliceDoc(m.from - 1, m.from) === '\\') return null;
    const d = defs();
    const own: Completion[] = d.commands.map((c) => ({
      label: c.name,
      detail: c.args ? '{…}'.repeat(c.args) : undefined,
      info: `${tr('Defined in')} ${c.file}${c.def ? `: ${c.def}` : ''}`,
      type: 'variable',
      boost: 5,
      apply: c.args ? snippet(tpl(`${c.name}${'{${}}'.repeat(c.args)}`)) : c.name,
    }));
    const names = new Set(own.map((o) => o.label));
    return { from: m.from, options: [...own, ...baseCommands(d.packages).filter((o) => !names.has(o.label))], validFor: /^\\[A-Za-z@]*$/ };
  };
}

/** An environment put in whole: \begin{name}…\end{name}, the cursor at its first place to fill. */
function envApply(name: string, body: string) {
  return (view: EditorView, completion: Completion, from: number, to: number) => {
    const doc = view.state.doc;
    const lead = view.state.sliceDoc(Math.max(0, from - 7), from);
    const start = lead === '\\begin{' ? from - 7 : from;
    // The } closing brackets put after the name goes too.
    const end = doc.sliceString(to, to + 1) === '}' ? to + 1 : to;
    snippet(tpl(`\\begin{${name}}${body}\n\\end{${name}}`))(view, completion, start, end);
  };
}

/** Environments, after \begin{. */
export function environmentSource(defs: () => DocDefs) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\\begin\s*\{[A-Za-z@*]*$/);
    if (!m || inComment(ctx)) return null;
    const from = m.from + m.text.indexOf('{') + 1;
    const d = defs();
    const options: Completion[] = [];
    const seen = new Set<string>();
    for (const e of d.environments) {
      seen.add(e.name);
      options.push({ label: e.name, detail: e.title, info: `${tr('Defined in')} ${e.file}`, type: 'class', boost: 5, apply: envApply(e.name, `${'{${}}'.repeat(e.args)}\n\t\${}`) });
    }
    for (const [name, body, what, pkg] of ENVIRONMENTS) {
      if (seen.has(name) || (pkg && pkg !== 'amsmath' && !d.packages.has(pkg))) continue;
      options.push({ label: name, info: pkg ? `${tr(what)} (${pkg})` : tr(what), type: 'class', boost: ['itemize', 'enumerate', 'figure', 'table', 'equation', 'align'].includes(name) ? 10 : 0, apply: envApply(name, body) });
    }
    return { from, options, validFor: /^[A-Za-z@*]*$/ };
  };
}

/** Packages after \usepackage{, classes after \documentclass{: those this TeX lacks said so, and offered last. */
export function packageSource(installed: () => Set<string> | null) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\\(usepackage|RequirePackage|documentclass)\s*(\[[^\]\n]*\])?\s*\{[^{}\n]*$/);
    if (!m || inComment(ctx)) return null;
    const arg = /\{([^{}]*)$/.exec(m.text)![1];
    const cut = arg.lastIndexOf(',') + 1;
    const from = m.to - arg.length + cut + (/^\s*/.exec(arg.slice(cut))?.[0].length ?? 0);
    const have = installed();
    const cls = m.text.startsWith('\\documentclass');
    const list = cls ? TEX_CLASSES : TEX_PACKAGES;
    const options: Completion[] = list.map(([name, what]) => {
      const missing = !!have && !have.has(`${name}.${cls ? 'cls' : 'sty'}`) && !['article', 'report', 'book', 'letter'].includes(name);
      return { label: name, info: tr(what), detail: missing ? tr('not on this computer') : undefined, type: cls ? 'class' : 'namespace', boost: missing ? -20 : 0 };
    });
    return { from, options, validFor: /^[A-Za-z0-9@-]*$/ };
  };
}
