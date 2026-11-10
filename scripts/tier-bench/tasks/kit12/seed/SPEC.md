# Twelve modules

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

## src/semver.mjs: `parse(text)`, `compare(a, b)` and `satisfies(version, range)`

### `parse(text)` → `{ major, minor, patch, prerelease }`

`major`, `minor` and `patch` are numbers; `prerelease` is an array of strings (`[]` when there is none). The text must
be exactly `MAJOR.MINOR.PATCH`, with an optional leading lowercase `v` and an optional `-` followed by the prerelease:
one or more identifiers separated by `.`, each identifier one or more of `0-9`, `A-Z`, `a-z`, `-`. The three numbers
are digits with no leading zero (`0` is fine, `01` is not). A prerelease identifier made only of digits also has no
leading zero (`1.0.0-01` is wrong, `1.0.0-0a` and `1.0.0-0` are fine). There is no build metadata (a `+` anywhere is
wrong), no spaces anywhere (no trimming), no missing parts (`1.2`) and no extra parts. Anything else, and anything that
is not a string, throws a `RangeError`.

- `parse('1.2.3')` → `{ major: 1, minor: 2, patch: 3, prerelease: [] }`
- `parse('v1.2.3-beta.1')` → `{ major: 1, minor: 2, patch: 3, prerelease: ['beta', '1'] }`
- `parse('1.2')`, `parse('01.2.3')`, `parse('1.2.3+build')`, `parse(' 1.2.3')`, `parse('1.2.3-')`, `parse('V1.2.3')`
  → `RangeError`

### `compare(a, b)` → `-1`, `0` or `1`

`a` and `b` are version texts, read with `parse` (so an invalid one throws its `RangeError`; `v1.2.3` equals `1.2.3`).
Precedence: compare `major`, then `minor`, then `patch` as numbers. If all three are equal: a version with no
prerelease is higher than one with a prerelease. If both have prereleases, compare them part by part from the left:
two all-digit parts are compared as numbers; an all-digit part is lower than any other part; two other parts are
compared as text, by UTF-16 code unit (so `'B'` is lower than `'a'`); if all the parts the two share are equal, the
one with fewer parts is lower.

Examples: `compare('1.2.3', '1.10.0')` → `-1`; `compare('1.0.0-alpha', '1.0.0')` → `-1`;
`compare('1.0.0-alpha.2', '1.0.0-alpha.10')` → `-1`; `compare('1.0.0-1', '1.0.0-a')` → `-1`;
`compare('1.0.0-alpha', '1.0.0-alpha.1')` → `-1`; `compare('v2.0.0', '2.0.0')` → `0`.

### `satisfies(version, range)` → boolean

`version` is read with `parse`. `range` is a string of one or more comparators separated by spaces (leading and trailing
spaces ignored); the version satisfies it only if it satisfies all of them. An empty range, a non-string range, or any
comparator that cannot be read throws a `RangeError`. A comparator is an operator directly followed by a version
(read with `parse`, so `v` and a prerelease are allowed). The operators are only:

- none (`1.2.3`): exactly equal, by `compare` giving `0`.
- `>=` and `<`: `compare` of the version with the comparator's version is `>= 0`, or `< 0`.
- `~1.2.3`: `>=1.2.3` and `<1.3.0` (next minor).
- `^1.2.3`: `>=` the comparator's version and `<` the next "breaking" version, found by raising the leftmost one of
  major, minor, patch that is not zero by one and setting what follows it to zero: `^1.2.3` is `>=1.2.3 <2.0.0`,
  `^0.2.3` is `>=0.2.3 <0.3.0`, `^0.0.3` is `>=0.0.3 <0.0.4` (exactly `0.0.3`), `^0.0.0` is `>=0.0.0 <0.0.1`.

Any other operator or wildcard (`>`, `<=`, `=`, `1.x`, `*`) is a `RangeError`, and so is a space between an operator and
its version (`>= 1.2.3` reads as the operator `>=` alone, which is no version).

Prereleases: after the checks above, a version that has a prerelease satisfies the range only if at least one
comparator of the range has a prerelease and the same `major.minor.patch` as the version. A version without a
prerelease is not affected by this rule.

Examples: `satisfies('1.5.0', '^1.2.3')` → `true`; `satisfies('2.0.0', '^1.2.3')` → `false`;
`satisfies('0.2.9', '^0.2.3')` → `true`; `satisfies('0.3.0', '^0.2.3')` → `false`; `satisfies('0.0.4', '^0.0.3')` →
`false`; `satisfies('1.2.9', '~1.2.3')` → `true`; `satisfies('1.3.0', '~1.2.3')` → `false`;
`satisfies('1.5.0', '>=1.2.3 <2.0.0')` → `true`; `satisfies('1.2.4-beta', '^1.2.3')` → `false`;
`satisfies('1.2.3-beta.2', '>=1.2.3-beta.1 <2.0.0')` → `true`; `satisfies('1.3.0-beta', '>=1.2.3-beta.1 <2.0.0')` →
`false`; `satisfies('1.2.3', '1.x')` → `RangeError`.

## src/roman.mjs: `toRoman(n)` and `fromRoman(text)`

- `toRoman(n)`: `n` must be an integer from 1 to 3999 (a number; `'5'` and `2.5` are not), otherwise `RangeError`. The
  result is the canonical Roman numeral in capital letters, with the subtractive forms `IV`, `IX`, `XL`, `XC`, `CD`,
  `CM`: `4` → `'IV'`, `1994` → `'MCMXCIV'`, `3999` → `'MMMCMXCIX'`.
- `fromRoman(text)`: `text` is a string, read in any letter case (`'mcmxciv'` → `1994`), with no trimming. Only the
  canonical form is accepted, that is exactly what `toRoman` writes: thousands `M` up to three times, then one of
  `''`, `C`, `CC`, `CCC`, `CD`, `D`, `DC`, `DCC`, `DCCC`, `CM` for the hundreds, then the same for the tens with `X`,
  `L`, `C`, then for the ones with `I`, `V`, `X`. Anything else is a `RangeError`: the empty string, `IIII`, `IC`, `VX`,
  `IIV`, `MMMM`, `XXXX`, spaces, other letters, and a non-string.
- Every integer from 1 to 3999 survives `fromRoman(toRoman(n)) === n`.

## src/wrap.mjs: `wordWrap(text, width)`

Returns a string: the lines joined by `"\n"` (no `"\n"` after the last one). If `width` is not a positive integer, throw a
`RangeError`; if `text` is not a string, throw a `TypeError` (only one of the two is ever wrong in a test). Lengths are
counted in `.length` units.

The only separators are the space character and `"\n"`; every other character (tab, CR, …) is part of a word.

1. Split `text` at every `"\n"` into input lines. An input line that is empty or holds only spaces is *blank*.
2. Every blank input line gives exactly one empty line in the output. Each maximal run of consecutive non-blank input
   lines is one paragraph: its words (the pieces between runs of spaces; leading and trailing spaces dropped), taken
   in order across its lines as if the line breaks were spaces, are wrapped as below, and the resulting lines come out
   at that place.
3. Wrapping is greedy. Keep a current line; a word is added to it, after one space, if the line then has at most
   `width` characters; otherwise the current line is finished and the word starts a new one. Lines never end with a space.
4. A word longer than `width` first finishes the current line (if it is not empty). It is then cut into pieces of
   `width` characters, the last piece possibly shorter. Every piece except the last is a finished line by itself; the
   last piece becomes the current line, which the next words may continue as usual.

So `wordWrap('', 5)` → `''`, `wordWrap('\n', 5)` → `'\n'` (two empty lines) and `wordWrap('a\n', 5)` → `'a\n'`.

Examples: `wordWrap('the quick brown fox', 10)` → `'the quick\nbrown fox'`; `wordWrap('a  b\nc', 3)` → `'a b\nc'`
(`a b c` would be 5 characters, but the first line `a b` is full at 3); `wordWrap('one\n\ntwo three', 7)` →
`'one\n\ntwo\nthree'`; `wordWrap('ab abcdefghij k', 4)` → `'ab\nabcd\nefgh\nij k'`; `wordWrap('abcdefgh', 4)` →
`'abcd\nefgh'`; `wordWrap('  hi   there  ', 20)` → `'hi there'`; `wordWrap('x', 0)` → `RangeError`.

## src/template.mjs: `render(template, data)`

Returns the template as a string with its tags replaced. `template` that is not a string → `TypeError`. The template is
read from left to right; at each position the first of these rules that fits applies:

1. `\{{` (a backslash, then two opening braces): the output gets `{{` and reading continues after the three characters,
   so the `{{` opens no tag. A backslash anywhere else is an ordinary character.
2. `{{{`: a raw tag, which ends at the first `}}}` after it.
3. `{{`: a tag, which ends at the first `}}` after it.
4. Anything else is copied as it is (a stray `}}` outside a tag is ordinary text).

If a tag has no end, throw a `SyntaxError` (the JavaScript one). The text between the braces is the *path*: surrounding
whitespace is ignored. A path is one or more keys separated by single dots; a key is one or more characters other than
whitespace, `.`, `{` and `}`. An empty path (`{{ }}`), an empty key (`{{ a..b }}`) or any other path is a `SyntaxError`
too (so `{{ a {{ b }}` is a `SyntaxError`).

Looking up a path: start at `data` and take each key in turn. A step works only when the current value is a non-null
object (arrays included) that has the key as its **own** property (inherited ones, such as `toString`, do not count);
otherwise the path is *missing*. A missing path, and a value of `null` or `undefined`, give the empty string. Any other
value goes through `String()` (so `0` → `'0'`, `false` → `'false'`, `[1, 2]` → `'1,2'`; array indexes are keys:
`items.0`).

For `{{ path }}` the text is then escaped by replacing `&` with `&amp;`, `<` with `&lt;`, `>` with `&gt;`, `"` with
`&quot;` and `'` with `&#39;`. For `{{{ path }}}` it is not escaped. Template text outside tags is never escaped.

Examples (`data` is `{ user: { name: 'Ann & Bo', age: 0 }, list: ['x', 'y'], html: '<b>' }`):
`render('Hi {{user.name}}!', data)` → `'Hi Ann &amp; Bo!'`; `render('{{ user.age }}', data)` → `'0'`;
`render('{{ list.1 }}{{ nope.deeper }}.', data)` → `'y.'`; `render('{{html}} {{{ html }}}', data)` →
`'&lt;b&gt; <b>'`; `render('\\{{ user.name }} stays', data)` (the JavaScript string `\{{ user.name }} stays`) →
`'{{ user.name }} stays'`; `render('{{ user.name', data)` → `SyntaxError`; `render('a }} b', data)` → `'a }} b'`.

## src/glob.mjs: `globToRegExp(pattern)` and `matches(pattern, path)`

`globToRegExp(pattern)` returns a `RegExp` (no flags, so case-sensitive) that matches a whole path; `matches(pattern, path)`
returns `true` or `false` for `globToRegExp(pattern).test(path)`. A `pattern` or `path` that is not a string → `TypeError`.
Paths use `/` as the separator; nothing treats a leading `.` specially. Reading the pattern from left to right:

- `*` is any number of characters (also none) other than `/`.
- `**` (two or more stars in a row count as `**`) is any number of any characters, `/` included, also none. But `**/`
  (a `**` followed by `/`, the `/` is used up with it) is any number of whole directories: nothing, or any characters
  ending in `/`. So `a/**/b` matches `a/b`, `a/x/b` and `a/x/y/b`; `**/x` matches `x` and `a/b/x`; `a/**` matches
  `a/` and `a/b/c`, but not `a`.
- `?` is exactly one character other than `/`.
- `[abc]` is exactly one of the listed characters, and `[a-z]` a range (a `-` that is first or last in the brackets is
  just a hyphen; ranges are written low to high). `[!abc]` is exactly one character that is not listed and is not `/`.
  A class is `[`, an optional `!`, one or more characters other than `]`, and `]`; if the text at a `[` does not have
  that shape (`[` with no `]`, `[]`, `[!]`), the `[` is an ordinary character. Inside a class, every character other
  than the range hyphen is itself (`*`, `?`, `\`, `^`, `[` mean nothing special).
- `{a,b,c}` is any one of the alternatives, which are split at the commas and are plain text (every character in them is
  itself, `*` too; an alternative may be empty: `{,x}`). The group ends at the first `}` after the `{`, braces do not
  nest. A `{` with no `}` after it, and a `}` outside a group, are ordinary characters.
- Every other character is itself, including `.`, `+`, `(`, `\` and `$`.
- The whole path must match: `matches('a*', 'xa')` is `false`.

Examples: `matches('*.js', 'app.js')` → `true`; `matches('*.js', 'src/app.js')` → `false`;
`matches('src/**/*.js', 'src/a/b/c.js')` → `true`; `matches('src/**/*.js', 'src/c.js')` → `true`;
`matches('file?.txt', 'file1.txt')` → `true`; `matches('file?.txt', 'file/.txt')` → `false`;
`matches('[a-c]x', 'bx')` → `true`; `matches('[!a-c]x', 'dx')` → `true`; `matches('[!a-c]x', '/x')` → `false`;
`matches('*.{js,mjs}', 'a.mjs')` → `true`; `matches('a.b', 'axb')` → `false`; `matches('[abc', '[abc')` → `true`;
`matches('', '')` → `true`.

## src/diff.mjs: `diffLines(a, b)` and `applyDiff(a, diff)`

### `diffLines(a, b)` → array of `{ op, line }`

`a` and `b` are arrays of strings (anything else → `TypeError`). The result turns `a` into `b`: `op` is `'equal'` (the
line is in both), `'delete'` (a line of `a` that is not kept) or `'insert'` (a line of `b` that is new); `line` is the
string. Reading only the `equal` and `delete` entries gives back `a`, reading only `equal` and `insert` gives back `b`,
and the `equal` entries are always a longest common subsequence of `a` and `b`.

When there are several such results, the one to give is found by walking along both arrays, with `i` the next line of
`a` and `j` the next line of `b`:

1. When `a[i]` equals `b[j]`: write `equal` and move both on.
2. Otherwise let `p` be the length of the longest common subsequence of `a[i+1…]` and `b[j…]`, and `q` that of `a[i…]` and
   `b[j+1…]`. If `p >= q`, write `delete` for `a[i]` and move `i` on; otherwise write `insert` for `b[j]` and move `j` on.
3. When one array is used up, the rest of the other gives `delete`s (rest of `a`) or `insert`s (rest of `b`).

So within a changed stretch the deletes come before the inserts, and on a tie the line of `a` is dropped rather than the
line of `b`. Examples: `diffLines(['a','b','c'], ['a','x','c'])` → `equal a, delete b, insert x, equal c`;
`diffLines(['x','y'], ['y','x'])` → `delete x, equal y, insert x`; `diffLines([], ['q'])` → `insert q`;
`diffLines(['q'], [])` → `delete q`; `diffLines([], [])` → `[]`; `diffLines(['a','a'], ['a'])` → `equal a, delete a`.
(In the output, `equal a` stands for `{ op: 'equal', line: 'a' }`.)

### `applyDiff(a, diff)` → array of strings

Applies `diff` (a list like the one above) to `a` and returns the new array, without changing `a`. Walk `diff` with an
index `i` into `a`: `equal` and `delete` need `a[i]` to be the entry's `line` (else throw an `Error`) and move `i` on;
`insert` adds its line to the result; `equal` and `insert` lines go into the result in order. When the diff is used up,
`i` must be at the end of `a`, else throw an `Error`. An entry whose `op` is none of the three throws an `Error` too, and
so does a `diff` that is not an array (`TypeError` is fine, it is an `Error`).
`applyDiff(a, diffLines(a, b))` always equals `b`. `applyDiff(['a'], [{ op: 'equal', line: 'b' }])` and
`applyDiff(['a', 'b'], [{ op: 'equal', line: 'a' }])` throw.

## src/ini.mjs: `parseIni(text)` and `stringifyIni(obj)`

### `parseIni(text)` → `{ section: { key: value } }`

`text` that is not a string → `TypeError`. The result is a plain object of sections, each a plain object of keys with
string values. Split `text` at every `"\n"`; line numbers start at 1. Each line has its surrounding whitespace removed
first (so a CRLF ending does no harm), then the first of these that fits applies:

1. Empty: ignored.
2. Starts with `;` or `#`: a comment, ignored.
3. A section header: starts with `[` and ends with `]`, and between them (whitespace around it removed) is a name of one
   or more characters that has no `[` or `]` in it: `[server]`, `[ my app ]` (the name is `my app`). Later keys belong to
   that section. A section exists in the result from its header on, even with no keys. A header for a section already
   seen continues that section.
4. A key line: has an `=`. The key is what is before the first `=`, the value what is after it, each with surrounding
   whitespace removed. The key must not be empty. Keys that come before any header belong to the section named `""`,
   which exists in the result only if it has at least one key. A key that is already in the section gets the new value.
   The value is read like this:
   - if it starts with `"`, it is a quoted value: it runs to the next `"` that is not escaped, and inside it `\n` is a
     line feed, `\"` a quote and `\\` a backslash; every other backslash sequence, a backslash at the end of the line, and
     a missing closing quote are errors. Spaces inside the quotes are kept. After the closing quote nothing but
     whitespace may follow (the line was trimmed, so nothing at all).
   - otherwise it is the text as it is (an empty value is `''`). There are no inline comments: in `a = b ; c` the value
     is `b ; c`. Quotes and backslashes that are not at the start of the value mean nothing special, and a value may
     contain `=`.

Any other line (no `=`, a header that fails rule 3 such as `[]`, `[a`, `[a]b`, `[a[b]`, an empty key, a bad quoted value)
throws a `SyntaxError` whose message contains the text `line N` with the 1-based number `N` of that line (the first
error found).

Example: this text (the `msg` value is a backslash and an `n` between quotes)

```ini
top = 1
; note
[server]
host = "my host"
msg = "a\nb"
port = 80
[server]
port = 8080
```

gives `{ "": { top: '1' }, server: { host: 'my host', msg: 'a\nb', port: '8080' } }` (as JavaScript, `'a\nb'` is `a`, a line
feed, `b`). `parseIni('')` → `{}`; `parseIni('[empty]')` → `{ empty: {} }`; `parseIni('a = 1\nb\n')` → `SyntaxError`
with `line 2` in its message.

### `stringifyIni(obj)` → string

`obj` is a plain object whose values are plain objects (sections), whose values are written with `String()` (`null` and
`undefined` as the empty string). Anything else for `obj` or a section → `TypeError`. The output is built from
lines:

1. First the section `""` if `obj` has it: its lines only, with no header (nothing at all if it has no keys).
2. Then every other section, in the order of `Object.keys(obj)`: the line `[name]`, then its lines.
3. A key's line is `key = value`, or `key =` when the value is the empty string. Keys of a section are in the order of
   `Object.keys`.
4. A value is written in double quotes when it starts or ends with whitespace (the value differs from `value.trim()`),
   or contains a line feed, or starts with `"`; inside the quotes a backslash is written `\\`, a `"` is written `\"`
   and a line feed is written `\n`. Every other value is written as it is.

The lines are joined by `"\n"` and one `"\n"` ends the text; an `obj` with no lines at all gives `''`. There are no blank
lines between sections. A key that `parseIni` could not read back (empty, with `=` or a line break in it, with whitespace at
its start or end, or starting with `;`, `#` or `[`) and a section name that it could not (empty other than the `""`
section, with `[`, `]` or a line break, or whitespace at its start or end) throw a `RangeError`.

For an `obj` whose values are strings, `parseIni(stringifyIni(obj))` gives back an equal object (except that a `""` section
without keys is not in it). Example:
`stringifyIni({ "": { a: '1' }, s: { b: ' x ', c: 'say "hi"', d: 'l1\nl2', e: '' } })` →
`'a = 1\n[s]\nb = " x "\nc = say "hi"\nd = "l1\\nl2"\ne =\n'` (a JavaScript string literal: `\\n` is a backslash and an `n`, the
other `\n` are line feeds); `stringifyIni({})` → `''`; `stringifyIni({ s: {} })` → `'[s]\n'`.

## src/cron.mjs: `nextRun(expression, from)`

Returns a new `Date`: the first minute that is strictly after `from` and matches `expression`, all in UTC. The result has
zero seconds and milliseconds (`from` itself is not changed, and `from` is never returned: `nextRun('* * * * *',
10:07:30)` is `10:08:00`, and so is it for `10:07:00`). `from` that is not a `Date` → `TypeError`; an invalid `Date` →
`RangeError`.

`expression` is five fields separated by runs of spaces (leading and trailing spaces ignored): minute `0-59`, hour `0-23`,
day of month `1-31`, month `1-12`, day of week `0-6` with `0` Sunday (`7` is an error). A field is one or more *items*
separated by commas (an empty item, as in `1,,2`, is an error). An item is one of:

- `*`: every value of the field.
- `N`: that value. `N` is digits only (`05` is fine; no sign, no names such as `MON` or `JAN`, no `?`, `L`, `W`).
- `N-M`: every value from `N` to `M`, and `N` must not be greater than `M`.
- `*/S` and `N-M/S`: from the first value (the field's lowest for `*`, `N` for a range) up in steps of `S` while the
  value is no more than the last (the field's highest for `*`, `M` for a range). `S` is a positive integer. A step on a
  single number (`5/10`) is an error.

So `*/15` in the minute field is `0,15,30,45`, `*/5` in the month field is `1,6,11`, `*/2` in the day-of-month field is
the odd days, and `10-40/10` is `10,20,30,40`.

A minute matches when its minute, hour and month are in their fields and the day passes: if neither the day-of-month nor
the day-of-week field is exactly `*`, the day passes when its day of the month is in the first **or** its day of the
week is in the second; if only one of them is not `*`, the day must be in that one; if both are `*`, every day passes.
(`*/2` is not the same as `*`: a field is unrestricted only when it is exactly `*`.)

A wrong number of fields, a value out of range, a field that cannot be read, or an `expression` that is not a string
→ `RangeError`. If no minute matches in the eight years after `from` (up to and including `from` with its UTC year
raised by 8), such as `0 0 30 2 *`, throw a `RangeError` as well. `expression` is checked before the search, so a bad
one always throws even if nothing would match anyway.

Examples (all `from` and results in UTC): `nextRun('*/15 * * * *', 2024-01-01T10:07:30Z)` → `2024-01-01T10:15:00Z`;
`nextRun('0 0 * * *', 2024-01-01T00:00:00Z)` → `2024-01-02T00:00:00Z`; `nextRun('0 9 * * 1', 2024-01-03T12:00:00Z)` (a
Wednesday) → `2024-01-08T09:00:00Z` (a Monday); `nextRun('30 23 31 12 *', 2024-12-31T23:30:00Z)` →
`2025-12-31T23:30:00Z`; `nextRun('0 0 29 2 *', 2025-03-01T00:00:00Z)` → `2028-02-29T00:00:00Z`;
`nextRun('0 12 13 * 5', 2024-01-01T00:00:00Z)` → `2024-01-05T12:00:00Z` (day 13 or a Friday: the first Friday is the 5th);
`nextRun('0 0 30 2 *', 2024-01-01T00:00:00Z)` → `RangeError`; `nextRun('* * * *', …)` → `RangeError`.
