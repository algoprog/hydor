import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, ExprError } from '../src/expr.mjs';

test('precedence and associativity', () => {
  assert.equal(evaluate('1 + 2 * 3'), 7);
  assert.equal(evaluate('-2 ** 2'), -4);
  assert.equal(evaluate('2 ** 3 ** 2'), 512);
  assert.equal(evaluate('10 - 2 - 3'), 5);
  assert.equal(evaluate('a ? 1 : b ? 2 : 3', { a: false, b: true }), 2);
});

test('strings, logic and functions', () => {
  assert.equal(evaluate(`'a' + "b" + 'it\\'s'`), "abit's");
  assert.equal(evaluate('0 || null'), null);
  assert.equal(evaluate('false && missing'), false);
  assert.equal(evaluate('round(2.5) + abs(-1) + len("abc")'), 7);
});

test('errors carry positions', () => {
  const pos = (src, vars) => {
    try {
      evaluate(src, vars);
    } catch (e) {
      assert.ok(e instanceof ExprError);
      return e.position;
    }
    assert.fail(`no error for ${src}`);
  };
  assert.equal(pos('1 < 2 < 3'), 6);
  assert.equal(pos('1 / 0'), 2);
  assert.equal(pos("'a' + 1"), 4);
  assert.equal(pos('x + 1', {}), 0);
  assert.equal(pos('min()'), 0);
  assert.equal(pos('1 +'), 3);
});
