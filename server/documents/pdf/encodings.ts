// What the character codes of a PDF's simple fonts mean: the standard encodings (WinAnsi, MacRoman, Standard,
// Symbol, ZapfDingbats) and glyph names read as Unicode ("Aacute", "uni03B1", "f_f_i", "alphatonos", "afii10017").
// Names of letters with marks are put together from the letter and the mark (Unicode composes them), so the table
// below holds only the names that cannot be: punctuation, symbols, ligatures, letters of their own.

const WIN = new TextDecoder('windows-1252');
const MAC = new TextDecoder('macintosh');

const decodeByte = (dec: TextDecoder, c: number) => dec.decode(Uint8Array.of(c));

/** Code → text for a base encoding. */
export function baseEncoding(name: string): (string | undefined)[] {
  const out: (string | undefined)[] = new Array(256).fill(undefined);
  if (name === 'WinAnsiEncoding' || name === 'PDFDocEncoding') {
    for (let c = 32; c < 256; c++) out[c] = decodeByte(WIN, c);
    out[127] = undefined;
    // WinAnsi's unused codes show a bullet.
    for (const c of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) out[c] = '•';
    out[0xa0] = ' ';
    out[0xad] = '-';
  } else if (name === 'MacRomanEncoding') {
    for (let c = 32; c < 256; c++) out[c] = decodeByte(MAC, c);
    out[127] = undefined;
  } else if (name === 'Symbol') {
    for (let c = 32; c < 127; c++) out[c] = String.fromCharCode(c);
    for (const [c, u] of Object.entries(SYMBOL)) out[Number(c)] = u;
  } else if (name === 'ZapfDingbats') {
    for (const [c, u] of Object.entries(DINGBATS)) out[Number(c)] = u;
  } else {
    // StandardEncoding: ASCII with curly quotes, and its own upper half.
    for (let c = 32; c < 127; c++) out[c] = String.fromCharCode(c);
    out[0x27] = '’';
    out[0x60] = '‘';
    for (const [c, u] of Object.entries(STANDARD_HIGH)) out[Number(c)] = u;
  }
  return out;
}

const STANDARD_HIGH: Record<number, string> = {
  0xa1: '¡',
  0xa2: '¢',
  0xa3: '£',
  0xa4: '⁄',
  0xa5: '¥',
  0xa6: 'ƒ',
  0xa7: '§',
  0xa8: '¤',
  0xa9: "'",
  0xaa: '“',
  0xab: '«',
  0xac: '‹',
  0xad: '›',
  0xae: 'ﬁ',
  0xaf: 'ﬂ',
  0xb1: '–',
  0xb2: '†',
  0xb3: '‡',
  0xb4: '·',
  0xb6: '¶',
  0xb7: '•',
  0xb8: '‚',
  0xb9: '„',
  0xba: '”',
  0xbb: '»',
  0xbc: '…',
  0xbd: '‰',
  0xbf: '¿',
  0xc1: '`',
  0xc2: '´',
  0xc3: 'ˆ',
  0xc4: '˜',
  0xc5: '¯',
  0xc6: '˘',
  0xc7: '˙',
  0xc8: '¨',
  0xca: '˚',
  0xcb: '¸',
  0xcd: '˝',
  0xce: '˛',
  0xcf: 'ˇ',
  0xd0: '—',
  0xe1: 'Æ',
  0xe3: 'ª',
  0xe8: 'Ł',
  0xe9: 'Ø',
  0xea: 'Œ',
  0xeb: 'º',
  0xf1: 'æ',
  0xf5: 'ı',
  0xf8: 'ł',
  0xf9: 'ø',
  0xfa: 'œ',
  0xfb: 'ß',
};

// The Symbol font: Greek letters on the Latin keys, and mathematical signs.
const SYMBOL: Record<number, string> = {
  0x22: '∀',
  0x24: '∃',
  0x27: '∋',
  0x2a: '∗',
  0x2d: '−',
  0x40: '≅',
  0x5c: '∴',
  0x5e: '⊥',
  0x60: '‾',
  0x41: 'Α',
  0x42: 'Β',
  0x43: 'Χ',
  0x44: 'Δ',
  0x45: 'Ε',
  0x46: 'Φ',
  0x47: 'Γ',
  0x48: 'Η',
  0x49: 'Ι',
  0x4a: 'ϑ',
  0x4b: 'Κ',
  0x4c: 'Λ',
  0x4d: 'Μ',
  0x4e: 'Ν',
  0x4f: 'Ο',
  0x50: 'Π',
  0x51: 'Θ',
  0x52: 'Ρ',
  0x53: 'Σ',
  0x54: 'Τ',
  0x55: 'Υ',
  0x56: 'ς',
  0x57: 'Ω',
  0x58: 'Ξ',
  0x59: 'Ψ',
  0x5a: 'Ζ',
  0x61: 'α',
  0x62: 'β',
  0x63: 'χ',
  0x64: 'δ',
  0x65: 'ε',
  0x66: 'φ',
  0x67: 'γ',
  0x68: 'η',
  0x69: 'ι',
  0x6a: 'ϕ',
  0x6b: 'κ',
  0x6c: 'λ',
  0x6d: 'μ',
  0x6e: 'ν',
  0x6f: 'ο',
  0x70: 'π',
  0x71: 'θ',
  0x72: 'ρ',
  0x73: 'σ',
  0x74: 'τ',
  0x75: 'υ',
  0x76: 'ϖ',
  0x77: 'ω',
  0x78: 'ξ',
  0x79: 'ψ',
  0x7a: 'ζ',
  0x7e: '∼',
  0xa0: '€',
  0xa1: 'ϒ',
  0xa2: '′',
  0xa3: '≤',
  0xa4: '⁄',
  0xa5: '∞',
  0xa6: 'ƒ',
  0xa7: '♣',
  0xa8: '♦',
  0xa9: '♥',
  0xaa: '♠',
  0xab: '↔',
  0xac: '←',
  0xad: '↑',
  0xae: '→',
  0xaf: '↓',
  0xb0: '°',
  0xb1: '±',
  0xb2: '″',
  0xb3: '≥',
  0xb4: '×',
  0xb5: '∝',
  0xb6: '∂',
  0xb7: '•',
  0xb8: '÷',
  0xb9: '≠',
  0xba: '≡',
  0xbb: '≈',
  0xbc: '…',
  0xbf: '↵',
  0xc0: 'ℵ',
  0xc1: 'ℑ',
  0xc2: 'ℜ',
  0xc3: '℘',
  0xc4: '⊗',
  0xc5: '⊕',
  0xc6: '∅',
  0xc7: '∩',
  0xc8: '∪',
  0xc9: '⊃',
  0xca: '⊇',
  0xcb: '⊄',
  0xcc: '⊂',
  0xcd: '⊆',
  0xce: '∈',
  0xcf: '∉',
  0xd0: '∠',
  0xd1: '∇',
  0xd2: '®',
  0xd3: '©',
  0xd4: '™',
  0xd5: '∏',
  0xd6: '√',
  0xd7: '⋅',
  0xd8: '¬',
  0xd9: '∧',
  0xda: '∨',
  0xdb: '⇔',
  0xdc: '⇐',
  0xdd: '⇑',
  0xde: '⇒',
  0xdf: '⇓',
  0xe0: '◊',
  0xe1: '〈',
  0xe5: '∑',
  0xf1: '〉',
  0xf2: '∫',
};

// ZapfDingbats: what form fields' ticks, crosses and dots are drawn with.
const DINGBATS: Record<number, string> = {
  0x20: ' ',
  0x21: '✁',
  0x33: '✓',
  0x34: '✔',
  0x35: '✕',
  0x36: '✖',
  0x37: '✗',
  0x38: '✘',
  0x48: '★',
  0x49: '✩',
  0x6c: '●',
  0x6d: '❍',
  0x6e: '■',
  0x6f: '❏',
  0x70: '❐',
  0x71: '❑',
  0x72: '❒',
  0x73: '▲',
  0x74: '▼',
  0x75: '◆',
  0x76: '❖',
  0xa8: '♣',
  0xa9: '♦',
  0xaa: '♥',
  0xab: '♠',
};

// Names that are not a letter with marks.
const NAMES: Record<string, string> = {
  space: ' ',
  exclam: '!',
  quotedbl: '"',
  numbersign: '#',
  dollar: '$',
  percent: '%',
  ampersand: '&',
  quotesingle: "'",
  quoteright: '’',
  parenleft: '(',
  parenright: ')',
  asterisk: '*',
  plus: '+',
  comma: ',',
  hyphen: '-',
  period: '.',
  slash: '/',
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  colon: ':',
  semicolon: ';',
  less: '<',
  equal: '=',
  greater: '>',
  question: '?',
  at: '@',
  bracketleft: '[',
  backslash: '\\',
  bracketright: ']',
  asciicircum: '^',
  underscore: '_',
  grave: '`',
  quoteleft: '‘',
  braceleft: '{',
  bar: '|',
  braceright: '}',
  asciitilde: '~',
  exclamdown: '¡',
  cent: '¢',
  sterling: '£',
  currency: '¤',
  yen: '¥',
  brokenbar: '¦',
  section: '§',
  dieresis: '¨',
  copyright: '©',
  ordfeminine: 'ª',
  guillemotleft: '«',
  guillemetleft: '«',
  logicalnot: '¬',
  sfthyphen: '-',
  softhyphen: '-',
  registered: '®',
  macron: '¯',
  degree: '°',
  plusminus: '±',
  twosuperior: '²',
  threesuperior: '³',
  acute: '´',
  mu: 'µ',
  mu1: 'µ',
  paragraph: '¶',
  periodcentered: '·',
  middot: '·',
  cedilla: '¸',
  onesuperior: '¹',
  ordmasculine: 'º',
  guillemotright: '»',
  guillemetright: '»',
  onequarter: '¼',
  onehalf: '½',
  threequarters: '¾',
  questiondown: '¿',
  AE: 'Æ',
  ae: 'æ',
  Eth: 'Ð',
  eth: 'ð',
  multiply: '×',
  divide: '÷',
  Oslash: 'Ø',
  oslash: 'ø',
  Thorn: 'Þ',
  thorn: 'þ',
  germandbls: 'ß',
  OE: 'Œ',
  oe: 'œ',
  Lslash: 'Ł',
  lslash: 'ł',
  dotlessi: 'ı',
  dotlessj: 'ȷ',
  Dcroat: 'Đ',
  dcroat: 'đ',
  Dslash: 'Đ',
  dmacron: 'đ',
  Eng: 'Ŋ',
  eng: 'ŋ',
  IJ: 'Ĳ',
  ij: 'ĳ',
  kgreenlandic: 'ĸ',
  napostrophe: 'ŉ',
  Hbar: 'Ħ',
  hbar: 'ħ',
  Tbar: 'Ŧ',
  tbar: 'ŧ',
  Ldot: 'Ŀ',
  ldot: 'ŀ',
  longs: 'ſ',
  florin: 'ƒ',
  circumflex: 'ˆ',
  caron: 'ˇ',
  breve: '˘',
  dotaccent: '˙',
  ring: '˚',
  ogonek: '˛',
  tilde: '˜',
  hungarumlaut: '˝',
  endash: '–',
  emdash: '—',
  figuredash: '‒',
  quotesinglbase: '‚',
  quotedblleft: '“',
  quotedblright: '”',
  quotedblbase: '„',
  dagger: '†',
  daggerdbl: '‡',
  bullet: '•',
  ellipsis: '…',
  perthousand: '‰',
  guilsinglleft: '‹',
  guilsinglright: '›',
  fraction: '⁄',
  Euro: '€',
  euro: '€',
  trademark: '™',
  minus: '−',
  fi: 'ﬁ',
  fl: 'ﬂ',
  ff: 'ff',
  ffi: 'ffi',
  ffl: 'ffl',
  nbspace: ' ',
  nonbreakingspace: ' ',
  arrowleft: '←',
  arrowup: '↑',
  arrowright: '→',
  arrowdown: '↓',
  arrowboth: '↔',
  checkmark: '✓',
  infinity: '∞',
  lessequal: '≤',
  greaterequal: '≥',
  notequal: '≠',
  approxequal: '≈',
  partialdiff: '∂',
  summation: '∑',
  product: '∏',
  radical: '√',
  integral: '∫',
  lozenge: '◊',
  Omega: 'Ω',
  Delta: 'Δ',
  estimated: '℮',
  numero: '№',
  afii61352: '№',
  compwordmark: '',
  visiblespace: '␣',
  quotedbl1: '"',
  angleleft: '〈',
  angleright: '〉',
  degreecentigrade: '℃',
  cwm: '',
  perthousandzero: '',
  dotlessi1: 'ı',
};

// Letters, Greek ones by their English names.
const GREEK: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  sigma1: 'ς',
  sigmafinal: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  theta1: 'ϑ',
  phi1: 'ϕ',
  omega1: 'ϖ',
  Upsilon1: 'ϒ',
};

// Marks a letter's name may end with, longest first so "dieresistonos" is read before "tonos".
const MARKS: [string, string][] = [
  ['dieresistonos', '̈́'],
  ['hungarumlaut', '̋'],
  ['commaaccent', '̦'],
  ['circumflex', '̂'],
  ['dotaccent', '̇'],
  ['dieresis', '̈'],
  ['cedilla', '̧'],
  ['macron', '̄'],
  ['ogonek', '̨'],
  ['acute', '́'],
  ['grave', '̀'],
  ['tilde', '̃'],
  ['breve', '̆'],
  ['caron', '̌'],
  ['tonos', '́'],
  ['ring', '̊'],
  ['dotbelow', '̣'],
];

/** A letter by its name: a Latin letter, a Greek one ("Alpha", "omega"), or a name in the table. */
function letter(n: string): string | undefined {
  if (/^[A-Za-z]$/.test(n)) return n;
  if (NAMES[n] !== undefined && n.length > 1) return NAMES[n];
  const g = GREEK[n] ?? (GREEK[n[0].toLowerCase() + n.slice(1)] ? GREEK[n[0].toLowerCase() + n.slice(1)].toUpperCase() : undefined);
  return g;
}

const cache = new Map<string, string | undefined>();

/** A glyph name as text (undefined for names that say nothing: "g12", ".notdef"). */
export function glyphText(name: string): string | undefined {
  if (cache.has(name)) return cache.get(name);
  const v = readName(name);
  if (cache.size < 20_000) cache.set(name, v);
  return v;
}

function readName(name: string): string | undefined {
  // "a.sc", "one.oldstyle": the part before the dot; "f_f_i": its parts.
  const base = name.split('.')[0];
  if (!base) return undefined;
  if (base.includes('_')) {
    const parts = base.split('_').map(readName);
    return parts.every((p) => p !== undefined) ? parts.join('') : undefined;
  }
  if (NAMES[base] !== undefined) return NAMES[base];
  let m = /^uni((?:[0-9A-F]{4})+)$/.exec(base);
  if (m) {
    let s = '';
    for (let i = 0; i < m[1].length; i += 4) s += String.fromCharCode(parseInt(m[1].slice(i, i + 4), 16));
    return s;
  }
  m = /^u([0-9A-F]{4,6})$/.exec(base);
  if (m) {
    const cp = parseInt(m[1], 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : undefined;
  }
  // Cyrillic's old names.
  m = /^afii(\d{5})$/.exec(base);
  if (m) return afii(Number(m[1]));
  const l = letter(base);
  if (l !== undefined) return l;
  for (const [mark, comb] of MARKS) {
    if (base.length > mark.length && base.endsWith(mark)) {
      const b = letter(base.slice(0, -mark.length));
      if (b !== undefined) return (b + comb).normalize('NFC');
    }
  }
  // "A.small"-like names were handled above; "Asmall" (small capitals) reads as the letter.
  m = /^([A-Z][a-z]*)small$/.exec(base);
  if (m) return readName(m[1].toLowerCase());
  return undefined;
}

function afii(n: number): string | undefined {
  // А–Я and а–я, with Ё and ё in their old places; a few more letters around them.
  if (n >= 10017 && n <= 10022) return String.fromCharCode(0x410 + n - 10017);
  if (n === 10023) return 'Ё';
  if (n >= 10024 && n <= 10049) return String.fromCharCode(0x416 + n - 10024);
  if (n >= 10065 && n <= 10070) return String.fromCharCode(0x430 + n - 10065);
  if (n === 10071) return 'ё';
  if (n >= 10072 && n <= 10097) return String.fromCharCode(0x436 + n - 10072);
  const more: Record<number, string> = {
    10051: 'Ђ',
    10052: 'Ѓ',
    10053: 'Є',
    10054: 'Ѕ',
    10055: 'І',
    10056: 'Ї',
    10057: 'Ј',
    10058: 'Љ',
    10059: 'Њ',
    10060: 'Ћ',
    10061: 'Ќ',
    10062: 'Ў',
    10099: 'ђ',
    10100: 'ѓ',
    10101: 'є',
    10102: 'ѕ',
    10103: 'і',
    10104: 'ї',
    10105: 'ј',
    10106: 'љ',
    10107: 'њ',
    10108: 'ћ',
    10109: 'ќ',
    10110: 'ў',
    10145: 'Џ',
    10193: 'џ',
    10050: 'Ґ',
    10098: 'ґ',
  };
  return more[n];
}

/** The names of a base encoding's codes are not needed for reading: Differences name glyphs, base encodings map codes. */
export const STANDARD_FONTS: Record<string, string> = {
  // The fourteen fonts every viewer has, under their other names too.
  Helvetica: 'Helvetica',
  Arial: 'Helvetica',
  ArialMT: 'Helvetica',
  'Times-Roman': 'Times',
  TimesNewRoman: 'Times',
  TimesNewRomanPSMT: 'Times',
  Courier: 'Courier',
  CourierNew: 'Courier',
  CourierNewPSMT: 'Courier',
  Symbol: 'Symbol',
  ZapfDingbats: 'ZapfDingbats',
};
