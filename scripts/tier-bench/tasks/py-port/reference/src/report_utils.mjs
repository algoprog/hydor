// Reporting helpers, ported from legacy/report_utils.py. Each function behaves like the Python one, edge cases
// included: floor division, round half to even on the exact binary value, int() parsing, str.title(), textwrap,
// code points, stable sorting, math.fsum, float repr and json.dumps.

const SYMBOLS = new Map([['USD', '$'], ['EUR', '€'], ['GBP', '£'], ['JPY', '¥']]);
const NO_MINOR_UNITS = new Set(['JPY']);

// The characters Python's str.isspace() accepts, which is what split(), strip() and int() treat as white space.
const PY_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
const isPySpace = (ch) => PY_SPACE.has(ch.codePointAt(0));
const isBlank = (s) => [...s].every(isPySpace);

// str.split() with no argument: runs of white space separate the parts, and nothing empty comes out.
function pySplit(text) {
  const parts = [];
  let cur = '';
  for (const ch of text) {
    if (isPySpace(ch)) {
      if (cur) parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

// What int() strips from the ends: the same set, except that the four information separators U+001C to U+001F
// (white space to split() and isspace()) are not accepted there.
const isIntSpace = (ch) => isPySpace(ch) && !(ch >= '\x1c' && ch <= '\x1f');
const intStrip = (text) => {
  const cps = [...text];
  let a = 0;
  let b = cps.length;
  while (a < b && isIntSpace(cps[a])) a++;
  while (b > a && isIntSpace(cps[b - 1])) b--;
  return cps.slice(a, b).join('');
};

// Group the digits of a non-negative integer in threes, as Python's "," format does.
const group = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ',');

// ---------------------------------------------------------------------------------------------- split_amount

export function split_amount(total_cents, parts) {
  if (parts === 0) throw new RangeError('integer division or modulo by zero');
  // Python's divmod floors, and the remainder takes the sign of the divisor.
  const r = ((total_cents % parts) + parts) % parts;
  const q = (total_cents - r) / parts;
  const out = [];
  for (let i = 0; i < parts; i++) out.push(i < r ? q + 1 : q);
  return out;
}

// -------------------------------------------------------------------------------------------------- round_to

// round(float, places) in Python rounds the exact binary value half to even and returns the double nearest to the
// decimal result. The exact value is a fraction m / 2**k, so BigInt can do all of it.
export function round_to(value, places = 2) {
  const x = Number(value);
  if (!Number.isFinite(x) || x === 0) return x;
  const neg = x < 0;
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, Math.abs(x));
  const bits = buf.getBigUint64(0);
  const expBits = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & 0xfffffffffffffn;
  let exp;
  if (expBits === 0) exp = -1074;
  else {
    mant |= 1n << 52n;
    exp = expBits - 1075;
  }
  // |x| = mant * 2**exp. Scale by 10**places, then divide by 2**-exp or multiply by 2**exp.
  let num = mant;
  let den = 1n;
  if (exp >= 0) num <<= BigInt(exp);
  else den <<= BigInt(-exp);
  if (places >= 0) num *= 10n ** BigInt(places);
  else den *= 10n ** BigInt(-places);
  let n = num / den;
  const twice = (num % den) * 2n;
  if (twice > den || (twice === den && n % 2n === 1n)) n += 1n;
  const text = `${n}e${-places}`;
  const out = Number(text);
  return neg ? -out : out;
}

// ----------------------------------------------------------------------------------------------- format_money

export function format_money(cents, currency = 'USD') {
  const sign = cents < 0 ? '-' : '';
  cents = Math.abs(cents);
  if (NO_MINOR_UNITS.has(currency)) return `${sign}${SYMBOLS.get(currency)}${group(cents)}`;
  const major = Math.floor(cents / 100);
  const minor = cents - major * 100;
  const symbol = SYMBOLS.get(currency);
  const tail = `${group(major)}.${String(minor).padStart(2, '0')}`;
  if (symbol === undefined) return `${sign}${tail} ${currency}`;
  return `${sign}${symbol}${tail}`;
}

// ------------------------------------------------------------------------------------------------ title_name

// Python's str.title() is character by character: a cased letter after a cased letter is lower-cased, any other
// character is title-cased, and a character that is not a letter (a digit, an apostrophe, a hyphen) ends a word.
const CASED = /^\p{Cased}$/u;
const IGNORABLE = /^\p{Case_Ignorable}$/u;
const TITLE_SPECIAL = new Map([
  ['ß', 'Ss'], ['ŉ', 'ʼN'], ['ǰ', 'J̌'], ['ǆ', 'ǅ'], ['ǅ', 'ǅ'], ['Ǆ', 'ǅ'], ['ǉ', 'ǈ'], ['ǈ', 'ǈ'], ['Ǉ', 'ǈ'], ['ǌ', 'ǋ'], ['ǋ', 'ǋ'], ['Ǌ', 'ǋ'], ['ǳ', 'ǲ'], ['ǲ', 'ǲ'], ['Ǳ', 'ǲ'],
  ['ﬀ', 'Ff'], ['ﬁ', 'Fi'], ['ﬂ', 'Fl'], ['ﬃ', 'Ffi'], ['ﬄ', 'Ffl'], ['ﬅ', 'St'], ['ﬆ', 'St'], ['և', 'Եւ'],
]);

function lowerAt(cps, i) {
  const ch = cps[i];
  if (ch !== 'Σ') return ch.toLowerCase();
  // A capital sigma becomes the final form at the end of a word: after a letter, and not before one.
  let j = i - 1;
  while (j >= 0 && IGNORABLE.test(cps[j]) && !CASED.test(cps[j])) j--;
  const after = j >= 0 && CASED.test(cps[j]);
  let k = i + 1;
  while (k < cps.length && IGNORABLE.test(cps[k]) && !CASED.test(cps[k])) k++;
  const before = k < cps.length && CASED.test(cps[k]);
  return after && !before ? 'ς' : 'σ';
}

function pyTitle(text) {
  const cps = [...text];
  let prevCased = false;
  let out = '';
  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i];
    out += prevCased ? lowerAt(cps, i) : (TITLE_SPECIAL.get(ch) ?? ch.toUpperCase());
    prevCased = CASED.test(ch);
  }
  return out;
}

export function title_name(name) {
  return pyTitle(pySplit(name).join(' '));
}

// ------------------------------------------------------------------------------------------------- wrap_text

// A port of Python 3.13's textwrap.wrap with its defaults. \w and \d are Unicode-aware in Python.
const WS = '[\\t\\n\\x0b\\x0c\\r ]';
const NWS = '[^\\t\\n\\x0b\\x0c\\r ]';
const WP = '[\\p{L}\\p{N}_!"\'&.,?]';
const LT = '[\\p{L}\\p{Nl}\\p{No}_]';
const WORD = '[\\p{L}\\p{N}_]';
const WORDSEP = new RegExp(
  `${WS}+` +
    `|(?<=${WP})-{2,}(?=${WORD})` +
    `|${NWS}+?(?:-(?:(?<=${LT}{2}-)|(?<=${LT}-${LT}-))(?=${LT}-?${LT})|(?=${WS}|$)|(?<=${WP})(?=-{2,}${WORD}))`,
  'gu',
);

// str.expandtabs(8): a tab moves to the next multiple of 8 columns, and a line break starts the count again.
function expandTabs(text) {
  let out = '';
  let col = 0;
  for (const ch of text) {
    if (ch === '\t') {
      const n = 8 - (col % 8);
      out += ' '.repeat(n);
      col += n;
    } else {
      out += ch;
      col++;
      if (ch === '\n' || ch === '\r') col = 0;
    }
  }
  return out;
}

const cpLen = (s) => [...s].length;

export function wrap_text(text, width = 40) {
  const munged = expandTabs(text).replace(/[\t\n\x0b\x0c\r]/g, ' ');
  const chunks = (munged.match(WORDSEP) ?? []).reverse();
  if (width <= 0) throw new RangeError(`invalid width ${width} (must be > 0)`);
  const lines = [];
  while (chunks.length) {
    const curLine = [];
    let curLen = 0;
    // The first chunk of a line that is white space is dropped, except at the very start of the text.
    if (isBlank(chunks[chunks.length - 1]) && lines.length) chunks.pop();
    while (chunks.length) {
      const l = cpLen(chunks[chunks.length - 1]);
      if (curLen + l <= width) {
        curLine.push(chunks.pop());
        curLen += l;
      } else break;
    }
    // The next chunk is too long for any line: put as much of it on this one as fits.
    if (chunks.length && cpLen(chunks[chunks.length - 1]) > width) {
      const spaceLeft = width - curLen;
      if (spaceLeft > 0) {
        const chunk = Array.from(chunks[chunks.length - 1]);
        let end = spaceLeft;
        if (chunk.length > spaceLeft) {
          // Break after the last hyphen, but only if something other than hyphens comes before it.
          const hyphen = chunk.lastIndexOf('-', spaceLeft - 1);
          if (hyphen > 0 && chunk.slice(0, hyphen).some((c) => c !== '-')) end = hyphen + 1;
        }
        curLine.push(chunk.slice(0, end).join(''));
        chunks[chunks.length - 1] = chunk.slice(end).join('');
      } else if (!curLine.length) curLine.push(chunks.pop());
      curLen = curLine.reduce((n, c) => n + cpLen(c), 0);
    }
    // White space at the end of a line is dropped.
    if (curLine.length && isBlank(curLine[curLine.length - 1])) curLine.pop();
    if (curLine.length) lines.push(curLine.join(''));
  }
  return lines;
}

// -------------------------------------------------------------------------------------------- parse_quantity

// The decimal digit value of a Unicode Nd character: digits come in runs of ten starting at zero.
const NDIGIT = /^\p{Nd}$/u;
function digitValue(ch) {
  let cp = ch.codePointAt(0);
  let start = cp;
  while (NDIGIT.test(String.fromCodePoint(start - 1))) start--;
  return (cp - start) % 10;
}

// int(text) for a string: white space around, an optional sign, Unicode decimal digits, and single underscores
// between digits. Returns a BigInt.
function pyIntBig(text) {
  const bad = () => new RangeError(`invalid literal for int() with base 10: ${JSON.stringify(text)}`);
  if (typeof text !== 'string') throw new TypeError('int() needs a string');
  let s = Array.from(intStrip(text));
  let negative = false;
  if (s[0] === '+' || s[0] === '-') {
    negative = s[0] === '-';
    s = s.slice(1);
  }
  if (!s.length) throw bad();
  let value = 0n;
  let prevDigit = false;
  for (const ch of s) {
    if (ch === '_') {
      if (!prevDigit) throw bad();
      prevDigit = false;
    } else if (NDIGIT.test(ch)) {
      value = value * 10n + BigInt(digitValue(ch));
      prevDigit = true;
    } else throw bad();
  }
  if (!prevDigit) throw bad();
  return negative ? -value : value;
}

export function parse_quantity(text) {
  const n = Number(pyIntBig(text));
  return n === 0 ? 0 : n;
}

// -------------------------------------------------------------------------------------------------- checksum

export function checksum(text) {
  const MOD = 2n ** 61n - 1n;
  let h = 0n;
  for (const ch of text) h = (h * 1000003n + BigInt(ch.codePointAt(0))) % MOD;
  return h.toString(16).padStart(16, '0');
}

// ------------------------------------------------------------------------------------------------------ top_n

// Python's ordering of two sort keys: numbers by value, strings by code point, anything else is a TypeError.
function compareCodePoints(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a.charCodeAt(i);
    let y = b.charCodeAt(i);
    if (x !== y) {
      // UTF-16 puts surrogates (astral characters) below U+E000..U+FFFF; code points put them above.
      if (x >= 0xd800) x += x >= 0xe000 ? -0x800 : 0x2000;
      if (y >= 0xd800) y += y >= 0xe000 ? -0x800 : 0x2000;
      return x - y;
    }
  }
  return a.length - b.length;
}
function pyCompare(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return compareCodePoints(a, b);
  const num = (v) => typeof v === 'number' || typeof v === 'boolean';
  if (num(a) && num(b)) return a < b ? -1 : a > b ? 1 : 0;
  throw new TypeError(`'<' not supported between ${typeof a} and ${typeof b}`);
}

export function top_n(rows, key, n) {
  const keyed = rows.map((r) => {
    if (r === null || typeof r !== 'object' || !Object.hasOwn(r, key)) throw new RangeError(`KeyError: ${key}`);
    return { r, k: r[key] };
  });
  // reverse=True keeps equal rows in their original order, so compare descending and rely on a stable sort.
  keyed.sort((x, y) => pyCompare(y.k, x.k));
  const sorted = keyed.map((e) => e.r);
  return n < 0 ? sorted.slice(0, Math.max(0, sorted.length + n)) : sorted.slice(0, n);
}

// ------------------------------------------------------------------------------------------------- summarize

// Python's repr(float): the shortest digits that read back the same, in exponent form when the exponent is below
// -4 or at least 16, always with a ".0" or an exponent so that it reads as a float.
function pyFloatRepr(x) {
  if (Object.is(x, -0)) return '-0.0';
  const sign = x < 0 ? '-' : '';
  const [mantissa, e] = Math.abs(x).toExponential().split('e');
  const exp = Number(e);
  const digits = mantissa.replace('.', '');
  if (exp < -4 || exp >= 16) {
    const frac = digits.length > 1 ? `.${digits.slice(1)}` : '';
    const mag = String(Math.abs(exp)).padStart(2, '0');
    return `${sign}${digits[0]}${frac}e${exp < 0 ? '-' : '+'}${mag}`;
  }
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  if (digits.length <= exp + 1) return `${sign}${digits}${'0'.repeat(exp + 1 - digits.length)}.0`;
  return `${sign}${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
}

// math.fsum: CPython's algorithm (Shewchuk's exact partial sums), with its final correction for half-way cases.
function fsum(xs) {
  const partials = [];
  for (let x of xs) {
    let i = 0;
    for (let y of partials) {
      if (Math.abs(x) < Math.abs(y)) [x, y] = [y, x];
      const hi = x + y;
      const lo = y - (hi - x);
      if (lo !== 0) partials[i++] = lo;
      x = hi;
    }
    partials.length = i;
    partials.push(x);
  }
  let n = partials.length;
  let hi = 0;
  if (n > 0) {
    hi = partials[--n];
    let lo = 0;
    while (n > 0) {
      const x = hi;
      const y = partials[--n];
      hi = x + y;
      lo = y - (hi - x);
      if (lo !== 0) break;
    }
    // Make half-way cases round to even: look at the next partial's sign.
    if (n > 0 && ((lo < 0 && partials[n - 1] < 0) || (lo > 0 && partials[n - 1] > 0))) {
      const y = lo * 2;
      const x = hi + y;
      if (y === x - hi) hi = x;
    }
  }
  return hi;
}

export function summarize(values) {
  const xs = values.map((v) => Number(v));
  if (xs.length === 0) throw new RangeError('float division by zero');
  const mean = fsum(xs) / xs.length;
  let min = xs[0];
  let max = xs[0];
  for (const x of xs) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return `n=${xs.length} mean=${pyFloatRepr(mean)} min=${pyFloatRepr(min)} max=${pyFloatRepr(max)}`;
}

// --------------------------------------------------------------------------------------------------- to_json

// json.dumps escapes everything outside printable ASCII as \uXXXX (lower-case hex, surrogate pairs for astral
// characters), and writes numbers the way Python does.
function jsonString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (c >= 0x20 && c <= 0x7e) out += ch;
    else out += `\\u${c.toString(16).padStart(4, '0')}`;
  }
  return `${out}"`;
}

function dump(data) {
  if (data === null || data === undefined) return 'null';
  if (data === true) return 'true';
  if (data === false) return 'false';
  if (typeof data === 'string') return jsonString(data);
  if (typeof data === 'number') {
    if (!Number.isFinite(data)) return Number.isNaN(data) ? 'NaN' : data > 0 ? 'Infinity' : '-Infinity';
    return Number.isInteger(data) && Math.abs(data) < 1e16 ? String(data) : pyFloatRepr(data);
  }
  if (Array.isArray(data)) return `[${data.map(dump).join(', ')}]`;
  const keys = Object.keys(data).sort(compareCodePoints);
  return `{${keys.map((k) => `${jsonString(k)}: ${dump(data[k])}`).join(', ')}}`;
}

export function to_json(data) {
  return dump(data);
}

// ------------------------------------------------------------------------------------------- iso_week_dates

// Days since 0001-01-01 (day 1) in the proleptic Gregorian calendar, as Python's date.toordinal().
function toOrdinal(y, m, d) {
  const y1 = y - 1;
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return y1 * 365 + Math.floor(y1 / 4) - Math.floor(y1 / 100) + Math.floor(y1 / 400) + cum[m - 1] + (m > 2 && leap ? 1 : 0) + d;
}

function fromOrdinal(ord) {
  // Python's algorithm: 400-, 100-, 4- and 1-year cycles.
  let n = ord - 1;
  const n400 = Math.floor(n / 146097);
  n %= 146097;
  const n100 = Math.min(Math.floor(n / 36524), 3);
  n -= n100 * 36524;
  const n4 = Math.floor(n / 1461);
  n %= 1461;
  const n1 = Math.min(Math.floor(n / 365), 3);
  n -= n1 * 365;
  const year = n400 * 400 + n100 * 100 + n4 * 4 + n1 + 1;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let month = 0;
  while (n >= lengths[month]) n -= lengths[month++];
  return [year, month + 1, n + 1];
}

const MAX_ORDINAL = toOrdinal(9999, 12, 31);

export function iso_week_dates(week) {
  const parts = week.split('-W');
  if (parts.length !== 2) throw new RangeError('not a week like 2025-W07');
  const year = Number(pyIntBig(parts[0]));
  const w = Number(pyIntBig(parts[1]));
  if (!(year >= 1 && year <= 9999)) throw new RangeError(`year ${year} is out of range`);
  const jan1 = toOrdinal(year, 1, 1);
  const jan1Weekday = (jan1 + 6) % 7; // Monday is 0
  if (w < 1 || w > 53) throw new RangeError(`invalid week: ${w}`);
  if (w === 53) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (!(jan1Weekday === 3 || (jan1Weekday === 2 && leap))) throw new RangeError(`invalid week: ${w}`);
  }
  // Week 1 is the week with January 4th in it.
  let monday = jan1 - jan1Weekday;
  if (jan1Weekday > 3) monday += 7;
  monday += 7 * (w - 1);
  const out = [];
  for (let i = 0; i < 7; i++) {
    if (monday + i > MAX_ORDINAL) throw new RangeError('date value out of range');
    const [y, m, d] = fromOrdinal(monday + i);
    out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}
