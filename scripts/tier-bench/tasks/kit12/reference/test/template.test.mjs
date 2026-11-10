import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/template.mjs';

const data = { user: { name: 'Ann & Bo', age: 0 }, list: ['x', 'y'], html: '<b>' };

test('render', () => {
  assert.equal(render('Hi {{user.name}}!', data), 'Hi Ann &amp; Bo!');
  assert.equal(render('{{ user.age }}', data), '0');
  assert.equal(render('{{html}} {{{ html }}}', data), '&lt;b&gt; <b>');
  assert.equal(render('\\{{ user.name }} stays', data), '{{ user.name }} stays');
  assert.equal(render('{{ list.1 }}{{ nope.deeper }}.', data), 'y.');
  assert.throws(() => render('{{ user.name', data), SyntaxError);
});
