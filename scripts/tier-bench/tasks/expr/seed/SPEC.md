# src/expr.mjs

A small expression language. The module exports:

- `evaluate(source, variables = {})` → the value of the expression `source`.
- `class ExprError extends Error`, with `name` set to `'ExprError'` and a numeric `position`.

No `eval`, no `new Function`, no `Function(...)`: the file src/expr.mjs must not contain the word `eval` followed by
`(`, nor `new Function`, not even in a comment. No packages.

If `source` is not a string, `evaluate` throws a `TypeError`. Every problem with the expression itself is an
`ExprError` (never a `SyntaxError`, `TypeError`, `RangeError` or anything else). `position` is the 0-based index in
`source` where the problem starts, as listed under "Errors"; `message` is a non-empty string that says what was
expected or what is wrong.

## Values

Numbers (JavaScript doubles), strings, booleans (`true`, `false`) and `null`. `variables` is an object whose values
are of these kinds.

## Tokens

White space (space, tab, `\n`, `\r`) between tokens is ignored. Tokens are read from the longest possible text (so
`**` is one token, never two `*`; `<=` is one token, and so on).

- **Number**: digits, optionally `.` followed by one or more digits, optionally an exponent: `e` or `E`, an optional
  `+` or `-`, one or more digits. The exponent is only part of the number if there are digits after the `e` (and its
  sign), so in `1e` the number is `1` and `e` is a separate name. Numbers do not start with `.` and have no sign.
  Examples: `42`, `0.5`, `1e3` (1000), `2.5E-2`, `007` (7).
- **String**: starts with `'` or `"` and ends at the next unescaped quote of the same kind. Escapes: `\n` (line
  feed), `\t` (tab), `\\`, `\'`, `\"` (the escaped character itself). Any other character after a backslash is an
  error. Any other character, including a raw line break, stands for itself.
- **Name**: a letter or `_`, then letters, digits and `_` (ASCII letters only). `true`, `false` and `null` are
  keywords, not names.
- **Operators and punctuation**: `+ - * / % **`, `< <= > >= == !=`, `&& ||`, `!`, `?`, `:`, `(`, `)`, `,`.
- Any other character is an error. This includes a lone `=`, `&` or `|`, and also `.`, `@`, `#`, `$`, `[`, `{`.

The whole source is split into tokens first. So if it contains a bad character or string anywhere, that is the error
reported (the leftmost one), even if an earlier token would have been a syntax error on its own.

## Grammar, from the loosest operator to the tightest

```
expression  = ternary
ternary     = or [ "?" expression ":" ternary ]
or          = and { "||" and }
and         = comparison { "&&" comparison }
comparison  = additive [ ( "<" | "<=" | ">" | ">=" | "==" | "!=" ) additive ]
additive    = multiplicative { ( "+" | "-" ) multiplicative }
multiplicative = unary { ( "*" | "/" | "%" ) unary }
unary       = ( "-" | "!" ) unary | power
power       = primary [ "**" unary ]
primary     = number | string | "true" | "false" | "null" | name | call | "(" expression ")"
call        = name "(" [ expression { "," expression } ] ")"
```

What this means:

- `+ - * / %` and `&&` and `||` are left-associative: `10 - 2 - 3` is 5, `100 / 10 / 5` is 2, `7 % 4 * 2` is 6.
- `**` is right-associative: `2 ** 3 ** 2` is 512. Its right operand may be a unary expression: `2 ** -1` is 0.5.
  Its left operand is a `primary`, so unary minus is looser than `**`: **`-2 ** 2` is `-4`** (that is
  `-(2 ** 2)`), and `(-2) ** 2` is 4. `2 ** -2 ** 2` is `2 ** (-(2 ** 2))`, which is 0.0625.
- A comparison cannot be chained, and all six comparison operators have the same level: `a < b < c`,
  `a < b == c` and `1 == 1 != 2` are errors; write `(a < b) == c`. `1 + 1 == 2` is `(1 + 1) == 2`.
  `!a == b` is `(!a) == b`.
- The ternary is right-associative: `a ? b : c ? d : e` is `a ? b : (c ? d : e)`. The middle part is a full
  expression.
- A name followed by `(` is a function call; any other name is a variable.
- The source must be one complete expression. Extra tokens after it are an error.

## Meaning

Both operands of a binary operator are evaluated (left first) before the operator's own checks. `&&`, `||` and the
ternary only evaluate what they need (see below), so a problem in a part that is skipped is never an error: all the
errors in "Meaning" are found only when the part that has them is evaluated. (Syntax errors are different: the whole
source is parsed before anything is evaluated.)

- **Variables**: a name is defined only if it is an own property of `variables` (so `toString` and `constructor`
  are not defined, unless the object has them as own properties). An undefined name is an error when evaluated.
- **Truthiness** (used by `!`, `&&`, `||`, `?:`): `false`, `null`, `0`, `NaN` and `''` are falsy; everything else is
  truthy.
- `!x` is `true` if `x` is falsy, else `false`. It never fails.
- Unary `-` needs a number.
- `+` adds two numbers or joins two strings. Number plus string, or anything else, is an error.
- `-  *  /  %  **` need two numbers. `%` is JavaScript's `%` (`-7 % 3` is `-1`). `**` is JavaScript's `**`.
  `/` or `%` with a right operand of 0 (or -0) is an error ("division by zero"), even for `0 / 0`.
- `< <= > >=` compare two numbers, or two strings by UTF-16 code units (as JavaScript does). Anything else is an
  error.
- `==` and `!=` accept any two values and never fail: they are JavaScript's `===` and `!==` (no conversions, so
  `1 == '1'` is `false` and `null == null` is `true`).
- `a && b`: if `a` is falsy the result is `a` (and `b` is not evaluated), otherwise the result is `b`.
  `a || b`: if `a` is truthy the result is `a` (and `b` is not evaluated), otherwise the result is `b`.
  So `0 || 'x'` is `'x'`, `1 && 'y'` is `'y'`, `null && 1` is `null`, `'' || null` is `null`.
- `c ? a : b` evaluates `c`, then only `a` if `c` is truthy, otherwise only `b`.
- **Functions** (names are case-sensitive; a name that is not one of these six is an unknown function):
  - `min(a, b, ...)` and `max(a, b, ...)`: one or more numbers; the smallest or the largest.
  - `abs(x)`: one number; its absolute value.
  - `round(x, digits = 0)`: one or two numbers. `digits` must be an integer from 0 up (otherwise an error). The
    result is `sign(x) * Math.round(Math.abs(x) * 10 ** digits) / 10 ** digits`, so halves round away from zero:
    `round(2.5)` is 3, `round(-2.5)` is -3, `round(3.14159, 2)` is 3.14.
  - `len(s)`: one string; its length in UTF-16 code units.
  - `upper(s)`: one string; `s.toUpperCase()`.
  - The number of arguments is checked first, before any argument is evaluated. Then the arguments are evaluated
    from left to right, then their types are checked from left to right.

## Errors and their positions

All are thrown as `ExprError`. The position is the index of the first character of the token or expression named.

Reading the source (found before parsing starts):

- A character that cannot start a token → the position of that character.
- A string that is never closed → the position of its opening quote.
- A backslash followed by anything other than `n`, `t`, `\`, `'`, `"` (or by nothing) → the position of the backslash.

Parsing:

- A token that cannot continue the expression where it is → the position of that token. This covers a missing
  operand (`1 + * 2` → position 4; `* 2` → 0; `()` → 1; `min(1,)` → 6; `a ? b` with its `:` missing, when the next token is
  something else), a token left over after a complete expression (`1 2` → 2; `(1) (2)` → 4; `1 )` → 2), a second
  comparison operator in a chain (`1 < 2 < 3` → 6), and a missing `)`, `:` or `,` when another token is there instead.
- The source ending where something is still expected (an operand, `)`, `:`) → position `source.length` (the length
  of the whole source, trailing white space included). An empty or all-white-space source is this error too:
  `''` → 0, `'  '` → 2. `1 +` → 3. `(1` → 2. `min(1, 2` → 8.

Evaluation (only for the parts that are evaluated):

- An undefined variable → the position of the name.
- A call to a name that is not one of the six functions (also when that name is a variable) → the position of the
  name.
- A wrong number of arguments → the position of the function name.
- A wrong type in a function argument → the position of the first character of that argument's expression
  (`min(1, 'a')` → 7; `round(2, (1.5))` → 9). A `round` digits value that is not an integer from 0 up is this
  error, at the digits argument.
- A wrong type for an operator (unary or binary), or division or modulo by zero → the position of the operator
  token (`'a' - 1` → 4; `-'a'` → 0; `1 / 0` → 2; `1 + 'a'` → 2; `'a' < 1` → 4).

## Examples

| source | variables | result |
| --- | --- | --- |
| `1 + 2 * 3` | | `7` |
| `(1 + 2) * 3` | | `9` |
| `-2 ** 2` | | `-4` |
| `2 ** 3 ** 2` | | `512` |
| `1e3 + 2.5E-1` | | `1000.25` |
| `'a' + "b" + 'it\'s'` | | `"abit's"` |
| `'tab\there'` | | the text `tab`, a tab, `here` |
| `x > 3 && 'big' \|\| 'small'` | `{ x: 5 }` | `'big'` |
| `0 \|\| null` | | `null` |
| `false && missing` | | `false` (`missing` is never evaluated) |
| `a ? 1 : b ? 2 : 3` | `{ a: false, b: true }` | `2` |
| `round(2.5) + abs(-1) + len('abc')` | | `7` |
| `upper('hi') == 'HI'` | | `true` |
| `1 < 2 < 3` | | `ExprError`, position 6 |
| `1 / 0` | | `ExprError`, position 2 |
| `'a' + 1` | | `ExprError`, position 4 |
| `x + 1` | `{}` | `ExprError`, position 0 |
| `min()` | | `ExprError`, position 0 |
