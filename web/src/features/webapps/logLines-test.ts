// Script test for the Run tab's log rows (logLines.ts): a request line, an error line, a line with something in front of it, a line that is plain words, a line of JSON of another shape.
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/webapps/logLines-test.ts && node dist/dev/logLines-test.js
import assert from 'node:assert/strict';
import { msWords, parseLogLine, timeOf } from './logLines';

const req = parseLogLine('{"t":"2026-11-24T19:01:02.345Z","level":"info","msg":"request","id":"9f1c2a7e","method":"GET","path":"/customers","status":200,"ms":14}');
assert.deepEqual({ ...req, raw: '' }, { raw: '', at: Date.parse('2026-11-24T19:01:02.345Z'), level: 'info', what: 'GET /customers', status: 200, ms: 14, id: '9f1c2a7e' });
assert.match(timeOf(req, 'en-GB'), /^\d\d:\d\d:\d\d$/);

const err = parseLogLine('{"t":"2026-11-24T19:01:03.000Z","level":"error","msg":"error","id":"9f1c2a7e","name":"TypeError","text":"Cannot read properties of undefined"}');
assert.equal(err.level, 'error');
assert.equal(err.what, 'TypeError: Cannot read properties of undefined');
assert.equal(err.status, undefined);

// Something in front of the JSON (a compose service's name): the row is the line, the raw keeps what was in front.
const front = parseLogLine('app-1  | {"t":"2026-11-24T19:01:04.000Z","level":"warn","msg":"request","method":"POST","path":"/api/memos","status":429,"ms":1234.4}');
assert.equal(front.what, 'POST /api/memos');
assert.equal(front.level, 'warn');
assert.equal(front.ms, 1234);
assert.ok(front.raw.startsWith('app-1  |'));

// A message of the app's own, with its fields after it.
const own = parseLogLine('{"t":"2026-11-24T19:01:05.000Z","level":"info","msg":"listening","port":3000}');
assert.equal(own.what, 'listening · port 3000');

// Plain words, a broken line, JSON that is not a log line, an empty line.
for (const l of ['Server started on 3000', '{"t": "2026', '[1,2,3]', '{"a":1}', '']) {
  const r = parseLogLine(l);
  assert.equal(r.level, 'plain', l);
  assert.equal(r.at, null);
  assert.equal(r.what, l.trim());
}

assert.equal(msWords(14), '14 ms');
assert.equal(msWords(1234), '1.2 s');
assert.equal(msWords(12_000), '12 s');
console.log('log lines: ok');
