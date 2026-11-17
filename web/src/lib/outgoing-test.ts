// Script test for the messages on their way from this page (outgoing.ts): which of them the conversation or the queue already
// shows as its copy, what still shows as sending (with its files listed as the server lists them), when the agent counts as
// at work for one the server took, and the store that keeps them by session.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/lib/outgoing-test.ts && node dist/dev/outgoing-test.js
import assert from 'node:assert/strict';
import type { QueuedMessage, TimelineItem, UserItem } from '@shared/types';
import {
  copiesInConversation,
  copiesInQueue,
  onItsWay,
  sendingItems,
  sendingMessage,
  sendingQueued,
  sentShown,
  settlesAt,
  splitAttachedFiles,
  useOutgoing,
  type Outgoing,
} from './outgoing';

let n = 0;
const out = (more: Partial<Outgoing> = {}): Outgoing => ({ id: `sending-${++n}`, text: 'hello', files: [], images: 0, pictures: [], at: 1000, after: 0, before: [], waiting: [], queued: false, ...more });
const user = (id: string, text: string, more: Partial<UserItem> = {}): TimelineItem => ({ kind: 'user', id, seq: 0, ts: 1000, text, ...more });
const asst = (id: string, seq: number): TimelineItem => ({ kind: 'assistant', id, seq, text: 'x' });
const queueMsg = (id: string, text: string, more: Partial<QueuedMessage> = {}): QueuedMessage => ({ id, text, at: 1000, ...more });

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
};

test('a message with no copy in the conversation maps to nothing and shows as sending, with its own id, text and time', () => {
  const m = out({ id: 'sending-a', text: 'hello', at: 4242 });
  const copies = copiesInConversation([m], [user('u1', 'something else')], 0);
  assert.equal(copies.size, 0);
  assert.deepEqual(sendingItems([m], copies), [{ kind: 'user', id: 'sending-a', seq: 0, ts: 4242, text: 'hello', images: undefined, sending: true }]);
});

test('a live copy with the same words is the message’s copy: it maps to the copy and stops showing as sending', () => {
  const m = out({ id: 'sending-b', text: 'hello' });
  const copies = copiesInConversation([m], [asst('a-1', 0), user('live-1', 'hello')], 0);
  assert.equal(copies.get('sending-b'), 'live-1');
  assert.deepEqual(sendingItems([m], copies), []);
});

test('a transcript copy counts only when its seq is at least the message’s after: a seq 3 copy is not taken, a seq 5 one is', () => {
  const m = out({ id: 'sending-c', text: 'hello', after: 5 });
  const early = copiesInConversation([m], [user('t-early', 'hello', { seq: 3 })], 1);
  assert.equal(early.has('sending-c'), false);
  const late = copiesInConversation([m], [user('t-late', 'hello', { seq: 5 })], 1);
  assert.equal(late.get('sending-c'), 't-late');
});

test('a live item listed in the message’s before is not its copy, even with the same words', () => {
  const m = out({ id: 'sending-d', text: 'hello', before: ['old-live'] });
  const copies = copiesInConversation([m], [user('old-live', 'hello')], 0);
  assert.equal(copies.size, 0);
  assert.equal(sendingItems([m], copies).length, 1);
});

test('sent before the conversation had loaded, its copy is among the transcript’s messages from a minute before it was sent on', () => {
  const m = out({ id: 'sending-n', text: 'continue', after: null, at: 100_000 });
  assert.equal(copiesInConversation([m], [user('old', 'continue', { ts: 30_000 })], 1).size, 0);
  assert.equal(copiesInConversation([m], [user('old', 'continue', { ts: 30_000 }), user('new', 'continue', { seq: 1, ts: 99_000 })], 2).get('sending-n'), 'new');
});

test('a message sent to the agent takes its copy before one with the same words that waits in the queue', () => {
  const q = out({ id: 'sending-q', text: 'go', queued: true, shown: true });
  const now = out({ id: 'sending-d', text: 'go' });
  const copies = copiesInConversation([q, now], [user('d-copy', 'go')], 0);
  assert.equal(copies.get('sending-d'), 'd-copy');
  assert.equal(copies.has('sending-q'), false);
  assert.deepEqual(sendingItems([q, now], copies), []);
});

test('words are compared without the attached-files list and without the spaces and newlines around them', () => {
  const m = out({ id: 'sending-e', text: 'see this', files: ['a.txt'] });
  const copies = copiesInConversation([m], [user('c-files', '  see this\n\nAttached files:\n- /up/x/a.txt\n')], 0);
  assert.equal(copies.get('sending-e'), 'c-files');
  const plain = out({ id: 'sending-f', text: 'see this' });
  assert.equal(copiesInConversation([plain], [user('c-pad', '\n\nsee this  \n')], 0).get('sending-f'), 'c-pad');
});

test('pictures count by presence only: two pictures do not match a copy without any, and one picture matches a copy with one', () => {
  const withTwo = out({ id: 'sending-g', text: 'pic', images: 2 });
  assert.equal(copiesInConversation([withTwo], [user('no-pics', 'pic')], 0).size, 0);
  assert.equal(copiesInConversation([withTwo], [user('one-pic', 'pic', { images: 1 })], 0).get('sending-g'), 'one-pic');
  const none = out({ id: 'sending-h', text: 'pic', images: 0 });
  assert.equal(copiesInConversation([none], [user('has-pic', 'pic', { images: 1 })], 0).size, 0);
});

test('two messages with the same words sent one after the other and one copy present: the first takes it, the second still shows as sending', () => {
  const first = out({ id: 'sending-i1', text: 'again' });
  const second = out({ id: 'sending-i2', text: 'again' });
  const copies = copiesInConversation([first, second], [user('only', 'again')], 0);
  assert.equal(copies.get('sending-i1'), 'only');
  assert.equal(copies.has('sending-i2'), false);
  assert.deepEqual(sendingItems([first, second], copies).map((i) => i.id), ['sending-i2']);
});

test('two copies with the same words: each message takes its own, first to first and second to second', () => {
  const first = out({ id: 'sending-j1', text: 'again' });
  const second = out({ id: 'sending-j2', text: 'again' });
  const copies = copiesInConversation([first, second], [user('copy-1', 'again'), user('copy-2', 'again')], 0);
  assert.equal(copies.get('sending-j1'), 'copy-1');
  assert.equal(copies.get('sending-j2'), 'copy-2');
  assert.deepEqual(sendingItems([first, second], copies), []);
});

test('a message marked shown still takes its copy, so a later one with the same words does not take it, and a shown one never shows as sending', () => {
  const shown = out({ id: 'sending-k1', text: 'twice', shown: true });
  const later = out({ id: 'sending-k2', text: 'twice' });
  const copies = copiesInConversation([shown, later], [user('k-copy', 'twice')], 0);
  assert.equal(copies.get('sending-k1'), 'k-copy');
  assert.equal(copies.has('sending-k2'), false);
  assert.deepEqual(sendingItems([shown], new Map()), []);
  assert.deepEqual(sendingItems([shown, later], copies).map((i) => i.id), ['sending-k2']);
});

test('a queued message never shows as sending, but still maps to its copy in the conversation once that is there', () => {
  const q = out({ id: 'sending-l', text: 'queued words', queued: true });
  assert.deepEqual(sendingItems([q], new Map()), []);
  assert.equal(copiesInConversation([q], [user('l-copy', 'queued words')], 0).get('sending-l'), 'l-copy');
});

test('files show at the end of the text as the server lists them, and pictures come through as a count', () => {
  const two = out({ id: 'sending-m1', text: 'hi', files: ['a.txt', 'b.pdf'] });
  assert.equal(sendingItems([two], new Map())[0].text, 'hi\n\nAttached files:\n- a.txt\n- b.pdf');
  const noText = out({ id: 'sending-m2', text: '', files: ['a.txt'] });
  assert.equal(sendingItems([noText], new Map())[0].text, 'Attached files:\n- a.txt');
  const pics = out({ id: 'sending-m3', text: 'look', images: 2 });
  assert.equal(sendingItems([pics], new Map())[0].images, 2);
});

test('a queued message matches the first queue message with the same trimmed text and picture presence, in order', () => {
  const q = out({ id: 'sending-n', text: 'wait', queued: true });
  const queue = [queueMsg('q-1', '  wait \n')];
  assert.equal(copiesInQueue([q], queue).get('sending-n'), 'q-1');
});

test('a queue message listed in the message’s waiting is skipped for it', () => {
  const q = out({ id: 'sending-o', text: 'wait', queued: true, waiting: ['q-1'] });
  const queue = [queueMsg('q-1', 'wait'), queueMsg('q-2', 'wait')];
  assert.equal(copiesInQueue([q], queue).get('sending-o'), 'q-2');
  const onlyWaiting = out({ id: 'sending-p', text: 'wait', queued: true, waiting: ['q-1'] });
  assert.equal(copiesInQueue([onlyWaiting], [queueMsg('q-1', 'wait')]).size, 0);
});

test('two queued messages with the same words take two different queue messages, in order', () => {
  const a = out({ id: 'sending-q1', text: 'same', queued: true });
  const b = out({ id: 'sending-q2', text: 'same', queued: true });
  const copies = copiesInQueue([a, b], [queueMsg('qm-1', 'same'), queueMsg('qm-2', 'same')]);
  assert.equal(copies.get('sending-q1'), 'qm-1');
  assert.equal(copies.get('sending-q2'), 'qm-2');
});

test('a message not sent to the queue is never matched in the queue', () => {
  const sent = out({ id: 'sending-r', text: 'wait', queued: false });
  assert.equal(copiesInQueue([sent], [queueMsg('qm-x', 'wait')]).size, 0);
});

test('the queued messages that are not shown and have no copy in the queue, in order', () => {
  const q1 = out({ id: 'sending-s1', text: 'a', queued: true });
  const plain = out({ id: 'sending-s2', text: 'b', queued: false });
  const shown = out({ id: 'sending-s3', text: 'c', queued: true, shown: true });
  const copied = out({ id: 'sending-s4', text: 'd', queued: true });
  const q4 = out({ id: 'sending-s5', text: 'e', queued: true });
  const copies = new Map([['sending-s4', 'qm-d']]);
  assert.deepEqual(sendingQueued([q1, plain, shown, copied, q4], copies).map((o) => o.id), ['sending-s1', 'sending-s5']);
  assert.deepEqual(sendingQueued(undefined, new Map()), []);
});

test('a message on its way is one the server has not taken yet, or took under a second and a half ago; a queued one or none is not', () => {
  assert.equal(onItsWay([out({})], 5000), true);
  assert.equal(onItsWay([out({ went: 1000 })], 2000), true);
  assert.equal(onItsWay([out({ went: 1000 })], 2500), false);
  assert.equal(onItsWay([out({ queued: true })], 5000), false);
  assert.equal(onItsWay([out({ queued: true, went: 4990 })], 5000), false);
  assert.equal(onItsWay(undefined, 5000), false);
  assert.equal(onItsWay([], 5000), false);
});

test('a message the session was seen at work on since it was sent is not on its way any more; one sent after that still is', () => {
  const m = out({ at: 5000 });
  assert.equal(onItsWay([m], 5100, 4000), true);
  assert.equal(onItsWay([m], 5100, 5050), false);
  assert.equal(onItsWay([out({ at: 5000, went: 5200 })], 5300, 5250), false);
});

test('the time onItsWay stops holding: none when nothing was taken, otherwise the latest take plus a second and a half', () => {
  assert.equal(settlesAt(undefined), null);
  assert.equal(settlesAt([out({})]), null);
  assert.equal(settlesAt([out({ queued: true, went: 9000 })]), null);
  assert.equal(settlesAt([out({ went: 1000 }), out({ went: 3000 }), out({ queued: true, went: 9000 })]), 4500);
  // One still on its way: its answer says more (a time already past would only draw the page again and again).
  assert.equal(settlesAt([out({ went: 1000 }), out({})]), null);
});

test('a text with an attached-files list splits into the words and the file names; a text without one stays whole', () => {
  assert.deepEqual(splitAttachedFiles('a\n\nAttached files:\n- /x/1.txt\n- /x/2.txt'), { text: 'a', files: ['/x/1.txt', '/x/2.txt'] });
  assert.deepEqual(splitAttachedFiles('just words'), { text: 'just words', files: [] });
});

test('the store keeps a sent message by its session, and a failed send takes it off again', () => {
  const key = 'store-a';
  const done = sendingMessage(key, { text: 'hi', files: [], images: 0, pictures: [], after: 0, before: [], waiting: [], queued: false });
  const list = useOutgoing.getState().byKey[key];
  assert.equal(list.length, 1);
  assert.ok(list[0].id.startsWith('sending-'));
  done(false);
  assert.equal(useOutgoing.getState().byKey[key], undefined);
});

test('a send the server takes gets its time, and one it puts in the queue is marked queued', () => {
  const key = 'store-b';
  const done = sendingMessage(key, { text: 'later', files: [], images: 0, pictures: [], after: 0, before: [], waiting: [], queued: false });
  done(true, true);
  const [m] = useOutgoing.getState().byKey[key];
  assert.equal(typeof m.went, 'number');
  assert.equal(m.queued, true);
});

test('a sent message whose copy shows is marked shown', () => {
  const key = 'store-c';
  const done = sendingMessage(key, { text: 'shown', files: [], images: 0, pictures: [], after: 0, before: [], waiting: [], queued: false });
  done(true);
  const id = useOutgoing.getState().byKey[key][0].id;
  sentShown(key, [id]);
  assert.equal(useOutgoing.getState().byKey[key][0].shown, true);
});

console.log(`${passed}/${total} passed`);
process.exit(process.exitCode ?? 0);
