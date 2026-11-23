// Script tests for word suggestions' rules (logic.ts) and one text box's controller (suggester.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/suggest/suggest-test.ts && node dist/dev/suggest-test.js
import type { SuggestCounts, SuggestRequest, SuggestResponse } from '@shared/suggest';
import { addCounts, afterSpace, allowed, atWordEnd, backspaced, charCount, consume, greyOf, hasCounts, judgeTyped, noCounts, requestOf, savedBy, splitCounts, startsWord, summarise, takeAll, takenCounts, takeWord, typedBetween, typedChars, type Field, type Gate } from './logic';
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
ok(!allowed({ ...on, state: 'waiting' }, 'chat'), 'not set up yet: only the focus (warm) starts it');
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
eq(afterSpace({ word: '', next: ' 100' }, 'at gain '), { word: '100', next: '' }, 'after a typed space, no second space: the next word becomes the word');
eq(afterSpace({ word: ' the', next: ' end' }, 'to '), { word: 'the', next: ' end' }, 'after a typed space, the word loses its leading space');
eq(afterSpace({ word: 'ld', next: ' is' }, 'wor'), { word: 'ld', next: ' is' }, 'mid-word: unchanged');
eq(afterSpace({ word: '', next: ' ' }, 'a '), null, 'nothing but whitespace: nothing to show');
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

// ---- the counts: what typing and Tab did to the suggestion showing, and what was typed
eq(typedChars('a'), 1, 'one letter typed');
eq(typedChars('abcd'), 4, 'four characters at once still count');
eq(typedChars('abcde'), 0, 'five at once is a paste or dictation');
eq(typedChars(''), 0, 'nothing grew');
eq(typedChars(null), 0, 'not a growth (Backspace, a caret move)');
eq(typedChars('日本語'), 3, 'characters, not code units');
eq(typedChars('😀😀😀😀'), 4, 'an emoji is one');
eq(charCount('😀a'), 2, 'characters of a text');
eq(savedBy('orld'), 3, 'the characters it inserted minus the key');
eq(savedBy('a'), 0, 'one character saves nothing');
eq(savedBy(''), 0, 'never below zero');
eq(takenCounts({ word: 'orld', next: ' is' }, 'orld', false), { shown: 0, taken: 1, typedThrough: 0, wrong: 0, saved: 3, typedChars: 0 }, 'Tab takes one word');
eq(takenCounts({ word: 'orld', next: ' is' }, 'orld is', true), { shown: 1, taken: 2, typedThrough: 0, wrong: 0, saved: 6, typedChars: 0 }, '→ takes two: the next was shown too, and one key saved the rest');
eq(takenCounts({ word: 'orld', next: '' }, 'orld', true), { shown: 0, taken: 1, typedThrough: 0, wrong: 0, saved: 3, typedChars: 0 }, '→ with no next word takes one');
eq(takenCounts({ word: '', next: ' is' }, ' is', false), { shown: 0, taken: 1, typedThrough: 0, wrong: 0, saved: 2, typedChars: 0 }, 'Tab on only the next word');
const shows = { word: 'orld', next: ' is' };
eq(judgeTyped(shows, 'o'), { through: 0, fresh: false, wrong: false }, 'a letter of it');
eq(judgeTyped(shows, 'orld'), { through: 1, fresh: true, wrong: false }, 'the whole word: right, and the next word is now the grey word');
eq(judgeTyped(shows, 'orld '), { through: 1, fresh: true, wrong: false }, 'the word and its space');
eq(judgeTyped(shows, 'orld is'), { through: 2, fresh: true, wrong: false }, 'both words in one change');
eq(judgeTyped(shows, 'x'), { through: 0, fresh: false, wrong: true }, 'another letter is wrong');
eq(judgeTyped(shows, 'orx'), { through: 0, fresh: false, wrong: true }, 'a letter that differs inside it');
eq(judgeTyped({ word: 'orld', next: '' }, 'orld'), { through: 1, fresh: false, wrong: false }, 'the last word typed through');
eq(judgeTyped({ word: '', next: ' is' }, ' '), { through: 0, fresh: false, wrong: false }, 'only the next word showing: its first character');
eq(judgeTyped({ word: '', next: ' is' }, ' is'), { through: 1, fresh: false, wrong: false }, 'only the next word showing: all of it');
ok(backspaced(f('abc'), f('ab')) && backspaced(f('abc', 'x'), f('a', 'x')), 'Backspace, and Ctrl+Backspace');
ok(!backspaced(f('abc'), f('abcd')) && !backspaced(f('abc', 'x'), f('ab', 'xy')) && !backspaced(f('abc'), f('xy')) && !backspaced(null, f('a')), 'not a deletion before the caret');
eq(addCounts(noCounts(), { shown: 2, saved: 5 }), { shown: 2, taken: 0, typedThrough: 0, wrong: 0, saved: 5, typedChars: 0 }, 'counts add up');
ok(!hasCounts(noCounts()) && hasCounts(addCounts(noCounts(), { wrong: 1 })), 'whether anything was counted');
eq(splitCounts(noCounts()), [], 'nothing to send');
eq(splitCounts({ ...noCounts(), typedChars: 12000, saved: 7 }, 5000).map((c) => [c.typedChars, c.saved]), [[5000, 7], [5000, 0], [2000, 0]], 'no count above the cap in one piece');
eq(summarise({ shown: 10, taken: 3, typedThrough: 2, wrong: 5, saved: 30, typedChars: 70 }), { saved: 30, savedShare: 30, right: 5, judged: 10, rightShare: 50, taken: 3 }, 'the numbers shown');
eq(summarise(noCounts()), { saved: 0, savedShare: 0, right: 0, judged: 0, rightShare: 0, taken: 0 }, 'no division by nothing');

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

  // ---- the counts: what each outcome adds, and what typing adds
  let tally: SuggestCounts = noCounts();
  const mkCounting = (b: ReturnType<typeof box>, gate = () => g.gate) =>
    new Suggester(b.adapter, () => {}, {
      send: () => Promise.resolve(answer),
      gate,
      client: 'tab1',
      count: (c) => (tally = addCounts(tally, c)),
    });
  const fresh = () => ((tally = noCounts()), (answer = ans({ word: 'orld', next: ' is' })));
  const say = (what: string, want: Partial<SuggestCounts>) => eq(tally, { ...noCounts(), ...want }, what);
  const typeIn = (b: ReturnType<typeof box>, s: Suggester, text: string) => {
    for (const c of text) (b.type(c), s.sync());
  };

  // typed through: each letter counts as typed; the whole word is right, and the next word is a new suggestion
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  say('a suggestion showing is counted once', { shown: 1 });
  typeIn(b, s, 'or');
  say('letters of it: typed, nothing decided', { shown: 1, typedChars: 2 });
  typeIn(b, s, 'ld');
  say('its last letter typed: right, and the next word is now the grey word', { shown: 2, typedThrough: 1, typedChars: 4 });
  typeIn(b, s, ' is');
  say('the next word typed through too', { shown: 2, typedThrough: 2, typedChars: 7 });
  answer = null;
  await settle();
  say('and nothing more', { shown: 2, typedThrough: 2, typedChars: 7 });
  s.reset();

  // wrong: a letter that differs; Backspace
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  answer = null;
  typeIn(b, s, 'x');
  say('a letter that differs is wrong', { shown: 1, wrong: 1, typedChars: 1 });
  typeIn(b, s, 'y');
  say('and only once', { shown: 1, wrong: 1, typedChars: 2 });
  s.reset();
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  answer = null;
  b.back();
  s.sync();
  say('Backspace is wrong (and is not typing)', { shown: 1, wrong: 1 });
  s.reset();

  // hidden without a verdict: Esc, a blur, a caret move, the switch turned off
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  ok(s.key(key('Escape')), 'Esc hides');
  typeIn(b, s, 'o');
  say('Esc: neither right nor wrong (the letter is typing)', { shown: 1, typedChars: 1 });
  s.reset();
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  b.focused = false;
  s.sync();
  b.focused = true;
  s.sync();
  say('a blur: neither', { shown: 1 });
  answer = null;
  b.moveTo(2);
  s.sync();
  b.type('x');
  say('a caret move, then typing it does not read as an answer: neither', { shown: 1 });
  s.reset();
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  answer = null;
  b.moveTo(3);
  s.sync();
  say('a caret move: neither', { shown: 1 });
  s.reset();
  fresh();
  b = box('Hello w');
  const gate2 = { on: true };
  s = mkCounting(b, () => ({ ...on, enabled: gate2.on }));
  s.sync();
  await settle();
  gate2.on = false;
  b.type('o');
  s.sync();
  say('switched off: neither, and nothing typed is counted', { shown: 1 });
  s.reset();

  // Tab and →: taken, the keystrokes saved, and what they insert is never counted as typed
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  ok(s.key(key('Tab')), 'Tab');
  answer = ans({ word: '', next: ' is' });
  s.sync();
  await settle();
  say('Tab: right, 3 keystrokes saved (4 characters, one key), the next word is a new suggestion, nothing typed', { shown: 2, taken: 1, saved: 3 });
  ok(s.key(key('Tab')), 'Tab again');
  s.sync();
  answer = null;
  await settle();
  say('the next word taken: 2 more saved, still nothing typed', { shown: 2, taken: 2, saved: 5 });
  s.reset();
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  answer = null;
  ok(s.key(key('ArrowRight')), '→');
  s.sync();
  await settle();
  say('→ takes the word and the next: two taken, one key pressed, 7 characters inserted', { shown: 2, taken: 2, saved: 6 });
  s.reset();

  // a suggestion replaced by another one: the first is neither
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  answer = ans({ word: 'ill', next: '' });
  b.type('o');
  s.sync();
  b.back();
  s.sync();
  await settle();
  say('wrong for the Backspace, then a new suggestion', { shown: 2, wrong: 1, typedChars: 1 });
  s.reset();

  // the 4-character rule: typing counts when a change adds 1 to 4 characters; a paste is not typing
  tally = noCounts();
  answer = null;
  b = box('Hello ');
  s = mkCounting(b);
  s.sync();
  b.type('abcd');
  s.sync();
  say('four at once', { typedChars: 4 });
  b.type('abcde');
  s.sync();
  say('five at once is a paste: not counted', { typedChars: 4 });
  b.type('é');
  s.sync();
  say('and typing goes on counting', { typedChars: 5 });
  b.back();
  s.sync();
  say('Backspace is not typing', { typedChars: 5 });
  s.reset();
  // a paste over a suggestion is not typing either, but what it is says it was not the suggestion
  fresh();
  b = box('Hello w');
  s = mkCounting(b);
  s.sync();
  await settle();
  answer = null;
  b.type('pasted text');
  s.sync();
  say('a paste of something else: wrong, not typed', { shown: 1, wrong: 1 });
  s.reset();
  // an input method's text is not counted
  tally = noCounts();
  b = box('Hello ');
  const ime = { ...b.adapter, read: () => ({ ...b.adapter.read()!, composing: true }) };
  s = new Suggester(ime, () => {}, { send: () => Promise.resolve(null), gate: () => g.gate, client: 'tab1', count: (c) => (tally = addCounts(tally, c)) });
  s.sync();
  b.type('ab');
  s.sync();
  say('while composing nothing is counted', {});
  s.reset();
}

await run();
console.log(failed ? `${failed} failed, ${passed} passed` : `All ${passed} checks passed`);
process.exit(failed ? 1 : 0);
