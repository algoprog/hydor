// Script test for words a card or a page gives the message box (featureEvents.ts): when they are sent at once and when
// they wait in the box, that a double click sends once, and that composeInsert says what the box did with them.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/lib/featureEvents-test.ts && node dist/dev/featureEvents-test.js
import assert from 'node:assert/strict';
import { composeAction, composeInsert, putText, RESEND_MS, type ComposeDetail } from './featureEvents';

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
  }
};

const words = (text: string, more: Partial<ComposeDetail> = {}): ComposeDetail => ({ text, key: 's1', ...more });
const empty = { text: '', files: 0, canSend: true };
const writing = { text: 'half a thought', files: 0, canSend: true };
const never = { text: '', at: 0 };
const NOW = 1_000_000;

test('a Send button sends at once, into an empty box or beside what is being written', () => {
  assert.equal(composeAction(words('I’ll go with: B', { send: true }), empty, never, NOW), 'send');
  assert.equal(composeAction(words('I’ll go with: B', { send: true }), writing, never, NOW), 'send');
  assert.equal(composeAction(words('I’ll go with: B', { send: true }), { text: '', files: 2, canSend: true }, never, NOW), 'send');
});

test('a follow-up sends only into an empty box, and otherwise joins what is written', () => {
  assert.equal(composeAction(words('Tell me more', { send: 'empty' }), empty, never, NOW), 'send');
  assert.equal(composeAction(words('Tell me more', { send: 'empty' }), writing, never, NOW), 'add');
  assert.equal(composeAction(words('Tell me more', { send: 'empty' }), { text: '  ', files: 1, canSend: true }, never, NOW), 'add');
});

test('a box that cannot send now (a message on its way, a session elsewhere) takes the words in', () => {
  assert.equal(composeAction(words('I rolled 4', { send: true }), { ...empty, canSend: false }, never, NOW), 'add');
  assert.equal(composeAction(words('Tell me more', { send: 'empty' }), { ...empty, canSend: false }, never, NOW), 'add');
});

test('without send, with a choice to replace, with files or with no words, they go in the box', () => {
  assert.equal(composeAction(words('Ask about this'), empty, never, NOW), 'add');
  assert.equal(composeAction(words('Option B', { send: true, replace: 'Option A' }), empty, never, NOW), 'add');
  assert.equal(composeAction(words('About this part', { send: true, files: [{ id: 'f1' }] }), empty, never, NOW), 'add');
  assert.equal(composeAction(words('   ', { send: true }), empty, never, NOW), 'add');
});

test('the same words again within a moment (a double click) go once; later, or other words, go again', () => {
  const last = { text: 'I’ll go with: B', at: NOW };
  assert.equal(composeAction(words('I’ll go with: B ', { send: true }), empty, last, NOW + 200), 'again');
  // Even when the box is busy with the first one: nothing lands in the box.
  assert.equal(composeAction(words('I’ll go with: B', { send: true }), { ...empty, canSend: false }, last, NOW + 200), 'again');
  assert.equal(composeAction(words('I’ll go with: B', { send: true }), empty, last, NOW + RESEND_MS), 'send');
  assert.equal(composeAction(words('I’ll go with: C', { send: true }), empty, last, NOW + 200), 'send');
});

test('composeInsert says what the box did, nothing when no box took it, and one box takes it', () => {
  const w = new EventTarget();
  (globalThis as { window?: unknown }).window = w;
  assert.equal(composeInsert('hello', 's1', undefined, { send: true }), undefined);
  const seen: string[] = [];
  const box = (name: string, result: 'sent' | 'added') => (e: Event) => {
    const d = (e as CustomEvent<ComposeDetail>).detail;
    if (d.result || (d.key && d.key !== 's1')) return;
    seen.push(name);
    d.result = result;
  };
  w.addEventListener('hydor:compose', box('first', 'sent'));
  w.addEventListener('hydor:compose', box('second', 'added'));
  assert.equal(composeInsert('hello', 's1', undefined, { send: true }), 'sent');
  assert.deepEqual(seen, ['first']);
  assert.equal(composeInsert('hello', 'other'), undefined);
});

test('words added to the box: after what is there, or in place of the choice they replace', () => {
  assert.equal(putText('', 'I’ll go with: B'), 'I’ll go with: B');
  assert.equal(putText('half a thought', 'I’ll go with: B'), 'half a thought I’ll go with: B');
  assert.equal(putText('Size: M, colour: red', 'colour: blue', 'colour: red'), 'Size: M, colour: blue');
});

console.log(`\n${passed}/${total} passed`);
if (passed !== total) process.exit(1);
