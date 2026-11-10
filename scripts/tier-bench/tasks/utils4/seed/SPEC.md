# Four modules

Plain Node.js 22, ES modules, no packages. Everything below is exported by name from the file given in its heading.
Where this document gives an example, the result shown is exactly what the function must return.

## src/slug.mjs: `slugify(text, { maxLength = 60, separator = '-' } = {})`

Turns text into a URL-friendly slug. `separator` is always a single character that is not a-z or 0-9; `maxLength` is
always a positive integer. Steps, in this order:

1. If `text` is not a string, throw a `TypeError`.
2. Normalize the text with `NFKD`, then drop every character from U+0300 to U+036F (combining marks), then
   lowercase it.
3. Every run of one or more characters other than `a-z` and `0-9` becomes exactly one `separator`. This includes
   characters that are not ASCII and have no ASCII decomposition (`日本語`, `ß`, emoji).
4. Remove any separator at the start and at the end.
5. Cut the result to at most `maxLength` characters, then remove any separator left at the end.
6. Empty text, or text with no a-z or 0-9 left, gives `''`.

Examples:

- `slugify('Hello, World!')` → `'hello-world'`
- `slugify('  --Already--Slug--  ')` → `'already-slug'`
- `slugify('Crème Brûlée')` → `'creme-brulee'`
- `slugify('C++ & C#')` → `'c-c'`
- `slugify('v1.2.3')` → `'v1-2-3'`
- `slugify('ﬁne')` → `'fine'` (the ligature `ﬁ` becomes `fi` under NFKD)
- `slugify('a b c', { separator: '_' })` → `'a_b_c'`
- `slugify('Hello World', { maxLength: 6 })` → `'hello'` (the cut leaves `hello-`, its trailing separator goes)
- `slugify('Hello World', { maxLength: 7 })` → `'hello-w'`
- `slugify('日本語')` → `''`
- `slugify('')` → `''`
- `slugify(42)` → throws `TypeError`

## src/duration.mjs: `parseDuration(text)` and `formatDuration(ms)`

### `parseDuration(text)` → milliseconds (a number)

- `text` that is not a string → `RangeError`.
- Leading and trailing whitespace is ignored. After that, an empty string → `RangeError`.
- A text made only of a number (digits, optionally `.` and more digits: `1500`, `0.5`) is a number of milliseconds.
- Otherwise the text is one or more terms. A term is a number, then optional whitespace, then a unit; terms may be
  separated by whitespace or nothing at all. A number is digits, optionally followed by `.` and one or more digits;
  it has no sign and no exponent. A unit is the longest run of letters after the number and must be one of
  `ms`, `s`, `m`, `h`, `d`, `w` (milliseconds, seconds, minutes, hours, days, weeks of 7 days), in any letter case.
- The result is the sum of the terms, rounded to the nearest integer with `Math.round`. Terms may appear in any
  order and a unit may repeat (`1h 1h` is two hours).
- Anything else is a `RangeError`: unknown units (`1x`, `5min`), a unit with no number (`h`, `1h m`), a number with
  no unit next to other terms (`1h 30`), negative numbers (`-5s`), letters or symbols that are not part of a term.

Examples: `'1h 30m'` → `5400000`; `'90s'` → `90000`; `'1.5h'` → `5400000`; `'2d4h'` → `187200000`;
`'250ms'` → `250`; `'1w'` → `604800000`; `'1500'` → `1500`; `' 2 H 5 M '` → `7500000`; `'1M'` → `60000`
(`M` is minutes, `MS` is milliseconds); `''`, `'abc'`, `'1x'`, `'h'`, `'-5s'` → `RangeError`.

### `formatDuration(ms)` → string

- Not a number type, `NaN`, infinite or negative → `RangeError` (the check is made before any rounding).
- Round `ms` to an integer with `Math.round`, then write it using the units `d` (86400000 ms), `h` (3600000),
  `m` (60000), `s` (1000) and `ms`, the largest unit first, leaving out every unit whose count is zero, joined by one
  space. Weeks are not used. Zero is `'0ms'`.

Examples: `5400000` → `'1h 30m'`; `1500` → `'1s 500ms'`; `0` → `'0ms'`; `172800000` → `'2d'`;
`90061001` → `'1d 1h 1m 1s 1ms'`; `0.4` → `'0ms'`; `1500.5` → `'1s 501ms'`; `-1` → `RangeError`.

## src/lru.mjs: `class LRUCache`

`new LRUCache({ capacity, ttlMs = Infinity, now = Date.now })`

- `capacity` must be a positive integer, otherwise throw a `RangeError` (this includes calling the constructor with
  no argument). `ttlMs` is a positive number or `Infinity`. `now` is a function returning the current time in
  milliseconds; the cache reads time only through it, so tests can use a fake clock.
- An entry stored at time `t` expires at `t + ttlMs`: it counts as expired whenever `now() >= t + ttlMs`. With
  `ttlMs` of `Infinity` an entry never expires. Reading an entry does not extend its life; only `set` does.
- Keys are compared like in a `Map` (so `NaN` equals `NaN`, `1` and `'1'` differ).
- `set(key, value)` returns the cache itself. First every expired entry is removed. Then, if `key` is already
  present, its value is replaced and the entry becomes the most recently used with a fresh expiry; if it is new and
  the cache already holds `capacity` entries, the least recently used entry is evicted before the new one is added
  as the most recently used.
- `get(key)` returns the value and makes the entry the most recently used; for a missing or expired key it returns
  `undefined` (an expired entry is removed).
- `has(key)` returns a boolean and does not change the order of use; it is `false` for an expired entry.
- `delete(key)` removes the entry and returns `true` if it was present and not expired, `false` otherwise.
- `size` is a getter: the number of entries that are not expired.
- `keys()` returns a new array of the keys of the entries that are not expired, from the least recently used to the
  most recently used.

Example (capacity 2): `set('a',1)`, `set('b',2)`, `get('a')`, `set('c',3)` evicts `'b'`; `keys()` → `['a','c']`.

## src/csv.mjs: `parseCsv(text, { delimiter = ',' } = {})` and `toCsv(rows, { delimiter = ',' } = {})`

`delimiter` is always a single character other than `"`, CR and LF. The quote character is always `"`.

### `parseCsv(text, options)` → array of rows, each row an array of strings

- `''` → `[]`.
- Rows end at LF or CRLF. If the text ends with a line break, that break does not start another row. A line with
  nothing on it between two breaks is a row with one empty field: `'a\n\nb'` → `[['a'],[''],['b']]`, and `'\n'` →
  `[['']]`. Rows may have different numbers of fields; nothing is padded.
- Fields are split at the delimiter. `'a,,b'` → `[['a','','b']]`; `'a,'` → `[['a','']]`; `','` → `[['','']]`.
- A field that starts with `"` is quoted: it runs to the closing `"`. Inside it, `""` is one quote, and delimiters,
  CR and LF are kept as they are. `'"a,b",c'` → `[['a,b','c']]`; `'"say ""hi"""'` → `[['say "hi"']]`;
  `'"a\r\nb"'` → `[['a\r\nb']]`; `'""'` → `[['']]`.
- After the closing quote only the delimiter, a line break or the end of the text may follow, otherwise throw a
  `SyntaxError` (`'"a"b'`).
- A quote that is not at the start of a field is an ordinary character: `'a"b,c'` → `[['a"b','c']]`. A CR that is
  not followed by LF is an ordinary character in an unquoted field.
- A quoted field that is never closed → `SyntaxError`.

### `toCsv(rows, options)` → string

- `rows` is an array of arrays. The rows are joined by CRLF, with no line break after the last row. `[]` → `''`.
  An empty row (`[]`) is an empty line.
- Every field is made a string: `null` and `undefined` become the empty string, everything else goes through
  `String()`.
- A field is written in quotes if it contains the delimiter, a `"`, CR or LF; the quotes inside it are doubled.
  Other fields are written as they are (spaces are kept and do not cause quoting).

Examples: `toCsv([['a','b'],['1','2']])` → `'a,b\r\n1,2'`; `toCsv([['x,y','say "hi"','line\nbreak']])` →
`'"x,y","say ""hi""","line\nbreak"'` (the last field is quoted, its LF is kept); `toCsv([[1,null,undefined,true]])`
→ `'1,,,true'`; `toCsv([['a;b','c']], { delimiter: ';' })` → `'"a;b";c'`.
