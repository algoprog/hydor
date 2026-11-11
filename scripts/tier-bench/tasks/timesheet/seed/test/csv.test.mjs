import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCsv, parseCsv } from '../src/csv.mjs';

test('writes one line per row', () => {
  assert.equal(formatCsv([['a', 'b'], ['1', '']]), 'a,b\n1,\n');
});

test('reads what it writes, for plain fields', () => {
  const rows = [['id', 'note'], ['1', 'deploy'], ['2', '']];
  assert.deepEqual(parseCsv(formatCsv(rows)), rows);
});

test('a missing final line feed makes no difference', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});
