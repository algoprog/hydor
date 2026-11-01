// Script tests for forms MCP servers ask for (elicit.ts, shared/forms.ts) and the cards the app shows
// itself in a session (LiveAdapter.ask):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/elicit-test.ts && node dist/dev/elicit-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { formContent, formFields } from '../../shared/forms.ts';
import { elicitCard, elicitCheck, elicitResult } from './elicit.ts';
import { LiveAdapter } from './live.ts';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const schema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email', title: 'Your email' },
    day: { type: 'string', format: 'date', description: 'When you come' },
    size: { type: 'string', oneOf: [{ const: 's', title: 'Small' }, { const: 'l', title: 'Large' }], default: 'l' },
    extras: { type: 'array', items: { anyOf: [{ const: 'milk', title: 'Milk' }, { const: 'sugar', title: 'Sugar' }, { const: 'ice', title: 'Ice' }] }, maxItems: 2 },
    count: { type: 'integer', minimum: 1 },
    note: { type: 'string', maxLength: 1000 },
    when: { type: 'string', format: 'date-time' },
  },
  required: ['email', 'size'],
};

test('fields: the schema’s order, labels from titles or names, the right control for each', () => {
  const f = formFields(schema);
  assert.deepEqual(
    f.map((x) => `${x.id}:${x.label}:${x.type}${x.multi ? '+' : ''}${x.required ? '*' : ''}`),
    ['email:Your email:text*', 'day:Day:date', 'size:Size:choice*', 'extras:Extras:choice+', 'count:Count:number', 'note:Note:long', 'when:When:text'],
  );
  assert.equal(f[0].placeholder, 'name@example.com');
  assert.equal(f[1].help, 'When you come');
  assert.deepEqual(f[2].options, ['Small', 'Large']);
  assert.equal(f[2].default, 'Large');
  assert.equal(f[4].help, 'At least 1');
  assert.deepEqual(formFields(null), []);
});

test('content: typed as the schema says, choices mapped back to their values, empty ones left out', () => {
  const { content, errors } = formContent(schema, { email: 'ada@example.com', day: '2026-11-03', size: 'Small', extras: 'Milk\nIce', count: '3', note: '', when: '2026-11-03 19:30' });
  assert.deepEqual(errors, {});
  assert.equal(content.email, 'ada@example.com');
  assert.equal(content.size, 's');
  assert.deepEqual(content.extras, ['milk', 'ice']);
  assert.equal(content.count, 3);
  assert.equal('note' in content, false);
  assert.match(String(content.when), /^2026-11-03T\d\d:30:00\.000Z$/);
});

test('content: what to fix, by field', () => {
  const { errors } = formContent(schema, { email: 'not an email', size: '', extras: 'Milk\nSugar\nIce', count: '0.5' });
  assert.deepEqual(errors, { email: 'An email address, please', size: 'Needed', extras: 'Pick at most 2', count: 'A whole number, please' });
  const card = { decision: 'accept', form: { email: 'x', size: 'Small' } };
  assert.equal(elicitCheck({ requestedSchema: schema }, card), 'Your email: An email address, please');
  assert.equal(elicitCheck({ requestedSchema: schema }, { decision: 'decline' }), null);
});

test('cards: a form, a yes/no question, a page to open', () => {
  const form = elicitCard('f1', 'Calendar', { message: 'Which day?', requestedSchema: schema }, { app: true });
  assert.equal(form.title, 'Calendar asks you to fill in a form');
  assert.equal(form.from, 'Calendar');
  assert.equal(form.options[0].label, 'Send');
  assert.equal(form.form?.fields.length, 7);
  const yes = elicitCard('f2', 'Codex', { message: 'Run the tool?', requestedSchema: { type: 'object', properties: {} } });
  assert.equal(yes.title, 'Codex asks to go ahead');
  assert.equal(yes.form, undefined);
  assert.equal(yes.from, undefined);
  const page = elicitCard('f3', 'Bank', { mode: 'url', url: 'https://bank.example/consent', message: 'Approve the payment there' });
  assert.equal(page.title, 'Bank asks you to open a page');
  assert.equal(page.form?.url, 'https://bank.example/consent');
  assert.equal(elicitCard('f4', 'Bad', { mode: 'url', url: 'javascript:alert(1)' }).form, undefined);
});

test('results: accept with content, decline, cancel, and no answer at all', () => {
  const p = { requestedSchema: schema };
  assert.deepEqual(elicitResult(p, { decision: 'accept', form: { email: 'a@b.co', size: 'Large' } }), { action: 'accept', content: { email: 'a@b.co', size: 'l' } });
  assert.deepEqual(elicitResult(p, { decision: 'decline' }), { action: 'decline' });
  assert.deepEqual(elicitResult(p, { decision: 'cancel' }), { action: 'cancel' });
  assert.deepEqual(elicitResult(p, null), { action: 'cancel' });
  assert.deepEqual(elicitResult({ mode: 'url', url: 'https://x.example' }, { decision: 'accept' }), { action: 'accept' });
});

/** An adapter with nothing behind it: just the base class's cards. */
class Bare extends LiveAdapter {
  readonly agent = 'claude' as const;
  async sendMessage() {}
  async interrupt() {}
  async answer() {}
  async configure() {}
  async stopTask() {}
  async rename() {}
  clear() {
    this.approvals.clear();
    this.changed();
  }
  work() {
    this.state.status = 'working';
    this.changed();
  }
}
const bare = () => new Bare(new EventEmitter() as any);

test('the app’s own card: the session waits, a wrong answer is refused and the card stays, a right one ends it', async () => {
  const a = bare();
  a.work();
  const card = elicitCard('c1', 'Calendar', { requestedSchema: schema }, { app: true });
  const got = a.ask(card, { check: (x) => elicitCheck({ requestedSchema: schema }, x) });
  assert.equal(a.state.status, 'waiting');
  assert.equal(a.state.pendingApprovals, 1);
  assert.throws(() => a.answerAside('c1', { decision: 'accept', form: { email: 'nope', size: 'Small' } }), /Your email/);
  assert.equal(a.approvals.has('c1'), true);
  // Something the agent does meanwhile does not hide that it waits.
  a.work();
  assert.equal(a.state.status, 'waiting');
  assert.equal(a.answerAside('other', { decision: 'accept' }), false);
  assert.equal(a.answerAside('c1', { decision: 'accept', form: { email: 'a@b.co', size: 'Small' } }), true);
  assert.deepEqual(await got, { decision: 'accept', form: { email: 'a@b.co', size: 'Small' } });
  assert.equal(a.state.status, 'working');
  assert.equal(a.approvals.size, 0);
});

test('the app’s own card ends with no answer when the turn clears the cards, the caller gives up, or the agent stops', async () => {
  const a = bare();
  a.work();
  const one = a.ask(elicitCard('c2', 'X', {}));
  a.clear();
  assert.equal(await one, null);
  const ac = new AbortController();
  const two = a.ask(elicitCard('c3', 'X', {}), { signal: ac.signal });
  ac.abort();
  assert.equal(await two, null);
  assert.equal(a.approvals.size, 0);
  const three = a.ask(elicitCard('c4', 'X', {}));
  (a.runner as unknown as EventEmitter).emit('exit', { code: 0 });
  assert.equal(await three, null);
  assert.equal(await a.ask(elicitCard('c5', 'X', {})), null);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
