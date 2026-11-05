// Maths between LaTeX (as documents keep it) and Word's own equations (OMML, as .docx files hold them): fractions,
// raised and lowered parts, roots, sums, products and integrals with their limits, brackets that grow, accents, bars,
// matrices, functions' names, Greek letters, operators and arrows. ommlOf writes LaTeX as OMML, or says it cannot
// (a command it does not know), so the Word file can show the LaTeX itself instead; texOfOmml reads OMML back.
import { att, isEl, kid, kids, type El } from '../documents/xml.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Commands that are one character. */
const SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  pm: '±',
  mp: '∓',
  times: '×',
  div: '÷',
  cdot: '⋅',
  ast: '∗',
  star: '⋆',
  circ: '∘',
  bullet: '∙',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  emptyset: '∅',
  varnothing: '∅',
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  supset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  setminus: '∖',
  wedge: '∧',
  land: '∧',
  vee: '∨',
  lor: '∨',
  neg: '¬',
  lnot: '¬',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  gets: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  implies: '⟹',
  iff: '⟺',
  mapsto: '↦',
  uparrow: '↑',
  downarrow: '↓',
  ldots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
  dots: '…',
  prime: '′',
  angle: '∠',
  perp: '⊥',
  parallel: '∥',
  mid: '∣',
  hbar: 'ℏ',
  ell: 'ℓ',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  degree: '°',
  triangle: '△',
  square: '□',
  langle: '⟨',
  rangle: '⟩',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',
  vert: '|',
  Vert: '‖',
  lbrace: '{',
  rbrace: '}',
  oplus: '⊕',
  otimes: '⊗',
  odot: '⊙',
  therefore: '∴',
  because: '∵',
  '{': '{',
  '}': '}',
  '%': '%',
  $: '$',
  '&': '&',
  '#': '#',
  _: '_',
  '|': '‖',
};

/** Spaces between things. */
const SPACES: Record<string, string> = { ',': ' ', ':': ' ', ';': ' ', '!': '', quad: ' ', qquad: '  ', ' ': ' ', enspace: ' ' };

/** Big operators, and whether their limits sit under and over them (else beside). */
const NARY: Record<string, { chr: string; under: boolean }> = {
  sum: { chr: '∑', under: true },
  prod: { chr: '∏', under: true },
  coprod: { chr: '∐', under: true },
  bigcup: { chr: '⋃', under: true },
  bigcap: { chr: '⋂', under: true },
  int: { chr: '∫', under: false },
  iint: { chr: '∬', under: false },
  iiint: { chr: '∭', under: false },
  oint: { chr: '∮', under: false },
  bigoplus: { chr: '⨁', under: true },
  bigotimes: { chr: '⨂', under: true },
};

const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'det', 'dim', 'ker', 'deg', 'gcd', 'max', 'min', 'sup', 'inf', 'lim', 'arg', 'Pr', 'mod']);

const ACCENTS: Record<string, string> = { hat: '̂', widehat: '̂', bar: '̅', vec: '⃗', dot: '̇', ddot: '̈', tilde: '̃', widetilde: '̃', check: '̌', breve: '̆', acute: '́', grave: '̀' };

const MATRICES: Record<string, [string, string]> = {
  matrix: ['', ''],
  pmatrix: ['(', ')'],
  bmatrix: ['[', ']'],
  Bmatrix: ['{', '}'],
  vmatrix: ['|', '|'],
  Vmatrix: ['‖', '‖'],
  cases: ['{', ''],
  array: ['', ''],
  aligned: ['', ''],
  align: ['', ''],
  'align*': ['', ''],
  gathered: ['', ''],
  split: ['', ''],
};

const DOUBLE: Record<string, string> = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' };

type Row = Node[];
type Node =
  | { t: 'r'; s: string; up?: boolean; bold?: boolean; text?: boolean }
  | { t: 'f'; num: Row; den: Row }
  | { t: 'rad'; deg: Row | null; e: Row }
  | { t: 'scr'; base: Row; sub: Row | null; sup: Row | null }
  | { t: 'nary'; chr: string; under: boolean; sub: Row | null; sup: Row | null; e: Row }
  | { t: 'd'; open: string; close: string; e: Row }
  | { t: 'acc'; chr: string; e: Row }
  | { t: 'bar'; top: boolean; e: Row }
  | { t: 'm'; open: string; close: string; rows: Row[][] };

class Unknown extends Error {}

/** LaTeX read into what OMML can say; throws Unknown at what it cannot. */
function parse(tex: string): Row {
  const toks = tex.match(/\\[A-Za-z]+\*?|\\[^A-Za-z]|[{}^_&]|\s+|[^\\{}^_&\s]/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const skipSpace = () => {
    while (i < toks.length && /^\s+$/.test(toks[i])) i++;
  };
  /** One argument: a group in braces, or one thing. */
  const arg = (): Row => {
    skipSpace();
    const t = toks[i];
    if (t === undefined) return [];
    if (t === '{') {
      i++;
      const r = row('}');
      i++;
      return r;
    }
    i++;
    return atom(t) ?? [];
  };
  /** Words in braces as they are (\text{…}). */
  const rawArg = (): string => {
    skipSpace();
    if (toks[i] !== '{') return toks[i++] ?? '';
    let depth = 0;
    let s = '';
    for (; i < toks.length; i++) {
      const t = toks[i];
      if (t === '{' && depth++ === 0) continue;
      if (t === '}' && --depth === 0) {
        i++;
        break;
      }
      s += t.startsWith('\\') && t.length === 2 ? t[1] : t;
    }
    return s;
  };
  const optArg = (): Row | null => {
    skipSpace();
    if (toks[i] !== '[') return null;
    i++;
    const r = row(']');
    i++;
    return r;
  };
  const delimOf = (t: string | undefined): string => {
    if (t === undefined) return '';
    if (t === '.') return '';
    if (t.startsWith('\\')) {
      const s = SYMBOLS[t.slice(1)];
      if (s === undefined) throw new Unknown(t);
      return s;
    }
    return t;
  };
  const atom = (t: string): Row | null => {
    if (/^\s+$/.test(t)) return [];
    if (!t.startsWith('\\')) {
      if (t === '}' || t === '&') throw new Unknown(t);
      return [{ t: 'r', s: t === "'" ? '′' : t }];
    }
    const name = t.slice(1);
    if (name in SPACES) return SPACES[name] ? [{ t: 'r', s: SPACES[name], up: true }] : [];
    if (name === '\\') throw new Unknown(t);
    if (name in SYMBOLS) return [{ t: 'r', s: SYMBOLS[name] }];
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') return [{ t: 'f', num: arg(), den: arg() }];
    if (name === 'sqrt') {
      const deg = optArg();
      return [{ t: 'rad', deg, e: arg() }];
    }
    if (name in NARY) return [{ t: 'nary', ...NARY[name], sub: null, sup: null, e: [] }];
    if (FUNCS.has(name)) return [{ t: 'r', s: name, up: true }];
    if (name === 'operatorname') return [{ t: 'r', s: rawArg(), up: true }];
    if (name === 'text' || name === 'textrm' || name === 'mbox') return [{ t: 'r', s: rawArg(), text: true }];
    if (name === 'mathrm') return [{ t: 'r', s: rawArg(), up: true }];
    if (name === 'mathbf' || name === 'boldsymbol' || name === 'textbf') return [{ t: 'r', s: rawArg(), bold: true, up: name !== 'boldsymbol' }];
    if (name === 'mathit' || name === 'textit') return [{ t: 'r', s: rawArg() }];
    if (name === 'mathbb') return [{ t: 'r', s: [...rawArg()].map((c) => DOUBLE[c] ?? c).join('') }];
    if (name in ACCENTS) return [{ t: 'acc', chr: ACCENTS[name], e: arg() }];
    if (name === 'overline') return [{ t: 'bar', top: true, e: arg() }];
    if (name === 'underline') return [{ t: 'bar', top: false, e: arg() }];
    if (name === 'left') {
      skipSpace();
      const open = delimOf(toks[i++]);
      const e = row('\\right');
      i++;
      skipSpace();
      const close = delimOf(toks[i++]);
      return [{ t: 'd', open, close, e }];
    }
    if (name === 'big' || name === 'Big' || name === 'bigg' || name === 'Bigg' || name === 'bigl' || name === 'bigr' || name === 'Bigl' || name === 'Bigr') {
      skipSpace();
      return [{ t: 'r', s: delimOf(toks[i++]) }];
    }
    if (name === 'begin') {
      const env = rawArg();
      const fence = MATRICES[env];
      if (!fence) throw new Unknown(env);
      if (env === 'array') rawArg();
      const rows: Row[][] = [[[]]];
      for (; i < toks.length;) {
        const x = toks[i];
        if (x === '\\end') {
          i++;
          rawArg();
          break;
        }
        if (x === '&') {
          rows[rows.length - 1].push([]);
          i++;
          continue;
        }
        if (x === '\\\\') {
          rows.push([[]]);
          i++;
          continue;
        }
        const cells = rows[rows.length - 1];
        cells[cells.length - 1].push(...one());
      }
      const kept = rows.filter((r) => r.some((c) => c.length));
      return [{ t: 'm', open: fence[0], close: fence[1], rows: kept.length ? kept : [[[]]] }];
    }
    throw new Unknown(t);
  };
  /** One thing and the parts raised and lowered on it. */
  const one = (): Row => {
    const t = toks[i++];
    let base: Row =
      t === '{'
        ? (() => {
            const r = row('}');
            i++;
            return r;
          })()
        : (atom(t) ?? []);
    for (;;) {
      const save = i;
      skipSpace();
      const s = toks[i];
      if (s !== '^' && s !== '_') {
        i = save;
        break;
      }
      i++;
      const part = arg();
      const last = base[base.length - 1];
      if (base.length === 1 && last && last.t === 'nary') {
        if (s === '^') last.sup = part;
        else last.sub = part;
        continue;
      }
      if (base.length === 1 && last && last.t === 'scr' && (s === '^' ? !last.sup : !last.sub)) {
        if (s === '^') last.sup = part;
        else last.sub = part;
        continue;
      }
      base = [{ t: 'scr', base, sub: s === '_' ? part : null, sup: s === '^' ? part : null }];
    }
    return base;
  };
  const row = (end?: string): Row => {
    const out: Row = [];
    while (i < toks.length && peek() !== end) {
      if (end === undefined && (peek() === '}' || peek() === '&' || peek() === '\\\\')) throw new Unknown(peek());
      if (peek() === '\\right' || peek() === '\\end') {
        if (end) break;
        throw new Unknown(peek());
      }
      if (/^\s+$/.test(peek())) {
        i++;
        continue;
      }
      out.push(...one());
    }
    if (end && peek() !== end) throw new Unknown(`missing ${end}`);
    return out;
  };
  const r = row();
  // A big operator applies to what comes after it.
  const fold = (list: Row): Row => {
    const out: Row = [];
    for (let k = 0; k < list.length; k++) {
      const n = list[k];
      if (n.t === 'nary' && !n.e.length && k + 1 < list.length) {
        out.push({ ...n, e: fold(list.slice(k + 1)) });
        break;
      }
      out.push(n);
    }
    return out;
  };
  return fold(r);
}

function rowXml(r: Row): string {
  return r.map(nodeXml).join('');
}

const e = (r: Row | null) => `<m:e>${r ? rowXml(r) : ''}</m:e>`;

function nodeXml(n: Node): string {
  switch (n.t) {
    case 'r': {
      const sty = n.text ? '<m:nor/>' : n.bold ? `<m:sty m:val="${n.up ? 'b' : 'bi'}"/>` : n.up ? '<m:sty m:val="p"/>' : '';
      return `<m:r>${sty ? `<m:rPr>${sty}</m:rPr>` : ''}<m:t xml:space="preserve">${esc(n.s)}</m:t></m:r>`;
    }
    case 'f':
      return `<m:f><m:num>${rowXml(n.num)}</m:num><m:den>${rowXml(n.den)}</m:den></m:f>`;
    case 'rad':
      return `<m:rad>${n.deg ? '' : '<m:radPr><m:degHide m:val="1"/></m:radPr>'}<m:deg>${n.deg ? rowXml(n.deg) : ''}</m:deg>${e(n.e)}</m:rad>`;
    case 'scr':
      if (n.sub && n.sup) return `<m:sSubSup>${e(n.base)}<m:sub>${rowXml(n.sub)}</m:sub><m:sup>${rowXml(n.sup)}</m:sup></m:sSubSup>`;
      if (n.sup) return `<m:sSup>${e(n.base)}<m:sup>${rowXml(n.sup)}</m:sup></m:sSup>`;
      return `<m:sSub>${e(n.base)}<m:sub>${rowXml(n.sub ?? [])}</m:sub></m:sSub>`;
    case 'nary':
      return (
        `<m:nary><m:naryPr><m:chr m:val="${n.chr}"/><m:limLoc m:val="${n.under ? 'undOvr' : 'subSup'}"/>${n.sub ? '' : '<m:subHide m:val="1"/>'}${n.sup ? '' : '<m:supHide m:val="1"/>'}</m:naryPr>` +
        `<m:sub>${n.sub ? rowXml(n.sub) : ''}</m:sub><m:sup>${n.sup ? rowXml(n.sup) : ''}</m:sup>${e(n.e)}</m:nary>`
      );
    case 'd':
      return `<m:d><m:dPr><m:begChr m:val="${esc(n.open)}"/><m:endChr m:val="${esc(n.close)}"/></m:dPr>${e(n.e)}</m:d>`;
    case 'acc':
      return `<m:acc><m:accPr><m:chr m:val="${n.chr}"/></m:accPr>${e(n.e)}</m:acc>`;
    case 'bar':
      return `<m:bar><m:barPr><m:pos m:val="${n.top ? 'top' : 'bot'}"/></m:barPr>${e(n.e)}</m:bar>`;
    case 'm': {
      const cols = Math.max(1, ...n.rows.map((r) => r.length));
      const m = `<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${cols}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>${n.rows
        .map((r) => `<m:mr>${Array.from({ length: cols }, (_, k) => e(r[k] ?? [])).join('')}</m:mr>`)
        .join('')}</m:m>`;
      return n.open || n.close ? `<m:d><m:dPr><m:begChr m:val="${esc(n.open)}"/><m:endChr m:val="${esc(n.close)}"/></m:dPr><m:e>${m}</m:e></m:d>` : m;
    }
  }
}

/** LaTeX as an OMML equation (<m:oMath>…</m:oMath>), or null when it says what this cannot write. */
export function ommlOf(tex: string): string | null {
  try {
    return `<m:oMath>${rowXml(parse(tex))}</m:oMath>`;
  } catch (err) {
    if (err instanceof Unknown) return null;
    throw err;
  }
}

// ---- back from Word ----------------------------------------------------------------------------------------------

const BACK: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOLS)
    .filter(([k, v]) => /^[A-Za-z]+$/.test(k) && !/^[A-Za-z0-9]$/.test(v) && !['le', 'ge', 'ne', 'gets', 'to', 'land', 'lor', 'lnot', 'dots', 'varnothing', 'implies', 'iff', 'lbrace', 'rbrace', 'vert', 'Vert', 'mid'].includes(k))
    .map(([k, v]) => [v, `\\${k} `]),
);
const NARY_BACK: Record<string, string> = Object.fromEntries(Object.entries(NARY).map(([k, v]) => [v.chr, `\\${k}`]));
const ACC_BACK: Record<string, string> = Object.fromEntries(
  Object.entries(ACCENTS)
    .filter(([k]) => !k.startsWith('wide'))
    .map(([k, v]) => [v, `\\${k}`]),
);
const DELIM_BACK: Record<string, string> = { '{': '\\{', '}': '\\}', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '⌈': '\\lceil', '⌉': '\\rceil', '⌊': '\\lfloor', '⌋': '\\rfloor', '': '.' };

const grp = (s: string) => (s.length === 1 ? s : `{${s}}`);
const valOf = (el: El | undefined, name: string) => att(kid(el, name), 'val');

function texOfKids(el: El | undefined): string {
  return el ? el.c.map((x) => (isEl(x) ? texOf(x) : '')).join('') : '';
}

function texOf(el: El): string {
  switch (el.n) {
    case 'r': {
      const t = kids(el, 't')
        .map((x) => x.c.map((y) => (typeof y === 'string' ? y : '')).join(''))
        .join('');
      const pr = kid(el, 'rPr');
      if (kid(pr, 'nor')) return `\\text{${t.replace(/[{}\\]/g, '')}}`;
      const sty = valOf(pr, 'sty');
      const plain = [...t].map((c) => BACK[c] ?? c).join('');
      if (sty === 'p' && /^[A-Za-z]{2,}$/.test(t)) return FUNCS.has(t) ? `\\${t} ` : `\\mathrm{${t}}`;
      if (sty === 'b' || sty === 'bi') return `\\mathbf{${plain}}`;
      return plain;
    }
    case 'f':
      return `\\frac{${texOfKids(kid(el, 'num'))}}{${texOfKids(kid(el, 'den'))}}`;
    case 'sSup':
      return `${grp(texOfKids(kid(el, 'e')))}^${grp(texOfKids(kid(el, 'sup')))}`;
    case 'sSub':
      return `${grp(texOfKids(kid(el, 'e')))}_${grp(texOfKids(kid(el, 'sub')))}`;
    case 'sSubSup':
      return `${grp(texOfKids(kid(el, 'e')))}_${grp(texOfKids(kid(el, 'sub')))}^${grp(texOfKids(kid(el, 'sup')))}`;
    case 'sPre':
      return `{}_${grp(texOfKids(kid(el, 'sub')))}^${grp(texOfKids(kid(el, 'sup')))}${texOfKids(kid(el, 'e'))}`;
    case 'rad': {
      const deg = texOfKids(kid(el, 'deg'));
      return `\\sqrt${deg ? `[${deg}]` : ''}{${texOfKids(kid(el, 'e'))}}`;
    }
    case 'nary': {
      const pr = kid(el, 'naryPr');
      const chr = valOf(pr, 'chr') ?? '∫';
      const sub = texOfKids(kid(el, 'sub'));
      const sup = texOfKids(kid(el, 'sup'));
      return `${NARY_BACK[chr] ?? chr}${sub ? `_${grp(sub)}` : ''}${sup ? `^${grp(sup)}` : ''} ${texOfKids(kid(el, 'e'))}`;
    }
    case 'd': {
      const pr = kid(el, 'dPr');
      const open = valOf(pr, 'begChr') ?? '(';
      const close = valOf(pr, 'endChr') ?? ')';
      const sep = valOf(pr, 'sepChr') ?? '|';
      const inner = kids(el, 'e')
        .map(texOfKids)
        .join(sep === '|' ? ' \\mid ' : sep);
      return `\\left${DELIM_BACK[open] ?? open}${inner}\\right${DELIM_BACK[close] ?? close}`;
    }
    case 'func':
      return `${texOfKids(kid(el, 'fName'))}${texOfKids(kid(el, 'e'))}`;
    case 'acc': {
      const chr = valOf(kid(el, 'accPr'), 'chr') ?? '̂';
      return `${ACC_BACK[chr] ?? '\\hat'}{${texOfKids(kid(el, 'e'))}}`;
    }
    case 'bar':
      return `${valOf(kid(el, 'barPr'), 'pos') === 'bot' ? '\\underline' : '\\overline'}{${texOfKids(kid(el, 'e'))}}`;
    case 'groupChr':
    case 'box':
    case 'borderBox':
    case 'phant':
      return texOfKids(kid(el, 'e'));
    case 'limLow':
      return `${texOfKids(kid(el, 'e'))}_{${texOfKids(kid(el, 'lim'))}}`;
    case 'limUpp':
      return `${texOfKids(kid(el, 'e'))}^{${texOfKids(kid(el, 'lim'))}}`;
    case 'm':
      return `\\begin{matrix}${kids(el, 'mr')
        .map((r) => kids(r, 'e').map(texOfKids).join(' & '))
        .join(' \\\\ ')}\\end{matrix}`;
    case 'eqArr':
      return `\\begin{aligned}${kids(el, 'e').map(texOfKids).join(' \\\\ ')}\\end{aligned}`;
    case 'oMath':
    case 'e':
    case 'num':
    case 'den':
      return texOfKids(el);
    default:
      return '';
  }
}

/** An OMML equation (m:oMath, or m:oMathPara holding them) read back as LaTeX. */
export function texOfOmml(el: El): string {
  const maths = el.n === 'oMathPara' ? kids(el, 'oMath') : [el];
  return maths
    .map((m) => texOfKids(m))
    .join(' \\\\ ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([}_^])/g, '$1')
    .trim();
}
