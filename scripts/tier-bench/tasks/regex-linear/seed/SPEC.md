# src/regex.mjs

A regular expression engine that never backtracks. The module exports one function:

- `compile(pattern)` → a compiled pattern: an object with two methods,
  - `test(text)` → `true` if the pattern matches somewhere in `text`, else `false`;
  - `match(text)` → `{ index, text }` for the leftmost-longest match (see "What a match is"), or `null` when there
    is none. `index` is where the match starts and `text` is the matched part of the text.

`compile` throws a `TypeError` if `pattern` is not a string; `test` and `match` throw a `TypeError` if `text` is not
a string. A pattern that is not in the language below makes `compile` throw a `SyntaxError` (see "Errors"). A
compiled pattern can be used any number of times, on any texts: no call changes what a later call returns.

## Two hard requirements

1. **Linear time, whatever the pattern.** For a pattern of size `m` (see "Size") and a text of length `n`, `test`
   and `match` must take time at most proportional to `m × n` (plus `compile`'s own time, at most proportional to
   `m`), for every pattern and every text. A backtracking matcher (one that tries one way through the pattern and
   goes back to try another when it fails) takes time exponential in `n` on patterns such as `(a*)*b`, and
   quadratic time on `a*b` against a long run of `a`: that is not allowed. Running a linear matcher once from every
   start position is quadratic too. Simulate the automaton for all start positions at once (a Thompson NFA run
   with a set of states, or a DFA built from it). How deep any recursion goes must not grow with the length of the
   text: texts of 200,000 characters must work.
2. **No built-in regular expressions.** src/regex.mjs must not use JavaScript's regular expressions in any way: no
   `RegExp`, no regular expression literals such as `/\d+/`, no string methods given a regular expression, and no
   `match`, `matchAll` or `search` on strings (they turn a string into a regular expression). The texts `RegExp`,
   `eval(` and `new Function` must not appear anywhere in src/regex.mjs, not even in a comment. The checker looks
   for those texts, and also notices any use of JavaScript's regular expressions while your `compile`, `test` and
   `match` run. src/regex.mjs may import only `node:` modules or other files of your own under src/ that keep the
   same rules. No packages.

## Characters

Patterns and texts are JavaScript strings, read as UTF-16 code units (what `s[i]` and `s.charCodeAt(i)` give): a
"character" below is one code unit, and `index` counts code units. So `.` matches one half of an emoji: `a.b` does
not match `"a😀b"` (four code units), `a..b` does. Matching is case-sensitive: `a` does not match `"A"`.

## The pattern language

```
pattern     = alternation
alternation = sequence { "|" sequence }
sequence    = { piece }                      (may be empty)
piece       = atom [ quantifier ]  |  anchor
atom        = literal | "." | class | escape | "(" alternation ")"
anchor      = "^" | "$"
quantifier  = "*" | "+" | "?" | "{" digits "}" | "{" digits ",}" | "{" digits "," digits "}"
```

- **Literal**: any character that is not one of `\ . [ ( ) | * + ? { ^ $` stands for itself. So `]`, `}`, `-`,
  `,`, `/`, a space and a line break are literals outside a class: `a]` matches `"a]"`, `a}` matches `"a}"`.
- **`.`** matches any character except a line feed (`"\n"`, code 10). It does match `"\r"`.
- **Escapes** are a `\` followed by exactly one of these characters:
  - `d` (a digit `0`–`9`), `w` (`A`–`Z`, `a`–`z`, `0`–`9`, `_`), `s` (exactly these six: space, tab (9), line
    feed (10), vertical tab (11), form feed (12), carriage return (13)); and `D`, `W`, `S`, which match every
    character the lower-case one does not (so `\D` and `\W` match a line feed, and `\S` matches `"\u00a0"`);
  - `n` (line feed), `t` (tab), `r` (carriage return);
  - one of `\ . [ ] ( ) { } | * + ? ^ $ - /`: that character itself (`\.` matches a dot, `\\` a backslash).

  Any other character after `\` is an error (so `\b`, `\1`, `\x41`, `\u0041`, `\,` and `\ ` are errors), and so is
  a `\` at the very end of the pattern.
- **Classes**: `[` starts a class and the next unescaped `]` ends it. If the first character after `[` is `^`, the
  class is negated: it matches every character that is *not* one of its members (a line feed included), and that
  `^` is not a member. A class must have at least one member: `[]` and `[^]` are errors, and so `]` cannot be the
  first member (write `\]`). Members are read one at a time from left to right. A member is one character or an
  escape (the same escapes as above; `\d`-style escapes stand for their whole set). Inside a class, every character
  but `\`, `]` and (as below) `-` stands for itself, `.`, `[`, `(`, `*`, `$`, `|` and a `^` that is not first
  included. When a member is followed by `-` and the character after that `-` is not `]`, the two members and the
  `-` make a **range**: every character whose code is from the first member's to the second's, both included. Both
  ends of a range must be single characters (a literal or an escape such as `\-`, `\]` or `\n`, never `\d`-style),
  and the first must not be above the second. A `-` is a literal member when it begins a member (`[-a]`, `[^-a]`,
  and in `[a-c-e]` the second `-`: that class is `a`, `b`, `c`, `-`, `e`) or comes just before the closing `]`
  (`[a-]`).
- **Groups**: `( … )` groups an alternation, so that a quantifier or `|` applies to all of it. Groups capture
  nothing. `()` is an empty group, which matches the empty text. `(?:…)`, `(?=…)` and the like are not supported:
  the `?` after `(` is a quantifier with nothing to repeat, an error.
- **Alternation**: `x|y` matches what `x` matches or what `y` matches. Any branch may be empty: `a|` matches `"a"`
  or the empty text, and so does `|a`; `|` alone matches the empty text.
- **Quantifiers** apply to the atom just before them: `x*` (zero or more), `x+` (one or more), `x?` (zero or one),
  `x{n}` (exactly n), `x{n,}` (n or more), `x{n,m}` (from n to m, both included). n and m are written in decimal
  digits only (leading zeros allowed: `a{02}` is `a{2}`), with no spaces and no sign. `x{0}` and `x{0,0}` match only
  the empty text. A quantifier cannot follow another quantifier (`a**`, `a+?`, `a{2}{3}` are errors: there are no
  lazy or possessive quantifiers), nor stand at the start of the pattern, right after `(` or `|`, or right after an
  anchor. A `{` is always the start of a quantifier: one that does not continue as `{n}`, `{n,}` or `{n,m}` exactly
  is an error, never a literal (write `\{`). A lone `}` is a literal.
- **Anchors**: `^` matches only at position 0 of the whole text and `$` only at position `text.length` (there is no
  multi-line mode: a line feed in the text changes nothing). They match the empty text there and may appear
  anywhere in the pattern (`a^b` simply never matches). An anchor cannot take a quantifier (`^*` is an error), but a
  group holding one can: `(^a)*`.

No backreferences, no lookaround, no lazy quantifiers, no flags, no `\b`, no Unicode properties.

## Size

The size of a pattern is the size of the whole pattern, worked out from these rules:

- a literal, `.`, a class (however many members), an escape, `^`, `$`: 1 each;
- a group `( x )`: 1 + size(x); a sequence: the sum of its pieces; an alternation: the sum of its branches;
- `x*`, `x+`, `x?`: size(x); `x{n}`: n × size(x); `x{n,}`: (n + 1) × size(x); `x{n,m}`: m × size(x).

A pattern of size above 1000 is an error. `a{1000}` (1000) and `x{999,}` (1000) are allowed; `a{1001}` (1001),
`x{1000,}` (1001), `(ab){334}` (3 × 334 = 1002) and `(a{10}){91}` ((1 + 10) × 91 = 1001) are errors; `(ab){333}`
(999) and `(a{10}){90}` (990) are allowed. Only the size of the whole pattern counts: `(a{1000}){0}` has size 0 and
is allowed (it matches only the empty text).

## What a match is

A match is a pair of positions `s ≤ e` in the text such that `text.slice(s, e)` is matched by the whole pattern,
with `^` true only where the position in the whole text is 0 and `$` only where it is `text.length` (not relative
to `s` or `e`). `match` returns the match with the smallest `s` (leftmost) and, of the matches with that `s`, the
one with the largest `e` (longest): `{ index: s, text: text.slice(s, e) }`. It returns `null` when there is no match
at all. `test(text)` is `true` exactly when `match(text)` is not `null`. Groups and alternation only change which
texts match: the order of the branches never matters, unlike in JavaScript's regular expressions.

```
pattern            text              match
a|ab               "ab"              { index: 0, text: "ab" }   (JavaScript's own engine would give "a")
x*|y*              "yy"              { index: 0, text: "yy" }
(ab|a)(c|bcd)      "abcd"            { index: 0, text: "abcd" }
bcd|ab             "abcd"            { index: 0, text: "ab" }   (leftmost first, then longest)
a*                 "baaa"            { index: 0, text: "" }     (the empty match at 0 is leftmost)
a+                 "baaa"            { index: 1, text: "aaa" }
a|                 "ba"              { index: 0, text: "" }
(a|b){2,3}c        "abbbc"           { index: 1, text: "bbbc" }
ba{0}              "ba"              { index: 0, text: "b" }
^a|b$              "xab"             { index: 2, text: "b" }
(a|$)              "bb"              { index: 2, text: "" }
a.c                "a\nc abc"        { index: 4, text: "abc" }
[a-c-e]+           "x-cab-e"         { index: 1, text: "-cab-e" }
a.*b               "a1b2b3"          { index: 0, text: "a1b2b" }
(empty pattern)    ""                { index: 0, text: "" }
^$                 "a"               null
```

Texts in these tables are written as JavaScript string literals (`"a\nc abc"` holds a line feed).

## Errors

A pattern outside the language is a `SyntaxError` (JavaScript's own class: `err instanceof SyntaxError`) with a
number property `position`, the 0-based index in the pattern where the problem is, and a message that says what is
wrong and names that position as the word `position`, a space and the number: for example
`"nothing to repeat at position 2"`.

Each problem, the `position` it reports, and examples (pattern → position):

- A `\` at the very end of the pattern, inside a class too → the `\`: `a\` → 1, `[a\` → 2.
- A `\` followed by a character not listed under Escapes → the `\`: `\b` → 0, `a\1` → 1, `[\q]` → 1.
- A class with no closing `]` → its `[`: `[abc` → 0, `a[\]` → 1, `[^` → 0.
- An empty class, `[]` or `[^]` → its `[`: `[]` → 0, `x[^]` → 1, `[]a]` → 0.
- A range whose first end is above its second, or with a `\d`-style escape at either end → the range's first
  member: `[z-a]` → 1, `[ab\d-z]` → 3, `[a-\w]` → 1.
- A quantifier with nothing to repeat (at the start of the pattern, right after `(`, `|` or an anchor, or right
  after another quantifier) → the quantifier's first character: `*a` → 0, `a**` → 2, `(+a)` → 1, `a|?` → 2,
  `^*` → 1, `a$+` → 2, `a{2}{3}` → 4, `a*?` → 2, `(?:a)` → 1, `{2}` → 0.
- A `{` that does not continue as `{n}`, `{n,}` or `{n,m}` → the `{`: `a{` → 1, `a{x}` → 1, `a{,2}` → 1,
  `a{1, 2}` → 1, `a{1,2` → 1, `a{-1}` → 1.
- `{n,m}` with n greater than m → the `{`: `a{3,1}` → 1, `(ab){5,2}` → 4.
- A `(` with no closing `)` → that `(`; when several are still open at the end, the one opened last: `(ab` → 0,
  `(a(b` → 2, `((a)` → 0.
- A `)` with no `(` to close → that `)`: `a)` → 1, `())` → 2, `)` → 0.
- A size above 1000 → 0: `a{1001}` → 0, `(ab){334}` → 0.

Which problem is reported when there are several: the pattern is read once, from left to right, and the first
problem met is reported. Each problem is met at its position in the table, except the two "no closing" problems,
which are met only when the end of the pattern is reached; the size is checked last of all, and only for a pattern
with no other problem. So `[z-a` reports the range (1), not the class; `(a{3,1}` reports the `{` (2); `[a\`
reports the `\` (2); `a)(` reports the `)` (1); `(a{2000}` reports the group (0) and `a{2000}(` the group (7), not
the size.

## How the checker times you

Each of these runs in a fresh Node.js process that imports src/regex.mjs, compiles the pattern and calls `test` or
`match` once; the whole process gets 2 seconds, and the result must also be right.

```
pattern            text                                                   call → result
(a*)*b             "a" × 30,000                                           test → false
(a|aa)+$           "a" × 30,000 + "b"                                     test → false
(a?){25}a{25}      ("a" × 24 + "b") × 1,250                               match → null
(x+x+)+y           "x" × 50,000                                           test → false
^(a+)+$            "a" × 30,000 + "!"                                     match → null
^(\w+\s?)*$        30,000 characters of words and single spaces, + "!"    match → null
(a{1,8}){1,8}$     "a" × 20,000 + "b"                                     test → false
(.*a){11}          ("a" + "b" × 2,999) × 10                               test → false
a*b                "a" × 50,000                                           test → false
.*.*=.*            "x" × 30,000                                           test → false
(ab|cd)*e          "ab" × 50,000 + "e"                                    match → the whole text, at 0
an alternation of 24 words of 4 to 9 letters, against 200,000 characters
                   with one of the words only at the very end             match → that word
```
