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

test('fields with a comma, a quote or a line break are quoted, quotes doubled', () => {
  assert.equal(formatCsv([['a,b', 'say "hi"', 'one\ntwo', 'cr\r', ' padded ']]), '"a,b","say ""hi""","one\ntwo","cr\r", padded \n');
});

test('reads quoted fields, with commas, quotes and line breaks in them', () => {
  assert.deepEqual(parseCsv('1,"a,b","say ""hi""","one\r\ntwo",x\r\n'), [['1', 'a,b', 'say "hi"', 'one\r\ntwo', 'x']]);
});

test('reads rows ended by CR LF, and keeps spaces and empty fields', () => {
  assert.deepEqual(parseCsv('a, b ,\r\n,,\r\n'), [['a', ' b ', ''], ['', '', '']]);
});

test('a field that is never closed is an error', () => {
  assert.throws(() => parseCsv('1,"open\n'), /CSV/);
});

test('what is written can be read back', () => {
  const rows = [['1', 'a "b", c', 'x\r\ny', ' lead'], ['2', '', ',', '"']];
  assert.deepEqual(parseCsv(formatCsv(rows)), rows);
});
