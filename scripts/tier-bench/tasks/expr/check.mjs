// Hidden checker for expr. Run: node check.mjs <workdir>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const load = () => import(pathToFileURL(path.join(dir, 'src/expr.mjs')).href);
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

// 0 and -0 are not told apart (the spec does not say), NaN equals NaN.
const same = (a, b) => (a === 0 && b === 0) || Object.is(a, b);

// Table of [source, variables, expected value].
function values(name, rows) {
  test(name, async () => {
    const { evaluate } = await load();
    for (const [src, vars, expected] of rows) {
      const got = evaluate(src, vars);
      assert.ok(same(got, expected), `${src} → ${String(got)} (expected ${String(expected)})`);
    }
  });
}
// Table of [source, variables, position].
function errors(name, rows) {
  test(name, async () => {
    const { evaluate, ExprError } = await load();
    for (const [src, vars, position] of rows) {
      let err;
      try {
        evaluate(src, vars);
      } catch (e) {
        err = e;
      }
      assert.ok(err, `${JSON.stringify(src)} did not throw`);
      assert.ok(err instanceof ExprError, `${JSON.stringify(src)} threw ${err.name}, not ExprError`);
      assert.equal(err.name, 'ExprError');
      assert.equal(err.position, position, `${JSON.stringify(src)}: position ${err.position}, expected ${position}`);
      assert.ok(typeof err.message === 'string' && err.message.length > 0);
    }
  });
}

test('no eval and no Function constructor in src/expr.mjs', () => {
  const code = fs.readFileSync(path.join(dir, 'src/expr.mjs'), 'utf8');
  assert.ok(!/\beval\s*\(/.test(code), 'uses eval(');
  assert.ok(!/new\s+Function\b/.test(code), 'uses new Function');
  assert.ok(!/\bFunction\s*\(/.test(code), 'uses Function(');
});
test('exports evaluate and ExprError', async () => {
  const { evaluate, ExprError } = await load();
  assert.equal(typeof evaluate, 'function');
  const e = new ExprError('x', 3);
  assert.ok(e instanceof Error);
});
test('a non-string source is a TypeError', async () => {
  const { evaluate } = await load();
  for (const bad of [42, null, undefined, {}]) assert.throws(() => evaluate(bad), TypeError);
});

values('numbers', [
  ['42', {}, 42], ['0.5', {}, 0.5], ['1e3', {}, 1000], ['2.5E-2', {}, 0.025], ['1e+2', {}, 100], ['007', {}, 7],
  ['  3  ', {}, 3], ['\t1\n+\r\n2', {}, 3], ['1E3 + 1e-1', {}, 1000.1],
]);
values('arithmetic precedence', [
  ['1 + 2 * 3', {}, 7], ['(1 + 2) * 3', {}, 9], ['2 * 3 + 4 * 5', {}, 26], ['10 / 4', {}, 2.5], ['7 % 4', {}, 3], ['-7 % 3', {}, -1],
  ['7 % 4 * 2', {}, 6], ['2 + 3 * 4 ** 2', {}, 50], ['2 * 3 % 4', {}, 2],
]);
values('left associativity', [['10 - 2 - 3', {}, 5], ['100 / 10 / 5', {}, 2], ['2 - 3 + 4', {}, 3], ['24 / 4 * 2', {}, 12], ['20 % 7 % 4', {}, 2]]);
values('power: right associative, tighter than unary minus', [
  ['2 ** 3 ** 2', {}, 512], ['-2 ** 2', {}, -4], ['(-2) ** 2', {}, 4], ['2 ** -1', {}, 0.5], ['2 ** -2 ** 2', {}, 0.0625],
  ['-2 ** 2 ** 2', {}, -16], ['3 ** 2 * 2', {}, 18], ['2 * 3 ** 2', {}, 18], ['- -2', {}, 2],
]);
values('unary operators', [
  ['-3', {}, -3], ['--3', {}, 3], ['-(1 + 2)', {}, -3], ['!true', {}, false], ['!0', {}, true], ['!!"a"', {}, true], ['!null', {}, true],
  ["!''", {}, true], ['!"0"', {}, false], ['!(0 / 1)', {}, true], ['!x', { x: NaN }, true], ['-x * 2', { x: 3 }, -6], ['- 2 ** 2 + 10', {}, 6],
]);
values('strings and escapes', [
  [`'a' + "b" + 'it\\'s'`, {}, "abit's"], [`"say \\"hi\\""`, {}, 'say "hi"'], [`'tab\\there'`, {}, 'tab\there'], [`'line\\nbreak'`, {}, 'line\nbreak'],
  [`'back\\\\slash'`, {}, 'back\\slash'], [`''`, {}, ''], [`"it's"`, {}, "it's"], [`'say "x"'`, {}, 'say "x"'], ["'raw\nbreak'", {}, 'raw\nbreak'],
  ["'a' + ''", {}, 'a'], ["'é☃'", {}, 'é☃'],
]);
values('comparisons', [
  ['1 < 2', {}, true], ['2 <= 2', {}, true], ['3 > 4', {}, false], ['4 >= 5', {}, false], ["'a' < 'b'", {}, true], ["'B' < 'a'", {}, true], ["'abc' <= 'abd'", {}, true],
  ["'10' < '9'", {}, true], ['1 + 1 == 2', {}, true], ['2 * 2 != 5', {}, true], ['!a == b', { a: false, b: true }, true], ['(1 < 2) == true', {}, true],
]);
values('equality is strict and never fails', [
  ["1 == '1'", {}, false], ["1 != '1'", {}, true], ['null == null', {}, true], ['null == false', {}, false], ['true == 1', {}, false], ["'a' == 'a'", {}, true],
  ['x == x', { x: NaN }, false], ['0 == -0', {}, true], ['null != 0', {}, true],
]);
values('+ joins strings or adds numbers', [["'a' + 'b'", {}, 'ab'], ["'' + ''", {}, ''], ['1 + 2 + 3', {}, 6], ["upper('a') + 'b'", {}, 'Ab']]);
values('variables', [
  ['x + y', { x: 1, y: 2 }, 3], ['name + "!"', { name: 'hi' }, 'hi!'], ['flag', { flag: true }, true], ['n', { n: null }, null], ['_a1 * 2', { _a1: 4 }, 8],
  ['trueish', { trueish: 5 }, 5], ['toString', { toString: 'own' }, 'own'], ['e', { e: 2 }, 2], ['1 + e', { e: 2 }, 3],
]);
values('&& and || return the deciding operand', [
  ['0 || "x"', {}, 'x'], ['1 && "y"', {}, 'y'], ['null && 1', {}, null], ["'' || null", {}, null], ['"a" || "b"', {}, 'a'], ['0 && 1', {}, 0], ['1 && 2 && 3', {}, 3],
  ['0 || 0 || 5', {}, 5], ["x > 3 && 'big' || 'small'", { x: 5 }, 'big'], ["x > 3 && 'big' || 'small'", { x: 1 }, 'small'], ['1 || 0 && 0', {}, 1], ['0 && 0 || 7', {}, 7],
  ['NaN || 4', { NaN: NaN }, 4],
]);
values('short circuit skips errors and unknown names', [
  ['false && missing', {}, false], ['true || missing', {}, true], ['0 && 1 / 0', {}, 0], ['1 || nope(1)', {}, 1], ['true ? 1 : missing', {}, 1], ['false ? missing : 2', {}, 2],
  ["null && 'a' + 1", {}, null], ['1 || -"x"', {}, 1],
]);
values('ternary', [
  ['1 ? 2 : 3', {}, 2], ['0 ? 2 : 3', {}, 3], ['a ? 1 : b ? 2 : 3', { a: false, b: true }, 2], ['a ? 1 : b ? 2 : 3', { a: false, b: false }, 3], ['a ? b ? 1 : 2 : 3', { a: true, b: false }, 2],
  ['1 > 2 ? "x" : "y"', {}, 'y'], ['true ? 1 : 2 + 10', {}, 1], ['false ? 1 : 2 + 10', {}, 12], ['true ? false ? 1 : 2 : 3', {}, 2], ['(1 ? 2 : 3) + 1', {}, 3],
  ['1 ? 0 || 5 : 9', {}, 5], ['x ? "a" : "b" + "c"', { x: 0 }, 'bc'],
]);
values('functions', [
  ['min(3, 1, 2)', {}, 1], ['max(3, 1, 2)', {}, 3], ['min(5)', {}, 5], ['max(-1, -5)', {}, -1], ['abs(-3.5)', {}, 3.5], ['abs(2)', {}, 2],
  ['len("héllo")', {}, 5], ['len("")', {}, 0], ["upper('abc1')", {}, 'ABC1'], ['min(1 + 1, 3 - 2)', {}, 1], ['max(min(1, 2), abs(-3))', {}, 3], ['len(upper("ab") + "c")', {}, 3],
]);
values('round', [
  ['round(2.5)', {}, 3], ['round(-2.5)', {}, -3], ['round(2.4)', {}, 2], ['round(-2.4)', {}, -2], ['round(3.14159, 2)', {}, 3.14], ['round(2.675, 1)', {}, 2.7],
  ['round(1234, 0)', {}, 1234], ['round(0.5)', {}, 1], ['round(1.005, 2)', {}, 1], ['round(-0.15, 1)', {}, -0.2], ['round(1.25, 1)', {}, 1.3], ['round(7, 3)', {}, 7],
]);
values('mixed examples from the spec', [
  ['round(2.5) + abs(-1) + len("abc")', {}, 7], ["upper('hi') == 'HI'", {}, true], ['1e3 + 2.5E-1', {}, 1000.25], ['a || b && c', { a: 0, b: 1, c: 2 }, 2],
  ["'x' + (1 < 2 ? 'yes' : 'no')", {}, 'xyes'], ['max(1, 2) ** 2 - -1', {}, 5],
]);

errors('lexing errors: bad characters', [
  ['1 = 2', {}, 2], ['a & b', { a: 1, b: 1 }, 2], ['a | b', { a: 1, b: 1 }, 2], ['1 . 5', {}, 2], ['1.', {}, 1], ['@', {}, 0], ['1 + #', {}, 4], ['x$', { x: 1 }, 1],
  ['[1]', {}, 0], ['{', {}, 0], ['1 + 2 ; 3', {}, 6], ['.5', {}, 0], ['é', {}, 0], ['1.5.2', {}, 3],
]);
errors('lexing errors: strings', [
  ["'abc", {}, 0], ['1 + "abc', {}, 4], ["'a\\qb'", {}, 2], ["'abc\\", {}, 4], ["'it\\'s", {}, 0], ['"a\\', {}, 2],
]);
errors('the leftmost lexing error wins over earlier syntax errors', [['1 2 @', {}, 4], ['* 2 "x', {}, 4], ['(1 + ] ', {}, 5]]);
errors('syntax errors: missing operand', [
  ['1 + * 2', {}, 4], ['* 2', {}, 0], ['()', {}, 1], ['min(1,)', {}, 6], ['1 + )', {}, 4], ['-', {}, 1], ['!', {}, 1], ['2 ** ', {}, 5], ['(1 + )', {}, 5], [', 1', {}, 0],
  ['1 ? : 2', {}, 4], ['1 ? 2 : )', {}, 8], ['1 && || 2', {}, 5],
]);
errors('syntax errors: tokens left over or wrong token', [
  ['1 2', {}, 2], ['(1) (2)', {}, 4], ['1 )', {}, 2], ['1 ? 2 3', {}, 6], ['a b', { a: 1, b: 2 }, 2], ["'a' 'b'", {}, 4], ['1 + 2 )', {}, 6], ['min(1 2)', {}, 6], ['1e', { e: 1 }, 1],
  ['true false', {}, 5], ['(1 2)', {}, 3],
]);
errors('syntax errors: the source ends too soon', [
  ['', {}, 0], ['  ', {}, 2], ['\n\t ', {}, 3], ['1 +', {}, 3], ['1 + ', {}, 4], ['(1', {}, 2], ['min(1, 2', {}, 8], ['1 ? 2', {}, 5], ['1 ? 2 :', {}, 7], ['min(', {}, 4], ['f(1,', {}, 4], ['-  ', {}, 3],
]);
errors('comparisons do not chain', [
  ['1 < 2 < 3', {}, 6], ['1 < 2 == true', {}, 6], ['1 == 1 != 2', {}, 7], ['a <= b >= c', { a: 1, b: 2, c: 3 }, 7], ['1 + 1 == 2 == true', {}, 11],
]);
test('a parenthesised comparison can be compared again', async () => {
  const { evaluate } = await load();
  assert.equal(evaluate('(1 < 2) == true'), true);
  assert.equal(evaluate('1 < 2 && 2 < 3'), true);
  assert.equal(evaluate('1 < 2 ? 1 < 3 : 0'), true);
});
errors('evaluation errors: names', [
  ['x + 1', {}, 0], ['1 + y', {}, 4], ['toString', {}, 0], ['constructor', {}, 0], ['foo(1)', {}, 0], ['1 + nope(2)', {}, 4], ['x(1)', { x: 5 }, 0], ['MIN(1)', {}, 0], ['foo(missing)', {}, 0],
  ['true ? undefinedName : 1', {}, 7],
]);
errors('evaluation errors: argument counts', [
  ['min()', {}, 0], ['max()', {}, 0], ['abs()', {}, 0], ['abs(1, 2)', {}, 0], ['round()', {}, 0], ['round(1, 2, 3)', {}, 0], ['len()', {}, 0], ['len("a", "b")', {}, 0], ['upper()', {}, 0],
  ['1 + abs()', {}, 4], ['abs(1, missing)', {}, 0], ['upper(1, 2, 3)', {}, 0],
]);
errors('evaluation errors: argument types and the position of the argument', [
  ["min(1, 'a')", {}, 7], ['round(2, (1.5))', {}, 9], ['abs("x")', {}, 4], ['len(5)', {}, 4], ['upper(null)', {}, 6], ["max('a', 1)", {}, 4], ['round("x", 1)', {}, 6],
  ['round(1.5, -1)', {}, 11], ['round(1.5, 0.5)', {}, 11], ['round(1.5, "1")', {}, 11], ['len(1 + 2)', {}, 4], ['abs(1 < 2 ? "a" : "b")', {}, 4], ['min(2, 1 + 1, true)', {}, 14],
  ['abs((1) == 1)', {}, 4], ['len(("a") && 2)', {}, 4], ['len(x ? 1 : 2)', { x: 1 }, 4],
]);
errors('evaluation errors: operator types, at the operator', [
  ["'a' - 1", {}, 4], ["-'a'", {}, 0], ["1 + 'a'", {}, 2], ["'a' + 1", {}, 4], ['true + 1', {}, 5], ['null * 2', {}, 5], ['1 - null', {}, 2], ['2 ** "x"', {}, 2], ["'a' % 2", {}, 4],
  ["'a' < 1", {}, 4], ['1 >= null', {}, 2], ['true < false', {}, 5], ['-null', {}, 0], ['-true', {}, 0], ['1 + (2 * "a")', {}, 7], ['x / y', { x: 'a', y: 1 }, 2],
]);
errors('evaluation errors: division and modulo by zero', [
  ['1 / 0', {}, 2], ['1 % 0', {}, 2], ['0 / 0', {}, 2], ['5 / (2 - 2)', {}, 2], ['x % y', { x: 1, y: 0 }, 2], ['1 / -0', {}, 2], ['1 + 2 / 0', {}, 6], ['(1 / 0) + (1 / 0)', {}, 3],
]);
errors('both operands are evaluated before the operator is checked', [
  ["'a' + missing", {}, 6], ['missing + 1 / 0', {}, 0], ['1 / 0 + missing', {}, 2], ["(1 + 'a') * missing", {}, 3], ["'a' - missing", {}, 6], ['2 ** x / 0', { x: 'a' }, 2],
]);

const failed = [];
for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (e) {
    failed.push(name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
