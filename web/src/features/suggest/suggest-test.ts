// Script tests for word suggestions' rules (logic.ts) and one text box's controller (suggester.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/suggest/suggest-test.ts && node dist/dev/suggest-test.js
import type { SuggestRequest, SuggestResponse } from '@shared/suggest';
import { allowed, atWordEnd, consume, greyOf, requestOf, startsWord, takeAll, takeWord, typedBetween, type Field, type Gate } from './logic';
import { DEBOUNCE_MS, Suggester, type Adapter } from './suggester';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const eq = (a: unknown, b: unknown, what: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const f = (before: string, after = '', more: Partial<Field> = {}): Field => ({ before, after, ...more });

// ---- when to ask
ok(atWordEnd(f('Hello wor')), 'at the end of a word');
ok(atWordEnd(f('Hello ')), 'after a space');
ok(atWordEnd(f('Hello\n')), 'after a newline');
ok(atWordEnd(f('Γειά σου Κό')), 'a Greek word');
ok(atWordEnd(f('日本語')), 'a word of another script');
ok(atWordEnd(f("don'")), 'an apostrophe inside a word');
ok(!atWordEnd(f('')), 'no text');
ok(!atWordEnd(f('   ')), 'only spaces');
ok(!atWordEnd(f('Hello.')), 'after punctuation');
ok(!atWordEnd(f('Hello', ' there')), 'more text on the line');
ok(!atWordEnd(f('Hel', 'lo')), 'mid-word');
ok(atWordEnd(f('Hello wor', '\nnext line')), 'more text only on later lines');
ok(!atWordEnd(f('Hello wor', '', { composing: true })), 'while an input method composes');
ok(!atWordEnd(f('Hello wor', '', { selected: true })), 'a selection');
ok(!atWordEnd(f('look at @src/ma')), 'an @file being picked');
ok(!atWordEnd(f('/comp')), 'a /command being picked');
ok(!atWordEnd(f('see https://exam')), 'an address');
ok(atWordEnd(f('either and/or')), 'a slash inside a word');
ok(atWordEnd(f('@src/main.ts and then ')), 'after a space once the file is done');
ok(startsWord(f('a ')) && !startsWord(f('a')), 'a new word begins after whitespace');

// ---- the switches
const on: Gate = { enabled: true, state: 'ready', where: { chat: true, docs: false, notes: true, other: true }, browser: true };
ok(allowed(on, 'chat'), 'allowed when on');
ok(!allowed(on, 'docs'), 'a place turned off');
ok(!allowed({ ...on, enabled: false }, 'chat'), 'turned off');
ok(!allowed({ ...on, browser: false }, 'chat'), 'off in this browser');
ok(!allowed({ ...on, state: 'setting-up' }, 'chat'), 'still setting up');
ok(!allowed({ ...on, state: 'failed' }, 'chat'), 'failed');
ok(!allowed({ ...on, state: undefined }, 'chat'), 'status not known yet');
ok(allowed({ ...on, state: 'starting' }, 'chat'), 'loading');

// ---- what is sent
const long = 'x'.repeat(2500);
const r1 = requestOf('chat', f(long), { reply: long, prev: 'before', session: 'k1' }, 'c1');
eq([r1.surface, r1.text.length, r1.reply?.length, r1.prev, r1.session, r1.client], ['chat', 2000, 2000, 'before', 'k1', 'c1'], 'a message');
const r2 = requestOf('docs', f('ab'), { doc: 'the document', reply: 'no' }, 'c1');
eq([r2.surface, r2.doc, r2.reply, r2.session], ['doc', 'the document', undefined, undefined], 'a document');
const r3 = requestOf('notes', f('ab'), { reply: 'no', doc: 'no' }, 'c1');
eq([r3.surface, r3.reply, r3.doc], ['text', undefined, undefined], 'a note');

// ---- what an answer shows
const ans = (p: Partial<SuggestResponse>): SuggestResponse => ({ word: '', next: '', conf: 0.5, confNext: 0.5, show: true, showNext: true, ...p });
eq(greyOf(ans({ word: 'ld', next: ' is' })), { word: 'ld', next: ' is' }, 'word and next');
eq(greyOf(ans({ word: 'ld', next: ' is', showNext: false })), { word: 'ld', next: '' }, 'next not shown');
eq(greyOf(ans({ word: 'ld', next: ' is', show: false, showNext: false })), null, 'not shown');
eq(greyOf(ans({ word: '', next: ' is' })), { word: '', next: ' is' }, 'only the next word');
eq(greyOf(ans({ word: '', next: '' })), null, 'nothing');
eq(greyOf(null), null, 'no content');

// ---- typing the grey letters
eq(consume({ word: 'orld', next: ' is' }, 'o'), { word: 'rld', next: ' is' }, 'one letter');
eq(consume({ word: 'orld', next: ' is' }, 'or'), { word: 'ld', next: ' is' }, 'two letters');
eq(consume({ word: 'orld', next: ' is' }, 'orld'), { word: '', next: ' is' }, 'the whole word leaves the next word, dim');
eq(consume({ word: 'orld', next: ' is' }, 'orld '), { word: 'is', next: '' }, 'and its space');
eq(consume({ word: 'orld', next: ' is' }, 'orld i'), { word: 's', next: '' }, 'and the next word begun is the word being typed');
eq(consume({ word: 'orld', next: '' }, 'orld'), null, 'all typed');
eq(consume({ word: 'orld', next: ' is' }, 'a'), undefined, 'another letter');
eq(consume({ word: 'orld', next: ' is' }, 'O'), undefined, 'another case');
eq(consume({ word: 'orld', next: '' }, ''), { word: 'orld', next: '' }, 'nothing typed');

// ---- what is taken
eq(takeWord({ word: 'orld', next: ' is' }), { insert: 'orld', grey: { word: ' is', next: '' } }, 'Tab takes the word; the next becomes the word');
eq(takeWord({ word: 'orld', next: '' }), { insert: 'orld', grey: null }, 'Tab, no next');
eq(takeWord({ word: '', next: ' is' }), { insert: ' is', grey: null }, 'Tab on only the next word');
eq(takeAll({ word: 'orld', next: ' is' }), 'orld is', 'the arrow takes both');

// ---- what was typed
eq(typedBetween(f('ab'), f('abc')), 'c', 'a letter');
eq(typedBetween(f('ab'), f('ab')), '', 'nothing');
eq(typedBetween(f('abc'), f('ab')), null, 'Backspace');
eq(typedBetween(f('ab', 'x'), f('abc', 'x')), 'c', 'typed before text that follows');
eq(typedBetween(f('ab', 'x'), f('abc', 'y')), null, 'the text after changed');
eq(typedBetween(null, f('a')), null, 'no earlier state');

// ---- one box
interface Box {
  adapter: Adapter;
  text: string;
  caret: number;
  focused: boolean;
}
function box(text = ''): Box & { type(s: string): void; back(): void; moveTo(n: number): void } {
  const b: Box & { type(s: string): void; back(): void; moveTo(n: number): void } = {
    text,
    caret: text.length,
    focused: true,
    adapter: {
      place: 'chat',
      read: () => (b.focused ? { before: b.text.slice(0, b.caret), after: b.text.slice(b.caret) } : null),
      insert: (s) => ((b.text = b.text.slice(0, b.caret) + s + b.text.slice(b.caret)), (b.caret += s.length)),
      context: () => ({ reply: 'the reply', session: 's1' }),
    },
    type: (s) => ((b.text = b.text.slice(0, b.caret) + s + b.text.slice(b.caret)), (b.caret += s.length)),
    back: () => ((b.text = b.text.slice(0, b.caret - 1) + b.text.slice(b.caret)), b.caret--),
    moveTo: (n) => (b.caret = n),
  };
  return b;
}
const key = (k: string, o: { shiftKey?: boolean } = {}) => ({ key: k, shiftKey: !!o.shiftKey, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() {} });

async function run() {
  const sent: SuggestRequest[] = [];
  let aborted = 0;
  let answer: SuggestResponse | null = ans({ word: 'orld', next: ' is' });
  const g = { gate: on };
  const shownLog: (string | null)[] = [];
  const mk = (b: ReturnType<typeof box>) =>
    new Suggester(b.adapter, (x) => shownLog.push(x ? x.word + '|' + x.next : null), {
      send: (req, signal) => {
        sent.push(req);
        signal.addEventListener('abort', () => aborted++);
        return Promise.resolve(answer);
      },
      gate: () => g.gate,
      client: 'tab1',
    });
  const settle = () => sleep(DEBOUNCE_MS + 25);

  // typing asks once after a pause, and the letters of the grey word are used without asking again
  let b = box('Hello w');
  let s = mk(b);
  s.sync();
  await settle();
  eq(sent.length, 1, 'one request');
  eq(sent[0], { surface: 'chat', text: 'Hello w', client: 'tab1', reply: 'the reply', session: 's1' }, 'the request');
  eq(s.grey, { word: 'orld', next: ' is' }, 'shows the answer');
  b.type('o');
  s.sync();
  eq(s.grey, { word: 'rld', next: ' is' }, 'typing its letter keeps the rest');
  b.type('rld');
  s.sync();
  await settle();
  eq(sent.length, 1, 'no new request while its letters are typed');
  eq(s.grey, { word: '', next: ' is' }, 'the next word stays');
  // a different letter asks again
  b.type('x');
  s.sync();
  eq(s.grey, null, 'another letter clears it');
  await settle();
  eq(sent.length, 2, 'and asks again');
  eq(sent[1].text, 'Hello worldx', 'with the text so far');

  // fast typing: each keystroke cancels the request before, and only the last is sent
  sent.length = 0;
  aborted = 0;
  answer = ans({ word: 'lo', next: '' });
  b = box('He');
  s = mk(b);
  s.sync();
  b.type('l');
  s.sync();
  b.type('l');
  s.sync();
  await settle();
  eq(sent.map((r) => r.text), ['Hell'], 'one request for fast typing');

  // Backspace and caret moves clear and ask again
  b.back();
  s.sync();
  eq(s.grey, null, 'Backspace clears');
  await settle();
  eq(sent.at(-1)?.text, 'Hel', 'and asks for the shorter text');
  b.moveTo(1);
  s.sync();
  eq(s.grey, null, 'a caret move clears');
  await settle();
  const n = sent.length;
  b.moveTo(3);
  s.sync();
  await settle();
  eq(sent.length, n + 1, 'back at a word end it asks');

  // a slow answer for text that has changed is dropped
  sent.length = 0;
  b = box('ab');
  let release: (r: SuggestResponse | null) => void = () => {};
  s = new Suggester(b.adapter, (x) => shownLog.push(x ? 'late:' + x.word : null), {
    send: (req) => (sent.push(req), new Promise((res) => (release = res))),
    gate: () => g.gate,
    client: 'tab1',
  });
  s.sync();
  await settle();
  b.type('c');
  release(ans({ word: 'zzz' }));
  await sleep(5);
  eq(s.grey, null, 'a stale answer is not shown');

  // Tab, the arrow, Esc
  answer = ans({ word: 'orld', next: ' is' });
  b = box('Hello w');
  s = mk(b);
  s.sync();
  await settle();
  ok(s.key(key('Tab')), 'Tab is taken');
  eq(b.text, 'Hello world', 'Tab inserts the word');
  eq(s.grey, { word: ' is', next: '' }, 'the next word is now the grey word');
  answer = ans({ word: '', next: ' is' });
  await settle();
  eq(s.grey, { word: ' is', next: '' }, 'an answer that repeats it changes nothing');
  ok(s.key(key('Tab')), 'Tab again');
  eq(b.text, 'Hello world is', 'takes the next word');
  ok(!s.key(key('Tab', { shiftKey: true })), 'Shift+Tab is left alone');
  await settle();
  // nothing shown: Tab is left to the box
  answer = null;
  b = box('Hello w');
  s = mk(b);
  s.sync();
  await settle();
  ok(!s.key(key('Tab')), 'Tab with nothing shown is left alone');
  ok(!s.key(key('Escape')), 'Esc with nothing shown is left alone');
  // the arrow at the end takes both; mid-text it moves the caret
  answer = ans({ word: 'orld', next: ' is' });
  b = box('Hello w');
  s = mk(b);
  s.sync();
  await settle();
  ok(s.key(key('ArrowRight')), '→ at the end is taken');
  eq(b.text, 'Hello world is', '→ takes both');
  // Esc hides until the next word
  b = box('Hello w');
  answer = ans({ word: 'orld', next: ' is' });
  s = mk(b);
  s.sync();
  await settle();
  ok(s.key(key('Escape')), 'Esc is taken');
  eq(s.grey, null, 'Esc hides');
  sent.length = 0;
  b.type('o');
  s.sync();
  await settle();
  eq([s.grey, sent.length], [null, 0], 'more letters of the same word: still hidden, nothing asked');
  b.type(' ');
  s.sync();
  await settle();
  eq(sent.length, 1, 'a new word asks again');
  ok(!!s.grey, 'and shows');

  // turning the switches off clears what shows
  g.gate = { ...on, enabled: false };
  s.sync();
  b.type('a');
  s.sync();
  eq(s.grey, null, 'off clears it');
  g.gate = on;
  // a box that loses the focus shows nothing
  b.focused = false;
  s.sync();
  eq(s.grey, null, 'no caret, nothing shown');
  s.reset();
  // an answer of 204 / an error shows nothing and does not break
  answer = null;
  b = box('Hello w');
  s = mk(b);
  s.sync();
  await settle();
  eq(s.grey, null, 'nothing to show');
  s.reset();
}

await run();
console.log(failed ? `${failed} failed, ${passed} passed` : `All ${passed} checks passed`);
process.exit(failed ? 1 : 0);
