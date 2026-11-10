import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIni, stringifyIni } from '../src/ini.mjs';

test('parseIni', () => {
  const text = 'top = 1\n; note\n[server]\nhost = "my host"\nmsg = "a\\nb"\nport = 80\n[server]\nport = 8080\n';
  assert.deepEqual(parseIni(text), { '': { top: '1' }, server: { host: 'my host', msg: 'a\nb', port: '8080' } });
  assert.deepEqual(parseIni(''), {});
  assert.throws(() => parseIni('a = 1\nb\n'), (e) => e instanceof SyntaxError && /line 2/.test(e.message));
});

test('stringifyIni', () => {
  const obj = { '': { a: '1' }, s: { b: ' x ', c: 'say "hi"', d: 'l1\nl2', e: '' } };
  assert.equal(stringifyIni(obj), 'a = 1\n[s]\nb = " x "\nc = say "hi"\nd = "l1\\nl2"\ne =\n');
  assert.deepEqual(parseIni(stringifyIni(obj)), obj);
  assert.equal(stringifyIni({}), '');
});
