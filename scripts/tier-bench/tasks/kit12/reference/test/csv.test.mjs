import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from '../src/csv.mjs';

test('parseCsv', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('"a,b","say ""hi"""'), [['a,b', 'say "hi"']]);
  assert.deepEqual(parseCsv('a\n\nb'), [['a'], [''], ['b']]);
  assert.throws(() => parseCsv('"open'), SyntaxError);
  assert.throws(() => parseCsv('"a"b'), SyntaxError);
});

test('toCsv', () => {
  assert.equal(toCsv([['a', 'b'], ['1', '2']]), 'a,b\r\n1,2');
  assert.equal(toCsv([[1, null, undefined, true]]), '1,,,true');
  assert.equal(toCsv([['a;b', 'c']], { delimiter: ';' }), '"a;b";c');
});
