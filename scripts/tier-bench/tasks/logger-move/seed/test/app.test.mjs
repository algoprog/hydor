import test from 'node:test';
import assert from 'node:assert/strict';
import { runApp } from '../src/app.mjs';
import { sink } from '../src/logger.mjs';

test('the app runs and logs at every level', () => {
  const quiet = console.log;
  console.log = () => {};
  let result;
  try {
    result = runApp();
  } finally {
    console.log = quiet;
  }
  assert.equal(result.port, 80);
  assert.equal(result.flaky, 'done');
  assert.deepEqual(result.ok, [true, false, false]);
  assert.ok(sink.some((e) => e.level === 'info'));
  assert.ok(sink.some((e) => e.level === 'warn'));
  assert.ok(sink.some((e) => e.level === 'error'));
  assert.equal(sink[0].message, 'app starting');
});
