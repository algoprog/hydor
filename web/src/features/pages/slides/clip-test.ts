// Script tests for the slides editor's clipboard (clip.ts): the words a copy writes, the HTML that carries its marker, and
// when a paste is still that copy (its marker, or its words) and when it is something else. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/pages/slides/clip-test.ts && node dist/dev/clip-test.js
import type { El } from '@shared/slides';
import { copied, getClip, holds, htmlFor, MARK, wordsOf } from './clip';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const text = { id: 'a', type: 'text', x: 0, y: 0, w: 100, h: 40, paras: [{ runs: [{ t: 'Hello ' }, { t: 'world' }] }, { runs: [{ t: 'Second <line> & more' }] }] } as unknown as El;
const table = { id: 'b', type: 'table', x: 0, y: 0, w: 100, h: 40, rows: [['a', 'b'], ['c', 'd']], size: 14 } as unknown as El;
const pic = { id: 'c', type: 'image', name: 'Logo', x: 0, y: 0, w: 10, h: 10, src: 'x' } as unknown as El;

ok(wordsOf([text]) === 'Hello world\nSecond <line> & more', 'a text’s paragraphs are its words');
ok(wordsOf([text, table]).endsWith('a\tb\nc\td'), 'a table’s rows, cells with tabs');
ok(wordsOf([pic]).length > 0, 'a picture has a name to paste as words');

const c = copied({ parts: [text] }, wordsOf([text]));
ok(getClip() === c, 'the copy is kept in the app');
const html = htmlFor(c);
ok(html.includes(`${MARK}="${c.token}"`) && html.includes('&lt;line&gt; &amp; more'), 'the HTML carries the marker and the words, escaped');
ok(holds(c, html, c.text), 'the clipboard still holds this copy');
ok(holds(c, '', c.text.replace(/\n/g, '\r\n')), 'its words alone (a browser strips the marker; Windows writes CRLF) are still it');
ok(!holds(c, '<p>other</p>', 'other'), 'something else copied is not it');
ok(!holds(c, `<div ${MARK}="zzzz"></div>`, c.text), 'another copy’s marker is not it, even with the same words');
ok(!holds(null, html, c.text), 'with nothing kept, nothing is it');
ok(!holds(c, '', ''), 'an empty clipboard is not it');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
